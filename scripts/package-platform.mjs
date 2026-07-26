import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { preparePlatformEvidence, validatePackageContract } from './release-contract.mjs';

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    'build-directory': { type: 'string' },
    'publish-directory': { type: 'string' },
  },
});
const platform = values.platform;
if (platform !== 'linux' && platform !== 'windows') throw new Error('--platform must be linux or windows');
const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(rootDirectory, 'package.json'), 'utf8'));
const buildDirectory = resolve(values['build-directory'] ?? `release/${platform}/build`);
const publishDirectory = resolve(values['publish-directory'] ?? `release/${platform}/publish`);
await validatePackageContract({
  packageJson,
  requestedVersion: `v${packageJson.version}`,
  rootDirectory,
  signingEnvironment: process.env,
});
await rm(publishDirectory, { recursive: true, force: true });
await mkdir(publishDirectory, { recursive: true });
const result = await preparePlatformEvidence({
  platform,
  buildDirectory,
  publishDirectory,
  packageLockPath: resolve(rootDirectory, 'package-lock.json'),
  packageVersion: packageJson.version,
  signed: platform === 'windows' && Boolean(process.env.WIN_CSC_LINK && process.env.WIN_CSC_KEY_PASSWORD),
});
console.log(`${platform} release inventory: ${result.files.join(', ')}`);
