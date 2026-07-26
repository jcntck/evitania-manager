# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Deliver the four-operation desktop trust boundary, managed image lifecycle/GC, native folder behavior, secure bootstrap, immutable serialized AppStore, diagnostics, and all assigned Task 4 tests without an automatic commit.

## Important Decisions

- `_tests.md` owns assigned observable behavior; TechSpec machine-checkable API/error/IPC limits and state semantics own the implementation contract.
- Keep Desktop API DTOs in `src/shared`; repository implementation errors are mapped and redacted by `AppController`.
- AppStore serializes effects, tracks same-ID submissions before queue admission, retains failed-operation candidates for exact retry, and blocks all saves after conflict until explicit reload.
- Managed image references require category plus generated UUID filename; parser rejects raw/encoded dot or separator traversal before URL normalization.
- Orphan discovery itself provides retry: failed managed deletions remain present and are retried after the next committed save.

## Learnings

- No repository-root `AGENTS.md`/`CLAUDE.md`, spec `analysis/`, or `handoffs/` exist; dependency-local guidance is inapplicable.
- The legacy bridge threw errors, used mutable `selectImage`/`openDataFolder`, accepted unbounded snapshots, and bootstrap created data services without a single-instance lock.
- Existing Task 1–3 worktree is uncommitted and must remain intact.

## Files / Surfaces

- Touched shared desktop contracts/adapter, preload, main bootstrap/IPC/folder services, controller, image library, diagnostic logger, renderer store/settings/current consumer, and focused Task 4 tests.

## Errors / Corrections

- Corrected strict asset parsing to reject traversal in the raw URL before WHATWG URL normalization removes dot segments.
- Added an injectable image filesystem boundary to verify interrupted atomic writes and retryable orphan deletion.
- Corrected repeated-submit assertions to account for pre-existing stock while still proving exactly one increment.
- Corrected preload composition after real Electron E2E proved sandboxed preload cannot load a local runtime helper; the bridge now stays self-contained with type-only shared-contract conformance.

## Ready for Next Run

- Task 4 implementation, self-review, and spec parity are complete.
- Fresh full gate passed: 16 Vitest files / 136 tests, 2 Playwright Electron E2E journeys, both TypeScript targets, deterministic seed check, production-only audit with 0 vulnerabilities, production build, and `git diff --check`.
- Contract parity passed against `_prd.md`, `_techspec.md`, `_user_stories.md`, `_tests.md`, task_04, downstream task_05/task_06 contracts, and ADR-004/006/007/009/010.
- Automatic commit is disabled; leave the complete diff for manual review.
