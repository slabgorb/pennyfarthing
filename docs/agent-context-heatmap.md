# Agent Context Loading Heat Map

Analysis of the ACTUAL context loaded into an agent session, traced through `agent-session.sh start` and `prime.sh`.

## Context Loading Order

When `/sm` is invoked, these sources are loaded IN ORDER:

| Order | Source | Lines | Cumulative |
|-------|--------|-------|------------|
| 1 | Agent definition header | ~5 | 5 |
| 2 | Persona block (from theme) | ~5 | 10 |
| 3 | Agent definition body | ~210 | 220 |
| 4 | Agent Behavior Guide | ~290 | 510 |
| 5 | Sidecar files (if present) | ~50 | 560 |

**Total context before first user message: ~560-620 lines (~18,000 chars)**

*Updated after SM trim (2026-01-24): SM reduced from 713→214 lines, prime output from 36,052→18,249 chars (49% reduction)*

## Heat Map Legend

```
🔴 LOW (0-30%)    - Likely to be skipped or forgotten
🟡 MEDIUM (30-70%) - Inconsistently followed
🟢 HIGH (70-90%)   - Usually followed
🔵 VERY HIGH (90%+) - Almost always followed
```

---

## Phase 1: Agent Definition (Lines 1-220) 🔵 VERY HIGH → 🟢 HIGH

### Header + Persona (Lines 1-10)
```
# SM Agent - Scrum Master

<persona>
Auto-loaded by agent-session.sh...
</persona>

<role>
Story coordination, session management...
</role>
```

**Compliance: 🔵 VERY HIGH** - First thing in context, character voice consistently adopted.

### Critical Blocks (Lines 13-30)
After the SM trim, critical instructions are now in the **HIGH ATTENTION** zone:

```markdown
<critical>
**WORKFLOW STATUS CHECK IS MANDATORY - FIRST ACTION ON EVERY ACTIVATION**
</critical>

<critical>
**SM NEVER writes implementation code.**
</critical>

<critical>
**HANDOFF REQUIRES MARKER OUTPUT.**
</critical>
```

**Compliance: 🔵 VERY HIGH** - Critical blocks now appear at lines 13-30 instead of lines 71-105. This is the optimal attention zone.

### Helpers + On-Activation (Lines 32-79)

The `<on-activation>` block now appears at line 56 instead of line 172:

```markdown
<on-activation>
## MANDATORY FIRST ACTION

**Spawn workflow-status-check FIRST. Always.**
```

**Compliance: 🟢 HIGH** - Moved from the "low attention" zone (line 172) to "high attention" zone (line 56).

### Flows + Gates (Lines 80-200)

Finish Flow, New Work Flow, and Pre-Handoff Checklist. Streamlined from 400+ lines to ~120 lines.

**Compliance: 🟢 HIGH** - Flows are now concise decision trees, not verbose procedures.

### Exit Sequence (Lines 201-214)

```markdown
<exit>
## Exit Sequence
...
Nothing after the marker. EXIT.
</exit>
```

**Compliance: 🔵 VERY HIGH** - Terminal actions at file end, always followed.

---

## Phase 2: Agent Behavior Guide (Lines 220-510) 🟢 HIGH → 🟡 MEDIUM

### Critical Protocols (Lines 220-260)

6 `<critical>` blocks covering:
- Reflector markers
- Absolute paths
- Session file extraction
- Handoff action
- Test delegation
- Sidecar memory

**Compliance: 🟢 HIGH** - Critical tags get attention, but this is now mid-context.

### Reference + Project Context (Lines 260-340)

Generic information about workflow, skills, project structure.

**Compliance: 🟡 MEDIUM** - Reference material, scanned on demand.

### Reflector + Exit Protocol (Lines 340-510)

Detailed instructions for Cyclist UI markers and exit sequences.

**Compliance: 🟡 MEDIUM** - Important but late in context. Agents often need reminders.

---

## Phase 3: Sidecar Files (Lines 510-560) 🟡 MEDIUM

### decisions.md (~20 lines)
Key decisions like scale-adaptive routing.

### gotchas.md (~20 lines)
Top gotchas only (trimmed from 142 lines).

### patterns.md (~10 lines)
Essential patterns in table format.

**Compliance: 🟡 MEDIUM** - Late in context, but short and scannable.

---

## Attention Curve Visualization (After Trim)

```
Line    Attention   Content
0       ████████████ # SM Agent header
10      ███████████  <persona> + <role>
20      ██████████   <critical> blocks (3x) ← OPTIMAL ZONE
40      █████████    <helpers>
60      ████████     <on-activation> ← MOVED HERE
100     ███████      Finish/New Work flows
150     ██████       Gates + Routing
200     █████        <exit>
300     ████         Agent Behavior Guide (critical)
400     ███          Agent Behavior Guide (info)
500     ██           Sidecar files
600     █            EOF
```

**Key improvement:** Critical instructions now peak at line 20, not line 172.

---

## Before vs After Comparison

| Metric | Before (2026-01-23) | After (2026-01-24) | Change |
|--------|---------------------|---------------------|--------|
| SM file lines | 713 | 214 | -70% |
| Prime output chars | 36,052 | 18,249 | -49% |
| Prime output lines | 1,122 | 624 | -44% |
| First `<critical>` | Line 71 | Line 13 | +58 lines earlier |
| `<on-activation>` | Line 172 | Line 56 | +116 lines earlier |
| Workflow flows | 400+ lines | ~120 lines | -70% |

---

## Root Cause Analysis (Historical)

### Why SM Bypassed Workflow (Before Trim)

1. **Agent file loaded with critical sections late** - Line 172 for on-activation
2. **gotchas.md was 142 lines** - Too long to retain
3. **Procedural content dominated** - Decision logic buried in procedures

### What the Model Reliably Retains

1. **Character persona** (lines 1-10) - Always adopted
2. **First critical blocks** (lines 10-50) - High compliance
3. **Table formats** - Scannable, referenced on demand
4. **Exit sequences** - Terminal actions at file end

### What Gets Lost

1. **Long procedural flows** - Attention degrades after 100 lines
2. **Reference sections deep in file** - Rarely reached
3. **Duplicate content** - Redundancy doesn't help, wastes tokens

---

## Recommendations (Updated)

### Structural Patterns That Work ✓

| Pattern | Example | Why It Works |
|---------|---------|--------------|
| Critical blocks early | Lines 13-30 | Peak attention zone |
| Short files | 214 lines vs 713 | Maintains attention throughout |
| Table formats | Workflow routing table | Scannable, high retention |
| Unique XML tags | `<on-activation>`, `<gate>` | Distinct, memorable |
| Terminal `<exit>` | Lines 201-214 | End-of-file actions followed |

### Patterns to Avoid ✗

| Pattern | Problem | Fix |
|---------|---------|-----|
| Procedures in agent file | Buries decisions in steps | Move to subagent files |
| 700+ line files | Attention degradation | Target <300 lines |
| Duplicate content | Wastes tokens, no benefit | Single source of truth |
| Reference sections at EOF | Never reached | Link to skills instead |

---

## Summary

The SM trim demonstrates that **position matters more than emphasis**. Moving critical instructions from line 172 to line 13 has more impact than adding more `<critical>` tags.

**Target metrics for all agents:**
- File size: <300 lines
- Prime output: <25,000 chars
- First `<critical>`: Within first 30 lines
- `<on-activation>`: Within first 100 lines
