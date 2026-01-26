# Agent File Compliance Heat Map

Analysis of how likely each section of agent definition files is to be followed by the model, based on position, tag type, and behavioral patterns.

*Updated 2026-01-26 with current agent measurements*

## Compliance Factors

Sections are more likely to be followed when they have:

| Factor | Impact | Description |
|--------|--------|-------------|
| **Position** | HIGH | Earlier in file = higher attention weight |
| **Tag Type** | HIGH | `<critical>` > unique tags > `<info>` > plain markdown |
| **Specificity** | HIGH | Explicit "DO NOT" lists > general principles |
| **Actionability** | MEDIUM | Concrete tool calls > abstract instructions |
| **Length** | LOW-NEG | Very long sections lose attention |

## Heat Map Legend

```
🔴 LOW (0-30%)    - Likely to be skipped or forgotten
🟡 MEDIUM (30-70%) - Inconsistently followed
🟢 HIGH (70-90%)   - Usually followed
🔵 VERY HIGH (90%+) - Almost always followed
```

---

## SM Agent (sm.md) - 262 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-4 | Header + Role | `<role>` | 🔵 VERY HIGH | First thing read |
| **6-18** | **Coordination Discipline** | **`<coordination-discipline>`** | **🔵 VERY HIGH** | **Unique tag, early, sets mindset** |
| **20-24** | **Status check mandatory** | **`<critical>`** | **🔵 VERY HIGH** | **Line 20, optimal zone** |
| **26-31** | **NEVER writes code** | **`<critical>`** | **🔵 VERY HIGH** | **Clear prohibition** |
| **33-36** | **Handoff marker** | **`<critical>`** | **🔵 VERY HIGH** | **Specific action** |
| 38-48 | Helpers | `<helpers>` | 🟢 HIGH | Compact table |
| 50-94 | Parameters | `<parameters>` | 🟢 HIGH | Reference, scannable |
| 96-100 | Context | `<context>` | 🟢 HIGH | Brief |
| **102-125** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Line 102, good position** |
| 127-149 | Finish Flow | `<finish-flow>` | 🟢 HIGH | Concise decision tree |
| 151-216 | New Work + Routing | plain | 🟢 HIGH | Streamlined |
| 249-262 | Exit sequence | `<exit>` | 🔵 VERY HIGH | Terminal, unmissable |

---

## Dev Agent (dev.md) - 169 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-4 | Header + Role | `<role>` | 🔵 VERY HIGH | First |
| **6-18** | **Minimalist Discipline** | **`<minimalist-discipline>`** | **🔵 VERY HIGH** | **Unique tag, sets coding style** |
| **20-23** | **Handoff marker** | **`<critical>`** | **🔵 VERY HIGH** | **Line 20, optimal** |
| 25-32 | Helpers | `<helpers>` | 🟢 HIGH | Short table |
| 34-55 | Parameters | `<parameters>` | 🟢 HIGH | Reference |
| 57-66 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate behavior |
| **68-71** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Line 68, excellent** |
| 73-82 | Delegation | `<delegation>` | 🟢 HIGH | Clear table |
| 84-107 | Primary workflow | `<workflow>` | 🟢 HIGH | Core flow |
| 109-115 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist |
| 117-137 | Assessment template | `<assessment-template>` | 🟢 HIGH | Fill-in |
| 139-157 | Exit sequence | `<exit-sequence>` | 🔵 VERY HIGH | Terminal |
| 159-169 | Skills + Exit | `<skills>`, `<exit>` | 🔵 VERY HIGH | End of file |

**Dev is the shortest main agent at 169 lines - excellent attention throughout.**

---

## Architect Agent (architect.md) - 188 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-4 | Header + Role | `<role>` | 🔵 VERY HIGH | First |
| **6-18** | **Pragmatic Restraint** | **`<pragmatic-restraint>`** | **🔵 VERY HIGH** | **Unique tag, prevents over-engineering** |
| 20-28 | Helpers | `<helpers>` | 🟢 HIGH | Short |
| 30-49 | Parameters | `<parameters>` | 🟢 HIGH | Reference |
| **52-57** | **Critical** | **`<critical>`** | **🔵 VERY HIGH** | **Line 52, still in attention zone** |
| 59-62 | Skills | `<skills>` | 🟢 HIGH | Brief reference |
| 64-68 | Context | `<context>` | 🟢 HIGH | Short |
| 70-90 | Reasoning mode | `<reasoning-mode>` | 🟢 HIGH | Optional but clear |
| **92-98** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Line 92, good** |
| 100-109 | Delegation | `<delegation>` | 🟢 HIGH | Table format |
| 111-144 | Primary workflow | `<workflow>` | 🟢 HIGH | Core flow |
| 146-152 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist |
| 154-176 | Assessment template | `<assessment-template>` | 🟢 HIGH | Template |
| 178-188 | Exit | `<exit-sequence>`, `<exit>` | 🔵 VERY HIGH | Terminal |

---

## Reviewer Agent (reviewer.md) - 186 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-4 | Header + Role | `<role>` | 🔵 VERY HIGH | First |
| **6-18** | **Adversarial Mindset** | **`<adversarial-mindset>`** | **🔵 VERY HIGH** | **Unique tag, strong language, sets aggressive tone** |
| **20-22** | **Preflight spawn** | **`<critical>`** | **🔵 VERY HIGH** | **Line 20, optimal** |
| **24-27** | **Handoff marker** | **`<critical>`** | **🔵 VERY HIGH** | **Line 24** |
| 29-36 | Helpers | `<helpers>` | 🟢 HIGH | Compact |
| 38-68 | Parameters | `<parameters>` | 🟢 HIGH | Reference |
| 70-74 | Context | `<context>` | 🟢 HIGH | Brief |
| 76-85 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate |
| **87-95** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Line 87, good** |
| **97-114** | **Review checklist** | **`<review-checklist>`** | **🟢 HIGH** | **Mandatory steps, unique tag** |
| 116-136 | Workflow | `<workflow>` | 🟢 HIGH | Phased approach |
| 138-144 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist |
| 146-174 | Assessment template | `<assessment-template>` | 🟢 HIGH | Structured |
| 176-186 | Exit | `<exit-sequence>`, `<exit>` | 🔵 VERY HIGH | Terminal |

**Reviewer's `<adversarial-mindset>` at line 6 is highly effective - aggressive tone is maintained throughout.**

---

## TEA Agent (tea.md) - 161 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-4 | Header + Role | `<role>` | 🔵 VERY HIGH | First |
| **6-18** | **Test Paranoia** | **`<test-paranoia>`** | **🔵 VERY HIGH** | **Unique tag, paranoid stance early** |
| **20-23** | **Handoff marker** | **`<critical>`** | **🔵 VERY HIGH** | **Line 20, optimal** |
| 25-32 | Helpers | `<helpers>` | 🟢 HIGH | Short |
| 34-54 | Parameters | `<parameters>` | 🟢 HIGH | Reference |
| 56-65 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate |
| **67-70** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Line 67, excellent** |
| 72-81 | Delegation | `<delegation>` | 🟢 HIGH | Table |
| 83-108 | Primary workflow | `<workflow>` | 🟢 HIGH | Core, chore bypass |
| 110-116 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist |
| 118-137 | Assessment template | `<assessment-template>` | 🟢 HIGH | Template |
| 139-150 | Exit sequence | `<exit-sequence>` | 🔵 VERY HIGH | Terminal |
| 152-161 | Skills + Exit | `<skills>`, `<exit>` | 🔵 VERY HIGH | End of file |

**TEA is second shortest at 161 lines - `<test-paranoia>` sets the right mindset immediately.**

---

## Agent Comparison Table

| Agent | Lines | Prime Chars | First Critical | On-Activation | Discipline Tag | Overall |
|-------|-------|-------------|----------------|---------------|----------------|---------|
| **TEA** | 161 | 21,522 | Line 20 | Line 67 | `<test-paranoia>` | 🔵 VERY HIGH |
| **Dev** | 169 | 21,599 | Line 20 | Line 68 | `<minimalist-discipline>` | 🔵 VERY HIGH |
| **Reviewer** | 186 | 20,866 | Line 20 | Line 87 | `<adversarial-mindset>` | 🔵 VERY HIGH |
| **Architect** | 188 | 16,401 | Line 52 | Line 92 | `<pragmatic-restraint>` | 🟢 HIGH |
| **SM** | 262 | 19,798 | Line 20 | Line 102 | `<coordination-discipline>` | 🟢 HIGH |

**All agents are under 300 lines and under 25,000 chars - attention maintained throughout.**

---

## Key Patterns

### What Works

| Pattern | Example | Why |
|---------|---------|-----|
| Discipline tag at line 6-18 | `<test-paranoia>`, `<adversarial-mindset>` | Sets agent mindset immediately |
| Critical blocks at lines 20-36 | All agents | Peak attention zone |
| On-activation before line 100 | All agents now | Before attention degrades |
| Unique XML tags | `<handoff-gate>`, `<review-checklist>` | Distinct, memorable |
| Short files (<200 lines) | TEA, Dev, Reviewer | Full attention throughout |
| Terminal `<exit>` | All agents | End-of-file always followed |

### What to Avoid

| Pattern | Problem | Fix |
|---------|---------|-----|
| Files over 300 lines | Attention degradation | Move procedures to subagents |
| Critical instructions after line 100 | Lower compliance | Restructure to put critical early |
| Generic tags | Less memorable | Use unique, descriptive tags |
| Long procedural sections | Skipped | Use decision trees and tables |

---

## Target Metrics

| Metric | Target | Current Status |
|--------|--------|----------------|
| File lines | <200 | TEA (161), Dev (169), Reviewer (186), Architect (188) |
| Prime output | <25,000 chars | All agents under target |
| First `<critical>` | Within line 30 | All at line 20-24 (except Architect at 52) |
| `<on-activation>` | Within line 100 | All within range |
| Discipline tag | Lines 6-18 | All agents have unique discipline tag |
