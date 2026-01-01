# Story 11-2: Add OCEAN Profiles to 10 Anchor Themes

## Story Overview
- **Epic:** 11 - OCEAN Personality Visualization with Chernoff Faces
- **Points:** 3 (Standard → TEA first)
- **Priority:** P1
- **Repos:** pennyfarthing

## Current State

**Theme YAML Structure (no OCEAN yet):**
```yaml
agents:
  sm:
    character: Seth Bullock
    style: Former marshal bringing law to chaos...
```

**Target Structure (with OCEAN):**
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

## 10 Anchor Themes

| Theme | Universe | Key Characters |
|-------|----------|----------------|
| deadwood | HBO Western | Seth Bullock, Al Swearengen, Doc Cochran |
| firefly | Joss Whedon | Mal Reynolds, River Tam, Kaylee Frye |
| breaking-bad | AMC | Mike Ehrmantraut, Walter White, Jesse Pinkman |
| the-good-place | NBC | Michael, Chidi Anagonye, Eleanor Shellstrop |
| star-trek-tng | Paramount | Picard, Data, Worf |
| discworld | Terry Pratchett | Carrot, Igor, Ponder Stibbons |
| fargo | FX/Coen | Lester Nygaard, Molly Solverson |
| succession | HBO | Logan Roy, Kendall Roy, Gerri Kellman |
| mass-effect | BioWare | Shepard, Mordin Solus, Tali'Zorah |
| software-pioneers | Historical | Margaret Hamilton, Donald Knuth, Dennis Ritchie |

## Technical Approach

### OCEAN Scale
- 1 = Very Low, 2 = Low, 3 = Medium, 4 = High, 5 = Very High

### Reference Documents
1. **OCEAN-BENCHMARKING.md** - Character → OCEAN mappings
   - Lines 53-117: Role recommendations by OCEAN profile
   - Lines 15-39: Statistical gaps with character assignments
2. **OCEAN-TO-FACE.md** - Dimension definitions (lines 19-25)

### Implementation Steps
1. For each of 10 anchor themes:
   - Read the theme YAML
   - For each of 10 agents, look up character in BENCHMARKING.md
   - If not found, derive from role recommendations
   - Add `ocean:` block after `character:`, before `style:`
   - Include inline comments explaining each score

### Validation
- All 100 profiles (10 themes × 10 agents) have ocean blocks
- Scores use 1-5 integer scale
- Scores align with BENCHMARKING.md role guidance
- Comments explain rationale

## Files to Modify

| File | Action |
|------|--------|
| `pennyfarthing-dist/personas/themes/deadwood.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/firefly.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/breaking-bad.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/the-good-place.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/star-trek-tng.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/discworld.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/fargo.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/succession.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/mass-effect.yaml` | Add ocean blocks to 10 agents |
| `pennyfarthing-dist/personas/themes/software-pioneers.yaml` | Add ocean blocks to 10 agents |

## Acceptance Criteria
- [ ] 10 theme YAMLs updated with ocean blocks
- [ ] All 10 agents in each theme have OCEAN scores
- [ ] Scores consistent with OCEAN-BENCHMARKING.md guidance
- [ ] 100 character profiles defined (10 themes × 10 agents)

## Testing Strategy

**Validation Tests:**
- YAML syntax valid after modifications (yq parse)
- All 10 agents in each theme have ocean block
- Each ocean block has O, C, E, A, N keys
- All values are integers 1-5
- No existing fields disrupted

**Sample Test Cases:**
- `deadwood.yaml` has ocean block for sm (Seth Bullock)
- `breaking-bad.yaml` reviewer (Gus Fring) has high C, low A
- `the-good-place.yaml` dev (Eleanor) shows growth arc potential

## Dependencies & Risks

**Dependencies:**
- Story 11-1 complete (OCEAN-TO-FACE.md spec exists) ✓

**Risks:**
- Some characters not in BENCHMARKING.md → derive from role guidance
- Subjective interpretation of character traits → use inline comments to document rationale
