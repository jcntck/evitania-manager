---
status: completed
title: "Debian/NSIS distribution and verifiable releases"
type: infra
complexity: critical
---

# Task 7: Debian/NSIS distribution and verifiable releases

## Overview

Deliver the complete cross-platform distribution contract after application
behavior stabilizes: native `.deb` and NSIS artifacts, platform ZIPs, immutable
three-tag publication, evidence generation, metadata/icons, conditional signing,
and packaged smoke verification. This slice replaces every active AppImage path
and prevents partial or unverifiable releases.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. Linux packaging MUST produce `.deb` and a ZIP containing exactly that package; Windows MUST produce NSIS `.exe` and a ZIP containing exactly that installer.
2. Publication preflight MUST validate version, package version, authorized branch, clean worktree, absence of all three tags, locked install, full tests, typecheck, audit, seed reproducibility, build, and artifact inventory before any push.
3. Platform and source tags/releases MUST follow the immutable `<version>-linux`, `<version>-windows`, then `<version>` topology without silent overwrite or false partial success.
4. Every platform release MUST contain verified SHA-256, CycloneDX SBOM, and supported provenance-attestation subjects and MUST reject missing/cross-platform/extra evidence.
5. Package, installer, executable, and release metadata MUST declare product, version, description, and João Neto; Debian desktop/icon and NSIS icon metadata MUST be inspected.
6. Missing/invalid required icon sources or variants MUST fail packaging, and platform outputs/assets MUST remain isolated.
7. Actions MUST remain pinned to immutable commits with minimum permissions; credentials MUST come only from CI environment and Windows signing status MUST be explicit.
8. Linux and Windows jobs MUST install/launch packaged artifacts with isolated user data and verify persistence plus evidence.
9. Release summaries SHOULD publish bounded duration and artifact inventories, and operational documentation MUST describe the final topology.
</requirements>

## Subtasks

- [ ] 7.1 Deliver `.deb`/NSIS builder targets and isolated per-platform ZIP outputs.
- [ ] 7.2 Deliver mandatory native icon and metadata validation barriers.
- [ ] 7.3 Deliver complete preflight and immutable transactional three-tag/release topology.
- [ ] 7.4 Deliver strict artifact inventory, SHA-256, CycloneDX SBOM, and attestation subjects.
- [ ] 7.5 Restructure GitHub Actions for platform publication and main source aggregation.
- [ ] 7.6 Deliver conditional Windows signing and explicit signed/unsigned reporting.
- [ ] 7.7 Deliver temporary-Git and artifact-fixture release test harnesses.
- [ ] 7.8 Deliver Linux `.deb` and Windows NSIS packaged smoke tests.
- [ ] 7.9 Update release, installation, signing, and user-verification documentation.

## Implementation Details

Follow TechSpec “Build and Release Infrastructure” and “Desktop Distribution”.
The publication command must establish all mandatory evidence before sending any
tag. Keep platform artifact directories isolated and treat tags/releases as
immutable external state.

### Relevant Files

- `package.json` and `package-lock.json` — current AppImage target, scripts, exact dependencies, and metadata.
- `.github/workflows/release.yml` — current one-tag AppImage/EXE matrix and single release.
- `scripts/release.sh` — current partial preflight and single-tag publication.
- `scripts/release-metadata.mjs` — current AppImage/EXE inventory, hashes, and SBOM.
- `scripts/clean-release.mjs` — output cleanup requiring platform isolation.
- `scripts/generate-icons.mjs` — icon generation requiring mandatory validation.
- `assets/app/icon.svg`, `assets/app/icon.png`, and `assets/app/icon.ico` — identity inputs/outputs.
- `src/main/main.ts` — packaged window identity exercised by smoke tests.
- `docs/releases.md` and `docs/seguranca-windows.md` — operational release/signing contract.
- `vitest.config.ts` and package scripts — release/integration/E2E harness execution.

New files should be limited to cohesive release validators/tests and Playwright
platform specs/fixtures required by `_tests.md`.

### Dependent Files

- `assets/seed/seed-v2.json` and `scripts/compile-seed.mjs` — reproducibility gate from Task 1.
- Completed renderer/domain/main build from Task 6 — packaged smoke subject.
- User-data persistence and DesktopApi — restart/persistence smoke behavior.
- GitHub Actions/Releases and `gh` — only external publication integration.

### Related ADRs

- [ADR-005: Distribute Linux Releases as Debian Packages](adrs/adr-005.md) — `.deb` replaces AppImage.
- [ADR-010: Precompile Seed Data and Test at Four Boundaries](adrs/adr-010.md) — packaged platform smoke and release evidence coverage.

## Deliverables

- Installable `.deb`/NSIS artifacts and exact platform ZIPs with correct identity/icons.
- Guarded three-tag/three-release publication flow with no partial-success claim.
- Verified SHA-256, CycloneDX SBOM, and supported provenance attestation inventories.
- Conditional secure signing and updated release/security/user documentation.
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**.

## Tests

Cases assigned from `_tests.md`; read every full definition before implementation.

- [ ] UT-057, UT-058, UT-059, UT-060 — preflight, topology, artifact evidence, metadata, icons, and signing.
- [ ] IT-018, IT-019 — temporary-Git publication and real artifact evidence inspection.
- [ ] E2E-012, E2E-013, E2E-014 — packaged Linux, packaged Windows, and complete publication topology journeys.

## Success Criteria

- Every assigned test case implemented and passing.
- No active build, workflow, script, documentation, or evidence path publishes AppImage.
- Failed mandatory gates push no new tag and main release never precedes both platforms.
- `.deb`, NSIS, ZIP, checksum, SBOM, metadata/icon, and attestation inventories reconcile exactly.
- Signing credentials are never stored/read from the repository and unsigned status is explicit.
