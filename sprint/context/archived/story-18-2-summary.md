# Story 18-2: Convert Pennyfarthing to pnpm workspace structure - Summary
<!-- NOTE: Was Story 18-2, renumbered with epic -->

**Epic:** 18 - Cyclist-Pennyfarthing Monorepo Consolidation
**Points:** 5 | **Priority:** P1
**Repos:** pennyfarthing
**Jira:** MSSCI-11419
**Completed:** 2026-01-08

## What Was Built
Restructured the Pennyfarthing repository from a single-package npm project to a pnpm workspace monorepo. This Phase 2 of Epic 18 enables future integration of the Cyclist Electron GUI by establishing a shared workspace structure with proper package isolation.

## Key Technical Decisions
- Used `tsconfig.base.json` at root with package-level configs extending it, enabling shared TypeScript settings while allowing per-package customization
- Implemented `findMonorepoRoot()` utility in path-utils.ts to handle dynamic path resolution regardless of execution context (root vs package directory)
- Kept `pennyfarthing-dist/` at repository root (not in packages/core) since it's the single source of truth for all agent/command definitions accessed via symlinks
- Root package.json set to `private: true` with workspace scripts delegating to package-level commands

## Implementation Patterns
- **Workspace Protocol**: Used `workspace:*` for inter-package dependencies (e.g., `@pennyfarthing/shared` in core)
- **Path Resolution**: All relative paths now use monorepo-aware detection rather than assuming execution from a fixed location
- **Build Delegation**: Root-level `pnpm build` triggers builds across all packages in dependency order

## Acceptance Criteria Met
- [x] packages/core/src/ contains former src/
- [x] pnpm-workspace.yaml defines packages/*
- [x] pnpm install works from root
- [x] pnpm build compiles all packages
- [x] pennyfarthing CLI still functional
- [x] Existing tests pass (513 failures resolved; 19 pre-existing failures documented in 11-6)

## Files Modified
- 234 files changed across the structural migration
- Created: `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/tsconfig.json`
- Moved: `src/` → `packages/core/src/`, `bin/` → `packages/core/bin/`, `dist/` → `packages/core/dist/`
- Updated: Root `package.json` converted to workspace root, 14 files updated for monorepo path resolution

## Commits
- `a12d2d42` - test(18-2): add failing tests for pnpm workspace structure
- `b754dc45` - feat(18-2): convert to pnpm workspace structure
- `c39c0578` - fix(18-2): resolve path resolution for pnpm workspace structure
- `3794ed7b` - chore: add Story 18-6 tech debt for pre-existing test failures

## Lessons for Future Work
- Pre-existing test failures (19 tests) were discovered during this work and documented in Story 18-6 for separate resolution
- The `findMonorepoRoot()` pattern should be reused when adding new packages that need to access shared resources
- When adding Cyclist (Story 18-3), follow the same pattern: create `packages/cyclist/` with its own package.json extending tsconfig.base.json

## Workflow Completion
- SM: Story setup - Complete
- TEA: Write failing tests - Complete (17 tests in RED)
- Dev: Implementation - Complete (Tests GREEN)
- Reviewer: Code review - User Approved
- SM: Finish story - Complete
