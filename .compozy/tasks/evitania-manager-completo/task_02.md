---
status: completed
title: "Catalog invariants, references, and production cycles"
type: backend
complexity: high
---

# Task 2: Catalog invariants, references, and production cycles

## Overview

Deliver the pure catalog domain boundary shared by all seven modules, the planner,
and renderer forms. It turns candidate edits into validated snapshots and prevents
broken references, invalid quantities/rates, unsafe deletion, and mixed production cycles.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. `CatalogService` MUST be pure and MUST return typed field/domain results without persistence, IPC, DOM, or localized thrown messages.
2. Item, resource, recipe, smelting, monster, and boss candidates MUST enforce every PRD identity, act, image, relationship, and eligibility invariant.
3. Component and drop quantities MUST be safe positive integers, unique by stable ID, and drop numerator MUST NOT exceed denominator.
4. The canonical duration parser MUST accept all documented formats and reject empty, ambiguous, fractional, nonpositive, or overflowing values.
5. `ReferenceIndex` MUST include resources, components, drops, goals, stock, selected sources, and completion credits and MUST return every typed blocking reference.
6. Stock validation MUST accept zero/safe positive integers and reject malformed, fractional, nonfinite, negative, and unsafe values.
7. Production graph validation MUST detect self, two-node, long, and recipe↔smelting cycles with the exact ordered path.
8. Candidate application MUST preserve the input snapshot and MUST persist no partial graph after any validation failure.
9. Operations SHOULD remain deterministic and linear in entities plus relationships within configured bounds.
</requirements>

## Subtasks

- [x] 2.1 Define candidate, mutation, reference, and catalog-error contracts.
- [x] 2.2 Deliver item and resource candidate validation and mutation.
- [x] 2.3 Deliver recipe/smelting component validation and mutation.
- [x] 2.4 Deliver canonical processing-duration parsing and normalization.
- [x] 2.5 Deliver monster/boss identity and drop validation.
- [x] 2.6 Deliver complete reverse-reference indexing and safe deletion outcomes.
- [x] 2.7 Deliver shared safe-integer stock validation.
- [x] 2.8 Deliver full mixed-product graph cycle detection with exact paths.
- [x] 2.9 Integrate valid candidates with schema-v2 validation and revisioned repository.
- [x] 2.10 Implement every assigned unit and integration test.

## Implementation Details

Follow TechSpec “Catalog Validation and Mutation”. Prefer one cohesive
`catalog-service.ts`; extract reference/cycle/duration modules only where they
clarify the public boundary. The renderer must later consume these errors rather
than duplicate catalog rules in DOM handlers.

### Relevant Files

- `src/shared/domain.ts` — schema-v2 entity and relationship types from Task 1.
- `src/domain/app-data-validator.ts` — complete graph validation integration.
- `src/renderer/app.ts` — current partial/silent form validation to be removed later.
- `src/domain/planner.ts` — current global cycle logic that must not define save invariants.
- `.ai/data/models.md` and `.ai/modules/*.md` — authoritative entity relationships.
- `test/app-data-validator.test.ts` — current test style and regression fixture.

Expected new files include `src/domain/catalog-service.ts` and focused unit/
integration tests; `reference-index.ts` or `processing-duration.ts` are optional
internal extractions, not new architectural layers.

### Dependent Files

- `src/infrastructure/json-app-repository.ts` — real integration target for valid candidates.
- `src/domain/planning-engine.ts` — later consumes the validated catalog graph.
- `src/renderer/catalog/*` and `src/renderer/components/relation-picker.ts` — later consume builders and field errors.
- `src/renderer/store/app-store.ts` — later applies candidates before snapshot save.
- `src/controllers/app-controller.ts` and `src/main/ipc-handlers.ts` — later map full-snapshot errors.

### Related ADRs

- [ADR-001: Treat `.ai/` as the Product Baseline](adrs/adr-001.md) — Catalog behavior follows `.ai/`.
- [ADR-002: Use Scalable Relational Selection with Inline Creation](adrs/adr-002.md) — Domain candidates support nested relational UX.
- [ADR-006: Evolve the Local JSON Aggregate with Revisions and Migrations](adrs/adr-006.md) — Valid mutations persist as complete snapshots.
- [ADR-008: Generate Trees and Consolidation from One Pure Planning Snapshot](adrs/adr-008.md) — Valid graph feeds the planning engine.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — Domain and real repository coverage.

## Deliverables

- Pure catalog mutation/validation service for every catalog module.
- Canonical duration, stock, reverse-reference, and cycle rules.
- Revisioned repository integration proving failed mutations preserve a coherent graph.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [x] UT-013, UT-014, UT-015, UT-016, UT-017, UT-018, UT-019, UT-020, UT-021 — catalog candidates, duration, references, stock, and cycles.
- [x] IT-009 — candidate→catalog service→validator→repository CRUD and failure flow.

## Success Criteria

- Every assigned test case implemented and passing.
- All seven catalog modules use one consistent set of domain invariants.
- Unsafe deletion returns every blocking association and no partial mutation.
- Every prohibited production-cycle shape returns its exact ordered path.
- Catalog service remains independent of Electron, filesystem, and DOM.
