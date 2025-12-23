---
description: Facilitate sprint planning session
---

# Sprint Planning - Plan the Next Sprint

You are facilitating a **sprint planning session** to define what work will be done in the upcoming sprint.

## Pre-Planning: Load Context

```bash
# Current sprint status
cat sprint/current-sprint.yaml

# Full backlog
cat sprint/backlog.yaml

# Recent velocity (completed points)
grep -A5 "summary:" sprint/current-sprint.yaml
```

## Planning Phases

### Phase 1: Review & Reflect (5 min)
- How did last sprint go? (Quick check, not full retro)
- Any carryover items?
- Blockers or dependencies resolved?

### Phase 2: Capacity Planning (3 min)
- Team availability this sprint
- Known interruptions (holidays, meetings, on-call)
- Realistic velocity target

### Phase 3: Backlog Grooming (10 min)
- Review top items in backlog
- Clarify acceptance criteria
- Estimate if not already estimated
- Identify dependencies

### Phase 4: Sprint Goal (2 min)
- What's the ONE thing this sprint must achieve?
- How will we know we succeeded?

### Phase 5: Commitment (5 min)
- Select stories that fit capacity
- Balance: features vs bugs vs tech debt
- Ensure no single epic dominates
- Leave buffer for unknowns (~20%)

## Output Template

```markdown
## Sprint [N+1] Planning
**Dates**: [Start] - [End]
**Sprint Goal**: [One sentence goal]

### Capacity
- Velocity target: [X] points
- Buffer (20%): [Y] points reserved
- Usable capacity: [Z] points

### Committed Stories

#### [Epic Name] ([X] pts)
| Story | Points | Priority | Assignee |
|-------|--------|----------|----------|
| [Story] | 3 | P0 | Dev |
| [Story] | 5 | P1 | Dev |

#### [Another Epic] ([Y] pts)
...

#### Bugs ([Z] pts)
| Bug | Points | Priority |
|-----|--------|----------|
| BUG-XXX | 2 | P0 |

### Not This Sprint (Explicitly Deferred)
- [Story] - Why deferred
- [Story] - Blocked by X

### Risks
- [Risk and mitigation]

### Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] No P0/P1 bugs introduced
```

## After Planning

1. Update `sprint/current-sprint.yaml` with committed stories
2. Move selected items from `backlog` to `in_sprint`
3. Create feature branches if needed
4. Notify team of sprint start

## Usage

```
/sprint-planning              # Plan next sprint
/sprint-planning sprint-3     # Plan specific sprint
```

---

**READY TO PLAN. WHAT'S OUR GOAL FOR THE NEXT SPRINT?**
