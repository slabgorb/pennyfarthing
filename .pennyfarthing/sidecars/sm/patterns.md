# SM Agent Patterns

> Pennyfarthing-specific story management patterns

## Scale-Adaptive Workflow

| Points | Scale | Workflow |
|--------|-------|----------|
| 1-2 pts | Trivial | SM → Dev (skip TEA) |
| 3-5 pts | Standard | SM → TEA → Dev |
| 8+ pts | Complex | SM → TEA → Dev |

## Session File Structure

```markdown
## Story X-Y: [Title]
**Epic:** [Epic name]
**Points:** [N] | **Priority:** [P0/P1/P2]
**Repos:** [api/ui/both]
**Branch:** feat/X-Y-short-description
**Phase:** sm
**Status:** setup

## Acceptance Criteria
- [ ] AC1
- [ ] AC2

## Workflow
- [ ] SM: Story setup
- [ ] TEA: Write failing tests
- [ ] Dev: Implement to GREEN
- [ ] Reviewer: Code review
- [ ] SM: Finish story
```

## Helper Delegation

| Task | Subagent |
|------|----------|
| Status checks | `workflow-status-check` |
| Backlog research | `generic-sm-setup MODE=research` |
| Story setup | `generic-sm-setup MODE=setup` |
| Finish preflight | `generic-sm-finish PHASE=preflight` |
| Finish execute | `generic-sm-finish PHASE=execute` |

## Reserve Capacity for Emergent Work

Plan at 80-85% of velocity target to leave room for:
- Bug fixes discovered during development
- Process improvements identified during work
- Urgent customer requests

## Early Epic Start When Ahead of Schedule

**Trigger:** Sprint is 80%+ complete with significant time remaining.

**Action:**
1. Start next sprint's P1 stories early
2. Keep velocity attribution clean (story still counts toward next sprint)
3. Only start well-defined stories with clear acceptance criteria

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

## Jira Operations

**Always read `/jira` skill first** for CLI commands. Key points:
- Use `pennyfarthing` label for all issues
- Field is `jira:` (not `jira_key:`) in sprint YAML
- American spelling: "Canceled" not "Cancelled"
- Auto-epic creation: PR #315 adds epics automatically during setup
- Bidirectional sync: `.pennyfarthing/scripts/run.sh jira-bidirectional-sync.mjs`
