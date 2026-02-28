> **ARCHIVED** (2026-02-28): The regex-based detection system described here was replaced by
> CYCLIST marker-only detection (PR #200, 2026-01-12). All 6 recommendations are moot.
> See `useMarkerActions.ts` and `QuickActions.tsx` for current implementation.

---

# Quick Actions Detection Audit

**Story:** 25-1 - Audit Current Quick Actions Detection
**Epic:** 25 - Smart Question Detection & Quick Actions
**Date:** 2026-01-11
**Author:** Dev (White Rabbit)

## Overview

This document audits the current quick actions detection system in Cyclist, identifying all detection patterns, cataloging known false positives and missed patterns, and providing prioritized recommendations for improvement.

**Source Files:**
- `packages/cyclist/src/public/js/components/message-view/quick-actions.js` (390 lines)
- `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` (737 lines)

---

## AC1: Current Detection Patterns

### Yes/No Question Patterns (12 total patterns)

The system uses regex-based pattern matching against the **last paragraph** of assistant messages. Patterns fall into two categories:

#### Direct Action Offers (4 patterns, no question mark required)

| Pattern | Regex | Responses | Example |
|---------|-------|-----------|---------|
| Would you like me to | `/would you like me to/i` | Yes, proceed / No | "Would you like me to create this file?" |
| Shall I proceed | `/shall i (proceed\|continue\|go ahead\|start\|begin)/i` | Yes, proceed / No | "Shall I proceed with the refactoring?" |
| Ready to proceed | `/ready to proceed/i` | Yes, proceed / Hold on | "Ready to proceed?" |
| Want me to proceed | `/want me to (proceed\|continue\|go ahead\|start\|begin)/i` | Yes, proceed / No | "Do you want me to continue?" |

#### Yes/No Questions (3 patterns, requires "?" at end)

| Pattern | Regex | Responses | Example |
|---------|-------|-----------|---------|
| Should I | `/should i\b/i` | Yes / No | "Should I delete this file?" |
| Do you want | `/do you want/i` | Yes / No | "Do you want me to run tests?" |
| Shall I (generic) | `/shall i\b/i` | Yes / No | "Shall I add logging?" |

#### Permission Prompts (4 patterns, no question mark required)

| Pattern | Regex | Responses | Example |
|---------|-------|-----------|---------|
| Allow to run/execute | `/allow.*to\s+(run\|execute)/i` | Yes / No | "Allow Claude to run this command?" |
| Allow to read | `/allow.*to\s+read/i` | Yes / No | "Allow access to read the file?" |
| Allow to write | `/allow.*to\s+write/i` | Yes / No | "Allow Claude to write to this file?" |
| Allow to edit | `/allow.*to\s+edit/i` | Yes / No | "Allow Claude to edit src/main.ts?" |

### Numbered List Detection

The system detects numbered choices using three pattern variants:

| Format | Regex | Example |
|--------|-------|---------|
| Standard | `/^\s*(\d+)\.\s+(.+)$/gm` | `1. Create new component` |
| Parenthesis | `/^\s*(\d+)\)\s+(.+)$/gm` | `1) Create new component` |
| Bold | `/\*\*(\d+)[\.\)]\*\*\s*(.+)/gm` | `**1.** Create new component` |

#### List Detection Requirements

1. **Minimum 2 choices** - Single items rejected
2. **Sequential from 1** - Lists starting at other numbers rejected
3. **Choice context required** - Must contain keywords: "which", "choose", "select", "pick", "option", "prefer", "would you like", "do you want", "should i", "approach", "alternative", "either", "or we could"

#### List False Positive Prevention

Current `notChoiceIndicators` that reject lists:
- **Past tense verbs:** read, analyzed, made, wrote, created, added, removed, fixed, updated, changed, modified, implemented, completed, finished, found, discovered, identified, checked, verified, confirmed
- **Present continuous:** reading, analyzing, making, writing, creating, adding
- **Descriptive words:** the, this, a, an, it, when, if, for, with
- **File references:** src/, ./, ../, file:, line
- **File extensions:** .js, .ts, .md, .json, .yaml, .go, .py, .sh

### Text Processing

Before detection:
1. **Code blocks stripped:** `text.replace(/```[\s\S]*?```/g, '')`
2. **Last paragraph extracted:** Split by double newlines, take last non-empty
3. **Question mark check:** For patterns requiring `?`, validates `trimEnd().endsWith('?')`

---

## AC2: False Positive Examples

### Known False Positives (Currently Triggering)

#### 1. Enumeration Lists with Choice Keywords

**Problem:** Lists that enumerate findings but happen to contain a choice keyword.

```
Here are the issues I found. Which would you like addressed first?

1. The database connection is slow
2. The API returns 500 errors
3. The UI has rendering bugs
```

**Why it triggers:** Contains "which" keyword + numbered list starting from 1.

**Why it's wrong:** These are findings being reported, not options for the user to select.

#### 2. Long Documentation Lists

**Problem:** Documentation that happens to be numbered.

```
The approach I recommend involves these changes:

1. Update the config file
2. Modify the API endpoint
3. Add error handling
4. Write tests
5. Update documentation
6. Deploy to staging
```

**Why it triggers:** Contains "approach" keyword + sequential numbered items.

**Why it's wrong:** This is a task list/plan, not a multiple-choice question.

#### 3. Steps Already Taken

**Problem:** Past-tense lists that slip through filters.

```
Here's what I did:

1. Examined the code
2. Found the bug
3. Applied the fix
```

**Why it triggers:** If past-tense words aren't in the first position, filter misses them. "Examined" vs "Read" - only "Read" is in the blocklist.

#### 4. File Listing Results

**Problem:** When Claude lists files found.

```
I found these matching files:

1. src/utils/helpers.ts
2. src/utils/format.ts
3. src/utils/validate.ts
```

**Why it triggers:** File paths are only blocked if they're the ENTIRE item text matching a specific extension regex.

#### 5. Rhetorical Questions Without User Action

**Problem:** Questions that don't actually need a response.

```
Interesting, isn't it? Should I explain more about how this works?
```

**Why it triggers:** "Should I" pattern matches.

**Why it's wrong:** "Isn't it?" is rhetorical, and the second question is offering information, not requesting action.

---

## AC3: Missed Pattern Examples

### Patterns NOT Currently Detected

#### 1. Agent Handoff Commands

**Example messages that should trigger buttons:**

```
Tests are ready. Invoke /reviewer to continue.
```
**Expected button:** `/reviewer`

```
Implementation complete. Start /reviewer when ready.
```
**Expected button:** `/reviewer`

```
Context is at 75%. Start a fresh session with /dev.
```
**Expected button:** `/dev`

**Why missed:** No patterns exist for `invoke`, `run`, `start`, or `use` followed by `/command`.

#### 2. Confirmation Variants Not Covered

```
Let me know when you're ready to proceed.
```
**Expected:** Yes, proceed / Not yet

```
Tell me when to continue.
```
**Expected:** Continue / Wait

```
Say 'yes' to confirm.
```
**Expected:** yes

**Why missed:** These don't match existing regex patterns.

#### 3. Either/Or Questions Without Lists

```
Should I use TypeScript or JavaScript for this?
```
**Expected:** TypeScript / JavaScript

```
Do you prefer async/await or Promises?
```
**Expected:** async/await / Promises

**Why missed:** No extraction of choices from inline either/or phrasing.

#### 4. Multi-Step Confirmation

```
I'll need to:
1. Delete the old file
2. Create a new one
3. Update references

Proceed with all steps?
```
**Expected:** Yes, proceed / No (NOT buttons for 1, 2, 3)

**Why missed:** List detection wins over question detection, even when the question is clearly the prompt.

#### 5. Continue/Stop Patterns

```
I've completed the first batch. Continue with the remaining items?
```
**Expected:** Continue / Stop

```
That's done. Shall I move on to the next task?
```
**Expected:** Yes, proceed / No

**Why missed:** "Continue with" and "move on to" not in patterns.

#### 6. Tool Permission Variants

```
This will modify package.json. OK to proceed?
```
**Expected:** OK / Cancel

```
I need to install dependencies. Allow?
```
**Expected:** Allow / Deny

**Why missed:** Only "allow ... to (verb)" pattern exists.

---

## AC4: Recommendations for Fixes

### Priority 1: High Value, Low Risk

#### 1.1 Add Enumeration Detection Heuristics (Story 25-2)

**Problem:** Lists of findings trigger as choices.

**Solution:**
```javascript
// Add to detectListChoices():

// Reject if preceded by enumeration phrases
const enumerationPrefixes = [
  /here are the/i, /the following/i, /i found/i,
  /there are \d+/i, /these \d+ /i, /list of/i,
  /here's what/i, /what i did/i, /steps i took/i
];
if (enumerationPrefixes.some(p => p.test(text))) {
  return null;
}

// Require STRONGER choice context for long lists (>4 items)
if (choices.length > 4) {
  const strongIndicators = ['which', 'choose', 'select', 'pick', 'prefer'];
  if (!strongIndicators.some(ind => text.toLowerCase().includes(ind))) {
    return null;
  }
}
```

**Complexity:** Low
**Risk:** Low - tightens detection

#### 1.2 Add More Confirmation Patterns (Story 25-4)

**Problem:** Many "proceed" variants not caught.

**Solution:** Add patterns:
```javascript
{ pattern: /proceed with/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },
{ pattern: /continue with/i, responses: ['Yes, continue', 'No'], requiresQuestion: false },
{ pattern: /go ahead with/i, responses: ['Yes, go ahead', 'No'], requiresQuestion: false },
{ pattern: /move on to/i, responses: ['Yes', 'No'], requiresQuestion: false },
{ pattern: /let me know when.*ready/i, responses: ['Ready', 'Not yet'], requiresQuestion: false },
{ pattern: /ok to proceed/i, responses: ['OK', 'Cancel'], requiresQuestion: false },
```

**Complexity:** Low
**Risk:** Low - additive patterns

### Priority 2: High Value, Medium Complexity

#### 2.1 Agent Handoff Detection (Story 25-3)

**Problem:** Pennyfarthing agent commands not detected.

**Solution:**
```javascript
const HANDOFF_PATTERNS = [
  { pattern: /invoke\s+\/([\w-]+)/i, extractResponse: true },
  { pattern: /run\s+\/([\w-]+)/i, extractResponse: true },
  { pattern: /start\s+\/([\w-]+)/i, extractResponse: true },
  { pattern: /use\s+\/([\w-]+)/i, extractResponse: true },
];

function detectHandoff(text) {
  for (const { pattern, extractResponse } of HANDOFF_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        type: 'handoff',
        responses: [`/${match[1]}`, 'Not yet']
      };
    }
  }
  return null;
}
```

**Complexity:** Medium
**Risk:** Low - new detection type, doesn't affect existing

#### 2.2 Question Over List Priority

**Problem:** List detection wins even when question is the actual prompt.

**Solution:**
```javascript
// In processMessageForQuickActions():

// Check if last paragraph is a clear question
const lastParagraph = getLastParagraph(textContent);
const isDirectQuestion = /proceed|continue|confirm|ok\??$/i.test(lastParagraph);

if (isDirectQuestion) {
  // Check question patterns FIRST
  const questionResult = detectQuestionPattern(textContent);
  if (questionResult) return questionResult;
}

// Then check for list choices
const listResult = detectListChoices(textContent);
if (listResult) return listResult;

// Fallback to question patterns
return detectQuestionPattern(textContent);
```

**Complexity:** Medium
**Risk:** Medium - changes detection priority

### Priority 3: Strategic Improvements

#### 3.1 Structured Output Markers (Story 25-5)

**Problem:** Heuristics can never be perfect.

**Solution:** Add HTML comment markers that Pennyfarthing agents emit:
```html
<!-- CYCLIST:QUESTION:yesno -->
<!-- CYCLIST:CHOICES:1,2,3 -->
<!-- CYCLIST:HANDOFF:/reviewer -->
```

Then detect with 100% confidence:
```javascript
function detectStructuredMarkers(text) {
  const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+)\s*-->/g;
  // ... parse markers
}
```

**Complexity:** High (cross-repo)
**Risk:** Low - additive, markers are optional

#### 3.2 Confidence Scoring (Story 25-6)

**Problem:** All-or-nothing detection leads to bad UX on edge cases.

**Solution:**
```javascript
function detectWithConfidence(text) {
  // Structured marker = 100%
  // Strong choice context = 80%
  // Weak choice context = 50%
  // Pattern match only = 30%

  return { detection, confidence, reason };
}
```

Then in UI:
- `>70%`: Show buttons prominently
- `50-70%`: Show buttons subtly (reduced opacity)
- `<50%`: Hide buttons (or make configurable)

**Complexity:** High
**Risk:** Medium - requires UI changes

---

## Summary

### Detection Coverage

| Category | Patterns | Coverage | Gap |
|----------|----------|----------|-----|
| Yes/No Questions | 7 | Good | Missing some variants |
| Permission Prompts | 4 | Good | Missing "OK to proceed" style |
| Numbered Lists | 3 formats | Good | Over-triggers on enumerations |
| Agent Handoffs | 0 | None | All missing |
| Continue/Proceed | 4 | Partial | Missing many variants |

### False Positive Rate (Estimated)

Based on test coverage and analysis:
- **Enumeration lists:** ~20% false positive rate
- **Documentation lists:** ~15% false positive rate
- **Question detection:** ~5% false positive rate

### Recommended Story Priority

1. **25-2** (Enumeration Fix) - Addresses main false positive complaint
2. **25-4** (Yes/Proceed) - Quick win, low risk
3. **25-3** (Handoffs) - Pennyfarthing-specific high value
4. **25-6** (Confidence) - Safety net for edge cases
5. **25-5** (Markers) - Long-term fix
6. **25-7** (Analytics) - Data for tuning

---

## Appendix: Test Coverage Analysis

The test file `B-9.6-suggested-prompts.test.ts` covers:

| Acceptance Criteria | Tests | Status |
|---------------------|-------|--------|
| AC1: Question patterns | 10 | Complete |
| AC2: Quick-action buttons | 4 | Complete |
| AC3: Button click insertion | 3 | Complete |
| AC4: Permission prompts | 5 | Complete |
| AC5: Button disappearance | 3 | Complete |
| AC6: Auto-submit | 4 | Complete |
| AC7: Numbered lists | 5 | Complete |
| AC8: Truncated buttons | 4 | Complete |
| AC9: Number-only response | 2 | Complete |
| AC10: 2-10 options | 4 | Complete |
| AC11: No false positives | 6 | Partial (needs enumeration cases) |

**Missing test coverage:**
- Enumeration false positive scenarios
- Agent handoff patterns (not implemented)
- Long list filtering (>5 items)
- Either/or inline choice extraction
