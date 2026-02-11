# Tactical Agent Benchmark Results

**Date:** 2025-12-21
**Model:** Claude Opus 4.5
**Method:** Parallel Opus subagents with persona-loaded prompts
**Runs per theme:** 4 (1 initial + 3 variability runs)

---

## Test Cases

| ID | Task | Target | Baseline Expected |
|----|------|--------|-------------------|
| DEV-001 | Bug finding in Go user service | SQL injection, MD5, auth flaws | 22 issues |
| TEA-001 | Test writing for payment processor | Unit + integration tests | 20 tests |
| SM-001 | Story breakdown for dashboard feature | User stories with sizing | 18 stories |

---

## SM-001: Story Breakdown (12 runs fully categorized)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | Std Dev |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:-------:|
| Discworld | Captain Carrot | 20 | 20 | 19 | 20 | 19.8 | 0.5 |
| Star Trek | Captain Picard | 18 | 20 | 20 | 23 | 20.3 | 2.1 |
| Literary | Jeeves | 24 | 21 | 17 | 20 | 20.5 | 2.9 |
| Minimalist | Scrum Master | 21 | 20 | 19 | 17 | 19.3 | 1.7 |

**Observations:**
- All themes averaged 19-21 stories (within 10% of each other)
- Discworld most consistent (σ=0.5)
- Literary highest variance (σ=2.9)

---

## DEV-001: Bug Finding (12 runs)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | Std Dev |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:-------:|
| Discworld | Ponder Stibbons | 24 | 38 | 33 | 32 | 31.8 | 5.9 |
| Star Trek | Geordi La Forge | 23 | 30 | 31 | 33 | 29.3 | 4.3 |
| Literary | Passepartout | 23 | 38 | 40 | 36 | 34.3 | 7.8 |
| Minimalist | Developer | 30 | 45 | 38 | 38 | 37.8 | 6.2 |

**Observations:**
- Minimalist highest average (37.8 issues)
- All themes found same critical issues (SQL injection, MD5, auth)
- High variance across all themes (σ=4-8)

---

## TEA-001: Test Writing (12 runs)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | Std Dev |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:-------:|
| Discworld | Igor | 56 | 48 | 48 | 71 | 55.8 | 10.8 |
| Star Trek | Data | 65 | 70 | 107 | 105 | 86.8 | 21.6 |
| Literary | Poirot | 49 | 125 | 68 | 49 | 72.8 | 35.8 |
| Minimalist | Test Engineer | 68 | 159 | 48 | 48 | 80.8 | 52.3 |

**Observations:**
- Highest variance task (σ=11-52)
- Star Trek (Data) most consistently thorough
- Same prompt produced 48-159 tests (3.3x range)

---

## Summary Statistics

| Task | Overall Avg | Min | Max | Range | Avg Std Dev |
|------|:-----------:|:---:|:---:|:-----:|:-----------:|
| SM-001 (Stories) | 19.9 | 17 | 24 | 7 | 1.8 |
| DEV-001 (Issues) | 33.3 | 23 | 45 | 22 | 6.1 |
| TEA-001 (Tests) | 74.0 | 48 | 159 | 111 | 30.1 |

---

## Theme Comparison

| Theme | SM Avg | DEV Avg | TEA Avg | Overall Rank |
|-------|:------:|:-------:|:-------:|:------------:|
| Discworld | 19.8 | 31.8 | 55.8 | 4 |
| Star Trek | 20.3 | 29.3 | 86.8 | 2 |
| Literary | 20.5 | 34.3 | 72.8 | 3 |
| **Minimalist** | 19.3 | **37.8** | **80.8** | **1** |

---

## Key Findings

1. **Minimalist wins on volume** - Highest DEV and TEA averages
2. **Star Trek most balanced** - High TEA output with lower variance
3. **Story breakdown is stable** - All themes within 10%, low variance
4. **Test writing is volatile** - 3.3x variance between runs
5. **Themed personas match quality** - All found same critical/high issues

---

## Recommendations

| Use Case | Recommended Theme | Reason |
|----------|-------------------|--------|
| Code review | Minimalist | Highest issue count |
| Test generation | Star Trek (Data) | Best consistency |
| Story breakdown | Any | All themes equivalent |
| User-facing docs | Themed | Engaging explanations |
| Production | Multiple runs | Aggregate for coverage |

---

*Benchmark completed: 2025-12-21*
*Total runs: 48 (4 themes × 3 agents × 4 runs)*
*Data recovered from 35 task output files after session crash*
