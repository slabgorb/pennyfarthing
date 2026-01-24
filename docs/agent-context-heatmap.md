# Agent Context Loading Heat Map

Analysis of the ACTUAL context loaded into an agent session, traced through `agent-session.sh start` and `prime.sh`.

## Context Loading Order

When `/sm` is invoked, these sources are loaded IN ORDER:

| Order | Source | Lines | Cumulative |
|-------|--------|-------|------------|
| 1 | CLAUDE.md (system prompt) | ~150 | 150 |
| 2 | Persona block (from theme) | ~20 | 170 |
| 3 | Crew manifest (from theme) | ~15 | 185 |
| 4 | Sprint Context (2 lines) | ~2 | 187 |
| 5 | Active Session (if exists) | ~50 | 237 |
| 6 | **Sidecar: decisions.md** | 29 | 266 |
| 7 | **Sidecar: gotchas.md** | 142 | 408 |
| 8 | **Sidecar: patterns.md** | 41 | 449 |
| 9 | **agent-behavior.md** | 286 | 735 |
| 10 | **sm.md** (agent definition) | 713 | **1,448** |

**Total context before first user message: ~1,450 lines**

## Heat Map Legend

```
🔴 LOW (0-30%)    - Likely to be skipped or forgotten
🟡 MEDIUM (30-70%) - Inconsistently followed
🟢 HIGH (70-90%)   - Usually followed
🔵 VERY HIGH (90%+) - Almost always followed
```

---

## Phase 1: Early Context (Lines 1-185) 🔵 VERY HIGH

### CLAUDE.md (Line 1-150)
System-level instructions. Always followed because:
- First thing in context
- System prompt has highest weight
- Contains tool definitions

### Persona + Crew (Lines 150-185)
Theme-specific character loading:
```
<persona agent="sm" theme="lovecraft-mythos">
Character: The Mi-Go
Style: Fungi from Yuggoth...
</persona>

<crew theme="lovecraft-mythos">
When handing off, address them by character name:
  tea: Herbert West
  dev: Yog-Sothoth
  ...
</crew>
```

**Compliance: 🔵 VERY HIGH** - Character voice is consistently adopted.

---

## Phase 2: Sprint + Session Context (Lines 185-237) 🟢 HIGH

### Sprint Context (2 lines)
```
Sprint 12: Complete WheelHub notification...
Progress: 130/154 points
```

**Compliance: 🟢 HIGH** - Short, referenced when presenting status.

### Active Session (if exists)
Session header with Phase, Workflow, Repos, Branch. Most recent assessment.

**Compliance: 🟢 HIGH** - Agents read this to understand current state.

---

## Phase 3: Sidecar Files (Lines 237-449) 🟡 MEDIUM

### decisions.md (29 lines)
```markdown
### DEC-SM-001: Scale-Adaptive Routing
**Decision:** Trivial stories (1-2 pts) skip TEA...
```

**Compliance: 🟡 MEDIUM**
- Short enough to read
- But buried between persona and behavior guide
- Easy to forget specific decisions

### gotchas.md (142 lines) 🔴 LOW
```markdown
### Write Without Read
**Problem:** Write tool fails...

### NEVER GUESS JIRA IDs
**Problem:** Created stories with placeholder IDs...
```

**Compliance: 🔴 LOW**
- 142 lines is too long
- Negative patterns ("don't do X") are less memorable than positive patterns
- Same gotchas keep being repeated suggests they're not being read

### patterns.md (41 lines) 🟡 MEDIUM
```markdown
## Scale-Adaptive Workflow
| Points | Scale | Workflow |
|--------|-------|----------|
| 1-2 pts | Trivial | SM → Dev (skip TEA) |
```

**Compliance: 🟡 MEDIUM**
- Table format helps
- But appears after 400 lines of prior context

---

## Phase 4: agent-behavior.md (Lines 449-735) 🟡 MEDIUM

This is the shared behavior guide for ALL agents. Key sections:

| Lines | Section | Tag | Compliance |
|-------|---------|-----|------------|
| 1-30 | Critical Protocols | `<critical>` x6 | 🟢 HIGH |
| 31-60 | Reference | `<info>` | 🟡 MEDIUM |
| 61-90 | Project Context | `<info>` | 🟡 MEDIUM |
| 91-140 | Sprint YAML Rules | `<critical>` + `<info>` | 🟡 MEDIUM |
| 141-180 | Persona System | `<info>` | 🟢 HIGH |
| 181-220 | Reflector | `<info>` + `<critical>` | 🟢 HIGH |
| 221-260 | Agent Exit Protocol | `<agent-exit-protocol>` | 🟢 HIGH |
| 261-286 | Wrong Phase Detection | `<wrong-phase-detection>` | 🟢 HIGH |

**Key Observation:** The behavior guide has 6 `<critical>` blocks in the first 30 lines. These are well-followed. But by line 450+ in the full context, attention has degraded.

---

## Phase 5: sm.md (Lines 735-1448) 🔴 LOW overall

The agent definition file comes LAST. By this point:
- ~735 lines of context already processed
- Attention weight significantly degraded
- Model is "skimming" not "reading"

### SM Section Heat Map (relative to file start)

| SM Lines | Absolute Lines | Section | Compliance |
|----------|----------------|---------|------------|
| 1-10 | 735-745 | Header + Persona | 🟢 HIGH |
| 11-44 | 746-779 | Helpers | 🟡 MEDIUM |
| 45-70 | 780-805 | Phase-check | 🟡 MEDIUM |
| **71-105** | **806-840** | **Critical blocks (3x)** | **🟡 MEDIUM** |
| 107-170 | 842-905 | Gate + Info + Reasoning | 🔴 LOW |
| **172-205** | **907-940** | **on-activation** | **🔴 LOW** |
| 207-325 | 942-1060 | Finish flow | 🔴 LOW |
| 326-430 | 1061-1165 | New work flow | 🔴 LOW |
| 430-590 | 1165-1325 | Setup + handoff details | 🔴 LOW |
| 590-710 | 1325-1445 | Quick references | 🔴 LOW |

### The Critical Problem

**The `<on-activation>` block that says "ALWAYS run workflow-status-check FIRST" appears at absolute line ~907 of a 1,448 line context.**

By this point, attention has degraded so severely that even `<critical>` tags don't help.

---

## Attention Curve Visualization

```
Line    Attention   Content
0       ████████████ CLAUDE.md (system)
100     ██████████   Persona
200     █████████    Sprint context
300     ████████     Sidecar decisions
400     ███████      Sidecar gotchas
500     ██████       Sidecar patterns
600     █████        agent-behavior (critical)
700     ████         agent-behavior (info)
800     ███          sm.md (critical blocks)
900     ██           sm.md (on-activation) ← PROBLEM
1000    ██           sm.md (flows)
1100    █            sm.md (helpers)
1200    █            sm.md (references)
1300    █            sm.md (exit)
1400    █            EOF
```

---

## Root Cause Analysis

### Why SM Bypasses Workflow

1. **Agent file loads LAST** - After 735 lines of other content
2. **Critical instructions at line 907** - Deep in the "low attention" zone
3. **gotchas.md has relevant warnings** - But at 142 lines, too long to retain
4. **Helpful patterns exist** - But buried in sidecar files

### What the Model Actually Retains

From the full 1,448 line context, the model reliably retains:

1. **Character persona** (lines 150-185) - Always adopted
2. **First critical blocks** (agent-behavior lines 1-30) - Usually followed
3. **Table formats** - Scannable, referenced on demand
4. **Exit sequences** - At file end, terminal actions

### What Gets Lost

1. **Sidecar gotchas** - 142 lines of "don't do X"
2. **on-activation instructions** - At line 907
3. **Detailed flows** - Lines 900-1300
4. **Helper patterns** - Too detailed, too late

---

## Recommendations

### Immediate: Reorder Loading

Change `prime.sh` to load agent file BEFORE sidecar/behavior:

```
Current:  prime.sh → sidecar → behavior → agent.md (LAST)
Proposed: prime.sh → agent.md (FIRST) → sidecar → behavior
```

This puts critical agent instructions in the "high attention" zone.

### Structural: Shorten Files

| File | Current | Target | Action |
|------|---------|--------|--------|
| sm.md | 713 lines | <300 | Extract flows to separate files |
| gotchas.md | 142 lines | <50 | Keep only top 10, link to full list |
| agent-behavior.md | 286 lines | <150 | Move reference sections to skill |

### Content: Front-Load Critical

Move ALL critical instructions to first 50 lines of sm.md:

```markdown
# SM Agent

<critical>
FIRST ACTION: Spawn workflow-status-check subagent. No exceptions.
</critical>

<critical>
SM NEVER writes implementation code.
FORBIDDEN: Reading .py/.ts/.js files, TodoWrite for implementation
</critical>

<critical>
WHEN USER SELECTS STORY: Create session → Write context → Handoff to TEA/Dev
DO NOT: Read implementation files, plan implementation, write code
</critical>

[rest of file...]
```

### Loading: Agent-First Context

Modify agent-session.sh to output agent file content immediately after persona:

```bash
# Current: persona → prime.sh (sidecar, behavior)
# Proposed: persona → agent.md → prime.sh

output_persona "$2"
cat "$PROJECT_ROOT/.pennyfarthing/agents/${2}.md"  # NEW
"$PROJECT_ROOT/.pennyfarthing/scripts/prime.sh" --quiet --agent "$2"
```

---

## Summary

| Issue | Impact | Fix |
|-------|--------|-----|
| Agent file loads at line 735 | Critical instructions ignored | Load agent file first |
| on-activation at line 907 | First action not followed | Move to line 10 |
| gotchas.md is 142 lines | Not retained | Trim to 50 lines |
| 1,448 total context lines | Attention spread too thin | Target <800 total |

The SM bypass pattern isn't a bug in the instructions - it's a bug in the **loading order**. The most critical instructions appear in the zone of lowest attention.
