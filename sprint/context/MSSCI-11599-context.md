# MSSCI-11599: Customizable Workflow Engine - Technical Context

## Epic Overview

**Goal:** Replace the hardcoded TDD flow (SM → TEA → Dev → Reviewer) with configurable YAML-based workflows that users can define and customize.

**Value:** Users can define custom agent sequences for different work types - debugging, documentation, devops, planning - without modifying core Pennyfarthing code.

**Points:** 15 (6 stories)
**Repos:** pennyfarthing

## Current State

### Hardcoded TDD Flow
The current workflow is embedded in `sm.md` (lines 240-369):
```
SM (claim) → TEA (tests) → Dev (implement) → Reviewer (approve) → SM (finish)
```

Scale-adaptive routing:
- 1-2 points (trivial): SM → Dev (skip TEA)
- 3+ points: SM → TEA → Dev → Reviewer

### State Detection
`workflow-status-check.md` detects workflow state by:
1. Scanning `.session/*-session.md` for active work
2. Parsing phase and status from session metadata
3. Checking git branches and Jira ownership
4. Returning: FINISH_STATE, NEW_WORK_STATE, IN_PROGRESS_STATE

### Session File Format
Current session files track:
```yaml
phase: TEA | Dev | Reviewer
status: in_progress | needs_review | approved
```

## Target Architecture

### Workflow Definition Files
Location: `.claude/workflows/*.yaml`

Each workflow defines:
- Name, description, version
- Phases: ordered list with agent, gates, inputs/outputs
- Triggers: rules for auto-routing stories to this workflow

### Workflow Engine
1. **Loader** (31-2): Reads YAML files, validates schema
2. **Router** (31-3): Matches stories to workflows by tags/type/points
3. **Tracker** (31-6): Session files track active workflow and phase history

### Built-in Workflows
After Epic 31, Epic 32 adds BMAD-style workflows:
- `tdd.yaml` - Current TDD flow as YAML
- `debugging.yaml` - Root cause analysis workflow
- `docs.yaml` - Documentation workflow
- `devops.yaml` - Infrastructure workflow
- `planning.yaml` - Strategic planning workflow

## Story Breakdown

| Story | Title | Points | Dependencies |
|-------|-------|--------|--------------|
| 31-1 | Workflow schema (YAML spec) | 3 | None |
| 31-2 | Loader and validator | 3 | 31-1 |
| 31-3 | Routing engine | 3 | 31-2 |
| 31-4 | Migrate TDD to YAML | 2 | 31-2 |
| 31-5 | /workflow skill | 2 | 31-3 |
| 31-6 | Session tracking | 2 | 31-3 |

## Technical Decisions

### Schema Format
YAML chosen over JSON for:
- Human readability
- Comments support
- Existing skill with sprint YAML

### Validation Approach
Schema validation at load time, not runtime:
- Fail fast on invalid workflows
- Clear error messages for authors
- No performance impact during execution

### Backward Compatibility
`tdd.yaml` must preserve current behavior exactly:
- Same agent sequence
- Same scale-adaptive routing
- Same handoff protocol

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Schema too rigid | Design for extension, validate required fields only |
| Breaking existing flow | 31-4 includes regression testing |
| Complex routing rules | Start simple (tags, type), add complexity later |

## Files to Modify

| File | Changes |
|------|---------|
| `pennyfarthing-dist/guides/workflow-schema.md` | New - schema documentation |
| `pennyfarthing-dist/workflows/tdd.yaml` | New - TDD workflow definition |
| `workflow-status-check.md` | Update to read workflow from session |
| `sm.md` | Update to use workflow engine |
| Session files | Add workflow tracking fields |

## Success Criteria

1. Users can define custom workflows in YAML
2. Stories route to correct workflow automatically
3. Session files show current workflow and phase
4. TDD flow works identically via YAML definition
5. Clear error messages for invalid workflows
