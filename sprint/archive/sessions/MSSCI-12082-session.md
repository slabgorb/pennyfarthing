# Story MSSCI-12082: Session file stepped workflow state tracking

## Story Overview
- **Epic:** MSSCI-12060 - Stepped Workflow Support
- **Points:** 2 | **Priority:** P0
- **Repos:** pennyfarthing
- **Branch:** feat/MSSCI-12082-session-stepped-state
- **Jira:** MSSCI-12082
- **Phase:** review
- **Status:** approved
- **Workflow:** tdd

## Acceptance Criteria
- [ ] AC1: Session file has Workflow State section
- [ ] AC2: State tracks current step and completed steps
- [ ] AC3: State persists across session reloads
- [ ] AC4: Reader/writer handles missing state gracefully

## Technical Context

### What We're Building

We need to extend the session file format to track stepped workflow state. This story builds on the foundation laid by MSSCI-12079 (step file parser) and MSSCI-12081 (variable resolver).

**Current Session File Structure:**
- Story Overview (metadata)
- Acceptance Criteria
- Technical Context
- Workflow Tracking (TDD phases)
- Handoff History
- TEA/Dev/Reviewer Assessments

**New Workflow State Section to Add:**
```markdown
## Workflow State
- **Workflow Name:** {workflow-name}
- **Type:** stepped|phased
- **Mode:** create|validate|edit (if applicable)
- **Started:** YYYY-MM-DD HH:MM:SS
- **Last Updated:** YYYY-MM-DD HH:MM:SS
- **Current Step:** {n}
- **Steps Completed:** [step1, step2, step3]
- **Status:** in_progress|completed|paused
```

### Dependencies on Related Stories

1. **MSSCI-12079 (DONE):** Step file parser with `<step-meta>` extraction
   - `packages/core/src/workflow/step-parser.ts` - Parses individual step files
   - Exports: `parseStepFile`, `parseStepFromPath`, `ParsedStep`, `StepParseResult`

2. **MSSCI-12081 (DONE):** Variable resolver with priority chain
   - `packages/core/src/workflow/variable-resolver.ts` - Resolves {variable} placeholders
   - Exports: `resolveVariables`, `resolveStepVariables`, `VariableSource`, `ResolveResult`

3. **MSSCI-12078 (IN PROGRESS):** Workflow YAML schema extension
   - Defines workflow structure with type: stepped|phased
   - Includes steps, modes, variables, gates configuration

### Output Interfaces to Create

```typescript
/**
 * Stepped workflow state tracked in session file
 */
export interface WorkflowState {
  /** Workflow name (e.g., 'architecture', 'planning') */
  name: string;
  /** Workflow type: stepped or phased */
  type: 'stepped' | 'phased';
  /** Tri-modal mode if applicable (create, validate, edit) */
  mode?: 'create' | 'validate' | 'edit';
  /** ISO timestamp when workflow started */
  started: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Current step number (1-indexed) */
  currentStep: number;
  /** Array of completed step numbers */
  stepsCompleted: number[];
  /** Current workflow status */
  status: 'in_progress' | 'completed' | 'paused';
  /** User notes or decisions at gates */
  notes?: string;
}

/**
 * Session file with Workflow State section
 */
export interface SessionFile {
  storyId: string;
  jiraKey: string;
  branch: string;
  workflowState?: WorkflowState;
  // ... other fields
}
```

### Files to Create/Modify

1. **Create:** `packages/core/src/workflow/session-state.ts`
   - Export `WorkflowState` interface
   - `initWorkflowState()` - Create initial state
   - `updateWorkflowState()` - Mutate state with step progress
   - `parseSessionFile()` - Extract workflow state from session markdown
   - `updateSessionFile()` - Update session file with new state

2. **Create:** `packages/core/src/workflow/session-state.test.ts`
   - Test coverage for all 4 ACs

### Design Decisions

1. **Session file location:** `.session/{JIRA-KEY}-session.md` (existing convention)
2. **State section placement:** After "Acceptance Criteria", before "Technical Context"
3. **Timestamps:** ISO format with milliseconds for precision
4. **Persistence:** State written back to session file after each step transition
5. **Missing state handling:** Initialize empty state if not found (graceful degradation)

### Testing Strategy

**AC1: Session file has Workflow State section**
- Parse session file with Workflow State block present
- Verify all fields extracted correctly
- Verify fields with correct types

**AC2: State tracks current step and completed steps**
- Update state from step 1→2: currentStep = 2, stepsCompleted = [1]
- Update state from step 2→3: currentStep = 3, stepsCompleted = [1, 2]
- Verify step numbers are 1-indexed integers
- Verify stepsCompleted is array in order

**AC3: State persists across session reloads**
- Write state to session file
- Read session file back
- Verify state unchanged
- Test with various state values (multi-step workflows)

**AC4: Reader/writer handles missing state gracefully**
- Parse session file without Workflow State section
- Initialize default state
- Write default state to session file
- Verify section created with sensible defaults

### Implementation Approach

1. **Read session file marker:** Look for `## Workflow State` section
2. **Parse state values:** Extract key-value pairs from markdown list
3. **Type coercion:** Convert strings to appropriate types (numbers, arrays, booleans)
4. **Missing fields:** Use defaults (empty array for stepsCompleted, "in_progress" for status)
5. **Write state:** Format state object back to markdown list format
6. **Atomic writes:** Use existing session write patterns

## Workflow Tracking

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| setup | SM | completed | Context written, branch created, Jira claimed |
| red | TEA | completed | 32 failing tests written |
| green | Dev | completed | All 32 tests passing |
| review | Reviewer | completed | APPROVED |
| finish | SM | pending | Complete story |

## Handoff History

| From | To | Phase | Timestamp | Gate | Status |
|------|----|----|-----------|------|--------|
| SM setup complete | TEA | setup→red | 2026-01-20 | — | READY |
| TEA tests complete | Dev | red→green | 2026-01-20 | — | READY |
| Dev impl complete | Reviewer | green→review | 2026-01-20 | — | READY |
| Reviewer approved | SM | review→finish | 2026-01-20 | — | READY |

## TEA Assessment

**Tests Required:** Yes
**Reason:** State management requires comprehensive coverage for all AC and edge cases

**Test Files:**
- `packages/core/src/workflow/session-state.test.ts` (32 tests)

**Tests Written:**
- AC1: Session parsing - 6 tests (parse section, extract name/type/mode/timestamps/notes)
- AC2: State tracking - 9 tests (init, update step 1→2→3→4, accumulate, jump, timestamps)
- AC3: Persistence - 5 tests (format markdown, write, read back, multi-step, update existing)
- AC4: Missing state - 5 tests (undefined state, insert section, empty file, defaults)
- Edge cases - 8 tests (empty array, statuses, malformed, whitespace, duplicates, timestamps, formatting)

**Total:** 32 tests covering all ACs and edge cases

**RED State Verified:** All 32 tests fail with "not implemented" errors

**Functions to Implement:**
1. `initWorkflowState()` - Create initial state for new workflow
2. `updateWorkflowState()` - Advance state through steps
3. `parseSessionState()` - Read workflow state from session markdown
4. `updateSessionContent()` - Write workflow state to session markdown
5. `formatWorkflowState()` - Format state as markdown section

**Implementation Notes:**
- Parser uses regex for `## Workflow State` section detection
- Steps Completed as JSON array `[1, 2, 3]` in markdown
- ISO timestamps with milliseconds
- Graceful fallback for missing/malformed fields

## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 32/32 passing (GREEN)

**Files Changed:**
- `packages/core/src/workflow/session-state.ts` - Full implementation (~290 lines)

**Functions Implemented:**
1. `initWorkflowState()` - Creates initial state with timestamps, step 1, empty completed array
2. `updateWorkflowState()` - Advances steps, accumulates completed, updates lastUpdated
3. `parseSessionState()` - Regex-based markdown parsing of `## Workflow State` section
4. `formatWorkflowState()` - Formats state as markdown list with all fields
5. `updateSessionContent()` - Replaces or inserts Workflow State section in session markdown

**Implementation Approach:**
- Regex patterns for each field (`**Field Name:** value`)
- Steps Completed parsed as JSON array
- Graceful fallback for missing/malformed data
- Section insertion logic finds appropriate position (after Story Overview)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED

**Preflight:**
- Tests: 32/32 PASS
- Lint: PASS (fixed unused variable)
- Build: PASS

**Security:** No issues
- No file system operations (pure string manipulation)
- No external inputs
- Simple regex patterns (no ReDoS risk)
- No credentials or secrets

**Architecture:** Clean
- Clean separation of concerns (init, update, parse, format, updateContent)
- Follows project patterns (result objects with success/error)
- Immutable updates (spread operator, new arrays)
- Good JSDoc documentation

**Edge Cases:** Covered
- Empty content ✓
- Missing section ✓
- Malformed data ✓
- Duplicate step prevention ✓
- Whitespace trimming ✓

**Minor Notes:**
- Test for timestamp change could be stronger (captures original but doesn't assert difference)
- Non-null assertion on regex match index is safe but could use `?? 0`

**Verdict:** All ACs met, no blocking issues. Ready for SM to finish.

## Context Links

- **ADR:** docs/adr/0005-bmad-workflow-import.md
- **Epic:** MSSCI-12060 - Stepped Workflow Support
- **Related:** MSSCI-12078 (schema), MSSCI-12079 (parser), MSSCI-12081 (variables)
- **Previous Sessions:** MSSCI-12079-session.md (archived)
