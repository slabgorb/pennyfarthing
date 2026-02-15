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
