---
name: theme-creation
description: Create custom persona themes for Pennyfarthing. Use when users want to create, generate, or customize agent personas/themes, especially with AI-driven generation.
---

# Theme Creation Skill

## Overview

This skill covers creating custom persona themes for Pennyfarthing agents. Themes define how each agent (SM, TEA, Dev, Reviewer, etc.) presents themselves with character names, styles, quotes, and personality traits.

## When to Use This Skill

**Invoke `/theme-maker` when the user:**
- Asks to "create a theme" or "make a theme"
- Wants "AI-driven theme generation"
- Says "generate personas" or "generate characters"
- Mentions a fictional universe and wants agents based on it
- Asks for "custom personas" or "themed agents"
- Wants to "customize agent characters"
- Mentions any fictional universe + "theme" (e.g., "Star Wars theme", "pirates theme")

**Trigger phrases:**
- "create a [X] theme"
- "make a theme based on [X]"
- "generate [X] personas"
- "I want [X] themed agents"
- "AI-driven theme generation"
- "custom theme for [universe]"

## Available Commands

| Command | Purpose |
|---------|---------|
| `/theme-maker` | Interactive wizard with AI-driven, Guided, or Manual modes |
| `/create-theme <name>` | Quick CLI-based theme creation (copies from base) |
| `/set-theme <name>` | Activate an existing theme |
| `/list-themes` | Show available themes |
| `/show-theme <name>` | Display theme details |

## Theme Creation Modes

### AI-Driven Mode (Recommended)

Best for: Users who describe a concept and want the AI to generate everything.

**Flow:**
1. User provides universe/concept (e.g., "Gilligan's Island, humorous")
2. AI generates all 10 agent personas automatically
3. User previews and confirms or regenerates
4. Theme file written to `.claude/pennyfarthing/themes/`

**What gets generated:**
- Character names fitting the universe
- OCEAN personality profiles (O/C/E/A/N scores 1-5)
- Communication styles
- Signature quotes
- Emojis and visual descriptions
- Helper assistants for each agent

### Guided Mode

Best for: Users who want to pick characters from suggestions.

**Flow:**
1. User provides universe/concept
2. AI suggests 3-4 character options per agent
3. User picks (or enters custom) for each
4. AI fills in remaining details (style, quote, OCEAN)

### Manual Mode

Best for: Users who know exactly what they want.

**Flow:**
1. User provides theme description
2. User enters character, style, quote for each agent
3. Optional: Specify OCEAN scores or let AI generate
4. Theme file created with user's exact specifications

## Agent Roles Reference

When generating or suggesting characters, match to these roles:

| Agent | Role | Character Should Be |
|-------|------|---------------------|
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

## Theme File Location

- **User themes:** `.claude/pennyfarthing/themes/{name}.yaml`
- **Built-in themes:** `pennyfarthing-dist/personas/themes/`

## OCEAN Personality Profiles

Each agent gets an OCEAN profile (Big Five personality traits):

| Dimension | Low (1-2) | High (4-5) |
|-----------|-----------|------------|
| **O**penness | Traditional, practical | Creative, curious |
| **C**onscientiousness | Flexible, spontaneous | Organized, disciplined |
| **E**xtraversion | Reserved, reflective | Outgoing, energetic |
| **A**greeableness | Competitive, skeptical | Cooperative, trusting |
| **N**euroticism | Calm, stable | Emotional, reactive |

## Examples

### Example 1: AI-Driven Theme Creation

**User:** "Create a Gilligan's Island theme, make it humorous"

**Action:** Invoke `/theme-maker`, select AI-Driven mode, generate 10 agents based on the show's characters.

### Example 2: Quick Theme from Base

**User:** "Create a theme called my-team based on discworld"

**Action:** Run `/create-theme my-team --base discworld`

### Example 3: List and Switch Themes

**User:** "What themes are available? Switch to star-trek."

**Action:** Run `/list-themes`, then `/set-theme star-trek`

## Validation Rules for Theme Names

- Lowercase letters only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- No conflicts with existing themes

## Portrait Generation

Each agent can have a `visual` field that describes their appearance for portrait generation.

**Generate all portraits for a theme:**
```bash
./scripts/generate-portraits.sh --theme {name}
```

**Generate a single agent's portrait:**
```bash
./scripts/generate-portraits.sh --theme {name} --role {role}
```

**Dry run (preview):**
```bash
./scripts/generate-portraits.sh --theme {name} --dry-run
```

**Requirements:**
- Python 3 venv at `.venv/` with: `pip install diffusers transformers accelerate torch pillow pyyaml tqdm`
- Apple Silicon Mac (MPS) or NVIDIA GPU (CUDA)
- ~6.5GB model download on first run

**Output:** `pennyfarthing-dist/personas/portraits/{theme}/{shortName}-{OCEAN}.png`

## Post-Creation Steps

After creating a theme:
1. Theme file at `.claude/pennyfarthing/themes/{name}.yaml`
2. Activate with `/set-theme {name}`
3. Generate portraits with `./scripts/generate-portraits.sh --theme {name}`
4. Edit YAML directly for fine-tuning
