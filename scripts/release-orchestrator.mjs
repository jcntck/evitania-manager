import { readFile } from 'node:fs/promises';
import { releaseTags, assertReleaseVersion, validatePlatformEvidence } from './release-contract.mjs';

export const REQUIRED_PREFLIGHT_COMMANDS = Object.freeze([
  ['npm', ['ci']],
  ['npm', ['test']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['audit', '--omit=dev']],
  ['npm', ['run', 'seed:check']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'validate:package']],
]);

const output = (result) => typeof result === 'string' ? result.trim() : String(result?.stdout ?? '').trim();

export const runReleasePreflight = async ({
  version,
  rootDirectory,
  run,
  authorizedBranches = ['main'],
  includeCommands = true,
}) => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', `file://${rootDirectory}/`), 'utf8'));
  assertReleaseVersion(version, packageJson.version);
  const branch = output(await run('git', ['branch', '--show-current']));
  if (!authorizedBranches.includes(branch)) throw new Error(`unauthorized release branch: ${branch}`);
  if (output(await run('git', ['status', '--porcelain']))) throw new Error('release worktree must be clean');
  for (const tag of releaseTags(version)) {
    const local = await run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { allowFailure: true });
    if (local.exitCode === 0) throw new Error(`immutable tag already exists locally: ${tag}`);
    const remote = output(await run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]));
    if (remote) throw new Error(`immutable tag already exists remotely: ${tag}`);
  }
  if (includeCommands) {
    for (const [command, args] of REQUIRED_PREFLIGHT_COMMANDS) await run(command, args);
    if (output(await run('git', ['status', '--porcelain']))) {
      throw new Error('release gates changed the worktree; commit deterministic outputs first');
    }
  }
  return { version, branch, tags: releaseTags(version), commands: includeCommands ? REQUIRED_PREFLIGHT_COMMANDS : [] };
};

export const publishReleaseTopology = async ({
  version,
  packageVersion,
  linuxDirectory,
  windowsDirectory,
  git,
  provider,
}) => {
  assertReleaseVersion(version, packageVersion);
  const tags = releaseTags(version);
  for (const tag of tags) {
    if (await git.tagExists(tag) || await provider.releaseExists(tag)) {
      throw new Error(`immutable tag or release already exists: ${tag}`);
    }
  }
  const linux = await validatePlatformEvidence({
    platform: 'linux',
    directory: linuxDirectory,
    packageVersion,
  });
  const windows = await validatePlatformEvidence({
    platform: 'windows',
    directory: windowsDirectory,
    packageVersion,
  });
  await git.createAnnotatedTag(tags[0], `Evitania Manager ${tags[0]}`);
  await git.createAnnotatedTag(tags[1], `Evitania Manager ${tags[1]}`);
  await git.createAnnotatedTag(tags[2], `Evitania Manager ${tags[2]}`);
  await git.pushTagsAtomically(tags);
  await provider.createRelease({
    tag: tags[0],
    files: linux.files.map((name) => `${linuxDirectory}/${name}`),
    notes: `${PRODUCT_NOTES(version)}\nPlatform: Linux Debian.`,
  });
  await provider.createRelease({
    tag: tags[1],
    files: windows.files.map((name) => `${windowsDirectory}/${name}`),
    notes: `${PRODUCT_NOTES(version)}\nPlatform: Windows NSIS.`,
  });
  await provider.createRelease({
    tag: tags[2],
    files: [],
    notes: `${PRODUCT_NOTES(version)}\nPlatform releases: ${tags[0]} and ${tags[1]}.`,
  });
  return { tags, linux, windows };
};

const PRODUCT_NOTES = (version) =>
  `Evitania Manager ${version}\nGerenciador de produção e coleta para Evitania.\nAuthor: João Neto.`;
