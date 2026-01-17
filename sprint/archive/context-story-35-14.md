# Story 35-14: Settings Architecture Cleanup and Consolidation - Technical Context

## Story Overview
- **Epic:** 35 (Cyclist UI/UX Improvements)
- **Points:** 3
- **Priority:** P1
- **Repos:** cyclist
- **Workflow:** tdd
- **Blocks:** 35-8 (theme switcher integration)

## Current Architecture

### Three-Tier Settings System

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend UI (public/js/components/)                         │
│ ├── SettingsPanel.js (666 lines) - Main panel + IPC/HTTP   │
│ ├── SettingsForm.js (187 lines) - State container          │
│ └── SettingsSection.js (116 lines) - Collapsible sections  │
└─────────────────────────────────────────────────────────────┘
                              │
                    IPC-first / HTTP-fallback
                              │
┌─────────────────────────────────────────────────────────────┐
│ API Layer                                                    │
│ └── api/settings.ts (102 lines) - REST endpoints            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Backend Persistence                                          │
│ ├── settings.ts (500 lines) - File-based YAML persistence  │
│ └── settings-store.ts (480 lines) - Runtime state + grants │
└─────────────────────────────────────────────────────────────┘
```

## Issues to Address

### 1. Overlapping Responsibilities (settings.ts vs settings-store.ts)

**settings.ts handles:**
- File-based YAML persistence (~/.cyclist/settings.yaml)
- Cascading config (defaults → user → project)
- Validation, migration, file watching
- In-memory cache via `currentSettings`

**settings-store.ts handles:**
- Runtime state (verbose mode, approval gates)
- Permission grants (once/session/always)
- Command/path allowlists
- Persists only grants to ~/.cyclist/grants.json

**Issue:** Both files have their own in-memory state. `syncWithFileSettings()` exists (L214-225) but is a stub - no actual integration.

### 2. SettingsPanel.js Dead Code

**Identified issues:**
- `L45-51`: Module state variables may duplicate SettingsForm functionality
- `L141-160`: Dirty tracking reimplements SettingsForm.isDirty()
- `L512-526`: validate() only checks sidebar width - incomplete
- Multiple refactors left unused patterns

**Needs audit for:**
- Unused variables
- Duplicate logic with SettingsForm.js
- Inconsistent state management

### 3. IPC/HTTP Transport Inconsistencies

**SettingsPanel.js (L370-430):**
- loadViaIPC/loadViaHTTP have different error handling
- Error messages not user-friendly
- Retry logic exists but is incomplete

**ThemePicker.js (L69-83):**
- Similar dual-transport but different error handling
- Falls back silently - no user notification

### 4. State Management Inconsistencies

**Pattern 1 (SettingsPanel.js):**
- Module-level variables (L45-51)
- Manual dirty tracking via JSON.stringify

**Pattern 2 (SettingsForm.js):**
- Centralized formState object (L12-21)
- dot-notation field updates
- Built-in dirty tracking

**Issue:** SettingsPanel doesn't consistently use SettingsForm, reimplements some logic.

## Technical Approach

### Phase 1: Consolidate Backend (settings.ts / settings-store.ts)

1. **Clear separation:**
   - settings.ts = file-based persistent settings (user preferences)
   - settings-store.ts = session-scoped runtime state (grants, gates)

2. **Remove syncWithFileSettings() stub** or implement properly

3. **Document the boundary:**
   ```typescript
   // settings.ts - Persistent across sessions
   // - display preferences (fonts, sidebar, visibility)
   // - notification preferences
   // - workflow preferences (handoff_mode)
   // - pennyfarthing preferences (theme, favorites)

   // settings-store.ts - Session-scoped
   // - approval gates (bash, dangerous path)
   // - command/path allowlists
   // - permission grants (with file backup for "always" grants)
   // - verbose mode
   ```

### Phase 2: Clean Up SettingsPanel.js

1. **Remove dead code:**
   - Audit all module-level variables
   - Remove duplicate logic
   - Consolidate with SettingsForm.js

2. **Standardize state management:**
   - Use SettingsForm.js as single state container
   - Remove manual JSON.stringify dirty tracking

3. **Complete validation:**
   - Add validation for all settings fields
   - Show inline validation messages

### Phase 3: Standardize Transport Error Handling

1. **Create shared error handler:**
   ```javascript
   async function settingsRequest(ipcFn, httpFn, options) {
     if (isIPCAvailable()) {
       try { return await ipcFn(); }
       catch (e) { /* IPC error handling */ }
     }
     try { return await httpFn(); }
     catch (e) { /* HTTP error handling */ }
   }
   ```

2. **User-friendly error messages:**
   - "Failed to load settings. Using defaults."
   - "Failed to save. Retry or discard changes."

3. **Consistent retry behavior**

### Phase 4: Add Test Coverage

1. **settings.ts tests:**
   - Load cascade (defaults → user → project)
   - Validation rules
   - Migration logic

2. **settings-store.ts tests:**
   - Grant lifecycle (add → check → revoke)
   - Pattern matching (glob, domain, path)

3. **SettingsPanel.js tests:**
   - Open/close lifecycle
   - Dirty tracking
   - Save/cancel flows

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings.ts` | Document scope, remove stale comments |
| `packages/cyclist/src/settings-store.ts` | Remove/implement syncWithFileSettings |
| `packages/cyclist/src/public/js/components/SettingsPanel.js` | Dead code removal, consolidate with SettingsForm |
| `packages/cyclist/src/public/js/components/SettingsForm.js` | Ensure used consistently |
| `packages/cyclist/tests/settings.test.ts` | Add/expand test coverage |
| `packages/cyclist/tests/settings-panel.test.js` | Add UI component tests |

## Acceptance Criteria

- [ ] settings.ts is single source of truth for file-based settings
- [ ] settings-store.ts only handles runtime state (grants, gates)
- [ ] No dead code or unused variables in settings components
- [ ] IPC/HTTP transport has consistent error handling with user feedback
- [ ] State flows are documented and testable
- [ ] Test coverage for settings load/save/validate paths

## Testing Strategy (TDD)

This is a TDD workflow - write tests first:

1. **Backend tests first:**
   - Test settings.ts load cascade
   - Test settings-store.ts grant lifecycle
   - Test validation rules

2. **Then refactor:**
   - Clean up code to pass tests
   - Remove dead code
   - Consolidate patterns

3. **UI tests:**
   - Test SettingsPanel state transitions
   - Test error handling paths

## Dependencies & Risks

- **Medium risk:** Consolidation may break existing functionality - need comprehensive tests first
- **Low risk:** Dead code removal is safe with test coverage
- **Blocking:** This must complete before 35-8 (theme switcher integration)
