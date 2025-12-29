# Story 4-2: Add context_budget Configuration

## Story Details
- **ID**: 4-2
- **Title**: Add context_budget configuration
- **Points**: 2
- **Priority**: P1
- **Epic**: 4 - Configuration & Permissions Framework
- **Jira**: MSSCI-11149
- **Branch**: feat/4-2-context-budget-config

## Acceptance Criteria
- [ ] context_budget settings in settings.local.json template
- [ ] check-context.sh reads from config
- [ ] Configurable warning/critical thresholds

## Technical Context

### Current State
- `check-context.sh` has hardcoded thresholds (70%, 90%)
- No `context_budget` section in settings.local.json template
- Tests validate hardcoded threshold presence

### Implementation Plan
1. Add `context_budget` section to settings.local.json template:
   ```json
   "context_budget": {
     "warning_threshold": 70,
     "critical_threshold": 85,
     "max_tokens": 200000
   }
   ```

2. Update check-context.sh to read config:
   - Look for settings.local.json in project's .claude directory
   - Parse JSON with Python (reuse existing pattern)
   - Fall back to defaults if config missing or invalid

3. Update tests to validate configurable behavior:
   - Test config file parsing
   - Test custom threshold values
   - Test fallback to defaults

### Files to Modify
| File | Change |
|------|--------|
| `pennyfarthing-dist/templates/settings.local.json.template` | Add context_budget section |
| `pennyfarthing-dist/scripts/check-context.sh` | Read config, apply thresholds |
| `tests/resilience/test_context_warnings.sh` | Add config-aware tests |

### Key Gotchas
- Python embedded in zsh script - reuse pattern from existing JSONL parsing
- Config may not exist - graceful fallback required
- Tests currently grep for "70" and "90" - will need refactoring

## Progress Log

### 2025-12-29 - Session Start (SM)
- Story selected from Sprint 2 backlog
- Technical context created from Story 4-1 foundation
- Ready for TEA handoff

### 2025-12-29 - TEA Assessment

**Tests Required:** Yes
**Reason:** Script behavior changes require test coverage for config loading and threshold application

**Test Files:**
- `tests/resilience/test_context_warnings.sh` - Extended with 9 new config tests

**Tests Written:** 9 failing tests (RED state confirmed)

| Test | Purpose |
|------|---------|
| test_template_has_context_budget | Verify template has context_budget section |
| test_template_has_warning_threshold | Verify warning_threshold field exists |
| test_template_has_critical_threshold | Verify critical_threshold field exists |
| test_template_has_max_tokens | Verify max_tokens field exists |
| test_script_reads_config_path | Script references settings.local.json |
| test_script_has_warning_default | Script has fallback warning default (70) |
| test_script_has_critical_default | Script has fallback critical default (85) |
| test_script_uses_configurable_warning | Script uses variable for warning threshold |
| test_script_uses_configurable_critical | Script uses variable for critical threshold |

**Existing Core Tests:** 6 tests still passing (script exists, executable, --human, warnings, recommendations)

**Status:** RED (9 failing, 6 passing - ready for Dev)

**Handoff:** To Dev (Ponder Stibbons) for implementation

---

### 2025-12-29 - Dev Handoff Notes

**Tests are RED. Ready for implementation.**

**What needs to be done:**
1. Add `context_budget` section to `pennyfarthing-dist/templates/settings.local.json.template` with:
   - `warning_threshold`: 70 (default)
   - `critical_threshold`: 85 (default)
   - `max_tokens`: 200000 (default)

2. Update `pennyfarthing-dist/scripts/check-context.sh` to:
   - Read settings.local.json from project's .claude directory
   - Parse JSON to extract threshold values (use Python like existing JSONL parsing pattern)
   - Fall back to hardcoded defaults if config missing or invalid
   - Use configurable thresholds instead of hardcoded "70" and "90"

3. All 9 failing tests in `tests/resilience/test_context_warnings.sh` must pass when done

**Key context:**
- Tests validate both template structure and script behavior
- Existing 6 core tests must remain passing
- Pattern for Python JSON parsing already exists in check-context.sh (reuse for settings.local.json)
- Config file may not exist in all projects - graceful fallback is essential

**Test locations:**
- Test file: `/Users/keithavery/Projects/pennyfarthing/tests/resilience/test_context_warnings.sh`
- Run tests: `npm test` from pennyfarthing directory

### 2025-12-29 - Dev Assessment

**Implementation Complete:** Yes
**Tests:** All 15 passing (GREEN state)

**Changes Made:**
| File | Change |
|------|--------|
| `pennyfarthing-dist/templates/settings.local.json.template` | Added context_budget section with warning_threshold (70), critical_threshold (85), max_tokens (200000) |
| `pennyfarthing-dist/scripts/check-context.sh` | Reads config from settings.local.json, falls back to defaults |

**Commits:**
- `05fd6fe` - test(4-2): add failing tests for context_budget configuration
- `67398ad` - feat(4-2): add configurable context_budget thresholds

**PR:** https://github.com/1898andCo/pennyfarthing/pull/20

**Handoff:** To Reviewer (Chrisjen Avasarala) for code review

---

---

## Reviewer Handoff

**Ready for Review:** Yes

**Repository:** pennyfarthing
**Branch:** feat/4-2-context-budget-config
**PR:** https://github.com/1898andCo/pennyfarthing/pull/20

**Files Changed:** 3 files
| File | Changes |
|------|---------|
| `pennyfarthing-dist/scripts/check-context.sh` | 57 insertions, 10 deletions |
| `pennyfarthing-dist/templates/settings.local.json.template` | 5 insertions |
| `tests/resilience/test_context_warnings.sh` | 132 insertions, 1 deletion |

**What Was Implemented:**
Added context_budget configuration support to the check-context.sh script:
1. Extended settings.local.json template with configurable thresholds:
   - warning_threshold (default: 70%)
   - critical_threshold (default: 85%)
   - max_tokens (default: 200000)

2. Updated check-context.sh to:
   - Read configuration from settings.local.json in project's .claude directory
   - Parse JSON using Python (consistent with existing patterns)
   - Fall back to hardcoded defaults if config is missing or invalid
   - Apply configurable thresholds instead of hardcoded values

3. Enhanced test coverage with 9 new configuration tests plus 6 existing core tests (all 15 passing)

**Test Results:** 42 total tests passing (all suites GREEN)

**Key Files to Review:**
1. `/Users/keithavery/Projects/pennyfarthing/pennyfarthing-dist/scripts/check-context.sh` - Core script changes, config loading logic
2. `/Users/keithavery/Projects/pennyfarthing/pennyfarthing-dist/templates/settings.local.json.template` - Template configuration structure
3. `/Users/keithavery/Projects/pennyfarthing/tests/resilience/test_context_warnings.sh` - Test suite additions

**Handoff Complete:** 2025-12-29 (Ponder Stibbons → Granny Weatherwax)

---

### 2025-12-29 - Reviewer Assessment

**Decision:** APPROVE

**Security Analysis:**
- Config path resolution is safe (uses project dir with fallback)
- Python-generated output is eval'd safely (controlled format)
- No user input injection vectors

**Edge Case Handling:**
- Missing config file: ✓ Falls back to defaults
- Malformed JSON: ✓ Falls back to defaults
- Missing context_budget section: ✓ Handled
- Missing individual fields: ✓ Uses .get() with defaults

**Architecture:**
- Follows existing embedded Python pattern
- Config read once at startup (no performance concern)
- Clean separation of defaults vs configured values

**Minor Style Issues (Non-blocking):**
- Bare `except:` could be `except Exception:` - but functional behavior is correct

**Acceptance Criteria:**
- [x] context_budget settings in settings.local.json template
- [x] check-context.sh reads from config
- [x] Configurable warning/critical thresholds

**Verdict:** Clean implementation, proper error handling, meets all ACs. Ship it.

---

## Workflow State
- **Phase**: APPROVED
- **Current Agent**: SM
- **Next Agent**: None (completion phase)
- **Status**: Ready for SM to merge and close story

## Handoff Log

### 2025-12-29 - Reviewer Handoff to SM (Complete)

**From:** Reviewer (Granny Weatherwax)
**To:** SM (complete workflow)
**Decision:** APPROVED
**PR:** https://github.com/1898andCo/pennyfarthing/pull/20

**Handoff Details:**
- Reviewer Assessment complete and approved
- All acceptance criteria verified
- Code review passed (APPROVED)
- Ready for SM to merge PR and archive story
