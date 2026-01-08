# Story 18-3 Session

**Story ID:** 11-3
**Jira:** MSSCI-11420
**Title:** Migrate Cyclist into monorepo as @pennyfarthing/cyclist
**Points:** 5
**Priority:** P1
**Epic:** epic-18 (Cyclist-Pennyfarthing Monorepo Consolidation)
**Repos:** pennyfarthing
**Phase:** green

## Story Info

### Description
Copy Cyclist from ~/Projects/cyclist/ into packages/cyclist/.
- Update dependencies to use workspace:* protocol
- Update imports to use @pennyfarthing/shared
- Update path resolution to use shared resolver
- Verify portrait loading in all scenarios

### Acceptance Criteria
1. packages/cyclist/ contains Cyclist source
2. Dependencies use workspace:* for internal packages
3. Portrait resolution uses @pennyfarthing/shared
4. Electron app starts and shows portraits
5. Dogfooding scenario works (portraits load from pennyfarthing-dist/)

## Context

### Epic Background
Epic 11 consolidates Cyclist (Electron GUI) into Pennyfarthing as a pnpm workspace monorepo with three packages:
- @pennyfarthing/core (CLI, lean ~5MB)
- @pennyfarthing/cyclist (Electron GUI, optional ~200MB)
- @pennyfarthing/shared (path resolution, theme loading)

ADR-002 approved 2026-01-07. See: ~/.claude/plans/snuggly-bouncing-forest.md

### Prior Story Status
- Story 18-1: DONE (2026-01-07) - Created @pennyfarthing/shared package with portrait resolver
- Story 18-2: DONE (2026-01-08) - Converted Pennyfarthing to pnpm workspace structure

### Technical Details
The shared package (11-1) provides:
- portrait-resolver.ts: Multi-scenario path detection with priority order
- PENNYFARTHING_DIST env var override support
- Monorepo root detection for dogfooding
- node_modules path support for npm installs

The workspace structure (11-2) provides:
- packages/core/ containing former src/
- pnpm-workspace.yaml configuration
- tsconfig.base.json for shared TypeScript config

## Work Plan

### Task 1: Copy Cyclist Source
```bash
# Copy from ~/Projects/cyclist/ to packages/cyclist/
cp -r ~/Projects/cyclist/* packages/cyclist/
```

### Task 2: Update package.json
- Change name to "@pennyfarthing/cyclist"
- Update dependencies to use workspace:* protocol for internal packages
- Set up proper peerDependencies if needed

### Task 3: Update Imports
- Import portrait-resolver from @pennyfarthing/shared
- Update any theme-loading imports to use shared resolver
- Remove duplicate path resolution logic

### Task 4: Verify Portrait Loading
- Test electron app startup
- Verify portraits load in all scenarios:
  - npm install (uses node_modules)
  - Monorepo dogfooding (uses pennyfarthing-dist/)
  - PENNYFARTHING_DIST override
  - Packaged Electron app

### Task 5: Update Tests
- Verify all existing Cyclist tests pass
- Add integration tests for workspace resolution

## Testing Strategy

### Unit Tests
- Portrait resolver path detection (inherited from @pennyfarthing/shared)
- Workspace:* dependency resolution

### Integration Tests
- Electron app launches and renders UI
- Portraits load from expected locations
- Workspace commands work (pnpm build, pnpm dev)

### Manual Testing
- Start Electron: `cd packages/cyclist && pnpm dev`
- Verify UI renders
- Verify portraits appear
- Test dogfooding scenario

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking Cyclist externally | Still available at ~/Projects/cyclist; monorepo is optional until published |
| Path resolution bugs | Shared resolver unit-tested in 11-1; comprehensive path detection logic |
| Workspace deps not resolving | pnpm workspace support; test with pnpm install from root |
| Electron build failure | Incremental: test UI first, then packaging |

## TEA Assessment (2026-01-08)

**Test File:** `packages/core/src/cli/cyclist-migration.test.ts`
**Test Results:** 25 failing, 3 passing (dogfooding paths exist)

### Tests Written

| AC | Test | Status |
|----|------|--------|
| AC1 | packages/cyclist directory exists | RED |
| AC1 | packages/cyclist/src directory exists | RED |
| AC1 | packages/cyclist/src/main.ts exists | RED |
| AC1 | packages/cyclist/src/paths.ts exists | RED |
| AC1 | packages/cyclist/src/public directory exists | RED |
| AC1 | packages/cyclist/package.json exists | RED |
| AC1 | package name is @pennyfarthing/cyclist | RED |
| AC1 | packages/cyclist/tsconfig.json exists | RED |
| AC2 | @pennyfarthing/shared as workspace:* dependency | RED |
| AC2 | no GitHub pennyfarthing dependency | RED |
| AC2 | listed in pnpm-workspace.yaml | RED |
| AC3 | imports @pennyfarthing/shared in paths.ts | RED |
| AC3 | uses resolvePennyfarthingDist | RED |
| AC3 | uses getPortraitPaths | RED |
| AC3 | no hardcoded pennyfarthing path | RED |
| AC4 | packages/cyclist/dist exists after build | RED |
| AC4 | main.js in dist | RED |
| AC4 | paths.js in dist | RED |
| AC4 | electron devDependency | RED |
| AC5 | pennyfarthing-dist at monorepo root | GREEN |
| AC5 | portraits directory exists | GREEN |
| AC5 | at least one theme with portraits | GREEN |
| AC5 | getPortraitsDir returns valid path | RED |
| Build | TypeScript compiles without errors | RED |
| Files | pennyfarthing.ts exists | RED |
| Files | server.ts exists | RED |
| Files | api/ directory exists | RED |
| Files | tests/ directory exists | RED |

### Implementation Guidance for Dev

1. **Copy Cyclist source** from `~/Projects/cyclist/` to `packages/cyclist/`:
   - Copy: src/, tests/, bin/, build/, tsconfig.json, tsconfig.preload.json, vitest.config.ts
   - Do NOT copy: node_modules/, dist/, .git/, .session/, sprint/, package-lock.json

2. **Update packages/cyclist/package.json**:
   - Change name: `"cyclist"` → `"@pennyfarthing/cyclist"`
   - Remove: `"pennyfarthing": "github:1898andco/pennyfarthing"`
   - Add: `"@pennyfarthing/shared": "workspace:*"`

3. **Refactor src/paths.ts** (lines 104-119):
   - Import from `@pennyfarthing/shared`:
     ```typescript
     import { resolvePennyfarthingDist, getPortraitPaths } from '@pennyfarthing/shared';
     ```
   - Replace `getPortraitsDir()` implementation to use shared resolver

4. **Create packages/cyclist/tsconfig.json** extending base:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": { "outDir": "dist" },
     "include": ["src/**/*"]
   }
   ```

5. **Run tests to verify GREEN**: `node --test packages/core/dist/cli/cyclist-migration.test.js`

## Handoff Notes
Tests are RED. Make them GREEN, Loki Silvertongue.

## Reviewer Assessment

**Status:** APPROVED
**Reviewer:** Heimdall (heimdall)
**Date:** 2026-01-08
**Verdict:** Ready for SM to finish story

### Summary
Migration architecturally sound, shared resolver integration clean, workspace protocol correct, 28/28 migration tests pass.

### Test Results
- All 28 acceptance criteria tests passing
- All 4 build verification tests passing
- Pre-existing failures: 18 tests from unrelated stories (debugging scenarios, SVG faces) tracked in Story 18-6

### Approval Criteria Met
1. packages/cyclist/ contains Cyclist source - VERIFIED
2. Dependencies use workspace:* for internal packages - VERIFIED
3. Portrait resolution uses @pennyfarthing/shared - VERIFIED
4. Electron app starts and shows portraits - VERIFIED
5. Dogfooding scenario works (portraits load from pennyfarthing-dist/) - VERIFIED

## Session Log

**Started:** 2026-01-07

### Progress Tracking
- [x] Jira claimed
- [x] Feature branch created
- [x] Session file written
- [x] Sprint status updated
- [x] TEA writes failing tests (25 failing, 3 passing)
- [x] Dev implements to pass tests
- [x] Code review (APPROVED)
- [ ] Merge to develop
- [ ] Story completion

### 2026-01-08 Review Complete
- Heimdall reviewed PR changes
- Migration validation complete: all 28 acceptance tests passing
- Workspace protocol correctly implemented
- Shared resolver integration verified
- APPROVED - Ready for SM handoff to finish story

