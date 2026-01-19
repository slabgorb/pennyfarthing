# Story MSSCI-11953: Enhance skill descriptions with 'when to use' context

## Story Details
- **ID:** MSSCI-11953
- **Title:** Enhance skill descriptions with 'when to use' context
- **Epic:** MSSCI-11952 (Skill Frontmatter Enhancement)
- **Points:** 2
- **Priority:** P1
- **Workflow:** trivial
- **Repos:** pennyfarthing
- **Assignee:** Keith Avery
- **Jira:** MSSCI-11953

## Goal
Add explicit "when to use this skill" guidance to all 21 skill frontmatter descriptions. This helps Claude Code select skills appropriately when handling user requests.

## Acceptance Criteria
- [ ] Skills have "when to use" section in description
- [ ] Context helps Claude select skills appropriately
- [ ] Follows Anthropic skill documentation patterns

## Background
The skill registry contains 21 domain expertise skills across categories like AI/LLM, development, project management, documentation, tools, and theming. Currently, only 2 of 21 skills have proper "when to use" context in their frontmatter descriptions.

Key pattern: "{What it does}. Use when {specific triggers}."

Good examples:
- **testing:** "Test commands and patterns for TDD workflow. This skill should be used when running tests, debugging test failures, setting up test infrastructure, or writing new tests."
- **just:** "Run just recipes for project tasks. This skill should be used when starting dev servers, running tests, managing databases, checking project health, or writing new justfile recipes."

Skills needing enhancement:
1. agentic-patterns - Has "Use when" in frontmatter but no description field
2. changelog - Missing "when to use"
3. code-review - Has "Use when" but could be more detailed
4. context-engineering - Has "Use when" in frontmatter but generic
5. cyclist - Has "Use when" but minimal
6. dev-patterns - Has "Use when" but could be clearer
7. finalize-run - Missing "when to use"
8. jira - Has "Use when" but minimal
9. judge - Missing "when to use"
10. mermaid - Has "Use when" with good examples
11. permissions - Has "Use when" but could be more specific
12. persona-benchmark - Missing "when to use"
13. sprint-context - Has "Use when" with good triggers
14. story-management - Has "Use when" with good triggers
15. theme - Has "Use when"
16. theme-creation - Has "Use when" but could be clearer
17. workflow - Has "Use when" but minimal
18. yq - Has "Use when" but minimal
19. backlog - Has "Use when"
20. otel - Has "Use when"
21. (finalize-run covered above)

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-19T12:30:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T12:00:00Z | 2026-01-19T12:16:43Z | 16m |
| impl | 2026-01-19T12:16:43Z | 2026-01-19T12:25:00Z | 8m |
| review | 2026-01-19T12:25:00Z | 2026-01-19T12:30:00Z | 5m |
| finish | 2026-01-19T12:30:00Z | - | - |

## Reviewer Assessment
**Verdict:** APPROVED ✓
**Reviewer:** Chrisjen Avasarala

### Findings
- Minor: changelog renamed from changelog-management (correct fix)
- Minor: just renamed from just-runner (correct fix)

### Quality Notes
- Consistent pattern across all changes
- Added missing YAML frontmatter to 3 skills
- Fixed two pre-existing name mismatches
- Descriptions are specific and actionable

## Dev Assessment
**PR:** https://github.com/1898andCo/pennyfarthing/pull/352
**Commit:** 7a3f17af

### Implementation Summary
Enhanced 10 skill frontmatter descriptions with explicit "Use when" triggers. Added YAML frontmatter to 3 skills that were missing it. Fixed `just` skill name mismatch.

### Files Modified (10)
- pennyfarthing-dist/skills/agentic-patterns/SKILL.md
- pennyfarthing-dist/skills/changelog/SKILL.md
- pennyfarthing-dist/skills/context-engineering/SKILL.md
- pennyfarthing-dist/skills/finalize-run/SKILL.md
- pennyfarthing-dist/skills/judge/SKILL.md
- pennyfarthing-dist/skills/just/SKILL.md
- pennyfarthing-dist/skills/permissions/skill.md
- pennyfarthing-dist/skills/persona-benchmark/SKILL.md
- pennyfarthing-dist/skills/theme/skill.md
- pennyfarthing-dist/skills/workflow/SKILL.md

### AC Status
- [x] Skills have "when to use" section in description (all 21 verified)
- [x] Context helps Claude select skills appropriately (specific triggers added)
- [x] Follows Anthropic skill documentation patterns (pattern: "{What}. Use when {triggers}.")

## Files to Update
All skill files in `pennyfarthing-dist/skills/*/skill.md`:
1. agentic-patterns/skill.md
2. backlog/skill.md
3. changelog/skill.md
4. code-review/skill.md
5. context-engineering/skill.md
6. cyclist/skill.md
7. dev-patterns/skill.md
8. finalize-run/skill.md
9. jira/skill.md
10. judge/skill.md
11. just/skill.md
12. mermaid/skill.md
13. otel/skill.md
14. permissions/skill.md
15. persona-benchmark/skill.md
16. sprint-context/skill.md
17. story-management/skill.md
18. testing/skill.md
19. theme/skill.md
20. theme-creation/skill.md
21. workflow/skill.md
22. yq/skill.md

## Next Steps
Ready for trivial workflow (Dev implementation → Reviewer → SM finish)
