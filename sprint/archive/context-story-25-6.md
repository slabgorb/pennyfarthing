# Story 25-6: Confidence Scoring for Detection - Technical Context

## Story Overview
- **Epic:** 25 - Smart Question Detection & Quick Actions
- **Story:** 25-6 - Confidence Scoring for Detection
- **Points:** 2 (Trivial)
- **Priority:** P2
- **Repos:** cyclist
- **Jira:** MSSCI-11538

## What This Story Accomplishes

Currently, all quick-action detections are binary (detected/not detected). Story 25-6 adds a **confidence score** (0.0-1.0) to each detection result, enabling:
1. Filtering out low-confidence detections to reduce false positives
2. Varying UI prominence based on confidence level
3. Better debugging and analytics of detection quality

## Current State

**Detection Priority (from `processMessageForQuickActions`):**
1. Structured markers → always 100% accurate (from 25-5)
2. Handoff patterns → highly reliable (~95%)
3. List choices → variable accuracy (30-95% depending on context)
4. Yes/no questions → moderate accuracy (70-90%)

**Current Return Format (quick-actions.js:588-625):**
```javascript
return {
  type: 'handoff' | 'list' | 'yesno',
  agent?: string,        // for handoff
  choices?: array,       // for list
  responses?: string[],  // button labels
  source?: string,       // 'structured_marker' for 25-5 markers
};
```

## Technical Approach

### 1. Add Confidence Field to All Detections

Update each detection function to return a `confidence` score:

```javascript
return {
  type: 'handoff',
  agent: '/reviewer',
  responses: ['/reviewer', 'Not yet'],
  confidence: 0.95,  // NEW
  source: 'pattern',
};
```

### 2. Confidence Calculation by Detection Type

| Source | Base Confidence | Modifiers |
|--------|-----------------|-----------|
| Structured markers | 1.0 | None (explicit signal) |
| Handoff - direct mention (`/reviewer`) | 0.98 | None |
| Handoff - phase keyword ("ready for review") | 0.90 | +0.05 if ends with ? |
| Yes/No - with question mark | 0.85 | Pattern-specific |
| Yes/No - no question mark | 0.70 | Pattern-specific |
| List - ≤3 items with strong context | 0.90 | |
| List - ≤3 items with weak context | 0.60 | |
| List - 4-5 items | 0.50-0.70 | Context dependent |
| List - >5 items | 0.30-0.50 | Likely enumeration |

### 3. Threshold Filtering

In `processMessageForQuickActions()`, filter results below threshold:

```javascript
const CONFIDENCE_THRESHOLD = 0.6; // Configurable

const result = detectHandoffPattern(text);
if (result && result.confidence >= CONFIDENCE_THRESHOLD) {
  return result;
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Add confidence to all detect functions, add threshold filtering |
| `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` | Add ~20 confidence-related tests |

## Acceptance Criteria

- [ ] **AC1:** All detection results include a `confidence` field (0.0-1.0)
- [ ] **AC2:** Structured markers return confidence 1.0
- [ ] **AC3:** Results below configurable threshold are filtered out
- [ ] **AC4:** Existing detection behavior unchanged for high-confidence results

## Testing Strategy

**AC1 Tests (confidence field present):**
- detectHandoffPattern returns confidence
- detectQuestionPattern returns confidence
- detectListChoices returns confidence
- processStructuredMarkers returns confidence 1.0

**AC2 Tests (marker confidence):**
- HANDOFF marker → 1.0
- QUESTION marker → 1.0
- CHOICES marker → 1.0

**AC3 Tests (threshold filtering):**
- Result at 0.6 passes default threshold
- Result at 0.59 filtered out
- Threshold can be adjusted

**AC4 Tests (backward compatibility):**
- Existing high-confidence patterns still detected
- Button rendering unchanged
- No regression in detection accuracy

## Dependencies & Risks

- **Low risk:** Additive change - confidence is a new field
- **Backward compatible:** Results that would have been shown still shown (they're high-confidence)
- **No cross-repo changes:** Cyclist-only implementation

## Key Code References

- `detectStructuredMarkers()`: quick-actions.js:194-217
- `processStructuredMarkers()`: quick-actions.js:224-274
- `detectHandoffPattern()`: quick-actions.js:311-354
- `detectQuestionPattern()`: quick-actions.js:282-302
- `detectListChoices()`: quick-actions.js:362-476
- `processMessageForQuickActions()`: quick-actions.js:588-625
