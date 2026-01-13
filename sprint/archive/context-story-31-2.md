# Story 31-2: Workflow Loader and Validator - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 31 - Customizable Workflow Engine |
| Points | 3 |
| Priority | P0 |
| Repos | pennyfarthing |
| Dependencies | 31-1 (done) |

## Current State

Story 31-1 established the foundation:
- TypeScript interfaces for workflow definitions (`WorkflowDefinition`, `WorkflowPhase`, `WorkflowTriggers`)
- `validateWorkflow(input: unknown): WorkflowValidationResult` function that validates parsed objects
- Error accumulation pattern - returns all validation errors, not just first
- 33 tests covering schema validation
- Example workflows in `pennyfarthing-dist/workflows/` (tdd.yaml, trivial.yaml)

The validator takes a parsed JavaScript object and validates it. Story 31-2 needs to:
1. Read YAML files from disk
2. Parse them
3. Pass to validator
4. Aggregate results

## Technical Approach

### New Module: `workflow-loader.ts`

Create `packages/core/src/workflow/workflow-loader.ts` with:

```typescript
// Load a single workflow file
loadWorkflowFile(filePath: string): WorkflowLoadResult

// Load all workflows from a directory
loadWorkflowsFromDir(dirPath: string): WorkflowLoadResults

// Re-export types from schema
```

### Types

```typescript
interface WorkflowLoadResult {
  success: boolean;
  filePath: string;
  workflow?: WorkflowDefinition;  // Present if success
  errors?: WorkflowValidationError[];  // Present if failure
}

interface WorkflowLoadResults {
  workflows: WorkflowDefinition[];  // Successfully loaded
  errors: Array<{
    filePath: string;
    errors: WorkflowValidationError[];
  }>;  // Failed loads
}
```

### Error Categories

1. **File system errors** - file not found, permission denied, not YAML
2. **YAML parse errors** - malformed YAML syntax
3. **Schema validation errors** - valid YAML but invalid workflow structure

All errors should include file path and line numbers where possible.

## Files to Modify

| File | Purpose |
|------|---------|
| `packages/core/src/workflow/workflow-loader.ts` | NEW - Loader implementation |
| `packages/core/src/workflow/workflow-loader.test.ts` | NEW - Loader tests |
| `packages/core/src/index.ts` | Export loader functions |

## Acceptance Criteria

- [ ] AC1: Loads all YAML files from `.claude/workflows/`
- [ ] AC2: Validates each against schema (uses existing validateWorkflow)
- [ ] AC3: Clear error messages for invalid workflows (file path + validation errors)
- [ ] AC4: Returns structured workflow objects
- [ ] AC5: Unit tests for loader and validator integration

## Testing Strategy

1. **Unit tests for `loadWorkflowFile()`:**
   - Valid workflow file → returns workflow object
   - File not found → clear error
   - Malformed YAML → parse error with file context
   - Valid YAML, invalid schema → validation errors with field paths

2. **Unit tests for `loadWorkflowsFromDir()`:**
   - Empty directory → empty results
   - All valid workflows → all in workflows array
   - Mixed valid/invalid → partial results with errors
   - Non-YAML files → ignored (only *.yaml, *.yml)

3. **Integration with real workflow files:**
   - Load `pennyfarthing-dist/workflows/tdd.yaml` → succeeds
   - Load `pennyfarthing-dist/workflows/trivial.yaml` → succeeds

## Dependencies

- `yaml` package (already in package.json)
- `workflow-schema.ts` exports (already done in 31-1)
- Node fs APIs for file reading

## Risks

| Risk | Mitigation |
|------|------------|
| YAML parser errors lack line info | Use yaml package's error objects which include line/column |
| Large workflow directories | Not a concern for MVP - workflow count is small |
