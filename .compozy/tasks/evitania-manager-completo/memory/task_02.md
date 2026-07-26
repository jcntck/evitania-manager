# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement the pure catalog candidate boundary, reverse references, canonical duration and stock parsing, mixed product-cycle detection, and real repository integration for UT-013–UT-021 and IT-009.

## Important Decisions

- `_tests.md` owns observable case behavior; schema/typed graph constraints come from `_techspec.md` and Task 1's current domain model.
- Save-time catalog cycle rejection and the later planner's path-local handling of externally invalid legacy cycles are separate, compatible boundaries.
- Preserve the existing dirty Task 1 worktree and add Task 2 without rewriting unrelated files.
- Optimistic catalog edits/deletions carry the expected prior entity value because schema-v2 entities have stable IDs but no per-entity revision counter.
- Cycle paths are closed (`[a, ..., a]`) and selected deterministically by catalog/product-component order.
- Managed image references are validated against the candidate's own module category, while optional absence remains valid.

## Learnings

- No repository-root `AGENTS.md` or `CLAUDE.md` exists; the only discovered `AGENTS.md` is dependency-local and inapplicable.
- The spec corpus has no `analysis/`, handoff, `_examples.md`, or `_qa.md` artifacts.
- Baseline suite is green at 7 files / 51 tests, but no Task 2 catalog-service API or assigned cases exist yet.
- Product mutations must write through the shared `catalog.products` array; category filtering is used only for identity/kind lookup.
- Newly created products must treat their own candidate ID as an eligible component long enough for self-reference to return `production_cycle`.

## Files / Surfaces

- Added `src/domain/catalog-service.ts` for candidates, mutations, references, duration, stock, and typed outcomes.
- Added `src/domain/production-graph.ts`; `src/domain/app-data-validator.ts` now shares its iterative exact-path cycle detector.
- Added `test/catalog-service.test.ts` for UT-013–UT-021 and `test/catalog-repository-integration.test.ts` for IT-009.

## Errors / Corrections

- Corrected an initial detached-array mutation hazard for filtered recipe/smelting collections before integration testing.
- Made the shared cycle detector tolerate malformed runtime component entries so full-snapshot inspection remains result/error based.

## Ready for Next Run

- Task 2 implementation and tracking are complete; no automatic commit was created.
- Fresh gate: `npm test && npm run typecheck && npm run seed:check && npm run build` passed with 9 files / 92 tests and a successful Vite production build.
