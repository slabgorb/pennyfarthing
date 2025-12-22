# Story 1-1: Expand Agent Command Files - Technical Context

## Story Overview
- **Epic:** Agentic Best Practices Implementation
- **Points:** 5
- **Priority:** P1
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11117

## Current State

**10 agent command files exist as 16-line stubs:**

| File | Lines | Content |
|------|-------|---------|
| dev.md | 16 | Stub with agent-session.sh + activation tags |
| tea.md | 16 | Stub |
| reviewer.md | 16 | Stub |
| sm.md | 16 | Stub |
| pm.md | 16 | Stub |
| architect.md | 16 | Stub |
| orchestrator.md | 16 | Stub |
| devops.md | 16 | Stub |
| tech-writer.md | 16 | Stub |
| ux-designer.md | 16 | Stub |

**Template exists:** `core/commands/new-work.md` (104 lines) demonstrates the target structure.

## Technical Approach

Expand each stub to ~80-100 lines following new-work.md structure:

```markdown
---
description: [one-line description]
---

# [Agent Name]

**[Purpose statement]**

---

## How It Works

[ASCII diagram showing workflow position]

---

## When to Use

[Use cases and triggers]

---

## Invoke

```
/[agent-name]
```

[What happens on invocation]

---

## Key Responsibilities

[Bulleted list from agent file]

---

## Workflow Position

[Where in TDD flow: SM → TEA → Dev → Reviewer]

---

## Reference

- **Agent:** `.claude/agents/[name].md`
- **Sidecar:** `.claude/project/agents/[name]-sidecar/`
- **Skills:** [list if applicable]
```

## Files to Modify

All in `core/commands/`:

1. **Tactical agents (TDD flow participants):**
   - `dev.md` - Extract from `.claude/agents/dev.md`
   - `tea.md` - Extract from `.claude/agents/tea.md`
   - `reviewer.md` - Extract from `.claude/agents/reviewer.md`
   - `sm.md` - Extract from `.claude/agents/sm.md`

2. **Strategic agents:**
   - `pm.md` - Extract from `.claude/agents/pm.md`
   - `architect.md` - Extract from `.claude/agents/architect.md`
   - `orchestrator.md` - Extract from `.claude/agents/orchestrator.md`

3. **Specialist agents:**
   - `devops.md` - Extract from `.claude/agents/devops.md`
   - `tech-writer.md` - Extract from `.claude/agents/tech-writer.md`
   - `ux-designer.md` - Extract from `.claude/agents/ux-designer.md`

## Acceptance Criteria

- [ ] AC1: Each command file has workflow context similar to new-work.md
- [ ] AC2: Files include activation steps, responsibilities, handoff patterns
- [ ] AC3: Consistent structure across all 10 files

## Testing Strategy

**This is pure documentation work - no automated tests required.**

Verification:
- Each file follows the template structure
- Each file is 80-100 lines (not 16)
- Key information extracted from corresponding agent file
- ASCII diagrams show workflow position where applicable

## Dependencies & Risks

**Dependencies:**
- Agent files in `.claude/agents/` (all exist)
- Template: `core/commands/new-work.md` (exists)

**Risks:**
- Low risk - documentation only
- No code changes, no test changes

## Routing Decision

**Scale:** 5 points (Standard)
**Route:** SM → TEA → Dev

TEA will likely determine:
- No code tests needed (pure markdown)
- Verification is structural (file length, section presence)
- May bypass to Dev with "documentation chore" justification
