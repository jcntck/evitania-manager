# Test Specification: Complete Evitania Manager

Canonical test contract for Complete Evitania Manager. Companion to
`_techspec.md`. Derived from `_user_stories.md` and `_techspec.md`.

## Strategy

- **Frameworks and harnesses**: Vitest in Node for domain/storage/release units;
  Vitest with `happy-dom` for renderer modules; real temporary directories for
  repository and asset integrations; Playwright Electron for packaged smoke tests.
  Fakes are limited to filesystem fault points, clock, UUID, image decoder,
  native dialog/shell, and release provider boundaries.
- **Execution**: `npm test` runs unit, DOM, and integration projects;
  `npm run test:e2e` runs platform packaged smoke tests; `npm run test:release`
  runs temporary-repository and artifact inspection cases; `npm run test:perf`
  runs the pinned performance fixture.
- **Conventions**: IDs are permanent. Unit cases state a class. Table-driven cases
  may contain multiple inputs only when they assert the same observable rule.
  Tests use deterministic UUID/clock fixtures and never use network access.

## Coverage Matrix

### Local workspace and images

| Source | Behavior | Unit | Integration | E2E |
|---|---|---|---|---|
| US-001 | Seeded editable first-use workspace persists | UT-001, UT-006 | IT-001, IT-006 | E2E-001 |
| US-001.EC-1 | Missing seed yields usable empty workspace | UT-006 | IT-002 | E2E-001 |
| US-001.EC-2 | Invalid/ambiguous seed rows are omitted and reported | UT-007 | IT-006 | — |
| US-001.EC-3 | Interrupted first initialization is idempotent | UT-008 | IT-003 | — |
| US-001.EC-4 | 100× catalog remains searchable | UT-050 | IT-020 | E2E-011 |
| US-001.EC-5 | Concurrent workspace change cannot silently overwrite | UT-004 | IT-005 | E2E-010 |
| US-002 | Data directory opens and synchronization stays disabled/offline | UT-048 | IT-017 | E2E-002 |
| US-002.EC-1 | Missing data directory is safely recreated or reported | UT-009 | IT-017 | — |
| US-002.EC-2 | Folder reveal denial produces actionable error | UT-048 | IT-017 | E2E-002 |
| US-002.EC-3 | Disabled synchronization cannot be activated | UT-048 | — | E2E-002 |
| US-002.EC-4 | Offline restart restores local state | UT-001 | IT-001 | E2E-001 |
| US-003 | Managed image import/preview/replace/remove lifecycle | UT-010, UT-011 | IT-007, IT-008 | E2E-003 |
| US-003.EC-1 | Non-PNG/JPEG content is rejected without copy | UT-010 | IT-007 | — |
| US-003.EC-2 | Hostile source names cannot choose destination | UT-011 | IT-007 | — |
| US-003.EC-3 | Cancel preserves previous image and draft | UT-044 | IT-016 | E2E-003 |
| US-003.EC-4 | Interrupted image write leaves no partial reference | UT-012 | IT-007 | — |
| US-003.EC-5 | Repeated same-file import cannot overwrite unrelated assets | UT-011 | IT-007 | — |

### Catalog and relational editing

| Source | Behavior | Unit | Integration | E2E |
|---|---|---|---|---|
| US-004 | Item CRUD and reference-safe deletion | UT-013, UT-019 | IT-009 | E2E-004 |
| US-004.EC-1 | Blank item name is rejected | UT-013 | — | E2E-004 |
| US-004.EC-2 | Duplicate item submission creates at most one | UT-049 | IT-014 | — |
| US-004.EC-3 | Stale edit/delete is rejected | UT-019 | IT-009 | — |
| US-004.EC-4 | Empty and large item lists remain usable | UT-050 | IT-020 | E2E-011 |
| US-005 | Resource requires item/act and becomes a source | UT-014, UT-029 | IT-009 | E2E-004 |
| US-005.EC-1 | Missing item or invalid act is rejected | UT-014 | — | — |
| US-005.EC-2 | Item removed before resource save is stale | UT-019 | IT-009 | — |
| US-005.EC-3 | No resources yields no fabricated gathering estimate | UT-029 | — | E2E-007 |
| US-005.EC-4 | Repeated resource save is idempotent | UT-049 | IT-014 | — |
| US-006 | Recipe components/products validate and expand | UT-015, UT-021 | IT-009, IT-011 | E2E-005 |
| US-006.EC-1 | Missing/duplicate/invalid component quantity is rejected | UT-015 | — | E2E-005 |
| US-006.EC-2 | Component removed before save is rejected | UT-019 | IT-009 | — |
| US-006.EC-3 | Direct/indirect cycle is rejected with path | UT-021 | IT-009 | E2E-005 |
| US-006.EC-4 | Large multiselection retains every component/quantity | UT-043 | IT-020 | — |
| US-006.EC-5 | Interrupted/repeated recipe save preserves one valid recipe | UT-049 | IT-014 | — |
| US-007 | Smelting duration/components/list display | UT-016, UT-037, UT-041 | IT-009 | E2E-005 |
| US-007.EC-1 | Invalid/ambiguous duration is rejected with examples | UT-016 | — | E2E-005 |
| US-007.EC-2 | Seconds-through-days duration round-trips | UT-016, UT-041 | — | — |
| US-007.EC-3 | Missing/duplicate/stale/cyclic components are rejected | UT-015, UT-019, UT-021 | IT-009 | — |
| US-007.EC-4 | Repeated/interrupted smelting save is atomic/idempotent | UT-049 | IT-014 | — |
| US-008 | Monster identity, act, and unique drop rates | UT-017 | IT-009 | E2E-004 |
| US-008.EC-1 | Missing/invalid monster/drop fields are rejected | UT-017 | — | — |
| US-008.EC-2 | Numerator above denominator is rejected | UT-017 | — | — |
| US-008.EC-3 | Stale/duplicate monster drop is rejected | UT-017, UT-019 | IT-009 | — |
| US-008.EC-4 | Monster without drops supplies no source | UT-029 | — | — |
| US-008.EC-5 | Repeated monster save creates no duplicate | UT-049 | IT-014 | — |
| US-009 | Boss identity, unique drops, and source eligibility | UT-018, UT-029 | IT-009 | E2E-004 |
| US-009.EC-1 | Malformed/duplicate/stale/impossible boss drop is rejected | UT-018, UT-019 | IT-009 | — |
| US-009.EC-2 | Boss without drops supplies no source | UT-029 | — | — |
| US-009.EC-3 | Cancel/interruption/repetition preserves one boss state | UT-049 | IT-014, IT-016 | — |
| US-009.EC-4 | Large boss/drop catalog remains searchable | UT-050 | IT-020 | E2E-011 |
| US-010 | Search, multiselect, inline creation, and parent draft | UT-042–UT-044 | IT-016 | E2E-006 |
| US-010.EC-1 | No-result search distinguishes create action | UT-042 | — | E2E-006 |
| US-010.EC-2 | Invalid child keeps child and parent drafts | UT-044 | IT-016 | — |
| US-010.EC-3 | Repeated parent/child save creates one selected record | UT-049 | IT-014, IT-016 | — |
| US-010.EC-4 | Relation deleted during draft is identified on save | UT-019 | IT-009 | — |
| US-010.EC-5 | Large paged/filtered relation set preserves selection | UT-042, UT-050 | IT-020 | E2E-011 |

### Planning, stock, sources, and estimates

| Source | Behavior | Unit | Integration | E2E |
|---|---|---|---|---|
| US-011 | Objective CRUD/order/completion controls priority | UT-022, UT-023 | IT-011, IT-015 | E2E-007 |
| US-011.EC-1 | Invalid objective product/quantity is rejected | UT-022 | — | — |
| US-011.EC-2 | Invalidated recipe objective becomes unresolved/excluded | UT-027 | IT-011 | — |
| US-011.EC-3 | Rapid repeated order/state actions settle deterministically | UT-045, UT-049 | IT-015 | — |
| US-011.EC-4 | Zero objectives shows creation empty state | UT-046 | — | E2E-007 |
| US-011.EC-5 | 50 objectives recalculate within contract | UT-051 | IT-021 | E2E-011 |
| US-012 | Objective trees show causal paths and allocation | UT-024, UT-025 | IT-011 | E2E-007 |
| US-012.EC-1 | Invalid branch is diagnostic, not false total | UT-027 | IT-011 | — |
| US-012.EC-2 | Legacy cycle stops one branch and preserves siblings | UT-028 | IT-011 | — |
| US-012.EC-3 | Repeated component paths remain distinct | UT-024 | — | E2E-007 |
| US-012.EC-4 | Deep/broad tree collapses and stays bounded | UT-046, UT-052 | IT-021 | E2E-011 |
| US-013 | Consolidated rows reconcile with objective trees | UT-026 | IT-011 | E2E-007 |
| US-013.EC-1 | No pending need shows complete/empty state | UT-026, UT-046 | — | E2E-007 |
| US-013.EC-2 | Goal priority/quantity change recalculates once | UT-023, UT-045 | IT-015 | — |
| US-013.EC-3 | Deleted/retagged component becomes unresolved | UT-027 | IT-011 | — |
| US-013.EC-4 | Large consolidated list remains searchable/windowed | UT-050, UT-052 | IT-020, IT-021 | E2E-011 |
| US-014 | Global stock persists and allocates once by priority | UT-023, UT-025 | IT-011, IT-015 | E2E-008 |
| US-014.EC-1 | Invalid/unsafe stock is rejected | UT-020 | — | — |
| US-014.EC-2 | Exact/excess stock prevents satisfied expansion | UT-025 | — | E2E-008 |
| US-014.EC-3 | Repeated stock set is not double-incremented | UT-045, UT-049 | IT-015 | — |
| US-014.EC-4 | Stocked entity deletion follows references | UT-019 | IT-009 | — |
| US-014.EC-5 | Restart during stock edit yields old or full new value | UT-003 | IT-004 | E2E-008 |
| US-015 | Completion credits stock and exact reversal | UT-038–UT-040 | IT-012 | E2E-008 |
| US-015.EC-1 | Zero missing cannot create credit | UT-038 | — | — |
| US-015.EC-2 | Duplicate completion creates one credit | UT-039 | IT-012 | — |
| US-015.EC-3 | Later demand does not mutate credit quantity | UT-038 | — | — |
| US-015.EC-4 | Undo that would make stock negative is blocked | UT-040 | IT-012 | E2E-008 |
| US-015.EC-5 | Interrupted completion commits stock and credit together or neither | UT-003 | IT-012 | — |
| US-016 | One persisted active source per raw item | UT-029, UT-030 | IT-011 | E2E-007 |
| US-016.EC-1 | No source shows not calculable | UT-029 | — | E2E-007 |
| US-016.EC-2 | Sole source auto-selects | UT-030 | — | — |
| US-016.EC-3 | Deleted active source becomes unresolved | UT-030 | IT-011 | — |
| US-016.EC-4 | Source change cannot mix estimate states | UT-045 | IT-015 | — |
| US-017 | Gathering rate and time formula | UT-031, UT-041 | IT-011 | E2E-007 |
| US-017.EC-1 | Invalid gathering rate withholds estimate | UT-031 | — | — |
| US-017.EC-2 | Zero missing produces zero time | UT-031 | — | — |
| US-017.EC-3 | Latest rate/demand wins deterministic recalculation | UT-045 | IT-015 | — |
| US-017.EC-4 | Small/large duration remains readable/nonzero | UT-041 | — | E2E-007 |
| US-018 | Monster expected-yield formula and disclaimer | UT-032–UT-034 | IT-011 | E2E-007 |
| US-018.EC-1 | Invalid kills/loot values withhold estimates | UT-032 | — | — |
| US-018.EC-2 | Missing kills rate keeps quantity/source visible | UT-032 | — | E2E-007 |
| US-018.EC-3 | Adjusted probability is capped at one | UT-033 | — | — |
| US-018.EC-4 | Half-boundary denominator uses `Math.round` | UT-034 | — | — |
| US-018.EC-5 | Zero missing/repetition yields no attempts and latest result | UT-032, UT-045 | IT-015 | — |
| US-019 | Boss formula displays expected fights only | UT-035 | IT-011 | E2E-007 |
| US-019.EC-1 | Invalid loot/rate withholds fights | UT-035 | — | — |
| US-019.EC-2 | Zero missing yields zero fights | UT-035 | — | — |
| US-019.EC-3 | Fractional expected fights are preserved | UT-035 | — | — |
| US-019.EC-4 | Only selected boss source contributes | UT-030, UT-035 | IT-011 | — |
| US-020 | Smelting missing × per-unit time and formatting | UT-036, UT-037, UT-041 | IT-011 | E2E-007 |
| US-020.EC-1 | Zero missing gives zero duration | UT-036 | — | — |
| US-020.EC-2 | Invalid legacy duration creates branch diagnostic | UT-027, UT-036 | IT-011 | — |
| US-020.EC-3 | Duration display boundaries are exact | UT-041 | — | — |
| US-020.EC-4 | Large duration stays safe/traceable | UT-036, UT-041 | — | — |
| US-021 | Accessible status/type/time hierarchy | UT-046, UT-047 | — | E2E-007 |
| US-021.EC-1 | Missing image/metadata retains text clarity | UT-046 | — | — |
| US-021.EC-2 | Keyboard/text-size/color independence | UT-047 | — | E2E-009 |
| US-021.EC-3 | Long names/values expose full content without overlap | UT-046 | — | E2E-009 |
| US-021.EC-4 | Not-calculable differs from zero/complete | UT-046 | — | E2E-007 |

### Integrity, navigation, trust, and release

| Source | Behavior | Unit | Integration | E2E |
|---|---|---|---|---|
| US-022 | Reference/cycle/external-data integrity | UT-019, UT-021 | IT-009, IT-011 | E2E-005 |
| US-022.EC-1 | Racing edits/deletes return coherent stale action | UT-004, UT-019 | IT-005, IT-009 | — |
| US-022.EC-2 | Self/two-node/long cross-type cycles are blocked | UT-021 | — | E2E-005 |
| US-022.EC-3 | Interrupted graph save is all-or-nothing | UT-003 | IT-004 | — |
| US-022.EC-4 | Large graph validation is bounded | UT-052 | IT-021 | — |
| US-023 | Ordered, emphasized, keyboard-reachable navigation | UT-047 | — | E2E-009 |
| US-023.EC-1 | Narrow/text-enlarged navigation remains operable | UT-047 | — | E2E-009 |
| US-023.EC-2 | Rapid navigation has one active section/consistent draft guard | UT-045 | IT-016 | — |
| US-023.EC-3 | Empty section does not break navigation | UT-046 | — | — |
| US-023.EC-4 | Nested form close restores logical focus | UT-044, UT-047 | IT-016 | E2E-006 |
| US-024 | Four constrained exact native operations only | UT-053–UT-056 | IT-013, IT-017 | E2E-002, E2E-003 |
| US-024.EC-1 | Unknown/malformed/traversal/extra data is rejected | UT-053, UT-055 | IT-013 | — |
| US-024.EC-2 | Repeated native action cannot bypass validation | UT-049, UT-053 | IT-013 | — |
| US-024.EC-3 | Native interruption returns bounded error/valid data | UT-054, UT-056 | IT-017 | E2E-002 |
| US-024.EC-4 | Offline core actions remain available | UT-054 | IT-013 | E2E-001 |
| US-025 | Guarded three-tag `.deb`/NSIS release evidence | UT-057–UT-060 | IT-018, IT-019 | E2E-012, E2E-013 |
| US-025.EC-1 | Invalid version/tag/worktree/branch/gate pushes no tags | UT-057 | IT-018 | — |
| US-025.EC-2 | One platform failure prevents false main success | UT-058 | IT-018 | — |
| US-025.EC-3 | Retry detects immutable existing tag/artifact | UT-057, UT-058 | IT-018 | — |
| US-025.EC-4 | Missing signing credentials stay out of repository | UT-060 | IT-019 | E2E-013 |
| US-025.EC-5 | Missing artifact/checksum/SBOM/attestation fails release | UT-058, UT-059 | IT-019 | E2E-012, E2E-013 |
| US-026 | Metadata and native icons in `.deb`/NSIS/ZIP | UT-059, UT-060 | IT-019 | E2E-012, E2E-013 |
| US-026.EC-1 | Missing/invalid required icon fails packaging | UT-060 | IT-019 | — |
| US-026.EC-2 | Linux package supplies standards-compatible icon data | UT-060 | IT-019 | E2E-012 |
| US-026.EC-3 | Requested/package metadata version mismatch fails | UT-057, UT-060 | IT-018, IT-019 | — |
| US-026.EC-4 | Platform packaging cannot contaminate outputs | UT-059 | IT-019 | E2E-012, E2E-013 |

### TechSpec component and interface coverage

| Source | Behavior | Unit | Integration | E2E |
|---|---|---|---|---|
| `AppRepository.load` | primary/backup/seed/migration/error outcomes | UT-001, UT-002, UT-005–UT-009 | IT-001–IT-003 | E2E-001 |
| `AppRepository.save` | atomic CAS save and all storage failures | UT-003, UT-004 | IT-004, IT-005 | E2E-010 |
| `CatalogService` | invariant candidates, references, cycles | UT-013–UT-021 | IT-009 | E2E-004, E2E-005 |
| `PlanningEngine.calculate` | allocation/tree/diagnostics/limits | UT-022–UT-028, UT-051, UT-052 | IT-011, IT-021 | E2E-007, E2E-011 |
| `PlanConsolidator` | exact projection/reconciliation | UT-026 | IT-011 | E2E-007 |
| `EstimateCalculator` | source/gather/drop/boss/smelting rules | UT-029–UT-037 | IT-011 | E2E-007 |
| Completion service | credit/undo/idempotency/state failures | UT-038–UT-040 | IT-012 | E2E-008 |
| Duration/number formatters | exact boundaries and safe presentation | UT-041 | — | E2E-007 |
| `RelationPicker` | search/multiselect/keyboard/large catalog | UT-042, UT-043, UT-047, UT-050 | IT-020 | E2E-006, E2E-011 |
| `ModalStack` | nested draft and focus lifecycle | UT-044, UT-047 | IT-016 | E2E-006 |
| `AppStore` | serialized actions/save/conflict/reload | UT-045, UT-049 | IT-014, IT-015 | E2E-010 |
| View modules | empty/long/accessibility/render states | UT-046, UT-047 | IT-016 | E2E-007, E2E-009 |
| `DesktopApi.load` / `app:load` | success and three documented failures | UT-053, UT-054 | IT-013 | E2E-001 |
| `DesktopApi.save` / `app:save` | success, invalid, conflict, storage failures | UT-053, UT-054 | IT-013–IT-015 | E2E-010 |
| `DesktopApi.importImage` / `image:import` | success/cancel/invalid/storage failures | UT-010–UT-012, UT-053, UT-055 | IT-007, IT-013 | E2E-003 |
| `DesktopApi.openDataDirectory` / `folder:open` | success and native failure | UT-053, UT-056 | IT-017 | E2E-002 |
| Seed compiler/loader | deterministic output/rejections/first-use only | UT-006–UT-008 | IT-002, IT-006 | E2E-001 |
| Image library/protocol/GC | import/containment/reference deletion/errors | UT-010–UT-012, UT-055 | IT-007, IT-008 | E2E-003 |
| Release script/workflow | tags, artifacts, evidence, metadata, failure gates | UT-057–UT-060 | IT-018, IT-019 | E2E-012–E2E-014 |

## Unit Tests

### Storage schema, migrations, seed, and repository

- **UT-001** (happy): `decodeStorageEnvelope` with valid schema-v2 revision 7
  returns the exact `AppData` and revision 7.
- **UT-002** (error): `decodeStorageEnvelope` with malformed JSON, unknown
  `schemaVersion`, negative revision, unknown keys, or invalid domain returns the
  corresponding typed decode error without an empty fallback.
- **UT-003** (state): `AtomicSnapshotWriter` faulted before temp flush, during
  backup rotation, or before primary rename leaves either the previous validated
  primary or complete next primary, never a partial parseable envelope.
- **UT-004** (concurrency): `JsonAppRepository.save` given expected revision 4 and
  persisted revision 5 returns `revision_conflict` and performs no write/backup/GC.
- **UT-005** (happy): `migrateV1ToV2` preserves IDs/data, maps `smeltery` to
  `smelting`, assigns priorities by goal order, adds `completedEntities` to stock,
  and creates equal active credits.
- **UT-006** (state): `SeedLoader.initialize` reads seed only when primary and
  backup are absent and otherwise returns the existing snapshot unchanged.
- **UT-007** (error): `compileSeed` omits an ambiguous workbook row, emits its
  sheet/row/field/reason, and includes every independent valid row.
- **UT-008** (idempotency): two `compileSeed` runs and two interrupted/retried
  first-use initializations produce byte-identical seed content and one snapshot.
- **UT-009** (error): load recovery returns `data_corrupt` when primary and backup
  both exist but fail validation, and never calls seed/empty initialization.

### Managed images

- **UT-010** (error): `validateImageInput` rejects over-10-MiB, unsupported
  extension, mismatched magic bytes, undecodable, zero-sized, or over-8192 image
  with `image_invalid`.
- **UT-011** (happy): `ImageLibrary.import` re-encodes a valid image, ignores the
  source basename, and returns a category/UUID `asset://` reference unique from
  an existing asset.
- **UT-012** (state): `collectOrphans` deletes only allowlisted managed files
  absent from committed references, retains shared/referenced files, and reports
  deletion failure for later retry without changing domain data.

### Catalog schema and graph

- **UT-013** (error): item candidate with blank/overlong name or invalid image
  reference returns exact field errors; a valid trimmed name succeeds.
- **UT-014** (error): resource candidate with missing item or act outside I–III
  returns `invalid_reference` or `invalid_act`.
- **UT-015** (error): recipe/smelting candidate with zero components, duplicate ID,
  non-safe-integer, zero, negative, fractional, or overflowing quantity is rejected.
- **UT-016** (boundary): `parseProcessingDuration` maps `1m 30s`, `1:30`, `90`,
  `90s`, and multi-day input to exact whole seconds and rejects blank, ambiguous,
  fractional, zero, negative, or overflowing values.
- **UT-017** (error): monster candidate rejects blank identity, invalid act,
  missing/duplicate item, non-positive/noninteger rate, and numerator above denominator.
- **UT-018** (error): boss candidate enforces the same identity, act, distinct
  drop, and probability invariants as monster.
- **UT-019** (state): `ReferenceIndex.canDelete` names every resource/product/drop/
  goal/stock/source/credit reference and rejects a stale entity revision.
- **UT-020** (boundary): stock accepts zero and safe positive integers and rejects
  negative, fractional, non-finite, malformed, and unsafe integers.
- **UT-021** (error): `detectProductionCycle` returns exact paths for self,
  two-node, long, and recipe↔smelting cycles and returns none for a DAG.

### Planning engine and estimates

- **UT-022** (error): objective validation accepts a recipe/safe positive integer
  and rejects missing, smelting, stale, zero, fractional, or unsafe quantity.
- **UT-023** (ordering): priority allocation gives scarce stock to goal priority
  0 before priority 1; swapping priorities swaps allocations without changing totals.
- **UT-024** (happy): `PlanningEngine.calculate` produces distinct causal paths
  for repeated components and the expected recursive recipe/smelting tree.
- **UT-025** (boundary): exact/excess intermediate stock allocates once and
  prevents component expansion only for the satisfied output portion.
- **UT-026** (happy): `consolidateObjectivePlans` sums all node required/allocated/
  missing values by entity and contributor paths exactly equal tree totals.
- **UT-027** (error): stale entity, missing component, invalid duration, or invalid
  objective creates a typed branch diagnostic and preserves valid sibling results.
- **UT-028** (error): path-local cycle emits its exact cycle and stops only the
  affected branch while an independent branch completes.
- **UT-029** (boundary): source resolver returns none for zero origins, auto-selects
  one origin, and requires persisted selection for multiple incompatible origins.
- **UT-030** (state): stale selected source produces `source_unresolved`; changing
  selection calculates exclusively from the new complete source.
- **UT-031** (boundary): gathering calculation returns missing/rate hours for
  positive finite rate, zero for zero missing, and `rate_required` otherwise.
- **UT-032** (error): monster calculation with invalid/missing kills or loot
  returns no time while retaining need/source; zero missing returns zero attempts.
- **UT-033** (boundary): adjusted monster probability never exceeds one even when
  numerator and loot multiplier would exceed adjusted denominator.
- **UT-034** (boundary): adjusted denominator uses `Math.round` for values directly
  below, at, and above `.5`, with minimum denominator one.
- **UT-035** (boundary): boss calculation preserves fractional expected fights,
  returns zero for zero missing, uses loot adjustment, and never requests hourly rate.
- **UT-036** (boundary): smelting calculation returns exact missing × per-unit
  seconds, zero for no missing, and a diagnostic for invalid legacy duration.
- **UT-037** (happy): aggregate planner fixtures reproduce the PRD's monster,
  gathering, boss, and smelting numeric examples without presentation rounding.

### Completion, formatting, and renderer state

- **UT-038** (state): `createCompletionCredit` adds exactly current positive
  missing to stock, records immutable quantity, and rejects zero missing.
- **UT-039** (idempotency): repeating the same completion operation ID returns
  the existing credit and does not increment stock twice.
- **UT-040** (state): `reverseCompletionCredit` subtracts the exact active credit,
  stamps reversal, preserves unrelated stock, and rejects insufficient stock or
  already-reversed/unknown credit.
- **UT-041** (boundary): duration formatter emits minutes/seconds at 3599,
  hours/minutes/seconds at 3600–86399, days/hours/minutes/seconds at 86400, and
  never renders positive input as zero.
- **UT-042** (happy): `RelationSearchIndex.search` normalizes case/diacritics,
  distinguishes no results from create, and preserves selected IDs beyond render cap.
- **UT-043** (state): relation multiselect adds each ID once and preserves an
  independently editable safe integer quantity per selected component.
- **UT-044** (state): `ModalStack` cancel/invalid child preserves parent draft;
  child success selects its ID and returns a deterministic focus token.
- **UT-045** (ordering): `AppStore` serializes rapid planning/source/navigation
  actions and renders only the latest complete immutable calculation.
- **UT-046** (happy): view modules render explicit empty, complete, remaining,
  unresolved, zero, missing-image, long-name, and full-value accessible states.
- **UT-047** (happy): navigation, relation picker, modal, objectives, and trees
  expose semantic roles, labels, focus order, keyboard actions, and non-color cues.
- **UT-048** (state): settings module renders synchronization as disabled and maps
  folder success/failure to correct notice without enabling network behavior.
- **UT-049** (idempotency): operation guard ignores repeated in-flight submit and
  enables retry only after a typed failure.
- **UT-050** (boundary): relation/catalog search over 5,000 records returns the
  correct stable result set and keeps selections below 500 ms in CI fixture.
- **UT-051** (boundary): engine calculates 50 objectives and a 20,000-node valid
  fixture below 500 ms median after warm-up.
- **UT-052** (boundary): node 20,001 stops further expansion with
  `calculation_limit`, preserves completed results, and never recurses unboundedly.

### IPC and native boundary

- **UT-053** (error): every IPC request schema rejects unknown channel, missing/
  extra keys, wrong types, oversized collections, hostile category, and arguments
  supplied to no-argument operations as `invalid_request`.
- **UT-054** (happy): controller maps every repository load/save success and
  documented internal failure to the exact closed `Result` code without stack/path.
- **UT-055** (error): asset URL parser rejects credentials, query/fragment,
  encoded separator, unknown category, non-UUID filename, and containment escape.
- **UT-056** (error): folder controller maps nonempty `shell.openPath` failure
  string/throw to `native_action_failed` and empty result to success.

### Release and distribution

- **UT-057** (error): release preflight rejects malformed/mismatched version,
  dirty worktree, unauthorized branch, existing any-of-three tag, failed test/
  typecheck/audit/seed/build, and records zero push calls.
- **UT-058** (state): release topology publishes platform tags only after their
  complete evidence and main source reference only after both; retry never overwrites.
- **UT-059** (error): artifact inventory/checksum/SBOM/attestation-input builder
  accepts exactly `.deb`, `.deb.zip`, `.exe`, `.exe.zip` and rejects any missing,
  extra cross-platform, mismatched hash, or absent CycloneDX component.
- **UT-060** (error): package metadata validator requires product/version/author/
  description, Debian desktop/icon entries, NSIS icons, isolated outputs, and
  reports signing as conditional without reading repository credentials.

## Integration Tests

### Repository, migration, and seed

- **IT-001**: real temp repository with valid primary v2 → load → edit/save →
  process restart → exact data and incremented revision are restored.
- **IT-002**: empty temp directory with valid, missing, and invalid packaged seed
  fixtures → load → respectively seeded snapshot, valid empty snapshot with notice,
  and no partial files.
- **IT-003**: fault injected at each first-initialization filesystem step → retry
  → one valid primary and no duplicated seed IDs.
- **IT-004**: real temp primary plus injected temp-write/backup/rename failures →
  reload → old or complete new valid snapshot and recoverable backup.
- **IT-005**: two repository clients load revision 3 → first saves revision 4 →
  second save returns conflict and cannot alter primary/backup.
- **IT-006**: compile workbook fixture twice → compare bytes/rejection report →
  load generated seed through current validator with every accepted relation valid.

### Images and catalog

- **IT-007**: native-dialog path to valid/invalid/interrupted image fixtures →
  import service writes only validated atomic managed file and returns exact result.
- **IT-008**: two records share an image, then saves remove references one at a
  time → first GC retains file, second successful-save GC removes it; failed save
  never runs GC.
- **IT-009**: renderer candidate → catalog service → full validator → repository
  save for each entity CRUD and deletion/cycle failure preserves one coherent graph.

### Planning and completion

- **IT-010**: schema-v1 fixture with stock/completedEntities/goals → migrate/save/
  reload → schema-v2 stock, priorities, and reversible credits exactly match source.
- **IT-011**: real catalog snapshot with two goals/shared stock/all four estimate
  types/multiple sources/cycle branch → engine → trees and consolidated rows
  reconcile while diagnostics isolate invalid branches.
- **IT-012**: consolidated completion candidate → repository save → reload → undo
  candidate/save → stock and credit transition atomically; injected/conflict save
  leaves both previous values.
- **IT-013**: actual registered IPC handlers and preload adapter with valid and
  hostile payloads → only four channels act and all response shapes/codes match.
- **IT-014**: two repeated renderer submit events → operation guard/controller/
  repository → one revision increment and one entity/credit.
- **IT-015**: rapid objective reorder, stock/rate/source edits → store effect queue
  → persisted revision order and final plan reflect the last accepted actions.

### Renderer and native operations

- **IT-016**: mounted catalog editor → open inline child → invalid/cancel/success
  paths → parent draft, automatic selection, and focus restoration match contract.
- **IT-017**: real main folder service with temp missing directory and fake OS
  denial → directory is safely created/revealed or exact error reaches UI.
- **IT-018**: release script against temporary Git origin across each preflight,
  platform failure, existing-tag, and happy topology → inspect pushed tags/releases.
- **IT-019**: fixture `.deb`/NSIS artifacts → ZIP/checksum/SBOM/metadata/icon/
  attestation inventory → exact per-platform evidence or deterministic failure.
- **IT-020**: mounted relation/catalog modules with 5,000 records and large
  multiselection → search/filter/selection/focus stay correct within 500 ms.
- **IT-021**: full planning composition with 50 goals/20,000 nodes → calculate,
  consolidate, render collapsed roots → each measured operation stays within 500 ms.

## End-to-End Tests

### Local workspace and native controls

- **E2E-001**: fresh packaged app with isolated user data → seeded catalog appears
  → edit record/create goal → restart offline → exact edit and plan persist; repeat
  with seed absent to observe usable empty state.
- **E2E-002**: packaged settings → synchronization is disabled → open data location
  succeeds; platform adapter denial produces actionable notice and core UI remains usable.
- **E2E-003**: catalog form → choose valid image → preview/save/restart → replace,
  cancel replacement, then remove → committed image/reference and orphan lifecycle
  match each visible state.

### Catalog and planning journeys

- **E2E-004**: create item → resource → monster and boss drops using that item →
  edit each → attempted referenced deletion is blocked with named associations.
- **E2E-005**: create recipe and smelting products with multicomponents/durations
  → see smelting duration → attempt direct/cross-type cycle → exact cycle is shown
  and valid graph remains.
- **E2E-006**: from a relation picker with no match → create item/product inline →
  cancel and successful branches preserve parent draft, select child, and restore focus.
- **E2E-007**: create two recipe goals with shared dependencies → choose source/
  rates/loot → inspect both trees and consolidated view → estimates and badges/
  statuses reconcile and missing inputs show not calculable rather than zero.
- **E2E-008**: enter insufficient global stock → reorder goals → observe allocation
  move → complete consolidated need → restart → undo exact credit; insufficient-stock
  undo is visibly blocked.
- **E2E-009**: keyboard-only traverse ordered navigation, modal, relation picker,
  objectives, tree, and consolidated controls at enlarged text/narrow window →
  focus, labels, full values, and non-color states remain operable.
- **E2E-010**: stale renderer holds revision N while test replaces storage with
  revision N+1 → save → conflict notice and recoverable draft appear → reload shows
  current persisted data without silent overwrite.
- **E2E-011**: packaged app loads 5,000-record/50-goal/20,000-node fixture →
  relation search, objective tree collapse, and consolidated rendering remain
  correct and each contract measurement is within 500 ms.

### Packaged distribution

- **E2E-012**: Linux platform job builds `.deb` and ZIP → inspect package metadata,
  installed desktop entry/icons, executable launch, isolated persistence, hashes,
  SBOM, and attestation subject inventory.
- **E2E-013**: Windows platform job builds NSIS and ZIP → inspect product/author/
  version/icons, launch installed app, isolated persistence, hashes, SBOM, and
  signing behavior with and without injected CI credentials.
- **E2E-014**: happy release fixture invokes publication command → observe source,
  Linux, and Windows tags/releases with exact platform artifacts and main cross-
  references; force one mandatory gate failure and observe zero new tag publication.
