---
name: sprint-context
description: Sprint status, backlog, and story management for Pennyfarthing. Use when checking current sprint status, finding available stories, reviewing backlog, or understanding story context and history.
allowed_tools: [Read, Glob, Grep, Bash, Task]
---

# Sprint Context Skill - Pennyfarthing Project

## When to Use This Skill

- Checking current sprint status
- Finding available stories in backlog
- Understanding story context and history
- Reviewing completed work
- Sprint planning and retrospectives

## Sprint File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Active sprint with all stories |
| `sprint/backlog.yaml` | Future epics and stories |
| `sprint/completed.yaml` | Archived completed work |
| `sprint/context/epic-*-summary.md` | Epic-level context summaries |
| `sprint/context/story-*-summary.md` | Story-level context summaries |
| `sprint/archive/*.md` | Archived session files |

## Quick Reference

### Check Sprint Status
```bash
cat sprint/current-sprint.yaml
```

### Find Available Stories
```bash
# Stories ready for work
grep -B2 -A5 "status: backlog\|status: ready" sprint/current-sprint.yaml
```

### Check Story Context
```bash
# Epic context
cat sprint/context/epic-{N}-summary.md

# Story context
cat sprint/context/story-{X-Y}-summary.md
```

### Find Related Work
```bash
# Search archive for related stories
grep -r "keyword" sprint/archive/
grep -r "keyword" sprint/context/
```

## Sprint YAML Structure

```yaml
sprint:
  number: 38
  goal: "Sprint goal description"
  start_date: 2025-01-06
  end_date: 2025-01-17

epics:
  - id: epic-32
    title: "Epic Title"
    stories:
      - id: "32-1"
        description: "Story title"
        points: 3
        priority: P1
        status: done | in-progress | backlog | ready
        repos: api | ui | both
        jira: MSSCI-12345
```

## Story Status Values

| Status | Meaning |
|--------|---------|
| `backlog` | Not started, available for work |
| `ready` | Groomed, ready to start |
| `in-progress` | Currently being worked |
| `review` | PR created, awaiting review |
| `approved` | Review passed, ready to finish |
| `done` | Completed and archived |

## Context File Patterns

### Epic Summary (`sprint/context/epic-{N}-summary.md`)
- What the epic accomplishes
- Key technical decisions across stories
- Patterns established
- Remaining work

### Story Summary (`sprint/context/story-{X-Y}-summary.md`)
- What was built
- Key technical decisions
- Implementation patterns
- Files modified
- Lessons learned

## Common Tasks

### Starting New Work
1. Check `sprint/current-sprint.yaml` for available stories
2. Look for `status: backlog` or `status: ready`
3. Check for epic context in `sprint/context/`
4. Review related archived work if needed

### Finishing Work
1. Update story status in `sprint/current-sprint.yaml`
2. Create story summary in `sprint/context/`
3. Archive session file to `sprint/archive/`

### Sprint Planning
1. Review `sprint/backlog.yaml` for upcoming work
2. Check `sprint/completed.yaml` for velocity reference
3. Review epic summaries for context
