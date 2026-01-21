# Story MSSCI-12079: Step file parser with <step-meta> extraction

## Story Overview
- **Epic:** MSSCI-12060 - Stepped Workflow Support
- **Points:** 2 | **Priority:** P0
- **Repos:** pennyfarthing
- **Branch:** feat/MSSCI-12079-step-file-parser
- **Jira:** MSSCI-12079
- **Phase:** review
- **Status:** ready_for_review
- **Workflow:** tdd

## Acceptance Criteria
- [x] AC1: Parser extracts step-meta YAML block
- [x] AC2: Parser returns step number, name, gate flag
- [x] AC3: Parser handles missing meta gracefully
- [x] AC4: Gate detection from meta or marker

## Technical Context

### What We're Building

A parser that reads step files (markdown with optional `<step-meta>` block) and extracts:
1. **Step metadata** - number, name, gate flag from `<step-meta>` YAML block
2. **Markdown content** - everything after the meta block
3. **Gate detection** - from meta `gate: true` OR `<!-- GATE -->` marker in content

**Step File Format (from ADR-0005):**

```markdown
# Step 2: Context Analysis

<step-meta>
number: 2
name: context-analysis
gate: true
</step-meta>

## Purpose
Analyze the project context...

## Gate

<!-- GATE -->
- [C] Continue
- [R] Revise
```

### Output Interface

```typescript
interface ParsedStep {
  /** Step number (from meta or filename) */
  number: number;
  /** Step name/slug (from meta or filename) */
  name: string;
  /** Whether this step has a gate checkpoint */
  gate: boolean;
  /** Full markdown content (excluding step-meta block) */
  content: string;
  /** Raw step-meta YAML if present */
  meta?: Record<string, unknown>;
}

interface StepParseResult {
  success: boolean;
  step?: ParsedStep;
  error?: string;
}
```

### Files to Create/Modify

1. **Create:** `packages/core/src/workflow/step-parser.ts` - Main parser implementation
2. **Create:** `packages/core/src/workflow/step-parser.test.ts` - Test suite

### Design Decisions

1. **Meta block is optional** - Parser should work with or without `<step-meta>` block
2. **Fallback extraction** - If no meta, extract number/name from filename pattern `step-{nn}-{name}.md`
3. **Gate detection priority** - meta `gate: true` takes precedence over `<!-- GATE -->` marker
4. **YAML parsing** - Use existing YAML parser (js-yaml already a dependency)
5. **Error handling** - Return `StepParseResult` with success/error for graceful degradation

### Edge Cases to Handle

- Missing `<step-meta>` block entirely
- Malformed YAML in meta block
- Multiple `<!-- GATE -->` markers (only first matters)
- Empty step file
- No number in meta or filename
- Non-markdown content after meta

### Dependencies

- `js-yaml` - Already in workspace dependencies
- `WorkflowSteps` interface from `workflow-schema.ts` - For pattern matching

### Testing Strategy

- Valid step with complete meta block
- Valid step with partial meta (missing some fields)
- Valid step without meta (extract from filename)
- Gate detection from meta field
- Gate detection from HTML comment marker
- Malformed YAML handling
- Empty file handling
- Content extraction (meta stripped, content preserved)

## Workflow Tracking

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| setup | SM | completed | Context written, branch created |
| red | TEA | completed | 30 tests written, RED confirmed |
| green | Dev | completed | Implementation complete, PR #383 |
| review | Reviewer | completed | APPROVED - ready for SM finish |
| finish | SM | pending | Complete story |

## Handoff History

| From | To | Phase | Timestamp | Gate | Status |
|------|----|----|-----------|------|--------|
| TEA | Dev | red→green | 2026-01-20 | tests_fail | PASSED |
| Dev | Reviewer | green→review | 2026-01-20 | tests_pass | PASSED |
| Reviewer | SM | review→finish | 2026-01-20 | approval | PASSED |

## TEA Assessment

**Tests Required:** Yes
**Reason:** New parser module with complex logic needs comprehensive test coverage

**Test Files:**
- `packages/core/src/workflow/step-parser.test.ts` - 30 test cases

**Tests Written:** 30 tests covering 4 ACs
**Status:** RED (failing - module does not exist)

**Test Coverage by AC:**
| AC | Description | Tests |
|----|-------------|-------|
| AC1 | Parser extracts step-meta YAML block | 4 |
| AC2 | Parser returns step number, name, gate flag | 6 |
| AC3 | Parser handles missing meta gracefully | 8 |
| AC4 | Gate detection from meta or marker | 8 |
| Edge | Unicode, CRLF, indentation, partial meta | 4 |

**Implementation Target:**
- Create `packages/core/src/workflow/step-parser.ts`
- Export: `parseStepFile`, `parseStepFromPath`, `ParsedStep`, `StepParseResult`
- Use `js-yaml` for YAML parsing (already a workspace dependency)
- Regex for `<step-meta>...</step-meta>` extraction
- Regex for filename pattern `step-{n}-{name}.md`
- Regex for `<!-- GATE -->` marker detection

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/core/src/workflow/step-parser.ts` - Parser implementation with `parseStepFile` and `parseStepFromPath`

**Tests:** 30/30 passing (GREEN)
**PR:** #383 - feat(workflow): implement step file parser
**Branch:** feat/MSSCI-12079-step-file-parser (pushed)

**Implementation Details:**
- Regex-based `<step-meta>` extraction with YAML parsing via `yaml` package
- Filename fallback pattern: `step-{n}-{name}.md`
- Gate detection: meta `gate: true` takes precedence, falls back to `<!-- GATE -->` marker
- Graceful error handling for malformed YAML (falls back to filename)
- Preserves content indentation (uses regex trim instead of `.trim()`)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #383
**Verdict:** APPROVED

**Code Review Evidence:**

- **Data flow traced:** `content: string` from caller → `extractStepMeta()` at step-parser.ts:55 → `yaml.parse()` at step-parser.ts:68 → type-checked property extraction at step-parser.ts:115-124 (safe - each property validated with `typeof` before use)
- **Pattern observed:** Follows existing `workflow-loader.ts` pattern - same result interface structure (`success`/`error`), same YAML parsing approach, same error handling style
- **Error handling:** All failure paths return `{ success: false, error: string }` - checked at step-parser.ts:140-143 (no meta/filename), step-parser.ts:68 (YAML parse error wrapped), step-parser.ts:184-188 (file read error wrapped)

**Security:**
- No command injection vectors - parser only reads/parses data, doesn't execute it
- YAML parsed data is type-checked before use (step-parser.ts:115-124)
- Regex patterns use lazy quantifiers (`*?`) preventing ReDoS (step-parser.ts:38)

**Performance:**
- Single-pass regex extraction, O(n) complexity
- No loops over unbounded input
- Lazy YAML parsing (only when meta block found)

**Tests:** 30/30 passing (verified via preflight)

**Non-Blocking Observations:**
- [LOW] step-parser.ts:150-151 - Gate detection checks both `contentWithoutMeta` and `content` with OR, but marker cannot exist in step-meta block (YAML would fail), so second check is harmless but redundant
- [LOW] step-parser.test.ts:532-540 - `parseStepFromPath` only has type/existence test, not integration test; comment acknowledges this is due to filesystem mocking complexity

**Handoff:** To Leo McGarry (SM) for finish-story workflow
