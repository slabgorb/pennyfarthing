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

### When to Spawn Helpers
- Status checks → `workflow-status-check`
- Backlog research → `sm-work-research`
- Story setup → `sm-story-setup`
- Finish bookkeeping → `sm-finish-bookkeeping`

---

*Add story management patterns discovered during coordination below*
