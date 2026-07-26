import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { compileSeed } from './compile-seed.mjs';

const directory = await mkdtemp(resolve(tmpdir(), 'evitania-seed-check-'));
const generatedSeed = resolve(directory, 'seed-v2.json');
const generatedRejections = resolve(directory, 'seed-rejections.json');
await compileSeed({
  seedPath: generatedSeed,
  rejectionPath: generatedRejections,
  assetRoot: directory,
});
const [expectedSeed, actualSeed, expectedRejections, actualRejections] = await Promise.all([
  readFile(resolve('assets/seed/seed-v2.json')),
  readFile(generatedSeed),
  readFile(resolve('artifacts/seed-rejections.json')),
  readFile(generatedRejections),
]);
if (!expectedSeed.equals(actualSeed) || !expectedRejections.equals(actualRejections)) {
  throw new Error('Checked-in seed artifacts differ from deterministic compilation output.');
}
