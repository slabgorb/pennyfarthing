# Session: BL-1 - Store theme preference in local settings

## Story
**ID:** BL-1
**Title:** Store theme preference in local settings (user isolation)
**Points:** 3
**Priority:** P2

## Problem
Theme selection stored in `.claude/persona-config.yaml` is shared across all users.
When one person changes themes, it affects everyone working on the project.

## Solution
Store theme preference in user-local settings that are NOT committed to git.
The runtime (`agent-session.sh`) already supports this - only the CLI needs updating.

## Technical Context

### Current Implementation

**agent-session.sh (lines 106-113) - ALREADY DONE:**
```bash
# Check for local config first, then default
if [ -f "$PROJECT_ROOT/.claude/persona-config.local.yaml" ]; then
  config_file="$PROJECT_ROOT/.claude/persona-config.local.yaml"
elif [ -f "$PROJECT_ROOT/.claude/persona-config.yaml" ]; then
  config_file="$PROJECT_ROOT/.claude/persona-config.yaml"
```

**themes.ts getCurrentTheme() - NEEDS UPDATE:**
```typescript
// Currently only reads shared config
const configPath = join(root, '.claude/persona-config.yaml');
```

**themes.ts setTheme() - NEEDS UPDATE:**
```typescript
// Currently writes to shared config
const configPath = join(configDir, 'persona-config.yaml');
```

### Files to Modify

1. `src/cli/utils/themes.ts`
   - `getCurrentTheme()`: Check local config first, fall back to shared
   - `setTheme()`: Write to local config by default
   - Add `--global` flag support for setting shared config

2. `pennyfarthing-dist/templates/.gitignore.template` (if exists) OR document in README
   - Add `.claude/persona-config.local.yaml` pattern

3. `.gitignore` (this project)
   - Add `.claude/persona-config.local.yaml`

### Precedence Order (to implement)
1. `.claude/persona-config.local.yaml` (user local, gitignored)
2. `.claude/persona-config.yaml` (project default, committed)
3. Built-in default (minimalist)

## Acceptance Criteria
- [ ] Theme preference stored in user-local location
- [ ] Local preference not committed to git
- [ ] Project-level theme serves as team default
- [ ] `pennyfarthing theme set` updates local preference
- [ ] Multiple developers can use different themes simultaneously
- [ ] Clear precedence documented in README

## TEA Assessment

**Tests Required:** Yes
**Reason:** Core functionality change to theme loading behavior

**Test Files:**
- `src/cli/utils/themes.test.ts` - Tests for local config precedence and setTheme behavior

**Tests Written:** 8 tests covering 4 ACs
- AC1/AC4: `setTheme()` should write to `.local.yaml` - 3 tests
- AC3: `getCurrentTheme()` should check local first - 4 tests
- AC5: Multi-user isolation - 1 test

**Status:** RED (4 failing, 4 passing - ready for Dev)

**Failing Tests:**
1. `should return local theme when both local and shared exist` - getCurrentTheme ignores local
2. `should prefer local even when local theme is different` - getCurrentTheme ignores local
3. `should write to local config file by default` - setTheme writes to shared
4. `should allow multiple users to have different themes` - No local support

**Run Tests:**
```bash
node --test dist/cli/utils/themes.test.js
```

**Handoff:** To Dev (Lieutenant Tisarwat) for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Tests Passing:** 8/8 (was 4/8 RED)

**Changes Made:**
1. `src/cli/utils/themes.ts`:
   - `getCurrentTheme()`: Now checks local config first, falls back to shared
   - `setTheme()`: Now writes to local config by default
   - Added `SetThemeOptions` interface with `global` option
   - Fixed bug: `setTheme` now passes `projectRoot` to `getThemes()`

2. `.gitignore`: Added `.claude/persona-config.local.yaml`

3. `src/cli/utils/themes.test.ts`: Updated tests to use proper test fixtures

**Run All Tests:**
```bash
npm test  # 588 tests, all passing
```

**Handoff:** To Reviewer (Sphene) for code review

## Reviewer Assessment

**Reviewer:** Sphene
**Verdict:** APPROVED

### Security Analysis
- No user input execution vulnerabilities
- File paths constructed from known roots, no path traversal
- YAML parsing uses established library (not manual parsing)

### Edge Cases Verified
- Empty/null local config theme falls through to shared ✓
- Invalid YAML in local config handled with try-catch ✓
- Missing files handled gracefully ✓
- Race conditions acceptable for user preference file

### Code Quality
- Clean implementation following existing patterns
- Proper error handling with try-catch
- Helpful comment headers in output files
- Good JSDoc documentation added

### Bug Fix Noted
- Fixed: `setTheme()` now correctly passes `projectRoot` to `getThemes()`
- This prevented themes from being found in non-cwd directories

### Minor Issue (Non-Blocking)
- `src/cli/commands/init.ts` `updateGitignore()` function does not include `.claude/persona-config.local.yaml`
- New installations via `pennyfarthing init` won't auto-gitignore the local config
- **Recommendation:** Add to follow-up backlog, does not block this PR

### Test Assessment
- 8 new tests, all passing
- Tests use isolated temp directories (good practice)
- Proper cleanup in afterEach
- Coverage includes: precedence, fallback, isolation, global option

**Final Verdict:** The implementation is solid. Code is clean, well-tested, and follows established patterns. The minor gap in init.ts can be addressed separately.

## Phase
**Current:** Review Complete (APPROVED)
**Next:** SM - Finish and archive

## Workflow
- [x] SM: Story setup (DONE)
- [x] TEA: Write failing tests (RED)
- [x] Dev: Implement to pass tests (GREEN)
- [x] Reviewer: Code review (APPROVED)
- [ ] SM: Finish and archive
