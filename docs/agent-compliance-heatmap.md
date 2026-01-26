# Agent File Compliance Heat Map

Analysis of how likely each section of agent definition files is to be followed by the model, based on known behavioral patterns and the SM bypass incident.

*Updated 2026-01-24 after SM trim: 713→214 lines, 36,052→18,249 chars (49% reduction)*

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

## SM Agent (sm.md) - 214 lines (was 713)

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-7 | Header + Persona | plain | 🔵 VERY HIGH | First thing read, sets character |
| 9-11 | Role | `<role>` | 🔵 VERY HIGH | Short, clear, early |
| **13-17** | **Status check mandatory** | **`<critical>`** | **🔵 VERY HIGH** | **Now at line 13, optimal zone** |
| **19-25** | **NEVER writes code** | **`<critical>`** | **🔵 VERY HIGH** | **Moved from line 71 to line 19** |
| **27-30** | **Handoff marker** | **`<critical>`** | **🔵 VERY HIGH** | **Short, specific action** |
| 32-54 | Helpers | `<helpers>` | 🟢 HIGH | Compact table format |
| **56-79** | **On-activation** | **`<on-activation>`** | **🟢 HIGH** | **Moved from line 172 to line 56** |
| 81-103 | Finish Flow | plain | 🟢 HIGH | Concise, decision-focused |
| 105-160 | New Work Flow | plain + `<critical>` | 🟢 HIGH | Streamlined from 239 lines |
| 151-160 | Pre-handoff gate | `<gate>` | 🟢 HIGH | Checklist format |
| 162-170 | Empty Backlog Flow | plain | 🟢 HIGH | Short, rare case |
| 172-180 | Workflow Routing | plain | 🟢 HIGH | Table format, scannable |
| 182-193 | Phase-check | `<phase-check>` | 🟢 HIGH | Clear gate logic |
| 195-199 | Skills | `<skills>` | 🟢 HIGH | Short reference list |
| 201-214 | Exit sequence | `<exit>` | 🔵 VERY HIGH | Terminal, unmissable |

### SM Improvements (2026-01-24)

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| First `<critical>` | Line 71 | Line 13 | 🔴→🔵 |
| `<on-activation>` | Line 172 | Line 56 | 🔴→🟢 |
| "NEVER writes code" | Line 71-92 | Line 19-25 | 🟡→🔵 |
| Workflow flows | 400+ lines | ~80 lines | 🔴→🟢 |
| Total file | 713 lines | 214 lines | Attention maintained |

**Key insight:** Moving critical instructions from line 172 to line 13 has more impact than adding emphasis. Position > repetition.

---

## TEA Agent (tea.md) - 231 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-7 | Header + Persona | plain | 🟢 HIGH | First, sets character |
| 9-34 | Helpers | `<helpers>` | 🟢 HIGH | Shorter than old SM |
| 36-49 | Phase-check | `<phase-check>` | 🟢 HIGH | Clear gate |
| 51-57 | Responsibilities | `<responsibilities>` | 🟢 HIGH | Short, focused |
| 59-70 | Skills/Context | `<skills>`/`<context>` | 🟢 HIGH | Brief |
| 72-90 | Reasoning mode | `<reasoning-mode>` | 🟡 MEDIUM | Optional behavior |
| 92-98 | On-activation | `<on-activation>` | 🟢 HIGH | Line 92 - reasonable |
| 100-108 | What I do vs Helper | table | 🟢 HIGH | Clear division |
| 109-140 | Primary workflow | plain | 🟢 HIGH | Core, well-structured |
| 141-149 | Chore bypass | plain | 🟢 HIGH | Exception case, clear |
| 151-159 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Checklist, mandatory tag |
| 161-179 | Assessment template | plain | 🟢 HIGH | Template to fill |
| 181-213 | Handoff subagent | plain | 🟢 HIGH | Copy-paste example |
| 215-228 | Exit sequence | `<exit>` | 🔵 VERY HIGH | Terminal, unmissable |

### TEA Observations

TEA at 231 lines is now comparable to the trimmed SM (214 lines). Both maintain attention throughout.

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
| 96-102 | On-activation | `<on-activation>` | 🟢 HIGH | Line 96 - early |
| 104-151 | Primary workflow | plain | 🟢 HIGH | Core flow, clear steps |
| 153-161 | Handoff gate | `<handoff-gate>` | 🟢 HIGH | Mandatory checklist |
| 163-180 | Assessment template | plain | 🟢 HIGH | Fill-in template |
| 182-192 | Self-review | `<self-review>` | 🟢 HIGH | Checklist format |
| 194-257 | Exit + commit format | `<exit>` | 🔵 VERY HIGH | Terminal |

### Dev Observations

Similar structure to TEA. On-activation at line 96. Short file (260 lines). Dev follows instructions well due to manageable length.

---

## Reviewer Agent (reviewer.md) - 378 lines

| Lines | Section | Tag | Compliance | Why |
|-------|---------|-----|------------|-----|
| 1-7 | Header + Persona | plain | 🟢 HIGH | First |
| **9-25** | **Adversarial mindset** | **`<adversarial-mindset>`** | **🔵 VERY HIGH** | **Unique tag, strong language** |
| 28-73 | Helpers | `<helpers>` | 🟢 HIGH | Detailed but important |
| 75-88 | Phase-check | `<phase-check>` | 🟢 HIGH | Gate |
| 90-102 | Responsibilities/Skills | plain | 🟢 HIGH | Short |
| 104-136 | On-activation | `<on-activation>` | 🟢 HIGH | Line 104, reasonable |
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
Line 100-200: 🟢 HIGH - Good compliance (for short files)
Line 200-300: 🟡 MEDIUM - Inconsistent
Line 300+:   🔴 LOW - Often skipped
```

**Key finding:** Files under 300 lines maintain 🟢 HIGH compliance throughout. The old SM at 713 lines had 🔴 LOW compliance for lines 200+.

---

## Agent Comparison Table

| Agent | Lines | Prime Chars | First Critical | On-Activation | Overall |
|-------|-------|-------------|----------------|---------------|---------|
| **SM (new)** | 214 | 18,249 | Line 13 | Line 56 | 🟢 HIGH |
| TEA | 231 | 23,597 | Line 36 | Line 92 | 🟢 HIGH |
| Dev | 260 | 23,768 | Line 41 | Line 96 | 🟢 HIGH |
| Reviewer | 378 | 27,785 | Line 9 | Line 104 | 🟢 HIGH |
| Orchestrator | 350 | 25,018 | TBD | TBD | 🟡 MEDIUM |
| ~~SM (old)~~ | ~~713~~ | ~~36,052~~ | ~~Line 71~~ | ~~Line 172~~ | ~~🔴 LOW~~ |

---

## Recommendations

### Structural Patterns That Work ✓

1. **Critical blocks in first 30 lines** - Peak attention zone
2. **Unique tags** - `<adversarial-mindset>`, `<on-activation>` get special attention
3. **Tables** - Easy to scan, high retention
4. **Short files (<300 lines)** - Maintains attention throughout
5. **Early prohibitions** - "DO NOT" in first 50 lines
6. **Checklists** - `- [ ]` format enforces completion
7. **Terminal `<exit>`** - End-of-file actions always followed

### Patterns to Avoid ✗

1. **Long procedural flows** - Attention degrades after 100 lines
2. **Files over 300 lines** - Compliance drops sharply
3. **Critical instructions after line 100** - Move them earlier
4. **Duplicate content** - Wastes tokens, doesn't improve compliance
5. **Reference sections at EOF** - Never reached; link to skills instead
6. **Generic `<info>` tags** - Less attention than `<critical>` or unique tags

---

## Target Metrics

| Metric | Target | Reasoning |
|--------|--------|-----------|
| File lines | <300 | Maintains attention throughout |
| Prime output | <25,000 chars | Leaves room for conversation |
| First `<critical>` | Within line 30 | Peak attention zone |
| `<on-activation>` | Within line 100 | Before attention degrades |
| Procedural content | Minimal | Move to subagent files |
