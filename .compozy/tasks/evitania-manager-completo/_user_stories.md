# User Stories: Complete Evitania Manager

Canonical behavior catalog for the complete Evitania Manager product. Companion
to `_prd.md`; consumed by `_techspec.md` and `_tests.md`.

## Personas

- **Player-Planner** — an Evitania player who wants accurate production,
  gathering, combat, and smelting requirements without maintaining a spreadsheet.
- **Catalog Maintainer** — the same player while creating and correcting local
  game records as Evitania evolves.
- **Release Maintainer** — João Neto or an authorized maintainer who validates
  and publishes trustworthy Linux and Windows artifacts.

## Story Index

| ID | Feature Area | Persona | Story |
|---|---|---|---|
| US-001 | Local workspace | Player-Planner | Start with useful editable data |
| US-002 | Local workspace | Player-Planner | Locate data and understand synchronization |
| US-003 | Managed images | Catalog Maintainer | Add, preview, replace, and remove images |
| US-004 | Items | Catalog Maintainer | Manage the central raw-item catalog |
| US-005 | Resources | Catalog Maintainer | Manage collectible resource origins |
| US-006 | Recipes | Catalog Maintainer | Manage recipe products and components |
| US-007 | Smelting | Catalog Maintainer | Manage smelting products and durations |
| US-008 | Monsters | Catalog Maintainer | Manage monsters and their drops |
| US-009 | Bosses | Catalog Maintainer | Manage bosses and their drops |
| US-010 | Relational editing | Catalog Maintainer | Search, multi-select, and create dependencies inline |
| US-011 | Planner objectives | Player-Planner | Create, prioritize, edit, and complete objectives |
| US-012 | Production tree | Player-Planner | Inspect complete production trees |
| US-013 | Consolidation | Player-Planner | Use one consolidated pending-needs list |
| US-014 | Stock | Player-Planner | Maintain and allocate global stock |
| US-015 | Completion | Player-Planner | Complete and reverse consolidated needs |
| US-016 | Sources | Player-Planner | Select one active origin for each raw item |
| US-017 | Gathering | Player-Planner | Estimate gathering time |
| US-018 | Monster drops | Player-Planner | Estimate monster farming time |
| US-019 | Boss drops | Player-Planner | Estimate boss fights |
| US-020 | Smelting | Player-Planner | Estimate total smelting time |
| US-021 | Planner feedback | Player-Planner | Distinguish status, type, quantity, and time |
| US-022 | Data integrity | Catalog Maintainer | Prevent broken references and production cycles |
| US-023 | Navigation | Player-Planner | Reach the planner and ordered catalog sections |
| US-024 | Desktop security | Player-Planner | Use local capabilities through constrained actions |
| US-025 | Distribution | Release Maintainer | Validate and publish platform releases |
| US-026 | Desktop identity | Release Maintainer | Ship correct identity and native icons |

## Local Workspace

### US-001: Start with useful editable data

**As a** Player-Planner, **I want** a populated but editable catalog on first
use, **so that** I can plan immediately and correct data as the game changes.

Acceptance criteria:

- AC-1: Given a first launch, when the workspace opens, then valid bundled items,
  recipes, smelting processes, resources, monsters, bosses, and drops are available.
- AC-2: Given a bundled record, when the user edits or deletes it subject to
  relationship rules, then it behaves like any user-created record.
- AC-3: Given an application restart, when the workspace opens, then the user's
  valid changes are restored.

Edge cases:

- EC-1: No valid seed records are available → the app opens an empty, usable
  workspace and explains that catalog data must be added.
- EC-2: A seed row is ambiguous or invalid → it is omitted rather than guessed,
  while other valid rows remain available.
- EC-3: Launch is interrupted during first-use initialization → retry produces
  one valid catalog without duplicate records.
- EC-4: The catalog grows to 100× the seed size → navigation and searchable
  selection remain usable without truncating valid records.
- EC-5: A second process attempts to change the same local workspace → unsafe
  concurrent modification is prevented or surfaced without silent data loss.

### US-002: Locate data and understand synchronization

**As a** Player-Planner, **I want** to open the local data location and see the
future synchronization control, **so that** I retain control of my offline data.

Acceptance criteria:

- AC-1: Selecting “Open data location” opens the folder containing the managed
  data and module asset directories.
- AC-2: “Synchronize” is visible but disabled and communicates that the feature
  is not yet available.
- AC-3: Core catalog and planner workflows remain available without a network.

Edge cases:

- EC-1: The data location no longer exists → the app recreates a safe location
  or displays a recoverable error without opening an unrelated path.
- EC-2: The operating system refuses to open the folder → the user sees an
  actionable error and the app remains usable.
- EC-3: Synchronize is activated through repeated input or keyboard navigation →
  no synchronization attempt or state change occurs.
- EC-4: The app restarts offline → the last valid local state is restored.

## Managed Images

### US-003: Add, preview, replace, and remove images

**As a** Catalog Maintainer, **I want** managed images on catalog records,
**so that** records are recognizable without exposing arbitrary file access.

Acceptance criteria:

- AC-1: The form accepts a local PNG or JPEG, shows a preview, and allows removal
  or replacement before saving.
- AC-2: Saving copies a validated image into `assets/<module>/` in the user-data
  area with an application-generated name and stores only its managed reference.
- AC-3: Replacing or removing a saved image updates the visible record without
  affecting images used by other records.

Edge cases:

- EC-1: The extension, declared type, or basic content is not PNG/JPEG → the file
  is rejected with a format message and no managed copy is created.
- EC-2: The input name contains paths or hostile characters → the supplied name
  is never used as the destination path.
- EC-3: Selection or save is cancelled → the previous image and form state remain.
- EC-4: Copying is interrupted or storage is unavailable → the record is not
  left pointing to a partial file and the user sees an actionable error.
- EC-5: The same file is submitted repeatedly → each saved reference remains
  valid without overwriting an unrelated managed asset.

## Catalog Management

### US-004: Manage the central raw-item catalog

**As a** Catalog Maintainer, **I want** to create, view, edit, and safely delete
raw items, **so that** every origin and product can share consistent materials.

Acceptance criteria:

- AC-1: A raw item requires a nonblank name and may have a managed image.
- AC-2: A saved item is selectable by resources, drops, recipes, and smelting.
- AC-3: Deletion is blocked while the item is referenced and identifies the
  associations that must be removed.

Edge cases:

- EC-1: The name is blank or whitespace → save is rejected beside the field.
- EC-2: Save is submitted twice → at most one item is created.
- EC-3: A referenced or already deleted item is edited/deleted → stale action is
  rejected and the current state is shown.
- EC-4: There are zero or very many items → the empty state guides creation and
  large lists remain searchable.

### US-005: Manage collectible resource origins

**As a** Catalog Maintainer, **I want** to associate collectible resources with
items and acts, **so that** logs and ores can receive gathering estimates.

Acceptance criteria:

- AC-1: A resource requires one existing raw item and Act I, II, or III.
- AC-2: A resource may have its own managed image.
- AC-3: The linked raw item becomes an eligible gathering source in the planner.

Edge cases:

- EC-1: The item is absent or the act is outside I–III → save is rejected with a
  field-specific message.
- EC-2: The selected item is deleted before save → save is rejected without
  creating a broken resource.
- EC-3: No resources exist → the module shows an empty state and raw items remain
  usable elsewhere without a fabricated gathering estimate.
- EC-4: Repeated save is submitted → no duplicate operation is produced.

### US-006: Manage recipe products and components

**As a** Catalog Maintainer, **I want** to define forge recipes from items and
products, **so that** craftable goals and intermediate dependencies can expand.

Acceptance criteria:

- AC-1: A recipe owns a product of type `recipe`, a managed image, and at least
  one distinct item or product component.
- AC-2: Every component has an independently editable positive integer quantity.
- AC-3: Recipe products can be planner objectives and components of other recipes
  or smelting processes.

Edge cases:

- EC-1: No component, duplicate component, zero, fractional, negative, or
  unparseable quantity is submitted → save is rejected and preserves valid input.
- EC-2: A component disappears before save → the stale component is identified
  and no broken recipe is saved.
- EC-3: Save would create a direct or indirect cycle → it is blocked and the
  products in the cycle are named.
- EC-4: Many components are selected → each remains independently editable and
  none is silently omitted.
- EC-5: Save is interrupted or repeated → the previous valid recipe remains and
  duplicate products are not created.

### US-007: Manage smelting products and durations

**As a** Catalog Maintainer, **I want** to define smelting processes and their
per-unit time, **so that** processed dependencies include duration.

Acceptance criteria:

- AC-1: A process owns a product of type `smelting`, at least one distinct
  component with a positive integer quantity, and a positive whole-second
  processing duration.
- AC-2: Duration input accepts clearly documented forms such as `1m 30s`, `1:30`,
  `90`, and `90s`, and displays the normalized duration before or after saving.
- AC-3: The smelting list prominently displays each product's per-unit duration.

Edge cases:

- EC-1: Duration is blank, zero, negative, fractional seconds, ambiguous, or
  unparseable → save is rejected with accepted examples.
- EC-2: Durations from seconds through days → they remain representable and are
  formatted without losing the base seconds.
- EC-3: Components are absent, duplicated, stale, or cyclic → the same safe
  rejection behavior as recipe components applies.
- EC-4: Repeated or interrupted save → no duplicate or partial process is created.

### US-008: Manage monsters and their drops

**As a** Catalog Maintainer, **I want** to define monsters and drop rates,
**so that** raw materials can receive combat estimates.

Acceptance criteria:

- AC-1: A monster requires a name and Act I, II, or III and may have a managed image.
- AC-2: Each drop references a raw item and has positive integer numerator and
  denominator values displayed as `x in y`.
- AC-3: The same item cannot appear twice in one monster's drop list.

Edge cases:

- EC-1: Required identity, act, item, numerator, or denominator is invalid or
  missing → save is rejected at the relevant field.
- EC-2: A numerator greater than its denominator is entered → save is rejected
  because the base probability cannot exceed one.
- EC-3: A drop item is deleted or added twice before save → no stale or duplicate
  drop is stored.
- EC-4: A monster has no drops → it may be cataloged but contributes no planner
  source until a valid drop is added.
- EC-5: Repeated save → no duplicate monster or drop operation is created.

### US-009: Manage bosses and their drops

**As a** Catalog Maintainer, **I want** to define bosses and drop rates,
**so that** the planner can estimate required fights.

Acceptance criteria:

- AC-1: A boss requires a name and Act I, II, or III and may have a managed image.
- AC-2: Each distinct raw-item drop has positive integer numerator and denominator
  values displayed as `x in y`.
- AC-3: Valid boss drops become selectable origins in the planner.

Edge cases:

- EC-1: Missing, malformed, duplicate, stale, or probability-above-one drop data
  → save is rejected without damaging the previous valid boss.
- EC-2: A boss has no drops → it remains cataloged but provides no planner source.
- EC-3: Save is cancelled, interrupted, or repeated → prior data remains and no
  duplicate operation is created.
- EC-4: Large boss/drop catalogs → searchable item selection remains usable.

### US-010: Search, multi-select, and create dependencies inline

**As a** Catalog Maintainer, **I want** scalable relationship controls and inline
creation, **so that** I can build connected records without losing context.

Acceptance criteria:

- AC-1: Every relationship field supports searching eligible records by name.
- AC-2: Recipe and smelting forms allow multiple components to be added in one
  selection and then assign an individual quantity to each.
- AC-3: From any relationship field, the user can create an eligible missing
  record, return with the parent form intact, and see the new record selected.
- AC-4: Cancelling inline creation returns with the parent form unchanged.

Edge cases:

- EC-1: Search is empty or has no match → the control distinguishes “no results”
  from “create a new record.”
- EC-2: The new record fails validation → the inline form remains open and the
  parent draft is preserved.
- EC-3: Parent or child save is submitted repeatedly → at most one related record
  is created and selected.
- EC-4: A selected relation is deleted concurrently → parent save identifies the
  stale relation and preserves the remaining draft.
- EC-5: Very large eligible catalogs → results remain searchable and no valid
  selected value disappears due to paging or filtering.

## Planning

### US-011: Create, prioritize, edit, and complete objectives

**As a** Player-Planner, **I want** recipe objectives with quantities and
priority, **so that** the plan reflects what I intend to craft first.

Acceptance criteria:

- AC-1: An objective requires a recipe product and positive integer quantity.
- AC-2: Multiple objectives can be added, edited, removed, and reordered.
- AC-3: Priority order controls global-stock allocation.
- AC-4: Completing an objective removes its needs from pending totals without
  deleting it; reversing completion restores it.

Edge cases:

- EC-1: Missing product or zero, negative, fractional, or malformed quantity →
  objective save is rejected with existing objectives unchanged.
- EC-2: The referenced recipe is deleted or becomes invalid → the objective is
  identified as unavailable and excluded from misleading calculations.
- EC-3: Reordering, completing, or deleting is repeated rapidly → the visible
  order/state and totals settle deterministically.
- EC-4: There are no objectives → both views show a creation-oriented empty state.
- EC-5: There are 100× typical objectives → reordering and recalculation remain
  usable and no objective is silently omitted.

### US-012: Inspect complete production trees

**As a** Player-Planner, **I want** an expandable tree for each objective,
**so that** I can understand every intermediate process and raw requirement.

Acceptance criteria:

- AC-1: The tree expands the objective through recipes and smelting processes
  until it reaches raw items and displays required, stocked, and missing amounts.
- AC-2: Each node identifies its type and the path that caused its requirement.
- AC-3: Tree values honor objective priority, stock, completion, and active-source
  choices and update when any of them changes.

Edge cases:

- EC-1: A dependency has missing or invalid catalog data → the affected branch is
  visibly unresolved instead of presenting a false total.
- EC-2: A cycle exists in externally modified legacy data → expansion stops,
  names the cycle, and other independent branches remain visible.
- EC-3: Repeated components in different branches → each path remains visible
  while the consolidated view combines them.
- EC-4: A very deep or broad tree → branches can be collapsed and explored
  without hiding totals or freezing ordinary interaction.

### US-013: Use one consolidated pending-needs list

**As a** Player-Planner, **I want** a consolidated list across objectives,
**so that** I can act on one set of pending requirements.

Acceptance criteria:

- AC-1: The planner can switch between objective trees and the consolidated list
  without changing plan data.
- AC-2: Identical components from pending objectives appear once with summed
  required, allocated-stock, and missing quantities.
- AC-3: Completed objectives do not contribute; reversing completion restores them.

Edge cases:

- EC-1: Nothing is pending → the list shows a clear complete/empty state, not
  zero-value noise.
- EC-2: Objective priority or quantity changes → totals recalculate once and
  remain reconcilable with the trees.
- EC-3: A component changes type or is deleted → the row becomes unresolved
  rather than silently merging with another item.
- EC-4: A very large consolidated list → type/status cues and item search or
  navigation remain usable.

### US-014: Maintain and allocate global stock

**As a** Player-Planner, **I want** one persistent stock balance,
**so that** owned materials are deducted once across all objectives.

Acceptance criteria:

- AC-1: The user can set a nonnegative integer stock amount for an item or product.
- AC-2: Stock persists across restarts and is allocated in objective priority order.
- AC-3: Only missing quantities after stock allocation expand into lower-level
  components.
- AC-4: Reordering objectives visibly reallocates insufficient stock and recalculates
  affected branches and totals.

Edge cases:

- EC-1: Stock is negative, fractional, malformed, or exceeds supported numeric
  safety → input is rejected without changing the prior balance.
- EC-2: Stock exactly satisfies or exceeds demand → missing quantity is zero and
  no lower dependency is expanded for that satisfied amount.
- EC-3: The same stock edit is submitted twice → the value is set once rather
  than incremented twice.
- EC-4: A stocked record is later deleted → deletion follows association safety
  rules and never silently transfers stock to another record.
- EC-5: Restart occurs during an edit → either the previous or complete new value
  is restored, never a partial malformed value.

### US-015: Complete and reverse consolidated needs

**As a** Player-Planner, **I want** to mark a consolidated need complete,
**so that** acquired quantities become stock and the plan updates safely.

Acceptance criteria:

- AC-1: Completing a need credits its current missing integer quantity to global
  stock and records the credit's item and amount.
- AC-2: The plan recalculates and visually distinguishes the completed action.
- AC-3: Reversing completion removes exactly the recorded credit while preserving
  unrelated stock changes.

Edge cases:

- EC-1: The missing quantity is zero → completion is unavailable and creates no
  zero-value record.
- EC-2: The action is submitted twice → only one credit is applied.
- EC-3: Demand changes after completion → the recorded credit remains the original
  amount; new demand is calculated normally.
- EC-4: A later manual edit leaves insufficient stock to reverse the credit →
  reversal is blocked with an explanation instead of creating negative stock.
- EC-5: Restart or interruption occurs during completion → the credit and record
  are both present or both absent.

### US-016: Select one active origin for each raw item

**As a** Player-Planner, **I want** to choose among valid origins,
**so that** estimates use the source I actually intend to farm.

Acceptance criteria:

- AC-1: Every compatible resource, monster, and boss origin is shown separately
  with its relevant act and rate information.
- AC-2: One active origin per item applies throughout the plan and persists.
- AC-3: Incompatible origins are never summed automatically.

Edge cases:

- EC-1: No origin exists → required quantity remains visible and time/fights are
  labeled not calculable.
- EC-2: Exactly one origin exists → it is used without forcing unnecessary choice.
- EC-3: The active origin is deleted or its drop changes → estimates become
  unresolved until a valid origin is selected.
- EC-4: Changing origin during recalculation → the final visible estimate uses
  one complete source state, never a mixture.

### US-017: Estimate gathering time

**As a** Player-Planner, **I want** gathering estimates for logs and ores,
**so that** I know how long raw collection should take.

Acceptance criteria:

- AC-1: The user can set one positive collection-per-hour rate for an active
  resource origin, reused wherever that origin participates.
- AC-2: Time in hours equals missing quantity divided by collection per hour.
- AC-3: Display formatting may use minutes, hours, or days without changing the
  base calculated value.

Edge cases:

- EC-1: Rate is absent, zero, negative, malformed, or non-finite → no time is
  calculated and the required rate is highlighted.
- EC-2: Missing quantity is zero → time is zero and the need is complete.
- EC-3: Rate or demand changes repeatedly → the latest complete values determine
  one recalculated result.
- EC-4: Very small or large time → display remains readable and does not round a
  positive requirement down to a misleading zero.

### US-018: Estimate monster farming time

**As a** Player-Planner, **I want** average monster-drop time estimates,
**so that** I can compare the intended farm against other work.

Acceptance criteria:

- AC-1: The user can set one positive kills-per-hour rate for each active monster,
  reused throughout the plan.
- AC-2: Loot Quantity globally adjusts the denominator using
  `round(base denominator / (1 + loot quantity / 100))`, with a minimum
  denominator of one; adjusted probability is capped at one.
- AC-3: Expected items per hour equals kills per hour times adjusted probability,
  and time equals missing quantity divided by that yield.
- AC-4: The UI states that the result is an expected average, not a guarantee.

Edge cases:

- EC-1: Kills per hour or Loot Quantity is malformed, negative, or non-finite →
  affected estimates are withheld with field-specific feedback.
- EC-2: Missing kills-per-hour rate → quantity and source remain visible while
  time is labeled not calculable.
- EC-3: Adjusted numerator would exceed denominator → probability remains one.
- EC-4: Denominator rounding is exactly at a half boundary → the documented
  nearest-integer rule is applied consistently and exposed in the shown rate.
- EC-5: Missing quantity is zero or calculations are repeated → no extra attempts
  are shown and the latest inputs determine one result.

### US-019: Estimate boss fights

**As a** Player-Planner, **I want** expected boss-fight counts,
**so that** I can plan active encounters without a misleading hourly estimate.

Acceptance criteria:

- AC-1: Boss adjusted probability uses the same Loot Quantity rule as monsters.
- AC-2: Expected fights equal missing quantity divided by adjusted probability.
- AC-3: Boss results are labeled “Estimated fights” and never require or display
  fights per hour.

Edge cases:

- EC-1: Loot Quantity or rate data is invalid → fights are withheld with an
  explanation while the item need remains visible.
- EC-2: Missing quantity is zero → estimated fights are zero.
- EC-3: Expected fights are fractional → the expected average is preserved;
  presentation may additionally clarify practical whole encounters without
  replacing the base value.
- EC-4: Source changes between bosses → only the selected boss rate is used.

### US-020: Estimate total smelting time

**As a** Player-Planner, **I want** prominent smelting-time estimates,
**so that** processing bottlenecks are visible.

Acceptance criteria:

- AC-1: Smelting seconds equal missing output quantity times per-unit process seconds.
- AC-2: Under one hour, time shows minutes and seconds; under one day, hours,
  minutes, and seconds; from one day, days, hours, minutes, and seconds.
- AC-3: Smelting duration is prominent in planner results and the smelting catalog.

Edge cases:

- EC-1: Missing quantity is zero → duration is zero and does not inflate totals.
- EC-2: A legacy process lacks a valid duration → the branch is unresolved and
  names the process requiring correction.
- EC-3: Duration crosses a display boundary by one second → it uses the correct
  format without dropping units.
- EC-4: Very large quantities → duration remains safe, readable, and traceable to
  quantity times per-unit duration.

### US-021: Distinguish status, type, quantity, and time

**As a** Player-Planner, **I want** strong visual hierarchy,
**so that** I can recognize what is missing, complete, and time-critical.

Acceptance criteria:

- AC-1: Completed and remaining states have prominent, non-color-only distinction.
- AC-2: Recipe, smelting, boss, monster, resource, and raw-item badges have
  consistent distinct treatments and readable labels.
- AC-3: Estimated time or fights is a primary result, visually stronger than
  supporting metadata.
- AC-4: Individual and consolidated quantities/times are visibly distinguishable.

Edge cases:

- EC-1: Images or optional metadata are absent → text labels and status remain clear.
- EC-2: Color perception, keyboard-only navigation, or increased text size →
  state and type remain understandable and controls remain reachable.
- EC-3: Long names and large values → content wraps or truncates with access to
  the full value without overlapping critical controls.
- EC-4: A result is not calculable → it is distinguished from zero and complete.

## Integrity and Navigation

### US-022: Prevent broken references and production cycles

**As a** Catalog Maintainer, **I want** relationship safeguards,
**so that** planner results cannot silently become invalid.

Acceptance criteria:

- AC-1: Referenced items/products cannot be deleted until all named associations
  are removed.
- AC-2: Direct and indirect cycles across recipes and smelting are rejected and
  every product in the cycle is identified.
- AC-3: Invalid external or legacy data is not accepted as the new valid state.

Edge cases:

- EC-1: Two deletions or edits race against the same association → one coherent
  state wins and the stale action receives current feedback.
- EC-2: A self-reference, two-node cycle, or long cross-type cycle is attempted →
  each is blocked before it affects planning.
- EC-3: A save is interrupted → either the previous valid graph or complete new
  graph remains, never a partial relationship set.
- EC-4: A very large dependency graph is validated → the user receives a result
  without unbounded recursion or an unexplained freeze.

### US-023: Reach the planner and ordered catalog sections

**As a** Player-Planner, **I want** clear navigation,
**so that** planning remains primary while maintenance tools stay organized.

Acceptance criteria:

- AC-1: The side menu visually separates and emphasizes Planner.
- AC-2: A CRUD subsection appears in this exact order: Recipes, Smelting, Bosses,
  Monsters, Resources, Items.
- AC-3: Current location is visible and every section is keyboard reachable.

Edge cases:

- EC-1: The window is narrow or text is enlarged → navigation remains operable
  without hiding the active section.
- EC-2: Rapid or repeated section activation → one section becomes active and
  unsaved-form handling is consistent.
- EC-3: A section has no data → its empty state appears without breaking the menu.
- EC-4: Focus returns from a nested or inline form → it returns to a logical control.

## Desktop Trust and Distribution

### US-024: Use local capabilities through constrained actions

**As a** Player-Planner, **I want** safe desktop behavior,
**so that** catalog management does not expose arbitrary system access.

Acceptance criteria:

- AC-1: The interface can request only explicitly supported operations for data,
  images, and opening the data location.
- AC-2: Unsupported or malformed requests are rejected without executing a native
  action or exposing raw system primitives to the interface.
- AC-3: The application loads no remotely supplied executable code.

Edge cases:

- EC-1: A request uses an unknown operation, malformed payload, path traversal,
  command text, or unexpected extra data → it is rejected safely.
- EC-2: The same native action is requested repeatedly → it cannot corrupt data or
  bypass validation.
- EC-3: A native action fails or the app closes mid-action → a bounded error is
  shown and the last valid data remains.
- EC-4: The app is offline → all core supported actions remain available.

### US-025: Validate and publish platform releases

**As a** Release Maintainer, **I want** one guarded publication command,
**so that** Linux and Windows users receive verifiable artifacts.

Acceptance criteria:

- AC-1: An executable shell publication script accepts a version, validates its
  format and repository safety, and stops before tags if any required validation
  or build fails.
- AC-2: For `<version>`, publication creates and sends `<version>`,
  `<version>-linux`, and `<version>-windows`.
- AC-3: Linux publication provides an installable `.deb` package and a ZIP
  containing it; Windows publication provides an NSIS installer and ZIP; the
  main version represents source and references both.
- AC-4: Each release publishes SHA-256 checksums, an SBOM, and provenance
  attestation when the publication infrastructure supports it.
- AC-5: Release automation uses minimum permissions, immutable automation
  dependencies, authorized branches, locked dependencies, and environment-secured
  credentials; code signing activates when author-owned credentials are supplied.

Edge cases:

- EC-1: Version is malformed, tags already exist, the worktree is unsafe, branch
  is unauthorized, or validation/build/audit fails → no new tags are sent.
- EC-2: One platform publication fails after source preparation → failure is
  explicit and the main release never falsely claims both platforms succeeded.
- EC-3: Publication is retried → existing immutable artifacts/tags are detected
  and never silently overwritten.
- EC-4: Signing credentials are absent → unsigned output is clearly identified
  and no secret is read from or written to the repository.
- EC-5: Artifact, checksum, SBOM, or supported attestation is missing → that
  platform release is incomplete and cannot be declared successful.

### US-026: Ship correct identity and native icons

**As a** Release Maintainer, **I want** consistent application identity,
**so that** installed artifacts are recognizable and attributable.

Acceptance criteria:

- AC-1: Package, installer, executable, and release metadata declare the product
  name, version, description, and author João Neto.
- AC-2: Required Windows and Linux icon variants are generated from the product
  identity and appear in supported window, taskbar/dock, switcher, menu, executable,
  and installer surfaces.
- AC-3: The `.deb` package, NSIS installer, and their ZIP artifacts retain
  correct identity.

Edge cases:

- EC-1: A required source icon or generated size is absent/invalid → packaging
  fails rather than shipping a generic or broken icon.
- EC-2: Linux desktop environments expose different supported surfaces → the
  package supplies standards-compatible icon metadata and assets.
- EC-3: Metadata version differs from the requested release → validation fails
  before tags or artifacts are published.
- EC-4: Packaging is repeated for another platform → platform assets do not
  overwrite or contaminate each other.
