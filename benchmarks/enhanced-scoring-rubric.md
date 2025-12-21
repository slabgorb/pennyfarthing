# Enhanced Persona Benchmark Scoring Rubric

## Purpose

This rubric measures **thoroughness and quality beyond the floor**, not just whether minimum criteria were met.

---

## Scoring Categories

### 1. Detection Metrics (Quantitative)

| Metric | Description | Scoring |
|--------|-------------|---------|
| `baseline_found` | Issues from the known seeded list | Count / Total |
| `total_findings` | ALL issues identified (including bonus) | Raw count |
| `bonus_discoveries` | Valid issues NOT in the seeded list | Raw count |
| `false_positives` | Non-issues flagged as problems | Raw count (penalty) |

**Bonus Discovery Examples:**
- Code style issues not explicitly seeded
- Performance concerns
- Maintainability issues
- Additional security vectors
- Missing best practices

---

### 2. Depth Metrics (1-5 Scale)

| Metric | 1 (Shallow) | 3 (Adequate) | 5 (Exceptional) |
|--------|-------------|--------------|-----------------|
| `root_cause_analysis` | Just identifies symptom | Explains why it's wrong | Traces to architectural/design cause |
| `fix_specificity` | "Fix this" | General guidance | Actual code with line numbers |
| `impact_assessment` | No impact mentioned | Lists one impact | Full attack chain / cascade effects |
| `cross_references` | Issues in isolation | Notes some connections | Maps issue relationships |

---

### 3. Quality Metrics (1-5 Scale)

| Metric | 1 (Poor) | 3 (Good) | 5 (Excellent) |
|--------|----------|----------|---------------|
| `severity_accuracy` | Misclassified >50% | Minor misclassifications | All correct with justification |
| `reasoning_quality` | Assertions without proof | Some explanation | Clear logical chain |
| `contextual_awareness` | Ignores broader context | Mentions some context | Considers patterns, related code, architecture |
| `actionability` | Vague guidance | Clear next steps | Prioritized action plan with effort estimates |

---

### 4. Organization Metrics (1-5 Scale)

| Metric | 1 (Chaotic) | 3 (Organized) | 5 (Exemplary) |
|--------|-------------|---------------|---------------|
| `structure` | Stream of consciousness | Logical sections | Clear hierarchy, scannable |
| `prioritization` | Random order | Grouped by severity | Ordered by impact/effort ratio |
| `completeness` | Missing key elements | Covers main points | Executive summary + details + action items |

---

### 5. Persona Metrics (1-5 Scale)

| Metric | 1 (Broken) | 3 (Consistent) | 5 (Masterful) |
|--------|------------|----------------|---------------|
| `character_consistency` | Dropped character | Mostly in character | Never breaks, uses catchphrases naturally |
| `persona_value_add` | Persona detracts | Neutral effect | Persona enhances memorability/clarity |
| `engagement` | Boring/annoying | Pleasant | Would actively enjoy working with |

---

## Composite Scores

### Thoroughness Score
```
thoroughness = (total_findings / baseline_issues) * 100
```
- 100% = Found exactly the baseline
- 150% = Found 50% more than baseline
- 200% = Found double the baseline

### Quality Score
```
quality = avg(depth_metrics) * 0.4 + avg(quality_metrics) * 0.4 + avg(organization_metrics) * 0.2
```

### Overall Score
```
overall = (thoroughness_normalized * 0.5) + (quality_score * 0.5)
```

---

## Evaluation Process

1. **Capture full output** - Save complete agent response
2. **Count all findings** - Enumerate every issue identified
3. **Validate bonus discoveries** - Confirm they're real issues
4. **Score each metric** - Use rubric above
5. **Calculate composites** - Compute thoroughness and quality scores
6. **Compare across personas** - Identify statistically significant differences

---

## What We're Testing

**Hypothesis:** Different persona traits produce measurably different:
- Total findings (beyond baseline)
- Depth of analysis
- Quality of explanations
- Organization of output

**Null Hypothesis:** Personas only affect communication style, not thoroughness or quality.
