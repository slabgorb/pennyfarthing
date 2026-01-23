# Epic 60: Reflector Marker Consolidation - Technical Context

## Epic Overview

| Field | Value |
|-------|-------|
| Epic ID | epic-60 |
| Title | Reflector Marker Consolidation |
| Points | 8 (8 stories) |
| Repos | pennyfarthing, pennyfarthing-vscode |
| PRD | docs/planning/reflector-prd.md |
| ADR | docs/adr/0011-reflector-marker-consolidation.md |

## Problem Statement

The Reflector marker system is duplicated across two locations:
- **Cyclist:** `packages/cyclist/src/public/js/components/message-view/quick-actions.js`
- **VS Code:** `packages/vscode-extension/src/adapters/reflector.ts`

This causes:
- ~260 lines of duplicated code
- Inconsistent APIs (`detectStructuredMarkers` vs `detectMarkers`)
- Risk of behavioral divergence
- Hardcoded TirePump threshold (not configurable)

## Solution Architecture

Create `packages/shared/src/marker/` as single source of truth:

```
packages/shared/src/marker/
├── types.ts      # MarkerType, Marker, MarkerResult interfaces
├── constants.ts  # MARKER_PATTERN regex, MARKER_TYPES
├── strip.ts      # stripCodeBlocks(), stripMarkers()
├── detect.ts     # detectMarkers()
└── index.ts      # Re-exports all
```

Both Cyclist and VS Code import from `@pennyfarthing/shared`.

## Domain Invariants

1. **Marker format:** Always `<!-- CYCLIST:TYPE:value -->`
2. **Code block immunity:** Markers inside ``` blocks are never detected
3. **Case handling:** TYPE is case-insensitive, value preserves case
4. **Null semantics:** No markers found returns `null`, not empty array
5. **Regex safety:** Reset `lastIndex` before each use

## Marker Types

| Type | Purpose | Example |
|------|---------|---------|
| HANDOFF | Agent-to-agent transition | `<!-- CYCLIST:HANDOFF:/dev -->` |
| CONTEXT_CLEAR | TirePump trigger | `<!-- CYCLIST:CONTEXT_CLEAR:reload -->` |
| INVOKE | Auto-execute action | `<!-- CYCLIST:INVOKE:/test -->` |
| QUESTION | User prompt | `<!-- CYCLIST:QUESTION:Continue? -->` |
| CHOICES | Multi-choice | `<!-- CYCLIST:CHOICES:yes,no,skip -->` |

## Key Files to Understand

### Existing Implementations (to consolidate)

| File | Current State | After |
|------|---------------|-------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Has `detectStructuredMarkers()`, local regex | Import from shared |
| `packages/vscode-extension/src/adapters/reflector.ts` | Has `detectMarkers()`, `stripMarkers()` | Import from shared |

### Shared Package

| File | Purpose |
|------|---------|
| `packages/shared/src/index.ts` | Main export point |
| `packages/shared/package.json` | @pennyfarthing/shared config |
| `packages/shared/tsconfig.json` | TypeScript config |

### Context Scripts

| File | Purpose |
|------|---------|
| `.pennyfarthing/scripts/hooks/check-context.sh` | Reads context %, sets USE_TIREPUMP |
| `.pennyfarthing/scripts/workflow/handoff-marker.sh` | Generates AGENT_COMMAND with markers |

## Story Sequence

| Story | Title | Deps | Key Output |
|-------|-------|------|------------|
| 60-1 | Create Marker Types and Constants | None | types.ts, constants.ts |
| 60-2 | Implement Code Block Stripping | 60-1 | strip.ts (stripCodeBlocks) |
| 60-3 | Implement Marker Detection | 60-2 | detect.ts (detectMarkers) |
| 60-4 | Implement Marker Stripping | 60-3 | strip.ts (stripMarkers) |
| 60-5 | Comprehensive Test Suite | 60-4 | >90% coverage |
| 60-6 | Migrate Cyclist | 60-5 | quick-actions.js updated |
| 60-7 | Migrate VS Code Extension | 60-5 | reflector.ts updated |
| 60-8 | Configurable TirePump Threshold | None | config.local.yaml schema |

## Testing Strategy

### Unit Tests (stories 60-1 through 60-5)
- Empty/null input handling
- All 5 marker types detection
- Multiple markers in order
- Code block immunity
- Case insensitivity (TYPE)
- Case preservation (value)
- Whitespace handling
- lastIndex reset behavior

### Integration Tests (stories 60-6, 60-7)
- Cyclist: Verify marker detection in Electron app
- VS Code: Verify marker detection in extension

## Success Criteria

| Metric | Target |
|--------|--------|
| Duplicated lines | 0 |
| API consistency | 100% (same function names) |
| Test coverage | >90% for marker module |
| Build time impact | <5% increase |

## Technical Notes

### Build Order
pnpm workspace handles dependency graph - `@pennyfarthing/shared` builds before consumers.

### JS/TS Interop
Cyclist (JS) imports compiled `.js` from shared package dist/. No special handling needed.

### Backwards Compatibility
Same markers must produce same UI actions. Regression tests compare before/after behavior.
