# SM Agent Patterns

> Pennyfarthing-specific story management patterns

## Startup Workflow

On activation, load critical skills:
1. Run `agent-session.sh start "sm"` to load persona
2. Load and follow `.pennyfarthing/agents/sm.md`
3. Load Jira skill (`.claude/skills/jira/skill.md`) for story operations

## Scale-Adaptive Workflow

| Points | Scale | Workflow |
|--------|-------|----------|
| 1-2 pts | Trivial | SM → Dev (skip TEA) |
| 3-5 pts | Standard | SM → TEA → Dev |
| 8+ pts | Complex | SM → TEA → Dev |

## Helper Delegation

| Task | Subagent |
|------|----------|
| Status checks | `workflow-status-check` |
| Backlog research | `sm-setup MODE=research` |
| Story setup | `sm-setup MODE=setup` |
| Finish preflight | `sm-finish PHASE=preflight` |
| Finish execute | `sm-finish PHASE=execute` |

## Marking Stories Delivered in Another Story

When one story's implementation covers multiple planned stories:

```yaml
- id: 28-2
  title: Clipboard file paste
  status: done
  completed: 2026-01-12
  delivered_in: 28-1
  notes: Implemented as part of 28-1
```
