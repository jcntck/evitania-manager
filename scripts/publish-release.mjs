import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { publishReleaseTopology } from './release-orchestrator.mjs';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    linux: { type: 'string', default: 'release/linux/publish' },
    windows: { type: 'string', default: 'release/windows/publish' },
  },
});
const rootDirectory = resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(await readFile(resolve(rootDirectory, 'package.json'), 'utf8'));
const execute = (command, args, { capture = false, allowFailure = false } = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    if (capture) child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', rejectRun);
    child.on('close', (exitCode) => {
      if (exitCode !== 0 && !allowFailure) rejectRun(new Error(`${command} failed with ${exitCode}`));
      else resolveRun({ exitCode: exitCode ?? 1, stdout });
    });
  });
const git = {
  tagExists: async (tag) => {
    const local = await execute('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
      capture: true,
      allowFailure: true,
    });
    if (local.exitCode === 0) return true;
    const remote = await execute('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], {
      capture: true,
      allowFailure: true,
    });
    return Boolean(remote.stdout.trim());
  },
  createAnnotatedTag: (tag, message) => execute('git', ['tag', '-a', tag, '-m', message]),
  pushTagsAtomically: (tags) => execute('git', ['push', '--atomic', 'origin', ...tags.map((tag) => `refs/tags/${tag}`)]),
};
const provider = {
  releaseExists: async (tag) => (await execute('gh', ['release', 'view', tag], {
    capture: true,
    allowFailure: true,
  })).exitCode === 0,
  createRelease: ({ tag, files, notes }) => execute('gh', [
    'release', 'create', tag, ...files, '--verify-tag', '--title', `Evitania Manager ${tag}`, '--notes', notes,
  ]),
};
const result = await publishReleaseTopology({
  version: values.version,
  packageVersion: packageJson.version,
  linuxDirectory: resolve(values.linux),
  windowsDirectory: resolve(values.windows),
  git,
  provider,
});
console.log(`immutable topology published: ${result.tags.join(' -> ')}`);
