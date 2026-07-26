import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const platform = process.argv[2];
if (platform !== 'linux' && platform !== 'windows' && platform !== 'all') {
  throw new Error('usage: node scripts/clean-release.mjs linux|windows|all');
}
const target = platform === 'all' ? 'release' : `release/${platform}`;
await rm(resolve(new URL('..', import.meta.url).pathname, target), { recursive: true, force: true });
