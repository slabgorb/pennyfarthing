# Story 11-1: Define OCEAN → Facial Feature Mapping Spec

## Story Overview
- **Epic:** 11 - OCEAN Personality Visualization with Chernoff Faces
- **Points:** 2 (Trivial → Direct to Dev)
- **Priority:** P1
- **Repos:** pennyfarthing

## Current State

**OCEAN Framework Already Documented:**
- `pennyfarthing-dist/personas/OCEAN-BENCHMARKING.md` (211 lines) contains comprehensive Big Five reference
- Defines O/C/E/A/N dimensions with low/high poles
- Maps 50+ characters to OCEAN profiles
- Provides role recommendations by personality type

**Theme YAML Structure:**
- 63 themes in `pennyfarthing-dist/personas/themes/`
- Each theme has 10 agents with: character, style, expertise, role, quote, trait, quirks, catchphrases, emoji, helper
- No `ocean` field currently exists

**Existing Attributes:**
- `pennyfarthing-dist/personas/attributes.yaml` defines verbosity, formality, humor, emoji_use
- Pattern: key → variants → description + instruction

## Technical Approach

Create `pennyfarthing-dist/personas/OCEAN-TO-FACE.md` spec document containing:

### 1. OCEAN Scale Definition
- 1-5 scale for each dimension (1=Low, 3=Medium, 5=High)
- Clear descriptions of what each level means

### 2. Facial Feature Mapping

| OCEAN Dimension | Facial Feature | Low (1) | High (5) |
|-----------------|----------------|---------|----------|
| **O**penness | Eye size | Small, focused | Large, curious |
| **C**onscientiousness | Face shape | Round, relaxed | Angular, structured |
| **E**xtraversion | Mouth | Narrow, reserved | Wide smile, outgoing |
| **A**greeableness | Eyebrows | Angled down, critical | Soft/raised, friendly |
| **N**euroticism | Line weight | Light, calm | Heavy, intense |

### 3. SVG Parameter Mapping
For each facial feature, define specific SVG parameters:
- Eye size: radius values (e.g., 8px → 16px)
- Face shape: width/height ratio, corner radius
- Mouth: path curvature, width
- Eyebrows: angle in degrees, thickness
- Line weight: stroke-width values

### 4. Example Profiles
Show extreme examples:
- `1-1-1-1-1`: Maximum calm introvert (tiny eyes, round face, thin line, no smile, angled brows)
- `5-5-5-5-5`: Maximum intense extrovert (huge eyes, angular face, heavy lines, big smile, raised brows)
- Role archetypes: Reviewer (2-5-2-1-3), UX Designer (5-3-4-5-2)

## Files to Create/Modify

| File | Action |
|------|--------|
| `pennyfarthing-dist/personas/OCEAN-TO-FACE.md` | CREATE - Main spec document |

## Acceptance Criteria
- [ ] Spec document in pennyfarthing-dist/personas/OCEAN-TO-FACE.md
- [ ] All 5 OCEAN dimensions mapped to facial features
- [ ] Visual examples of extreme profiles (1-1-1-1-1 vs 5-5-5-5-5)
- [ ] Approved feature mapping ready for implementation

## Dependencies & Risks
- **Dependencies:** None - this is the foundation story
- **Risks:**
  - Mapping may need iteration after seeing generated faces
  - Some OCEAN→feature mappings are more intuitive than others

## Reference Files
- `pennyfarthing-dist/personas/OCEAN-BENCHMARKING.md:5-13` - OCEAN framework definitions
- `pennyfarthing-dist/personas/OCEAN-BENCHMARKING.md:53-103` - Role recommendations by OCEAN
- `pennyfarthing-dist/personas/themes/deadwood.yaml` - Example theme structure
