# Story 32-2: BMAD Story File Parser - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Story | 32-2 |
| Title | BMAD story file parser |
| Epic | 32 - BMAD Artifact Compatibility |
| Points | 2 |
| Priority | P0 |
| Repos | pennyfarthing |
| Jira | MSSCI-11095 |

## Current State

### BMAD Story Format (from sprint/context/bmad-formats.md)

BMAD story files are markdown documents with structured sections:

```markdown
# Story: [Title]

## Status
[ready-for-dev | in-progress | review | done]

## Story
As a [user type], I want [capability], so that [benefit]

## Acceptance Criteria
- Given [context], When [action], Then [expected result]

## Tasks / Subtasks
- [ ] Task 1
  - [ ] Subtask 1.1
- [x] Completed task

## Dev Notes
[Freeform development notes]

## Dev Agent Record
[AI agent session logs]

## File List
- path/to/file.ts - Created: Description
```

### Existing Patterns (from Epic 31)

The workflow system in `packages/core/src/workflow/` provides excellent patterns:

**workflow-schema.ts (330 lines):**
- TypeScript interfaces define the data contract
- `validateWorkflow()` validates raw input against schema
- Error accumulation pattern - collects all errors before returning
- Field path reporting in errors (e.g., `workflow.phases[0].agent`)
- Returns `{ valid: boolean, workflow?: T, errors?: ValidationError[] }`

**workflow-loader.ts (185 lines):**
- `loadWorkflowFile(filePath)` - loads and validates single file
- File I/O error handling wrapped as validation errors
- Uses `yaml` package for YAML parsing

### Target Location

New files for BMAD parsing:
```
packages/core/src/bmad/
├── story-parser.ts      # Parser implementation
└── story-parser.test.ts # TDD tests
```

## Technical Approach

### Parser Design

Follow the established patterns from workflow-schema.ts:

```typescript
// Types (story-parser.ts)
export interface BmadStorySection {
  title: string;
  content: string;
  lineStart: number;
}

export interface BmadTask {
  text: string;
  completed: boolean;
  subtasks?: BmadTask[];
}

export interface BmadAcceptanceCriteria {
  given: string;
  when: string;
  then: string;
  raw: string; // Original text for non-BDD format
}

export interface BmadStory {
  title: string;
  status: 'ready-for-dev' | 'in-progress' | 'review' | 'done';
  userStory: string;
  acceptanceCriteria: BmadAcceptanceCriteria[];
  tasks: BmadTask[];
  devNotes: string | null;
  devAgentRecord: string | null;
  fileList: string[];
}

export interface ParseResult {
  success: boolean;
  story?: BmadStory;
  errors?: ParseError[];
}

export interface ParseError {
  section: string;
  message: string;
  line?: number;
}

// Main function
export function parseBmadStory(content: string): ParseResult
```

### Parsing Strategy

1. **Section Extraction:** Split on `## ` headers, capture header name and content
2. **Required Sections:** Title (from H1), Status, Story, Acceptance Criteria
3. **Optional Sections:** Tasks, Dev Notes, Dev Agent Record, File List
4. **Error Accumulation:** Collect all errors before returning (following workflow-schema pattern)

### Section Parsers

| Section | Parser Logic |
|---------|-------------|
| `# Story:` | Extract title from H1 header |
| `## Status` | Validate against enum values |
| `## Story` | Extract as-is (user story text) |
| `## Acceptance Criteria` | Parse BDD format (Given/When/Then) or fall back to raw bullets |
| `## Tasks / Subtasks` | Parse checkbox format with nesting |
| `## Dev Notes` | Extract as-is (optional) |
| `## Dev Agent Record` | Extract as-is (optional) |
| `## File List` | Parse bullet list of paths |

### Edge Cases (from format reference)

- Missing optional sections → return null/empty array
- Extra whitespace around values → trim
- Multi-line acceptance criteria → join wrapped lines
- Nested task checkboxes (2-space indent) → parse as subtasks
- Non-BDD acceptance criteria → preserve as `raw` field

### Status Mapping

| BMAD Status | Pennyfarthing Equivalent |
|-------------|-------------------------|
| `ready-for-dev` | `backlog` |
| `in-progress` | `in_progress` |
| `review` | `needs_review` |
| `done` | `done` |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/bmad/story-parser.ts` | Create | Parser implementation |
| `packages/core/src/bmad/story-parser.test.ts` | Create | TDD tests |
| `packages/core/src/bmad/index.ts` | Create | Module exports |

## Acceptance Criteria

- [ ] AC1: Parses BMAD story markdown format - extracts all sections from valid story file
- [ ] AC2: Extracts status, ACs, tasks, dev notes - all section content correctly parsed
- [ ] AC3: Converts to Pennyfarthing session structure - BmadStory interface populated
- [ ] AC4: Preserves task checkbox state - `[ ]` = incomplete, `[x]` = complete
- [ ] AC5: Unit tests for parser - comprehensive test coverage following workflow-schema.test.ts patterns

## Testing Strategy

TEA will write tests first (RED phase) covering:

1. **Valid story parsing** - complete story with all sections
2. **Required sections validation** - errors for missing title/status/story/ACs
3. **Optional sections handling** - graceful handling of missing Dev Notes, etc.
4. **Task checkbox parsing** - nested tasks, mixed completed/incomplete
5. **BDD acceptance criteria** - Given/When/Then extraction
6. **Non-BDD fallback** - raw text when not in BDD format
7. **Status validation** - rejects invalid status values
8. **Error accumulation** - multiple errors reported together
9. **Edge cases** - whitespace, multi-line content, empty sections

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| BMAD format variations | Document canonical format, handle common variations |
| Multi-line AC parsing | Use regex that handles line continuations |
| Nested task depth | Support arbitrary nesting via recursion |

## Reference Files

- **BMAD format spec:** `sprint/context/bmad-formats.md` (lines 21-156)
- **Validation patterns:** `packages/core/src/workflow/workflow-schema.ts`
- **Test patterns:** `packages/core/src/workflow/workflow-schema.test.ts`
- **Epic context:** `sprint/context/epic-32-context.md`

## Previous Learnings (from Epic 32)

From Story 32-1 (Format Documentation):
- Real examples matter - use concrete story examples in tests
- Edge cases documented in format reference - implement all documented variations
- 778-line format reference is source of truth for parsing logic
