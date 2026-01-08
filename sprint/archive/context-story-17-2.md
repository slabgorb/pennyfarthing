# Story 17-2: Fix Tab Panel Layout - Technical Context

## Story Overview
- **Epic:** 17 - Cyclist UX Improvements
- **Points:** 3
- **Priority:** P1
- **Repos:** cyclist (packages/cyclist/)
- **Scale:** Standard → TEA flow

## Current State

The tab panel (Files, Diffs tabs) has a layout bug:

**Working:**
- Panel starts collapsed by default (fixed in `3bd1dc11`)
- Collapse/expand toggle functions correctly
- Tab switching works properly

**Broken:**
- When expanded, the tab panel takes over the entire `#main-content` area
- The conversation/message view disappears completely
- Only the tab content (Files/Diffs) is visible

## Root Cause Analysis

The layout uses flexbox in `#main-content` (flex-direction: column):
```
#main-content
  ├── #message-view     (conversation area - should scroll)
  ├── #tab-panel        (Files/Diffs tabs - fixed height when expanded)
  └── #editor-wrapper   (input area - fixed height)
```

When the tab panel expands, its `.tab-content` likely has `flex: 1` or unbounded height, causing it to push the message view out of the viewport.

**Key CSS (styles.css L1647-1660):**
```css
.tab-content {
  flex: 1;
  max-height: 300px;
  min-height: 100px;
}
```

The issue is likely that `#message-view` lacks proper flex properties to maintain minimum height, or the parent container isn't constraining heights correctly.

## Technical Approach

1. **Fix the flex layout hierarchy:**
   - `#message-view` should have `flex: 1` and `min-height: 0` (for scroll)
   - `#tab-panel` should have `flex-shrink: 0` when expanded (fixed height)
   - Tab content max-height should be a percentage of viewport or parent

2. **Ensure proper height constraints:**
   - Tab panel expanded state: max 40% of `#main-content` height
   - Message view: fills remaining space, scrolls internally

3. **CSS changes primarily in `styles.css`:**
   - Update `.tab-panel` expanded state styles
   - Update `#message-view` flex properties
   - Possibly update `#main-content` to use `overflow: hidden`

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/styles.css` | Primary fix - flex layout for tab panel and message view |
| `packages/cyclist/src/public/index.html` | May need structure adjustments if CSS alone insufficient |

## Acceptance Criteria

- [ ] AC1: Tab panel expansion does not hide conversation view
- [ ] AC2: Both conversation and tab content visible simultaneously
- [ ] AC3: Panel has sensible default height (max 40% of viewport)
- [ ] AC4: Panel can be collapsed to minimize (already working)

## Testing Strategy

1. **Visual verification:**
   - Expand tab panel - conversation should remain visible above
   - Scroll conversation - should work independently of tab panel
   - Tab content should scroll within its bounded area

2. **Responsive behavior:**
   - Test with small viewport - both areas still usable
   - Test with large viewport - neither area over-expands

3. **Integration:**
   - All existing tab tests should pass
   - No regression in collapse/expand functionality

## Dependencies & Risks

**Dependencies:** None - this is a CSS/layout fix

**Risks:**
- May need to adjust message view scroll behavior
- Could affect editor wrapper positioning
- Browser flexbox quirks (Safari particularly)
