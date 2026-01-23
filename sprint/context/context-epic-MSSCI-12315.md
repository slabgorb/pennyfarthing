# Epic MSSCI-12315: Reflector Marker Consolidation - Technical Context

## Epic Overview

| Field | Value |
|-------|-------|
| Epic | MSSCI-12315 |
| Title | Reflector Marker Consolidation |
| Points | 8 (consolidated from 8 x 1pt stories) |
| Priority | P1 |
| Repos | pennyfarthing |
| Workflow | tdd |
| Branch | `feature/MSSCI-12315-reflector-marker-consolidation` |

## Problem Statement

The Reflector system (agent-to-UI communication via HTML comment markers) is duplicated across two locations:

1. **Cyclist Terminal:** `packages/cyclist/src/public/js/components/message-view/quick-actions.js`
2. **VS Code Extension:** `packages/vscode-extension/src/adapters/reflector.ts`

Both contain identical regex patterns, similar type definitions, and parallel (but slightly different) processing functions. This violates single-source-of-truth principles and creates maintenance burden.

## Current State

### Cyclist (quick-actions.js)
- **Location:** Lines 152-175 (detection), 230-333 (processing)
- **Function:** `detectStructuredMarkers()` - parses `<!-- CYCLIST:TYPE:value -->` markers
- **Pattern:** `const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi`
- **Code block stripping:** `text.replace(/```[\s\S]*?```/g, '')`
- **Types:** MARKER_TYPES constant with 5 types

### VS Code Extension (reflector.ts)
- **Location:** Lines 32 (pattern), 48-96 (detection)
- **Function:** `detectMarkers()` - same logic, different name
- **Pattern:** Same regex as Cyclist
- **Stripping:** `stripMarkers()` function
- **Types:** Marker interface

### Shared Package (packages/shared/src/index.ts)
- **Current exports:** portrait-resolver, theme-loader, skill-search, skill-suggest, generate-skill-docs
- **Pattern:** Re-export from internal modules
- **Target:** Add new `marker` module following same pattern

### Context System
- **check-context.sh:** Calculates context usage, hardcoded `tirepump_threshold=60` at line 137
- **handoff-marker.sh:** Generates AGENT_COMMAND YAML, integrates with check-context.sh

## Technical Approach

### Phase 1: Create Shared Marker Module

Create `packages/shared/src/marker/` with:

```
marker/
├── types.ts        # MarkerType enum, Marker interface
├── constants.ts    # MARKER_PATTERN regex, MARKER_TYPES
├── strip.ts        # stripCodeBlocks(), stripMarkers()
├── detect.ts       # detectMarkers()
└── index.ts        # Re-export all
```

**Critical implementation details:**
1. Reset `MARKER_PATTERN.lastIndex = 0` before each use (global regex)
2. Strip code blocks FIRST - markers in code must not be detected
3. Normalize type to lowercase, preserve value case
4. Return `null` (not `[]`) when no markers found
5. Use `.js` extension in imports (ESM per ADR-0010)

### Phase 2: Migrate Consumers

**Cyclist:**
```javascript
// Before
const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;
export function detectStructuredMarkers(text) { ... }

// After
import { detectMarkers, stripMarkers, MARKER_TYPES } from '@pennyfarthing/shared';
```

**VS Code Extension:**
```typescript
// Before
const MARKER_PATTERN = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;
export function detectMarkers(text: string): Marker[] | null { ... }

// After
import { detectMarkers, stripMarkers, type Marker } from '@pennyfarthing/shared';
```

### Phase 3: Configuration

Add `tirepump_threshold` to `.pennyfarthing/config.local.yaml`:
```yaml
context_budget:
  tirepump_threshold: 60  # Currently hardcoded in check-context.sh
```

## Files to Modify/Create

### New Files
| File | Purpose |
|------|---------|
| `packages/shared/src/marker/types.ts` | TypeScript interfaces |
| `packages/shared/src/marker/constants.ts` | Regex and type constants |
| `packages/shared/src/marker/strip.ts` | Strip functions |
| `packages/shared/src/marker/detect.ts` | Detection function |
| `packages/shared/src/marker/index.ts` | Module re-exports |
| `packages/shared/src/marker/detect.test.ts` | Test coverage |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Add marker exports |
| `packages/cyclist/.../quick-actions.js` | Import from shared |
| `packages/vscode-extension/.../reflector.ts` | Import from shared |
| `pennyfarthing-dist/scripts/core/check-context.sh` | Read threshold from config |

## Consolidated Stories

This epic consolidates 8 stories into a single branch:

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| MSSCI-12317 | Create Marker Types and Constants | 1 | pending |
| MSSCI-12318 | Implement Code Block Stripping | 1 | pending |
| MSSCI-12319 | Implement Marker Detection | 1 | pending |
| MSSCI-12320 | Implement Marker Stripping | 1 | pending |
| MSSCI-12321 | Comprehensive Test Suite | 1 | pending |
| MSSCI-12322 | Migrate Cyclist | 1 | pending |
| MSSCI-12323 | Migrate VS Code Extension | 1 | pending |
| MSSCI-12324 | Configurable TirePump Threshold | 1 | pending |

## Acceptance Criteria

### Core Module (12317-12320)
- [ ] `MarkerType` enum with 5 types: handoff, context_clear, invoke, question, choices
- [ ] `Marker` interface with type, value, source fields
- [ ] `MARKER_PATTERN` regex matches existing implementations
- [ ] `stripCodeBlocks()` removes fenced code blocks
- [ ] `stripMarkers()` removes CYCLIST markers from text
- [ ] `detectMarkers()` returns `Marker[] | null`

### Test Suite (12321)
- [ ] >90% test coverage for marker module
- [ ] Tests for empty/null input handling
- [ ] Tests for all 5 marker types
- [ ] Tests for code block stripping
- [ ] Tests for multiple markers
- [ ] Tests for case insensitivity
- [ ] Tests for whitespace handling

### Migrations (12322-12323)
- [ ] Cyclist quick-actions.js imports from @pennyfarthing/shared
- [ ] VS Code reflector.ts imports from @pennyfarthing/shared
- [ ] Duplicated code removed from both consumers
- [ ] Existing tests pass
- [ ] Manual verification in both UIs

### Configuration (12324)
- [ ] `tirepump_threshold` readable from config.local.yaml
- [ ] check-context.sh uses configured value
- [ ] Fallback to 60 if not configured
- [ ] Documented in config examples

## Testing Strategy

1. **Unit Tests:** New `detect.test.ts` with comprehensive coverage
2. **Integration:** Existing Cyclist and VS Code extension tests must pass
3. **Manual:** Verify markers render correctly in both UIs
4. **Regression:** Ensure TirePump still triggers at correct threshold

## Dependencies & Risks

### Dependencies
- `@pennyfarthing/shared` package builds before consumers
- Cyclist uses JavaScript (will import from compiled output)

### Risks
| Risk | Mitigation |
|------|------------|
| Behavioral divergence during migration | Test parity before removing old code |
| Build order in monorepo | Verify workspace dependencies |
| JS/TS interop issues | Test Cyclist import of TS-compiled module |

## Reference Documents

- [ADR-0011: Reflector Marker Consolidation](../docs/adr/0011-reflector-marker-consolidation.md)
- [REFLECTOR-SYSTEM.md](../docs/REFLECTOR-SYSTEM.md)
- [ADR-0010: ESM Module Requirements](../docs/adr/0010-esm-module-requirements.md)
