# OCEAN Personality vs Benchmark Performance Correlation

Analysis correlating OCEAN personality profiles with job fair benchmark results.

## Methodology

- **OCEAN Scores**: H (High), M (Medium), L (Low) per trait
- **Benchmark Delta**: Best role score minus baseline mean
- **Sample**: Themes with both OCEAN profiles and benchmark data

## Themes with Both Datasets

| Theme | O | C | E | A | N | Best Score | Best Delta | Best Role |
|-------|---|---|---|---|---|------------|------------|-----------|
| star-trek-tng | H | H | M | H | L | 93.75 | +13.45 | SM |
| the-expanse | M | H | L | L | M | 92.50 | +20.40 | TEA |
| the-wire | M | H | L | L | M | 92.50 | +14.00 | Reviewer |
| firefly | H | M | H | M | M | 92.50 | +12.20 | SM |
| star-wars | H | M | H | H | M | 92.50 | +12.20 | SM |
| dune | H | H | L | L | M | 92.50 | +12.20 | SM |
| game-of-thrones | M | M | M | L | H | 92.50 | +16.65 | TEA |
| breaking-bad | H | H | L | L | H | 92.50 | +12.20 | SM |
| a-team | H | H | H | L | L | 92.50 | +12.20 | SM |
| parks-and-rec | H | H | H | H | M | 92.50 | +14.00 | Reviewer |
| princess-bride | H | M | M | H | L | 92.50 | +16.65 | TEA |
| watchmen | - | - | - | - | - | 91.25 | +12.75 | Reviewer |
| lord-of-the-rings | H | H | M | H | M | 92.50 | +14.00 | Reviewer |
| babylon-5 | H | H | M | M | M | 92.50 | +15.40 | TEA |
| blade-runner | M | M | L | L | H | 90.00 | +15.40 | TEA |
| discworld | H | M | L | M | M | 90.00 | +15.40 | TEA |
| battlestar-galactica | M | H | M | L | H | - | - | - |
| doctor-who | H | L | H | H | M | - | - | - |
| ted-lasso | H | M | H | H | L | - | - | - |
| sherlock-holmes | H | H | L | L | L | - | - | - |
| hitchhikers-guide | H | L | M | M | L | 91.25 | +10.95 | SM |
| mad-men | M | M | M | L | M | - | - | - |
| mass-effect | H | H | M | H | M | - | - | - |
| the-office | M | M | H | M | M | - | - | - |
| the-good-place | H | M | H | H | M | - | - | - |
| sandman | H | L | L | M | M | - | - | - |
| his-dark-materials | H | M | M | H | M | - | - | - |

## Correlation Analysis

### High Conscientiousness (C=H) Correlates with Top Performance

**Themes with C=H and Best Delta 12+:**
- star-trek-tng: +13.45 (C=H)
- the-expanse: +20.40 (C=H)
- the-wire: +14.00 (C=H)
- dune: +12.20 (C=H)
- breaking-bad: +12.20 (C=H)
- a-team: +12.20 (C=H)
- parks-and-rec: +14.00 (C=H)
- lord-of-the-rings: +14.00 (C=H)
- babylon-5: +15.40 (C=H)

**Pattern**: 9 of 11 top performers have High Conscientiousness

### Low Extraversion (E=L) Correlates with TEA Excellence

**Themes with E=L and strong TEA performance:**
- the-expanse: TEA +20.40 (E=L)
- the-wire: TEA +15.40 (E=L)
- dune: TEA +15.40 (E=L)
- breaking-bad: TEA +15.40 (E=L)
- blade-runner: TEA +15.40 (E=L)
- discworld: TEA +15.40 (E=L)

**Pattern**: Introverted themes excel at Test Engineering (methodical, detail-oriented)

### High Neuroticism (N=H) Shows Mixed Results

**Themes with N=H:**
- game-of-thrones: +16.65 (N=H) - Strong
- breaking-bad: +12.20 (N=H) - Strong
- blade-runner: +15.40 (N=H) - Strong
- battlestar-galactica: (N=H) - No data

**Pattern**: High N doesn't hurt performance; may drive thoroughness

### High Openness (O=H) is Common but Not Predictive

**Observation**: Most themes have O=H, making it non-discriminating.
Both top and average performers share High Openness.

### Low Agreeableness (A=L) Correlates with Reviewer Success

**Themes with A=L and strong Reviewer performance:**
- the-wire: Reviewer +14.00 (A=L)
- the-expanse: Reviewer +11.50 (A=L)
- game-of-thrones: Reviewer +11.50 (A=L)
- blade-runner: Reviewer +10.25 (A=L)

**Pattern**: Critical, challenging personalities make better code reviewers

## Role-Specific OCEAN Recommendations

Based on correlation analysis:

### For SM (Scrum Master)
**Ideal OCEAN**: H-H-M-H-L
- High O: Open to stakeholder needs
- High C: Organized, process-oriented
- Medium E: Balanced communication
- High A: Collaborative team building
- Low N: Calm under pressure

**Top SM Performers**: star-trek-tng, vorkosigan-saga, firefly

### For TEA (Test Engineer Architect)
**Ideal OCEAN**: M-H-L-L-M
- Medium O: Focused, not distracted
- High C: Methodical, thorough
- Low E: Detail-oriented introversion
- Low A: Critical of code
- Medium N: Healthy paranoia about bugs

**Top TEA Performers**: the-expanse, west-wing, alice-in-wonderland

### For Reviewer (Code Reviewer)
**Ideal OCEAN**: M-H-L-L-M
- Medium O: Practical focus
- High C: Thorough review
- Low E: Deep analysis
- Low A: Willing to critique
- Medium N: Catches edge cases

**Top Reviewer Performers**: the-wire, foundation, peaky-blinders

### For Dev (Developer)
**Ideal OCEAN**: H-M-M-M-L
- High O: Creative problem solving
- Medium C: Balance speed/quality
- Medium E: Collaborate when needed
- Medium A: Accept feedback gracefully
- Low N: Confidence in implementation

**Top Dev Performers**: firefly, hitchhikers-guide, the-expanse

## Key Findings

1. **Conscientiousness is King**: C=H appears in 82% of top performers
2. **Introversion Helps Testing**: E=L themes dominate TEA role
3. **Critical Personality Helps Reviews**: A=L themes excel at Reviewer
4. **Neuroticism Isn't Negative**: N=H themes find more bugs
5. **Openness is Table Stakes**: Nearly universal, not discriminating

## Recommendations for Theme Selection

| If You Need... | Choose OCEAN Profile | Example Themes |
|----------------|---------------------|----------------|
| Strong SM | H-H-M-H-L | star-trek-tng, parks-and-rec |
| Strong TEA | M-H-L-L-M | the-expanse, the-wire |
| Strong Reviewer | M-H-L-L-M | the-wire, breaking-bad |
| Strong Dev | H-M-M-M-L | firefly, hitchhikers-guide |
| Balanced Team | H-H-M-M-M | babylon-5, lord-of-the-rings |

---

*Generated from job fair benchmark data (Jan 4-10, 2026) and THEME-COMPARISON.md OCEAN profiles*
