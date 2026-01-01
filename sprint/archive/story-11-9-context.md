# Story 11-9: Update /theme-maker to generate OCEAN profiles - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 11 - OCEAN Personality Visualization |
| Points | 3 |
| Priority | P1 |
| Repos | pennyfarthing |
| Jira | MSSCI-11225 |

## Current State

The `/theme-maker` command (`pennyfarthing-dist/commands/theme-maker.md`) creates custom persona themes through three interactive modes:

1. **AI-Driven**: User describes a universe concept, AI generates all 10 agent personas
2. **Guided**: AI suggests 3-4 character options per agent, user picks
3. **Manual**: User specifies character/style/quote, AI fills remaining fields

Currently, none of these modes generate OCEAN personality profiles. All 63 official themes (630 characters) now have OCEAN profiles from story 11-5, but user-created themes lack this capability.

## Technical Approach

### OCEAN Profile Format

Each agent needs an `ocean:` block with five dimensions (scores 1-5):

```yaml
agents:
  sm:
    character: Captain Kirk
    ocean:
      O: 4  # Bold exploration
      C: 4  # Starfleet discipline
      E: 5  # Charismatic command
      A: 4  # Crew devotion
      N: 3  # Command burden
    style: Bold, decisive...
```

### Role-Appropriate OCEAN Profiles

From `OCEAN-BENCHMARKING.md`, each agent role has recommended profiles:

| Agent | Recommended Profile | Rationale |
|-------|---------------------|-----------|
| orchestrator | High O, Moderate C | Pattern-seer needs openness |
| sm | High A, Moderate C | Coordination needs agreeableness |
| tea | High C, High O | Testing needs conscientiousness + creativity |
| dev | High C, Moderate O | Building needs discipline + problem-solving |
| reviewer | High C, Low A | Critical review needs standards over harmony |
| architect | High O, High C | Design needs vision + structure |
| pm | High E, High A | Stakeholder mgmt needs sociability |
| tech-writer | High C, Low N | Documentation needs precision + calm |
| ux-designer | High A, High O | User advocacy needs empathy + creativity |
| devops | High C, Low N | Operations needs reliability + stability |

### Mode-Specific Implementation

**AI-Driven Mode** (L121-243):
- When generating character personas, also generate character-appropriate OCEAN scores
- Include rationale comments (e.g., `# Bold exploration`)
- Balance character personality with role requirements

**Guided Mode** (L246-349):
- After user selects characters, suggest OCEAN profiles
- Show reasoning: "Kirk's boldness suggests high E, his discipline suggests high C"
- Allow user to accept or adjust

**Manual Mode** (L352-498):
- Offer choice: specify OCEAN scores OR auto-generate from traits
- If auto-generating, derive from character description and role requirements
- Show generated scores for approval

## Files to Modify

| File | Purpose | Changes |
|------|---------|---------|
| `pennyfarthing-dist/commands/theme-maker.md` | Command spec | Add OCEAN generation to all three modes |

### Integration Points

- **Line 150-158**: Agent generation fields - add `ocean:` to generated fields
- **Line 211-240**: AI-Driven YAML template - add ocean blocks
- **Line 320-349**: Guided mode output - add ocean blocks
- **Line 468-498**: Manual mode output - add ocean blocks

## Acceptance Criteria

- [ ] AC1: AI-Driven mode generates OCEAN profiles for all 10 agents
- [ ] AC2: Guided mode suggests OCEAN scores matching character selection
- [ ] AC3: Manual mode allows OCEAN input or auto-generation
- [ ] AC4: Generated themes pass `validate-ocean-profiles.ts`
- [ ] AC5: OCEAN rationale comments included in output

## Testing Strategy

1. **Unit tests**: Test OCEAN generation logic for each mode
2. **Integration tests**: Generate themes via each mode, validate with `validate-ocean-profiles.ts`
3. **Format validation**: Ensure ocean blocks match existing theme structure

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Generated scores don't match role requirements | Reference OCEAN-BENCHMARKING.md explicitly in generation prompts |
| User confusion in Manual mode | Clear option: "Specify OCEAN scores" vs "Auto-generate from traits" |
| Validation failures | Run validate-ocean-profiles.ts before writing theme file |

## Reference Files

- `pennyfarthing-dist/commands/theme-maker.md` - Command to modify
- `pennyfarthing-dist/guides/OCEAN-BENCHMARKING.md` - Role guidance (L53-127)
- `pennyfarthing-dist/personas/themes/star-trek-tos.yaml` - Target YAML format
- `src/scripts/validate-ocean-profiles.ts` - Validation script
