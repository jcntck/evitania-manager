import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { validatePackageContract } from '../scripts/release-contract.mjs';
import { publishReleaseTopology } from '../scripts/release-orchestrator.mjs';
import { createEvidenceFixture } from '../test/release-test-helpers';

const execute = promisify(execFile);
const executable = process.env.EVITANIA_PACKAGED_EXECUTABLE;
const platform = process.env.EVITANIA_PACKAGED_PLATFORM;
const directories: string[] = [];
const applications: ElectronApplication[] = [];

const launchInstalled = async (userData: string): Promise<ElectronApplication> => {
  if (!executable) throw new Error('EVITANIA_PACKAGED_EXECUTABLE is required');
  const application = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`, '--no-sandbox', '--disable-gpu'],
  });
  applications.push(application);
  return application;
};

const closeApplication = async (application: ElectronApplication): Promise<void> => {
  const index = applications.indexOf(application);
  if (index >= 0) applications.splice(index, 1);
  await application.close();
};

const waitUntilReady = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  userData: string,
): Promise<void> => {
  try {
    await expect(page.locator('#save-status')).toHaveText('Salvo localmente', { timeout: 30_000 });
  } catch (error) {
    const status = await page.locator('#save-status').textContent().catch(() => null);
    const notice = await page.locator('#toast').textContent().catch(() => null);
    const files = await readdir(userData, { recursive: true }).catch(() => []);
    const diagnostics = await readFile(join(userData, 'diagnostics', 'events.jsonl'), 'utf8')
      .catch(() => '');
    throw new Error([
      `Packaged app initialization failed: status=${JSON.stringify(status)}`,
      `notice=${JSON.stringify(notice)}`,
      `files=${JSON.stringify(files)}`,
      `diagnostics=${JSON.stringify(diagnostics)}`,
      error instanceof Error ? error.message : String(error),
    ].join('; '));
  }
};

test.afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close().catch(() => undefined)));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('E2E-012 installed Debian package has native identity and persists with isolated user data', async () => {
  test.skip(platform !== 'linux' || !executable, 'runs in the Linux packaged release job');
  test.slow();
  const userData = await mkdtemp(join(tmpdir(), 'evitania-deb-smoke-'));
  directories.push(userData);
  const deb = process.env.EVITANIA_PACKAGED_ARTIFACT;
  if (deb) {
    const fields = await execute('dpkg-deb', ['-f', deb, 'Package', 'Version', 'Maintainer', 'Description']);
    expect(fields.stdout).toContain('evitania-manager');
    expect(fields.stdout).toContain('João Neto');
    const contents = await execute('dpkg-deb', ['-c', deb]);
    expect(contents.stdout).toMatch(/applications\/.*\.desktop/);
    expect(contents.stdout).toMatch(/icons\/hicolor\/.*\.png/);
  }
  let application = await launchInstalled(userData);
  let page = await application.firstWindow();
  await waitUntilReady(page, userData);
  await page.locator('[data-page="items"]').click();
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Persistência do pacote Debian');
  await page.locator('[data-action="catalog-save"]').click();
  await expect(page.locator('.catalog-card').filter({ hasText: 'Persistência do pacote Debian' })).toBeVisible();
  await closeApplication(application);
  application = await launchInstalled(userData);
  page = await application.firstWindow();
  await waitUntilReady(page, userData);
  await page.locator('[data-page="items"]').click();
  await expect(page.locator('.catalog-card').filter({ hasText: 'Persistência do pacote Debian' })).toBeVisible();
});

test('E2E-013 installed NSIS package exposes identity, signing state, and isolated persistence', async () => {
  test.skip(platform !== 'windows' || !executable, 'runs in the Windows packaged release job');
  test.slow();
  const userData = await mkdtemp(join(tmpdir(), 'evitania-nsis-smoke-'));
  directories.push(userData);
  const versionInfo = await execute('pwsh', [
    '-NoProfile',
    '-Command',
    `(Get-Item '${executable!.replaceAll("'", "''")}').VersionInfo | ConvertTo-Json -Compress`,
  ]);
  const info = JSON.parse(versionInfo.stdout);
  expect(`${info.ProductName} ${info.FileDescription}`).toContain('Evitania Manager');
  expect(`${info.CompanyName} ${info.LegalCopyright}`).toContain('João Neto');
  const evidenceDirectory = process.env.EVITANIA_PACKAGED_EVIDENCE;
  if (evidenceDirectory) {
    const signing = JSON.parse(await readFile(join(evidenceDirectory, 'signing-status.json'), 'utf8'));
    expect(['signed', 'unsigned']).toContain(signing.status);
    expect(signing.conditional).toBe(true);
    if (signing.status === 'signed') expect(signing.credentialsSource).toBe('ci-environment');
  }
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
  await expect(validatePackageContract({
    packageJson,
    requestedVersion: `v${packageJson.version}`,
    rootDirectory: process.cwd(),
    signingEnvironment: {},
  })).resolves.toMatchObject({ signingStatus: 'unsigned' });
  await expect(validatePackageContract({
    packageJson,
    requestedVersion: `v${packageJson.version}`,
    rootDirectory: process.cwd(),
    signingEnvironment: { WIN_CSC_LINK: 'injected-ci', WIN_CSC_KEY_PASSWORD: 'injected-ci' },
  })).resolves.toMatchObject({ signingStatus: 'signed', credentialSource: 'ci-environment' });
  let application = await launchInstalled(userData);
  let page = await application.firstWindow();
  await waitUntilReady(page, userData);
  await page.locator('[data-page="items"]').click();
  await page.locator('[data-action="catalog-create"]').first().click();
  await page.locator('[name="name"]').fill('Persistência do instalador NSIS');
  await page.locator('[data-action="catalog-save"]').click();
  await closeApplication(application);
  application = await launchInstalled(userData);
  page = await application.firstWindow();
  await waitUntilReady(page, userData);
  await page.locator('[data-page="items"]').click();
  await expect(page.locator('.catalog-card').filter({ hasText: 'Persistência do instalador NSIS' })).toBeVisible();
});

test('E2E-014 complete publication journey creates exact topology and a failed gate creates no tag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evitania-topology-e2e-'));
  directories.push(root);
  const linux = await createEvidenceFixture(root, 'linux');
  const windows = await createEvidenceFixture(root, 'windows');
  const tags: string[] = [];
  const releases: string[] = [];
  const git = {
    tagExists: async () => false,
    createAnnotatedTag: async (tag: string) => { tags.push(tag); },
    pushTagsAtomically: async () => undefined,
  };
  const provider = {
    releaseExists: async () => false,
    createRelease: async ({ tag }: { tag: string }) => { releases.push(tag); },
  };
  await publishReleaseTopology({
    version: 'v0.2.3',
    packageVersion: '0.2.3',
    linuxDirectory: linux,
    windowsDirectory: windows,
    git,
    provider,
  });
  expect(tags).toEqual(['v0.2.3-linux', 'v0.2.3-windows', 'v0.2.3']);
  expect(releases).toEqual(tags);

  const subjects = JSON.parse(await readFile(join(windows, 'provenance-subjects.json'), 'utf8'));
  subjects.subjects = [];
  await rm(join(windows, 'provenance-subjects.json'));
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(join(windows, 'provenance-subjects.json'), JSON.stringify(subjects)));
  const failedTags: string[] = [];
  await expect(publishReleaseTopology({
    version: 'v0.2.3',
    packageVersion: '0.2.3',
    linuxDirectory: linux,
    windowsDirectory: windows,
    git: { ...git, createAnnotatedTag: async (tag: string) => { failedTags.push(tag); } },
    provider,
  })).rejects.toThrow(/provenance/);
  expect(failedTags).toEqual([]);
});
