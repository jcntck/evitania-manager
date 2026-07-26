# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Deliver schema-v2 domain/storage contracts, strict validation, v1 migration, atomic revision-CAS repository, deterministic first-use seed pipeline, packaged seed artifacts, and all assigned UT-001–UT-009 / IT-001–IT-006 / IT-010 coverage.

## Important Decisions

- Contract precedence follows `_tests.md` for assigned observable cases and the TechSpec's machine-checkable schema/storage algorithms for persistence details.
- The corpus survey is being performed inline because sub-agent delegation is disabled for this run.
- Schema-v2 UUIDs, normalized `smelting`, contiguous unique goal priorities, strict object keys, complete references/cycles, and safe numeric bounds are validated as one aggregate.
- A valid v1 primary is migrated and atomically persisted at the same revision during load; the validated v1 file becomes the recovery backup.
- Real workbook rows without explicit product identity or enemy act are rejected rather than inferred. Independent unambiguous component/drop item names remain accepted seed items.

## Learnings

- Baseline is schema v1 with `smeltery`/`completedEntities`, a shallow throwing validator, and a repository that turns every load error into an empty workspace.
- No repository `AGENTS.md`, `CLAUDE.md`, spec `analysis/`, or spec `handoffs/` artifacts exist.
- The real workbook compiles to 160 validated independent items and 316 structured rejections; it cannot safely produce products/monsters because those rows omit required machine-readable identities/acts.
- The compiler needs the real TypeScript validator through the development-only `tsx` runner; runtime source has no XLSX import.
- ADR-001's referenced `.ai/` files define models and examples but contain no additional concrete catalog records that can fill the workbook's missing product identities or acts without guessing.

## Files / Surfaces

- Expected scope: shared domain, validator, storage schema/migrations/repository/seed loader, seed compiler and artifacts, package tooling, focused unit/integration fixtures, and compile-only downstream adaptations.
- Touched: `src/shared/domain.ts`, validator/planner compatibility, storage schema and migrations, atomic writer, repository, seed loader, controller/main/renderer compile adapters, package tooling, `scripts/compile-seed.mjs`, packaged seed/assets/rejections, and storage/migration/seed tests.

## Errors / Corrections

- Corrected the compiler from subset-only validation to invoking the application `AppDataValidator` during compilation.
- Corrected load-time migration to persist the migrated envelope before returning, preventing repeated time-dependent in-memory migrations.
- Hardened validator inspection so malformed nested values produce typed domain issues instead of incidental `TypeError`s.

## Ready for Next Run

- Fresh final pipeline passed: deterministic seed compile/check, both TypeScript typechecks, 51/51 Vitest cases, production build, runtime audit, and `git diff --check`.
- Spec parity passed against `_prd.md`, `_techspec.md`, `_user_stories.md`, `_tests.md`, task_01, and ADR-001/004/006/010. No blocking self-review findings remain.
- Automatic commit is disabled; leave the complete diff for manual review.
