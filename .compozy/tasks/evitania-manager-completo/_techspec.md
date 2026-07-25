# Technical Specification: Complete Evitania Manager

## Executive Summary

The implementation evolves the existing Electron and TypeScript application
without adding a renderer framework or database engine. The main process remains
the trust boundary; a frozen preload API exchanges validated, revisioned snapshots
with a versioned JSON repository. Incremental migrations preserve v0.2.3 data,
first-run data comes from a build-time compiled seed, and atomic compare-and-swap
writes prevent stale renderers from silently overwriting current state.

The domain is reorganized around a pure planning pipeline that emits both
per-objective trees and their consolidated projection from one calculation.
The native-DOM renderer is split into testable view modules backed by an
application store and nested draft stack. The design preserves the existing
security posture while adding exact IPC errors, safe asset lifecycle management,
four-level automated coverage, and `.deb`/NSIS release validation.

## System Architecture

### Component Overview

| Component | Location | Responsibility | Story mapping |
|---|---|---|---|
| Bootstrap/composition root | `src/main/main.ts` | Single-instance lock, secure window, protocol, concrete dependency wiring | US-002, US-024, US-026 |
| Desktop IPC handlers | `src/main/ipc-handlers.ts` | Exact payload validation and typed mapping for four allowlisted operations | US-002, US-003, US-024 |
| Preload bridge | `src/preload/preload.ts`, `src/shared/desktop-api.ts` | Frozen renderer-facing `DesktopApi`; no raw Electron capabilities | US-002, US-003, US-024 |
| Domain schema | `src/shared/domain.ts`, `src/domain/app-data-validator.ts` | Version-independent application entities, invariants, stable IDs | US-004–US-009, US-011, US-014–US-016, US-022 |
| Storage schema/migrations | `src/infrastructure/storage-schema.ts`, `src/infrastructure/migrations/*` | Envelope validation and sequential migration to current schema | US-001, US-014, US-015, US-022 |
| Snapshot repository | `src/infrastructure/json-app-repository.ts` | Load/recover/seed and atomic revision-controlled save | US-001, US-002, US-014, US-015, US-022 |
| Seed compiler/runtime loader | `scripts/compile-seed.mjs`, `assets/seed/seed-v2.json`, `src/infrastructure/seed-loader.ts` | Deterministic XLSX normalization at development time; first-use seed load | US-001 |
| Managed image library | `src/infrastructure/image-library.ts` | Bounded validation, atomic import, safe URL resolution, orphan collection | US-003, US-024 |
| Catalog service | `src/domain/catalog-service.ts` | CRUD invariants, reference index, duplicate checks, cycle validation | US-004–US-010, US-022 |
| Planning engine | `src/domain/planning-engine.ts` | Priority allocation and immutable objective trees | US-011, US-012, US-014, US-022 |
| Plan consolidator | `src/domain/plan-consolidator.ts` | Consolidated rows derived exclusively from objective plans | US-013, US-015 |
| Estimate calculator | `src/domain/estimate-calculator.ts` | Gathering, drop, boss, and smelting formulas/diagnostics | US-016–US-020 |
| Application store | `src/renderer/store/app-store.ts` | Immutable renderer state, actions, revision, save/reload coordination | US-001, US-002, US-011–US-016, US-023 |
| Catalog UI modules | `src/renderer/catalog/*`, `src/renderer/components/relation-picker.ts`, `src/renderer/components/modal-stack.ts` | Lists, scalable search, nested drafts, multiselect, image workflow | US-003–US-010, US-021, US-023 |
| Planner UI modules | `src/renderer/planner/*` | Objective ordering, tree, consolidated view, stock, sources, rates | US-011–US-021 |
| Shared renderer utilities | `src/renderer/components/*`, `src/renderer/formatters/*` | Typed view lifecycle, focus, messages, duration/number presentation | US-007, US-010, US-017–US-023 |
| Release pipeline | `package.json`, `scripts/release*`, `.github/workflows/release.yml` | Validation, three-tag publication, `.deb`/NSIS ZIPs, metadata and evidence | US-025, US-026 |

### Data Flow

1. Main obtains the single-instance lock, constructs repository/image services,
   registers the `asset:` handler and typed IPC handlers, then opens the sandboxed window.
2. Renderer calls `DesktopApi.load()`. The repository validates the primary,
   recovers from backup if necessary, migrates old schemas, or applies packaged
   seed data only when both files are absent.
3. `AppStore` owns the returned immutable snapshot and revision. UI modules emit
   typed actions; the store validates a candidate state through domain services.
4. `PlanningEngine` consumes the candidate domain snapshot and returns one
   immutable `PlanningResult` containing trees, allocation, consolidated rows,
   estimates, and branch diagnostics.
5. Save sends the complete snapshot plus expected revision. Main validates exact
   IPC shape and domain invariants; repository atomically commits or returns
   `revision_conflict`.
6. After a successful commit, `ImageLibrary.collectOrphans()` deletes only managed
   assets absent from all committed image references. Failed saves never trigger GC.

No network or external service participates in runtime behavior.

`BrowserWindow` explicitly uses `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: true`. The packaged renderer applies a
restrictive Content Security Policy that permits only bundled scripts/styles and
the allowlisted managed-asset protocol. Bootstrap calls
`app.requestSingleInstanceLock()` before constructing any repository or window;
failure focuses the existing instance and exits without reading or writing data.

## Implementation Design

### Core Interfaces

#### Renderer trust boundary

```ts
export type DesktopApi = Readonly<{
  load(): Promise<Result<VersionedSnapshot, DesktopError>>;
  save(input: SaveSnapshotInput): Promise<Result<SaveSnapshotOutput, DesktopError>>;
  importImage(input: ImportImageInput): Promise<Result<ManagedImage, DesktopError>>;
  openDataDirectory(): Promise<Result<void, DesktopError>>;
}>;
```

#### Revisioned repository

```ts
export interface AppRepository {
  load(): Promise<LoadOutcome>;
  save(input: {
    expectedRevision: number;
    data: AppData;
  }): Promise<Result<VersionedSnapshot, RepositoryError>>;
}
```

#### Pure planning boundary

```ts
export interface PlanningEngine {
  calculate(input: {
    catalog: Catalog;
    planning: Planning;
    limits: PlanningLimits;
  }): PlanningResult;
}
```

#### Renderer module contract

```ts
export interface ViewModule<State> {
  mount(root: HTMLElement, dispatch: Dispatch): void;
  render(state: Readonly<State>): void;
  unmount(): void;
}
```

### Error Conventions

All bridge responses use `{ ok: true, value }` or
`{ ok: false, error: { code, message, details? } }`. Main maps internal errors to
this closed code set:

- `invalid_request` — exact IPC shape, size, category, or domain validation failed.
- `revision_conflict` — persisted revision differs from `expectedRevision`.
- `data_corrupt` — primary and backup exist but neither can be validated/recovered.
- `migration_failed` — a known source schema could not migrate safely.
- `storage_unavailable` — directory, read, sync, rename, or permission failure.
- `image_invalid` — format, signature, size, dimensions, or category failure.
- `native_action_failed` — OS dialog or folder reveal failed.
- `calculation_limit` — plan exceeded the configured safe node bound.

User messages are localized in the renderer from error codes. Native exception
messages and paths are logged locally but never injected as HTML.

### Data Models

#### Storage envelope

```ts
type StorageEnvelope = {
  schemaVersion: 2;
  revision: number;
  writtenAt: string;
  data: AppData;
};
```

`writtenAt` is diagnostic metadata, not conflict ordering. `revision` starts at
one for seed/empty initialization and increments exactly once per successful save.

#### Domain changes from v0.2.3

```ts
type Goal = {
  id: string;
  productId: string;
  quantity: number;
  completed: boolean;
  priority: number;
};

type CompletionCredit = {
  id: string;
  entityId: string;
  quantity: number;
  createdAt: string;
  reversedAt?: string;
};
```

`Planning` contains `goals`, `stock`, `gatherRates`, `killRates`,
`lootQuantity`, `selectedSources`, and `completionCredits`. The obsolete
`completedEntities` map exists only in schema v1 input. Active completion credits
are already represented in migrated stock; calculation never adds credits again.

Catalog identity remains string UUIDs. Product kind is normalized to
`recipe | smelting`; migration maps legacy `smeltery` to `smelting`.
Component, objective, stock, credit, rate, numerator, denominator, act, image,
reference, and cycle invariants follow PRD “Business Rules”.

#### Planning result

```ts
type PlanningResult = {
  objectives: ObjectivePlan[];
  consolidated: ConsolidatedNeed[];
  remainingStock: Record<string, number>;
  diagnostics: PlanDiagnostic[];
  nodeCount: number;
};
```

Each `PlanNode` contains a stable calculation-path ID, entity ID, category,
required, allocated stock, missing, child nodes, selected source, estimate, and
zero or more typed diagnostics. `ConsolidatedNeed` sums node requirements and
allocations by entity ID and retains contributing objective/path IDs.

#### Search index and drafts

Relation search builds an in-memory normalized-name index whenever catalog
revision changes. It returns stable IDs, displays names, keeps already selected
values visible, and caps rendered results without truncating the underlying
selection. `ModalStack` stores typed parent/child drafts in memory. Only the
final validated aggregate persists; cancelled drafts never mutate `AppData`.

### Storage Load and Migration Algorithm

1. Ensure the user-data directory exists.
2. Read primary if present; parse, validate envelope, and migrate sequentially.
3. If primary fails, read and validate backup. Return it with a recovery notice
   and restore a new primary only through the atomic writer.
4. If neither file exists, load and validate packaged `seed-v2.json`; if seed is
   absent/invalid, initialize a valid empty schema-v2 snapshot and expose a notice.
5. If files exist but primary and backup are invalid, return `data_corrupt`; never
   replace them with empty or seed data.
6. Migration v1→v2 normalizes kinds, adds goal priority by original array order,
   validates every reference, adds each nonnegative `completedEntities` value to
   stock, creates an active credit with the same value when positive, and removes
   the legacy field. Invalid legacy entities cause `migration_failed` rather than
   selective silent deletion.

### Atomic Save and Conflict Algorithm

1. Acquire the repository's in-process write mutex.
2. Re-read and validate the persisted revision.
3. If it differs from `expectedRevision`, return `revision_conflict` without writes.
4. Validate the entire candidate domain and serialize the next envelope.
5. Write to a unique same-directory temporary file; flush file contents.
6. Copy the current validated primary to a temporary backup and atomically replace
   the backup; first save may omit this step.
7. Atomically rename the new temporary file over primary and sync the directory
   where supported.
8. Return the committed snapshot with incremented revision.
9. Clean temporary files best-effort after errors; never delete primary or backup
   as error cleanup.

The main process prevents a normal second application process with Electron's
single-instance lock. CAS still covers stale renderer state and external file replacement.

### Catalog Validation and Mutation

`CatalogService` exposes pure candidate builders rather than persisting commands.
It builds a reverse-reference index covering resources, products, drops, goals,
stock, sources, and credits. Deletion returns `referenced_entity` with typed
references. Product save constructs the full directed product graph and returns
`production_cycle` with the exact ordered cycle. Drop/component uniqueness uses
entity ID, not display name. All count fields use safe integers; rates use finite
nonnegative numbers and must be positive before time calculation.

### Image Import and Collection

- Main accepts only six explicit module categories.
- Read at most 10 MiB; reject larger files before full buffering where possible.
- Validate `.png`, `.jpg`, or `.jpeg`, magic bytes, and decoded dimensions from
  1×1 through 8192×8192.
- Re-encode accepted images to strip nonessential metadata, naming output with a
  generated UUID and normalized `.png` or `.jpg` extension.
- Write through a unique temporary file and atomic rename inside
  `userData/assets/<category>/`.
- `asset:` parsing rejects credentials, query/fragment data, encoded separators,
  unknown categories, non-UUID names, and resolved paths outside the asset root.
- After a successful snapshot save, collect references from committed data and
  remove only allowlisted managed files not referenced by any entity. Failed
  deletion is logged and retried after a later successful save; it does not fail
  the already committed domain save.

### Seed Compilation

`npm run seed:compile` reads the four workbook sheets and embedded images from
`docs/base-cadastro.xlsx`, maps only explicitly supported columns, normalizes
names/acts/rates/relations, assigns deterministic content-derived IDs, and passes
the complete result through the schema-v2 validator. It writes:

- `assets/seed/seed-v2.json` with revision metadata removed from deterministic content.
- `assets/seed/assets/<module>/...` for accepted managed images.
- `artifacts/seed-rejections.json` with sheet, row, field, reason, and redacted value.

The same source produces byte-identical seed JSON across repeated runs. A release
fails if the checked-in seed differs from regenerated output or the rejection
report contains a newly unreviewed reason class. Runtime never reads XLSX and
never reapplies a newer seed to existing data.

### Planning Pipeline

1. Validate inputs and build entity/product/source indexes.
2. Stable-sort pending goals by unique integer `priority`, then original position
   as a deterministic migration fallback.
3. Copy stock into `remainingStock`.
4. For each goal, recursively build a tree:
   - record required output;
   - allocate `min(required, remainingStock[entityId])`;
   - decrement only that copied balance;
   - expand only missing product output by safe-integer component multiplication;
   - detect cycles against the current path and attach a diagnostic;
   - attach missing/stale relation diagnostics and continue sibling branches;
   - stop further expansion at 20,000 total nodes with `calculation_limit`.
5. Consolidate all nodes by entity ID, summing required, allocated, and missing
   values with safe-integer overflow checks.
6. Resolve one selected source per raw item. Auto-select the sole valid source;
   require a persisted selection when several exist; never sum sources.
7. Calculate estimates through pure functions using the exact PRD formulas.

JavaScript `Math.round` is the canonical nearest-integer denominator rule,
including `.5` boundaries. Expected values remain full-precision finite numbers;
formatters round only presentation.

### Completion Transactions

Completing a consolidated need creates one UUID credit for its current positive
missing amount and increments that entity's stock by the same amount in one
candidate snapshot. Repeated UI submission is disabled by operation ID until save
returns. Undo verifies the credit is active and current stock is at least the
credit quantity, decrements stock, and stamps `reversedAt`. A failed or conflicting
save leaves the renderer on the previous committed snapshot.

### Renderer Architecture

- `AppStore` is the only owner of committed snapshot, revision, drafts, current
  page, planner view, selection/focus tokens, operation states, and notices.
- Reducers produce candidate immutable state. Domain validation and planning run
  before render; persistence effects are serialized.
- A save success replaces committed state/revision and then triggers asset GC in
  main. A conflict preserves the local candidate as a recoverable draft, disables
  further saves, and presents “Reload current data”; reload discards the conflicting
  candidate only after explicit user action.
- `ModalStack` supports parent and inline-child drafts. It restores focus to the
  opening relation control on cancel or to the newly selected result on success.
- `RelationPicker` uses debounced in-memory search, keyboard listbox semantics,
  multiselect for product components, and individual integer quantity controls.
- `ObjectiveList` uses keyboard-accessible move-up/down controls as the normative
  ordering path. Pointer drag-and-drop may supplement but never replace them.
- `PlannerTree` uses nested semantic lists/buttons and renders collapsed branches
  on demand. `ConsolidatedTable` may window visible rows at scale while preserving
  screen-reader-accessible count and search.
- All text interpolation uses `textContent` or trusted DOM construction; catalog
  values never enter `innerHTML`.

### Desktop IPC Messages

This product has no HTTP endpoints. The four allowlisted IPC request/response
messages are its API surface:

| Channel | Request | Success | Failure codes |
|---|---|---|---|
| `app:load` | no arguments | `VersionedSnapshot` plus optional recovery notice | `data_corrupt`, `migration_failed`, `storage_unavailable` |
| `app:save` | `{ expectedRevision, data }` exact object | committed `VersionedSnapshot` | `invalid_request`, `revision_conflict`, `storage_unavailable` |
| `image:import` | `{ category }`; native chooser supplies path | managed `asset://` reference or `null` on cancel | `invalid_request`, `image_invalid`, `storage_unavailable` |
| `folder:open` | no arguments | `void` | `native_action_failed` |

Payload schemas reject unknown keys. `app:save` collection counts are bounded to
5,000 catalog records, 50 active goals, and 20,000 component/drop relations for
IPC admission; calculation independently enforces the 20,000-node expansion limit.

## Integration Points

### Operating System

Electron integrates with native file dialogs, user-data paths, folder reveal,
single-instance locking, application/window icons, and package installers. No
authentication exists. Native failures map to allowlisted error codes and do not
change committed application state.

### Build and Release Infrastructure

GitHub Actions is the only external integration. It consumes repository source
and environment-provided signing credentials, builds on Linux and Windows, and
publishes GitHub releases. Runtime contains no GitHub integration.

The release contract uses:

- Source tag `<version>`.
- Linux tag `<version>-linux` with `.deb`, ZIP containing the `.deb`, checksums,
  CycloneDX SBOM, and supported provenance attestation.
- Windows tag `<version>-windows` with NSIS `.exe`, ZIP containing the installer,
  checksums, SBOM, and supported provenance attestation.
- A main source release that references both successful platform releases.

The publication script validates semantic version, clean worktree, authorized
branch, matching package version, nonexisting tags, locked install, full tests,
typecheck, audit, seed reproducibility, platform builds, artifact inventory,
SHA-256 checksums, and SBOM before pushing any tag. CI actions remain pinned to
immutable commits and jobs use minimum permissions.

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|---|---|---|---|
| `src/shared/domain.ts` | modified | Schema v2 adds priorities/credits and normalizes smelting kind; high migration risk | Define current types separately from storage v1 |
| `src/domain/planner.ts` | replaced | Current consolidated-only traversal cannot reconcile trees; high calculation risk | Replace with engine, consolidator, estimator |
| Validator | modified | Must enforce complete referential and numeric invariants | Split structural envelope and domain graph validation |
| JSON repository | modified | Adds recovery, migration, revision CAS, fault-safe backup | Implement atomic writer and injected filesystem boundary |
| App controller | modified | Full snapshot result typing and save serialization | Return discriminated results; no thrown details across IPC |
| Image library | modified | Strict containment, bounds, re-encoding, GC | Add image decoder boundary and referenced-asset collection |
| Main/preload API | modified | Typed exact IPC shapes and single-instance lock | Centralize channels/schemas and freeze bridge |
| Renderer | replaced internally | Monolith becomes modules/store while preserving native DOM | Migrate page by page to module roots |
| Seed assets/scripts | new | Deterministic workbook compiler and packaged seed | Add compiler, fixture, rejection report, reproducibility gate |
| Tests | modified/new | Four-level contract replaces sparse unit coverage | Implement cases assigned from `_tests.md` |
| Packaging | modified | AppImage removed; `.deb` and platform ZIPs added | Update builder targets, inventory, attestation patterns |
| Release workflow | modified | Three tags/releases and cross-platform evidence | Split platform publication and source aggregation |

## Testing Approach

- **Unit**: Vitest Node covers migrations, validation, catalog graph operations,
  planning/allocation/consolidation/estimates, repository decision logic with an
  injected filesystem, formatters, reducers, and payload schemas. Fakes exist
  only at filesystem, clock, UUID, dialog, shell, and image-decoder boundaries.
- **Renderer DOM**: Vitest with `happy-dom` covers semantic rendering, keyboard
  behavior, nested drafts, focus restoration, search/multiselect, conflict/reload,
  tree collapse, and non-color status labels.
- **Integration**: Vitest uses real temporary directories and actual main service
  composition for load/migrate/recover/save/assets/IPC. Fault injection wraps
  specific filesystem operations; domain collaborators remain real.
- **E2E**: Playwright launches packaged Electron smoke builds in Linux and Windows
  CI, uses isolated user-data directories, creates/edits catalog data and a plan,
  restarts to verify persistence, exercises folder/image operations with platform
  adapters, and inspects packaged metadata/icons.
- **Release**: Script tests run against temporary Git repositories and fixture
  artifact directories. Platform jobs inspect `.deb`, `.exe`, ZIP members,
  checksums, SBOM, and attestation inputs.
- **Performance**: A deterministic fixture with 5,000 catalog records, 50 active
  goals, and 20,000 expanded nodes measures normalized relation search and
  `PlanningEngine.calculate`; each must finish within 500 ms in the pinned CI
  Node environment after one warm-up, using the median of five runs.

Every concrete case and story/edge mapping is canonical in `_tests.md`.

## Development Sequencing

### Build Order

1. **Current schema, result/error primitives, and fixtures** — no feature dependencies.
2. **Storage v1 parser, v2 validator, migration, and seed compiler** — depends on schema.
3. **Atomic revisioned repository and recovery** — depends on storage validation/migration.
4. **Catalog reference/cycle service and image hardening** — depends on current schema.
5. **Pure planning engine, consolidation, and estimates** — depends on catalog service.
6. **Typed controller, IPC schemas, main handlers, and preload** — depends on repository/assets.
7. **Application store and renderer module conventions** — depends on bridge/domain results.
8. **Catalog modules, relation picker, modal stack, and managed image UX** — depends on store.
9. **Objective, tree, consolidated, stock, completion, source, and estimate modules** —
   depends on planning engine and store.
10. **Navigation, accessibility, visual hierarchy, and performance rendering** —
    depends on all view modules.
11. **`.deb`/NSIS packaging, ZIP/evidence generation, and three-tag release workflow** —
    depends on stable build and metadata.
12. **Full contract verification and packaged E2E** — depends on all preceding components.

### Technical Dependencies

- Add development dependencies for XLSX extraction, DOM testing, and Playwright
  Electron support; pin exact versions in `package-lock.json`.
- The seed compiler must document the workbook column mapping before seed output
  can be accepted.
- Linux CI needs tools to inspect `.deb`; Windows CI needs installer metadata
  inspection. Effective signing remains conditional on supplied credentials.
- Google Drive availability is not a dependency; synchronization stays disabled.

## Monitoring and Observability

The offline application has no telemetry or remote alerting. It writes bounded,
structured local diagnostic events under the user-data directory:

- `app_start`, `load_primary`, `load_backup`, `seed_initialized`, `migration`,
  `save_committed`, `save_conflict`, `save_failed`, `image_import_rejected`,
  `asset_gc_failed`, `planning_limit`, and `native_action_failed`.
- Common fields: ISO timestamp, event, schema version, revision, operation ID,
  error code, entity/category counts, duration milliseconds, and platform.
- Logs never contain catalog names, stock values, source paths, image bytes,
  secrets, tokens, or native exception stacks in renderer-visible output.
- Rotate at 1 MiB, retain three files, and tolerate logging failure without
  blocking domain operations.
- A local `planning_limit`, `data_corrupt`, or repeated `save_conflict` is surfaced
  immediately in the UI. There is no external escalation channel.

Release jobs publish duration and artifact inventory in job summaries and fail
on missing artifacts, checksum/SBOM mismatch, unsupported tag topology, or
metadata/icon inspection failure.

## Technical Considerations

### Key Decisions

- **Versioned JSON over SQLite**: preserves the local aggregate and avoids native
  database packaging; gives up granular storage transactions.
- **Native DOM modules over React/Lit**: preserves the stack and adds explicit
  boundaries; gives up framework lifecycle/state tooling.
- **Revisioned full snapshots over granular IPC commands**: minimizes attack
  surface and duplicate rules; serializes the full bounded aggregate.
- **One pure planner result over separate view calculators**: guarantees
  reconciliation; retains an in-memory tree for the current snapshot.
- **Build-time seed over runtime XLSX**: deterministic first launch; seed changes
  require an explicit development workflow.
- **Safe automatic orphan GC over indefinite retention**: bounds storage; deletion
  must happen only after committed reference analysis.
- **DOM plus packaged smoke coverage**: catches trust-boundary and distribution
  failures; adds platform CI cost.

### Known Risks

- **Migration data loss (medium/high impact)**: retain v1 fixture corpus, never
  mutate source files during migration, and require round-trip assertions.
- **Atomic replacement differences (medium/high impact)**: same-directory writes,
  explicit flush, recovery-order integration tests on both platforms.
- **Large aggregate serialization (low/medium impact)**: admission bounds and
  500 ms performance contract; profile before changing storage technology.
- **Renderer convention drift (medium impact)**: land store/module interfaces and
  DOM test harness before feature modules.
- **Asset deletion race (medium impact)**: GC reads only the committed snapshot
  and runs inside the serialized post-save queue.
- **Workbook ambiguity (high likelihood/low runtime impact)**: deterministic
  rejection report; never infer missing relations.
- **Packaged smoke flakiness (medium likelihood)**: isolated user data, no network,
  platform-specific adapters, artifact inspection before launch.

## Architecture Decision Records

- [ADR-001: Treat `.ai/` as the Product Baseline](adrs/adr-001.md) — Source requirements supersede conflicting v0.2.3 behavior.
- [ADR-002: Use Scalable Relational Selection with Inline Creation](adrs/adr-002.md) — Relationship UX supports growth and nested creation.
- [ADR-003: Combine Objective Trees with a Consolidated Priority Plan](adrs/adr-003.md) — Trees and consolidated work share ordered global stock.
- [ADR-004: Keep User Data and Managed Assets Local-First](adrs/adr-004.md) — Runtime data and assets remain offline in user data.
- [ADR-005: Distribute Linux Releases as Debian Packages](adrs/adr-005.md) — Linux publishes `.deb`, not AppImage.
- [ADR-006: Evolve the Local JSON Aggregate with Revisions and Migrations](adrs/adr-006.md) — Storage uses schema migrations, recovery, atomic CAS, and seed-once.
- [ADR-007: Modularize the Renderer without a UI Framework](adrs/adr-007.md) — Native DOM modules and a store replace the monolith.
- [ADR-008: Generate Trees and Consolidation from One Pure Planning Snapshot](adrs/adr-008.md) — A deterministic engine produces both views.
- [ADR-009: Keep the Preload Contract Snapshot-Based and Result-Typed](adrs/adr-009.md) — Four exact bridge operations return discriminated results.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — Seed compilation and unit/DOM/integration/E2E coverage are mandatory.
