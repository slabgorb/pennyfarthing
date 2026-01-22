# Epic 11: OCEAN Personality Visualization with Chernoff Faces

## Overview

Visualize agent personality profiles using Chernoff faces mapped to OCEAN (Big Five) personality traits. This enables visual exploration of "what personality performs well at X?" by correlating Chernoff faces with benchmark performance data.

## Business Value

- **Benchmark Correlation:** Correlate personality traits with agent performance metrics
- **Theme Selection:** Help users choose themes based on personality fit for their work
- **Documentation:** Visual representation of 630 agent personas across 63 themes
- **Research:** Enable personality-based analysis of agent effectiveness

## Technical Architecture

### OCEAN Framework (Big Five)

| Dimension | Low | High |
|-----------|-----|------|
| **O**penness | Conventional, practical | Imaginative, curious |
| **C**onscientiousness | Flexible, spontaneous | Disciplined, methodical |
| **E**xtraversion | Reserved, solitary | Sociable, energetic |
| **A**greeableness | Skeptical, competitive | Trusting, cooperative |
| **N**euroticism | Calm, stable | Anxious, reactive |

### OCEAN → Chernoff Face Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                    CHERNOFF FACE                            │
│                                                             │
│     Eyebrows (Agreeableness)      Line Weight (Neuroticism) │
│         ╱  ╲  friendly               ━━━ heavy = intense    │
│         ╲  ╱  critical               ─── light = calm       │
│                                                             │
│         Eyes (Openness)                                     │
│         ◉ ◉  large = curious                                │
│         • •  small = practical                              │
│                                                             │
│         Face Shape (Conscientiousness)                      │
│         ⬭ angular = structured                              │
│         ◯ round = relaxed                                   │
│                                                             │
│         Mouth (Extraversion)                                │
│         ⌣ wide smile = outgoing                             │
│         ─ narrow = reserved                                 │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Theme YAML (ocean scores)
        │
        ▼
┌───────────────────┐
│  generate-face.sh │  Parse OCEAN, apply mapping
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   SVG Output      │  Scalable vector face
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Markdown Index   │  Team photos, role comparisons
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Benchmark Reports │  Personality → Performance
└───────────────────┘
```

## Theme YAML Schema Addition

```yaml
agents:
  sm:
    character: Seth Bullock
    ocean:
      O: 2  # Low openness - conventional lawman
      C: 5  # High conscientiousness - law and order
      E: 3  # Medium extraversion - intense but reserved
      A: 3  # Medium agreeableness - principled but stern
      N: 3  # Medium neuroticism - barely contained rage
    style: Former marshal bringing law to chaos...
```

## File Structure

```
pennyfarthing-dist/personas/
├── OCEAN-BENCHMARKING.md      # Existing - role recommendations
├── OCEAN-TO-FACE.md           # NEW - mapping specification
├── faces/                     # NEW - generated SVG faces
│   ├── deadwood/
│   │   ├── sm.svg
│   │   ├── tea.svg
│   │   └── ...
│   ├── firefly/
│   └── ...
├── reports/                   # NEW - generated reports
│   ├── matrix.md              # 63×10 face grid
│   ├── by-role/               # All SMs, all TEAs, etc.
│   └── by-ocean/              # High-O characters, Low-A, etc.
└── themes/
    ├── deadwood.yaml          # MODIFIED - add ocean blocks
    └── ...
```

## Implementation Phases

### Phase 1: Proof of Concept (12 pts)
- **11-1:** Define OCEAN → facial feature mapping spec (2 pts)
- **11-2:** Add OCEAN profiles to 10 anchor themes (3 pts)
- **11-3:** Build Chernoff face generator (OCEAN → SVG) (5 pts)
- **11-4:** Generate anchor theme faces + markdown report (2 pts)

**Deliverable:** 100 faces across 10 themes, working generator

### Phase 2: Full Coverage (11 pts)
- **11-5:** Add OCEAN profiles to remaining 53 themes (8 pts)
- **11-6:** Generate full 630-face matrix with index (3 pts)

**Deliverable:** All 630 faces, complete navigation

### Phase 3: Analysis Tools (8 pts)
- **11-7:** Build slice/report generator (3 pts)
- **11-8:** Integrate with benchmark output (5 pts)

**Deliverable:** Personality → performance correlation

## Anchor Themes (Phase 1)

Selected for variety and documentation quality:

| Theme | Universe | Key Characteristic |
|-------|----------|-------------------|
| deadwood | HBO Western | High N, intense characters |
| firefly | Joss Whedon | Full E spectrum |
| breaking-bad | AMC Drama | Extreme C variance |
| the-good-place | NBC Comedy | Ethics focus |
| star-trek-tng | Sci-Fi | Classic archetypes |
| discworld | Terry Pratchett | Rich character psychology |
| fargo | Coen Brothers | Low N (Midwestern stoicism) |
| succession | HBO Drama | Low A dominance |
| mass-effect | BioWare | Alien perspectives |
| software-pioneers | Historical | Grounded real profiles |

## SVG Generation Approach

### Technology Options

1. **Shell + Template** - Simple sed/awk substitution into SVG template
2. **Node.js** - Use D3.js or custom SVG generation
3. **Python** - matplotlib or svgwrite library

**Recommendation:** Node.js with template literals for clean SVG output and easy YAML parsing.

### SVG Parameters

| Feature | OCEAN | Parameter | Range |
|---------|-------|-----------|-------|
| Eye size | O | radius | 6px → 14px |
| Face shape | C | width/height ratio | 0.9 → 1.1 |
| Face corners | C | rx/ry | 50% → 20% |
| Mouth curve | E | path bezier | flat → curved |
| Mouth width | E | width | 20px → 40px |
| Brow angle | A | rotation | -15° → +10° |
| Brow position | A | y-offset | +5px → -3px |
| Line weight | N | stroke-width | 1px → 3px |

## Dependencies

- **Existing:** OCEAN-BENCHMARKING.md provides character → OCEAN mappings
- **Existing:** 63 theme YAML files with character definitions
- **New:** yq for YAML parsing (already in project)
- **New:** SVG generation capability (Node.js or shell)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Face mapping feels arbitrary | Test with polar pairs, iterate based on feedback |
| 630 faces = large file size | Optimize SVGs, lazy-load in reports |
| OCEAN scoring subjectivity | Use OCEAN-BENCHMARKING.md as reference, document methodology |
| Benchmark correlation unclear | Start with simple metrics (success rate, token usage) |

## Success Metrics

- [ ] All 630 faces generated and viewable
- [ ] Faces visually distinct across OCEAN profiles
- [ ] At least 3 report types functional (by theme, by role, by OCEAN)
- [ ] Benchmark correlation shows meaningful patterns
- [ ] Users can answer "which personality works best for X?"

## References

- `pennyfarthing-dist/personas/OCEAN-BENCHMARKING.md` - Existing OCEAN documentation
- `pennyfarthing-dist/personas/attributes.yaml` - Attribute structure pattern
- Chernoff, H. (1973). "The Use of Faces to Represent Points in K-Dimensional Space"
