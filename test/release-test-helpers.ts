import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePlatformEvidence } from '../scripts/release-contract.mjs';

export const releaseDirectories: string[] = [];

export const makeReleaseRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'evitania-release-test-'));
  releaseDirectories.push(root);
  return root;
};

export const cleanupReleaseDirectories = async (): Promise<void> => {
  await Promise.all(releaseDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
};

export const createEvidenceFixture = async (
  root: string,
  platform: 'linux' | 'windows',
  version = '0.2.3',
): Promise<string> => {
  const buildDirectory = join(root, platform, 'build');
  const publishDirectory = join(root, platform, 'publish');
  await mkdir(buildDirectory, { recursive: true });
  await mkdir(publishDirectory, { recursive: true });
  const nativeName = platform === 'linux'
    ? `Evitania-Manager-${version}-amd64.deb`
    : `Evitania-Manager-${version}-x64.exe`;
  await writeFile(join(buildDirectory, nativeName), Buffer.from(`${platform}-native-artifact-${version}`));
  const lockPath = join(root, 'package-lock.json');
  try {
    await readFile(lockPath);
  } catch {
    await copyFile(join(process.cwd(), 'package-lock.json'), lockPath);
  }
  await preparePlatformEvidence({
    platform,
    buildDirectory,
    publishDirectory,
    packageLockPath: lockPath,
    packageVersion: version,
    signed: platform === 'windows',
  });
  return publishDirectory;
};
