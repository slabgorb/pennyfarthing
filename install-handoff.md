# Install Experience Handoff

**Branch:** `fix/npm-install-experience`
**Date:** 2026-01-17
**Status:** READY FOR TESTING

## Summary

Made Cyclist an optional npm package. Users install the base `pennyfarthing` package for CLI, and optionally add `@pennyfarthing/cyclist` for the visual terminal.

## User Experience

```bash
# Install CLI only
npm install pennyfarthing
npx pennyfarthing init
npx pennyfarthing doctor

# Running cyclist without it installed shows helpful message:
npx pennyfarthing cyclist
# Error: Cyclist not found.
# To use the visual terminal, install the optional Cyclist package:
#   npm install @pennyfarthing/cyclist
# Then run: npx pennyfarthing cyclist

# Install optional visual terminal
npm install @pennyfarthing/cyclist
npx pennyfarthing cyclist   # Works!
```

## Changes Made

### 1. Main package.json (already done)
- Renamed package to `pennyfarthing`
- Added proper `files` array (excludes benchmarks, internal data)
- Added runtime dependencies

### 2. Cyclist as Separate Package
- Removed `private: true` from `packages/cyclist/package.json`
- Added `files`, `repository`, `homepage`, `bugs` fields
- Changed `main` to `dist/server.js` (web server entry point)
- Removed workspace dependencies (`@pennyfarthing/core`, `@pennyfarthing/shared`)
- Removed `postinstall` electron-rebuild (breaks for npm users)

### 3. Inlined Shared Utilities
- Copied `resolvePennyfarthingDist()` and `getPortraitPaths()` into `packages/cyclist/src/paths.ts`
- Cyclist no longer depends on `@pennyfarthing/shared`

### 4. Benchmark API Made Optional
- `packages/cyclist/src/server.ts` dynamically imports benchmark router
- If `@pennyfarthing/core` isn't available, benchmark API silently disabled
- Benchmark features still work when dogfooding in pennyfarthing repo

### 5. Improved Error Messages
- `packages/core/src/cli/commands/cyclist.ts` gives clear install instructions

## Test Results

```bash
# Fresh repo test
rm -rf test-pennyfarthing-init && mkdir test-pennyfarthing-init && cd test-pennyfarthing-init
git init && npm init -y

# Install and test base package
npm install /path/to/pennyfarthing-6.5.0.tgz
npx pennyfarthing init test-project  # Works
npx pennyfarthing doctor             # Works
npx pennyfarthing cyclist            # Shows helpful error

# Install and test cyclist
npm install /path/to/pennyfarthing-cyclist-6.1.0.tgz
npx pennyfarthing cyclist --no-open  # Works - server starts
```

## Files Changed

```
package.json                                    # Already modified (previous work)
packages/core/src/cli/commands/cyclist.ts       # Improved error message
packages/cyclist/package.json                   # Publishable, files field, removed workspace deps
packages/cyclist/src/paths.ts                   # Inlined shared utilities
packages/cyclist/src/server.ts                  # Dynamic benchmark import
packages/cyclist/src/api/index.ts               # Comment about dynamic benchmark import
```

## What's NOT Distributed

The following are excluded from npm packages:
- `internal/` (job-fair results, benchmark data)
- `benchmarks/`
- `.session/`
- `.pennyfarthing/`
- Test files

## Dogfooding (In Pennyfarthing Repo)

When working in the pennyfarthing repo itself:
- Benchmark API works (loads dynamically since @pennyfarthing/core is available)
- All features work as before
- No changes to development workflow

## Next Steps

1. Test in more scenarios (different Node versions, npm vs pnpm)
2. Consider publishing to npm registry when ready
3. Update documentation/README with new install instructions
