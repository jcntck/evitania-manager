---
status: completed
title: "Desktop trust boundary, managed images, IPC, and application store"
type: backend
complexity: critical
---

# Task 4: Desktop trust boundary, managed images, IPC, and application store

## Overview

Deliver the secure cross-process contract that connects the revisioned repository
to a renderer-owned application store. This slice also completes managed-image
validation and lifecycle, native folder behavior, single-instance/security
bootstrap, save serialization, and user-recoverable revision conflicts.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. The frozen `DesktopApi` MUST expose exactly load, revisioned snapshot save, managed-image import, and data-directory reveal.
2. Main-process IPC MUST validate exact payload shapes and configured collection limits before invoking domain/native behavior.
3. Every operation MUST return a discriminated result with the closed TechSpec error codes and MUST NOT expose paths, stacks, channels, or raw Electron/Node capabilities.
4. Bootstrap MUST obtain the single-instance lock before data/window creation and preserve `contextIsolation`, disabled `nodeIntegration`, sandbox, CSP, and offline execution.
5. Image import MUST enforce the six categories, format/content/size/dimension bounds, re-encoding, generated names, and atomic managed writes.
6. Managed `asset:` resolution MUST enforce strict parsing and root containment for every request.
7. Orphan collection MUST run only after a committed save, preserve referenced/shared images, and retry logged deletion failures without reverting domain data.
8. `AppStore` MUST own committed snapshot/revision, candidate drafts, page/view/focus/operations/notices and MUST serialize save/reload effects.
9. Revision conflict MUST preserve a recoverable candidate, block further saves, and discard it only after explicit reload.
10. Operation guards MUST deduplicate in-flight submissions and allow retry only after typed failure.
11. Data-directory failure MUST surface as `native_action_failed`; synchronization MUST remain disabled and offline.
12. Native/dialog/shell/decoder/filesystem boundaries SHOULD remain injectable and diagnostic logging SHOULD redact user data.
</requirements>

## Subtasks

- [x] 4.1 Define closed desktop results, errors, versioned snapshot inputs, and frozen API.
- [x] 4.2 Deliver exact IPC schemas, allowlisted handlers, and typed controller mapping.
- [x] 4.3 Deliver single-instance secure bootstrap and constrained window/protocol lifecycle.
- [x] 4.4 Harden image validation/import, asset resolution, and atomic managed storage.
- [x] 4.5 Deliver post-commit reference analysis and safe orphan collection.
- [x] 4.6 Deliver data-directory service and actionable native failure mapping.
- [x] 4.7 Deliver immutable AppStore, actions/reducers, effect queue, conflict/reload, and operation guard.
- [x] 4.8 Deliver bounded redacted local diagnostics for desktop/storage/image events.
- [x] 4.9 Update preload/global renderer types and existing bootstrap consumers.
- [x] 4.10 Implement every assigned unit, integration, and E2E test.

## Implementation Details

Follow TechSpec “Core Interfaces”, “Error Conventions”, “Image Import and
Collection”, “Renderer Architecture”, and “Desktop IPC Messages”. `AppStore` is
included here because its effect queue and conflict semantics form one contract
with snapshot IPC. Catalog and planner views consume it in later tasks.

### Relevant Files

- `src/main/main.ts` — current combined bootstrap/handlers/protocol requiring decomposition and instance lock.
- `src/preload/preload.ts` — current throwing mutable bridge requiring frozen result API.
- `src/shared/desktop-api.ts` and `src/renderer/window.d.ts` — cross-process types.
- `src/controllers/app-controller.ts` — current generic validation/save mapping.
- `src/infrastructure/image-library.ts` — current signature/copy implementation without bounds, re-encoding, containment, or GC.
- `src/infrastructure/json-app-repository.ts` — Task 1 CAS/recovery dependency.
- `src/renderer/app.ts` — current save/image/folder consumer.
- `src/renderer/index.html` — CSP and disabled synchronization controls.
- `package.json`, `vite.config.ts`, and `vitest.config.ts` — Electron/DOM/integration harness.

Expected new files include `src/main/ipc-handlers.ts`, exact IPC schemas,
folder/asset services, shared result contracts, `src/renderer/store/app-store.ts`,
and focused unit/integration/E2E fixtures.

### Dependent Files

- `src/renderer/catalog/*` and `src/renderer/components/*` — consume store, image, and save contracts.
- `src/renderer/planner/*` — consumes action serialization and revision conflict behavior.
- `src/domain/catalog-service.ts` — validates renderer candidates before save.
- `src/domain/planning-engine.ts` — supplies immutable calculated results to store.
- `.github/workflows/release.yml` and packaging metadata — later smoke-test secure bootstrap.

### Related ADRs

- [ADR-004: Keep User Data and Managed Assets Local-First](adrs/adr-004.md) — User-data and managed-asset boundary.
- [ADR-006: Evolve the Local JSON Aggregate with Revisions and Migrations](adrs/adr-006.md) — CAS/recovery contract consumed here.
- [ADR-007: Modularize the Renderer without a UI Framework](adrs/adr-007.md) — AppStore and renderer module boundary.
- [ADR-009: Keep the Preload Contract Snapshot-Based and Result-Typed](adrs/adr-009.md) — Primary desktop API decision.

## Deliverables

- Frozen four-operation DesktopApi with exact allowlisted IPC schemas/results.
- Secure single-instance Electron bootstrap and strict managed-asset protocol.
- Bounded atomic image import, post-commit orphan GC, and folder service.
- Immutable AppStore with serialized persistence, conflict/reload, notices, and operation guard.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [x] UT-010, UT-011, UT-012, UT-045, UT-048, UT-049, UT-053, UT-054, UT-055, UT-056 — images, store/effects, native settings, IPC schemas/results, asset and folder security.
- [x] IT-007, IT-008, IT-013, IT-014, IT-015, IT-017 — real image/GC, IPC composition, repeated/ordered store actions, and folder behavior.
- [x] E2E-002, E2E-010 — disabled synchronization/data location and recoverable revision-conflict journeys.

## Success Criteria

- Every assigned test case implemented and passing.
- Renderer cannot access raw Node, filesystem, Electron, channels, or native paths.
- Conflict and repeated-operation scenarios cause no silent overwrite or duplicate mutation.
- Asset imports and GC cannot escape managed roots or remove committed references.
- Existing-instance activation and offline native controls behave consistently on Linux and Windows.
