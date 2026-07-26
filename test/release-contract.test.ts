import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertReleaseVersion,
  validatePackageContract,
  validatePlatformEvidence,
} from '../scripts/release-contract.mjs';
import {
  publishReleaseTopology,
  REQUIRED_PREFLIGHT_COMMANDS,
  runReleasePreflight,
} from '../scripts/release-orchestrator.mjs';
import {
  cleanupReleaseDirectories,
  createEvidenceFixture,
  makeReleaseRoot,
} from './release-test-helpers';

afterEach(cleanupReleaseDirectories);

const writePackage = async (root: string, version = '0.2.3'): Promise<void> => {
  await writeFile(join(root, 'package.json'), JSON.stringify({ version }));
};

const cleanGitRunner = (overrides: {
  branch?: string;
  dirty?: boolean;
  existingTag?: string;
  failCommand?: string;
} = {}) => {
  const calls: string[] = [];
  const run = vi.fn(async (command: string, args: string[], options?: { allowFailure?: boolean }) => {
    const text = `${command} ${args.join(' ')}`;
    calls.push(text);
    if (overrides.failCommand && text === overrides.failCommand) throw new Error(`gate failed: ${text}`);
    if (text === 'git branch --show-current') return { exitCode: 0, stdout: `${overrides.branch ?? 'main'}\n` };
    if (text === 'git status --porcelain') return { exitCode: 0, stdout: overrides.dirty ? ' M file\n' : '' };
    if (args[0] === 'rev-parse') {
      const exists = args.at(-1) === `refs/tags/${overrides.existingTag}`;
      return { exitCode: exists ? 0 : 1, stdout: '' };
    }
    if (args[0] === 'ls-remote') return { exitCode: 0, stdout: '' };
    return { exitCode: 0, stdout: '', options };
  });
  return { run, calls };
};

describe('release and distribution contract', () => {
  it('UT-057 rejects every source preflight gate before any push', async () => {
    const root = await makeReleaseRoot();
    await writePackage(root);
    expect(() => assertReleaseVersion('0.2.3', '0.2.3')).toThrow(/invalid/);
    expect(() => assertReleaseVersion('v0.2.4', '0.2.3')).toThrow(/does not match/);

    for (const scenario of [
      { branch: 'feature' },
      { dirty: true },
      { existingTag: 'v0.2.3-windows' },
    ]) {
      const fixture = cleanGitRunner(scenario);
      await expect(runReleasePreflight({
        version: 'v0.2.3',
        rootDirectory: root,
        run: fixture.run,
      })).rejects.toThrow();
      expect(fixture.calls.some((call) => call.startsWith('git push'))).toBe(false);
    }

    for (const [command, args] of REQUIRED_PREFLIGHT_COMMANDS) {
      const fixture = cleanGitRunner({ failCommand: `${command} ${args.join(' ')}` });
      await expect(runReleasePreflight({
        version: 'v0.2.3',
        rootDirectory: root,
        run: fixture.run,
      })).rejects.toThrow(/gate failed/);
      expect(fixture.calls.some((call) => call.startsWith('git push'))).toBe(false);
    }
  });

  it('UT-058 publishes complete Linux and Windows evidence before the main release and never overwrites', async () => {
    const root = await makeReleaseRoot();
    const linux = await createEvidenceFixture(root, 'linux');
    const windows = await createEvidenceFixture(root, 'windows');
    const events: string[] = [];
    const existing = new Set<string>();
    const git = {
      tagExists: async (tag: string) => existing.has(tag),
      createAnnotatedTag: async (tag: string) => { events.push(`tag:${tag}`); },
      pushTagsAtomically: async (tags: string[]) => { events.push(`push:${tags.join(',')}`); },
    };
    const provider = {
      releaseExists: async (tag: string) => existing.has(tag),
      createRelease: async ({ tag }: { tag: string }) => { events.push(`release:${tag}`); },
    };
    await publishReleaseTopology({
      version: 'v0.2.3',
      packageVersion: '0.2.3',
      linuxDirectory: linux,
      windowsDirectory: windows,
      git,
      provider,
    });
    expect(events.slice(-3)).toEqual([
      'release:v0.2.3-linux',
      'release:v0.2.3-windows',
      'release:v0.2.3',
    ]);
    expect(events).toContain('push:v0.2.3-linux,v0.2.3-windows,v0.2.3');

    existing.add('v0.2.3-linux');
    await expect(publishReleaseTopology({
      version: 'v0.2.3',
      packageVersion: '0.2.3',
      linuxDirectory: linux,
      windowsDirectory: windows,
      git,
      provider,
    })).rejects.toThrow(/already exists/);
  });

  it('UT-059 accepts exact native/ZIP evidence and rejects extras, hashes, SBOM, and subjects', async () => {
    const root = await makeReleaseRoot();
    const linux = await createEvidenceFixture(root, 'linux');
    const windows = await createEvidenceFixture(root, 'windows');
    await expect(validatePlatformEvidence({ platform: 'linux', directory: linux, packageVersion: '0.2.3' }))
      .resolves.toMatchObject({ artifactName: expect.stringMatching(/\.deb$/) });
    await expect(validatePlatformEvidence({ platform: 'windows', directory: windows, packageVersion: '0.2.3' }))
      .resolves.toMatchObject({ artifactName: expect.stringMatching(/\.exe$/) });

    await writeFile(join(linux, 'cross-platform.exe'), 'wrong');
    await expect(validatePlatformEvidence({ platform: 'linux', directory: linux, packageVersion: '0.2.3' }))
      .rejects.toThrow(/inventory|exactly one/);
    await rm(join(linux, 'cross-platform.exe'));
    await writeFile(join(linux, 'SHA256SUMS.txt'), 'bad  artifact\n');
    await expect(validatePlatformEvidence({ platform: 'linux', directory: linux, packageVersion: '0.2.3' }))
      .rejects.toThrow(/checksum/);

    const repaired = await createEvidenceFixture(join(root, 'repaired'), 'linux');
    const sbomPath = join(repaired, 'sbom.cdx.json');
    const sbom = JSON.parse(await readFile(sbomPath, 'utf8'));
    delete sbom.metadata.component;
    await writeFile(sbomPath, JSON.stringify(sbom));
    await expect(validatePlatformEvidence({ platform: 'linux', directory: repaired, packageVersion: '0.2.3' }))
      .rejects.toThrow(/CycloneDX/);
  });

  it('UT-060 enforces metadata/icons/output isolation and conditional CI-only signing', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
    const requestedVersion = `v${packageJson.version}`;
    await expect(validatePackageContract({
      packageJson,
      requestedVersion,
      rootDirectory: process.cwd(),
      signingEnvironment: {},
    })).resolves.toMatchObject({ signingStatus: 'unsigned' });
    await expect(validatePackageContract({
      packageJson,
      requestedVersion,
      rootDirectory: process.cwd(),
      signingEnvironment: { WIN_CSC_LINK: 'ci-link', WIN_CSC_KEY_PASSWORD: 'ci-password' },
    })).resolves.toMatchObject({ signingStatus: 'signed', credentialSource: 'ci-environment' });
    await expect(validatePackageContract({
      packageJson,
      requestedVersion,
      rootDirectory: process.cwd(),
      signingEnvironment: { WIN_CSC_LINK: 'partial' },
    })).rejects.toThrow(/incomplete/);

    const bad = structuredClone(packageJson);
    bad.build.linux.target = ['deb', 'App' + 'Image'];
    await expect(validatePackageContract({
      packageJson: bad,
      requestedVersion,
      rootDirectory: process.cwd(),
    })).rejects.toThrow(/Debian only/);

    const iconRoot = await makeReleaseRoot();
    await mkdir(join(iconRoot, 'assets/app'), { recursive: true });
    await cp(join(process.cwd(), 'assets/app'), join(iconRoot, 'assets/app'), { recursive: true });
    await rm(join(iconRoot, 'assets/app/icons/48x48.png'));
    await expect(validatePackageContract({
      packageJson,
      requestedVersion,
      rootDirectory: iconRoot,
    })).rejects.toThrow(/required icon/);
  });
});
