# Story MSSCI-12274: Support images in queued messages via base64 encoding

## Story Details
- **ID:** MSSCI-12274
- **Workflow:** tdd
- **Status:** setup

## Workflow Tracking
**Workflow:** tdd
**Phase:** green
**Phase Started:** 2026-01-22T17:54:46Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-22T18:45:00Z | 2026-01-22T18:45:00Z | 0m |
| test | 2026-01-22T18:45:00Z | 2026-01-22T18:18:00Z | 33m |
| green | 2026-01-22T18:18:00Z | 2026-01-22T17:28:51Z | 49m |
| review | 2026-01-22T17:28:51Z | 2026-01-22T17:54:46Z | 25m |

## Story Context
See: context-story-MSSCI-12274.md

## Acceptance Criteria
- [ ] AC1: QueuedMessage interface defined with text and images properties
- [ ] AC2: queueMessage() accepts message objects with images array
- [ ] AC3: dequeueMessage() returns full message object including images
- [ ] AC4: Existing string-based queues migrate transparently on load
- [ ] AC5: processNextInQueue() passes images to submit callback
- [ ] AC6: All existing message queue tests continue to pass
- [ ] AC7: New tests cover queued images and migration scenarios

## Key Files
- `packages/cyclist/src/public/js/editor/constants.js` - Add QueuedMessage typedef
- `packages/cyclist/src/public/js/editor/message-queue.js` - Update queue functions
- `packages/cyclist/tests/17-1-message-queue.test.ts` - Add image tests
- `packages/cyclist/src/public/js/editor.js` - Update submit callback

## TEA Assessment

**Tests Required:** Yes
**Reason:** New functionality - queue must support message objects with images array

**Test Files:**
- `packages/cyclist/tests/MSSCI-12274-image-queue.test.ts` - 19 tests covering all ACs

**Tests Written:** 19 tests covering 6 ACs (AC1-AC5, AC7)
**Status:** RED (17 failing - ready for Dev)

**Test Categories:**
- AC1: QueuedMessage interface (2 tests)
- AC2: queueMessage with images (4 tests)
- AC3: dequeueMessage returns objects (3 tests)
- AC4: Legacy migration (3 tests)
- AC5: processNextInQueue with images (2 tests)
- AC7: Edge cases (5 tests)

**Implementation Notes for Dev:**
1. `queueMessage()` needs to handle both string and object input
2. Normalize strings to `{text: string, images: []}` internally
3. `loadMessageQueue()` must detect and migrate legacy `string[]` format
4. `processNextInQueue()` must pass images to submit callback

**Handoff:** To Dev (Ponder Stibbons) for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/public/js/editor/constants.js` - Added QueuedMessage/PastedImage typedefs
- `packages/cyclist/src/public/js/editor/message-queue.js` - Updated all queue functions
- `packages/cyclist/src/public/js/editor.js` - Export initMessageQueue
- `packages/cyclist/tests/17-1-message-queue.test.ts` - Updated for new format

**Tests:** 45/45 passing (GREEN)
- 19 new tests (MSSCI-12274-image-queue.test.ts)
- 26 existing tests (17-1-message-queue.test.ts)

**PR:** #444 - feat(cyclist): support images in queued messages (MSSCI-12274)
**Branch:** feat/MSSCI-12274-image-queue-support (pushed)

**Handoff:** To Reviewer (Granny Weatherwax) for code review

## Reviewer Assessment

**PR:** #444
**Verdict:** REJECTED

**Code Review Evidence:**

### Data Flow Traced

I traced the user input path from image paste to queue to submission:

1. **Image paste** → `pendingImages` array at `editor.js:209`
2. **User submits while Claude processing** → `submitEditorContent()` at `editor.js:584`
3. **Queueing logic** → `queueMessage(markdown)` at `editor.js:594`
4. **Queue storage** → `messageQueue.push(normalized)` at `message-queue.js:180`
5. **Queue processing** → `submitFn(nextMessage.text, nextMessage.images)` at `message-queue.js:239`

**CRITICAL WIRING FAILURE FOUND:**

- At step 3, only `markdown` (text) is passed to `queueMessage()`. The `pendingImages` array is **never captured or included**.
- At step 5, `submitFn` is called with `(text, images)`, but `submitEditorContent()` is defined with **no parameters** at `editor.js:584`.

**Issues Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [CRITICAL] | Images not captured when queueing - `pendingImages` is never passed to `queueMessage()` | `editor.js:594` | Change `queueMessage(markdown)` to `queueMessage({ text: markdown, images: [...pendingImages] })` |
| [CRITICAL] | Submit callback ignores image parameter - `submitEditorContent()` takes no args, discards images from queue | `editor.js:584` | Add optional `(passedText, passedImages)` parameters to `submitEditorContent()`, use them when provided |
| [HIGH] | Pending images not cleared after queueing - stale images may attach to wrong message | `editor.js:597-602` | Add `clearPendingImages()` after successful queue |
| [MEDIUM] | AC5 test doesn't verify images - test captures `submitCall` but never asserts images were passed | `MSSCI-12274-image-queue.test.ts:320-325` | Add assertion: `expect(submitCall).toEqual(['Message with images for submit', [TEST_IMAGE, TEST_IMAGE_2]])` |

**Blocking Issues:** 2 Critical, 1 High
**Non-Blocking Issues:** 1 Medium

**What Passed:**
- Queue module (`message-queue.js`) correctly stores and retrieves QueuedMessage objects
- Legacy migration (`migrateQueueItem`) properly converts string[] to QueuedMessage[]
- Type definitions in `constants.js` are correct
- 45/45 unit tests pass (but tests are incomplete - they test in isolation, not end-to-end wiring)

**The Core Problem:**

The queue CAN store images. Nothing PUTS images into the queue. The queue CAN pass images to submit. Submit IGNORES them.

The plumbing is installed but not connected. Tests pass because they test each pipe individually. A real user pasting an image while Claude is processing will have their image silently dropped.

**Handoff:** Back to Dev (Ponder Stibbons) for fixes

## Dev Assessment (Round 2)

**Fixes Complete:** Yes - All issues from code review addressed

**Issues Fixed:**

| Severity | Issue | Fix Applied |
|----------|-------|-------------|
| [CRITICAL] | Images not captured when queueing | Changed `queueMessage(markdown)` to `queueMessage({ text: markdown, images: images })` at `editor.js:601` |
| [CRITICAL] | Submit callback ignores image parameter | Added `(passedText, passedImages)` parameters to `submitEditorContent()`, uses them when provided from queue |
| [HIGH] | Pending images not cleared after queueing | Added `clearPendingImages()` at `editor.js:603` after successful queue |
| [MEDIUM] | AC5 test doesn't verify images | Added explicit assertions verifying text and images are passed to submit callback |

**Files Changed:**
- `packages/cyclist/src/public/js/editor.js` - Wired image capture to queue, made submit accept passed images
- `packages/cyclist/tests/MSSCI-12274-image-queue.test.ts` - Strengthened AC5 test assertions

**Tests:** 45/45 passing (GREEN)
- 19 new tests (MSSCI-12274-image-queue.test.ts) - including strengthened AC5 tests
- 26 existing tests (17-1-message-queue.test.ts)

**PR:** #444 - feat(cyclist): support images in queued messages (MSSCI-12274)
**Branch:** feat/MSSCI-12274-image-queue-support (pushed with fix commit)

**Data Flow Now Correct:**
1. User pastes image → `pendingImages` array
2. User submits while Claude processing → `submitEditorContent()`
3. `isProcessing()` true → `queueMessage({ text: markdown, images: [...pendingImages] })` ✓
4. `clearPendingImages()` clears after queue ✓
5. Later: `processNextInQueue()` → `submitFn(text, images)` → `submitEditorContent(text, images)` ✓
6. Function uses passed values, images flow to Claude ✓

**Handoff:** To Reviewer (Granny Weatherwax) for re-review

## Reviewer Assessment (Round 2)

**PR:** #444
**Verdict:** APPROVED

**Code Review Evidence:**

### Data Flow Traced (Re-verification)

I traced the complete data flow from image paste to Claude submission:

1. **Image paste** → `pendingImages` array at `editor.js:209`
2. **User submits while Claude processing** → `submitEditorContent()` at `editor.js:586`
3. **Images captured** → `const images = passedImages ?? [...pendingImages]` at `editor.js:591` ✓
4. **Queueing with images** → `queueMessage({ text: markdown, images: images })` at `editor.js:598` ✓
5. **Pending images cleared** → `clearPendingImages()` at `editor.js:601` ✓
6. **Queue storage** → `messageQueue.push(normalized)` at `message-queue.js:180`
7. **Queue processing** → `submitFn(nextMessage.text, nextMessage.images)` at `message-queue.js:239`
8. **Submit accepts params** → `submitEditorContent(passedText, passedImages)` at `editor.js:586` ✓
9. **Passed values used** → `const markdown = passedText ?? getEditorMarkdown()` at `editor.js:590` ✓
10. **Images sent to Claude** → `window.electronAPI.claude.send(markdown, images)` at `editor.js:640` ✓

**All four previous issues verified FIXED:**

| Issue | Status | Verification |
|-------|--------|--------------|
| [CRITICAL] Images not captured when queueing | ✅ FIXED | Line 598: `queueMessage({ text: markdown, images: images })` |
| [CRITICAL] Submit callback ignores images | ✅ FIXED | Line 586: `submitEditorContent(passedText, passedImages)` + lines 590-591 use them |
| [HIGH] Pending images not cleared after queue | ✅ FIXED | Line 601: `clearPendingImages()` after successful queue |
| [MEDIUM] AC5 test doesn't verify images | ✅ FIXED | Lines 320-329: Explicit assertions on text and images |

**Pattern Observed:**

The nullish coalescing pattern at `editor.js:590-591` correctly distinguishes between:
- Direct user input (`passedText === undefined`) → uses `getEditorMarkdown()` and `pendingImages`
- Queue replay (`passedText !== undefined`) → uses passed values

This pattern also correctly gates other side effects (history, clear editor) using the same check at lines 611, 621, 646, 651.

**Security:** N/A - no auth changes. Base64 images stored in localStorage are client-side only.

**Performance:** `settings-sync.js:169-175` skips redundant localStorage writes when value unchanged. MAX_QUEUE_SIZE=10 enforced at `message-queue.js:176`.

**Error Handling:** `settings-sync.js:180-185` gracefully handles localStorage quota exceeded errors - warns but continues with in-memory queue.

**Non-Blocking Observations:**

- [LOW] `normalizeMessage()` at `message-queue.js:31` uses `message.text !== undefined` which would pass `null` through. Line 32 then handles `(message.text || '').trim()` which converts `null` to `''`. This works but is slightly indirect.

**Handoff:** To SM (Captain Carrot) for finish-story workflow

## SM Manual Testing - FAILED

**Tested by:** Captain Carrot (SM)
**Date:** 2026-01-22

### Bugs Found in Manual Testing

| Bug | Severity | Description |
|-----|----------|-------------|
| Image/text split | CRITICAL | When queueing a message with text + image, they split into separate queue entries. Image queues alone, text stays in editor. |
| Queue becomes unusable | CRITICAL | After the split occurs, queue stops accepting any messages (text-only messages fail to queue). |
| Images not reaching Claude | HIGH | Queued images are not being sent to Claude - they "pop" separately without being visible to the model. |

### Reproduction Steps
1. While Claude is processing, paste an image and type text
2. Submit (should queue)
3. Observe: Image shows in QUEUED area, text remains in editor
4. When queue processes, image sends alone
5. Queue then fails to accept further messages

### Root Cause Hypothesis
The queueMessage() call at editor.js:598 appears correct, but something in the queue rendering or storage is splitting the message object apart, or there's a race condition between image capture and text capture.

**FINISH REJECTED** - Returning to Dev for fixes.

## Session Log
- SM: Story setup complete - branch created, Jira claimed, session initialized
- TEA: Tests written and committed - 17/19 failing (RED state confirmed)
- Dev: Implementation complete, all 45 tests GREEN, PR #444 created
- Reviewer: REJECTED - Critical wiring failures found. Images are never captured into queue, and submit callback ignores passed images.
- Dev: Fixes complete - wired image queue to editor submission flow, strengthened tests
- Reviewer: APPROVED - All four issues verified fixed. Data flow traced end-to-end. Plumbing is now properly connected.
- SM: FINISH REJECTED - Manual testing revealed critical bugs: image/text split on queue, queue becomes unusable after split.

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| review (Reviewer) | green (Dev) | approval | PASSED | 2026-01-22T17:28:51Z |
| review (Reviewer) | finish (SM) | approval | PASSED | 2026-01-22T17:54:46Z |
