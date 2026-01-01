# OCEAN to Facial Feature Mapping Specification

This document defines how Big Five (OCEAN) personality dimensions map to Chernoff face features for visual persona representation.

## OCEAN Scale Definition

Each dimension uses a 1-5 scale:

| Value | Label | Description |
|-------|-------|-------------|
| 1 | Very Low | Extreme low expression of trait |
| 2 | Low | Below average expression |
| 3 | Medium | Average/balanced expression |
| 4 | High | Above average expression |
| 5 | Very High | Extreme high expression of trait |

## Dimension Definitions

| Dimension | Low (1-2) | High (4-5) |
|-----------|-----------|------------|
| **O**penness | Conventional, practical, concrete | Imaginative, abstract, curious |
| **C**onscientiousness | Flexible, spontaneous, disorganized | Disciplined, methodical, perfectionist |
| **E**xtraversion | Reserved, solitary, internal processing | Sociable, energetic, external processing |
| **A**greeableness | Skeptical, competitive, adversarial | Trusting, cooperative, helpful |
| **N**euroticism | Calm, stable, resilient | Anxious, volatile, emotionally reactive |

## Facial Feature Mapping

| OCEAN | Facial Feature | Rationale |
|-------|----------------|-----------|
| **O**penness | Eye size | Curiosity → "wide-eyed wonder" vs focused practicality |
| **C**onscientiousness | Face shape | Structure/discipline → angular vs relaxed/round |
| **E**xtraversion | Mouth width/smile | Outgoing expression → wide smile vs reserved |
| **A**greeableness | Eyebrow angle | Friendly raised brows vs critical/skeptical angled |
| **N**euroticism | Line weight | Emotional intensity → heavy strokes vs calm light lines |

## SVG Parameter Specifications

### Openness → Eye Size

| Value | Eye Radius | Pupil Radius | Description |
|-------|------------|--------------|-------------|
| 1 | 6px | 2px | Small, focused, practical |
| 2 | 8px | 3px | Below average |
| 3 | 10px | 4px | Average/balanced |
| 4 | 12px | 5px | Above average, curious |
| 5 | 14px | 6px | Large, wide-eyed, imaginative |

### Conscientiousness → Face Shape

| Value | Width | Height | Corner Radius | Description |
|-------|-------|--------|---------------|-------------|
| 1 | 100px | 100px | 50% (circle) | Round, relaxed, spontaneous |
| 2 | 95px | 100px | 40% | Slightly rounded |
| 3 | 90px | 105px | 30% | Balanced oval |
| 4 | 85px | 110px | 20% | Slightly angular |
| 5 | 80px | 115px | 10% | Angular, structured, methodical |

### Extraversion → Mouth

| Value | Width | Curve | Endpoints | Description |
|-------|-------|-------|-----------|-------------|
| 1 | 15px | flat | level | Narrow, reserved, flat expression |
| 2 | 20px | slight up | level | Modest smile |
| 3 | 25px | moderate up | level | Neutral pleasant |
| 4 | 32px | up | slightly raised | Friendly smile |
| 5 | 40px | strong up | raised | Wide, beaming, outgoing |

### Agreeableness → Eyebrow Angle

| Value | Angle | Position | Description |
|-------|-------|----------|-------------|
| 1 | -15° | lowered | Angled down, skeptical, adversarial |
| 2 | -8° | slightly low | Somewhat critical |
| 3 | 0° | neutral | Neutral, balanced |
| 4 | +8° | slightly raised | Friendly, approachable |
| 5 | +15° | raised | Soft, welcoming, cooperative |

### Neuroticism → Line Weight

| Value | Stroke Width | Line Style | Description |
|-------|--------------|------------|-------------|
| 1 | 1px | smooth | Light, calm, stable |
| 2 | 1.5px | smooth | Relaxed |
| 3 | 2px | smooth | Balanced |
| 4 | 2.5px | slightly rough | Somewhat intense |
| 5 | 3px | rough/sketchy | Heavy, intense, reactive |

## Example Profiles

### Extreme Low: 1-1-1-1-1 (The Stoic Minimalist)

```
Face:     Round (100x100, 50% radius)
Eyes:     Small (6px radius, 2px pupil)
Mouth:    Narrow flat (15px)
Eyebrows: Angled down (-15°)
Lines:    Light (1px stroke)
```

**Character Type:** Cold, reserved, disorganized skeptic who is internally calm. Think: a detached observer who trusts no one but isn't stressed about it.

### Extreme High: 5-5-5-5-5 (The Intense Enthusiast)

```
Face:     Angular (80x115, 10% radius)
Eyes:     Large (14px radius, 6px pupil)
Mouth:    Wide smile (40px, strong curve)
Eyebrows: Raised (+15°)
Lines:    Heavy (3px stroke)
```

**Character Type:** Imaginative, disciplined, outgoing, cooperative, but anxious. Think: a passionate perfectionist who loves everyone but worries about everything.

### Role Archetype Examples

#### Reviewer: 2-5-2-1-3 (Critical Analyst)

```
Face:     Angular (disciplined review)
Eyes:     Smallish (focused, practical)
Mouth:    Reserved (not outgoing)
Eyebrows: Angled down (skeptical, adversarial)
Lines:    Medium (balanced emotional state)
```

**Character Type:** Methodical skeptic who finds flaws. Disciplined but not friendly about it.

#### UX Designer: 5-3-4-5-2 (Empathic Creative)

```
Face:     Balanced oval
Eyes:     Large (imaginative, curious)
Mouth:    Friendly (approachable)
Eyebrows: Raised (welcoming, cooperative)
Lines:    Relaxed (emotionally stable)
```

**Character Type:** Creative empath who genuinely cares about user experience.

#### Scrum Master: 3-4-4-5-2 (Supportive Organizer)

```
Face:     Slightly angular (organized)
Eyes:     Medium (balanced perspective)
Mouth:    Friendly (communicative)
Eyebrows: Raised (cooperative, trusting)
Lines:    Relaxed (calm under pressure)
```

**Character Type:** Organized facilitator focused on team harmony.

#### Security Architect: 2-5-2-1-1 (Cold Operator)

```
Face:     Angular (highly structured)
Eyes:     Small (practical, focused)
Mouth:    Reserved (internal processor)
Eyebrows: Angled down (adversarial thinking)
Lines:    Light (stable under pressure)
```

**Character Type:** Methodical, calm skeptic who assumes everything is a threat.

## Visual Reference

```
         1-1-1-1-1                    5-5-5-5-5
     (Stoic Minimalist)         (Intense Enthusiast)

         .-""-.                      /````\
        /      \                    /      \
       |  •  •  |                  | O    O |
       |   __   |                  |   ~~   |
        \______/                    \______/

    Round, small eyes            Angular, large eyes
    Flat mouth                   Wide smile
    Angled brows                 Raised brows
    Light lines                  Heavy lines
```

## Implementation Notes

1. **SVG Generation:** Face is a single `<svg>` element with parameterized paths
2. **Color:** Monochrome by default; color can be theme-derived later
3. **Size:** Base viewBox 200x200, scales to any container
4. **Animation:** Future consideration for trait transitions

## Mapping Validation Checklist

- [x] All 5 OCEAN dimensions have unique facial features
- [x] Each dimension uses a 1-5 scale with clear progression
- [x] SVG parameters defined with specific pixel/angle values
- [x] Extreme profiles (1-1-1-1-1 and 5-5-5-5-5) documented
- [x] Role archetype examples show practical application
- [x] Feature choices have intuitive rationale

## References

- OCEAN Framework: `pennyfarthing-dist/personas/OCEAN-BENCHMARKING.md`
- Theme Structure: `pennyfarthing-dist/personas/themes/*.yaml`
- Chernoff Faces: Original 1973 paper by Herman Chernoff
