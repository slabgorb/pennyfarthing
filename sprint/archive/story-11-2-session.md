# Story 11-2: Convert Pennyfarthing to pnpm workspace structure

## Story Info
- Story ID: 11-2
- Title: Convert Pennyfarthing to pnpm workspace structure
- Points: 5
- Epic: epic-11 (Cyclist-Pennyfarthing Monorepo Consolidation)
- Jira: MSSCI-11419
- Priority: P1
- Repo: pennyfarthing
- Status: in-progress
- Started: 2026-01-08

## Description
Restructure Pennyfarthing repository as a pnpm workspace monorepo. This is Phase 2 of the monorepo consolidation that enables integration of the Cyclist Electron GUI.

Key changes:
- Create packages/core/ and move existing src/
- Create root pnpm-workspace.yaml
- Create tsconfig.base.json for shared config
- Update all import paths
- Verify npm run build still works

## Acceptance Criteria
1. packages/core/src/ contains former src/
2. pnpm-workspace.yaml defines packages/*
3. pnpm install works from root
4. pnpm build compiles all packages
5. pennyfarthing CLI still functional
6. Existing tests pass

## Epic Context
Epic 11 focuses on merging Cyclist (Electron GUI) into Pennyfarthing as a pnpm workspace monorepo. Story 11-2 is Phase 2 (Monorepo Conversion), following the completed Story 11-1 (Create @pennyfarthing/shared package).

The monorepo will have three packages:
- @pennyfarthing/core (CLI, lean ~5MB)
- @pennyfarthing/cyclist (Electron GUI, optional ~200MB)
- @pennyfarthing/shared (path resolution, theme loading)

ADR-002 approved 2026-01-07.

Related stories:
- 11-1: Create @pennyfarthing/shared package (DONE)
- 11-3: Migrate Cyclist into monorepo
- 11-4: Test all install and runtime scenarios
- 11-5: Update CI/CD and publish scoped packages

## Implementation Notes
This is a structural refactoring with no functional changes. Maintain all existing behavior while reorganizing the file layout.

Key directories to handle:
- src/ → packages/core/src/
- dist/ → packages/core/dist/
- tests/ → packages/core/tests/ (if exists)
- scripts/ → packages/core/scripts/ (if exists)
- package.json → packages/core/package.json (update root package.json)

Preserve git history where possible.

## Current Phase
**PHASE: red** (tests written and failing - ready for Dev)

## Workflow
- [ ] Story claimed in Jira
- [x] Session file created
- [x] Feature branch created (feat/11-2-pnpm-workspace)
- [x] TEA writes failing tests
- [ ] Dev implements to pass tests
- [ ] Code review
- [ ] Merge to develop
- [ ] Story completion

## TEA Assessment (2026-01-08)

**Test File:** `src/cli/workspace.test.ts`
**Test Results:** 17 failing, 1 passing (packages/shared/dist exists from 11-1)

### Tests Written

| AC | Test | Status |
|----|------|--------|
| AC1 | packages/core directory exists | RED |
| AC1 | packages/core/src directory exists | RED |
| AC1 | packages/core/src/cli exists | RED |
| AC1 | packages/core/bin/pennyfarthing.js exists | RED |
| AC1 | packages/core/package.json exists | RED |
| AC1 | package name is @pennyfarthing/core | RED |
| AC2 | pnpm-workspace.yaml exists | RED |
| AC2 | workspace defines packages/* | RED |
| AC3 | pnpm-lock.yaml exists | RED |
| AC4 | tsconfig.base.json exists | RED |
| AC4 | packages/core/tsconfig.json exists | RED |
| AC4 | packages/core/dist exists after build | RED |
| AC4 | packages/shared/dist exists | GREEN |
| AC5 | bin entry in packages/core/package.json | RED |
| AC5 | pennyfarthing --version works | RED |
| AC6 | test files in packages/core/src | RED |
| Extra | @pennyfarthing/shared in core deps | RED |
| Extra | root package.json is workspace root | RED |

### Implementation Guidance for Dev

1. Create `pnpm-workspace.yaml` at root:
   ```yaml
   packages:
     - 'packages/*'
   ```

2. Create `tsconfig.base.json` with shared TS config

3. Create `packages/core/` directory structure:
   - Move `src/` → `packages/core/src/`
   - Move `bin/` → `packages/core/bin/`
   - Create `packages/core/package.json` with name `@pennyfarthing/core`
   - Create `packages/core/tsconfig.json` extending base

4. Update root `package.json` to be workspace root (private: true, no deps)

5. Add workspace dependency: `@pennyfarthing/shared: "workspace:*"`

6. Run `pnpm install` then `pnpm build` then `pnpm test`

## Handoff Notes
Tests are RED. Make them GREEN, Loki Silvertongue.
