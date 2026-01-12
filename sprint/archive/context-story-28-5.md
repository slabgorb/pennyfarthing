# Story 28-5: Image Size Validation & Resize - Technical Context

## Story Overview
- **Epic:** 28 (Image Paste & Screenshot Support)
- **Points:** 2 | **Priority:** P2
- **Repos:** cyclist
- **Branch:** `feat/28-5-image-size-validation`

## Current State

The image paste flow (28-1) currently has **no size validation**:

```
Paste Event → handleImagePaste() → fileToDataUrl() → pendingImages[] → Send to Claude
                                   ↑
                          No size check here!
```

**Problem:** Large images (10MB+) will:
1. Cause expensive base64 conversion (memory + CPU)
2. Potentially exceed Claude API limits
3. Slow down message submission
4. Provide no user feedback about the issue

## Technical Approach

### Validation Points

Add size validation in `editor.js:handleImagePaste()` at line ~161, **after** finding `imageFile` but **before** calling `fileToDataUrl()`:

```javascript
// After line 161: if (!imageFile) return false;

// Size validation (28-5)
const fileSizeBytes = imageFile.size;
if (fileSizeBytes > IMAGE_MAX_SIZE_BYTES) {
  console.warn(`Image too large: ${fileSizeBytes} bytes (max: ${IMAGE_MAX_SIZE_BYTES})`);
  // Show error feedback to user
  return false;
}

if (fileSizeBytes > IMAGE_WARN_SIZE_BYTES) {
  // Show warning but allow
  console.log(`Large image: ${fileSizeBytes} bytes`);
}
```

### Constants to Add (constants.js)

```javascript
// Image Size Limits (Story 28-5)
export const IMAGE_WARN_SIZE_BYTES = 5 * 1024 * 1024;  // 5MB - show warning
export const IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024;  // 20MB - block
```

### Preview Tooltip Enhancement (image-preview.js)

Show file size in preview tooltip:
- Format: "image.png (2.3 MB)"
- Use existing `filename` field, extend to include size

### Optional: Auto-Resize (Stretch Goal)

Canvas-based resize for images > 5MB:
```javascript
// Only if time permits - this is a stretch goal
async function resizeImage(file, maxDimension) {
  const img = new Image();
  // ... canvas resize logic
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `editor/constants.js` | Add `IMAGE_WARN_SIZE_BYTES`, `IMAGE_MAX_SIZE_BYTES` |
| `editor.js` | Add size validation in `handleImagePaste()`, add size to image object |
| `editor/image-preview.js` | Show file size in tooltip |
| `styles.css` | Style for warning state (optional) |

## Acceptance Criteria

- [ ] **AC1:** Warning for images > 5MB (console + visual indicator)
- [ ] **AC2:** Block images > 20MB with clear message
- [ ] **AC3:** Optional auto-resize to fit limits (stretch goal - skip if time-constrained)
- [ ] **AC4:** File size shown in preview tooltip

## Testing Strategy

1. **Unit tests:** Mock File objects with various sizes, verify validation logic
2. **Integration:** Paste real images of different sizes, verify behavior
3. **Edge cases:** Exactly at limits (5MB, 20MB), empty files, corrupted files

## Dependencies & Risks

- **Low risk:** Simple validation logic, no external dependencies
- **Claude API limits:** Claude's image size limit is ~20MB base64, so our 20MB limit aligns well
- **Auto-resize complexity:** Canvas resize is optional - core story can ship without it

## Notes

- The `imageFile.size` property is available from the File API and returns bytes
- Base64 encoding increases size by ~33%, so a 15MB file becomes ~20MB encoded
- Consider adding the size to `PastedImage` interface for downstream use
