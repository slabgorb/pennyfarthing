# Story 25-6 Research Report: Confidence Scoring for Detection

## Story Details

**Story ID:** 25-6  
**Title:** Confidence Scoring for Detection  
**Epic:** Epic 25 (Smart Question Detection & Quick Actions)  
**Points:** 2 (Small, focused story)  
**Priority:** P2 (Nice-to-have feature, not blocking)  
**Status:** Backlog (Not yet claimed)  
**Repos:** Cyclist only  
**Jira Key:** MSSCI-11535  

### Acceptance Criteria

```yaml
acceptance_criteria:
  - Detection returns confidence score
  - UI varies by confidence level
  - Threshold configurable in settings
  - Reduces noise from uncertain detections
```

---

## Epic 25 Context

**Epic Title:** Smart Question Detection & Quick Actions  
**Points:** 18 total (8 completed, 10 remaining including 25-6)  
**Status:** In Progress  
**Marker:** UX  
**Repos:** Cyclist + Pennyfarthing  

### Epic Goal
Improve Cyclist's ability to detect when Claude is asking questions or prompting for action. Reduce false positives (enumerations mistaken for questions), catch handoff prompts, and add "yes, proceed" buttons. Two-pronged approach: **better parsing (Cyclist side) AND easier-to-parse Claude output (Pennyfarthing side)**.

### Epic Strategy
- **Stories 25-1 to 25-4:** Heuristic improvements (pattern-based detection)
- **Story 25-5:** Structured markers (100% accurate, explicit hints from Claude)
- **Story 25-6:** Confidence scoring (reduce noise, improve UX visibility)
- **Story 25-7:** Analytics (track what works, what doesn't)

---

## Completed Stories (25-1 through 25-5) - Key Patterns

### Story 25-1: Audit Current Quick Actions Detection (DONE)
**What:** Reviewed all current detection patterns in quick-actions.js  
**Key Findings:**
- Current detection is heuristic-based (~80% accuracy ceiling)
- False positives: numbered lists mistaken for choices (enumerations, file lists)
- Missed patterns: handoff prompts, "shall I" variations

### Story 25-2: Fix Enumeration False Positives (DONE)
**Key Technical Decisions:**
1. Two-tier indicator system: "strong" (which, choose, select, pick, prefer) vs "weak" (option, would you like)
2. Length threshold of 5: Lists >5 items require strong indicators; ≤5 accept weak
3. Minimal surgical change to existing detection logic

**Files Modified:**
- `quick-actions.js`: Added list length heuristic (+25/-7 lines)
- Tests: 22 new tests

**Lesson for 25-6:** Heuristics get progressively harder to tune - each new pattern adds complexity and potential edge cases.

### Story 25-3: Detect Handoff & Action Prompts (DONE)
**What:** Added handoff detection for agent invocation patterns  
**Key Accomplishments:**
- New `detectHandoffPattern()` function
- 21 phase keywords mapped to 10 agents
- Smart detection (last paragraph only, strips code blocks, takes last agent mentioned)

**Files Modified:**
- `quick-actions.js`: +133 lines (PHASE_TO_AGENT, HANDOFF_PATTERNS, detectHandoffPattern())
- Tests: 60 handoff tests

**Lesson for 25-6:** Handoff patterns are very clear/confident when matched. This could be scored high confidence.

### Story 25-4: Universal 'Yes, Proceed' Button (DONE)
**Key Technical Decisions:**
- `requiresQuestion` flag: patterns like "can I" need question mark to avoid false positives
- Last paragraph detection already prevents false positives from explanatory text
- Universal verb matching via word boundary (`\b`)

**Lessons:**
1. Existing code was more universal than expected
2. Word boundaries matter for preventing false positives
3. Pattern complexity increases with each new detection type

**Lesson for 25-6:** Yes/No question detection should have medium-high confidence when question mark present, lower when not.

### Story 25-5: Structured Output Markers (DONE)
**What:** Added HTML comment markers for 100% accurate detection  
**Key Technical Decisions:**
1. Marker format: `<!-- CYCLIST:TYPE:value -->` (HTML comments invisible when rendered)
2. Markers checked FIRST before pattern-based heuristics
3. Code blocks excluded (prevent false positives)

**Implementation Patterns:**
- Non-greedy regex: `/<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi`
- Results include `source: 'structured_marker'` to distinguish from pattern detection
- Markers are explicit agent intent - **score these with 100% confidence**

**Lesson for 25-6:** Structured markers should always be highest confidence (100%). They're explicit signals.

---

## Current Detection Architecture (quick-actions.js)

### Processing Pipeline

```
processMessageForQuickActions()
  ├─ Priority 1: detectStructuredMarkers() → 100% confidence
  ├─ Priority 2: detectHandoffPattern() → ~95% confidence (very reliable)
  ├─ Priority 3: detectListChoices() → ~70-80% confidence (tuned heuristics)
  └─ Priority 4: detectQuestionPattern() → ~85-90% confidence
```

### Current Detection Functions

| Function | Type | Reliability | Confidence Score Opportunity |
|----------|------|-------------|------------------------------|
| `detectStructuredMarkers()` | Explicit markers | 100% | HIGH (always 100%) |
| `detectHandoffPattern()` | Agent invocation | 95%+ | HIGH (95-100%) |
| `detectListChoices()` | Numbered list | 70-80% | MEDIUM-LOW (varies by context) |
| `detectQuestionPattern()` | Yes/no questions | 85-90% | MEDIUM-HIGH (depends on marker) |

### Confidence Factors for Each Type

**Handoff Patterns:**
- Direct command ("invoke /reviewer") → 100% confidence
- Phase keyword match ("ready for review") → 95% confidence
- Context warning ("start fresh with /tea") → 100% confidence

**List Choices:**
- Long list (>5 items) with strong context ("which would you prefer") → 85-90%
- Long list with weak context → 40-50% (high false positive risk)
- Short list (≤5) with strong context → 90-95%
- Short list with weak context → 60-70%

**Yes/No Questions:**
- Explicit question mark present → 85-90% confidence
- Pattern requires question mark (strong indicator) → 90%+
- Pattern without question mark → 50-70% (ambiguous)

**Structured Markers:**
- Any marker found → 100% confidence (by design)

---

## What Story 25-6 Should Build

### 1. Confidence Score System

Add a `confidence` field to detection results:

```javascript
// Before
return {
  type: 'handoff',
  agent: lastMatch.agent,
  responses: [lastMatch.agent, 'Not yet'],
};

// After
return {
  type: 'handoff',
  agent: lastMatch.agent,
  responses: [lastMatch.agent, 'Not yet'],
  confidence: 0.95,  // Score 0.0 to 1.0
  source: 'pattern' | 'structured_marker'
};
```

### 2. Confidence Calculation Per Detection Type

**For `detectStructuredMarkers()`:**
- Always return confidence: 1.0 (100%)

**For `detectHandoffPattern()`:**
- Direct command match → 1.0 (100%)
- Phase keyword match → 0.95 (95%)
- Context warning → 1.0 (100%)

**For `detectListChoices()`:**
```javascript
// Base confidence depends on list length
let confidence = 0.5;
if (choices.length <= 5) confidence += 0.25;
if (hasStrongContext) confidence += 0.25;
if (choices.length > 5 && !hasStrongContext) confidence = 0.3;
```

**For `detectQuestionPattern()`:**
```javascript
let confidence = 0.7;
if (pattern.requiresQuestion && endsWithQuestion) confidence = 0.9;
if (!pattern.requiresQuestion) confidence = 0.75;
```

### 3. UI Variations by Confidence

The UI should vary display based on confidence:

```javascript
// High confidence (0.8-1.0): Show buttons prominently
- Large, visible buttons
- Always shown
- Suggest interaction

// Medium confidence (0.5-0.8): Show buttons subtly
- Smaller buttons
- Might be dismissed
- Cautious suggestion

// Low confidence (<0.5): Don't show buttons
- Don't render at all
- Or show with "uncertain" styling
- Avoid noise
```

### 4. Configurable Threshold

Add to Cyclist settings:

```javascript
settings.quickActions = {
  enabled: true,
  confidenceThreshold: 0.6,  // Don't show buttons below this
  showUncertainButtons: false,  // Show even low-confidence detections
  visualFeedback: true,  // Color-code by confidence
};
```

---

## Test Strategy for 25-6

### Test Cases to Cover

1. **Confidence calculation for each detection type**
   - Structured markers → always 1.0
   - Direct handoff → 1.0
   - Phase handoff → 0.95
   - Strong context list → 0.85-0.95
   - Weak context list → 0.5-0.7
   - Question with marker → 0.9+
   - Question without marker → 0.7-0.75

2. **Threshold filtering**
   - Result below threshold → null (don't show)
   - Result above threshold → return with confidence
   - Boundary cases (at exactly 0.6) → consistent behavior

3. **UI rendering variations**
   - High confidence → prominent styling
   - Medium confidence → subtle styling
   - Low confidence → not shown

4. **Settings application**
   - Default threshold (0.6) → certain detections shown, uncertain hidden
   - High threshold (0.8) → only very confident detections shown
   - Low threshold (0.3) → even weak detections shown

### Regression Tests

- AC4 regression tests from 25-2 (enumeration false positives) should still pass
- Handoff tests from 25-3 should still work with confidence scores
- Marker tests from 25-5 should get 1.0 confidence

---

## Files to Modify

### Primary: `packages/cyclist/src/public/js/components/message-view/quick-actions.js`

Changes:
- Add confidence calculation to each detection function
- Modify return objects to include `confidence` field
- Add threshold filtering in `processMessageForQuickActions()`
- Update `renderQuickActions()` to apply confidence-based styling

### Secondary: UI styling/rendering

- Add CSS for confidence levels (`.high-confidence`, `.medium-confidence`, `.low-confidence`)
- Potentially update rendering to show confidence indicator (%)

### Settings: Cyclist configuration

- Add `quickActions.confidenceThreshold` setting
- Add `quickActions.visualFeedback` setting
- Document thresholds in help/docs

### Tests: `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts`

- Add 15-20 confidence scoring tests
- Test threshold filtering
- Test UI styling application
- Test settings integration

---

## Key Insights from Completed Stories

1. **Heuristics compound in complexity** (25-2, 25-4)
   - Each new pattern adds edge cases
   - Confidence scoring helps manage ambiguity

2. **Structured markers are the solution to pattern complexity** (25-5)
   - 100% accuracy vs 70-90% heuristics
   - Markers can be explicit and clear
   - Can include confidence in markers ("QUESTION:confident" vs "QUESTION:uncertain")

3. **Detection priority matters** (25-3, 25-5)
   - Handoff patterns should take precedence
   - Structured markers always win
   - Confidence scoring respects this priority

4. **Code block exclusion prevents false positives** (25-5)
   - Markers/patterns inside triple-backticks can be documentation
   - This is already implemented, confidence scoring respects it

5. **Last paragraph detection is effective** (25-2, 25-3, 25-4)
   - Prevents false positives from explanatory text above
   - All detection functions use this pattern
   - Confidence should reflect whether question appears at end or in middle

---

## Implementation Order

**Recommended approach:**

1. **Phase 1 (RED):** TEA writes 20-25 tests for confidence scoring
   - Test each detection type returns confidence score
   - Test threshold filtering
   - Test settings integration
   
2. **Phase 2 (GREEN):** Dev implements to pass tests
   - Add confidence field to each detection function
   - Implement threshold filtering in `processMessageForQuickActions()`
   - Add settings integration
   
3. **Phase 3 (UI):** Enhance rendering
   - Apply CSS classes for confidence levels
   - Optional: Show % indicator
   
4. **Phase 4 (REVIEW):** Reviewer checks for edge cases
   - Verify backward compatibility
   - Test with mixed message types
   - Check settings integration

---

## Acceptance Criteria Mapping

| AC | How Confidence Scoring Implements It | Implementation |
|----|---------------------------------------|-----------------|
| AC1: Detection returns confidence score | Each detect*() adds `confidence: 0.0-1.0` | Core change |
| AC2: UI varies by confidence level | `renderQuickActions()` applies CSS classes | Rendering |
| AC3: Threshold configurable in settings | `settings.quickActions.confidenceThreshold` | Config |
| AC4: Reduces noise from uncertain detections | Threshold filtering removes low-confidence | Core logic |

---

## Stretch Goals (Not Required)

1. Show confidence % on buttons (e.g., "95% certain: Yes")
2. Machine learning integration to tune confidence weights
3. Analytics tracking (25-7) can use confidence to identify tuning opportunities
4. Persistent confidence feedback ("I was 40% sure, and you clicked - noted!")
