# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

## Shared Decisions

## Shared Learnings

- With the current plain-`tsc` Electron build, a sandboxed preload cannot runtime-`require` local compiled modules. Keep preload runtime code self-contained and use type-only imports to constrain it to shared contracts, unless a future task adds an explicit preload bundling step.

## Open Risks

## Handoffs
