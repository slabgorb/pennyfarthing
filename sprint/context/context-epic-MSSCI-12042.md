# Epic 50: VS Code Extension for Pennyfarthing - Technical Context

## Epic Overview

**Jira:** MSSCI-12042
**Priority:** P2
**Status:** In Progress
**Repos:** pennyfarthing

Create a VS Code extension that brings Pennyfarthing's agent orchestration to VS Code users. The extension provides terminal integration, sidebar panels, webview UI, and command palette integration.

## Technical Landscape

### Monorepo Structure

The extension will be added as `packages/vscode-extension/`, joining the existing three-package structure:

```
packages/
├── core/              # CLI framework (@pennyfarthing/core)
├── cyclist/           # Visual terminal (Electron + Express)
├── shared/            # Portrait resolution utilities
└── vscode-extension/  # NEW: VS Code extension
```

**Workspace Configuration:**
- `pnpm-workspace.yaml` defines `packages/*` scope
- Packages use `workspace:*` for internal dependencies
- Each package extends `tsconfig.base.json` (ES2022, NodeNext, strict)

### WheelHub Architecture (Reusable)

The Cyclist server (`packages/cyclist/src/server.ts`) provides the core architecture:

- **Express.js server** with HTTP + WebSocket support
- **Port file discovery:** `.cyclist-port` enables zero-config integration
- **18 API routes** for stats, story, git, settings, etc.
- **9 WebSocket channels** for real-time updates

Key patterns to reuse:
1. **Router factory pattern:** `createXxxRouter()` exports
2. **Broadcast pattern:** Debounced WebSocket updates (100ms)
3. **Port file discovery:** External tools read `.cyclist-port`

### Reusable UI Components

35 JS modules in `packages/cyclist/src/public/js/` that don't depend on Electron:

| Component | Purpose | Reuse Strategy |
|-----------|---------|----------------|
| `panel-manager.js` | Panel registry with keyboard shortcuts | Copy pattern for VS Code panels |
| `stats-strip.js` | Token/context statistics | Adapt for VS Code status bar |
| `persona.js` | Agent personality UI | Adapt for VS Code sidebar |
| `story.js` | Story/sprint display | Adapt for VS Code tree view |
| `settings-sync.js` | Cross-tab localStorage sync | Use VS Code globalState instead |

### TypeScript Configuration

Base configuration (`tsconfig.base.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true
  }
}
```

Extension will extend this with VS Code-specific settings.

## Key Technical Decisions

### 1. Server Mode Strategy

**Recommended approach:** Connect to existing Cyclist server via port file discovery

```typescript
// Port file discovery pattern
const portFile = join(projectDir, '.cyclist-port');
const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10);
```

**Fallback:** Spawn local server in extension context (if Cyclist not running)

### 2. Build Pipeline

Use esbuild for bundling (proven in Cyclist):

```bash
esbuild src/extension.ts --bundle --outfile=dist/extension.js \
  --external:vscode --platform=node
```

### 3. Webview Strategy

Options:
1. **Iframe approach:** Embed Cyclist UI directly (lowest friction)
2. **Component reuse:** Adapt JS modules for webview context
3. **Native VS Code:** Use TreeView, StatusBar, QuickPick APIs only

Story MSSCI-12051 will determine final approach.

## File Structure (Proposed)

```
packages/vscode-extension/
├── package.json           # Extension manifest + dependencies
├── tsconfig.json          # Extends base, VS Code specifics
├── esbuild.config.js      # Bundle configuration
├── src/
│   ├── extension.ts       # Activation entry point
│   ├── providers/
│   │   ├── terminal.ts    # Custom terminal profile
│   │   ├── sidebar.ts     # Tree view provider
│   │   └── webview.ts     # Webview panel provider
│   ├── adapters/
│   │   ├── wheelhub.ts    # WheelHub client
│   │   └── reflector.ts   # HTML comment parser
│   └── commands/          # Command implementations
├── media/                 # Icons, images
└── dist/                  # Build output
```

## Dependencies

**Required:**
- `@types/vscode` - VS Code API types
- `typescript` - Compilation
- `esbuild` - Bundling
- `vsce` - Packaging

**Optional (for server mode):**
- `express` - Local server
- `ws` - WebSocket client

**Workspace (internal):**
- `@pennyfarthing/shared` - Portrait resolution

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CSP restrictions in webview | Use proper asset loading, nonce-based scripts |
| Port conflicts | Auto-increment port (existing pattern) |
| Orphan processes | Graceful shutdown on deactivation |
| Electron-specific code | Test Cyclist components in browser context first |

## Stories in This Epic

| ID | Title | Points | Dependencies |
|----|-------|--------|--------------|
| MSSCI-12045 | Extension scaffolding (Yeoman) | 2 | None |
| MSSCI-12046 | Terminal provider | 3 | 12045 |
| MSSCI-12047 | WheelHub adapter | 5 | 12045, 12046 |
| MSSCI-12048 | Sidebar panel | 3 | 12045 |
| MSSCI-12049 | Reflector adapter | 3 | 12046, 12047 |
| MSSCI-12050 | Command palette | 2 | 12045 |
| MSSCI-12051 | Webview panel | 3 | 12047, 12048 |

## Conventions

- Follow Cyclist naming patterns (WheelHub, TirePump, etc.)
- Use existing test patterns (Vitest, B-*.test.ts naming)
- Maintain separation between VS Code API and reusable logic
- Document all activation events in package.json

---

*Context created by Lord Varys, 2026-01-20*
