# Story 28-1: Clipboard Image Paste - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 28 (Image Paste & Screenshot Support) |
| Points | 3 |
| Priority | P1 |
| Repos | cyclist |
| Dependencies | None (foundation story) |

## Current State

Cyclist currently handles text-only input via the TipTap rich text editor (`packages/cyclist/src/public/js/editor.js`). The editor:
- Uses TipTap StarterKit with CodeBlock extension
- Handles key events (Enter to submit, Tab for completion, arrows for history)
- Converts content to Markdown via `jsonToMarkdown()` before sending to Claude
- Sends messages via `window.electronAPI.claude.send(markdown)`

The index.html structure has:
- `#editor` container (L68-95) for the TipTap instance
- `#quick-actions` div (L52) that could host image preview thumbnails
- Stats strip with contextual buttons (compact button as reference at L109)

## Technical Approach

### Architecture Decision: Editor Extension vs Standalone Handler

**Recommended: Extend editor.js** rather than creating separate input-handler.js

Rationale:
1. TipTap already has paste event handling infrastructure
2. The `handleKeyDown` pattern in `editorProps` extends naturally to `handlePaste`
3. Keeps image state co-located with text state for unified submit flow
4. Avoids coordination complexity between separate modules

### Implementation Strategy

1. **Add paste handler to TipTap editorProps** (editor.js)
   - Intercept paste events via `handlePaste` callback
   - Detect image data in `DataTransfer.items` or `clipboardData`
   - Extract as Blob, convert to base64 data URL
   - Store in module state (pending images array)

2. **Add image preview UI** (new: editor/image-preview.js)
   - Create thumbnail preview container in `#quick-actions` area
   - Display small preview (64x64 or similar) with X remove button
   - Show filename or "Screenshot" label
   - Update preview on image add/remove

3. **Modify submit flow** (editor.js)
   - Check for pending images before submit
   - If images present, include in message payload
   - Format for Claude's multimodal API (base64 with MIME type)
   - Clear image state after submit

### File Modifications

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/editor.js` | Add `handlePaste` to editorProps, image state management, modify `submitEditorContent()` |
| `packages/cyclist/src/public/js/editor/image-preview.js` | NEW - Preview UI component module |
| `packages/cyclist/src/public/js/editor/constants.js` | Add image-related constants (max size, supported types) |
| `packages/cyclist/src/public/index.html` | Add image preview container element in quick-actions area |

### Key Code Patterns to Follow

From editor.js (L216-299):
```javascript
editorProps: {
  handleKeyDown: (view, event) => { /* ... */ },
  // Add:
  handlePaste: (view, event, slice) => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        handleImagePaste(item);
        return true;
      }
    }
    return false; // Let TipTap handle text paste
  }
}
```

Image state pattern (following message-queue.js style):
```javascript
// State
let pendingImages = [];

// Public API
export function addPendingImage(dataUrl, filename) { /* ... */ }
export function removePendingImage(index) { /* ... */ }
export function clearPendingImages() { /* ... */ }
export function getPendingImages() { return [...pendingImages]; }
```

## Acceptance Criteria

- [ ] AC1: Cmd+V pastes clipboard images (from OS screenshot tools like Cmd+Shift+4)
- [ ] AC2: Works with images copied from browser (right-click copy image)
- [ ] AC3: Visual feedback on successful paste (thumbnail preview appears)
- [ ] AC4: Images can be removed before sending (X button on preview)

## Testing Strategy

### Unit Tests (Vitest)
- `handlePaste` correctly identifies image MIME types
- `handlePaste` ignores non-image clipboard data
- Image state management (add/remove/clear)
- Base64 conversion produces valid data URL

### Integration Tests
- Paste event with mock clipboard data triggers image handling
- Preview UI updates when images added/removed
- Submit includes image data in message payload
- Clear removes pending images

### Manual Testing
- Screenshot with Cmd+Shift+4, paste into Cyclist
- Copy image from browser, paste into Cyclist
- Multiple image paste (verify only first handled for this story)
- Remove image via X button, verify state cleared

## Dependencies & Risks

### Dependencies
- TipTap's paste handling API (well-documented, stable)
- Browser Clipboard API (widely supported)
- FileReader for Blob to base64 conversion

### Risks
| Risk | Mitigation |
|------|------------|
| Large images cause performance issues | Story 28-5 handles size validation (P2) |
| MIME type detection varies by browser | Test on Chrome/Safari/Firefox |
| Electron clipboard differs from browser | Use DataTransfer API which works in both |

## Out of Scope (Later Stories)

- File paste from Finder/Explorer (28-2)
- Preview before send with thumbnail (28-3 - basic preview in this story)
- Base64 encoding for API (28-4)
- Size validation and resize (28-5)
- Multiple image support (28-6)

This story focuses on the paste detection and basic preview. Full integration with Claude API is 28-4.
