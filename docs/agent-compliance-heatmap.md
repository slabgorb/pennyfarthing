# Agent File Compliance Heat Map

Analysis of how likely each section of agent definition files is to be followed by the model, based on known behavioral patterns and the SM bypass incident.

## Compliance Factors

Sections are more likely to be followed when they have:

| Factor | Impact | Description |
|--------|--------|-------------|
| **Position** | HIGH | Earlier in file = higher attention weight |
| **Tag Type** | HIGH | `<critical>` > `<gate>` > `<info>` > plain markdown |
| **Specificity** | HIGH | Explicit "DO NOT" lists > general principles |
| **Actionability** | MEDIUM | Concrete tool calls > abstract instructions |
| **Repetition** | MEDIUM | Said multiple times = more likely followed |
| **Recency** | MEDIUM | Closer to current context = more weight |
| **Length** | LOW-NEG | Very long sections lose attention |

## Heat Map Legend

```
🔴 LOW (0-30%)    - Likely to be skipped or forgotten
🟡 MEDIUM (30-70%) - Inconsistently followed
🟢 HIGH (70-90%)   - Usually followed
🔵 VERY HIGH (90%+) - Almost always followed
```

---

## SM Agent (sm.md) - 713 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-8 | Header + Persona | plain | 🟢 HIGH | First thing read, sets character |
| 9-11 | Role | `<role>` | 🟢 HIGH | Short, clear, early |
| 13-44 | Helpers | `<helpers>` | 🟡 MEDIUM | Long, template-heavy, easy to skim |
| 46-52 | Responsibilities | `<responsibilities>` | 🟡 MEDIUM | List format helps, but mid-file |
| 54-69 | Phase-check | `<phase-check>` | 🟡 MEDIUM | Conditional logic, may skip |
| **71-92** | **NEVER writes code** | **`<critical>`** | **🟡 MEDIUM** | **Was ignored 3x - too far down** |
| **94-100** | **Status check mandatory** | **`<critical>`** | **🟡 MEDIUM** | **New addition, needs testing** |
| 102-105 | Handoff marker | `<critical>` | 🟢 HIGH | Short, specific action |
| 107-119 | Pre-handoff gate | `<gate>` | 🟡 MEDIUM | Checklist helps, but lengthy |
| 121-136 | Workflow routing | `<info>` | 🟢 HIGH | Table format, scannable |
| 138-142 | Skills | `<skills>` | 🟢 HIGH | Short reference list |
| 144-148 | Context | `<context>` | 🟡 MEDIUM | Often skimmed |
| 150-170 | Reasoning mode | `<reasoning-mode>` | 🔴 LOW | Long, rarely triggered |
| **172-205** | **On-activation** | **`<on-activation>`** | **🔴 LOW** | **LINE 172! Too late. Core behavior buried.** |
| 207-238 | Step 1: Status check | plain | 🔴 LOW | Duplicate of on-activation, ignored |
| 240-325 | Finish flow | plain | 🟡 MEDIUM | Only triggered in that state |
| 327-346 | Empty backlog flow | plain | 🟡 MEDIUM | Rare case |
| 348-429 | New work flow | plain | 🟡 MEDIUM | Main flow, but very long |
| **410-429** | **WHEN USER SELECTS** | **`<critical>`** | **🟡 MEDIUM** | **New addition after diagnosis** |
| 431-457 | File summary helper | plain | 🔴 LOW | Deep in file, skipped |
| 459-512 | Story context creation | plain | 🔴 LOW | Very deep, detail-heavy |
| 514-585 | Setup + handoff | plain | 🔴 LOW | Mechanical details |
| 587-606 | Subagent table | plain | 🟡 MEDIUM | Table format helps |
| 608-680 | Quick references | plain | 🟡 MEDIUM | Reference material, scanned on need |
| 682-710 | Exit sequence | `<info>` + `<exit>` | 🟢 HIGH | End-of-file, terminal action |

### SM Critical Issues

1. **`<on-activation>` is at LINE 172** - This is the "what to do first" section, but it's 172 lines deep. By the time the model reaches it, attention has degraded.

2. **"SM NEVER writes code" was at line 71** - This seems early, but the model had already processed persona, helpers, responsibilities, and phase-check. The prohibition came AFTER the model had context about what SM CAN do.

3. **Workflow flows are 200+ lines** - The actual step-by-step instructions are so long that the model skims them.

---

## TEA Agent (tea.md) - 231 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-7 | Header + Persona | plain | 🟢 HIGH | First, sets character |
| 9-34 | Helpers | `<helpers>` | 🟢 HIGH | Shorter than SM's |
| 36-49 | Phase-check | `<phase-check>` | 🟢 HIGH | Clear gate |
| 51-57 | Responsibilities | `<responsibilities>` | 🟢 HIGH | Short, focused |
| 59-70 | Skills/Context | `<skills>`/`<context>` | 🟢 HIGH | Brief |
| 72-90 | Reasoning mode | `<reasoning-mode>` | 🟡 MEDIUM | Optional behavior |
| 92-98 | On-activation | `<on-activation>` | 🟢 HIGH | **LINE 92!** Much earlier than SM |
| 100-108 | What I do vs Helper | table | 🟢 HIGH | Clear division |
| 109-140 | Primary workflow | plain | 🟢 HIGH | Core, well-structured |
| 141-149 | Chore bypass | plain | 🟢 HIGH | Exception case, clear |
| 151-159 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist, mandatory tag |
| 161-179 | Assessment template | plain | 🟢 HIGH | Template to fill |
| 181-213 | Handoff subagent | plain | 🟢 HIGH | Copy-paste example |
| 215-228 | Exit sequence | `<exit>` | 🔵 VERY HIGH | Terminal, unmissable |

### TEA Observations

TEA is **half the length** of SM (231 vs 713 lines). Key behaviors appear earlier:
- On-activation at line 92 (vs 172 in SM)
- Core workflow starts at line 109 (vs 348 in SM)
- Total file is 231 lines (vs 713 in SM)

**TEA follows its instructions more reliably because there's less to forget.**

---

## Dev Agent (dev.md) - 260 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-8 | Header + Persona | plain | 🟢 HIGH | First |
| 10-12 | Role | `<role>` | 🟢 HIGH | Short |
| 14-39 | Helpers | `<helpers>` | 🟢 HIGH | Template-heavy but clear |
| 41-54 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate behavior |
| 56-62 | Responsibilities | `<responsibilities>` | 🟢 HIGH | Short list |
| 64-74 | Skills/Context | `<skills>`/`<context>` | 🟢 HIGH | Brief |
| 76-94 | Reasoning mode | `<reasoning-mode>` | 🟡 MEDIUM | Optional |
| 96-102 | On-activation | `<on-activation>` | 🟢 HIGH | **LINE 96** - early |
| 104-151 | Primary workflow | plain | 🟢 HIGH | Core flow, clear steps |
| 153-161 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Mandatory checklist |
| 163-180 | Assessment template | plain | 🟢 HIGH | Fill-in template |
| 182-192 | Self-review | `<self-review>` | 🟢 HIGH | Checklist format |
| 194-257 | Exit + commit format | `<exit>` | 🔵 VERY HIGH | Terminal |

### Dev Observations

Similar structure to TEA. On-activation at line 96. Short file (260 lines).
**Dev follows instructions well for the same reason as TEA - manageable length.**

---

## Reviewer Agent (reviewer.md) - 378 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-7 | Header + Persona | plain | 🟢 HIGH | First |
| **9-25** | **Adversarial mindset** | **`<adversarial-mindset>`** | **🔵 VERY HIGH** | **Unique tag, strong language** |
| 28-73 | Helpers | `<helpers>` | 🟢 HIGH | Detailed but important |
| 75-88 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate |
| 90-102 | Responsibilities/Skills | plain | 🟢 HIGH | Short |
| 104-136 | On-activation | `<on-activation>` | 🟢 HIGH | Line 129, reasonable |
| 138-145 | What I do vs Helper | table | 🟢 HIGH | Clear |
| 147-186 | Primary workflow | plain | 🟢 HIGH | Phased approach |
| **188-219** | **Review checklist** | **`<review-checklist>`** | **🟢 HIGH** | **Unique tag, mandatory steps** |
| 221-280 | Assessment templates | plain | 🟢 HIGH | Structured |
| 282-322 | Exit + handoff | `<exit>` | 🔵 VERY HIGH | Terminal |
| **343-374** | **Anti-patterns** | **plain** | **🟡 MEDIUM** | **Good examples but late in file** |

### Reviewer Observations

Reviewer has unique structural elements:
1. `<adversarial-mindset>` tag is EARLY and STRONG
2. `<review-checklist>` with mandatory steps
3. Anti-patterns section shows what NOT to do

**Reviewer tends to follow its aggressive stance because of strong early priming.**

---

## Summary: Position vs Compliance

```
Line 0-50:   🔵 VERY HIGH - Almost always followed
Line 50-100: 🟢 HIGH - Usually followed
Line 100-200: 🟡 MEDIUM - Inconsistent
Line 200-400: 🔴 LOW - Often skipped
Line 400+:   🔴 LOW - Rarely reaches
```

## Recommendations

### Immediate Fixes for SM

1. **Move `<on-activation>` to line 15** - Right after persona/role
2. **Move "NEVER writes code" to line 20** - Before any procedural content
3. **Shorten the file** - SM is 713 lines; TEA is 231. Cut SM to <300 lines
4. **Extract flows to separate files** - Link to `sm-finish-flow.md`, `sm-new-work-flow.md`

### Structural Patterns That Work

1. **Unique tags** - `<adversarial-mindset>`, `<review-checklist>` get attention
2. **Tables** - Easy to scan, high retention
3. **Short files** - <300 lines maintain attention throughout
4. **Early prohibitions** - "DO NOT" in first 50 lines
5. **Checklists** - `- [ ]` format enforces completion

### Structural Patterns That Fail

1. **Long procedural flows** - Attention degrades after 100 lines
2. **Duplicate content** - Status check appears twice in SM, both ignored
3. **Reference sections** - "Quick Reference" at line 600+ never read
4. **Generic tags** - `<info>` gets less attention than `<critical>`
