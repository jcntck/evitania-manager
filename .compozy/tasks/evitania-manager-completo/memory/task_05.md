# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Replace the monolithic catalog renderer with native-DOM modules backed by AppStore and CatalogService, including relational search/multiselect, nested drafts/focus, managed images, scale behavior, and assigned Task 5 tests.

## Important Decisions

- `_tests.md` owns assigned observable behavior; TechSpec owns the ViewModule, AppStore, search-index, draft, and DesktopApi boundaries.
- Preserve the uncommitted Task 1–4 worktree and replace only renderer surfaces Task 5 explicitly supersedes.
- Keep planner behavior as a small compatibility module in this slice; Task 6 remains responsible for the complete planner renderer.
- Use one cohesive catalog view for the six navigation sections/seven catalog entity flows, with category-specific candidate construction but all normalization and rejection delegated to `CatalogService.apply`.
- Keep relation queries and editor/modal drafts in AppStore; render capped search results from a revision-local normalized index while retaining selected IDs outside the cap.

## Learnings

- No repository-root `AGENTS.md` or `CLAUDE.md` exists; the only discovered `AGENTS.md` is dependency-local and inapplicable.
- Baseline catalog UI uses catalog-value string interpolation, global document queries, plain relation selects, local mutable drafts, and duplicated validation/cycle rules.
- The existing AppStore already serializes mutations and owns generic drafts/focus/notices, but Task 5 must connect catalog candidate outcomes and modal state to it.
- The Electron E2E image journey needs a development-only queued dialog adapter; production continues using the native Electron dialog unchanged.
- Reusing the normalized relation index across query renders avoids rebuilding 5,000 normalized names on every keystroke; catalog lists cap visible cards while retaining the complete AppStore snapshot.

## Files / Surfaces

- Replaced `src/renderer/app.ts` with composition and added `src/renderer/catalog/catalog-view.ts`, `src/renderer/components/*`, and a planner compatibility view.
- Extended AppStore actions, renderer styling, main E2E dialog injection, dependency manifests, `test/renderer/*`, and `e2e/desktop.spec.ts`.

## Errors / Corrections

- Corrected child-success focus sequencing so focus is restored only after the child layer is removed and the final parent picker exists.
- Renderer async tests must settle chained AppStore dispatch continuations, not only the effect queue captured immediately after a DOM click.
- Corrected operation identity so repeated clicks within one editor session deduplicate, while a later independent edit receives a fresh operation ID.
- Extended inline creation beyond items so product component fields can create recipe or smelting products with their own searchable components.

## Ready for Next Run

- Task 5 implementation and assigned UT-042/043/044/050, IT-016/020, and E2E-003/004/005/006 coverage are complete.
- Fresh gate passed: 18 Vitest files / 143 tests, both TypeScript targets, deterministic seed check, production audit with 0 vulnerabilities, production build, 6 Playwright Electron journeys, and `git diff --check`.
- Contract parity passed against `_prd.md`, `_techspec.md`, `_user_stories.md`, `_tests.md`, Task 2/4 interfaces, and ADR-002/004/007/009/010.
- Automatic commit is disabled; leave the complete diff for manual review.
