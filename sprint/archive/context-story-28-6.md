# Story 28-6: Multiple Image Support - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 28 - Image Paste & Screenshot Support |
| Points | 2 (trivial) |
| Priority | P2 |
| Repos | pennyfarthing (packages/cyclist) |
| Jira | MSSCI-59 |

**Description:** Allow attaching multiple images to a single message. Users can paste additional images to add to queue, see all thumbnails in preview area, remove individual images, and clear all.

## Current State

The groundwork is already laid. Stories 28-1 through 28-5 built a complete single-image pipeline:

- **editor.js** manages `pendingImages[]` array - already supports multiple images at the data layer
- **image-preview.js** has `updateImagePreview(images)` accepting an array - but `renderPreview()` only displays `images[0]`
- **Size validation** (28-5) enforces 5MB warn / 20MB max thresholds
- **CSS** uses `.image-preview-item` class designed for repetition

**The explicit marker at image-preview.js:204:**
```javascript
// Show first image (single image support for 28-1, multiple in 28-6)
```

## Technical Approach

This is a UI-only change. No backend or data structure changes needed.

### Phase 1: Render All Images
Modify `renderPreview()` in image-preview.js to loop over all images instead of just `images[0]`.

**Current (L203-206):**
```javascript
if (images.length > 0) {
  // Show first image (single image support for 28-1, multiple in 28-6)
  const img = images[0];
```

**Target:**
```javascript
images.forEach((img, index) => {
  // Render each image with its own thumbnail, label, and remove button
  // Pass index to handleRemoveClick
});
```

### Phase 2: Index-Aware Remove Buttons
Each remove button must capture the correct index. Use data attribute or closure:

```javascript
removeBtn.dataset.index = index;
removeBtn.addEventListener('click', () => handleRemoveClick(index));
```

### Phase 3: Clear All Button
Show "Clear All" button when 2+ images are pending:

```javascript
if (images.length >= 2) {
  const clearAllBtn = document.createElement('button');
  clearAllBtn.textContent = 'Clear All';
  clearAllBtn.addEventListener('click', () => {
    // Call clearPendingImages via callback
  });
}
```

### Phase 4: CSS Grid Layout
Update styles.css for multi-image layout:

```css
.image-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/editor/image-preview.js` | Loop over all images in renderPreview(), index-aware remove, Clear All button |
| `packages/cyclist/src/public/styles.css` | Grid/flex layout for multiple thumbnails, Clear All button styling |
| `packages/cyclist/src/public/js/editor.js` | Minor: expose clearPendingImages callback to preview module |

## Acceptance Criteria

- [ ] **AC1:** Multiple images can be attached (paste additional images to add to queue)
- [ ] **AC2:** All thumbnails visible in preview area
- [ ] **AC3:** Individual remove works (click X on any image removes just that one)
- [ ] **AC4:** Clear all option available (button appears when 2+ images)

## Testing Strategy

Create `packages/cyclist/tests/B-28-6-multiple-image.test.ts` following existing patterns:

**Test Cases:**
1. Paste second image adds to array (not replaces)
2. All images rendered as separate preview items
3. Remove button on image[1] removes only that image
4. Remove last image hides preview
5. Clear All button visible with 2+ images
6. Clear All button hidden with 1 image
7. Clear All removes all images and hides preview
8. Index stability after removal (remove middle image)
9. Large image warning styling preserved for each image
10. Payload includes all images on submit

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Off-by-one errors in index handling | Test removal of first, middle, last images |
| DOM not clearing properly on re-render | Clear container before rebuilding |
| CSS overflow with many images | Use flex-wrap with max-height and scroll |

## Patterns to Follow

Reference `message-queue.js` for multi-item rendering with individual controls. The pattern of `forEach` with index-captured event handlers is established there.

## Key Lines for Reference

| File | Lines | Purpose |
|------|-------|---------|
| image-preview.js | 195-251 | Current renderPreview() to modify |
| image-preview.js | 204 | Comment marking 28-6 extension point |
| editor.js | 224-229 | removePendingImage(index) already works |
| editor.js | 231-236 | clearPendingImages() exists |
| styles.css | 304-312 | .image-preview-item styling |
