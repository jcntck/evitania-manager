---
status: pending
title: "Planning engine, consolidation, estimates, and credits"
type: backend
complexity: critical
---

# Task 3: Planning engine, consolidation, estimates, and credits

## Overview

Replace the consolidated-only planner with one pure deterministic pipeline that
allocates global stock by objective priority and produces both causal trees and
their exact consolidated projection. This slice also owns source resolution,
all estimate formulas, reversible completion credits, duration formatting, and
the planning performance contract.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. `PlanningEngine.calculate` MUST be pure, deterministic, immutable, and independent of Electron, DOM, filesystem, and network.
2. Pending recipe objectives MUST be stable-sorted by priority and MUST consume a copied global stock balance exactly once in that order.
3. Each objective MUST produce an immutable causal tree with stable path IDs, required/allocated/missing values, children, source, estimate, and typed diagnostics.
4. Expansion MUST use only missing output, preserve repeated causal paths, isolate stale/cyclic branches, check safe-integer overflow, and stop at the configured 20,000-node limit.
5. Consolidated needs MUST derive exclusively from objective trees and MUST reconcile every required, allocated, and missing quantity.
6. Source resolution MUST keep incompatible origins separate, auto-select only a sole origin, require a valid persisted choice among many, and diagnose missing/stale choices.
7. Gathering, monster, boss, and smelting calculations MUST follow the exact PRD formulas and MUST distinguish unavailable estimates from zero.
8. Completion creation/undo MUST update stock and immutable credit state atomically in a candidate snapshot and MUST be idempotent by operation ID.
9. Duration presentation MUST obey exact boundaries without changing base values or rendering a positive duration as zero.
10. Planning and search composition MUST satisfy the approved 5,000-record/50-objective/20,000-node, 500 ms CI contract.
11. Diagnostics SHOULD use closed codes and objective/path/entity context without prelocalized messages.
</requirements>

## Subtasks

- [ ] 3.1 Define immutable planning result, node, consolidated, source, estimate, limit, and diagnostic contracts.
- [ ] 3.2 Deliver input indexing, objective validation, and stable priority ordering.
- [ ] 3.3 Deliver recursive priority allocation with causal paths, overflow checks, branch diagnostics, and node limit.
- [ ] 3.4 Deliver consolidation exclusively from objective trees with exact reconciliation.
- [ ] 3.5 Deliver active-source resolution and missing/ambiguous/stale diagnostics.
- [ ] 3.6 Deliver pure gathering, monster, boss, and smelting calculators.
- [ ] 3.7 Deliver idempotent completion-credit creation and exact reversible undo.
- [ ] 3.8 Deliver duration formatting and deterministic numeric/performance fixtures.
- [ ] 3.9 Replace the legacy planner/results and implement every assigned test.

## Implementation Details

Follow TechSpec “Planning Pipeline” and “Completion Transactions”. Preserve useful
numeric examples from `test/planner.test.ts`, but replace the legacy global map,
implicit source selection, `completedEntities` addition, and global cycle abort.
IT-012 integrates the pure credit service with the Task 1 repository; persistence
remains owned by that repository.

### Relevant Files

- `src/domain/planner.ts` — legacy stateful consolidated traversal to replace.
- `src/domain/planning-result.ts` — legacy row-only result types to replace.
- `src/shared/domain.ts` — schema-v2 priorities, credits, products, stock, and source inputs.
- `src/domain/app-data-validator.ts` — structural/invariant boundary for input fixtures.
- `test/planner.test.ts` — existing expansion, loot, stock, and cycle regressions.
- `vitest.config.ts` — performance fixture/test project execution.

Expected new files include `src/domain/planning-engine.ts`,
`src/domain/plan-consolidator.ts`, `src/domain/estimate-calculator.ts`,
`src/domain/completion-service.ts`, a shared duration formatter, and focused
unit/integration/performance fixtures.

### Dependent Files

- `src/renderer/store/app-store.ts` — later recalculates one immutable result.
- `src/renderer/planner/*` — later renders trees, consolidated rows, sources, estimates, and credits.
- `src/renderer/app.ts` — current table and formatter are replaced later.
- `src/infrastructure/json-app-repository.ts` — persists completion candidates in IT-012.
- `src/domain/catalog-service.ts` — supplies graph/source invariants and indexes.

### Related ADRs

- [ADR-001: Treat `.ai/` as the Product Baseline](adrs/adr-001.md) — Current planner behavior is retained only where conformant.
- [ADR-003: Combine Objective Trees with a Consolidated Priority Plan](adrs/adr-003.md) — Product semantics for stock, views, sources, and credits.
- [ADR-006: Evolve the Local JSON Aggregate with Revisions and Migrations](adrs/adr-006.md) — Credits persist in schema-v2 snapshots.
- [ADR-008: Generate Trees and Consolidation from One Pure Planning Snapshot](adrs/adr-008.md) — Primary calculation architecture.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — Domain/integration/performance test strategy.

## Deliverables

- Pure planning engine with objective trees, deterministic priority allocation, and diagnostics.
- Exact consolidated projection, source resolution, estimates, and duration formatting.
- Atomic candidate completion-credit creation and reversal.
- Deterministic large-plan fixture meeting the approved performance/limit contract.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [ ] UT-022, UT-023, UT-024, UT-025, UT-026, UT-027, UT-028, UT-029, UT-030, UT-031, UT-032, UT-033, UT-034, UT-035, UT-036, UT-037, UT-038, UT-039, UT-040, UT-041, UT-051, UT-052 — objectives, allocation, trees, consolidation, diagnostics, sources, estimates, credits, formatting, and limits.
- [ ] IT-011, IT-012, IT-021 — composed plan, repository-backed completion transaction, and scale/performance flow.

## Success Criteria

- Every assigned test case implemented and passing.
- Trees and consolidated rows reconcile exactly for every deterministic fixture.
- No unit of global stock can be allocated twice.
- Invalid branches remain diagnostic while valid siblings complete.
- The 20,000-node fixture and search/planning composition meet the 500 ms contract.
