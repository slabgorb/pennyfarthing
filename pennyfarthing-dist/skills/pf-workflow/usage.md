# Workflow — Detailed Usage

## Shell Script Commands

### List Workflows

```bash
.pennyfarthing/scripts/workflow/list-workflows.sh
```

No arguments. Returns table of workflows with type, phases/steps count, modes, default flag, description.

### Show Workflow

```bash
.pennyfarthing/scripts/workflow/show-workflow.sh [NAME]
```

| Arg | Required | Description |
|-----|----------|-------------|
| `NAME` | No | Workflow name (`tdd`, `trivial`, etc.). Omit for current session's workflow. |

Returns workflow description, phase flow diagram, phases table, trigger conditions.

### Switch Workflow

Manual edit of `.session/{story-id}-session.md` — change the `**Workflow:**` line.

Warning: Only do this when story requirements have fundamentally changed. Switching resets phase tracking.

### Start Stepped Workflow

```bash
.pennyfarthing/scripts/workflow/start-workflow.sh <NAME> [--mode <MODE>]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | Yes | Workflow name (e.g., `architecture`) |
| `--mode` | No | `create` (default), `validate`, or `edit` |

Creates a new session and begins at step 1.

### Resume Stepped Workflow

```bash
.pennyfarthing/scripts/workflow/resume-workflow.sh [NAME]
```

| Arg | Required | Description |
|-----|----------|-------------|
| `NAME` | No | Workflow to resume. Detects from active session if omitted. |

### Workflow Status

```bash
.pennyfarthing/scripts/workflow/workflow-status.sh
```

No arguments. Shows current step, progress percentage, mode.

### Fix Session Phase

```bash
.pennyfarthing/scripts/workflow/fix-session-phase.sh <STORY_ID> <TARGET_PHASE> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID (e.g., `56-1` or `MSSCI-12190`) |
| `TARGET_PHASE` | Yes | Target phase to set |
| `--dry-run` | No | Preview without making changes |

Valid phases by workflow:

| Workflow | Phases |
|----------|--------|
| `tdd` | setup, red, green, review, approved, finish |
| `trivial` | setup, implement, review, approved, finish |

Updates `**Phase:**` field, `**Phase Started:**` timestamp, and handoff history table.

---

## Python CLI Commands

### Check Workflow State

```bash
pf workflow check [--json]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

Returns current story ID, phase, workflow, and state.

### Check Phase Owner

```bash
pf workflow phase-check <WORKFLOW_NAME> <PHASE>
```

| Arg | Required | Description |
|-----|----------|-------------|
| `WORKFLOW_NAME` | Yes | Workflow type (`tdd`, `trivial`, etc.) |
| `PHASE` | Yes | Phase to check (`red`, `implement`, `review`, etc.) |

Returns the agent name that owns the phase.

### Emit Handoff Marker

```bash
pf workflow handoff <NEXT_AGENT>
```

| Arg | Required | Description |
|-----|----------|-------------|
| `NEXT_AGENT` | Yes | Agent to hand off to (`tea`, `dev`, `reviewer`, etc.) |

Outputs CYCLIST-formatted YAML marker.

---

## Workflow Routing Priority

When multiple workflows match a story:

1. **Explicit tag:** `workflow: docs` on story overrides everything
2. **Trigger tags:** Story tags match workflow's `triggers.tags`
3. **Type match:** Story type matches workflow's `triggers.types`
4. **Points match:** Story points within `triggers.points` range
5. **Default:** Workflow with `default: true` (tdd)

## File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/workflows/` | Built-in workflow YAML definitions |
| `.session/{story-id}-session.md` | Current story's workflow assignment |

## Creating Custom Workflows

See `pennyfarthing-dist/guides/workflow-schema.md` for the full YAML schema and `pennyfarthing-dist/guides/bikelane.md` for BikeLane stepped workflows.
