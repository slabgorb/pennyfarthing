# Story 25-2: Fix Enumeration False Positives - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Story ID | 25-2 |
| Title | Fix Enumeration False Positives |
| Epic | 25 - Smart Question Detection & Quick Actions |
| Points | 3 |
| Priority | P1 |
| Repos | cyclist |

## Current State

The 25-1 audit revealed that `detectListChoices()` in `quick-actions.js` has a **20-30% false positive rate**. Enumeration lists (status reports, findings, documentation) incorrectly trigger choice buttons.

### Problem Examples

```
// FALSE POSITIVE - shows buttons 1/2/3 when it's just a report
"Here are the issues I found:
1. Database connection slow
2. API returning errors
3. UI not rendering"

// FALSE POSITIVE - documentation list triggers choices
"The following files were modified:
1. src/index.ts
2. src/utils.ts
3. tests/index.test.ts
4. package.json
5. README.md
6. CHANGELOG.md"
```

### Current Detection Logic

Location: `packages/cyclist/src/public/js/components/message-view/quick-actions.js`

The `detectListChoices()` function (lines ~289-349) currently:
- Detects numbered formats: `1. Item`, `1) Item`, `**1.** Item`
- Requires sequential numbering starting from 1
- Has `notChoiceIndicators` (21 words) for filtering
- Has `choiceContextKeywords` (8 words): "which", "choose", "select", "pick", etc.

**Gap:** No enumeration prefix detection or list length heuristics.

## Technical Approach

### Heuristic 1: Enumeration Prefix Detection

Add early return when text contains enumeration prefixes:

```javascript
const enumerationPrefixes = [
  /here are the/i,
  /the following/i,
  /i found/i,
  /there are \d+/i,
  /these \d+/i,
  /list of/i,
  /here's what/i,
  /what i did/i,
  /steps i took/i,
  /files? (were|was) (modified|changed|created|updated)/i,
  /issues? (i )?(found|identified|discovered)/i
];

// Early return if enumeration context detected
if (enumerationPrefixes.some(p => p.test(textBeforeList))) {
  return null;
}
```

### Heuristic 2: List Length Filter

For lists with >4 items, require strong choice indicators:

```javascript
if (choices.length > 4) {
  const strongIndicators = ['which', 'choose', 'select', 'pick', 'prefer'];
  const hasStrongIndicator = strongIndicators.some(ind =>
    text.toLowerCase().includes(ind)
  );
  if (!hasStrongIndicator) {
    return null;
  }
}
```

### Heuristic 3: Question Context Requirement (Optional Enhancement)

For borderline cases, check if there's actually a question being asked:

```javascript
const questionIndicators = [
  /which (one|option|approach)/i,
  /what would you (like|prefer)/i,
  /do you want/i,
  /should i/i
];
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Add enumeration prefix detection, list length heuristic to `detectListChoices()` |
| `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` | Add test cases for enumeration false positives (AC11 gap) |

## Acceptance Criteria

- [ ] **AC1:** Numbered lists without question context are ignored
- [ ] **AC2:** "Here are the files" type enumeration lists not shown as choices
- [ ] **AC3:** Long lists (>5 items) treated as enumeration by default
- [ ] **AC4:** Reduces false positive rate significantly (existing valid detections still work)

## Testing Strategy

### New Test Cases Needed

1. **Enumeration prefix cases** (should NOT detect):
   - "Here are the files I modified: 1. foo.js 2. bar.js"
   - "I found the following issues: 1. Bug A 2. Bug B"
   - "The following steps were completed: 1. Step 1 2. Step 2"

2. **Long list cases** (should NOT detect without strong context):
   - 6+ item lists without "which/choose/select/pick"

3. **Valid choice cases** (should STILL detect):
   - "Which approach do you prefer? 1. Option A 2. Option B"
   - "Choose one: 1. Fast 2. Reliable 3. Cheap"
   - Short lists (2-4 items) with question context

4. **Edge cases**:
   - List with both enumeration prefix AND question (question should win)
   - Exactly 5 items (boundary case)

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Over-filtering breaks valid detections | Comprehensive test coverage for both positive and negative cases |
| Regex performance | Keep patterns simple, test with long messages |
| Edge cases with mixed content | Test messages that have both enumeration and question patterns |

## Reference

- Audit document: `packages/cyclist/docs/QUICK-ACTIONS-AUDIT.md`
- Epic context: `.session/context-epic-25.md`
- Current test coverage: 46 tests in `B-9.6-suggested-prompts.test.ts`
