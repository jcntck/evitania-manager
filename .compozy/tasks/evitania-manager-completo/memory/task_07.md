# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Replace all active AppImage/single-release paths with isolated Debian and NSIS
  packages, exact one-member ZIPs, strict evidence, packaged smoke coverage, and
  immutable Linux → Windows → source publication.

## Important Decisions

- Resolve differing prose tag order in favor of the machine-observable contract:
  publish `<version>-linux`, then `<version>-windows`, and create `<version>` only
  after both platform releases and their evidence exist.
- Treat the publication command as a CI orchestration entry point: all mandatory
  gates and both platform artifacts must succeed before an atomic three-tag push.

## Learnings

- The pre-task baseline actively published AppImage and a single combined
  release across builder config, workflow, scripts, README, and release docs;
  all active paths in those surfaces have now been replaced.
- The spec corpus has no `analysis/` or `handoffs/` directory; the canonical
  task-07 contracts are the five root documents plus ADR-005 and ADR-010.
- A real Debian package is required to expose runtime native-dependency and
  desktop-entry derivation failures that source-mode Electron cannot detect.

## Files / Surfaces

- Touched: `package.json`, `package-lock.json`, generated native icons,
  `.github/workflows/release.yml`, release/icon/package/native-inspection scripts,
  release unit/integration tests, packaged distribution Playwright spec, README,
  release docs, and Windows signing docs.

## Errors / Corrections

- First UT-060 run exposed raw `ENOENT` for a missing generated icon. Normalize
  missing and undersized variants to the deterministic packaging-contract error.
- Real electron-builder schema validation rejected `win.publisherName`; the
  supported publisher identity location is `win.signtoolOptions.publisherName`.
- Debian inspection showed electron-builder derives desktop `Comment` from
  `linux.description`; align synopsis, control description, and desktop identity
  to the canonical package description.
- Packaged Debian launch failed because runtime-imported `sharp` was still a
  devDependency and was omitted from the asar. Move exact `sharp@0.35.3` to
  production dependencies; source-mode Electron tests cannot detect this class.
- After including Sharp, its `.node` was auto-unpacked but the libvips shared
  library remained inside asar and could not be dynamically loaded. Explicitly
  unpack `node_modules/@img/**/*` for both packaged platforms.
- Strict non-file inventory rejection belongs to the isolated publish directory,
  not electron-builder staging, which legitimately contains `linux-unpacked`.
## Ready for Next Run

- Linux evidence is fresh: locked install; 151 Vitest tests; typecheck; production
  audit with 0 vulnerabilities; seed check; build; six release tests; exact
  `.deb`/ZIP hashes/evidence; native desktop/eight-icon inspection; and installed
  E2E-012 persistence all pass.
- Local Playwright runs 12 passing journeys, including E2E-014; E2E-012 also
  passes separately against the real `.deb`.
- E2E-013 is implemented in the `windows-2025` release job with NSIS/executable
  metadata, icon, signing, install, launch, and persistence inspection. It remains
  unexecuted because this workspace is Linux and auto-commit/push is disabled.
  Run the Windows job after manual review/commit, then update task tracking only
  if it passes.
