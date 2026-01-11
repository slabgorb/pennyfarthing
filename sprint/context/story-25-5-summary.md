# Story 25-5: Structured Output Markers (Claude-side)

## Status: COMPLETE

**Story:** 25-5 - Structured Output Markers (Claude-side)
**Epic:** 25 - Smart Question Detection & Quick Actions
**Jira:** MSSCI-11537
**Points:** 3
**Repos:** pennyfarthing, cyclist
**PR:** #177 - Merged to develop

---

## What We Delivered

Story 25-5 introduces structured output markers for Cyclist quick-actions - a machine-readable layer on top of Claude's natural language responses that enables 100% accurate detection of handoffs, questions, and choices.

### Acceptance Criteria - All Completed

**AC1 - Marker Format Documented:**
Added comprehensive marker specification to `shared-agent-behavior.md` defining three marker types:
- `<!-- CYCLIST:HANDOFF:/agent -->` - Agent invocations for TEA, Dev, Reviewer, SM
- `<!-- CYCLIST:QUESTION:yesno -->` - Yes/No confirmation prompts
- `<!-- CYCLIST:CHOICES:1,2,3 -->` - Numbered list selections

**AC2 - Agents Updated:**
All four TDD workflow agents (SM, TEA, Dev, Reviewer) now include marker emission instructions in their handoff sections. Agents can emit markers before handing off or asking for user confirmation.

**AC3 - Parser Implemented:**
`detectStructuredMarkers()` function in Cyclist's quick-actions.js parses markers with priority over pattern matching, enabling deterministic UI responses. Function includes:
- Regex pattern for marker extraction: `/<!--\s*CYCLIST:(\w+):([^>]+)\s*-->/g`
- Proper null handling for messages without markers
- Code block exclusion (markers in code blocks are ignored)
- Multiple marker extraction in correct order

**AC4 - Markers Invisible:**
HTML comments are inherently invisible in rendered markdown, ensuring clean user experience while providing machine-readable metadata. Two dedicated tests verify this behavior, plus the inherent properties of HTML comments.

---

## Technical Implementation

### Files Modified

**Cyclist Repo:**
- `/packages/cyclist/src/public/js/components/message-view/quick-actions.js` - detectStructuredMarkers() and processStructuredMarkers() functions
- `/packages/cyclist/src/public/js/components/message-view/index.js` - Export detectStructuredMarkers
- `/packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` - 31 new tests for marker detection

**Pennyfarthing Repo:**
- `/pennyfarthing-dist/guides/shared-agent-behavior.md` - Marker format definition and usage
- `/pennyfarthing-dist/agents/sm.md` - Handoff marker instruction
- `/pennyfarthing-dist/agents/tea.md` - Handoff marker instruction
- `/pennyfarthing-dist/agents/dev.md` - Handoff marker instruction
- `/pennyfarthing-dist/agents/reviewer.md` - Handoff marker instruction

### Key Implementation Details

**Detection Priority:**
1. Structured markers (100% confidence)
2. Handoff patterns
3. List/choices patterns
4. Question patterns

**Marker Processing:**
- HANDOFF markers create agent invocation buttons
- QUESTION markers create Yes/No buttons
- CHOICES markers create numbered choice buttons
- Fallback to existing pattern matching if no markers present

**Backward Compatibility:**
- Markers are optional enhancement, not replacement
- Existing pattern detection continues to work
- Messages without markers work exactly as before

---

## Testing & Quality

### Test Results
- **Story 25-5 Tests (B-9.6):** 203/203 PASSING
- **Type Check:** PASSING
- **Pre-existing Failures:** 18 unrelated tests from other stories

### Test Coverage Summary
| Category | Test Count | Coverage |
|----------|-----------|----------|
| Module exports | 1 | `detectStructuredMarkers` function export |
| Single marker extraction | 6 | HANDOFF, QUESTION, CHOICES markers |
| Multiple markers | 2 | Order preservation, multiple types |
| Null/empty handling | 5 | Null, empty string, no markers, malformed |
| Format variations | 5 | Whitespace, casing, position |
| Markdown context | 3 | Headings, code blocks, bullets |
| Priority/Integration | 4 | Marker priority over patterns |
| Marker invisibility | 2 | HTML comments not rendered |
| Edge cases | 3 | Code block exclusion |

---

## Workflow Summary

**Phases Completed:**
1. SM Setup - Story created, branch prepared, Jira claimed
2. TEA (RED) - 31 failing tests written for detectStructuredMarkers
3. Dev (GREEN) - Implementation complete, all 4 ACs implemented
4. Reviewer (REVIEW) - Initial reject due to pattern conflict, then approve after fix
5. SM Finish - PR merged, story archived

**Key Events:**
- Initial implementation complete with all ACs
- Reviewer identified "Can I" pattern conflict with story 25-4
- Dev applied fix: removed conflicting pattern, updated test expectations
- Second review approved with all 203 tests passing
- PR #177 merged to develop branch

---

## Technical Notes

### Fix Applied During Review
The "Can I" pattern from Story 25-4 conflicted with an existing test documenting it as too broad. The pattern was removed from QUESTION_PATTERNS in quick-actions.js, and the corresponding test was updated to expect null for "Can I" queries.

### Design Decisions
1. **HTML Comments** - Invisible to users, parseable by frontend
2. **CYCLIST: Prefix** - Avoids collision with other comment uses
3. **Type Field** - Enables different UI handling (handoff vs question vs choices)
4. **Value Field** - Carries payload (agent name, response type, choice numbers)

### Backward Compatibility
- Pattern detection remains unchanged as fallback
- Markers are optional, not required
- Messages without markers continue to work via existing patterns

---

## Metrics

| Metric | Value |
|--------|-------|
| Story Points | 3 |
| Tests Added | 31 (now 203 total in B-9.6) |
| Files Changed | 8 |
| Lines Added | ~750 |
| Workflow | SM → TEA → Dev → Reviewer (reject) → Dev → Reviewer (approve) → SM |
| Resolution Time | ~2 hours |
| PR Merge | Squash merge to develop |

---

## Future Work

**Related Stories:**
- **25-6:** Confidence Scoring for Detection - Will use markers as 100% confidence sources
- **25-7:** Quick Action Analytics - Will track marker vs pattern usage
- **Epic 26:** Symlink Permission Fix - Infrastructure improvement for agent distribution

**Potential Enhancements:**
- Add confidence scoring to pattern matches
- Track false positive/negative rates in production
- Expand markers for additional UI patterns
- Integrate with analytics pipeline

---

**Story Complete. All acceptance criteria verified and implemented.**
