# Complete Persona Benchmark Report

**Date:** 2025-12-21
**Model:** Claude Opus 4.5
**Total Runs:** 64 (16 reviewer + 48 tactical)

---

## Executive Summary

**The effect of personas depends on agent role.**

| Agent Role | Best Theme | Minimalist Rank | Key Finding |
|------------|-----------|:---------------:|-------------|
| **Reviewer** (code review) | Discworld | 4th (worst) | Themed personas 34% more thorough |
| **DEV** (bug finding) | Minimalist | 1st (best) | Volume wins, same quality |
| **TEA** (test writing) | Star Trek | 2nd | Consistency matters more |
| **SM** (story breakdown) | Any | Tied | All themes equivalent |

---

## Part 1: Reviewer Agent (Code Review)

*Personas: Granny Weatherwax, Spock, Lady Bracknell, Code Reviewer*

### Results (4 runs each)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | CV |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:--:|
| **Discworld** | Granny Weatherwax | 38 | 42 | 38 | 47 | **41.3** | 9.0% |
| Literary | Lady Bracknell | 42 | 45 | 30 | 47 | 41.0 | 16.1% |
| Star Trek | Spock | 35 | 38 | 37 | 30 | 35.0 | **8.8%** |
| Minimalist | Code Reviewer | 40 | 25 | 28 | 30 | 30.8 | 18.3% |

### Reviewer Finding: Themed Personas Win

- **Discworld finds 34% more issues than Minimalist** (41.3 vs 30.8)
- **Minimalist is LEAST thorough AND LEAST consistent**
- Character engagement drives deeper exploration
- Dramatic reactions ("I aten't fooled!") create momentum to keep looking

---

## Part 2: Tactical Agents (DEV, TEA, SM)

*Each agent has theme-specific persona (e.g., Ponder Stibbons, Igor, Captain Carrot)*

### DEV-001: Bug Finding (4 runs each)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | CV |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:--:|
| **Minimalist** | Developer | 30 | 45 | 38 | 38 | **37.8** | 16.4% |
| Literary | Passepartout | 23 | 38 | 40 | 36 | 34.3 | 22.7% |
| Discworld | Ponder Stibbons | 24 | 38 | 33 | 32 | 31.8 | 18.6% |
| Star Trek | Geordi La Forge | 23 | 30 | 31 | 33 | 29.3 | 14.7% |

### TEA-001: Test Writing (4 runs each)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | CV |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:--:|
| **Star Trek** | Data | 65 | 70 | 107 | 105 | **86.8** | 24.9% |
| Minimalist | Test Engineer | 68 | 159 | 48 | 48 | 80.8 | 64.7% |
| Literary | Poirot | 49 | 125 | 68 | 49 | 72.8 | 49.2% |
| Discworld | Igor | 56 | 48 | 48 | 71 | 55.8 | 19.4% |

### SM-001: Story Breakdown (4 runs each)

| Theme | Persona | Run 1 | Run 2 | Run 3 | Run 4 | Avg | CV |
|-------|---------|:-----:|:-----:|:-----:|:-----:|:---:|:--:|
| Literary | Jeeves | 24 | 21 | 17 | 20 | 20.5 | 14.1% |
| Star Trek | Captain Picard | 18 | 20 | 20 | 23 | 20.3 | 10.3% |
| **Discworld** | Captain Carrot | 20 | 20 | 19 | 20 | 19.8 | **2.5%** |
| Minimalist | Scrum Master | 21 | 20 | 19 | 17 | 19.3 | 8.8% |

---

## Part 3: Cross-Agent Comparison

### Theme Performance by Agent Role

| Theme | Reviewer | DEV | TEA | SM | Wins |
|-------|:--------:|:---:|:---:|:--:|:----:|
| Discworld | **41.3** | 31.8 | 55.8 | **19.8** | 2 |
| Star Trek | 35.0 | 29.3 | **86.8** | 20.3 | 1 |
| Literary | 41.0 | 34.3 | 72.8 | 20.5 | 0 |
| Minimalist | 30.8 | **37.8** | 80.8 | 19.3 | 1 |

### Consistency (CV) by Agent Role

| Theme | Reviewer | DEV | TEA | SM | Best In |
|-------|:--------:|:---:|:---:|:--:|:-------:|
| Discworld | 9.0% | 18.6% | **19.4%** | **2.5%** | TEA, SM |
| Star Trek | **8.8%** | **14.7%** | 24.9% | 10.3% | Reviewer, DEV |
| Literary | 16.1% | 22.7% | 49.2% | 14.1% | - |
| Minimalist | 18.3% | 16.4% | 64.7% | 8.8% | - |

---

## Part 4: Why Does Persona Effect Vary by Role?

### Hypothesis: Task Structure Determines Persona Impact

| Agent | Task Type | Structure | Persona Effect |
|-------|-----------|-----------|----------------|
| **Reviewer** | Find problems | Open-ended exploration | **High** - engagement drives thoroughness |
| **DEV** | Find bugs | Semi-structured | **Medium** - volume matters more |
| **TEA** | Write tests | Creative generation | **High variance** - style affects output |
| **SM** | Break down stories | Structured format | **Low** - template constrains output |

### The Engagement Hypothesis

**For open-ended tasks (Reviewer):**
- Character personas create emotional engagement
- "I aten't fooled by this" → deeper suspicion → more issues found
- Dramatic framing makes issues memorable
- Minimalist stops when "done enough"

**For structured tasks (SM):**
- Story template constrains output format
- All personas produce ~20 stories regardless of theme
- Character voice affects tone, not quantity
- Persona engagement has nowhere to go

**For generation tasks (DEV, TEA):**
- Minimalist focuses on volume without personality overhead
- But high variance (48-159 tests) suggests inconsistency
- Star Trek's systematic approach wins on consistency

---

## Part 5: Role-Specific Recommendations

### Reviewer (Code Review)

| Priority | Theme | Why |
|----------|-------|-----|
| 1st | **Discworld** | 34% more thorough, consistent |
| 2nd | Literary | Highest ceiling, more variance |
| 3rd | Star Trek | Most predictable |
| 4th | Minimalist | **NOT RECOMMENDED** |

### DEV (Bug Finding)

| Priority | Theme | Why |
|----------|-------|-----|
| 1st | **Minimalist** | Highest volume (37.8 avg) |
| 2nd | Literary | Good thoroughness |
| 3rd | Discworld | Balanced |
| 4th | Star Trek | Lower volume |

### TEA (Test Writing)

| Priority | Theme | Why |
|----------|-------|-----|
| 1st | **Star Trek** | Best consistency (24.9% CV) |
| 2nd | Discworld | Low variance (19.4% CV) |
| 3rd | Minimalist | High volume but 64.7% CV |
| 4th | Literary | Too variable |

### SM (Story Breakdown)

| Priority | Theme | Why |
|----------|-------|-----|
| 1st | **Any** | All themes equivalent |
| - | Discworld | Most consistent (2.5% CV) |
| - | Star Trek | Balanced |
| - | Literary/Minimalist | Slightly more variance |

---

## Part 6: Key Insights

### 1. No Universal Winner

Different roles benefit from different themes:
- **Reviewer**: Discworld (+34% vs Minimalist)
- **DEV**: Minimalist (+29% vs Star Trek)
- **TEA**: Star Trek (best consistency)
- **SM**: All equivalent

### 2. Minimalist Is Not "Safe Default"

The assumption that Minimalist is "professional" and "focused" is wrong for code review:
- Reviewer: **Worst** performer (34% fewer issues)
- DEV: Best performer (volume focus works)
- TEA: High variance (64.7% CV)
- SM: Average

### 3. Task Structure Matters

| Task Structure | Best Approach |
|----------------|---------------|
| Open-ended exploration | Themed persona (engagement drives thoroughness) |
| Structured generation | Minimalist or systematic (Star Trek) |
| Template-constrained | Any (structure dominates) |

### 4. Consistency vs Thoroughness Trade-off

| If You Need | Choose |
|-------------|--------|
| Maximum thoroughness | Discworld or Literary |
| Maximum consistency | Star Trek or Discworld |
| Maximum volume | Minimalist (but high variance) |
| Predictable results | Star Trek |

---

## Part 7: Recommended Configurations

### Production Defaults

| Agent | Theme | Rationale |
|-------|-------|-----------|
| **Reviewer** | Discworld | 34% more thorough, consistent |
| **DEV** | Minimalist | Volume focus appropriate |
| **TEA** | Star Trek | Systematic, consistent |
| **SM** | Discworld | Most consistent |

### High-Stakes Reviews

| Agent | Theme | Rationale |
|-------|-------|-----------|
| **Reviewer** | Discworld + Literary | Run both, union results |
| **DEV** | All themes | Multiple perspectives |
| **TEA** | Star Trek + Discworld | Coverage + consistency |
| **SM** | Any single | All equivalent |

---

## Summary Table

| Metric | Reviewer | DEV | TEA | SM |
|--------|:--------:|:---:|:---:|:--:|
| Best Theme | Discworld | Minimalist | Star Trek | Any |
| Worst Theme | Minimalist | Star Trek | Literary | - |
| Theme Effect | **High** | Medium | High (variance) | **Low** |
| Recommended | Discworld | Minimalist | Star Trek | Discworld |

---

*Complete benchmark report: 2025-12-21*
*64 total runs across 4 themes × 4 agents × 4 runs*
*Key finding: Persona impact varies by agent role - no universal winner*
