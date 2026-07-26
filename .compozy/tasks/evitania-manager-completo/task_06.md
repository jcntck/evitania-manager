---
status: completed
title: "Planner renderer, navigation, accessibility, and scale"
type: frontend
complexity: critical
---

# Task 6: Planner renderer, navigation, accessibility, and scale

## Overview

Deliver the complete planner experience over the single immutable planning result:
ordered objectives, causal trees, consolidated work, global stock, completion
credits, sources, rates, and estimates. This slice finishes renderer
modularization with ordered navigation, accessible states, responsive behavior,
and the packaged scale journey.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. Planner views MUST consume only Task 3 `PlanningResult`; no parallel calculation or allocation logic may exist in the renderer.
2. Objective CRUD/completion and keyboard move-up/down ordering MUST preserve unique priority and immediately reflect stock reallocation.
3. Tree/consolidated switching MUST preserve plan/draft state and MUST display exactly reconciled values.
4. Trees MUST use semantic collapsible structures, stable causal path IDs, distinct repeated paths, and branch-local diagnostics.
5. Consolidated controls MUST edit global stock, credits, source, rates, and Loot Quantity with explicit zero/complete/remaining/unresolved/limit states.
6. Completion and undo MUST use exact Task 3 credit transitions, prevent in-flight repetition, persist, and surface typed failures.
7. Duration/value presentation MUST preserve positive values and expose complete long content.
8. Navigation MUST emphasize Planner and order the CRUD subsection exactly as the PRD while remaining keyboard/narrow-window/enlarged-text operable.
9. Status and category MUST remain understandable without color or images; every control MUST have semantic roles/labels/focus.
10. Large-plan rendering MUST remain correct at 5,000 records, 50 objectives, and 20,000 nodes with approved operations within 500 ms.
11. Shared visual conventions SHOULD preserve the existing restrained medieval identity.
</requirements>

## Subtasks

- [x] 6.1 Deliver ordered modular navigation, active state, responsive layout, and keyboard behavior.
- [x] 6.2 Deliver objective creation/edit/removal/completion and accessible priority ordering.
- [x] 6.3 Deliver stable switching between per-objective trees and consolidated work.
- [x] 6.4 Deliver semantic collapsible trees with allocation, needs, causal paths, and diagnostics.
- [x] 6.5 Deliver scalable consolidated search/list with stock, completion credit, and exact undo.
- [x] 6.6 Deliver persistent source/rate/loot controls and estimate presentation.
- [x] 6.7 Deliver explicit empty/complete/remaining/unresolved/limit states and visual hierarchy.
- [x] 6.8 Complete responsive accessibility, focus, long-content, and keyboard-only journeys.
- [x] 6.9 Integrate planner actions with AppStore serialized persistence without domain-rule duplication.
- [x] 6.10 Implement every assigned DOM/E2E and packaged scale journey.

## Implementation Details

Follow TechSpec “Planning Pipeline”, “Completion Transactions”, and “Renderer
Architecture”. Keyboard move controls are normative; drag-and-drop is optional.
Collapsed branches render on demand and consolidated windowing must retain an
accessible total count/search.

### Relevant Files

- `src/renderer/app.ts` — current planner/navigation/table implementation to replace.
- `src/renderer/index.html` — composition roots and semantic navigation.
- `src/renderer/styles.css` — current hierarchy/responsiveness requiring tree/focus/state extensions.
- `src/renderer/store/app-store.ts` — sole state/action/effect owner.
- `src/domain/planning-engine.ts`, `src/domain/plan-consolidator.ts`, and `src/domain/estimate-calculator.ts` — single result source.
- `src/domain/planning-result.ts` — immutable tree/consolidated contracts.
- `src/shared/desktop-api.ts` — persisted snapshot actions and errors.
- `package.json` and E2E/performance configuration — packaged journey harness.

Expected new modules live under `src/renderer/planner/`,
`src/renderer/navigation/`, shared status/formatter components, and relevant DOM/
Playwright fixtures.

### Dependent Files

- `src/renderer/catalog/*` and `src/renderer/components/*` — Task 5 conventions reused here.
- `src/domain/completion-service.ts` — exact credit transitions.
- `src/preload/preload.ts` and `src/controllers/app-controller.ts` — save/reload boundary.
- `package.json`, Electron builder configuration, and release workflow — Task 7 packages the completed UI.

### Related ADRs

- [ADR-003: Combine Objective Trees with a Consolidated Priority Plan](adrs/adr-003.md) — Planner product semantics.
- [ADR-007: Modularize the Renderer without a UI Framework](adrs/adr-007.md) — Native-DOM module architecture.
- [ADR-008: Generate Trees and Consolidation from One Pure Planning Snapshot](adrs/adr-008.md) — Single planning result and limits.
- [ADR-009: Keep the Preload Contract Snapshot-Based and Result-Typed](adrs/adr-009.md) — Persisted planner actions.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — DOM, E2E, and performance strategy.

## Deliverables

- Ordered accessible navigation and complete modular planner UI.
- Objective trees and consolidated view reconciled to one `PlanningResult`.
- Stock, priorities, credits, sources, rates, estimates, and typed diagnostics.
- Responsive/non-color visual hierarchy and bounded large-plan rendering.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [x] UT-046, UT-047 — explicit renderer states and semantic keyboard/focus/non-color behavior.
- [x] E2E-001, E2E-007, E2E-008, E2E-009, E2E-011 — first-use persistence, full planner, stock/credits, accessibility, and packaged scale journeys.

## Success Criteria

- Every assigned test case implemented and passing.
- Both views reconcile with the same immutable planning result.
- Reordering never double-counts stock and completion credits persist/reverse exactly.
- Full navigation and planning workflow operates by keyboard at narrow/enlarged layouts.
- The 5,000/50/20,000 packaged fixture remains correct and meets the 500 ms contract.
