import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleasePreflight } from './release-orchestrator.mjs';

const version = process.argv[2];
const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (command, args, options = {}) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, { cwd: rootDirectory, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
  child.on('error', rejectRun);
  child.on('close', (exitCode) => {
    const result = { exitCode: exitCode ?? 1, stdout, stderr };
    if (result.exitCode !== 0 && !options.allowFailure) {
      rejectRun(new Error(`${command} ${args.join(' ')} failed with ${result.exitCode}`));
    } else resolveRun(result);
  });
});

const result = await runReleasePreflight({ version, rootDirectory, run });
console.log(`preflight complete for ${result.tags.join(', ')}; no tag has been pushed`);
