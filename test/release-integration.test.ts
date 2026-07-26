import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { publishReleaseTopology, runReleasePreflight } from '../scripts/release-orchestrator.mjs';
import { validatePlatformEvidence } from '../scripts/release-contract.mjs';
import {
  cleanupReleaseDirectories,
  createEvidenceFixture,
  makeReleaseRoot,
} from './release-test-helpers';

const execute = promisify(execFile);
afterEach(cleanupReleaseDirectories);

const gitRun = (root: string) => async (
  command: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<{ exitCode: number; stdout: string }> => {
  try {
    const result = await execute(command, args, { cwd: root });
    return { exitCode: 0, stdout: result.stdout };
  } catch (error) {
    if (!options.allowFailure) throw error;
    const failure = error as { code?: number; stdout?: string };
    return { exitCode: failure.code ?? 1, stdout: failure.stdout ?? '' };
  }
};

it('IT-018 exercises temporary Git preflight, immutable tags, platform failure, and happy topology', async () => {
  const root = await makeReleaseRoot();
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  await execute('git', ['init', '--bare', origin]);
  await mkdir(work);
  await execute('git', ['init', '-b', 'main'], { cwd: work });
  await execute('git', ['config', 'user.email', 'release@example.invalid'], { cwd: work });
  await execute('git', ['config', 'user.name', 'Release Fixture'], { cwd: work });
  await writeFile(join(work, 'package.json'), JSON.stringify({ version: '0.2.3' }));
  await execute('git', ['add', 'package.json'], { cwd: work });
  await execute('git', ['commit', '-m', 'fixture'], { cwd: work });
  await execute('git', ['remote', 'add', 'origin', origin], { cwd: work });
  await execute('git', ['push', '-u', 'origin', 'main'], { cwd: work });
  await expect(runReleasePreflight({
    version: 'v0.2.3',
    rootDirectory: work,
    run: gitRun(work),
    includeCommands: false,
  })).resolves.toMatchObject({ branch: 'main' });

  await writeFile(join(work, 'dirty.txt'), 'dirty');
  await expect(runReleasePreflight({
    version: 'v0.2.3',
    rootDirectory: work,
    run: gitRun(work),
    includeCommands: false,
  })).rejects.toThrow(/clean/);
  await execute('git', ['clean', '-f'], { cwd: work });

  const linux = await createEvidenceFixture(root, 'linux');
  const windows = await createEvidenceFixture(root, 'windows');
  const releases: string[] = [];
  const git = {
    tagExists: async (tag: string) => {
      try {
        await execute('git', ['rev-parse', '--verify', `refs/tags/${tag}`], { cwd: work });
        return true;
      } catch { return false; }
    },
    createAnnotatedTag: async (tag: string, message: string) => {
      await execute('git', ['tag', '-a', tag, '-m', message], { cwd: work });
    },
    pushTagsAtomically: async (tags: string[]) => {
      await execute('git', ['push', '--atomic', 'origin', ...tags.map((tag) => `refs/tags/${tag}`)], { cwd: work });
    },
  };
  const provider = {
    releaseExists: async () => false,
    createRelease: async ({ tag }: { tag: string }) => { releases.push(tag); },
  };
  await writeFile(join(windows, 'unexpected.deb'), 'cross-platform');
  await expect(publishReleaseTopology({
    version: 'v0.2.3',
    packageVersion: '0.2.3',
    linuxDirectory: linux,
    windowsDirectory: windows,
    git,
    provider,
  })).rejects.toThrow();
  expect((await execute('git', ['tag'], { cwd: work })).stdout.trim()).toBe('');
  await rm(join(windows, 'unexpected.deb'));
  await publishReleaseTopology({
    version: 'v0.2.3',
    packageVersion: '0.2.3',
    linuxDirectory: linux,
    windowsDirectory: windows,
    git,
    provider,
  });
  expect((await execute('git', ['tag', '--list'], { cwd: origin })).stdout.trim().split('\n').sort())
    .toEqual(['v0.2.3', 'v0.2.3-linux', 'v0.2.3-windows']);
  expect(releases).toEqual(['v0.2.3-linux', 'v0.2.3-windows', 'v0.2.3']);
  await expect(runReleasePreflight({
    version: 'v0.2.3',
    rootDirectory: work,
    run: gitRun(work),
    includeCommands: false,
  })).rejects.toThrow(/already exists/);
});

it('IT-019 inspects real fixture artifacts, exact ZIPs, checksums, SBOM, metadata, icons, and signing', async () => {
  const root = await makeReleaseRoot();
  const linux = await createEvidenceFixture(root, 'linux');
  const windows = await createEvidenceFixture(root, 'windows');
  const linuxResult = await validatePlatformEvidence({ platform: 'linux', directory: linux, packageVersion: '0.2.3' });
  const windowsResult = await validatePlatformEvidence({
    platform: 'windows',
    directory: windows,
    packageVersion: '0.2.3',
  });
  expect(linuxResult.files).toHaveLength(7);
  expect(windowsResult.files).toHaveLength(7);
  const signing = JSON.parse(await readFile(join(windows, 'signing-status.json'), 'utf8'));
  expect(signing).toMatchObject({ status: 'signed', conditional: true, credentialsSource: 'ci-environment' });
  const metadata = JSON.parse(await readFile(join(linux, 'release-metadata.json'), 'utf8'));
  expect(metadata).toMatchObject({
    product: 'Evitania Manager',
    author: 'João Neto',
    version: '0.2.3',
    platform: 'linux',
  });
});
