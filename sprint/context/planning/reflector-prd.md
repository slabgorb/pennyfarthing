---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
inputDocuments:
  - docs/REFLECTOR-SYSTEM.md
  - docs/adr/0011-reflector-marker-consolidation.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 2
classification:
  projectType: developer-tool
  domain: developer-experience
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document - Reflector System Rationalization

**Author:** Jedi
**Date:** 2026-01-23
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

The Reflector system enables agent-to-UI communication in Pennyfarthing through HTML comment markers. Currently implemented separately in Cyclist (Electron terminal) and VS Code extension, the system suffers from code duplication, inconsistent APIs, and configuration inflexibility. This initiative consolidates the marker parsing logic into `@pennyfarthing/shared`, creating a single source of truth that improves reliability, maintainability, and user experience consistency across all platforms.

---

## 1. Problem Statement

### Current State

The Reflector marker system is implemented in two locations:
- **Cyclist Terminal:** `packages/cyclist/src/public/js/components/message-view/quick-actions.js`
- **VS Code Extension:** `packages/vscode-extension/src/adapters/reflector.ts`

### Pain Points

| Issue | Impact | Severity |
|-------|--------|----------|
| **Duplicated regex patterns** | Changes must be made in 2 places | High |
| **Inconsistent API naming** | `detectStructuredMarkers` vs `detectMarkers` | Medium |
| **Separate type definitions** | Risk of type drift between platforms | Medium |
| **Hardcoded TirePump threshold** | Cannot configure context clear trigger | Low |
| **Different code stripping logic** | Potential edge case behavior differences | Medium |

### Business Impact

- **Maintenance burden:** ~260 lines of duplicated code
- **Reliability risk:** Behavioral divergence between platforms
- **Developer confusion:** Inconsistent APIs across the codebase
- **User experience:** Inconsistent marker handling between Cyclist and VS Code

---

## 2. Product Vision

### Vision Statement

A unified, reliable Reflector system that provides **consistent agent-to-UI communication** across all Pennyfarthing platforms, with a single source of truth for marker parsing and configurable behavior.

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Code duplication | 0 lines | No duplicate marker parsing logic |
| API consistency | 100% | Same function names across all consumers |
| Test coverage | >90% | Shared marker module tests |
| Configuration | Configurable | TirePump threshold in YAML |

### Target Users

1. **Pennyfarthing developers** - Maintain and extend the marker system
2. **Agent authors** - Emit markers for UI actions
3. **End users** - Experience consistent handoff and context clearing

---

## 3. User Journeys

### Journey 1: Agent Emits Handoff Marker

**Actor:** Opus agent completing a phase
**Goal:** Signal UI to show "Continue with /dev" button

```
Agent completes TEA phase
  → Subagent runs handoff-marker.sh
  → Returns AGENT_COMMAND with marker
  → Agent outputs: <!-- CYCLIST:HANDOFF:/dev -->
  → UI detects marker (same logic in Cyclist & VS Code)
  → UI shows consistent "Continue with /dev" action
```

**Current friction:** Different detection functions, potential edge case differences
**After rationalization:** Single `detectMarkers()` function, identical behavior

### Journey 2: TirePump Context Clear

**Actor:** System during high context usage
**Goal:** Automatically clear and reload agent

```
Context reaches threshold (currently hardcoded 60%)
  → check-context.sh sets USE_TIREPUMP=true
  → handoff-marker.sh emits CONTEXT_CLEAR marker
  → UI triggers clearAndReload()
  → Fresh context, agent reloaded
```

**Current friction:** Threshold not configurable
**After rationalization:** `tirepump_threshold` in config.local.yaml

### Journey 3: Developer Adds New Marker Type

**Actor:** Pennyfarthing developer
**Goal:** Add new marker type (e.g., PROGRESS)

```
Developer identifies need for new marker
  → Adds type to packages/shared/src/marker/types.ts
  → Updates constants.ts with new MARKER_TYPES entry
  → Adds detection logic to detect.ts
  → Writes tests in detect.test.ts
  → Both Cyclist and VS Code automatically support it
```

**Current friction:** Must update 2 files with same logic
**After rationalization:** Single location, automatic propagation

---

## 4. Domain Model

### Core Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                     REFLECTOR DOMAIN                        │
└─────────────────────────────────────────────────────────────┘

  Marker                    MarkerType                Consumer
  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
  │ type: MarkerType│      │ HANDOFF         │      │ Cyclist         │
  │ value: string   │──────│ CONTEXT_CLEAR   │──────│ VS Code         │
  │ source: string  │      │ INVOKE          │      │ (future: CLI)   │
  └─────────────────┘      │ QUESTION        │      └─────────────────┘
                           │ CHOICES         │
                           └─────────────────┘

  MarkerResult              MarkerGenerator         ContextChecker
  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
  │ type: ResultType│      │ handoff-marker  │      │ check-context   │
  │ agent?: string  │◄─────│ .sh             │◄─────│ .sh             │
  │ autoExecute?    │      └─────────────────┘      │                 │
  │ confidence: num │                               │ CONTEXT_PERCENT │
  └─────────────────┘                               │ USE_TIREPUMP    │
                                                    └─────────────────┘
```

### Invariants

1. **Marker format:** Always `<!-- CYCLIST:TYPE:value -->`
2. **Code block immunity:** Markers inside ``` blocks are never detected
3. **Case handling:** TYPE is case-insensitive, value preserves case
4. **Null semantics:** No markers found returns `null`, not empty array

---

## 5. Functional Requirements

### FR-1: Shared Marker Module

**Priority:** P0 (Critical)

Create `packages/shared/src/marker/` with:

| File | Purpose | Dependencies |
|------|---------|--------------|
| `types.ts` | MarkerType, Marker, MarkerResult interfaces | None |
| `constants.ts` | MARKER_PATTERN regex, MARKER_TYPES | None |
| `strip.ts` | stripCodeBlocks(), stripMarkers() | constants |
| `detect.ts` | detectMarkers() | types, constants, strip |
| `index.ts` | Re-export all | All above |

**Acceptance Criteria:**
- [ ] All types exported from `@pennyfarthing/shared`
- [ ] `detectMarkers()` returns `Marker[] | null`
- [ ] `stripMarkers()` removes all marker types
- [ ] `stripCodeBlocks()` removes fenced code blocks
- [ ] Regex resets `lastIndex` before each use

### FR-2: Migrate Cyclist Consumer

**Priority:** P1 (High)

Update `quick-actions.js` to import from shared:

```javascript
import { detectMarkers, stripMarkers, MARKER_TYPES } from '@pennyfarthing/shared';
```

**Acceptance Criteria:**
- [ ] Remove local `markerPattern` regex
- [ ] Remove local `detectStructuredMarkers()` function
- [ ] Keep UI-specific `processStructuredMarkers()` (uses shared detection)
- [ ] All Cyclist tests pass
- [ ] Manual testing in Electron app confirms behavior

### FR-3: Migrate VS Code Consumer

**Priority:** P1 (High)

Update `reflector.ts` to import from shared:

```typescript
import { detectMarkers, stripMarkers, type Marker } from '@pennyfarthing/shared';
```

**Acceptance Criteria:**
- [ ] Remove local `MARKER_PATTERN` regex
- [ ] Remove local `detectMarkers()` function
- [ ] Remove local `stripMarkers()` function
- [ ] `ReflectorAdapter.processText()` delegates to shared
- [ ] Extension tests pass

### FR-4: Configurable TirePump Threshold

**Priority:** P2 (Medium)

Add `tirepump_threshold` to config schema:

```yaml
# .pennyfarthing/config.local.yaml
context_budget:
  tirepump_threshold: 60  # NEW
  imminent_threshold: 65
  warning_threshold: 60
  critical_threshold: 85
  max_tokens: 200000
```

**Acceptance Criteria:**
- [ ] `check-context.sh` reads threshold from config
- [ ] Falls back to default (60) if not specified
- [ ] Documented in config example

---

## 6. Non-Functional Requirements

### NFR-1: Build Order

**Requirement:** `@pennyfarthing/shared` must build before Cyclist and VS Code extension.

**Rationale:** Consumers import compiled output from shared package.

**Implementation:** pnpm workspace already handles this via dependency graph.

### NFR-2: Test Coverage

**Requirement:** >90% coverage for marker module.

**Test Cases Required:**
- Empty/null input handling
- All 5 marker types detection
- Multiple markers in order
- Code block immunity
- Case insensitivity
- Whitespace handling
- Value case preservation

### NFR-3: API Consistency

**Requirement:** Unified function naming across all consumers.

| Function | Behavior |
|----------|----------|
| `detectMarkers(text)` | Returns `Marker[] \| null` |
| `stripMarkers(text)` | Returns text with markers removed |
| `stripCodeBlocks(text)` | Returns text with ``` blocks removed |

### NFR-4: Backwards Compatibility

**Requirement:** No behavioral changes for end users.

**Validation:** Same markers produce same UI actions before and after migration.

---

## 7. Scope Definition

### In Scope

| Item | Rationale |
|------|-----------|
| Shared marker module creation | Core deliverable |
| Cyclist migration | Primary consumer |
| VS Code migration | Secondary consumer |
| TirePump configuration | User-requested improvement |
| Comprehensive tests | Quality gate |

### Out of Scope

| Item | Rationale |
|------|-----------|
| New marker types | Separate initiative |
| CLI marker support | Future consideration |
| Marker versioning | Premature optimization |
| UI redesign | Different initiative |

### Dependencies

| Dependency | Type | Risk |
|------------|------|------|
| `@pennyfarthing/shared` package exists | Technical | Low (already exists) |
| pnpm workspace build order | Technical | Low (already configured) |
| Vitest for Cyclist tests | Technical | Low (already in use) |

---

## 8. Implementation Phases

### Phase 1: Create Shared Module (Story 1)

**Effort:** 3 points
**Dependencies:** None

1. Create `packages/shared/src/marker/` directory structure
2. Implement types.ts, constants.ts, strip.ts, detect.ts
3. Add comprehensive tests (detect.test.ts)
4. Export from packages/shared/src/index.ts
5. Build and verify

### Phase 2: Migrate Cyclist (Story 2)

**Effort:** 2 points
**Dependencies:** Phase 1

1. Import shared functions in quick-actions.js
2. Remove duplicated code
3. Update any Cyclist-specific tests
4. Manual testing in Electron app

### Phase 3: Migrate VS Code Extension (Story 3)

**Effort:** 2 points
**Dependencies:** Phase 1

1. Add @pennyfarthing/shared to extension dependencies
2. Import shared functions in reflector.ts
3. Remove duplicated code
4. Verify extension functionality

### Phase 4: Configuration (Story 4)

**Effort:** 1 point
**Dependencies:** None (can parallel with Phase 2-3)

1. Add tirepump_threshold to YAML schema
2. Update check-context.sh to read from config
3. Document in config example

**Total Effort:** 8 story points across 4 stories

---

## 9. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Behavioral regression | Medium | High | Comprehensive test coverage before migration |
| Build order issues | Low | Medium | pnpm workspace already handles dependency graph |
| JS/TS interop issues | Low | Medium | Cyclist imports compiled .js from dist/ |
| Missing edge cases | Medium | Medium | Port existing tests from both implementations |

---

## 10. Success Metrics

### Quantitative

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| Duplicated lines | ~260 | 0 | End of Phase 3 |
| Test coverage (marker) | 0% | >90% | End of Phase 1 |
| Build time impact | N/A | <5% increase | End of Phase 3 |

### Qualitative

- Developers report easier maintenance
- No user-reported regressions
- Consistent behavior confirmed across platforms

---

## 11. Appendices

### A. Related Documents

- [docs/REFLECTOR-SYSTEM.md](../REFLECTOR-SYSTEM.md) - Technical report
- [docs/adr/0011-reflector-marker-consolidation.md](../adr/0011-reflector-marker-consolidation.md) - Architecture decision
- [docs/adr/0001-consolidate-code-duplication.md](../adr/0001-consolidate-code-duplication.md) - Prior consolidation pattern

### B. Glossary

| Term | Definition |
|------|------------|
| **Reflector** | System for agent-to-UI communication via markers |
| **TirePump** | Context clearing subsystem (bicycle metaphor) |
| **Marker** | HTML comment in format `<!-- CYCLIST:TYPE:value -->` |
| **AGENT_COMMAND** | Protocol for subagent returning marker to parent |

### C. Story Breakdown

| Story | Title | Points | Phase |
|-------|-------|--------|-------|
| 1 | Create shared marker module | 3 | 1 |
| 2 | Migrate Cyclist to shared markers | 2 | 2 |
| 3 | Migrate VS Code to shared markers | 2 | 3 |
| 4 | Configurable TirePump threshold | 1 | 4 |

---

**Document Status:** Complete
**Next Action:** Create stories in sprint backlog
