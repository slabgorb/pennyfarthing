# Agent Context Loading Heat Map

Analysis of the ACTUAL context loaded into an agent session, traced through `agent-session.sh start` and the Python `prime` module.

*Updated 2026-01-26 with current measurements for SM, Dev, Architect, Reviewer, TEA*

## Context Loading Order

When an agent (e.g., `/pf-sm`) is invoked, these sources are loaded IN ORDER:

| Order | Source | Typical Size | Notes |
|-------|--------|--------------|-------|
| 1 | Agent definition header | ~5 lines | `# Agent - Role` |
| 2 | Persona block (from theme) | ~10 lines | Injected by `agent-session.sh` |
| 3 | Agent definition body | 150-260 lines | Core agent instructions |
| 4 | Agent Behavior Guide | ~290 lines | Shared across all agents |
| 5 | Sidecar files (if present) | ~50 lines | patterns, gotchas, decisions |

## Heat Map Legend

```
🔴 LOW (0-30%)    - Likely to be skipped or forgotten
🟡 MEDIUM (30-70%) - Inconsistently followed
🟢 HIGH (70-90%)   - Usually followed
🔵 VERY HIGH (90%+) - Almost always followed
```

---

## Current Agent Measurements

| Agent | File Lines | Prime Output (chars) | Prime Output (lines) |
|-------|------------|---------------------|---------------------|
| **SM** | 262 | 19,798 | 689 |
| **Dev** | 169 | 21,599 | 747 |
| **Architect** | 188 | 16,401 | 573 |
| **Reviewer** | 186 | 20,866 | 682 |
| **TEA** | 161 | 21,522 | 757 |

**All agents are under the 25,000 char target for prime output.**

---

## Phase 1: Agent Definition (Lines 1-200) 🔵 VERY HIGH → 🟢 HIGH

### Header + Persona (Lines 1-10)

```markdown
# SM Agent - Scrum Master

<persona>
Auto-loaded by agent-session.sh with theme character...
</persona>

<role>
Story coordination, session management...
</role>
```

**Compliance: 🔵 VERY HIGH** - First thing in context, character voice consistently adopted.

### Discipline Block (Lines 6-18)

All agents now have a unique discipline tag immediately after role:

| Agent | Tag | Purpose |
|-------|-----|---------|
| SM | `<coordination-discipline>` | Prevent coding, delegate to subagents |
| Dev | `<minimalist-discipline>` | No over-engineering, minimal changes |
| Architect | `<pragmatic-restraint>` | Prevent scope creep, practical solutions |
| Reviewer | `<adversarial-mindset>` | Aggressive code review, find problems |
| TEA | `<test-paranoia>` | Find bugs, don't prove it works |

**Compliance: 🔵 VERY HIGH** - Unique tags at lines 6-18 are in peak attention zone. These set agent personality.

### Critical Blocks (Lines 20-36)

All agents now have `<critical>` blocks between lines 20-36:

```markdown
<critical>
**HANDOFF REQUIRES MARKER OUTPUT.** After handoff subagent returns:
Run `pf handoff marker {next_agent}` as ABSOLUTE LAST ACTION, output result, EXIT.
</critical>
```

**Compliance: 🔵 VERY HIGH** - Critical blocks at lines 20-36 are in optimal attention zone.

### Helpers + Parameters (Lines 38-100)

Subagent definitions, parameter templates, context references.

**Compliance: 🟢 HIGH** - Table format is scannable. Referenced on demand.

### On-Activation (Lines 67-102)

| Agent | On-Activation Line |
|-------|-------------------|
| TEA | Line 67 |
| Dev | Line 68 |
| Reviewer | Line 87 |
| Architect | Line 92 |
| SM | Line 102 |

**Compliance: 🟢 HIGH** - All agents have on-activation within first 102 lines. Good retention.

### Workflow + Gates (Lines 83-150)

Primary workflow, handoff gates, assessment templates.

**Compliance: 🟢 HIGH** - Concise decision trees and checklists are followed.

### Exit Sequence (Final 10-15 lines)

```markdown
<exit>
Nothing after the marker. EXIT.
</exit>
```

**Compliance: 🔵 VERY HIGH** - Terminal actions at file end are always followed.

---

## Phase 2: Agent Behavior Guide (Lines 200-500) 🟢 HIGH → 🟡 MEDIUM

The shared Agent Behavior Guide (~290 lines) is loaded after the agent definition.

### Critical Protocols (Lines 200-240)

6 `<critical>` blocks covering:
- Reflector markers (Cyclist UI)
- Absolute paths requirement
- Session file extraction
- Handoff action sequence
- Test delegation
- Sidecar memory

**Compliance: 🟢 HIGH** - Critical tags get attention even in mid-context.

### Reference + Project Context (Lines 240-340)

Generic information about workflow, skills, project structure.

**Compliance: 🟡 MEDIUM** - Reference material, scanned on demand rather than memorized.

### Reflector + Exit Protocol (Lines 340-500)

Detailed instructions for Cyclist UI markers and exit sequences.

**Compliance: 🟡 MEDIUM** - Important but late in context. Agents often need reminders via hook feedback.

---

## Phase 3: Sidecar Files (Lines 500-560) 🟡 MEDIUM

### decisions.md (~20 lines)
Key architectural decisions like scale-adaptive routing.

### gotchas.md (~20 lines)
Top gotchas only (trimmed from historical 142 lines).

### patterns.md (~10 lines)
Essential patterns in table format.

**Compliance: 🟡 MEDIUM** - Late in context, but short and scannable. Helps with edge cases.

---

## Attention Curve Visualization

```
Line    Attention   Content
0       ████████████ # Agent header
10      ███████████  <persona> + <role>
20      ██████████   <discipline> block ← PEAK ZONE
40      █████████    <critical> blocks (3x)
60      ████████     <helpers> + <parameters>
80      ███████      <on-activation>
100     ██████       <workflow>
150     █████        <handoff-gate>, <exit>
200     ████         Agent Behavior Guide start
300     ███          Behavior Guide (protocols)
400     ██           Behavior Guide (reference)
500     █            Sidecar files
600     ▌            EOF
```

**Key insight:** Agent-specific discipline tags at lines 6-18 and critical blocks at lines 20-36 are in the peak attention zone.

---

## What Gets Retained vs Lost

### Model Reliably Retains

1. **Character persona** (lines 1-10) - Always adopted
2. **Discipline block** (lines 6-18) - Sets agent personality
3. **First critical blocks** (lines 20-40) - High compliance
4. **Table formats** - Scannable, referenced on demand
5. **Exit sequences** - Terminal actions at file end
6. **Unique XML tags** - Memorable, distinct

### What Gets Lost

1. **Long procedural flows** - Attention degrades after 150 lines
2. **Reference sections deep in file** - Rarely reached without prompting
3. **Generic `<info>` blocks** - Lower priority than `<critical>`
4. **Duplicate content** - Wastes tokens without improving retention

---

## Agent-Specific Observations

### SM (262 lines, 19,798 chars)
- Longest agent file but still well-structured
- `<coordination-discipline>` prevents coding attempts
- Three `<critical>` blocks at lines 20-36
- On-activation at line 102 - furthest out but still effective

### Dev (169 lines, 21,599 chars)
- Second shortest agent file
- `<minimalist-discipline>` prevents over-engineering
- On-activation at line 68 - excellent position
- Higher prime output due to behavior guide

### Architect (188 lines, 16,401 chars)
- Lowest prime output - most efficient
- `<pragmatic-restraint>` prevents scope creep
- Critical at line 52 - slightly later but still good
- On-activation at line 92

### Reviewer (186 lines, 20,866 chars)
- `<adversarial-mindset>` is highly effective
- Aggressive tone maintained throughout sessions
- `<review-checklist>` at line 97 ensures thoroughness
- On-activation at line 87

### TEA (161 lines, 21,522 chars)
- Shortest agent file
- `<test-paranoia>` sets paranoid testing stance
- On-activation at line 67 - earliest position
- Chore bypass criteria well-followed

---

## Recommendations

### Target Metrics for All Agents

| Metric | Target | Current Status |
|--------|--------|----------------|
| File size | <200 lines | 4/5 agents meet target (SM at 262) |
| Prime output | <25,000 chars | All agents under target |
| First `<critical>` | Within line 40 | All meet target |
| `<on-activation>` | Within line 100 | 4/5 meet (SM at 102) |
| Discipline tag | Lines 6-18 | All agents have one |

### Structural Patterns That Work

| Pattern | Effect |
|---------|--------|
| Unique discipline tag at lines 6-18 | Sets agent personality in peak zone |
| Critical blocks at lines 20-40 | Maximum retention of key rules |
| Short files (<200 lines) | Attention maintained throughout |
| Table format for helpers/params | Easy to scan and reference |
| Terminal `<exit>` block | Always followed |

### Patterns to Avoid

| Pattern | Problem | Fix |
|---------|---------|-----|
| Files over 300 lines | Attention degradation | Move procedures to subagents |
| Critical instructions after line 100 | Lower compliance | Restructure earlier |
| Generic tags late in file | Ignored | Use unique tags or link to skills |
| Long narrative sections | Skipped | Use tables and decision trees |
