import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validatePackageContract, validatePlatformEvidence } from './release-contract.mjs';

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    directory: { type: 'string' },
    version: { type: 'string' },
    package: { type: 'boolean', default: false },
  },
});
const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(rootDirectory, 'package.json'), 'utf8'));
const version = values.version ?? `v${packageJson.version}`;
if (values.package) {
  const result = await validatePackageContract({
    packageJson,
    requestedVersion: version,
    rootDirectory,
    signingEnvironment: process.env,
  });
  console.log(`package metadata valid; Windows output: ${result.signingStatus}`);
} else {
  if (values.platform !== 'linux' && values.platform !== 'windows') {
    throw new Error('--platform must be linux or windows');
  }
  const result = await validatePlatformEvidence({
    platform: values.platform,
    directory: resolve(values.directory ?? `release/${values.platform}/publish`),
    packageVersion: packageJson.version,
  });
  console.log(`${values.platform} evidence valid: ${result.files.join(', ')}`);
}
