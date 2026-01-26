---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
inputDocuments:
  - docs/planning/reflector-prd.md
---

# Reflector System Rationalization - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Reflector System Rationalization initiative, decomposing the requirements from the PRD into implementable stories.

## Requirements Inventory

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | **Shared Marker Module** - Create `packages/shared/src/marker/` with types.ts, constants.ts, strip.ts, detect.ts, index.ts | P0 (Critical) |
| FR-1a | All types exported from `@pennyfarthing/shared` | P0 |
| FR-1b | `detectMarkers()` returns `Marker[] \| null` | P0 |
| FR-1c | `stripMarkers()` removes all marker types | P0 |
| FR-1d | `stripCodeBlocks()` removes fenced code blocks | P0 |
| FR-1e | Regex resets `lastIndex` before each use | P0 |
| FR-2 | **Migrate Cyclist Consumer** - Update `quick-actions.js` to import from shared package | P1 (High) |
| FR-2a | Remove local `markerPattern` regex | P1 |
| FR-2b | Remove local `detectStructuredMarkers()` function | P1 |
| FR-2c | Keep UI-specific `processStructuredMarkers()` (uses shared detection) | P1 |
| FR-3 | **Migrate VS Code Consumer** - Update `reflector.ts` to import from shared package | P1 (High) |
| FR-3a | Remove local `MARKER_PATTERN` regex | P1 |
| FR-3b | Remove local `detectMarkers()` function | P1 |
| FR-3c | Remove local `stripMarkers()` function | P1 |
| FR-3d | `ReflectorAdapter.processText()` delegates to shared | P1 |
| FR-4 | **Configurable TirePump Threshold** - Add `tirepump_threshold` to config.local.yaml | P2 (Medium) |
| FR-4a | `check-context.sh` reads threshold from config | P2 |
| FR-4b | Falls back to default (60) if not specified | P2 |

### Non-Functional Requirements

| ID | Requirement | Rationale |
|----|-------------|-----------|
| NFR-1 | **Build Order** - `@pennyfarthing/shared` must build before Cyclist and VS Code extension | Consumers import compiled output from shared package |
| NFR-2 | **Test Coverage** - >90% coverage for marker module | Quality gate |
| NFR-2a | Test empty/null input handling | Edge case |
| NFR-2b | Test all 5 marker types detection | Completeness |
| NFR-2c | Test multiple markers in order | Behavior |
| NFR-2d | Test code block immunity | Invariant |
| NFR-2e | Test case insensitivity | Invariant |
| NFR-2f | Test whitespace handling | Edge case |
| NFR-2g | Test value case preservation | Invariant |
| NFR-3 | **API Consistency** - Unified function naming (`detectMarkers`, `stripMarkers`, `stripCodeBlocks`) | Developer experience |
| NFR-4 | **Backwards Compatibility** - No behavioral changes for end users | User experience |

### Additional Requirements

**Domain Invariants (from PRD Section 4):**
- Marker format always `<!-- CYCLIST:TYPE:value -->`
- Markers inside ``` code blocks are never detected
- TYPE is case-insensitive, value preserves case
- No markers found returns `null`, not empty array

**Success Criteria (from PRD Section 2):**
- 0 lines of duplicated code
- 100% API consistency across consumers
- Configurable TirePump threshold
- >90% test coverage for marker module

### FR Coverage Map

| FR | Story | Description |
|----|-------|-------------|
| FR-1 | 1.1 | Create shared marker module structure |
| FR-1a | 1.1 | Export all types from @pennyfarthing/shared |
| FR-1b | 1.3 | detectMarkers() returns Marker[] or null |
| FR-1c | 1.4 | stripMarkers() removes all marker types |
| FR-1d | 1.2 | stripCodeBlocks() removes fenced code |
| FR-1e | 1.3 | Regex resets lastIndex before use |
| FR-2 | 1.6 | Migrate Cyclist to shared package |
| FR-2a | 1.6 | Remove local markerPattern regex |
| FR-2b | 1.6 | Remove local detectStructuredMarkers() |
| FR-2c | 1.6 | Keep UI-specific processStructuredMarkers() |
| FR-3 | 1.7 | Migrate VS Code to shared package |
| FR-3a | 1.7 | Remove local MARKER_PATTERN regex |
| FR-3b | 1.7 | Remove local detectMarkers() |
| FR-3c | 1.7 | Remove local stripMarkers() |
| FR-3d | 1.7 | Delegate processText() to shared |
| FR-4 | 1.8 | Add tirepump_threshold to config |
| FR-4a | 1.8 | check-context.sh reads from config |
| FR-4b | 1.8 | Default fallback to 60 |

## Epic 1: Reflector Marker Consolidation

**User Outcome:** Pennyfarthing developers have a single, well-tested source of truth for marker parsing used by all consumers, with configurable behavior.

**FRs covered:** All (FR-1 through FR-4)
**NFRs addressed:** NFR-1, NFR-2, NFR-3, NFR-4
**Points:** 8

---

### Story 1.1: Create Marker Types and Constants

As a **Pennyfarthing developer**,
I want **TypeScript interfaces and constants for the marker system**,
So that **all consumers use identical type definitions and patterns**.

**Acceptance Criteria:**

**Given** the `packages/shared/src/marker/` directory exists
**When** a developer imports from `@pennyfarthing/shared`
**Then** they can access `MarkerType`, `Marker`, and `MarkerResult` interfaces
**And** they can access `MARKER_PATTERN` regex and `MARKER_TYPES` constant
**And** all 5 marker types are defined: HANDOFF, CONTEXT_CLEAR, INVOKE, QUESTION, CHOICES

---

### Story 1.2: Implement Code Block Stripping

As a **Pennyfarthing developer**,
I want **a function to strip fenced code blocks from text**,
So that **markers inside code examples are not falsely detected**.

**Acceptance Criteria:**

**Given** text containing fenced code blocks with ``` delimiters
**When** `stripCodeBlocks(text)` is called
**Then** all fenced code blocks are removed from the output
**And** text outside code blocks is preserved
**And** empty input returns empty string
**And** text with no code blocks returns unchanged

---

### Story 1.3: Implement Marker Detection

As a **Pennyfarthing developer**,
I want **a function to detect CYCLIST markers in text**,
So that **both Cyclist and VS Code can use identical detection logic**.

**Acceptance Criteria:**

**Given** text that may contain `<!-- CYCLIST:TYPE:value -->` markers
**When** `detectMarkers(text)` is called
**Then** all markers are returned as `Marker[]` in order of appearance
**And** `null` is returned when no markers are found (not empty array)
**And** marker TYPE is detected case-insensitively
**And** marker value preserves original case
**And** regex `lastIndex` is reset before each use
**And** markers inside code blocks are not detected

---

### Story 1.4: Implement Marker Stripping

As a **Pennyfarthing developer**,
I want **a function to remove all markers from text**,
So that **UI components can display clean content without marker comments**.

**Acceptance Criteria:**

**Given** text containing one or more CYCLIST markers
**When** `stripMarkers(text)` is called
**Then** all markers are removed from the output
**And** surrounding text is preserved
**And** whitespace is handled appropriately
**And** empty input returns empty string

---

### Story 1.5: Comprehensive Test Suite for Marker Module

As a **Pennyfarthing developer**,
I want **>90% test coverage for the marker module**,
So that **regressions are caught before deployment**.

**Acceptance Criteria:**

**Given** the marker module implementation
**When** tests are executed with `npm test`
**Then** coverage exceeds 90% for the marker module
**And** tests cover: empty/null input, all 5 marker types, multiple markers in order
**And** tests cover: code block immunity, case insensitivity, whitespace handling
**And** tests cover: value case preservation, lastIndex reset behavior

---

### Story 1.6: Migrate Cyclist to Shared Marker Module

As a **Pennyfarthing developer**,
I want **quick-actions.js to import marker functions from @pennyfarthing/shared**,
So that **Cyclist uses the single source of truth for marker parsing**.

**Acceptance Criteria:**

**Given** the shared marker module is available in `@pennyfarthing/shared`
**When** `quick-actions.js` is updated
**Then** it imports `detectMarkers`, `stripMarkers`, `MARKER_TYPES` from shared
**And** local `markerPattern` regex is removed
**And** local `detectStructuredMarkers()` function is removed
**And** UI-specific `processStructuredMarkers()` is retained (delegates to shared detection)
**And** all existing Cyclist marker tests pass
**And** manual testing confirms identical behavior in Electron app

---

### Story 1.7: Migrate VS Code Extension to Shared Marker Module

As a **Pennyfarthing developer**,
I want **reflector.ts to import marker functions from @pennyfarthing/shared**,
So that **VS Code extension uses the single source of truth for marker parsing**.

**Acceptance Criteria:**

**Given** the shared marker module is available in `@pennyfarthing/shared`
**When** `reflector.ts` is updated
**Then** it imports `detectMarkers`, `stripMarkers`, type `Marker` from shared
**And** local `MARKER_PATTERN` regex is removed
**And** local `detectMarkers()` function is removed
**And** local `stripMarkers()` function is removed
**And** `ReflectorAdapter.processText()` delegates to shared module
**And** all existing extension tests pass

---

### Story 1.8: Configurable TirePump Threshold

As a **Pennyfarthing user**,
I want **to configure when context clearing triggers**,
So that **I can adapt the threshold to my workflow preferences**.

**Acceptance Criteria:**

**Given** `config.local.yaml` with optional `tirepump_threshold` setting
**When** `check-context.sh` runs
**Then** it reads the threshold from config if present
**And** falls back to default (60) if not specified
**And** the setting is documented in config example

---

**Total Effort:** 8 story points (8 stories)
