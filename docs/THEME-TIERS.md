# Theme Performance Tiers

This document ranks all 101 persona themes based on **benchmark performance** - how well themed agents perform compared to the neutral control baseline.

## Understanding the Scores

When we benchmark a themed agent (e.g., `discworld:reviewer`), we compare it against the `control:reviewer` baseline:

- **Score**: Absolute performance (0-100) on the scenario
- **Delta**: How many points above/below the control baseline
- A positive delta means the themed persona **outperforms** the neutral control

## Tier System

| Tier | Meaning | Count |
|------|---------|-------|
| **S** | Elite - Scores 90+ with strong baseline beats across multiple roles | 5 |
| **A** | Excellent - High scores (85+) or large baseline improvements (20+) | 13 |
| **B** | Good - Solid scores (80+) or meaningful baseline beats (10-20) | 15 |
| **C** | Average - Moderate baseline improvements (5-10) | 22 |
| **F** | Benchmarked - Has data but minimal numeric results | 11 |
| **U** | Unknown - No benchmark data yet | 35 |

## S-Tier (Elite Performers)

Themes that consistently outperform the control baseline with top-tier scores.

| Theme | Best Score | vs Control | Highlights |
|-------|------------|------------|------------|
| **mash** | 95.0 | +17.0 | Radar 95.0 TEA (precognitive edge case finding), Winchester 92.5 reviewer |
| **breaking-bad** | 90.62 | +12.6 | Mike 90.62 reviewer (meticulous observation), Hank 88.12 SM |
| **star-wars** | 91.87 | +13.9 | Thrawn 91.87 SM (strategic planning), Han 86.25 TEA |
| **firefly** | 92.5 | +14.5 | Zoe 92.5 SM, River 88.8 reviewer, Jayne 87.5 TEA |
| **cowboy-bebop** | 90.0 | +12.0 | Ed 90.0 reviewer (genius hacker), Spike 90.0 SM |

## A-Tier (Strong Performers)

Themes with high absolute scores or significant baseline improvements.

| Theme | Best Score | vs Control | Why It Beats Baseline |
|-------|------------|------------|----------------------|
| **futurama** | 92.5 | +14.5 | Leela's decisiveness, Professor's edge case creativity |
| **shakespeare** | 92.5 | +14.5 | Prospero's wisdom (SM), Hamlet's thorough analysis (TEA) |
| **the-matrix** | 92.5 | +14.5 | Morpheus's clarity of vision for team leadership |
| **dickens** | 92.5 | +14.5 | Micawber's optimism inspires teams |
| **fargo** | 91.25 | +13.25 | Wrench's silent observation catches everything |
| **ted-lasso** | 85.0 | +42.50 | Roy's pragmatic intensity vs control's neutrality |
| **the-witcher** | 86.0 | +38.75 | Geralt's methodical monster-hunting approach |
| **renaissance-masters** | 84.0 | +36.25 | Machiavelli's strategic pragmatism |
| **hannibal** | 85.0 | +30.00 | Jack Crawford's investigative rigor |
| **don-quixote** | 83.0 | +28.12 | Sancho's grounded practicality |
| **agatha-christie** | 82.0 | +26.25 | Ariadne Oliver's writer's intuition |
| **world-explorers** | 81.0 | +25.62 | Amundsen's meticulous preparation |
| **succession** | 80.0 | +23.75 | Frank's corporate survival instincts |

## B-Tier (Good Performers)

Themes with solid scores and meaningful baseline improvements.

| Theme | vs Control | Why It Beats Baseline |
|-------|------------|----------------------|
| **parks-and-rec** | +21.25 | Ron's no-nonsense approach cuts through noise |
| **les-miserables** | +20.62 | Bishop's moral clarity in complex situations |
| **enlightenment-thinkers** | +18.75 | Franklin's practical wisdom |
| **watchmen** | +17.50 | Dr. Manhattan's omniscient perspective |
| **legion-of-doom** | +16.25 | Brainiac's cold logic finds issues |
| **jazz-legends** | +15.62 | Miles Davis's innovative thinking |
| **black-sails** | +15.00 | Flint's strategic foresight |
| **vorkosigan-saga** | +13.75 | Miles's lateral problem-solving |
| **film-auteurs** | +12.50 | Hitchcock's attention to detail |
| **dune** | +10.62 | Leto II's prescience, Thufir's analysis |
| **count-of-monte-cristo** | +11.87 | Abbe Faria's patient wisdom |
| **ancient-philosophers** | +11.25 | Diogenes cuts through pretense |
| **the-americans** | +10.00 | Claudia's spy tradecraft |
| **his-dark-materials** | +10.0 | Lee Scoresby's practical grounding |
| **blade-runner** | +10.0 | Roy Batty's intensity and focus |

## C-Tier (Moderate Performers)

Themes with modest but positive baseline improvements.

| Theme | vs Control | Notes |
|-------|------------|-------|
| **scientific-revolutionaries** | +9.37 | Feynman's unconventional thinking |
| **neuromancer** | +8.75 | Wintermute's AI perspective |
| **west-wing** | +7.5 | Toby's meticulous communication |
| **princess-bride** | +7.50 | Inigo's dedication and focus |
| **doctor-who** | +7.5 | River Song's resourcefulness |
| **game-of-thrones** | +7.5 | Tyrion's strategic thinking |
| **inspector-morse** | +7.50 | Bright's quiet competence |
| **deadwood** | +7.50 | Seth's principled determination |
| **big-lebowski** | +7.50 | Walter's intensity (when channeled) |
| **rome** | +6.88 | Vorenus's disciplined approach |
| **software-pioneers** | +6.25 | Knuth's algorithmic rigor |
| **marvel-mcu** | +6.25 | Coulson's organizational skills |
| **the-sopranos** | +6.25 | Tony's decisive leadership |
| **the-crown** | +5.62 | Philip's military precision |
| **justified** | +5.62 | Art's experienced oversight |
| **moby-dick** | +5.62 | Obsessive attention to detail |
| **foundation** | +5.0 | Encyclopedia's methodical approach |
| **star-trek-tos** | +5.0 | Spock's logical analysis |
| **gothic-literature** | +5.0 | Hyde's aggressive edge case finding |
| **the-office** | 87.5 | Dwight's thorough (if eccentric) reviews |
| **the-good-place** | 87.5 | Janet's comprehensive knowledge |
| **house-md** | 85.0 | Foreman's systematic testing |

## F-Tier (Benchmarked, Limited Data)

Themes that have been benchmarked but lack complete numeric results.

| Theme | Roles Tested | Notes |
|-------|--------------|-------|
| **hitchhikers-guide** | 8 | Broad coverage, qualitative results |
| **norse-mythology** | 7 | Full pantheon tested |
| **lord-of-the-rings** | 7 | Fellowship tested across roles |
| **classical-composers** | 4 | Titan characters tested |
| **catch-22** | 4 | Absurdist approach tested |
| **the-expanse** | 4 | Pragmatic crew tested |
| **the-wire** | 2 | Stringer/Omar specializations |
| **great-gatsby** | 2 | Gatsby confirmed effective SM |
| **sherlock-holmes** | 2 | +2.5 vs control |
| **harry-potter** | 2 | +2.5 vs control |
| **monty-python** | 4 | Colonel 91.25 reviewer (+11.75), mixed other roles |

## U-Tier (Awaiting Benchmarks)

No benchmark data available. These themes use default character assignments and may perform well, but we don't have data yet.

| Theme | Source |
|-------|--------|
| 1984 | George Orwell |
| a-team | TV Series |
| alice-in-wonderland | Lewis Carroll |
| ancient-strategists | Historical |
| arcane | League of Legends |
| arthurian-mythos | Arthurian Legend |
| avatar-the-last-airbender | Animated Series |
| babylon-5 | TV Series |
| battlestar-galactica | TV Series |
| better-call-saul | TV Series |
| bobiverse | Dennis E. Taylor |
| control | Video Game |
| discworld | Terry Pratchett |
| expeditionary-force | Craig Alanson |
| gilligans-island | TV Series |
| greek-mythology | Classical |
| historical-figures | Historical |
| imperial-radch | Ann Leckie |
| jane-austen | Literature |
| lovecraft-mythos | H.P. Lovecraft |
| mad-max | Film Series |
| mad-men | TV Series |
| mass-effect | Video Game |
| military-commanders | Historical |
| peaky-blinders | TV Series |
| russian-masters | Literature |
| sandman | Neil Gaiman |
| snow-crash | Neal Stephenson |
| star-trek-tng | TV Series |
| superfriends | Animated Series |
| the-odyssey | Classical |
| the-simpsons | Animated Series |
| twin-peaks | TV Series |
| x-files | TV Series |
| wwii-leaders | Historical |

## How Benchmarking Works

The benchmarking process compares themed agents against a neutral control:

1. **Control Baseline**: Run `control:{role}` on a scenario multiple times to establish baseline performance
2. **Themed Run**: Run `{theme}:{role}` on the same scenario
3. **Calculate Delta**: `themed_score - control_score = improvement`
4. **Statistical Analysis**: Effect size (Cohen's d) determines if the difference is significant

A themed agent beats the baseline when their persona traits provide an advantage:
- Better pattern recognition (Sherlock, Poirot)
- More thorough analysis (Data, Igor)
- Strategic thinking (Vetinari, Thrawn)
- Unconventional perspectives (Diogenes, The Dude)

## Recommendations

### For Production Use
- **S-tier and A-tier themes** have proven baseline improvements
- These themes don't just add character - they improve results

### For Experimentation
- **U-tier themes** may perform excellently but lack data
- Run `/solo {theme}:{role} --scenario {name}` to test
- Run `/benchmark {theme} {role}` for formal comparison

### For Contributing
- Benchmark an U-tier theme you enjoy
- Report results to help build the dataset

## See Also

- [PERSONAS.md](PERSONAS.md) - How the persona system works
- [THEME-COMPARISON.md](THEME-COMPARISON.md) - OCEAN profiles and visual mappings
- [BENCHMARKING.md](BENCHMARKING.md) - Complete benchmarking guide
- `/job-fair` command - Test all characters across all roles
