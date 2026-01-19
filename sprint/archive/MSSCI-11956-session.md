# Story MSSCI-11956: Create systematic-debugging skill

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 49 - Skill Frontmatter Enhancement |
| Jira | MSSCI-11956 |
| Points | 3 |
| Priority | P1 |
| Workflow | trivial |
| Repos | pennyfarthing |

## Technical Context

### Problem Statement

When debugging issues, agents often jump directly to solutions without methodically isolating the root cause. A systematic-debugging skill will guide Claude through a structured debugging process: reproduce, isolate, hypothesize, test.

### Current State

Existing related skills:
- `testing/SKILL.md` - Test execution patterns, TDD workflow (RED/GREEN/REFACTOR)
- `dev-patterns/SKILL.md` - Common patterns, gotchas, turn efficiency
- `agentic-patterns/SKILL.md` - ReAct, Plan-and-Execute, Self-Reflection patterns

**Gap:** No dedicated skill for systematic debugging methodology. The agentic-patterns skill covers general reasoning, but debugging requires specific techniques:
- Reproducing issues consistently
- Bisecting to isolate root cause
- Forming and testing hypotheses
- Validating fixes don't mask the problem

### Target Location

```
pennyfarthing-dist/skills/systematic-debugging/
├── SKILL.md          # Main skill file with frontmatter
└── (no references/)  # Simple skill, doesn't need reference files
```

Symlink will be auto-created by doctor/update: `.claude/skills/systematic-debugging/`

### Skill Structure (Following Patterns)

```yaml
---
name: systematic-debugging
description: Systematic debugging approach for isolating and fixing issues. Use when debugging failures, investigating errors, bisecting regressions, or validating fixes.
---
```

### Core Debugging Cycle

```
1. REPRODUCE - Make the failure happen reliably
2. ISOLATE   - Narrow down to minimal reproducer
3. HYPOTHESIZE - Form theory about root cause
4. TEST      - Validate or invalidate hypothesis
5. FIX       - Implement solution
6. VERIFY    - Confirm fix addresses root cause, not symptom
```

### Key Techniques to Document

1. **Reproduction**
   - Exact steps to trigger
   - Environment factors (versions, state)
   - Consistent vs intermittent failures

2. **Isolation**
   - Binary search (git bisect, code bisect)
   - Minimal reproducible example
   - Removing variables one at a time

3. **Hypothesis Formation**
   - Read error messages carefully
   - Check recent changes
   - Consider edge cases (null, empty, boundary)

4. **Testing Hypotheses**
   - Add logging/prints at key points
   - Use debugger breakpoints
   - Create targeted test case

5. **Verification**
   - Does fix address root cause or just symptom?
   - Are there similar bugs elsewhere?
   - Does fix introduce new issues?

## Technical Approach

Create a new skill following established patterns:

1. Create directory: `pennyfarthing-dist/skills/systematic-debugging/`
2. Write `SKILL.md` with proper frontmatter
3. Include "When to Use" section (per MSSCI-11953 pattern)
4. Document debugging cycle and techniques
5. Add examples for common scenarios

## Acceptance Criteria

- [ ] systematic-debugging skill created
- [ ] Covers reproduce, isolate, hypothesize, test cycle
- [ ] Integrates with existing dev workflow

## Files to Create

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/skills/systematic-debugging/SKILL.md` | Main skill definition |

## Dependencies & Risks

### Dependencies
- Follows skill patterns established in Epic 49
- Should complement (not duplicate) agentic-patterns and dev-patterns

### Risks
- Overlap with existing skills - mitigate by referencing them rather than duplicating
- Too abstract without examples - include concrete scenarios

---

## Workflow Tracking

**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-19T13:44:57Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T21:00:00Z | 2026-01-19T21:05:00Z | 5m |
| implement | 2026-01-19T21:05:00Z | 2026-01-19T21:51:00Z | 46m |
| review | 2026-01-19T21:51:00Z | 2026-01-19T13:44:57Z | 16h 53m |
| finish | 2026-01-19T13:44:57Z | - | - |

---

## SM Handoff Summary

**Date:** 2026-01-19T21:05:00Z
**Workflow:** trivial (SM → Dev)
**Next Agent:** Dev (The White Rabbit)

### Setup Verification

- [x] Session file exists with technical context
- [x] Jira transitioned to In Progress
- [x] Feature branch created: `feat/49-3-systematic-debugging-skill`
- [x] Sprint YAML updated (status: in_progress)

### Implementation Notes for Dev

1. **Location:** Create `pennyfarthing-dist/skills/systematic-debugging/SKILL.md`
2. **Pattern:** Follow existing skill structure (see testing, dev-patterns, agentic-patterns)
3. **Frontmatter:** Include name, description with "when to use" context
4. **Content:** Document the debugging cycle (reproduce, isolate, hypothesize, test, fix, verify)
5. **Examples:** Include concrete debugging scenarios

### Ready for Dev

All setup gates passed. Ready for implementation.

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/skills/systematic-debugging/SKILL.md` - New skill with debugging cycle documentation
- `pennyfarthing-dist/skills/skill-registry.yaml` - Added systematic-debugging entry
- `docs/SKILLS.md` - Regenerated with new skill
- `packages/shared/src/generate-skill-docs.test.ts` - Updated skill count 19→20
- `packages/shared/src/skill-search.test.ts` - Updated skill count 19→20 and category count 3→4

**Tests:** 103/103 passing (GREEN) in packages/shared
**PR:** #355 - feat(MSSCI-11956): Add systematic-debugging skill
**Branch:** feat/49-3-systematic-debugging-skill (pushed)

**Handoff:** To Reviewer for code review

---

## Reviewer Handoff

**Gate Type:** tests_pass (GREEN phase - Dev → Reviewer)
**Handoff Date:** 2026-01-19T21:51:00Z
**Status:** PASSED - Ready for review

### Pre-Flight Verification

- [x] Quality gate checks passed (lint, type, tests)
- [x] Git working tree is clean
- [x] All commits pushed to remote
- [x] PR #355 exists and is OPEN
- [x] Tests GREEN (103/103 passing in packages/shared)
- [x] Dev Assessment section completed

### Changed Files (from develop...HEAD)

```
docs/SKILLS.md                                     |  19 +
packages/shared/src/generate-skill-docs.test.ts    |   4 +-
packages/shared/src/skill-search.test.ts           |   6 +-
pennyfarthing-dist/skills/skill-registry.yaml      |  18 +
pennyfarthing-dist/skills/systematic-debugging/SKILL.md | 390 +++
sprint/current-sprint.yaml                         |   4 +-
```

Total: 6 files changed, 435 insertions(+), 6 deletions(-)

### Implementation Summary

Added systematic-debugging skill (MSSCI-11956) with:
- Comprehensive debugging methodology (REPRODUCE → ISOLATE → HYPOTHESIZE → TEST → FIX → VERIFY)
- Practical techniques for reproduction, isolation, hypothesis formation, and verification
- Integration with existing dev workflow and testing patterns
- Proper frontmatter with "when to use" context per MSSCI-11953

### Ready for Reviewer

All quality gates passed. Branch pushed. PR open for review.
PR: https://github.com/1898andCo/pennyfarthing/pull/355

---

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| setup | SM | 2026-01-19T21:05:00Z | 18% | manual |
| implement | Dev | 2026-01-19T21:51:00Z | 36% | auto |
| review | Reviewer | 2026-01-19T21:51:00Z | 36% | auto |
| finish | SM | 2026-01-19T13:44:57Z | 56% | ask |

---

## Reviewer Assessment

**PR:** #355
**Verdict:** APPROVED

**Code Review Evidence:**
- **Pattern observed:** Frontmatter at `SKILL.md:1-4` follows established pattern (name, description with "when to use" context per MSSCI-11953)
- **Structure verified:** Skill matches existing patterns at `dev-patterns/SKILL.md`, `agentic-patterns/SKILL.md`
- **Content validated:** Comprehensive debugging cycle (REPRODUCE→ISOLATE→HYPOTHESIZE→TEST→FIX→VERIFY) with practical examples

**Documentation Quality:**
- When to Use section: Clear scenarios at `SKILL.md:14-21`
- Examples: Concrete bash and TypeScript snippets throughout
- Anti-patterns: Common debugging mistakes documented at `SKILL.md:318-335`
- Integration: Proper references to related skills at `SKILL.md:380-387`

**Registry Entry:** `skill-registry.yaml:249-265` - Correct category (development), tags, keywords

**Test Updates:**
- `generate-skill-docs.test.ts:80,86`: Updated 19→20 skills correctly
- `skill-search.test.ts:43,110,114`: Updated skill counts correctly (19→20 total, 3→4 development)

**Security:** N/A - Documentation file only, no executable code
**Performance:** N/A - No runtime impact

**Minor Observations (non-blocking):**
- None

**Test Results:**
- packages/shared: 103/103 PASS (all skill-related tests)
- Pre-existing failures in cyclist and core packages are unrelated to this PR

**Handoff:** To SM for finish-story workflow

---

## Approval Handoff

**Gate Type:** approval (Reviewer → SM)
**Handoff Date:** 2026-01-19T13:44:57Z
**Status:** PASSED - Approved, ready for SM finish

### Pre-Flight Verification

- [x] Reviewer Assessment exists and contains verdict
- [x] Verdict: APPROVED matches parameter VERDICT=approved

### Transition

- Status: `approved`
- Workflow complete: Ready for SM to merge and close story
- Session log: PR approved, ready for SM to finish

### Ready for SM

All approval gates passed. Workflow ready for story completion.
