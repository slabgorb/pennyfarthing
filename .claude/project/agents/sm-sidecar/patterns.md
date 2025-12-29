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

## Reserve Capacity for Emergent Work

**Problem:** Mid-sprint bug discoveries (like Story 4-5) compete with planned work.

**Solution:** Plan at 80-85% of velocity target to leave room for:
- Bug fixes discovered during development
- Process improvements identified during work
- Urgent customer requests

**Example:** Sprint 2 had 34 points planned against 20pt velocity. Story 4-5 (statusline bug) was added mid-sprint but handled smoothly due to strong velocity.

---

## Early Epic Start When Ahead of Schedule

**Trigger:** Sprint is 80%+ complete with significant time remaining.

**Action:**
1. Start next sprint's P1 stories early
2. Keep velocity attribution clean (story still counts toward next sprint)
3. Only start well-defined stories with clear acceptance criteria

**Example:** Sprint 2 story 6-1 started on Day 4 because 82% of points were done.

---

*Add story management patterns discovered during coordination below*
