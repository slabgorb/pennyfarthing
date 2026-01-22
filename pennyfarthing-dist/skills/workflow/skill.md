---
name: workflow
description: |
  List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, switching to a different workflow pattern, or managing BikeLane stepped workflows.
args: "[list|show [name]|set <name>|start <name> [--mode <mode>]|resume [name]|status]"
---

# /workflow - Workflow Management

Pennyfarthing uses YAML-defined workflows to control agent sequences. The default TDD workflow (SM → TEA → Dev → Reviewer) can be customized or replaced with alternative flows. BikeLane stepped workflows provide progressive disclosure for planning and decision-making processes.

## Commands

### `/workflow` or `/workflow list`

List all available workflows with type indicators.

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/list-workflows.sh
```

**Output:** Table of workflows with:
- **Type**: `phased` (agent-driven) or `stepped` (progressive disclosure)
- **Steps/Phases**: Number of steps or phases in the workflow
- **Modes**: Available tri-modal options (create/validate/edit) if applicable
- **Default**: Whether this is the default workflow
- **Description**: Brief workflow description

---

### `/workflow show [name]`

Show workflow details. If no name provided, shows current session's workflow.

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh [name]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | No | Workflow name (e.g., `tdd`, `trivial`). If omitted, shows current session's workflow. |

**Examples:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh          # Current session workflow
.pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh tdd      # Show TDD workflow
.pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh trivial  # Show trivial workflow
```

**Output:** Workflow description, phase flow diagram, phases table, and trigger conditions.

---

### `/workflow set <name>`

Switch to a different workflow mid-session.

**Warning:** Only do this when story requirements have fundamentally changed. Switching resets phase tracking.

**Steps:**
1. Verify workflow exists:
   ```bash
   .pennyfarthing/scripts/core/run.sh workflow/show-workflow.sh <name>
   ```

2. Update the session file's workflow field:
   - Edit `.session/{story-id}-session.md`
   - Change `**Workflow:**` line to new workflow name

3. Continue with the new workflow's agent sequence

---

## BikeLane Stepped Workflow Commands

BikeLane workflows use `type: stepped` and execute one step at a time with user gates.

### `/workflow start <name> [--mode <mode>]`

Start a stepped workflow. Creates a new session and begins at step 1.

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/start-workflow.sh <name> [--mode <mode>]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | Yes | Workflow name (e.g., `architecture`) |
| `--mode` | No | Execution mode: `create` (default), `validate`, or `edit` |

**Examples:**
```bash
/workflow start architecture              # Start in default (create) mode
/workflow start architecture --mode validate  # Start in validate mode
```

---

### `/workflow resume [name]`

Resume an interrupted stepped workflow from the last completed step.

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/resume-workflow.sh [name]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | No | Workflow to resume. If omitted, detects from active session. |

**Examples:**
```bash
/workflow resume                  # Resume active workflow
/workflow resume architecture     # Resume specific workflow
```

---

### `/workflow status`

Show current stepped workflow progress.

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/workflow-status.sh
```

**Output:**
- Current workflow name and type
- Current step number and name
- Steps completed
- Mode (create/validate/edit)
- Progress percentage

---

## Built-in Workflows

### TDD (default for 3+ point features)

```
setup → red → green → review → finish
SM → TEA → Dev → Reviewer → SM
```

- Full test-driven development cycle
- TEA writes failing tests first
- Dev implements to make tests pass
- **Triggers:** `types: [feature, enhancement]`, `points.min: 3`

### Trivial (for 1-2 point fixes)

```
setup → impl → review → finish
SM → Dev → Reviewer → SM
```

- Skips TEA phase for quick fixes
- Dev ensures existing tests still pass
- **Triggers:** `types: [chore, fix, refactor]`, `points.max: 2`

### Agent-Docs (for process documentation)

```
setup → analyze → impl → review → finish
SM → Orchestrator → Orchestrator → Tech Writer → SM
```

- For agent file updates and process improvements
- Tech Writer reviews for documentation quality
- **Triggers:** `types: [docs, refactor, infrastructure]`, `labels: [agent-file]`

### BDD (behavior-driven development)

```
setup → design → red → green → review → finish
SM → UX-Designer → TEA → Dev → Reviewer → SM
```

- Adds UX design phase before testing
- For UI components and user-facing features
- **Triggers:** `types: [ui, ux, behavior]`, `tags: [bdd, ux-first]`

### Architecture (stepped workflow)

```
initialize → context → patterns → components → interfaces → risks → document
     1    →    2    →    3     →     4      →     5      →   6   →    7
                [gate]              [gate]                  [gate]
```

- Progressive disclosure stepped workflow
- 7 steps with gates at context, components, and risks
- **Type:** `stepped` (BikeLane)
- **Triggers:** `types: [architecture, design, adr]`, `tags: [architecture, stepped]`

---

## Workflow Routing Priority

When multiple workflows match a story:

1. **Explicit tag:** `workflow: docs` on story overrides everything
2. **Trigger tags:** Story tags match workflow's `triggers.tags`
3. **Type match:** Story type matches workflow's `triggers.types`
4. **Points match:** Story points within `triggers.points` range
5. **Default:** Workflow with `default: true` (tdd)

---

## File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/workflows/` | Built-in workflow definitions |
| `.session/{story-id}-session.md` | Current story's workflow assignment |

---

## Quick Reference

| Command | Script/Action |
|---------|---------------|
| `/workflow` | `list-workflows.sh` |
| `/workflow list` | `list-workflows.sh` |
| `/workflow show` | `show-workflow.sh` (current session) |
| `/workflow show tdd` | `show-workflow.sh tdd` |
| `/workflow set trivial` | Manual edit of session file |
| `/workflow start architecture` | `start-workflow.sh architecture` |
| `/workflow start architecture --mode validate` | `start-workflow.sh architecture --mode validate` |
| `/workflow resume` | `resume-workflow.sh` |
| `/workflow status` | `workflow-status.sh` |
| `/workflow fix-phase 56-1 review` | `fix-session-phase.sh 56-1 review` |

---

## Session Phase Repair

### `/workflow fix-phase <story-id> <target-phase> [--dry-run]`

Fix session file when handoffs didn't update phase tracking properly. This corrects the `**Phase:**` field and adds missing handoff history rows.

**When to use:**
- SM detects wrong phase after handoff
- `workflow-status-check` shows stale state
- Phase History table is incomplete

**Run:**
```bash
.pennyfarthing/scripts/core/run.sh workflow/fix-session-phase.sh <story-id> <target-phase> [--dry-run]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `56-1` or `MSSCI-12190`) |
| `target-phase` | Yes | Target phase to set (e.g., `review`, `approved`, `finish`) |

**Options:**
| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be done without executing |

**Examples:**
```bash
# Preview what would change
.pennyfarthing/scripts/core/run.sh workflow/fix-session-phase.sh 56-1 review --dry-run

# Fix phase to review (after Dev completed)
.pennyfarthing/scripts/core/run.sh workflow/fix-session-phase.sh 56-1 review

# Fix phase to approved (after Reviewer approved)
.pennyfarthing/scripts/core/run.sh workflow/fix-session-phase.sh 56-1 approved

# Using Jira key
.pennyfarthing/scripts/core/run.sh workflow/fix-session-phase.sh MSSCI-12190 approved
```

**Valid phases by workflow:**
| Workflow | Phase Sequence |
|----------|----------------|
| `tdd` | setup → red → green → review → approved → finish |
| `trivial` | setup → impl → review → approved → finish |

**What it updates:**
1. `**Phase:**` field to target phase
2. `**Phase Started:**` to current timestamp
3. Handoff History table with missing transitions

---

## Creating Custom Workflows

See `pennyfarthing-dist/guides/workflow-schema.md` for the full YAML schema.

Example documentation workflow:

```yaml
workflow:
  name: docs
  description: Documentation updates
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
    - name: write
      agent: tech-writer
      output: [documentation]
    - name: review
      agent: reviewer
      gate:
        type: approval
    - name: finish
      agent: sm

  triggers:
    types: [docs]
    tags: [documentation]
```

---

## BikeLane Documentation

For comprehensive documentation on creating stepped workflows, see:

- **[docs/BIKELANE.md](../../docs/BIKELANE.md)** - Full BikeLane user guide
- **[docs/adr/0005-bmad-workflow-import.md](../../docs/adr/0005-bmad-workflow-import.md)** - Technical ADR
- **[pennyfarthing-dist/workflows/architecture.yaml](../workflows/architecture.yaml)** - Example implementation
