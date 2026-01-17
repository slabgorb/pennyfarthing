# Story 47-3: Detect Jira-only stories missing from sprint YAML

## Story Info
- **ID:** 47-3
- **Title:** Detect Jira-only stories missing from sprint YAML
- **Points:** 3
- **Priority:** P2
- **Jira:** MSSCI-11799
- **Branch:** feature/47-3-detect-jira-only-stories
- **Workflow:** tdd

## Acceptance Criteria
1. Sync script queries Jira sprint for all pennyfarthing stories
2. Compares against sprint YAML story list
3. Reports stories in Jira but not in YAML
4. Optionally imports missing stories to YAML

## Technical Context

### Existing Infrastructure (from 47-2)
- `packages/core/src/jira/jira-sprint-sync.ts` - Has `getSprintIssues()` function
- `packages/core/src/jira/jira-sprint-sync.test.ts` - 25 tests with mock patterns

### Functions to Implement
1. `getYamlStoryIds(sprintYamlPath)` - Extract all story IDs from sprint YAML
2. `findJiraOnlyStories(jiraIssues, yamlStoryIds)` - Compare and find missing
3. `formatMissingStoriesReport(missingStories)` - Human-readable report
4. `importMissingStoriesToYaml(missingStories, sprintYamlPath, options)` - Add to YAML

### Key Files
- `packages/core/src/jira/jira-sprint-sync.ts` - Add new functions here
- `packages/core/src/jira/jira-sprint-sync.test.ts` - Add tests here
- `sprint/current-sprint.yaml` - Source for YAML story IDs

## Session Log

### SM Setup - 2026-01-17
- Created branch: feature/47-3-detect-jira-only-stories
- Claimed Jira: MSSCI-11799 → In Progress
- Updated sprint YAML status: in_progress
- Ready for TEA handoff

### TEA Setup - 2026-01-17
- Wrote 17 failing tests covering all 4 acceptance criteria
- Tests in `packages/core/src/jira/jira-sprint-sync.test.ts`
- RED state verified: all tests failing with "Not yet implemented"

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/core/src/jira/jira-sprint-sync.ts` - Implemented 4 functions for detecting Jira-only stories

**Functions Implemented:**
1. `getYamlStoryIds()` - Extracts story IDs from sprint YAML epics structure
2. `findJiraOnlyStories()` - Compares Jira issues against YAML, with label filtering
3. `formatMissingStoriesReport()` - Generates human-readable report with Jira URLs
4. `importMissingStoriesToYaml()` - Adds missing stories to target epic (with dry-run support)

**Tests:** 42/42 passing (GREEN) - 25 from 47-2, 17 from 47-3
**PR:** #317 - feat(47-3): Detect Jira-only stories missing from sprint YAML
**Branch:** feature/47-3-detect-jira-only-stories (pushed)

**Handoff:** To Reviewer for code review

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-17T22:25:35Z
**Status:** approved

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| red | 2026-01-17T18:00:00Z | 2026-01-17T19:30:00Z | 1h 30m |
| green | 2026-01-17T19:30:00Z | 2026-01-17T22:11:03Z | 2h 41m |
| review | 2026-01-17T22:11:03Z | 2026-01-17T22:25:35Z | 14m 32s |

## Reviewer Handoff

**Repository:** pennyfarthing
**Branch:** feature/47-3-detect-jira-only-stories
**PR:** [#317 - feat(47-3): Detect Jira-only stories missing from sprint YAML](https://github.com/keithavery/pennyfarthing/pull/317)

**Key Files to Review:**
- `packages/core/src/jira/jira-sprint-sync.ts` - Added 4 functions for detecting Jira-only stories
- `packages/core/src/jira/jira-sprint-sync.test.ts` - Added 17 tests for 47-3 functionality

**Implementation Summary:**
Implemented Jira-only story detection system with the following functions:
1. `getYamlStoryIds()` - Extracts story IDs from sprint YAML epics structure
2. `findJiraOnlyStories()` - Compares Jira issues against YAML, with optional label filtering
3. `formatMissingStoriesReport()` - Generates human-readable report with Jira URLs
4. `importMissingStoriesToYaml()` - Adds missing stories to target epic (with dry-run support)

**Test Results:** 42/42 passing (100%)
- 25 tests from story 47-2 (passing)
- 17 new tests from story 47-3 (passing)

## Handoff History

| Phase | Agent | Timestamp | Mode |
|-------|-------|-----------|------|
| green | dev | 2026-01-17T22:11:03Z | auto |
| review | reviewer | 2026-01-17T22:25:35Z | auto |

## Reviewer Assessment

**PR:** #317
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `sprintPath` from options → `existsSync` validation at jira-sprint-sync.ts:510 → `readFileSync` at :518 → YAML parse → story extraction. Safe - path validated before I/O.
- **Pattern observed:** Follows existing `SprintSyncResult` pattern with `success: boolean` and `error?: string` - consistent with 47-2 functions above.
- **Error handling:** Try-catch at :544-548 and :742-746 returns descriptive errors. Missing file check at :510-515. Target epic validation at :697-702.

**Security:** N/A - internal CLI tooling, no user-facing input, no auth changes
**Performance:** Synchronous file I/O in async functions (Minor - acceptable for CLI with small YAML files, consistent with 47-2)

**Minor Observations (non-blocking):**
- Functions declared `async` but use `readFileSync`/`writeFileSync` - could use `fs/promises` for true async, but matches existing codebase pattern

**Handoff:** To SM for finish-story workflow

## Current Phase
**Reviewer → SM** - APPROVED, ready for finish
