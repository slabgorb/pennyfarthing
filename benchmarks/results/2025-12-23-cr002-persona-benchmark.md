# Persona Benchmark Results: CR-002 Order Service
**Date:** 2025-12-23
**Test Case:** CR-002 (Go Order Service)
**Baseline Issues:** 22 seeded issues
**Model:** Opus (all runs)
**Runs Per Persona:** 3

---

## Executive Summary

All five personas significantly exceeded the baseline of 22 issues, finding between 195-235% of expected issues. **Shakespeare (Portia)** achieved the highest average issue count, while **Minimalist** was most consistent but found the fewest issues.

| Rank | Persona | Avg Issues | Thoroughness | Std Dev |
|------|---------|------------|--------------|---------|
| 1 | Shakespeare (Portia) | 51.7 | 235.0% | 5.7 |
| 2 | Discworld (Granny Weatherwax) | 49.3 | 224.1% | 1.2 |
| 3 | Jane Austen (Elizabeth Bennet) | 48.0 | 218.2% | 3.6 |
| 4 | Star Trek TOS (Dr. McCoy) | 46.3 | 210.5% | 1.2 |
| 5 | Minimalist (No Persona) | 43.0 | 195.5% | 1.7 |

---

## Detailed Results

### Discworld - Granny Weatherwax
*"I can't be having with this sort of thing."*

| Run | Issues Found | Thoroughness |
|-----|--------------|--------------|
| 1 | 48 | 218.2% |
| 2 | 50 | 227.3% |
| 3 | 50 | 227.3% |
| **Avg** | **49.3** | **224.1%** |

**Observations:**
- Very consistent across runs (std dev: 1.2)
- Strong practical wisdom approach
- Excellent at catching "common sense" issues
- Persona naturally suspicious of shortcuts

---

### Star Trek TOS - Dr. Leonard "Bones" McCoy
*"I'm a doctor, not a code monkey!"*

| Run | Issues Found | Thoroughness |
|-----|--------------|--------------|
| 1 | 47 | 213.6% |
| 2 | 47 | 213.6% |
| 3 | 45 | 204.5% |
| **Avg** | **46.3** | **210.5%** |

**Observations:**
- Most consistent performer (std dev: 1.2)
- Medical metaphors for "diagnosing" code ailments
- Strong focus on "patient safety" (error handling)
- Cantankerous style cuts through BS effectively

---

### Shakespeare - Portia
*"The quality of mercy is not strain'd..."*

| Run | Issues Found | Thoroughness |
|-----|--------------|--------------|
| 1 | 58 | 263.6% |
| 2 | 47 | 213.6% |
| 3 | 50 | 227.3% |
| **Avg** | **51.7** | **235.0%** |

**Observations:**
- Highest peak performance (Run 1: 58 issues)
- Most variance (std dev: 5.7)
- Eloquent legal/courtroom framing
- When "on," extremely thorough; some inconsistency

---

### Jane Austen - Elizabeth Bennet
*"I am not afraid of you..."*

| Run | Issues Found | Thoroughness |
|-----|--------------|--------------|
| 1 | 45 | 204.5% |
| 2 | 52 | 236.4% |
| 3 | 47 | 213.6% |
| **Avg** | **48.0** | **218.2%** |

**Observations:**
- Moderate variance (std dev: 3.6)
- Sharp wit cuts through pretentious code
- Strong social observation skills translate to pattern recognition
- Elegant yet pointed critique style

---

### Minimalist - Code Reviewer
*No persona - direct technical style*

| Run | Issues Found | Thoroughness |
|-----|--------------|--------------|
| 1 | 42 | 190.9% |
| 2 | 45 | 204.5% |
| 3 | 42 | 190.9% |
| **Avg** | **43.0** | **195.5%** |

**Observations:**
- Second most consistent (std dev: 1.7)
- Lowest average issue count
- Clean, direct technical communication
- No persona overhead, but also less "creative" issue finding

---

## Statistical Analysis

### Issue Count Summary
```
Total runs: 15
Overall mean: 47.7 issues
Overall std dev: 4.2

Per-persona means:
  Shakespeare:   51.7 (+4.0 above mean)
  Discworld:     49.3 (+1.6 above mean)
  Jane Austen:   48.0 (+0.3 above mean)
  Star Trek:     46.3 (-1.4 below mean)
  Minimalist:    43.0 (-4.7 below mean)
```

### Consistency vs Thoroughness Trade-off
```
Most Consistent:  Discworld, Star Trek (std dev: 1.2)
Most Thorough:    Shakespeare (avg: 51.7)
Most Reliable:    Discworld (high avg + low variance)
Baseline Floor:   Minimalist (lower ceiling, still 2x baseline)
```

### Persona Value-Add
The difference between the highest persona (Shakespeare: 51.7) and no persona (Minimalist: 43.0) is **8.7 issues** or **20.2% more findings**.

---

## Key Findings

### 1. Personas Improve Thoroughness
All persona-based reviewers outperformed the minimalist baseline, supporting the hypothesis that character traits enhance issue detection.

### 2. Character Traits Correlate with Strengths
- **Granny Weatherwax** (suspicious practical wisdom) → catches "too clever" code
- **Dr. McCoy** (diagnostic mindset) → strong error handling detection
- **Portia** (legal precision) → thorough argument analysis
- **Elizabeth Bennet** (social observation) → pattern recognition

### 3. Consistency vs Peak Performance
- **Discworld** offers best balance: high average (49.3) with low variance (1.2)
- **Shakespeare** has highest ceiling (58) but most variance (5.7)
- **Minimalist** is predictable but leaves issues on the table

### 4. The 20% Persona Premium
Using a well-suited persona adds approximately 20% more issue detection compared to no persona.

---

## Recommendations

1. **Default Reviewer Persona:** Discworld (Granny Weatherwax)
   - Best balance of thoroughness and consistency
   - Practical wisdom aligns well with code review goals

2. **High-Stakes Reviews:** Consider Shakespeare (Portia)
   - Highest peak detection rate
   - Accept variance in exchange for thoroughness

3. **Baseline/Quick Reviews:** Minimalist acceptable
   - Still exceeds baseline by 2x
   - Faster, less context needed

4. **Character Selection Matters**
   - Match persona traits to review goals
   - Skeptical characters find more issues

---

## Methodology Notes

- Each persona ran Opus model reviewing CR-002 test case
- Same prompt structure for all runs
- Full issue enumeration without early stopping
- Baseline: 22 known seeded issues
- Bonus issues validated as legitimate concerns

---

*Report generated: 2025-12-23*
*Benchmark framework: Pennyfarthing Enhanced Scoring Rubric v1.0*
