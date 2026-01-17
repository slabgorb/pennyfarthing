# Install Experience Handoff

**Branch:** `fix/npm-install-experience`
**Date:** 2026-01-17
**Status:** IN PROGRESS

## Summary

1. Made Cyclist an optional npm package with bundled portraits
2. Restructured installation to minimize `.claude/` interference

Users install the base `pennyfarthing` package for CLI, and optionally add `@pennyfarthing/cyclist` for the visual terminal.

## User Experience

```bash
# Install CLI only (1.1 MB)
npm install pennyfarthing
npx pennyfarthing init
npx pennyfarthing doctor

# Running cyclist without it installed shows helpful message:
npx pennyfarthing cyclist
# Error: Cyclist not found.
# To use the visual terminal, install the optional Cyclist package:
#   npm install @pennyfarthing/cyclist
# Then run: npx pennyfarthing cyclist

# Install optional visual terminal (160 MB, includes portraits)
npm install @pennyfarthing/cyclist
npx pennyfarthing cyclist   # Works!
```

## Package Sizes

| Package | Size | Contents |
|---------|------|----------|
| `pennyfarthing` | 1.1 MB | CLI, themes (YAML), agents, skills |
| `@pennyfarthing/cyclist` | 160 MB | Visual terminal + portraits (128px, 256px) |

## Commits

1. `1c2c7921` - feat: make Cyclist an optional npm package
2. `f0809a54` - feat(cyclist): bundle portraits for npm distribution
3. `31eddab4` - docs: update install instructions and config paths

## Changes Made

### 1. Main package.json
- Package name: `pennyfarthing`
- `files` array excludes benchmarks, internal data, portraits
- Portraits NOT included (keeps CLI package small)

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

### 5. Portrait Bundling
- `packages/cyclist/scripts/copy-portraits.sh` copies medium (128px) and large (256px) only
- Runs via `prepack` hook before npm pack
- Excludes small (64px) and original (512px) - saves ~450MB
- `paths.ts` updated to find bundled portraits first

### 6. Documentation Updates
- README.md - new install instructions, directory structure
- docs/GETTING-STARTED.md, USER-GUIDE.md - install steps
- docs/CONFIGURATION.md, PERSONAS.md, COMMANDS.md, etc. - config paths
- All `.claude/persona-config.yaml` → `.pennyfarthing/config.local.yaml`

## Test Results

```bash
# Fresh repo test
rm -rf test-pennyfarthing-init && mkdir test-pennyfarthing-init && cd test-pennyfarthing-init
git init && npm init -y

# Install and test base package
npm install /path/to/pennyfarthing-6.5.0.tgz
npx pennyfarthing init test-project  # ✓ Works
npx pennyfarthing doctor             # ✓ Works
npx pennyfarthing cyclist            # ✓ Shows helpful error

# Install and test cyclist
npm install /path/to/pennyfarthing-cyclist-6.1.0.tgz
npx pennyfarthing cyclist --no-open  # ✓ Works - server starts
```

## What's NOT Distributed

**Main package (`pennyfarthing`):**
- `internal/` (job-fair results, benchmark data)
- `benchmarks/`
- `packages/cyclist/` (separate package)
- Portraits (in Cyclist package only)

**Cyclist package (`@pennyfarthing/cyclist`):**
- Small portraits (64px) - not needed
- Original portraits (512px) - too large
- Benchmark code (pennyfarthing-only feature)

## Dogfooding (In Pennyfarthing Repo)

When working in the pennyfarthing repo itself:
- Benchmark API works (loads dynamically since @pennyfarthing/core is available)
- All portrait sizes available via pennyfarthing-dist/
- All features work as before
- No changes to development workflow

---

## Part 2: Directory Restructure (v6.6.0)

Moved Pennyfarthing content from `.claude/` to `.pennyfarthing/` to minimize interference with user's Claude Code configuration.

### New Directory Structure

```
your-project/
├── .claude/                        # Claude Code discovery (minimal)
│   ├── commands/                   # → symlinks to node_modules commands
│   ├── skills/                     # → symlinks to node_modules skills
│   ├── project/                    # User's custom content
│   └── settings.local.json         # Claude Code settings
│
└── .pennyfarthing/                 # Pennyfarthing content (main location)
    ├── agents/                     # → symlink to node_modules agents
    ├── guides/                     # → symlink to node_modules guides
    ├── personas/                   # → symlink to node_modules personas
    ├── scripts/                    # → symlink to node_modules scripts
    ├── sidecars/                   # Agent learning files
    ├── config.local.yaml           # Theme configuration
    └── cyclist.yaml                # Cyclist settings
```

### Rationale

- **BMAD Method insight**: They use `_bmad/` for content, keep `.claude/` minimal
- **Claude Code constraint**: Only discovers commands/skills at `.claude/` root level
- **User benefit**: Less clutter in `.claude/`, clearer separation of concerns

### Changes Made

1. **constants.ts**: Changed `DIRECTORY_SYMLINKS` targets to `.pennyfarthing/`
2. **init.ts**: Creates symlinks in `.pennyfarthing/`, cleans up legacy `.claude/` symlinks
3. **doctor.ts**: Updated path checks for new structure
4. **settings.local.json template**: Hooks point to `.pennyfarthing/scripts/`
5. **All command/skill/agent files**: Updated references from `.claude/agents/` to `.pennyfarthing/agents/`
6. **Documentation**: Updated ARCHITECTURE.md, CLAUDE.md, all docs

### Migration for Existing Installs

Running `pennyfarthing init` or `pennyfarthing update` will:
1. Remove old symlinks from `.claude/` (agents, guides, personas, scripts)
2. Create new symlinks in `.pennyfarthing/`
3. Update settings.local.json hook paths

## Next Steps

1. ~~Update documentation/README with new install instructions~~ ✓ Done
2. ~~Restructure to minimize .claude/ interference~~ ✓ Done
3. Test in more scenarios (different Node versions, npm vs pnpm)
4. Publish to npm registry when ready
