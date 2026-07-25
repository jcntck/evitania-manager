---
status: pending
title: "Modular catalog renderer and relational editing"
type: frontend
complexity: high
---

# Task 5: Modular catalog renderer and relational editing

## Overview

Replace the catalog portions of the monolithic renderer with native-DOM modules
that consume `AppStore` and `CatalogService`. This slice delivers all catalog
CRUD journeys, searchable relational selection, multiselect quantities, nested
creation drafts, managed-image UX, deterministic focus, and large-catalog behavior.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. Native view modules MUST implement the shared mount/render/unmount contract without a framework or global mutable DOM-query contract.
2. AppStore MUST remain the sole owner of committed snapshot, revision, drafts, focus, operations, and notices.
3. All seven catalog-module CRUD flows MUST use `CatalogService` candidates/errors and MUST NOT duplicate domain rules in views.
4. Relation search MUST normalize case/diacritics, preserve stable IDs/selections, distinguish create action from no results, and meet the 5,000-record/500 ms bound.
5. Relation picker MUST provide keyboard listbox behavior; product components MUST support unique multiselect with independent safe integer quantities.
6. Modal stack MUST preserve parent/child drafts across cancellation and validation failure, select one successful child, and restore deterministic focus.
7. Managed-image UX MUST preview, save, replace, cancel, and remove through `DesktopApi` without losing the previous committed reference on cancellation/failure.
8. Catalog values MUST enter the DOM through trusted construction/text APIs, never untrusted `innerHTML`.
9. Repeated submissions MUST create at most one mutation and cancelled drafts MUST never alter `AppData`.
10. Empty, error, long-name, responsive, and keyboard states SHOULD remain accessible at catalog scale.
</requirements>

## Subtasks

- [ ] 5.1 Establish native view-module/action contracts and reduce `app.ts` to composition.
- [ ] 5.2 Integrate AppStore catalog actions, drafts, focus, notices, and save effects.
- [ ] 5.3 Deliver list/editor modules for items, resources, recipes, smelting, monsters, and bosses.
- [ ] 5.4 Deliver normalized relation search and accessible searchable picker.
- [ ] 5.5 Deliver component multiselect with independent integer quantities.
- [ ] 5.6 Deliver nested modal/draft stack, inline creation, and focus restoration.
- [ ] 5.7 Deliver managed-image preview/replace/cancel/remove UX.
- [ ] 5.8 Adapt semantic roots, dialogs, states, and responsive catalog styling.
- [ ] 5.9 Establish the happy-dom renderer harness and implement every assigned test.

## Implementation Details

Follow TechSpec “Search Index and Drafts” and “Renderer Architecture”. Reuse the
store and DesktopApi from Task 4 and candidate builders from Task 2. Preserve
selected values outside the visual result cap; pagination/windowing must never
truncate the underlying draft.

### Relevant Files

- `src/renderer/app.ts` — current monolith and unsafe string-rendering/query pattern to decompose.
- `src/renderer/index.html` — current content/dialog roots.
- `src/renderer/styles.css` — current catalog/form/dialog responsive styles.
- `src/renderer/window.d.ts` and `src/shared/desktop-api.ts` — Task 4 bridge types.
- `src/shared/domain.ts` — schema-v2 catalog entities.
- `src/domain/catalog-service.ts` — Task 2 candidates and field errors.
- `src/renderer/store/app-store.ts` — Task 4 state/effect boundary.
- `vite.config.ts`, `vitest.config.ts`, `tsconfig.renderer.json`, and `package.json` — DOM test/build configuration.

Expected new modules live under `src/renderer/catalog/`,
`src/renderer/components/`, and `test/renderer/`; combine entity editors where
cohesive instead of creating artificial layers.

### Dependent Files

- `src/infrastructure/image-library.ts` — managed image lifecycle behind DesktopApi.
- `src/controllers/app-controller.ts` — persists validated aggregate snapshots.
- `src/renderer/planner/*` — later reuses view/store/notice/focus conventions.
- `src/renderer/navigation/*` — later completes ordered global navigation.
- E2E configuration/fixtures — later reused by planner and release tasks.

### Related ADRs

- [ADR-002: Use Scalable Relational Selection with Inline Creation](adrs/adr-002.md) — Primary relation/draft behavior.
- [ADR-004: Keep User Data and Managed Assets Local-First](adrs/adr-004.md) — Managed-image UX.
- [ADR-007: Modularize the Renderer without a UI Framework](adrs/adr-007.md) — Primary renderer architecture.
- [ADR-009: Keep the Preload Contract Snapshot-Based and Result-Typed](adrs/adr-009.md) — Store/bridge interaction.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — happy-dom and E2E coverage.

## Deliverables

- Modular native-DOM catalog composition for every CRUD module.
- Searchable accessible relation picker, multiselect quantities, and inline creation.
- Typed nested drafts, deterministic focus, and safe managed-image flows.
- DOM/E2E harness and scale behavior for 5,000 catalog records.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [ ] UT-042, UT-043, UT-044, UT-050 — normalized relation search, multiselect, modal drafts/focus, and scale.
- [ ] IT-016, IT-020 — mounted nested editor flow and 5,000-record relation/catalog behavior.
- [ ] E2E-003, E2E-004, E2E-005, E2E-006 — managed images, catalog relationships, recipe/smelting cycles, and inline creation journeys.

## Success Criteria

- Every assigned test case implemented and passing.
- Every catalog module uses shared domain candidates and preserves invalid drafts.
- Inline creation returns one selected dependency without losing parent state.
- Relation search remains correct and within 500 ms at 5,000 records.
- Catalog UI is keyboard-operable and does not interpolate catalog values as HTML.
