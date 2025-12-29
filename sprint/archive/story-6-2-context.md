# Story 6-2: Implement AI-Driven Mode - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 6 - Interactive Theme Wizard |
| Points | 3 |
| Priority | P1 |
| Repos | pennyfarthing |
| Jira | MSSCI-11198 |

## Current State

The `/theme-maker` command skeleton exists (Story 6-1 complete). It handles:
- Theme name input and validation
- Mode selection (AI-Driven, Guided, Manual)
- Skeleton file creation with placeholder agents

The skeleton currently writes placeholder agents when AI-Driven is selected. Story 6-2 implements the actual AI generation.

## Technical Approach

### Flow for AI-Driven Mode

1. **Receive mode dispatch** from theme-maker.md after mode selection
2. **Prompt for universe description** - free text input asking user to describe their concept (e.g., "noir detective", "pirates", "ancient Rome")
3. **Generate all 10 agent personas** using Claude's generation capabilities:
   - orchestrator, sm, tea, dev, reviewer, architect, pm, tech-writer, ux-designer, devops
   - Each needs: character, style, expertise, role, trait, quote, emoji, helper (name + style)
4. **Show preview** - Display generated theme in readable format
5. **Offer options** - Confirm, Regenerate, or Edit
6. **Write final theme** to `.claude/pennyfarthing/themes/{name}.yaml`

### Agent Role Mapping

When generating characters, ensure they fit their roles:

| Agent | Role Type | Character Should Be |
|-------|-----------|---------------------|
| orchestrator | Meta-coordinator | Pattern-seer, guide, overseer |
| sm | Scrum Master | Leader, coordinator, keeps team together |
| tea | Test Engineer | Analyst, detail-oriented, finds flaws |
| dev | Developer | Builder, practical, gets things done |
| reviewer | Code Reviewer | Critical, honest, high standards |
| architect | System Architect | Big-picture thinker, systems designer |
| pm | Product Manager | Strategic, stakeholder manager |
| tech-writer | Documentation | Clear communicator, precise |
| ux-designer | UX Design | User advocate, feels the experience |
| devops | Infrastructure | Reliable, keeps systems running |

### Output Structure

Match the structure in existing themes (e.g., `the-expanse.yaml`):

```yaml
theme:
  name: {Theme Name}
  description: "{Description based on user concept}"
  source: "{User-provided or generated}"
  default_emoji_use: minimal
  default_humor: enabled
  character_immersion: high
  user_title: {Appropriate title for user}

agents:
  orchestrator:
    character: {Name}
    style: {1-2 sentence style description}
    expertise: {Areas of expertise}
    role: {Role description}
    trait: {Character traits}
    quote: "{Signature quote}"
    emoji: "{Single emoji}"
    helper:
      name: {Helper name}
      style: "{Helper communication style}"
  # ... repeat for all 10 agents
```

## Files to Modify

| File | Change |
|------|--------|
| `pennyfarthing-dist/commands/theme-maker.md` | Add AI-Driven mode implementation section |

## Acceptance Criteria

- [ ] AC1: Accepts free-text universe description
- [ ] AC2: Generates coherent characters across all 10 agents
- [ ] AC3: Characters fit their agent roles (SM=leader, TEA=analyst, etc.)
- [ ] AC4: Preview shows all agents before confirming
- [ ] AC5: Regenerate option creates fresh set

## Testing Strategy

Tests should verify:
1. Universe description prompt is presented correctly
2. Generated output matches YAML schema (all required fields present)
3. All 10 agents are generated
4. Confirm/Regenerate flow works
5. Theme file is written to correct location

## Dependencies & Risks

**Dependencies:**
- Story 6-1 (complete) - skeleton exists
- AskUserQuestion tool for mode selection and confirm/regenerate

**Risks:**
- AI generation quality - characters need to be coherent and fit roles
- YAML formatting - must be valid and match schema
- User satisfaction - "regenerate" option mitigates poor initial generation

## Reference Files

- `pennyfarthing-dist/commands/theme-maker.md` - Command definition to extend
- `pennyfarthing-dist/personas/themes/the-expanse.yaml` - Reference theme structure
- `pennyfarthing-dist/personas/attributes.yaml` - Personality attributes
