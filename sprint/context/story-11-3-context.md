# Story 11-3: Build Chernoff Face Generator (OCEAN → SVG)

**Epic:** 11 - OCEAN Personality Visualization with Chernoff Faces
**Points:** 5 | **Priority:** P1
**Status:** In Progress
**Dependencies:** 11-1 (spec complete), 11-2 (OCEAN data complete)

## Objective

Build a script that reads OCEAN personality scores from theme YAML files and generates SVG Chernoff faces. This is the core engine for Epic 11's personality visualization.

## Acceptance Criteria

- [ ] `scripts/generate-face.sh` or Node script functional
- [ ] Takes theme + agent as input, outputs SVG
- [ ] Faces visually distinct across OCEAN profiles
- [ ] SVGs render correctly in browsers and markdown

## Technical Context

### Input: OCEAN Scores in Theme YAML

```yaml
# From pennyfarthing-dist/personas/themes/deadwood.yaml
sm:
  character: Seth Bullock
  ocean:
    O: 2  # Low openness - conventional lawman
    C: 5  # Very high conscientiousness - law and order above all
    E: 3  # Medium extraversion - intense but reserved
    A: 3  # Medium agreeableness - principled but stern
    N: 4  # High neuroticism - barely contained rage
```

### Output: SVG Face

Base viewBox: 200x200, monochrome, scalable to any container.

### OCEAN → SVG Feature Mapping (from OCEAN-TO-FACE.md)

| OCEAN | Feature | Value 1 → Value 5 |
|-------|---------|-------------------|
| **O**penness | Eye radius | 6px → 14px |
| **C**onscientiousness | Face width/height | 100x100 (round) → 80x115 (angular) |
| **C**onscientiousness | Corner radius | 50% → 10% |
| **E**xtraversion | Mouth width | 15px → 40px |
| **E**xtraversion | Mouth curve | flat → strong up |
| **A**greeableness | Eyebrow angle | -15° → +15° |
| **N**euroticism | Stroke width | 1px → 3px |

### Example Profiles

**1-1-1-1-1 (Stoic Minimalist):**
- Round face (100x100, 50% radius)
- Small eyes (6px)
- Flat narrow mouth (15px)
- Angled-down brows (-15°)
- Light lines (1px)

**5-5-5-5-5 (Intense Enthusiast):**
- Angular face (80x115, 10% radius)
- Large eyes (14px)
- Wide smile (40px, curved)
- Raised brows (+15°)
- Heavy lines (3px)

## Implementation Approach

### Recommended: Node.js Script

```
scripts/generate-face.js
  - Parse theme YAML using js-yaml
  - Extract OCEAN scores for specified agent
  - Apply mapping spec to generate SVG parameters
  - Output clean SVG to stdout or file
```

### Alternative: Shell + Template

```
scripts/generate-face.sh
  - Use yq to extract OCEAN scores
  - Use sed to substitute into SVG template
  - Less maintainable but no new dependencies
```

### CLI Interface

```bash
# Generate single face
./scripts/generate-face.js --theme deadwood --agent sm --output faces/deadwood-sm.svg

# Batch mode for story 11-4
./scripts/generate-face.js --theme deadwood --all --output faces/deadwood/
```

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/personas/OCEAN-TO-FACE.md` | Mapping specification |
| `pennyfarthing-dist/personas/themes/*.yaml` | Source OCEAN data (10 anchor themes) |
| `scripts/generate-face.js` | NEW - Generator script |
| `pennyfarthing-dist/personas/faces/` | NEW - Output directory for SVGs |

## Testing Strategy

1. **Unit tests** for OCEAN → parameter mapping functions
2. **Integration test** comparing generated SVG against expected structure
3. **Visual verification** of extreme profiles (1-1-1-1-1 vs 5-5-5-5-5)
4. **Validation** that all 10 anchor theme agents produce valid SVG

## Dependencies

- yq (already installed) for YAML parsing if shell approach
- No new npm dependencies preferred; use Node built-ins + js-yaml if Node approach

## Risks

| Risk | Mitigation |
|------|------------|
| SVG complexity | Start with basic shapes, iterate |
| Parameter tuning | Test with extreme profiles first |
| Browser compatibility | Use standard SVG elements only |
