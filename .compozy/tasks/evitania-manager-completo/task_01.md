---
status: pending
title: "Schema v2, migrations, seed, and revisioned repository"
type: backend
complexity: critical
---

# Task 1: Schema v2, migrations, seed, and revisioned repository

## Overview

Deliver the data foundation for the complete application: the current schema,
v0.2.3 migration, deterministic first-use seed, and revision-controlled atomic
JSON repository. This slice prevents data loss and establishes the contracts
consumed by every later domain, desktop, and renderer task.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. The current model MUST use schema v2 with normalized `smelting`, goal priorities, completion credits, and no legacy `completedEntities`.
2. Storage MUST use the strict versioned envelope, closed load/save outcomes, and complete domain validation defined by the TechSpec.
3. Migration v1→v2 MUST preserve valid IDs/data, create ordered priorities, and convert completed quantities into stock plus reversible credits without mutating the source.
4. Load MUST follow primary→backup→seed/empty ordering and MUST never replace existing corrupt files with an empty workspace.
5. Save MUST use a serialized compare-and-swap revision check and MUST perform no write or side effect after a revision conflict.
6. Atomic persistence MUST leave either the previous valid snapshot or the complete next snapshot at every injected failure stage.
7. The workbook compiler MUST produce deterministic validated seed data, managed assets, and structured rejections without runtime XLSX parsing.
8. Seed initialization MUST be first-use-only and idempotent under interruption and retry.
9. Filesystem, clock, and identifier boundaries SHOULD remain injectable for deterministic fault and migration tests.
</requirements>

## Subtasks

- [ ] 1.1 Define current schema, storage envelope, snapshots, result types, and legacy fixtures.
- [ ] 1.2 Deliver strict structural and full-domain validation for schema v2.
- [ ] 1.3 Deliver the non-mutating v1→v2 migration and sequential migration registry.
- [ ] 1.4 Deliver the fault-testable atomic writer, write serialization, and revision CAS.
- [ ] 1.5 Refactor repository load, recovery, initialization, and save outcomes.
- [ ] 1.6 Deliver the runtime seed loader and safe empty-workspace notice path.
- [ ] 1.7 Deliver deterministic workbook-to-seed compilation and rejection reporting.
- [ ] 1.8 Generate and package the validated seed and accepted seed assets.
- [ ] 1.9 Add storage, migration, seed, recovery, restart, and concurrency fixtures.
- [ ] 1.10 Implement every assigned unit and integration test.

## Implementation Details

Follow TechSpec sections “Data Models”, “Storage Load and Migration Algorithm”,
“Atomic Save and Conflict Algorithm”, and “Seed Compilation”. Keep legacy input
types separate from the current domain. The repository contract must be ready
for the result-typed controller/IPC work without implementing that bridge here.

### Relevant Files

- `src/shared/domain.ts` — current schema-v1 aggregate requiring v2 replacement.
- `src/domain/app-data-validator.ts` — current shallow validator requiring strict current-domain validation.
- `src/infrastructure/json-app-repository.ts` — current empty fallback and best-effort backup requiring full replacement.
- `docs/base-cadastro.xlsx` — read-only source for deterministic seed compilation.
- `package.json` and `package-lock.json` — exact seed tooling and scripts.
- `vitest.config.ts` — storage/integration harness configuration.
- `test/app-data-validator.test.ts` — existing Vitest conventions and validator regression.

Files expected to be created include `src/infrastructure/storage-schema.ts`,
`src/infrastructure/migrations/v1-to-v2.ts`,
`src/infrastructure/seed-loader.ts`, `scripts/compile-seed.mjs`,
`assets/seed/seed-v2.json`, seed assets/rejection artifacts, and focused tests.

### Dependent Files

- `src/controllers/app-controller.ts` — later consumes versioned load/save outcomes.
- `src/main/main.ts` — later composes repository paths and packaged seed.
- `src/shared/desktop-api.ts`, `src/preload/preload.ts`, `src/renderer/window.d.ts` — later expose revisions through the bridge.
- `src/domain/planner.ts` and `src/domain/planning-result.ts` — later replaced against schema v2.
- `src/infrastructure/image-library.ts` — later shares managed seed/user asset references.
- `tsconfig.main.json` and `tsconfig.renderer.json` — must include new shared/storage types.

### Related ADRs

- [ADR-001: Treat `.ai/` as the Product Baseline](adrs/adr-001.md) — Seed data and migration follow the authoritative product baseline.
- [ADR-004: Keep User Data and Managed Assets Local-First](adrs/adr-004.md) — Storage remains in Electron user data.
- [ADR-006: Evolve the Local JSON Aggregate with Revisions and Migrations](adrs/adr-006.md) — Primary persistence decision.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — Build-time seed and filesystem coverage.

## Deliverables

- Current schema-v2 and legacy-v1 contracts with typed errors/outcomes.
- Validated incremental migration preserving v0.2.3 state and reversible credits.
- Atomic revisioned JSON repository with recovery and first-use-only seed initialization.
- Deterministic seed compiler, packaged seed/assets, and rejection report.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [ ] UT-001, UT-002, UT-003, UT-004, UT-005, UT-006, UT-007, UT-008, UT-009 — envelope, atomicity, CAS, migration, seed, and corruption outcomes.
- [ ] IT-001, IT-002, IT-003, IT-004, IT-005, IT-006, IT-010 — real filesystem restart/recovery/concurrency, workbook compilation, and v1 migration flows.

## Success Criteria

- Every assigned test case implemented and passing.
- Valid v0.2.3 fixtures migrate and round-trip without identity or quantity loss.
- Every fault stage preserves a loadable previous or next snapshot.
- Repeated seed compilation is byte-identical and runtime contains no XLSX parser.
- Typecheck succeeds for current domain and all declared downstream contracts.
