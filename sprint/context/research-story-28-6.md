# Story 28-6: Multiple Image Support - Research Report

## Sprint Context

**Sprint:** 9  
**Goal:** Wire up orphaned code and add multimodal image support  
**Velocity Target:** 22 pts  
**Completed:** 38 pts / 76 pts (50%)

### Epic 28: Image Paste & Screenshot Support
- **Title:** Image Paste & Screenshot Support
- **Points:** 14 total
- **Priority:** P2
- **Status:** Planned
- **Completed Stories:** 28-1 (3 pts, DONE), 28-2 (2 pts, delivered in 28-1), 28-3 (2 pts, delivered in 28-1), 28-4 (3 pts, delivered in 28-1), 28-5 (2 pts, DONE)
- **Current Story:** 28-6 (2 pts, BACKLOG)
- **Remaining:** 28-6 (2 pts)

## Story 28-6 Details

**Story ID:** 28-6  
**Title:** Multiple image support  
**Points:** 2  
**Priority:** P2  
**Repos:** cyclist  
**Status:** backlog  
**Dependencies:** None (28-1 through 28-5 complete)

### Description
Allow attaching multiple images to a single message.
- Paste additional images to add to queue
- Show all thumbnails in preview area
- Remove individual images
- Clear all button

### Acceptance Criteria
- [ ] AC1: Multiple images can be attached
- [ ] AC2: All thumbnails visible
- [ ] AC3: Individual remove works
- [ ] AC4: Clear all option available

## Current Architecture

### File Structure

```
packages/cyclist/src/public/js/
├── editor.js                      (Main editor module, image state mgmt)
├── editor/
│   ├── image-preview.js          (Preview UI component)
│   ├── constants.js              (Configuration & limits)
│   ├── markdown.js               (Markdown conversion)
│   ├── toolbar.js                (Rich text toolbar)
│   ├── command-history.js        (Command history navigation)
│   ├── tab-completion.js         (Slash command completion)
│   └── message-queue.js          (Message queueing system)
└── ...other modules

packages/cyclist/src/public/
├── index.html                     (DOM structure)
└── styles.css                     (All styling)
```

### DOM Structure

**Image Preview Container (index.html:54)**
```html
<!-- 28-1: Image preview for clipboard paste -->
<div id="image-preview" class="image-preview hidden" aria-hidden="true"></div>
```

Located between `#quick-actions` (line 52) and `#editor-wrapper` (line 55).

### Current Single-Image Implementation

#### editor.js State (lines 95-96)
```javascript
/** Pending images waiting to be sent (Story 28-1) */
let pendingImages = [];
```

Currently supports array structure but renders only first image in preview.

#### Image Data Structure
```javascript
{
  dataUrl: string,              // base64 data URL
  mimeType: string,             // e.g., "image/png"
  filename: string,             // e.g., "image.png" or "Pasted Image.png"
  sizeBytes: number,            // file size in bytes (Story 28-5)
  isLarge: boolean,             // true if 5MB < size < 20MB (Story 28-5)
}
```

#### editor.js Key Functions

**handleImagePaste(clipboardData)** (lines 136-210)
- Finds first image in clipboard data
- Size validation (5MB warning, 20MB block)
- Converts to base64 via FileReader
- Creates imageData object
- **CURRENT:** Pushes to array, updates preview with `updateImagePreview(pendingImages)`
- **LIMITATION:** updateImagePreview only renders first image (image-preview.js:205)

**getPendingImages()** (lines 216-218)
```javascript
export function getPendingImages() {
  return [...pendingImages];
}
```

Returns copy of all pending images.

**removePendingImage(index)** (lines 224-229)
```javascript
export function removePendingImage(index) {
  if (index >= 0 && index < pendingImages.length) {
    pendingImages.splice(index, 1);
    updateImagePreview(pendingImages);
  }
}
```

Can remove by index, already supports multiple images at logic level.

#### image-preview.js Current Implementation

**renderPreview(images)** (lines 195-251)
- **LIMITATION:** Only renders `images[0]` (line 205)
- Creates single thumbnail, label, remove button
- Remove button calls `handleRemoveClick(0)` - hardcoded to index 0 (line 237)
- Comment at line 204 explicitly notes: "Show first image (single image support for 28-1, multiple in 28-6)"

**updateImagePreview(images)** (lines 69-82)
- Accepts array of images
- If empty, hides preview
- If not empty, calls renderPreview

**Key module exports:**
- `showImagePreview()` - Show container
- `hideImagePreview()` - Hide container
- `updateImagePreview(images)` - Update preview with images array
- `handleRemoveClick(index)` - Remove image callback
- `setOnImageRemoved(callback)` - Register remove handler
- `getThumbnailElement()` - Get first thumbnail (test helper)
- `getPreviewLabel()` - Get first image label
- `showImageSizeError(message)` - Show error message
- `formatFileSize(bytes)` - Format bytes for display (Story 28-5)

### CSS Structure for Single Image

**File:** packages/cyclist/src/public/styles.css

```css
.image-preview (line 294)
  - Flex container, padding, gap
  - Displays items in row

.image-preview.hidden (line 300)
  - display: none

.image-preview-item (line 304)
  - Flex container for thumbnail, label, remove button
  - gap: 8px
  - align-items: center

.image-preview-thumbnail (line 314)
  - img element styling
  - max-width: 64px (IMAGE_PREVIEW_SIZE)

.image-preview-label (line 323)
  - Filename display
  - font-size: 0.875rem

.image-preview-label-warning (line 365)
  - Color change for large images (Story 28-5)

.image-preview-item-warning (line 360)
  - Border styling for large images

.image-preview-remove (line 332)
  - Remove button styling
  - Content: "×"
  - cursor: pointer

.image-preview-error (line 369)
  - Error message styling
  - Red color

.image-preview-error::before (line 378)
  - "⚠️" icon
```

## Implementation Plan for Story 28-6

### Phase 1: Update image-preview.js Rendering

**Goal:** Display multiple thumbnails in preview area

**Changes needed:**

1. **renderPreview(images)** - Render all images, not just first
   - Loop through all images
   - Create thumbnail+label+remove for each with correct index
   - Fix handleRemoveClick index from hardcoded `0` to actual index
   - Store references to all elements (not just first)

2. **CSS Layout Update** - Switch from single-item row to grid/flex layout
   - `.image-preview-item` needs container wrapper
   - Create `.image-preview-items` grid container
   - Each item takes consistent space (60px thumbnail + 8px gap)
   - Wraps to next row when space limited

3. **getThumbnailElement()** - Update for multiple images
   - Currently returns first thumbnail only
   - Tests may need update to use specific index method
   - Consider adding `getThumbnailElements()` for all, keeping `getThumbnailElement()` for backward compat

4. **getPreviewLabel()** - Update for multiple images
   - Currently returns first image label only
   - Consider adding `getPreviewLabels()` for all

### Phase 2: Add Clear All Button

**Goal:** Provide button to remove all images at once

**Changes needed:**

1. **Add clearAllButton in renderPreview()**
   - Button labeled "Clear All"
   - Only shown if 2+ images attached
   - Click handler calls `clearPendingImages()` from editor.js

2. **Update CSS**
   - `.image-preview-clear-all-btn` styling
   - Positioned after all thumbnails or in corner
   - Visible only when multiple images

3. **New exports from image-preview.js**
   - `getClearAllButton()` - For testing
   - Already have `hideImagePreview()` which clears display

### Phase 3: Update Tests

**Create:** packages/cyclist/tests/28-6-multiple-image-paste.test.ts

**Test cases needed:**

1. **Multiple paste handling**
   - Paste two images in sequence, both visible
   - Paste three images, all thumbnails shown
   - Images can be mixed types (PNG, JPG, WebP)

2. **Individual removal**
   - Remove first image, others remain
   - Remove middle image, others remain
   - Remove last image, others remain
   - Remove by correct index (not just 0)

3. **Clear all button**
   - Visible when 2+ images
   - Hidden when 0-1 images
   - Clicking clears all pending images
   - Preview hides after clear

4. **Size validation with multiple**
   - One large image (warning) + one normal = both shown with warning on first
   - Mix of large and normal images
   - Clear all after size error

5. **Preview state management**
   - updateImagePreview with 3 images, all visible
   - removePendingImage(1) from editor.js, preview updates correctly
   - No memory leaks (old elements cleaned up)

### Phase 4: Edge Cases

**DOM update safety:**
- Container.innerHTML cleared before new render (already done, line 200)
- Element references reset (line 201-202, extend for all)

**Styling considerations:**
- Single image: looks good (current CSS)
- Two images: grid lays out side-by-side
- Four+ images: wraps to multiple rows
- Container has reasonable max-width to prevent overflow

**Accessibility:**
- aria-label per remove button with index
- Tab order correct through all remove buttons
- Remove button for each image has unique, descriptive label

## Related Code Patterns

### From editor.js - Message Queue Pattern (Similar structure)
File: packages/cyclist/src/public/js/editor/message-queue.js

Message queue has similar state management:
```javascript
// State
let messageQueue = [];

// Public API for batch operations
export function clearMessageQueue() { ... }
export function getMessageQueue() { return [...messageQueue]; }
export function removeFromQueue(index) { ... }

// Render only uses data, not stored DOM references
// (Each message rendered fresh when displayed)
```

This pattern works well for pending images too - just render from `pendingImages` array each time.

### From image-preview.js - Current Multi-image Array Support
The `currentImages` state (line 16) and `updateImagePreview(images)` parameter already assume array support. The implementation just wasn't completed (intentionally left for 28-6 per comment line 204).

## Testing Strategy

### Unit Tests (editor.js)
```javascript
// Tests already exist in 28-1 and 28-5 test files
// Verify:
describe('Multiple image pending state', () => {
  it('can add multiple images to pendingImages array', () => { ... })
  it('removePendingImage removes correct index', () => { ... })
  it('getPendingImages returns all pending images', () => { ... })
  it('clearPendingImages empties array', () => { ... })
})
```

### Integration Tests (image-preview.js)
```javascript
// New tests for 28-6
describe('28-6: Multiple Image Support', () => {
  it('renderPreview displays all images', () => { ... })
  it('each thumbnail has correct remove button with index', () => { ... })
  it('clear all button appears with 2+ images', () => { ... })
  it('clear all button hidden with 0-1 images', () => { ... })
  it('clicking remove on image 2 only removes image 2', () => { ... })
})
```

### Manual Testing
1. Paste image 1, verify thumbnail shown
2. Paste image 2, verify both thumbnails shown
3. Paste image 3, verify all three shown, grid layout looks good
4. Click X on middle image, verify other two remain
5. Click "Clear All", verify all gone and preview hidden
6. Paste one image, verify "Clear All" button NOT shown
7. Send message with 3 images, verify all sent correctly

## File Changes Summary

| File | Changes | Lines |
|------|---------|-------|
| `editor/image-preview.js` | Major rewrite of renderPreview(), add clearAllButton rendering | ~100 |
| `styles.css` | Add grid layout for `.image-preview-items`, `.image-preview-clear-all-btn` | ~20 |
| `tests/28-6-multiple-image-paste.test.ts` | NEW: 20+ test cases | ~300 |
| `editor.js` | Minor: Comment updates, possibly new helper exports | ~5 |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Remove button index off-by-one | Medium | High | Comprehensive index tests, verify each remove button captures correct index |
| CSS overflow with many images | Low | Medium | Limit visible area, make scrollable if needed, test with 5+ images |
| Memory leak from old DOM refs | Low | High | Always clear container.innerHTML before render, reset module refs |
| Tests fail due to happy-dom limitations | Medium | Medium | Use same test pattern as 28-1 tests, which pass; happy-dom supports querySelectorAll |

## Dependencies Satisfied

**Depends On:** None  
**Depended On By:** None

All predecessor stories (28-1 through 28-5) are complete and merged. Story 28-6 can start immediately.

## Key Learnings from Previous Stories

From **Story 28-1** summary:
- Event handler wiring must be tested (initial PR had dead code)
- FileReader async operations need error handling
- TipTap's editorProps pattern returns true to prevent default

From **Story 28-5** summary:
- Validation before expensive operations (size check before FileReader)
- Boundary testing critical (test at 5MB, 20MB + 1 byte over)
- CSS-based styling easier to maintain than inline styles

## Acceptance Criteria Mapping

| AC | Implementation | File | Test |
|----|----------------|------|------|
| AC1: Multiple images attachable | renderPreview loops all, handleRemoveClick uses index | image-preview.js | 28-6 test |
| AC2: All thumbnails visible | renderPreview creates image-preview-item per image | image-preview.js | 28-6 test |
| AC3: Individual remove works | Each remove button has data-index or closure with correct index | image-preview.js | 28-6 test |
| AC4: Clear all available | Clear all button rendered when 2+ images, clicks clearPendingImages | image-preview.js | 28-6 test |

## Out of Scope (Future Stories)

No stories after 28-6 in this epic. Image paste feature complete after 28-6.

---

**Document Generated:** 2026-01-12  
**Research Duration:** Complete sprint context + 5 prior stories analyzed
