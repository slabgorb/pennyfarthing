---
name: workflow
description: |
  List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, or switching to a different workflow pattern.
args: "[list|show [name]|set <name>]"
---

# /workflow - Workflow Management

Pennyfarthing uses YAML-defined workflows to control agent sequences. The default TDD workflow (SM → TEA → Dev → Reviewer) can be customized or replaced with alternative flows.

## Commands

### `/workflow` or `/workflow list`

List all available workflows with type indicators.

**Run:**
```bash
.pennyfarthing/scripts/run.sh list-workflows.sh
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
.pennyfarthing/scripts/run.sh show-workflow.sh [name]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | No | Workflow name (e.g., `tdd`, `trivial`). If omitted, shows current session's workflow. |

**Examples:**
```bash
.pennyfarthing/scripts/run.sh show-workflow.sh          # Current session workflow
.pennyfarthing/scripts/run.sh show-workflow.sh tdd      # Show TDD workflow
.pennyfarthing/scripts/run.sh show-workflow.sh trivial  # Show trivial workflow
```

**Output:** Workflow description, phase flow diagram, phases table, and trigger conditions.

---

### `/workflow set <name>`

Switch to a different workflow mid-session.

**Warning:** Only do this when story requirements have fundamentally changed. Switching resets phase tracking.

**Steps:**
1. Verify workflow exists:
   ```bash
   .pennyfarthing/scripts/run.sh show-workflow.sh <name>
   ```

2. Update the session file's workflow field:
   - Edit `.session/{story-id}-session.md`
   - Change `**Workflow:**` line to new workflow name

3. Continue with the new workflow's agent sequence

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
