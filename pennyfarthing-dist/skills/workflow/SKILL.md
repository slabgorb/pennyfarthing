---
name: workflow
description: List available workflows, show current workflow details, and switch workflows mid-session if needed. Use for all workflow-related operations.
---

# Workflow Management Skill

## Overview

Pennyfarthing uses YAML-defined workflows to control agent sequences. The default TDD workflow (SM → TEA → Dev → Reviewer) can be customized or replaced with alternative flows for documentation, debugging, devops, and more.

## Quick Reference

| Action | Command |
|--------|---------|
| List all workflows | `/workflow` |
| Show current workflow | `/workflow show` |
| Show specific workflow | `/workflow show <name>` |
| Set active workflow | `/workflow set <name>` |

## List Available Workflows

To see all available workflows:

```zsh
for f in pennyfarthing-dist/workflows/*.yaml; do
  name=$(grep "^  name:" "$f" | head -1 | cut -d: -f2 | tr -d ' "')
  desc=$(grep "^  description:" "$f" | head -1 | cut -d: -f2- | sed 's/^ *//')
  default=$(grep "default: true" "$f" >/dev/null && echo " (default)" || echo "")
  echo "- $name$default: $desc"
done
```

## Show Current Workflow

To display the active workflow for the current session:

```zsh
# Get workflow from session file
SESSION=$(ls .session/*-session.md 2>/dev/null | head -1)
if [[ -n "$SESSION" ]]; then
  WORKFLOW=$(grep "^workflow:" "$SESSION" | cut -d: -f2 | tr -d ' ')
  PHASE=$(grep "^\*\*Phase:\*\*" "$SESSION" | sed 's/.*\*\* //')
  echo "Current workflow: ${WORKFLOW:-tdd (default)}"
  echo "Current phase: ${PHASE:-unknown}"
fi
```

To show details of a specific workflow:

```zsh
cat pennyfarthing-dist/workflows/<name>.yaml
```

### Workflow Phase Visualization

```zsh
WORKFLOW_FILE="pennyfarthing-dist/workflows/<name>.yaml"
echo "Phases:"
grep -A1 "^    - name:" "$WORKFLOW_FILE" | grep -E "(name:|agent:)" | paste - - | while read line; do
  name=$(echo "$line" | grep -o "name: [a-z]*" | cut -d: -f2 | tr -d ' ')
  agent=$(echo "$line" | grep -o "agent: [a-z-]*" | cut -d: -f2 | tr -d ' ')
  echo "  $name → $agent"
done
```

## Set Active Workflow

To switch workflows mid-session (use sparingly):

1. Verify workflow exists:
   ```zsh
   ls pennyfarthing-dist/workflows/<name>.yaml
   ```

2. Update session file's workflow field:
   ```zsh
   # Edit .session/{story-id}-session.md
   # Add or update: workflow: <name>
   ```

3. Continue with the new workflow's agent sequence

**Note:** Switching workflows mid-session resets phase tracking. Only do this when the story requirements have fundamentally changed.

## Workflow File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/workflows/` | Built-in workflows |
| `.claude/workflows/` | User-created custom workflows (symlinked) |

## Built-in Workflows

### TDD (default for 3+ point features)

```
SM (setup) → TEA (red) → Dev (green) → Reviewer (review) → SM (finish)
```

- Full test-driven development cycle
- TEA writes failing tests first
- Dev implements to make tests pass
- Triggers: `types: [feature, enhancement]`, `points.min: 3`

### Trivial (for 1-2 point fixes)

```
SM (setup) → Dev (implement) → Reviewer (review) → SM (finish)
```

- Skips TEA phase for quick fixes
- Dev ensures existing tests still pass
- Triggers: `types: [chore, fix, refactor]`, `points.max: 2`

## Creating Custom Workflows

See `pennyfarthing-dist/guides/workflow-schema.md` for the full schema.

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

## Routing Priority

When multiple workflows match a story:

1. **Explicit tag:** `workflow:docs` on story overrides everything
2. **Trigger tags:** Story tags match workflow's `triggers.tags`
3. **Type match:** Story type matches workflow's `triggers.types`
4. **Points match:** Story points within `triggers.points` range
5. **Default:** Workflow with `default: true`

## Related

- Workflow schema: `pennyfarthing-dist/guides/workflow-schema.md`
- Workflow loader: `packages/core/src/workflow/workflow-loader.ts`
- Workflow router: `packages/core/src/workflow/workflow-router.ts`
