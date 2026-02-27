# Session Artifacts Naming Convention

This guide defines the standard naming patterns for all files in `.session/`.

## Why This Matters

Consistent naming enables:
1. **Predictable cleanup** - Scripts can reliably find and remove artifacts
2. **Easy debugging** - Quickly identify what story/agent created a file
3. **No accumulation** - Story-specific cleanup catches everything

## File Categories

| Category | Purpose | Lifecycle |
|----------|---------|-----------|
| `session` | Active work session file | Archived on story completion |
| `context` | Technical context (story/epic) | Archived on completion |
| `test` | Test execution output | Cleaned after 1 day or story completion |
| `lint` | Lint execution output | Cleaned after 1 day or story completion |
| `handoff` | Agent-to-agent transition data | Cleaned on story completion |
| `findings` | Delivery Findings section in session file | Archived with session on completion |

## Naming Patterns

### Session Files (Canonical)

The primary work session file. One per active story.

```
{STORY_ID}-session.md
```

**Examples:**
- `36-2-session.md`
- `10-15-session.md`

**Created by:** `sm-setup MODE=setup`
**Archived by:** `sm-finish PHASE=execute` → `sprint/archive/story-{STORY_ID}-{DATE}.md`

---

### Context Files

Technical context for stories and epics.

```
context-story-{STORY_ID}.md
context-epic-{EPIC_NUM}.md
```

**Examples:**
- `context-story-36-2.md`
- `context-epic-10.md`

**Created by:** SM (epic-tech-context task)
**Archived by:** `sm-finish PHASE=execute` (story), `/pf-epic start` or `/retro` (epic)

---

### Test Output Files

Test execution logs and reports.

```
test-{STORY_ID}-{AGENT}-{PHASE}.log
test-{STORY_ID}-{AGENT}-{PHASE}.md
```

**Components:**
- `{STORY_ID}` - e.g., `36-2`
- `{AGENT}` - `tea`, `dev`, `reviewer`
- `{PHASE}` - `red`, `green`, `verify`

**Examples:**
- `test-36-2-tea-red.log`
- `test-36-2-dev-green.md`
- `test-36-2-reviewer-verify.log`

**Created by:** `handoff`, `reviewer-preflight`, `testing-runner`
**Cleaned by:** `session-cleanup.sh --story {STORY_ID}` or 1-day retention

---

### Lint Output Files

Lint execution logs.

```
lint-{STORY_ID}-{REPO}.log
```

**Examples:**
- `lint-36-2-api.log`
- `lint-36-2-ui.log`

**Created by:** `reviewer-preflight`
**Cleaned by:** `session-cleanup.sh --story {STORY_ID}` or 1-day retention

---

### Handoff Files

Agent-to-agent transition data for structured handoffs.

```
handoff-{STORY_ID}-{FROM_AGENT}.md
handoff-{STORY_ID}-{FROM_AGENT}.json
```

**Examples:**
- `handoff-36-2-tea.md` (TEA → Dev)
- `handoff-36-2-dev.json` (Dev → Reviewer)
- `handoff-36-2-reviewer.md` (Reviewer → SM)

**Created by:** Handoff subagents (`tea-handoff`, `dev-handoff`, `reviewer-handoff-*`)
**Cleaned by:** `session-cleanup.sh --story {STORY_ID}`

---

## Delivery Findings

The Delivery Findings section is a structured area within each session file where agents record upstream observations discovered during their phase. It enables cross-phase visibility into gaps, conflicts, and improvement opportunities.

### Section Template

Created automatically by `sm-setup` in every session file:

```markdown
## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->
```

The HTML comment is the **append marker**. All agent findings go below it; content above is static header.

### R1 Format

Every finding is a single markdown list item following R1 format exactly:

```markdown
- **{Type}** ({urgency}): {description}. Affects `{path}` ({what needs to change}). *Found by {Agent} during {human-phase-name}.*
```

**Valid types:** `Gap`, `Conflict`, `Question`, `Improvement`

| Type | When to use |
|------|-------------|
| Gap | Something expected is missing (a test, validation, doc section) |
| Conflict | Two specs or implementations contradict each other |
| Question | An ambiguity that needs a decision from PM or Architect |
| Improvement | Something works but could be better (non-blocking by definition) |

**Valid urgencies:** `blocking`, `non-blocking`

- `blocking` — must be resolved before the story can ship
- `non-blocking` — should be addressed but does not block delivery

**Human phase names:** Agents use internal phase names; findings display human-readable names.

| Internal phase | Human name |
|----------------|------------|
| `red` | test design |
| `green` | implementation |
| `review` | code review |

Unknown phases pass through as-is (e.g., `setup` stays `setup`).

### Correct Examples

```markdown
- **Gap** (blocking): Missing validation for empty input. Affects `src/parser.py` (add input guard). *Found by TEA during test design.*
- **Conflict** (non-blocking): API contract differs from updated spec. Affects `docs/api.md` (update spec to match). *Found by Reviewer during code review.*
- **Question** (non-blocking): Should retry logic use exponential backoff. Affects `src/client.py` (decide retry strategy). *Found by Dev during implementation.*
- **Improvement** (non-blocking): Could extract helper for reuse. Affects `src/utils.py` (extract shared logic). *Found by Dev during implementation.*
```

### Incorrect Examples

```markdown
# WRONG: Missing type
- (blocking): Something is missing. Affects `src/foo.py` (fix). *Found by TEA during test design.*

# WRONG: Invalid type "Bug"
- **Bug** (blocking): Crash on null. Affects `src/foo.py` (fix). *Found by TEA during test design.*

# WRONG: Missing urgency
- **Gap**: Missing validation. Affects `src/foo.py` (fix). *Found by TEA during test design.*

# WRONG: Missing "Affects" clause
- **Gap** (blocking): Missing validation. *Found by TEA during test design.*

# WRONG: Missing attribution
- **Gap** (blocking): Missing validation. Affects `src/foo.py` (fix).
```

### Agent Behavior

Each agent appends findings to the session file's Delivery Findings section **before** writing their assessment during exit. The flow:

1. Agent completes phase work
2. Agent records findings (or explicit "no findings") under a `### {Agent} ({phase})` subheading
3. Agent writes assessment
4. Agent runs exit protocol

**Append-only rule (R2):** Agents only append their own block. They never edit or remove another agent's entries.

**Explicit "no findings" (R3):** If an agent has no observations, they write `- No upstream findings.` to distinguish "checked and found nothing" from "forgot to check."

Example of accumulated findings across phases:

```markdown
<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (blocking): Missing validation for empty input. Affects `src/parser.py` (add input guard). *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings.

### Reviewer (code review)
- **Improvement** (non-blocking): Could use constants for magic numbers. Affects `src/config.py` (extract constants). *Found by Reviewer during code review.*
```

### Validation Gate

Story 133-3 added a validation gate (`pf.findings.capture.parse_delivery_findings`) that parses findings and checks R1 format compliance. Malformed entries are silently skipped during parsing — only well-formed R1 entries are captured. The gate runs before downstream consumers (Impact Summary in Epic 134, Sprint Aggregation in Epic 135) to ensure data quality.

### Path References (R4)

All paths in `Affects \`{path}\`` use relative paths from the project root. Never use absolute paths.

```markdown
# CORRECT
Affects `pennyfarthing-dist/src/pf/findings/capture.py`

# WRONG
Affects `/Users/keithavery/Projects/pf-1/pennyfarthing/pennyfarthing-dist/src/pf/findings/capture.py`
```

### Python API

The `pf.findings.capture` module provides programmatic access:

| Function | Purpose |
|----------|---------|
| `format_finding()` | Generate a single R1-format finding string |
| `parse_delivery_findings()` | Extract structured findings from session markdown |
| `append_findings_to_session()` | Atomically append findings to session file |

These are used by the validation gate and will be consumed by Epic 134 (Impact Summary) and Epic 135 (Sprint Aggregation).

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Finding not parsed | Doesn't match R1 regex | Check type spelling, urgency value, and `Affects` clause |
| "Delivery Findings section not found" | Session predates 133-1 template | Add the section manually with the marker comment |
| "Delivery Findings marker comment not found" | Marker was deleted or modified | Restore: `<!-- Agents: append findings below this line. Do not edit other agents' entries. -->` |
| Duplicate agent headings | Agent appended twice | By design — append-only, no dedup |
| Missing agent block | Agent skipped finding capture | Agent exit protocol bug — should always write findings or "no findings" |

---

## System Files

These are managed automatically and should not be manually created.

| File | Purpose | Management |
|------|---------|------------|
| `.gitkeep` | Keeps directory in git | Never delete |
| `session-log.txt` | Session activity log | Rotated to 1000 lines by cleanup |
| `agents/` | Agent session state (UUIDs) | Cleaned after 1 day |

---

## Cleanup Patterns

The `session-cleanup.sh` script uses these patterns:

### Story-specific cleanup (`--story {ID}`)
```bash
test-{STORY_ID}-*.log
test-{STORY_ID}-*.md
lint-{STORY_ID}-*.log
handoff-{STORY_ID}-*.md
handoff-{STORY_ID}-*.json
context-story-{STORY_ID}.md
```

### Time-based cleanup (default: 1 day retention)
```bash
test-*.log
test-*.md
lint-*.log
handoff-*.md
handoff-*.json
context-story-*.md
```

### Aggressive cleanup (`--aggressive`)
```bash
context-epic-*.md  # Only for completed epics
```

---

## Migration from Old Patterns

Old patterns that should no longer be used:

| Old Pattern | New Pattern |
|-------------|-------------|
| `story-{ID}-context.md` | `context-story-{ID}.md` |
| `epic-{N}-context.md` | `context-epic-{N}.md` |
| `test-results-{repo}-{ID}.log` | `test-{ID}-{agent}-{phase}.log` |
| `tea-{ID}-red-check-results.md` | `test-{ID}-tea-red.md` |
| `dev-{ID}-red-verify-report.md` | `test-{ID}-dev-red.md` |
| `{ID}-handoff-summary.md` | `handoff-{ID}-{agent}.md` |
| `lint-results-{repo}-{ID}.log` | `lint-{ID}-{repo}.log` |

---

## Quick Reference

```
.session/
├── .gitkeep                          # Git placeholder
├── session-log.txt                   # Activity log (auto-rotated)
├── agents/                           # Agent session state
│   └── {uuid}.md                     # Per-session state
├── 36-2-session.md                   # Active story session
├── context-story-36-2.md             # Story technical context
├── context-epic-10.md                # Epic technical context
├── test-36-2-tea-red.log             # TEA test output
├── test-36-2-dev-green.md            # Dev test report
├── lint-36-2-api.log                 # Lint output
└── handoff-36-2-tea.md               # TEA → Dev handoff
```
