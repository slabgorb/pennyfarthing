# SM Agent Patterns

> Story management and coordination patterns

## Story Selection

### Priority Assessment
1. Check sprint backlog in `sprint/current-sprint.yaml`
2. Filter by status: backlog
3. Sort by priority (P0 > P1 > P2)
4. Consider dependencies and blockers
5. Present top 3 options to user

### Story Readiness Checklist
- [ ] Clear acceptance criteria
- [ ] Dependencies identified
- [ ] Repos specified (api/ui/both)
- [ ] Points estimated
- [ ] No blockers

## Technical Context Creation

### Context File Structure
```markdown
# Story X-Y: [Title] - Technical Context

## Story Overview
- Epic: [Epic name]
- Points: [N]
- Priority: [P0/P1/P2]
- Repos: [api/ui/both]

## Current State
[What exists now]

## Technical Approach
[How to implement]

## Files to Modify
- `path/to/file.go` - [what changes]

## Acceptance Criteria
- [ ] AC1: [testable criterion]
- [ ] AC2: [testable criterion]

## Testing Strategy
[What to test and how]

## Dependencies & Risks
[Known issues]
```

### Acceptance Criteria Quality
Good AC is:
- **Testable**: Can write automated test
- **Specific**: No ambiguity
- **Independent**: Doesn't depend on other ACs
- **Valuable**: Delivers user value

## Session File Management

### Session Creation
```markdown
## Story X-Y: [Title]
**Epic:** [Epic name]
**Points:** [N] | **Priority:** [P0/P1/P2]
**Repos:** [api/ui/both]
**Branch:** feat/X-Y-short-description
**Jira:** [PROJ-NNN]
**Started:** [date]
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
- Status checks → `workflow-status-check.md`
- Backlog research → `sm-work-research.md`
- File summaries → `sm-file-summary.md`
- Story setup → `sm-story-setup.md`
- Finish bookkeeping → `sm-finish-bookkeeping.md`

### Helper Pattern
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  description: "[task description]"
  prompt: |
    [Load from subagent file]
    ## Calling Agent: SM
```

## Scale-Adaptive Workflow

| Points | Scale | Workflow |
|--------|-------|----------|
| 1-2 pts | Trivial | SM → Dev (skip TEA) |
| 3-5 pts | Standard | SM → TEA → Dev |
| 8+ pts | Complex | SM → TEA → Dev |

## Context Budget

Target: 500-700 lines loaded
- Agent file: ~330 lines
- Sprint status: ~150 lines
- Session file: ~50 lines
- Story context: ~100 lines

---

*Add patterns discovered during story coordination below*
