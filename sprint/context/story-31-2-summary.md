# Story 31-2: Workflow Loader and Validator - Summary

**Completed:** 2026-01-13
**Points:** 3
**Epic:** 31 - Customizable Workflow Engine

## What Was Built

Implemented a workflow loader module that reads YAML workflow definitions from disk, parses them, and validates against the schema from Story 31-1. Two functions provide single-file and batch-directory loading with clean error handling at each layer.

## Key Technical Decisions

1. **Synchronous file reads** - Acceptable for config loading; keeps API simple without async complexity.
2. **Partial results pattern** - `loadWorkflowsFromDir()` returns valid workflows separately from failures, allowing graceful degradation when some files are malformed.
3. **Error layering** - Distinct error handling for file system errors, YAML parse errors, and schema validation errors with clear messages at each level.
4. **Delegation to schema validator** - Loader focuses on file operations; validation logic stays in `workflow-schema.ts` from 31-1.

## Implementation Patterns

- **Result types over exceptions** - `WorkflowLoadResult` and `WorkflowLoadResults` return success/failure with structured data rather than throwing.
- **Extension filtering** - Only `.yaml` and `.yml` files processed; other files silently ignored.
- **Re-exports** - Types from `workflow-schema.ts` re-exported for consumer convenience.

## Files Modified

| File | Lines | Purpose |
|------|-------|---------|
| `packages/core/src/workflow/workflow-loader.ts` | 85 | Main implementation |
| `packages/core/src/workflow/workflow-loader.test.ts` | 442 | 19 comprehensive tests |

## Test Coverage

- 7 tests for single-file loading (valid files, missing files, malformed YAML, schema errors)
- 7 tests for directory loading (empty dirs, mixed valid/invalid, extension filtering)
- 3 integration tests with real workflow files from `pennyfarthing-dist/workflows/`
- 2 error message quality tests

## Lessons for Future Work

1. **Schema validation hardening** - Reviewer noted optional string fields (`description`, `version`) aren't type-checked. Should be addressed in a follow-up story for 31-1.
2. **Edge case: directory named .yaml** - Would match filter and fail with EISDIR. Error is handled but message is confusing. Low priority - unlikely in practice.

## Dependencies

- Story 31-1 (Workflow definition schema) - provides `validateWorkflow()` function
- `yaml@2.8.2` - safe YAML parser (no code execution)

## Next Stories Unblocked

- Story 31-3: Story-to-workflow routing engine (can now load workflows to match against stories)
