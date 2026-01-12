# Story 24-4: Fix diff panel state management and Combined view indicator

**Created:** 2026-01-12
**Author:** The Mad Hatter (SM)
**Sprint:** 9
**Points:** 2 (trivial - UX fixes)

---

## Story Overview

| Field | Value |
|-------|-------|
| **Story ID** | 24-4 |
| **Title** | Fix diff panel state management and Combined view indicator |
| **Points** | 2 |
| **Priority** | P2 |
| **Repos** | cyclist |
| **Epic** | 24 (Configuration & Theme Switcher Panels) |
| **Status** | in_progress |

**Description:** Fix three UX bugs in the diff panel from story 24-3:
1. Combined mode shows confusing "Edit 1 of 3" indicator with active arrows
2. File list doesn't clear when git status is clean (regression)
3. Clear button doesn't clear the file list

---

## Current State Analysis

### Bug 1: Combined Mode Indicator

**Location:** `ChangedFilesList.js:117-139` (updateNavigationUI function)

**Current behavior:**
- When `currentViewMode === 'combined'`, the indicator still shows position ("Edit 1 of 3")
- Navigation arrows remain enabled even though Combined mode shows ALL diffs at once
- User thinks they're only seeing 1 edit

**Root cause:** `updateNavigationUI()` doesn't check `currentViewMode` - it only checks if there are multiple diffs.

**Fix needed:** When `currentViewMode === 'combined'`:
- Show "All edits" or similar text instead of "Edit N of M"
- Disable or hide prev/next navigation arrows
- Keep the nav bar visible (to show view mode toggle) but update indicator text

### Bug 2: File List Not Clearing When Not Dirty (Regression)

**Expected behavior:** When git status shows no uncommitted changes, the ChangedFilesList should be empty.

**Current behavior:** The file list retains stale entries from previous edits even after commits.

**Root cause investigation needed:**
- `git-commit-detector.js` detects commits and calls `DiffViewer.removeDiffsForFiles()`
- `DiffViewer.removeDiffsForFiles()` notifies `ChangedFilesList.handleDiffsRemoved()`
- But if ALL files are committed, `handleDiffsRemoved` may not be called correctly

**Relevant files:**
- `git-commit-detector.js:112` - clears `pendingCommits`
- `DiffViewer.js:157-188` - `removeDiffsForFiles()` function
- `ChangedFilesList.js:285-304` - `handleDiffsRemoved()` function

### Bug 3: Clear Button Not Clearing File List

**Location:** `controls.js:83-123` (clearSession function)

**Current behavior:**
- `clearSession()` calls `resetDiffPanel()` (line 113)
- But it does NOT call `ChangedFilesList.clear()`

**Fix needed:** Add call to clear ChangedFilesList in clearSession:
```javascript
import { clear as clearChangedFiles } from './components/ChangedFilesList.js';
// ...
clearChangedFiles();
```

Also need to ensure DiffViewer.clearDiffs() is called to reset the underlying data.

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/cyclist/src/public/js/components/ChangedFilesList.js` | Fix updateNavigationUI for combined mode |
| `packages/cyclist/src/public/js/controls.js` | Add ChangedFilesList.clear() and DiffViewer.clearDiffs() to clearSession |

---

## Technical Approach

### Fix 1: Combined Mode Indicator (ChangedFilesList.js)

Update `updateNavigationUI()` to handle combined mode:

```javascript
function updateNavigationUI() {
  if (!navBar || !selectedFilePath) {
    if (navBar) navBar.classList.remove('visible');
    return;
  }

  const history = fileHistories.get(selectedFilePath);
  if (!history || history.diffs.length <= 1) {
    navBar.classList.remove('visible');
    return;
  }

  // Show nav bar for multiple edits
  navBar.classList.add('visible');

  // NEW: Handle combined mode differently
  if (currentViewMode === 'combined') {
    // In combined mode, all edits are shown at once
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (indicatorEl) indicatorEl.textContent = `All ${history.diffs.length} edits`;
  } else {
    // Partial mode - show navigation
    if (prevBtn) prevBtn.disabled = !hasPrevious(history);
    if (nextBtn) nextBtn.disabled = !hasNext(history);
    if (indicatorEl) indicatorEl.textContent = getPositionIndicator(history);
  }
}
```

### Fix 2: Clear Button (controls.js)

Add imports and calls:

```javascript
import { clear as clearChangedFiles } from './components/ChangedFilesList.js';
import { clearDiffs } from './components/DiffViewer.js';

// In clearSession():
clearChangedFiles();
clearDiffs();
```

### Fix 3: Verify Git Commit Detection

The regression may be that `git-commit-detector.js` isn't detecting all committed files. Need to verify:
1. Does `removeDiffsForFiles` get called with all committed paths?
2. Does `handleDiffsRemoved` properly clear when no files remain?

Looking at `handleDiffsRemoved`:
```javascript
export function handleDiffsRemoved(removedPaths) {
  // Check if currently selected file was removed
  if (selectedFilePath && removedPaths.includes(selectedFilePath)) {
    const fileChanges = getFileChanges();
    const remainingPaths = Object.keys(fileChanges);
    // ...
  }
  render();
}
```

The issue: `getFileChanges()` queries `DiffViewer.getDiffs()`, so if DiffViewer was properly cleared, this should work. Need to trace the exact flow.

---

## Acceptance Criteria

- [ ] In Combined mode, indicator shows "All X edits" instead of "Edit N of M"
- [ ] In Combined mode, navigation arrows are disabled
- [ ] In Partial mode, current behavior preserved (Edit 1 of 3, etc.)
- [ ] Visual state clearly distinguishes Combined vs Partial mode
- [ ] File list clears when git status shows no dirty files
- [ ] File list clears when Clear button is clicked
- [ ] No stale file entries persist after state changes

---

## Testing Strategy

### Manual Tests
1. Make 3+ edits to same file
2. Toggle between Partial and Combined views
3. Verify indicator text changes appropriately
4. Verify arrows disabled in Combined mode
5. Click Clear button - verify file list empties
6. Make edits, commit all - verify file list empties

### Automated Tests (optional for 2pt story)
- Test `updateNavigationUI` with combined mode
- Test `clearSession` clears all state

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Circular imports | Use dynamic import or restructure exports |
| Git detection edge cases | Manual testing with real git operations |

---

## Routing

**Scale:** 2 points (trivial UX fixes)
**Route:** SM -> Dev (skip TEA - no complex logic to test-first)

---

*"The time has come to fix these buttons!" - The Mad Hatter*
