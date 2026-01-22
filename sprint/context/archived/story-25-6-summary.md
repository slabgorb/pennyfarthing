# Story 25-6: Confidence Scoring for Detection - Summary

**Completed:** 2026-01-11
**PR:** [#180](https://github.com/1898andCo/pennyfarthing/pull/180)
**Points:** 2

## What Was Built

Added confidence scoring (0.0-1.0) to Cyclist's quick-action detection system. All detection functions now return a `confidence` field, enabling threshold-based filtering to reduce false positives. Structured markers always return 1.0 (explicit signals), while pattern-based detection returns calibrated scores based on pattern specificity and context strength.

## Key Technical Decisions

1. **Confidence values hardcoded in patterns** - Rather than computing confidence dynamically, values are embedded in QUESTION_PATTERNS array and assigned by detection type (handoff: 0.90-0.98, questions: 0.75-0.85). This keeps the logic simple and auditable.

2. **List confidence is dynamic** - `detectListChoices` calculates confidence based on context strength (strong words like "which"/"choose" = 0.90 base, weak context = 0.70) and list length (penalty of 0.03 per item after 3, floor at 0.60).

3. **Threshold filtering at processing layer** - The `meetsThreshold()` helper in `processMessageForQuickActions()` checks confidence after each detection, allowing the individual detect functions to remain pure.

4. **Defensive fallback for missing confidence** - If a result lacks confidence field (shouldn't happen), it passes through to maintain backward compatibility.

## Implementation Patterns

- **State getter/setter pattern** - `setConfidenceThreshold()`/`getConfidenceThreshold()` follows existing pattern from `setAutoSubmit()`/`getAutoSubmit()` at same file location.
- **Pattern-based confidence** - Each pattern in QUESTION_PATTERNS array has its own confidence value, making tuning straightforward.
- **Floor/ceiling bounds** - Confidence clamped between 0.60 minimum and 1.0 maximum.

## Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Added confidence to all detection functions, threshold filtering, state management |
| `packages/cyclist/src/public/js/components/message-view/index.js` | Export setConfidenceThreshold/getConfidenceThreshold |
| `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` | 47 new tests covering all ACs |

## Lessons for Future Work

1. **Single-letter choice edge case** - Fixed bug where choices starting with single letters (e.g., "A simple option") were incorrectly filtered because "a" matched the article in notChoiceIndicators. Solution: `firstWord.length > 1` check before filtering. Any future pattern matching on first words should account for single-character tokens.

2. **Input validation tradeoff** - `setConfidenceThreshold()` lacks validation (accepts NaN, negative, >1.0). Follows existing codebase pattern for internal APIs. If exposed to user config, add bounds checking.

3. **Implicit vs explicit tests** - The single-letter fix is tested but not explicitly documented in tests. Future bug fixes should include a dedicated test case with a comment explaining the bug being prevented.
