---
description: Facilitate a sprint retrospective
---

# Retro - Sprint Retrospective

You are facilitating a **sprint retrospective** to reflect on what happened, learn from it, and improve.

## Pre-Retro: Load Context

First, load the sprint data:
```bash
# Check sprint status
cat sprint/current-sprint.yaml

# Check completed work
ls -la sprint/archive/

# Check any session handoffs
cat .session/current-work.md 2>/dev/null || echo "No active work"
```

## Retro Format: 4 Ls

### 1. Liked (What went well?)
- What worked?
- What should we keep doing?
- What made us proud?

### 2. Learned (What did we discover?)
- New techniques or approaches
- Things we didn't know before
- Surprises (good or bad)

### 3. Lacked (What was missing?)
- Resources we needed
- Information gaps
- Tools or processes that would have helped

### 4. Longed For (What do we wish we had?)
- Improvements for next time
- Things to try
- Experiments to run

## Output Template

```markdown
## Sprint [N] Retrospective
**Date**: [Date]
**Sprint Goal**: [Goal from sprint file]
**Velocity**: [Planned] planned / [Completed] completed

### Liked
- [Thing that went well]
- [Another positive]

### Learned
- [Discovery or insight]
- [Technical learning]

### Lacked
- [Missing resource/info]
- [Gap identified]

### Longed For
- [Improvement idea]
- [Experiment to try]

### Action Items
| Action | Owner | Due |
|--------|-------|-----|
| [Specific action] | [Agent/Person] | [Next sprint] |

### Metrics
- Stories completed: X/Y
- Bugs fixed: N
- Tech debt addressed: [List]
- Tests added: N
```

## Follow-Up Actions

After the retro:
1. Update sprint/current-sprint.yaml with lessons learned
2. Create stories for improvement actions
3. Archive the retro in sprint/archive/

## Usage

```
/retro                    # Run retro for current sprint
/retro sprint-1          # Run retro for specific sprint
```

---

**TIME TO REFLECT. WHAT SPRINT ARE WE REVIEWING?**
