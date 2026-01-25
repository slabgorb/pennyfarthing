# Story 63-7: Port remaining Jira scripts to Python

## Story Details
- **ID:** 63-7
- **Jira:** MSSCI-12401
- **Workflow:** tdd

## Workflow Tracking
**Workflow:** tdd
**Phase:** done
**Phase Started:** 2026-01-25T19:42:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-25T07:45:12Z | 2026-01-25T07:46:08Z | 56s |
| red | 2026-01-25T07:46:08Z | 2026-01-25T08:02:20Z | 16m12s |
| green | 2026-01-25T08:02:20Z | 2026-01-25T19:41:00Z | 11h39m |
| review | 2026-01-25T19:41:00Z | 2026-01-25T19:42:00Z | 1m |

## TEA Assessment (RED Phase)

### Tests Written
- `tests/python/test_jira_lib_port.py` - 44 tests covering:
  - `find_story()` - find story within epic (5 tests)
  - `get_story_field()` - get field from story (8 tests)
  - `check_dependencies()` - verify jira CLI and token (6 tests)
  - `map_github_to_jira()` - GitHub→Jira email mapping (5 tests)
  - `jira_sync_story.py` module and CLI (9 tests)
  - `jira_epic_creation.py` module (6 tests)
  - Backwards compatibility (2 tests)

### Test Results
All 44 tests FAIL as expected (RED phase complete).

### Implementation Targets
| File | Functions to Add |
|------|------------------|
| `pennyfarthing_scripts/sprint.py` | `find_story()`, `get_story_field()` |
| `pennyfarthing_scripts/jira.py` | `check_dependencies()`, `map_github_to_jira()` |
| `pennyfarthing_scripts/jira_sync_story.py` | New CLI script |
| `pennyfarthing_scripts/jira_epic_creation.py` | New module |

### Notes for Dev
- Existing `find_epic()` in sprint.py already handles epic lookup
- `get_story_field()` should extract epic number from story ID (e.g., "63-7" → epic 63)
- Follow existing patterns from `jira_sync.py` for async operations
- Use argparse for CLI argument parsing

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | green (dev) | tests_fail | PASSED | 2026-01-25T08:02:20Z |

## Dev Assessment (GREEN Phase)

### Implementation Summary
All 44 tests now pass. Implemented:

1. **sprint.py additions:**
   - `find_story(epic, story_id)` - find story within an epic
   - `get_story_field(sprint_data, story_id, field)` - get field from story (extracts epic from story ID)

2. **jira.py additions:**
   - `check_dependencies(quiet=False)` - verify jira CLI, JIRA_API_TOKEN, config
   - `map_github_to_jira(github_user)` - map GitHub username to Jira email
   - `GITHUB_TO_JIRA_MAP` - lookup table for known users

3. **jira_sync_story.py (new CLI script):**
   - `parse_args()` - CLI argument parsing
   - `get_story_from_sprint()` - find story in YAML
   - `fetch_jira_issue()` - get issue from Jira
   - `sync_story()` - main sync logic with --transition, --points, --comment, --dry-run

4. **jira_epic_creation.py (new module):**
   - `parse_args()` - CLI argument parsing
   - `build_epic_payload()` - build Jira API payload
   - `call_jira_api()` - REST API wrapper
   - `create_epic()` - create epic with dry-run support
   - `create_epic_from_yaml()` - create from sprint YAML

### Bonus Fixes (during session)
- Fixed `HANDOFF_MODE` detection in `check-context.sh` - now respects `relay_mode` config
- Updated `reflector-check.mjs` hook to require markers on ALL turns (not just questions)
- Added `CYCLIST:CONTINUE` marker type for status updates

### Test Results
```
44 passed in 0.19s
```

### Files Modified
- `pennyfarthing_scripts/sprint.py` - added find_story, get_story_field
- `pennyfarthing_scripts/jira.py` - added check_dependencies, map_github_to_jira
- `pennyfarthing_scripts/jira_sync_story.py` - NEW
- `pennyfarthing_scripts/jira_epic_creation.py` - NEW
- `.pennyfarthing/scripts/core/check-context.sh` - fixed HANDOFF_MODE
- `pennyfarthing-dist/scripts/hooks/question-reflector-check.mjs` - marker enforcement
- `pennyfarthing-dist/guides/agent-behavior.md` - documented CONTINUE marker

## Review Assessment

### Reviewer: Abdul Alhazred
**Verdict:** APPROVED

### Issues Found
- **Minor:** Import sorting violation in `jira_sync_story.py` (fixed with ruff)
- **Minor:** Status mapping uses underscore (`in_progress`) vs JS hyphen (`in-progress`) - intentional for YAML compatibility
- **Observation:** `call_jira_api()` uses curl subprocess; could use requests/httpx in future

### Commit
```
09fe1e370 feat(jira): port remaining Jira scripts to Python (#63-7)
```

## SM Completion

### Story Status
- **Tests:** 44 passed
- **Review:** Approved by Abdul Alhazred
- **Commit:** 09fe1e370
- **Branch:** feat/63-7-jira-scripts-python
