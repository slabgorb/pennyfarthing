# Epic 18: Cyclist-Pennyfarthing Monorepo Consolidation
<!-- NOTE: Was Epic 11, renumbered to avoid collision with archived Epic 11 (OCEAN Visualization, Sprint 4) -->

**Generated:** 2026-01-07
**Jira:** MSSCI-11417
**Points:** 19 (5 stories)
**Priority:** P1 (architectural)
**ADR:** ~/.claude/plans/snuggly-bouncing-forest.md (ADR-002, approved 2026-01-07)

## Problem Statement

Cyclist (Electron GUI for Claude Code) cannot find portraits when dogfooding Pennyfarthing because:
- Hardcoded path `node_modules/pennyfarthing/pennyfarthing-dist/` doesn't exist in dev mode
- Two separate repos mean coordinated releases are manual and error-prone
- Portrait resolution logic is duplicated and brittle

## Solution: pnpm Workspace Monorepo

Merge Cyclist into Pennyfarthing as a pnpm workspace with three packages:

```
pennyfarthing/                        # Monorepo root
├── pnpm-workspace.yaml               # Workspace definition
├── packages/
│   ├── core/                         # @pennyfarthing/core (CLI, ~5MB)
│   │   └── src/cli/                  # Current pennyfarthing/src/cli/
│   ├── cyclist/                      # @pennyfarthing/cyclist (Electron, ~200MB)
│   │   └── src/                      # Current ~/Projects/cyclist/src/
│   └── shared/                       # @pennyfarthing/shared (utilities)
│       └── src/portrait-resolver.ts  # Smart path resolution
└── pennyfarthing-dist/               # UNCHANGED - Single source of truth
```

## Current State

### Pennyfarthing (this repo)
- **Version:** 5.3.1
- **Type:** ES module, TypeScript
- **CLI:** `src/cli/` with commander.js
- **Published:** npm as `pennyfarthing`
- **Assets:** `pennyfarthing-dist/` (agents, personas, portraits)

### Cyclist (~/Projects/cyclist/)
- **Version:** 1.0.0
- **Type:** Electron app with Express server
- **Dependencies:** electron, node-pty, ws, express
- **Portrait issue:** `src/paths.ts` has hardcoded node_modules path

## Technical Approach

### Phase 1: Create @pennyfarthing/shared (Story 18-1)
Non-breaking preparation:
1. Create `packages/shared/` directory structure
2. Implement `portrait-resolver.ts` with 5-scenario path detection:
   - PENNYFARTHING_DIST env var (explicit override)
   - Monorepo root `pennyfarthing-dist/` (dogfooding)
   - Sibling directory (dev scenarios)
   - `node_modules/@pennyfarthing/core/pennyfarthing-dist/` (scoped npm)
   - `node_modules/pennyfarthing/pennyfarthing-dist/` (legacy npm)
3. Add `theme-loader.ts` for shared persona loading
4. Unit tests for all path scenarios

### Phase 2: Monorepo Conversion (Story 18-2)
Restructure repository:
1. Create root `pnpm-workspace.yaml`
2. Create `packages/core/` and move `src/cli/` into it
3. Create `tsconfig.base.json` for shared TypeScript config
4. Update all import paths to use workspace protocol
5. Verify `npm run build` and `pennyfarthing` CLI still work

### Phase 3: Migrate Cyclist (Story 18-3)
Copy and integrate:
1. Copy `~/Projects/cyclist/` to `packages/cyclist/`
2. Update `package.json` to use `workspace:*` dependencies
3. Replace hardcoded paths with `@pennyfarthing/shared` resolver
4. Update Electron main process and preload scripts
5. Test portrait loading in dev mode

### Phase 4: Integration Testing (Story 18-4)
Verify all scenarios:
1. `npm install @pennyfarthing/core` only (no Electron, ~5MB)
2. `npm install @pennyfarthing/cyclist` (includes core + Electron)
3. `pnpm install` in monorepo (dogfooding)
4. Electron-builder packaged app
5. Portrait resolution in each scenario

### Phase 5: CI/CD & Publish (Story 18-5)
Release preparation:
1. Update GitHub Actions for pnpm workspaces
2. Configure npm publishing for scoped packages
3. Archive `~/Projects/cyclist` with deprecation notice
4. Update README with new install instructions

## Key Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Define workspace packages |
| `tsconfig.base.json` | Shared TypeScript config |
| `packages/shared/package.json` | Shared utilities package |
| `packages/shared/src/portrait-resolver.ts` | Smart path resolution |
| `packages/shared/src/theme-loader.ts` | Theme/persona loading |
| `packages/core/package.json` | CLI package (moved) |
| `packages/cyclist/package.json` | Electron package (copied) |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | Transform to workspace root (remove deps) |
| `src/cli/*` | Move to `packages/core/src/cli/` |
| Cyclist `src/paths.ts` | Use shared resolver |

## Dependencies

### @pennyfarthing/core
```json
{
  "dependencies": {
    "@pennyfarthing/shared": "workspace:*",
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "fs-extra": "^11.2.0",
    "inquirer": "^9.2.12",
    "yaml": "^2.3.4"
  }
}
```

### @pennyfarthing/cyclist
```json
{
  "dependencies": {
    "@pennyfarthing/core": "workspace:*",
    "@pennyfarthing/shared": "workspace:*",
    "electron": "^39.2.7",
    "electron-builder": "^25.1.8",
    "node-pty": "^1.1.0",
    "express": "^4.18.2",
    "ws": "^8.14.2"
  }
}
```

## Install Scenarios

| User Type | Command | Size | Gets |
|-----------|---------|------|------|
| CLI only | `npm i -g @pennyfarthing/core` | ~5MB | CLI, agents, no Electron |
| GUI user | `npm i -g @pennyfarthing/cyclist` | ~200MB | Full app with Electron |
| Developer | `pnpm install` | ~250MB | Both packages, hot reload |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| pnpm requirement | Document clearly; npm/yarn won't work for workspace protocol |
| Breaking existing installs | Publish as scoped packages first, deprecate old name later |
| Electron native deps | Use electron-rebuild in postinstall |
| Path resolution edge cases | Extensive unit tests for all 5 scenarios |

## Stories (in order)

1. **18-1** (3 pts): Create @pennyfarthing/shared with portrait resolver
2. **18-2** (5 pts): Convert to pnpm workspace structure
3. **18-3** (5 pts): Migrate Cyclist into monorepo
4. **18-4** (3 pts): Test all install/runtime scenarios
5. **18-5** (3 pts): Update CI/CD and publish scoped packages

## Success Criteria

- [ ] Portrait resolution works in dogfooding mode
- [ ] `npm i @pennyfarthing/core` installs ~5MB (no Electron)
- [ ] `npm i @pennyfarthing/cyclist` includes core + Electron
- [ ] Existing `pennyfarthing` CLI commands unchanged
- [ ] Electron app starts and displays portraits
- [ ] CI builds all packages successfully
