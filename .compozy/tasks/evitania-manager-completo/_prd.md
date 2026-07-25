# Product Requirements Document: Complete Evitania Manager

## Overview

Evitania Manager is a local-first desktop companion for Evitania players on
Linux and Windows. It replaces manually maintained spreadsheets with an
editable game catalog and a production planner that answers four practical
questions: what must be produced or acquired, how much is still missing, where
each raw item will come from, and how long the remaining work is expected to take.

The product models raw items, collectible resources, forge recipes, smelting
processes, monsters, bosses, and drops. A player creates multiple recipe
objectives, supplies global stock and farming rates, selects sources, and moves
between per-objective production trees and one consolidated action list.

This PRD supersedes conflicting v0.2.3 behavior. The complete content under
`.ai/` is the baseline; conforming existing work may be retained, while
nonconforming behavior may be replaced.

## Goals

- Players can start from a useful editable catalog instead of reconstructing all
  game data before their first plan.
- Players can create and maintain every catalog relationship without leaving and
  losing the form they are currently editing.
- Players can define multiple ordered crafting objectives and see every
  intermediate product, raw material, quantity, source, and expected duration.
- The system deducts persistent global stock exactly once and expands only the
  genuinely missing portion of each dependency.
- Players can understand each objective through a production tree and execute
  the whole plan through a deduplicated consolidated list.
- Gathering, monster drop, boss drop, and smelting estimates follow explicit,
  reproducible rules and clearly distinguish expected averages from guarantees.
- Invalid references, duplicate drops, unsafe deletion, malformed quantities,
  and direct or indirect production cycles cannot enter the valid product state.
- Catalogs, plans, stock, preferences, images, and completion records remain
  usable offline and survive restarts.
- Linux and Windows users receive identifiable, verifiable release artifacts
  produced by one guarded publication flow.

## User Stories

- `US-001`–`US-003`: local workspace, discoverability, and managed images.
- `US-004`–`US-010`: complete catalog CRUD and scalable relational editing.
- `US-011`–`US-016`: objectives, trees, consolidation, stock, completion, and sources.
- `US-017`–`US-021`: gathering, combat, smelting calculations, and planner feedback.
- `US-022`–`US-024`: data integrity, navigation, and constrained desktop behavior.
- `US-025`–`US-026`: trusted distribution, identity, and native icons.

[Full user stories](_user_stories.md)

## Core Features

### Editable Initial Catalog

- First use provides valid catalog data available in the project, including
  unambiguous records that can be normalized from `docs/base-cadastro.xlsx`.
- Bundled records are ordinary editable local records; they are not protected
  from correction or deletion.
- Ambiguous or invalid source rows are omitted rather than interpreted by guesswork.
- The product remains fully usable when no seed record is available.

### Central Items

- Items represent raw materials obtained by collection, monsters, or bosses.
- Each item has a required name and optional managed image.
- The same item record can be linked to resources, monster drops, boss drops,
  recipe components, and smelting components.
- Deletion of any referenced item is blocked until every named association is removed.

### Collectible Resources

- A resource links one raw item to Act I, II, or III and may have its own image.
- A linked resource makes its item eligible for gathering-rate estimates.
- A raw item without a resource origin remains a valid item but cannot receive a
  gathering-time estimate.

### Recipes

- A recipe produces one product of type `recipe`.
- It has at least one distinct component; a component may be a raw item, recipe
  product, or smelting product.
- Every component carries its own positive integer quantity.
- Recipe products are the only eligible top-level planner objectives and may
  also be intermediate components.

### Smelting

- A smelting process produces one product of type `smelting`.
- It has at least one distinct raw-item or product component with an independent
  positive integer quantity.
- It carries a positive processing time per output unit, stored conceptually in
  whole seconds and displayed prominently in catalog and planner results.
- Duration entry accepts documented human-friendly values such as `1m 30s`,
  `1:30`, `90`, or `90s`, for durations from seconds through days.
- Processing time belongs to the smelting process, not to the shared product.

### Monsters and Bosses

- Monsters and bosses each have a required name, Act I–III, optional image, and
  zero or more raw-item drops.
- Each drop has a positive integer numerator and denominator and is presented as
  `x in y`; its base probability cannot exceed one.
- A monster or boss cannot contain the same item twice.
- A drop can link an existing item or create the missing item inline.
- Monsters provide hourly farming estimates. Bosses provide expected fight
  counts and never require fights per hour.

### Managed Images

- Item, resource, recipe, smelting, monster, and boss forms can select a local
  PNG or JPEG, preview it, replace it, or remove it before saving.
- The application validates extension, declared type, and basic file content.
- It generates the destination name, copies the file into the module-specific
  managed asset directory, and stores only the managed reference.
- User-provided path components never determine the destination.
- Failed or interrupted image operations cannot leave a valid record pointing
  at a partial or invalid file.

### Scalable Relational Editing

- Every relationship field is searchable by record name and remains usable with
  a large catalog.
- Recipe and smelting forms can select multiple components in one action, then
  assign and edit an independent quantity for every selected component.
- Every relationship field can open inline creation for an eligible missing
  dependency.
- Parent form values survive inline creation or cancellation.
- Successful inline creation returns to the parent and automatically selects the
  new record.

### Planner Objectives and Priority

- Each objective selects one recipe product and a positive integer output quantity.
- The player can add, edit, remove, reorder, complete, and restore multiple objectives.
- Order is explicit priority: the first pending objective receives available
  global stock before later objectives.
- Completing an objective removes only its needs from all pending calculations
  without deleting the objective. Restoring it recalculates its participation.

### Per-Objective Production Trees

- Each objective has an expandable tree from the target recipe through all
  recipe and smelting intermediates to raw materials.
- Nodes display type, required quantity, allocated stock, missing quantity, and
  source/time information where applicable.
- Only missing output after stock and completion expands into lower components.
- Repeated components remain traceable on each causal path.
- Invalid legacy branches stop visibly and never prevent independent valid
  branches from being inspected.

### Consolidated Pending List

- The player switches between per-objective trees and one consolidated list
  without changing the plan.
- The list combines identical components from pending objectives into one row
  with summed required, allocated-stock, and missing quantities.
- Completed objectives contribute nothing to pending totals.
- Individual and consolidated results remain visually distinguishable.

### Persistent Global Stock

- One nonnegative integer balance per raw item or product persists across restarts.
- The balance is allocated once across pending objectives in priority order.
- Insufficient stock is never duplicated across individual trees.
- Reordering objectives deterministically reallocates stock and recalculates
  affected missing quantities.
- Stock that completely satisfies an output prevents expansion of that satisfied
  portion into its components.

### Consolidated Completion Credits

- Completing a consolidated need adds its current positive integer missing
  quantity to global stock.
- The product records the exact item and credited amount, then recalculates the plan.
- Reversing completion removes exactly that recorded credit, preserving unrelated
  manual stock changes.
- Reversal cannot create negative stock; if later changes make reversal
  impossible, the product explains the conflict instead of corrupting stock.
- Repeated or interrupted completion cannot apply a credit more than once.

### Source Selection

- A required raw item lists every compatible resource, monster, and boss origin
  separately with its act and rate information.
- One active origin per item applies globally to every objective and persists.
- When only one origin exists, it can be used without needless user intervention.
- When several exist, the player explicitly chooses; incompatible sources are
  never summed.
- When no valid active source exists, the requirement and missing quantity remain
  visible while time/fights are labeled not calculable.

### Planner Inputs and Estimates

- One collection-per-hour value is reused for each selected resource origin.
- One kills-per-hour value is reused for each selected monster.
- One global Loot Quantity value adjusts every selected monster and boss drop.
- Missing rates never hide quantities; they withhold only the affected estimate
  and identify the required input.
- Calculated drop outcomes are expected averages and are never described as
  guaranteed acquisition times or fight counts.

### Navigation and Visual Hierarchy

- Planner is visually separated and emphasized as the primary side-menu action.
- Catalog sections appear under a distinct subsection in this exact order:
  Recipes, Smelting, Bosses, Monsters, Resources, Items.
- Completed and remaining states receive prominent text/shape treatment, not
  color alone.
- Recipe, smelting, boss, monster, resource, and raw-item badges use distinct,
  consistent, accessible treatments.
- Time or expected fights is a primary result rather than secondary small text.
- Long names, large values, missing images, keyboard navigation, and increased
  text size do not remove critical information or actions.

### Local Data Controls

- Catalog, plan, stock, selected sources, rates, preferences, images, and
  completion records work without network connectivity and persist locally.
- Managed images live under `assets/<module>/` inside the application user-data area.
- “Open data location” opens the containing local folder or displays an
  actionable failure.
- “Synchronize” remains visible, disabled, and clearly marked unavailable until
  a separate Google Drive synchronization scope is defined.

### Desktop Distribution

- Production output includes an installable Linux `.deb` package and a ZIP
  containing it, plus a Windows NSIS installer and its ZIP.
- Product, package, installer, executable, and release metadata declare name,
  version, description, and author **João Neto**.
- Required Linux and Windows icon variants appear on the native surfaces each
  operating system supports, including application window, taskbar or dock,
  switcher, context/menu surfaces, executable, and installer.
- A guarded executable shell command validates a supplied version and repository
  safety before publication.
- `<version>` identifies source; `<version>-linux` publishes the `.deb` package
  and its ZIP; `<version>-windows` publishes the NSIS installer and its ZIP. The
  main version references both platform outputs.
- Tags are not sent when a mandatory validation, audit, packaging, or publication
  prerequisite fails.
- Releases include SHA-256 checksums and an SBOM, plus provenance attestation
  when supported by the publication infrastructure.

## Business Rules

### Quantities and Identity

- Objective, component, stock, and completion-credit quantities are safe positive
  integers, except stock may be zero.
- Collection rates, kill rates, probabilities, expected attempts, and calculated
  times may be decimal.
- Names are required nonblank strings for items, products, monsters, and bosses.
- Product type is exactly `recipe` or `smelting` and agrees with its owning process.
- Act is exactly I, II, or III.
- IDs remain stable across edits; no deletion or recreation may silently transfer
  relationships, stock, objectives, or completion records to a different entity.

### Relationship Integrity

- A recipe or smelting process has at least one component.
- The same component appears at most once in one recipe or smelting process.
- The same raw item appears at most once in one monster's drops and once in one
  boss's drops.
- Referenced entities cannot be deleted while associations remain.
- Direct and indirect cycles across recipe and smelting products are forbidden.
  A rejected cycle identifies all involved products.
- Stale relationship submissions are rejected while preserving other valid form input.

### Calculation Order

For each recalculation:

1. Exclude completed objectives.
2. Traverse pending objectives in explicit priority order.
3. Determine each required output quantity.
4. Allocate available global stock without reusing a unit already allocated to
   a higher-priority objective.
5. Subtract applicable completion-derived stock through the same stock balance.
6. Expand only the missing quantity into components.
7. Consolidate identical pending components after preserving their per-objective paths.
8. Apply the one active source and shared rate inputs to raw missing quantities.

All views derive from the same recalculated state.

### Gathering

For a collectible resource with a positive rate:

```text
time_hours = missing_quantity / collection_per_hour
```

The base result remains hours. Display conversion does not alter that value.

### Monster and Boss Drops

For a drop `x in y`:

```text
base_probability = numerator / denominator
loot_multiplier = 1 + (loot_quantity / 100)
adjusted_denominator = max(1, round(base_denominator / loot_multiplier))
adjusted_probability = min(1, base_numerator / adjusted_denominator)
expected_attempts = missing_quantity / adjusted_probability
```

The denominator is rounded to the nearest integer before probability is
calculated, reproducing the rate shown by the game. The same deterministic
nearest-integer convention must be used at half boundaries throughout the product.

For monsters:

```text
expected_items_per_hour = kills_per_hour * adjusted_probability
time_hours = missing_quantity / expected_items_per_hour
```

Equivalently:

```text
time_hours = expected_attempts / kills_per_hour
```

For bosses, the result is only:

```text
estimated_fights = expected_attempts
```

The product does not compute probability of acquiring all desired items within
a period. All drop calculations use expected average yield.

### Smelting

```text
smelting_time_seconds =
  missing_output_quantity * processing_time_per_unit_seconds
```

Display rules:

- Below one hour: minutes and seconds.
- From one hour to less than one day: hours, minutes, and seconds.
- From one day: days, hours, minutes, and seconds.

Boundary formatting cannot change the base seconds or round a positive duration
to a misleading zero.

### Completion State

- Objective completion is a reversible status and does not alter stock.
- Consolidated-need completion is a reversible stock-credit action.
- A consolidated completion with zero missing quantity is unavailable.
- A duplicate completion action cannot create a second credit.
- Demand changes do not mutate the amount of an existing completion credit.
- Undo removes exactly the original credit or refuses with an explanation if
  that would make stock negative.

### Validation Outcomes

- Invalid input is rejected next to the relevant field and does not destroy
  other valid draft values.
- Repeated submissions create at most one logical operation.
- Interrupted persistence leaves either the previous valid state or the complete
  new state, never a partial valid-looking state.
- Invalid external or legacy data cannot replace the last valid state.
- A missing rate, source, or optional image is not represented as zero.

## User Experience

### First Use

1. The player opens a populated local workspace.
2. The Planner action is the strongest navigation entry.
3. If desired, the player inspects or corrects catalog data through the ordered
   CRUD subsection.
4. Empty or incomplete catalog areas explain the next available creation action.

### Catalog Maintenance

1. The maintainer opens a module.
2. They search existing records or create a new one.
3. Relationship fields search at scale and can create a missing dependency inline.
4. In recipe/smelting forms, the maintainer selects several components, then
   assigns individual quantities.
5. The form previews images and normalized duration/rate inputs.
6. Save either commits a complete valid record or preserves the draft with
   precise correction guidance.

### Regular Planning

1. The player creates one or more recipe objectives with integer quantities.
2. They reorder objectives to express stock-allocation priority.
3. They maintain global stock, resource collection rates, monster kill rates,
   global Loot Quantity, and one active source per raw item.
4. They inspect each objective's expandable production tree.
5. They switch to the consolidated list for the combined actionable workload.
6. They complete an objective or credit an acquired consolidated need.
7. They can reverse either action and see all quantities and estimates recalculate.

### Presentation and Accessibility

- State and category never rely on color alone.
- Planner times/fights, missing quantities, and completion status are readable at
  a glance and retain explicit labels.
- Controls have visible keyboard focus, logical focus return after nested flows,
  and operable keyboard interaction.
- Text enlargement, long localized values, absent images, and narrow desktop
  windows do not obscure critical actions.
- Collapsible trees keep large dependency graphs navigable.
- “Not calculable” is visually and semantically distinct from zero and complete.

## High-Level Technical Constraints

- The product is an Electron desktop application for Linux and Windows.
- Renderer isolation is mandatory: context isolation enabled, Node integration
  disabled, and renderer sandbox enabled.
- Native behavior is available only through narrow operations exposed to the
  interface. Raw renderer messaging, Node.js, filesystem, and command execution
  capabilities are never exposed.
- Every native operation uses an explicit allowlist and validates input before
  acting.
- A restrictive Content Security Policy forbids remotely loaded executable code.
- Images require extension, type, and basic content validation; destination
  names are application-generated and user paths are never trusted.
- Persistence must represent all required relationships, preserve stable
  identity, support safe evolution from valid v0.2.3 data, and leave room for a
  separately specified future Google Drive file synchronization capability.
- User-perceived interaction with ordinary catalog and plan sizes must remain
  responsive. At 100× typical catalog, objective, or dependency volume, the
  application must remain bounded, searchable, collapsible, and must never omit
  valid results silently.
- Dependencies are locked for release validation and audited before publication.
- Every published version produces its artifacts, SHA-256 checksums, and SBOM in
  the same automated flow.
- Release automation uses minimum permissions, automation dependencies fixed to
  immutable revisions, authorized publication branches, and secrets supplied
  only by secure CI storage.
- Packaging is prepared for code signing. Effective signing is conditional on
  appropriate author credentials and follows `docs/seguranca-windows.md`.
- Provenance attestation is enabled and attached when the publication
  infrastructure supports it.

## Non-Goals (Out of Scope)

- A mobile version of Evitania Manager; mobile refers to the game platform, while
  this product is explicitly a desktop Electron application.
- Google Drive synchronization, user accounts, cloud storage, collaborative
  editing, or a remote backend; only future compatibility and a disabled control
  are required.
- Automatic extraction or live updating of game data from Evitania, Steam, a
  wiki, or another remote source.
- Treating bundled data as an immutable official catalog.
- Automatically combining multiple incompatible gathering or drop origins.
- Predicting a guaranteed completion time or cumulative probability for random drops.
- Digital signing without the required author-owned certificates or keys.
- Storing secrets, tokens, signing credentials, or certificates in the repository.
- AppImage distribution; Linux releases use `.deb` exclusively.

## Architecture Decision Records

- [ADR-001: Treat `.ai/` as the Product Baseline](adrs/adr-001.md) — `.ai/`
  supersedes conflicting v0.2.3 behavior and valid project data seeds an editable catalog.
- [ADR-002: Use Scalable Relational Selection with Inline Creation](adrs/adr-002.md)
  — searchable relationships, inline creation, and per-component quantities
  support catalog growth.
- [ADR-003: Combine Objective Trees with a Consolidated Priority Plan](adrs/adr-003.md)
  — per-objective trees, global priority stock, and reversible completion feed
  one consolidated action list.
- [ADR-004: Keep User Data and Managed Assets Local-First](adrs/adr-004.md) —
  offline data and module assets live in the application user-data area.
- [ADR-005: Distribute Linux Releases as Debian Packages](adrs/adr-005.md) —
  Linux releases provide `.deb` and its ZIP instead of AppImage.

## Open Questions

None. Remaining implementation choices belong to the Technical Specification.
