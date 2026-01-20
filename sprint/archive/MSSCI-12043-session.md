## Story MSSCI-12043: Add epic management commands to /sprint skill
**Epic:** MSSCI-11952
**Points:** 3 | **Priority:** P2
**Repos:** pennyfarthing
**Branch:** feat/MSSCI-12043-sprint-epic-commands
**Phase:** review
**Status:** in_progress
**Workflow:** trivial

## Acceptance Criteria
- [x] /sprint promote moves epic from planning.yaml to current-sprint.yaml
- [x] /sprint epic create creates Jira epic and child stories
- [x] /sprint epic sync updates Jira from sprint YAML
- [x] Scripts follow existing /sprint skill patterns

## Workflow Tracking

| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| setup | SM | completed | 2026-01-20 |
| impl | Dev | completed | 2026-01-20 |
| review | Reviewer | completed | 2026-01-20 |
| finish | SM | pending | 2026-01-20 |

## Handoff History

| From | To | Gate | Result | Time |
|------|----|----|--------|------|
| Dev | Reviewer | tests_pass | PASSED | 2026-01-20 08:45 |
| Reviewer | SM | approval | PASSED | 2026-01-20 |

## Context
Story involves adding epic management commands to the existing /sprint skill. Scripts should follow patterns in .pennyfarthing/scripts/ and the skill definition in .claude/skills/sprint/skill.md.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/skills/sprint/scripts/promote-epic.sh` - Move epic from planning.yaml to current-sprint.yaml
- `pennyfarthing-dist/skills/sprint/scripts/create-jira-epic.sh` - Create Jira epic and child stories
- `pennyfarthing-dist/skills/sprint/scripts/sync-epic-jira.sh` - Sync epic status and points to Jira
- `pennyfarthing-dist/skills/sprint/skill.md` - Updated with new command documentation
- `pennyfarthing-dist/scripts/*.sh` - Symlinks to skill scripts

**Tests:** Manual testing completed (trivial workflow)
- promote-epic.sh: Usage display, error handling for missing epics
- create-jira-epic.sh: Usage display, dry-run mode
- sync-epic-jira.sh: Usage display, dry-run shows sync status

**PR:** #371 - feat(sprint): add epic management commands to /sprint skill
**Branch:** feat/MSSCI-12043-sprint-epic-commands (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #371
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `EPIC_ID` input from user at `promote-epic.sh:9` → yq JSON extraction at line 49 → YAML generation at lines 78-102 → file append at line 115
- **Pattern observed:** All three scripts correctly follow existing sprint script patterns (`set -euo pipefail`, PROJECT_ROOT detection, yq dependency checks) - matches `archive-story.sh`, `check-story.sh`
- **Error handling:** All scripts have proper error handling - missing args exit 1 with usage, missing files/dependencies provide clear error messages

**Security:** N/A - No auth changes, no user-facing web input. Scripts operate on local YAML files and delegate to jira CLI which handles auth separately.

**Performance:** N/A - Batch operations, no N+1 concerns. Scripts are CLI tools for occasional use.

**Non-Blocking Observations:**
- [MEDIUM] `promote-epic.sh:115` - YAML generation via string concatenation and echo append could produce malformed YAML if source data contains special characters. Recommend using yq for atomic YAML manipulation in future enhancement.
- [MEDIUM] `create-jira-epic.sh:106-112` - Interactive `read -p` prompt will hang in non-interactive contexts (CI/automation). Consider adding `--yes` flag or `-t` timeout.
- [LOW] `sync-epic-jira.sh:66-69` - Stale comments about "epic number" compatibility that don't match actual behavior.

**What Passed:**
- All acceptance criteria met
- Symlinks correctly created
- Documentation complete and accurate
- Scripts tested manually with dry-run
- Follows existing patterns

**Handoff:** To SM for finish-story workflow
