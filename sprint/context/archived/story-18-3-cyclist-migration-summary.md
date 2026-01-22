# Story 18-3: Migrate Cyclist into monorepo as @pennyfarthing/cyclist - Summary
<!-- NOTE: Was Story 11-3, renumbered with epic -->

**Completed:** 2026-01-08
**Points:** 5
**Jira:** MSSCI-11420
**Epic:** 18 - Cyclist-Pennyfarthing Monorepo Consolidation

## What Was Built

Cyclist, the Electron GUI for Pennyfarthing, was successfully migrated from its standalone repository into the monorepo as `packages/cyclist/`. The package now uses workspace dependencies (`workspace:*`) for internal packages and shares portrait resolution logic through `@pennyfarthing/shared`.

## Key Technical Decisions

1. **Shared Portrait Resolution**: Rather than duplicating path detection logic, `src/paths.ts` was refactored to import `resolvePennyfarthingDist()` and `getPortraitPaths()` from `@pennyfarthing/shared`. This ensures all packages use the same multi-scenario path detection.

2. **TypeScript Configuration**: Created a separate `tsconfig.json` extending the base config, with specific exclusions for browser code (`editor-bundle.ts`) that's bundled separately by esbuild.

3. **Dependency Management**: Replaced the GitHub dependency on Pennyfarthing with `workspace:*` protocol, enabling proper monorepo linking while maintaining the ability to publish independently.

4. **Build Isolation**: Added `package-lock.json` to ensure reproducible builds when npm is used instead of pnpm (e.g., in CI environments).

## Implementation Patterns

- **Multi-scenario path detection**: Portrait paths work in monorepo dogfooding, npm installs, and packaged Electron apps
- **Workspace protocol**: Internal dependencies use `workspace:*` for development, resolved to version numbers on publish
- **Extended TypeScript configs**: Packages extend `tsconfig.base.json` for consistency while customizing outDir/rootDir

## Files Modified

**Created:**
- `packages/cyclist/` - Complete Cyclist package (src/, tests/, bin/, build/, configs)
- `packages/cyclist/package.json` - Updated name to `@pennyfarthing/cyclist`
- `packages/cyclist/tsconfig.json` - Extends base, excludes browser code
- `packages/cyclist/package-lock.json` - For reproducible npm builds

**Modified:**
- `packages/cyclist/src/paths.ts` - Refactored to use `@pennyfarthing/shared` resolver
- `pnpm-workspace.yaml` - Already included `packages/*` pattern

## Lessons for Future Work

1. **TypeScript browser code**: Files intended for browser bundling (esbuild/webpack) should be excluded from tsc to avoid DOM type conflicts
2. **pnpm vs npm**: The monorepo works with both, but pnpm is preferred for workspace resolution
3. **Dependency installation**: When adding packages to a workspace, ensure all dependencies are installed before testing builds
4. **File sync workflow**: When migrating from external repos, diff after major merges to catch upstream changes

## Test Coverage

- 28 acceptance criteria tests covering all 5 ACs
- 4 build verification tests
- All tests GREEN after implementation
