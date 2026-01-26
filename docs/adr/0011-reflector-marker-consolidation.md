# ADR-0011: Reflector Marker Consolidation

**Status:** Accepted
**Date:** 2026-01-23
**Author:** Architect (Emperor Palpatine)

## Context

The Reflector system provides agent-to-UI communication through HTML comment markers (`<!-- CYCLIST:TYPE:value -->`). This system is implemented in two locations:

1. **Cyclist Terminal:** `packages/cyclist/src/public/js/components/message-view/quick-actions.js`
2. **VS Code Extension:** `packages/vscode-extension/src/adapters/reflector.ts`

Both implementations contain:
- Identical regex pattern for marker detection
- Similar marker type definitions
- Duplicated code stripping logic
- Parallel (but slightly different) processing functions

This violates the single-source-of-truth principle established in ADR-0001 and creates:
- Maintenance burden (changes must be made in two places)
- Risk of behavioral divergence
- Inconsistent API naming (`detectStructuredMarkers` vs `detectMarkers`)
- Type definition drift

## Decision

Consolidate Reflector marker parsing into `@pennyfarthing/shared` as a new `marker` module, following the established pattern for `theme-loader`, `portrait-resolver`, and `skill-search`.

## Analysis

### Current Duplication

| Component | Cyclist (quick-actions.js) | VS Code (reflector.ts) |
|-----------|---------------------------|------------------------|
| Regex pattern | Line 161 | Line 32 |
| Detection function | `detectStructuredMarkers()` | `detectMarkers()` |
| Strip function | inline in `processMessageForQuickActions()` | `stripMarkers()` |
| Marker types | `MARKER_TYPES` object | `Marker` interface |
| Code block stripping | `text.replace(/```[\s\S]*?```/g, '')` | `stripCodeBlocks()` |

### Lines Affected

| Location | Lines | Notes |
|----------|-------|-------|
| quick-actions.js | ~175-330 | Detection, processing, type mapping |
| reflector.ts | ~30-145 | Detection, stripping, type definitions |
| **Total duplicated** | ~260 lines | Core logic is 95% identical |

## Proposed Architecture

### New Module Structure

```
packages/shared/src/
├── marker/
│   ├── types.ts        # MarkerType enum, Marker interface
│   ├── constants.ts    # MARKER_PATTERN regex, MARKER_TYPES
│   ├── detect.ts       # detectMarkers() function
│   ├── strip.ts        # stripMarkers(), stripCodeBlocks()
│   └── index.ts        # Re-export all
├── index.ts            # Add marker exports
└── ...existing files
```

### Type Definitions (`types.ts`)

```typescript
/**
 * Marker types supported by the Reflector protocol
 */
export type MarkerType =
  | 'handoff'
  | 'context_clear'
  | 'invoke'
  | 'question'
  | 'choices';

/**
 * Parsed marker from agent output
 */
export interface Marker {
  type: MarkerType;
  value: string;
  source?: 'structured_marker';
}

/**
 * Result of marker processing for UI rendering
 */
export interface MarkerResult {
  type: 'handoff' | 'context_clear' | 'invoke' | 'yesno' | 'list';
  agent?: string;
  responses?: string[];
  choices?: Array<{ number: number; text: string }>;
  autoExecute?: boolean;
  confidence: number;
  source: 'structured_marker';
}
```

### Constants (`constants.ts`)

```typescript
/**
 * Regex pattern for CYCLIST markers.
 * Format: <!-- CYCLIST:TYPE:value -->
 * Case-insensitive for CYCLIST prefix and TYPE, preserves value case
 */
export const MARKER_PATTERN = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;

/**
 * Known marker type constants
 */
export const MARKER_TYPES = {
  HANDOFF: 'handoff',
  CONTEXT_CLEAR: 'context_clear',
  INVOKE: 'invoke',
  QUESTION: 'question',
  CHOICES: 'choices',
} as const;
```

### Detection Function (`detect.ts`)

```typescript
import { MARKER_PATTERN } from './constants.js';
import type { Marker, MarkerType } from './types.js';
import { stripCodeBlocks } from './strip.js';

/**
 * Detect CYCLIST markers in text.
 *
 * @param text - Text to scan for markers
 * @returns Array of markers found, or null if none
 */
export function detectMarkers(text: string): Marker[] | null {
  if (!text) return null;

  // Strip code blocks first - markers inside code should be ignored
  const withoutCode = stripCodeBlocks(text);
  if (!withoutCode.trim()) return null;

  const markers: Marker[] = [];

  // Reset lastIndex for global regex
  MARKER_PATTERN.lastIndex = 0;

  let match;
  while ((match = MARKER_PATTERN.exec(withoutCode)) !== null) {
    const rawType = match[1].toLowerCase();

    // Validate marker type
    if (!isValidMarkerType(rawType)) continue;

    markers.push({
      type: rawType as MarkerType,
      value: match[2].trim(),
      source: 'structured_marker',
    });
  }

  return markers.length > 0 ? markers : null;
}

function isValidMarkerType(type: string): type is MarkerType {
  return ['handoff', 'context_clear', 'invoke', 'question', 'choices'].includes(type);
}
```

### Strip Functions (`strip.ts`)

```typescript
import { MARKER_PATTERN } from './constants.js';

/**
 * Strip code blocks from text before marker detection.
 * Markers inside code blocks should not be processed.
 */
export function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

/**
 * Strip CYCLIST markers from text for display.
 *
 * @param text - Text containing markers
 * @returns Text with markers removed
 */
export function stripMarkers(text: string): string {
  if (!text) return '';
  return text.replace(MARKER_PATTERN, '').trim();
}
```

### Package Exports (`index.ts` additions)

```typescript
// Add to existing exports
export {
  detectMarkers,
  stripMarkers,
  stripCodeBlocks,
  MARKER_PATTERN,
  MARKER_TYPES,
  type Marker,
  type MarkerType,
  type MarkerResult,
} from './marker/index.js';
```

## Consumer Updates

### Cyclist (quick-actions.js)

```javascript
// Before
const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;
export function detectStructuredMarkers(text) { ... }

// After
import { detectMarkers, stripMarkers, MARKER_TYPES } from '@pennyfarthing/shared';
// Use detectMarkers() directly, keep UI-specific processStructuredMarkers()
```

### VS Code Extension (reflector.ts)

```typescript
// Before
const MARKER_PATTERN = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;
export function detectMarkers(text: string): Marker[] | null { ... }

// After
import { detectMarkers, stripMarkers, type Marker } from '@pennyfarthing/shared';
// ReflectorAdapter.processText() becomes thinner, delegates to shared
```

## Additional Improvements

### 1. TirePump Threshold Configuration

Move hardcoded threshold from `check-context.sh` to configurable YAML:

```yaml
# .pennyfarthing/config.local.yaml
context_budget:
  tirepump_threshold: 60  # NEW: Previously hardcoded
  imminent_threshold: 65
  warning_threshold: 60
  critical_threshold: 85
  max_tokens: 200000
```

### 2. Unified Function Naming

| Old (Cyclist) | Old (VS Code) | New (Shared) |
|---------------|---------------|--------------|
| `detectStructuredMarkers` | `detectMarkers` | `detectMarkers` |
| inline | `stripMarkers` | `stripMarkers` |
| inline | `stripCodeBlocks` | `stripCodeBlocks` |

### 3. Test Consolidation

Create `packages/shared/src/marker/detect.test.ts` with unified tests:
- Empty/null input handling
- Basic marker detection (all types)
- Code block stripping
- Multiple markers
- Case insensitivity
- Whitespace handling

## Migration Path

### Phase 1: Create Shared Module (1 story)
1. Create `packages/shared/src/marker/` directory
2. Implement `types.ts`, `constants.ts`, `detect.ts`, `strip.ts`
3. Add comprehensive tests
4. Export from `packages/shared/src/index.ts`
5. Build and verify

### Phase 2: Migrate Cyclist (1 story)
1. Add `@pennyfarthing/shared` dependency (already workspace member)
2. Import shared functions in `quick-actions.js`
3. Remove duplicated code
4. Verify Cyclist tests pass
5. Manual testing in Electron app

### Phase 3: Migrate VS Code Extension (1 story)
1. Add `@pennyfarthing/shared` dependency
2. Import shared functions in `reflector.ts`
3. Remove duplicated code
4. Verify extension tests pass

### Phase 4: Configuration (1 story)
1. Add `tirepump_threshold` to YAML schema
2. Update `check-context.sh` to read from config
3. Document in config example

## Consequences

### Positive

- **Single source of truth** for marker parsing logic
- **Shared TypeScript types** prevent drift between implementations
- **Easier testing** - test once, use everywhere
- **Consistent behavior** - identical parsing in all contexts
- **Reduced maintenance** - ~260 lines consolidated
- **API consistency** - unified function naming

### Negative

- **Build dependency** - Cyclist/VS Code now depend on shared package building first
- **Migration effort** - ~4 stories of work
- **JavaScript consumer** - Cyclist uses .js, will need to import from compiled output

### Neutral

- **No runtime performance impact** - same code, different location
- **No behavioral changes** - refactor only, logic preserved

## Alternatives Considered

### 1. Copy-paste with lint rule

Add ESLint rule to detect divergence.

**Rejected:** Doesn't prevent drift, just detects it after the fact.

### 2. Create separate @pennyfarthing/marker package

New package just for markers.

**Rejected:** Overkill for ~150 lines of code. Better to use existing `@pennyfarthing/shared`.

### 3. Keep Cyclist implementation in JS, VS Code in TS

Only share types, not implementation.

**Rejected:** Still allows behavioral divergence. Full consolidation is cleaner.

### 4. Leave as-is

Accept duplication.

**Rejected:** Violates ADR-0001 principles. Maintenance burden will compound.

## Related

- [ADR-0001: Consolidate Code Duplication](./0001-consolidate-code-duplication.md)
- [docs/REFLECTOR-SYSTEM.md](../REFLECTOR-SYSTEM.md) - Full technical documentation
- Story MSSCI-12049: Original Reflector adapter implementation

## Implementation Notes for Dev

### File Creation Order

1. `packages/shared/src/marker/types.ts` - No dependencies
2. `packages/shared/src/marker/constants.ts` - No dependencies
3. `packages/shared/src/marker/strip.ts` - Imports constants
4. `packages/shared/src/marker/detect.ts` - Imports types, constants, strip
5. `packages/shared/src/marker/index.ts` - Re-exports all
6. Update `packages/shared/src/index.ts` - Add marker exports
7. `packages/shared/src/marker/detect.test.ts` - Test coverage

### Critical Implementation Details

1. **Regex must use global flag reset:** `MARKER_PATTERN.lastIndex = 0` before each use
2. **Code blocks stripped first:** Markers in code blocks must not be detected
3. **Preserve value case:** Type is normalized to lowercase, value is trimmed but case-preserved
4. **Null for empty results:** Return `null` (not `[]`) when no markers found
5. **ESM imports:** Use `.js` extension per ADR-0010

### Testing Coverage Required

```typescript
describe('detectMarkers', () => {
  it('returns null for empty/null input');
  it('detects HANDOFF marker');
  it('detects CONTEXT_CLEAR marker');
  it('detects INVOKE marker');
  it('detects QUESTION marker');
  it('detects CHOICES marker with numbers');
  it('detects CHOICES marker with text labels');
  it('handles multiple markers in order');
  it('ignores markers inside code blocks');
  it('is case-insensitive for CYCLIST and type');
  it('handles whitespace inside marker');
  it('preserves value case');
});

describe('stripMarkers', () => {
  it('removes all marker types');
  it('preserves surrounding text');
  it('handles empty input');
  it('handles text without markers');
});
```
