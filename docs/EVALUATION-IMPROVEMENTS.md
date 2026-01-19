# Evaluation System Improvements for Pennyfarthing

Research-backed recommendations for improving scenarios and judging based on current best practices in AI agent evaluation (2023-2025).

## Executive Summary

Current research reveals that:
- **68% of original SWE-bench samples contained flawed test cases or underspecified requirements**
- LLM judges exhibit systematic **position bias, self-inconsistency, and knowledge-driven failures**
- High variance (std dev > 30) typically indicates **judge inconsistency or scenario ambiguity**
- Low variance (std dev < 5) suggests **ceiling effects or insufficient differentiation**
- Binary/low-precision scoring (3-5 point scales) proves **more reliable than 1-10 continuous scales**

---

## Critical Issues Identified in Current System

### 1. Detection Scoring Ambiguity (50-point component)

**Problem:** The current additive model `baseline_found + novel_findings - false_positives` lacks operational clarity and treats precision/recall asymmetrically.

**Evidence:** Research shows this approach creates high variance because:
- Missing a critical issue vs. flagging a false positive have different real-world costs
- Judges struggle with "what counts as a novel finding"
- No explicit precision/recall trade-off

### 2. High Variance Scenarios (std dev > 30)

**Root Causes:**
- Baseline issue definitions may be overlapping or unclear
- Severity calibration inconsistent across scenarios
- Judge prompt lacks concrete evaluation criteria

### 3. Ceiling Effects (std dev < 5, mean > 95)

**Problem:** Scenarios too easy, personas can't differentiate
- Example: `security-review` originally scored 99.4 before rework
- Insufficient "stretch" requirements beyond basic detection

### 4. Judge Self-Consistency Issues

**Finding:** LLM judges produce different scores for the same response across runs
- No multi-judge validation
- No anchor examples in judge prompts
- No explicit reference standards

---

## Recommended Improvements

## Priority 1: Redesign Detection Scoring (High Impact)

### Current Approach
```
Detection (50 max) = critical×15 + high×10 + medium×5 + low×2 + novel×5 - false_positives×5
```

### Problems with Original Proposal

The initial proposal (equal 25/25 split for precision/recall) had several issues identified during critical review:

1. **Severity Weighting Lost**: Treating all issues as equal means finding 8/10 LOW issues scores the same as finding 8/10 CRITICAL issues
2. **Novel Findings Penalized**: Valid novel findings beyond baseline looked like false positives
3. **F-beta Over-complicates**: Loses interpretability without clear benefit
4. **Backward Compatibility**: Historical benchmark data would be invalidated

### Implemented Approach: Severity-Weighted Precision/Recall (v2)

**Status: ✅ IMPLEMENTED** in [judge/SKILL.md](../pennyfarthing-dist/skills/judge/SKILL.md)

```yaml
detection_scoring_v2:
  severity_weights:
    critical: 15
    high: 10
    medium: 5
    low: 2

  component_allocation:  # Total: 50 points
    recall_score: 30      # weighted_recall × 30 (coverage priority)
    precision_score: 10   # precision × 10 (penalize hallucinations)
    novel_bonus: 10       # min(novel_valid × 3, 10) (reward thoroughness)
```

**Metric Calculations:**
```
weighted_found = Σ(found_issues × severity_weight)
weighted_total = Σ(all_baseline_issues × severity_weight)

recall = weighted_found / weighted_total
precision = true_positives / (true_positives + false_positives)
f2_score = 5 × (precision × recall) / (4 × precision + recall)  # reported, not used in scoring
```

**Benefits:**
- **Preserves severity weighting**: Critical issues count 7.5x more than low issues
- **Recall weighted 3x precision** (30 vs 10 pts): Missing vulnerabilities is worse than false alarms
- **Novel findings have separate pool**: Rewards thoroughness without affecting precision
- **Transparent metrics**: recall, precision, f2_score all visible for debugging
- **Maintains 50-point cap**: Backward compatible with historical data

### Implementation in Judge Skill

**Updated** [judge/SKILL.md](../pennyfarthing-dist/skills/judge/SKILL.md):

```json
{
  "detection": {
    "by_severity": {
      "critical": {"found": 5, "total": 6},
      "high": {"found": 4, "total": 6},
      "medium": {"found": 3, "total": 8},
      "low": {"found": 1, "total": 2}
    },
    "novel_valid": 2,
    "false_positive_count": 1,
    "metrics": {
      "weighted_found": 132,
      "weighted_total": 194,
      "recall": 0.680,
      "precision": 0.933,
      "f2_score": 0.718
    },
    "components": {
      "recall_score": 20.4,
      "precision_score": 9.3,
      "novel_bonus": 6.0
    },
    "subtotal": 35.7
  }
}
```

**Example Calculation:**
```
Scenario: 6 critical (90 pts), 6 high (60 pts), 8 medium (40 pts), 2 low (4 pts) = 194 weighted total
Agent finds: 5 critical, 4 high, 3 medium, 1 low = 75+40+15+2 = 132 weighted found
Agent flags: 14 true positives, 1 false positive, 2 valid novel findings

recall = 132/194 = 0.680
precision = 14/15 = 0.933

recall_score = 0.680 × 30 = 20.4
precision_score = 0.933 × 10 = 9.3
novel_bonus = min(2 × 3, 10) = 6.0

detection.subtotal = 20.4 + 9.3 + 6.0 = 35.7
```

---

## Priority 2: Implement Reference-Guided Grading

### Problem
Current judge prompts lack explicit reference standards, leading to inconsistent interpretation.

### Solution: Gold Standard Response Templates

For each scenario, provide the judge with:

**Example for code-review scenario:**

```yaml
# scenarios/code-review/security-review.yaml

judge_reference:
  baseline_issues_guidance:
    SQL_INJECTION:
      severity: critical
      evidence_required: "Must identify string formatting vulnerability on line 4"
      acceptable_explanations:
        - "Direct string interpolation allows SQL injection"
        - "Unsanitized user input in SQL query"
        - "Using f-string/sprintf for SQL is unsafe"
      unacceptable_explanations:
        - "Bad code quality" (too vague)
        - "Should use ORM" (prescriptive, not explanatory)

  novel_findings_examples:
    acceptable:
      - "No input validation on id parameter"
      - "Missing rate limiting on endpoint"
      - "Error messages expose database schema"
    reject_as_false_positive:
      - "Function name should be camelCase" (style, not security)
      - "Missing JSDoc comment" (documentation, not issue)

  edge_cases:
    - description: "Agent suggests parameterized query but uses wrong syntax"
      verdict: "Count as finding the issue, penalize in Quality/Fixes"
```

**Judge Prompt Enhancement:**

```markdown
## Reference Standards

The following baseline issues MUST be found:
- SQL_INJECTION (line 4): Direct string formatting in SQL query
  Acceptable evidence: Identifying unsanitized user input, string interpolation risk

Novel findings that demonstrate thoroughness (bonus points):
- Input validation gaps
- Information disclosure in error handling
- Authentication/authorization issues

Common false positives to avoid crediting:
- Style violations (naming, formatting)
- Missing documentation
- "Should use framework X" without explaining actual vulnerability
```

---

## Priority 3: Multi-Judge Validation for High-Variance Scenarios

### Implementation

For scenarios with std dev > 15, run 3 independent judge evaluations:

```bash
# Run same evaluation 3 times with different random seeds
for i in 1 2 3; do
  /judge --mode solo --data {...} --seed $i
done

# Calculate inter-judge reliability
# Krippendorff's Alpha should be > 0.65
```

**Automated Detection of Problematic Scenarios:**

```yaml
# After 10-run baseline
statistics:
  mean: 76.5
  std_dev: 28.3  # HIGH VARIANCE - trigger review

review_actions:
  - Run multi-judge validation (N=3 judges per response)
  - Calculate Krippendorff's Alpha
  - If Alpha < 0.65: Refine baseline_issues definitions
  - If Alpha > 0.75: Variance is real agent capability spread
```

---

## Priority 4: Improve Difficulty Calibration

### Current Bands (Score-Based)
```
easy:    85-100
medium:  70-85
hard:    55-70
extreme: <55
```

### Recommended: Percentile + Multi-Metric Calibration

**Track each dimension separately:**

```yaml
difficulty_calibration:
  easy:
    detection_min: 45  # 90% of baseline issues found
    quality_min: 23    # 92% of quality points
    persona_min: 20    # 80% of persona points
    overall_range: "85-100"

  medium:
    detection_range: "35-44"  # 70-88% issues found
    quality_range: "18-22"    # 72-88% quality
    persona_range: "15-22"    # 60-88% persona
    overall_range: "70-85"

  hard:
    detection_range: "25-34"  # 50-68% issues found
    quality_range: "12-17"
    persona_range: "10-17"
    overall_range: "55-70"
```

**Prevents dimension masking:** A scenario could hit "easy" overall but be trivially easy on Detection while hard on Quality.

### Increase Control Sample Size

**Current:** 10 baseline runs
**Recommended:** 20-30 baseline runs for statistical reliability

From research: "Run 20-30 baseline evaluations per scenario, not 10. This reduces sampling noise and reveals true bimodality."

---

## Priority 5: Address Ceiling Effects

### For Scenarios with std dev < 5 and mean > 95

**Add "Stretch" Requirements:**

```yaml
baseline_issues:
  critical: [...]  # Must find
  high: [...]      # Should find

bonus_criteria:  # NEW - differentiate top performers
  security_implications:
    description: "Explain attack vectors and impact beyond identifying issue"
    points: 5

  systemic_analysis:
    description: "Identify whether issue exists in other parts of codebase"
    points: 5

  defense_in_depth:
    description: "Suggest multiple mitigation layers, not just fix"
    points: 5
```

**Example: security-review scenario (was 99.4, now 86.42 after rework)**

Before:
```yaml
# Agents just had to find 5 obvious issues
baseline_issues: [SQL_INJECTION, XSS, ...]
```

After (with stretch requirements):
```yaml
baseline_issues: [same]

bonus_criteria:
  - "Identify defense-in-depth opportunities"
  - "Explain attack chain exploitation"
  - "Suggest monitoring/detection mechanisms"
```

---

## Priority 6: Create "Non-Issue Repository" for False Positive Detection

### Problem
Agents flag patterns that look like bugs but aren't, with no way to measure this systematically.

### Solution: Intentional Traps

Add 1-2 "non-issues" per scenario as calibration:

```yaml
# scenarios/code-review/example.yaml

non_issues:  # NOT shown to agent, used for judge calibration
  - location: "line 12"
    pattern: "Early return for error handling"
    description: "Intentional control flow, not a bug"
    false_positive_if_flagged: true

  - location: "line 45"
    pattern: "Nested ternary operator"
    description: "Readable in context, not problematic"
    false_positive_if_flagged: true

judge_guidance:
  - "If agent flags line 12 early return as issue: -3 points precision"
  - "If agent flags line 45 ternary as issue: -2 points precision"
```

**Scoring Impact:**

```json
{
  "detection": {
    "true_positives": 8,
    "false_positives": 2,      // Flagged the 2 non-issues
    "trap_false_positives": 2, // Explicitly calibrated traps
    "precision_score": 15      // Penalty for failing trap test
  }
}
```

---

## Priority 7: Implement Meta-Evaluation ("Judge the Judge")

### Layer 1: Human Gold Standard Comparison (10-15% sample)

```yaml
meta_evaluation:
  sample_size: "10-15% of responses"
  process:
    - Human expert evaluates same responses
    - Compare judge scores to human scores
    - Calculate Spearman correlation (target: > 0.85)
    - Calculate agreement on issue identification

  action_if_correlation_low:
    - Refine judge prompt with more explicit criteria
    - Add more reference examples
    - Consider switching judge model
```

### Layer 2: Adversarial Validation

Generate deliberately problematic responses to verify judge catches them:

```yaml
adversarial_tests:
  - type: "high_detection_low_quality"
    description: "Finds all issues but explanations are nonsense"
    expected_score:
      detection: 45-50  # Should score high
      quality: 5-10     # Should score low
      total: "<65"

  - type: "perfect_explanations_wrong_issues"
    description: "Excellent writing about non-existent problems"
    expected_score:
      detection: 0-10   # Should score very low
      quality: 15-20    # Explanations are good
      total: "<30"

  - type: "competent_but_out_of_character"
    description: "Technically correct but breaks persona"
    expected_score:
      persona: 5-10     # Should score low
      detection: 35-45  # Should score normally
      total: "<75"
```

**Validation Process:**

```bash
# Generate adversarial responses
./scripts/generate-adversarial-responses.sh

# Run judge
/judge --mode solo --data adversarial_response_1.json

# Verify judge assigns expected scores
# If judge gives high total score to "wrong_issues" type: Judge is broken
```

---

## Priority 8: Improve Rubric Specificity for Subjective Dimensions

### Current Problem: "Actionable fixes" and "Clear explanations" are vague

### Solution: Operationalize with Concrete Indicators

**For Quality Dimension:**

```yaml
quality:
  clear_explanations:
    score: 1-10
    rubric:
      9-10: "Explains root cause, impact, and why it's wrong with technical accuracy"
      7-8: "Identifies issue and explains why it matters, minor gaps"
      5-6: "Correctly identifies issue but explanation is superficial"
      3-4: "Vague explanation that doesn't demonstrate understanding"
      1-2: "Explanation is incorrect or missing"

  actionable_fixes:
    score: 1-10
    rubric:
      9-10: "Provides specific code fix with correct syntax, handles edge cases"
      7-8: "Provides correct approach but minor syntax/edge case issues"
      5-6: "General direction correct but lacks specificity"
      3-4: "Suggests fix but would not work or creates new problems"
      1-2: "No fix provided or completely wrong approach"
```

**Reduces judge variance by eliminating interpretation differences.**

Research: "Rubrics that replaced vague terminology like 'good' with specific, measurable criteria significantly improved consistency."

---

## Priority 9: Scenario Quality Checklist (Before Adding New Scenarios)

Before adding a scenario to the benchmark:

```yaml
quality_checklist:

  specification:
    - [ ] Problem statement is sufficiently detailed for developer to understand task
    - [ ] Severity labels (critical/high/medium/low) are consistently calibrated
    - [ ] No overlapping baseline issues (each is distinct and independently findable)

  baseline_issues:
    - [ ] Each issue has clear location reference
    - [ ] Each issue has 2-3 example acceptable explanations
    - [ ] Each issue has 1-2 example unacceptable explanations
    - [ ] Edge cases are documented (e.g., "partial fix counts as found")

  test_coverage:
    - [ ] 1-2 non-issues included as false positive traps
    - [ ] 2-3 bonus criteria for stretch differentiation
    - [ ] Scenario tested with 10-run control baseline
    - [ ] Standard deviation is reasonable (5 < σ < 25)

  judge_calibration:
    - [ ] Reference standards provided for judge
    - [ ] Rubric defines concrete evaluation criteria
    - [ ] Adversarial test cases defined
    - [ ] Multi-judge validation completed (if high variance)
```

---

## Priority 10: Use Krippendorff's Alpha for Inter-Rater Reliability

### Current: No formal reliability measurement

### Recommended: Calculate α for multi-judge evaluations

**Why Krippendorff's Alpha:**
- Handles ordinal scales (critical vs. high vs. medium)
- Accounts for partial disagreement (critical vs. high is closer than critical vs. low)
- Robust to missing data

**Implementation:**

```python
# After 3 judges evaluate 20 responses
import krippendorff

# Ratings matrix: judges × responses
# Each cell: severity rating (0=not found, 1=low, 2=medium, 3=high, 4=critical)
ratings = [
    [4, 3, 4, 2, ...],  # Judge 1
    [4, 4, 3, 2, ...],  # Judge 2
    [3, 3, 4, 2, ...],  # Judge 3
]

alpha = krippendorff.alpha(ratings, level_of_measurement='ordinal')

# Interpretation:
# α > 0.80: Excellent reliability
# α 0.67-0.80: Acceptable reliability
# α < 0.67: Unreliable - refine rubric
```

**Use Cases:**
- Validate new scenario rubrics before deployment
- Identify scenarios needing rubric refinement
- Compare judge model reliability

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ Add reference standards to 3 high-variance scenarios
2. ✅ Implement precision/recall separation for Detection scoring
3. ✅ Create adversarial test suite for judge validation
4. ✅ Document concrete rubric criteria for Quality dimension

### Phase 2: Systematic Improvements (3-4 weeks)
1. ✅ Run 20-30 control baselines on all scenarios (currently 10)
2. ✅ Add non-issue traps to all code-review scenarios
3. ✅ Implement multi-judge validation for high-variance scenarios
4. ✅ Calculate Krippendorff's Alpha for judge reliability

### Phase 3: Meta-Evaluation (Ongoing)
1. ✅ Human gold standard evaluation on 10-15% sample
2. ✅ Quarterly adversarial validation runs
3. ✅ Track judge reliability trends over time
4. ✅ Continuous scenario quality improvement

---

## Expected Outcomes

Based on research findings:

| Improvement | Current State | Expected State |
|-------------|---------------|----------------|
| **Judge Variance** | Some scenarios σ > 30 | σ < 20 for 90% of scenarios |
| **Inter-Judge Reliability** | Not measured | Krippendorff's α > 0.70 |
| **Detection Scoring Clarity** | Ambiguous precision/recall | Explicit trade-off visible |
| **Ceiling Effects** | 2-3 scenarios mean > 95 | All scenarios mean < 92 |
| **False Positive Handling** | No systematic measurement | Trap tests in all scenarios |
| **Meta-Evaluation** | None | Quarterly validation |

---

## References

Key Research Papers & Sources:

1. **SWE-bench Verified** - OpenAI (2024): 68% of original samples flawed
   - https://openai.com/index/introducing-swe-bench-verified/

2. **Position Bias in LLM Judges** - arXiv 2406.07791: Systematic judge failures
   - https://arxiv.org/html/2406.07791v9

3. **LLM Judge Reliability** - arXiv 2412.12509: Self-inconsistency measurement
   - https://arxiv.org/html/2412.12509v2

4. **Human-in-the-Loop Code Review** - arXiv 2511.10865: Rubric-guided evaluation
   - https://arxiv.org/html/2511.10865v1

5. **Knowledge-Driven Judge Failures** - arXiv 2601.07506: Reference conflicts
   - https://arxiv.org/html/2601.07506v1

6. **Code Readability Assessment** - arXiv 2510.16579: Developer-guided prompting
   - https://arxiv.org/html/2510.16579v1

7. **Evaluation Guideline Vulnerabilities** - NAACL 2024: Detecting flawed rubrics
   - https://aclanthology.org/2024.naacl-long.441.pdf

8. **Industry AI Impact Measurement** - DX Engineering Metrics
   - https://getdx.com/blog/how-top-companies-measure-ai-impact-in-engineering/

---

## Next Steps

1. Review this document with team
2. Prioritize improvements based on effort/impact
3. Start with Phase 1 quick wins
4. Establish baseline measurements before changes
5. Track improvement metrics quarterly
