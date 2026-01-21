# Story MSSCI-11944: Event-driven badge updates

## Story Details
- **ID:** MSSCI-11944
- **Workflow:** tdd

## Workflow Tracking
**Workflow:** tdd
**Phase:** implementation
**Phase Started:** 2026-01-20T11:17:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-20T10:58:56Z | 2026-01-20T10:59:39Z | 1m |
| testing | 2026-01-20T10:59:39Z | 2026-01-20T11:15:00Z | 15m |
| implementation | 2026-01-20T11:17:00Z | | |

### Handoff History
| From | To | Gate | Status |
|------|----|----|--------|
| testing (TEA) | implementation (Dev) | tests_fail | PASSED |

## TEA Assessment

**Tests Required:** Yes
**Test File:** `packages/cyclist/tests/MSSCI-11944-event-driven-badges.test.ts`

**Tests Written:** 18 tests covering 4 ACs
- AC1: PanelManager emits badge-changed event (6 tests)
- AC2: tab-bar.js subscribes to event (3 tests)
- AC3: No 500ms setInterval polling (4 tests)
- AC4: Badges update immediately (3 tests)
- Integration (2 tests)

**Status:** RED (13 failing, 5 passing)

**Files to Modify:**
- `packages/cyclist/src/public/js/panel-manager.js` - Add `updateBadgeCount()`, emit `badge-changed`
- `packages/cyclist/src/public/js/tab-bar.js` - Subscribe to event, remove `setInterval`

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/panel-manager.js` - Added `updateBadgeCount(panelId, count)` function with change detection, emits `badge-changed` event, added `getBadgeCount()` helper, updated default export
- `packages/cyclist/src/public/js/tab-bar.js` - Subscribed to `badge-changed` event in `init()`, removed `badgeUpdateInterval` variable and `setInterval` polling, simplified `destroy()` function

**Tests:** 18/18 passing (GREEN)
**PR:** #367 - feat(cyclist): implement event-driven badge updates (MSSCI-11944)
**Branch:** feat/MSSCI-11944-event-driven-badge-updates (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED ✅

**Tests:** 18/18 passing
**Security:** No issues - textContent used (no XSS), no user input vectors
**Performance:** Excellent - 500ms polling eliminated, change detection prevents redundant events

**Critical Analysis:**
- Clean event-driven architecture following existing `emit`/`on` patterns
- JSDoc documentation comprehensive with `@emits` tag
- Edge case handling: null guards, change detection

**Note:** This is an **infrastructure story**. The `updateBadgeCount()` API is defined and tested, but existing panels still use the old `getBadgeCount` callback pattern. A follow-up story will be needed to wire panels to call the new API.

**Handoff:** To SM (The Mad Hatter) to finish story
