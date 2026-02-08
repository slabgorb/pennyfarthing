---
name: theme
description: Manage persona themes - list available themes, show current/specific theme details, set active theme, create themes, and run the interactive theme maker wizard.
args: "[list|show|set|create|maker] [options]"
---

# Theme Management Skill

<run>
Route based on arguments:
- No args or `show` → Show current theme
- `list` → List available themes
- `show [name]` → Show theme details
- `set <name>` → Set active theme
- `create <name>` → Create theme from base
- `maker` → Interactive AI-driven theme wizard
</run>

<output>
Theme commands return theme names, descriptions, agent mappings, and confirmation of theme changes. Current theme is stored in `.pennyfarthing/config.local.yaml`.
</output>

## Quick Reference

| Invocation | CLI Command | Purpose |
|------------|-------------|---------|
| `/theme` | `pf theme show` | Show current theme |
| `/theme list` | `pf theme list` | List all available themes |
| `/theme show [name]` | `pf theme show [name]` | Show theme details |
| `/theme show [name] --full` | `pf theme show [name] --full` | Extended details (OCEAN, quirks) |
| `/theme set <name>` | `pf theme set <name>` | Set active theme |
| `/theme create <name>` | `pf theme create <name>` | Create from base theme |
| `/theme create <name> --base X` | `pf theme create <name> --base X` | Create from specific base |
| `/theme create <name> --user` | `pf theme create <name> --user` | Create as user-level theme |
| `/theme maker` | *(interactive wizard)* | AI-driven theme creation |

---

## `/theme list`

Run `pf theme list` and display the output directly to the user.

```bash
pf theme list
```

**IMPORTANT:** Copy the command output into your response text so the user sees it in the console. Bash tool output may be collapsed in the UI.

The output shows:
- Current theme marked with `*`
- Tier in brackets: `[S]` elite, `[A]` excellent, `[B]` strong, `[C]` good, `[D]` below average, `[U]` unbenchmarked

---

## `/theme show [name]`

```bash
# Show current theme
pf theme show

# Show specific theme
pf theme show blade-runner

# Show full details (OCEAN scores, quirks, catchphrases, helpers)
pf theme show blade-runner --full
```

**IMPORTANT:** Copy the command output into your response text so the user sees it in the console.

---

## `/theme set <name>`

```bash
pf theme set <name>
```

If no theme name provided, run `pf theme list` first, then ask the user which theme they want.

After setting, refresh the current agent's persona:
```bash
pf agent start "sm"
```
**Adopt the new character immediately** - do not continue using the old persona.

---

## `/theme create <name> [--base <theme>] [--user]`

Create a new custom theme by copying from a base.

```bash
# Create from default base (minimalist)
pf theme create my-theme

# Create from specific base
pf theme create my-theme --base blade-runner

# Create as user-level theme (available across all projects)
pf theme create my-theme --user
```

After creation, guide the user:
- Edit the theme file to customize agents
- Run `pf theme set <name>` to activate

---

## `/theme maker`

Interactive wizard for creating custom persona themes with AI-driven generation. Unlike `/theme create` which copies from a base, this walks through the full creation process.

### Step 1: Theme Name

Ask the user for a theme name.

**Validation rules:**
- Lowercase letters only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- No conflicts with existing themes

### Step 2: Mode Selection

Use AskUserQuestion:

```yaml
questions:
  - question: "How would you like to create your theme?"
    header: "Mode"
    options:
      - label: "AI-Driven (Recommended)"
        description: "Describe a concept or universe, I generate all 10 agent personas"
      - label: "Guided"
        description: "I suggest character options per agent, you pick"
      - label: "Manual"
        description: "You specify character, style, and quote for each agent"
    multiSelect: false
```

### Step 3: Dispatch to Mode

Based on selection, follow the appropriate mode below.

---

### AI-Driven Mode

Best for: Users who describe a concept and want the AI to generate everything.

**Flow:**
1. Ask for universe/concept description
2. Generate all 10 agent personas
3. Preview and confirm
4. Write theme file
5. Optionally generate portraits

**For each agent, generate:**
- `character`: Name fitting the universe
- `shortName`: Display name for UI (see Short Name Generation below)
- `visual`: Visual description for portrait generation (see Visual Descriptions below)
- `ocean`: OCEAN personality profile (see Role-Appropriate OCEAN Profiles below)
- `style`: 1-2 sentence communication style
- `expertise`: Areas of expertise in the universe context
- `role`: Role description within the universe
- `trait`: Character traits
- `quote`: Signature quote
- `emoji`: Single representative emoji
- `helper`: Assistant with name and communication style

---

### Guided Mode

Best for: Users who want to pick characters from suggestions.

**Flow:**
1. Ask for universe/concept description
2. For each agent, suggest 3-4 character options via AskUserQuestion
3. Generate remaining details (style, OCEAN, quote, etc.) for selected characters
4. Preview and confirm
5. Write theme file

**Agent Order:** orchestrator, sm, tea, dev, reviewer, architect, pm, tech-writer, ux-designer, devops

---

### Manual Mode

Best for: Users who know exactly what they want.

**Flow:**
1. Ask for theme description
2. For each agent, collect character name, style, and quote via free text
3. Offer OCEAN auto-generation or manual entry
4. Generate remaining fields (expertise, emoji, helper)
5. Preview and confirm
6. Write theme file

**Skip Handling:** If user types "skip" for an agent, use defaults (generic role name, "Professional and direct" style).

---

## Agent Roles Reference

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

## Short Name Generation

Priority for `shortName`:
1. **Quoted nicknames first**: "Hannibal", "Starbuck" → use the nickname
2. **Unique first name**: If unique among all characters in the theme
3. **Unique surname**: If surname distinguishes the character
4. **First + Last**: If needed for disambiguation
5. **Iconic names**: Keep full for iconic two-word names (e.g., "Big Brother", "Sun Tzu")

Skip titles like "Dr.", "Captain", "President" when extracting shortName.

## Visual Descriptions

The `visual` field provides a portrait prompt for `./scripts/generate-portraits.sh`.

**Guidelines:**
- Focus on physical appearance, distinctive features, and visual props
- Include clothing, expression, and setting elements
- Be specific and visual - describe what a portrait would show

## Role-Appropriate OCEAN Profiles

| Agent | Recommended Profile | Rationale |
|-------|---------------------|-----------|
| orchestrator | High O (4-5), Moderate C (3-4) | Pattern-seer needs openness |
| sm | High A (4-5), Moderate C (3-4) | Coordination requires agreeableness |
| tea | High C (4-5), High O (4-5) | Testing needs conscientiousness + creativity |
| dev | High C (4-5), Moderate O (3-4) | Building needs discipline + problem-solving |
| reviewer | High C (4-5), Low A (2-3) | Critical review prioritizes standards |
| architect | High O (4-5), High C (4-5) | Design needs vision + structure |
| pm | High E (4-5), High A (4-5) | Stakeholder mgmt needs sociability |
| tech-writer | High C (4-5), Low N (1-2) | Documentation needs precision + calm |
| ux-designer | High A (4-5), High O (4-5) | User advocacy needs empathy + creativity |
| devops | High C (4-5), Low N (1-2) | Operations needs reliability |

## Theme File Output

Write to `.claude/pennyfarthing/themes/{name}.yaml`:

```yaml
# Custom theme: {name}
# Created by /theme maker

theme:
  name: {Name}
  description: "{description}"
  source: "{source}"
  default_emoji_use: minimal
  default_humor: enabled
  character_immersion: high
  user_title: {title}
  pennyfarthing_version: "{current version from VERSION file}"
  created: {date}

agents:
  orchestrator:
    character: {generated}
    shortName: {generated}
    visual: "{generated}"
    ocean:
      O: {1-5}  # {rationale}
      C: {1-5}  # {rationale}
      E: {1-5}  # {rationale}
      A: {1-5}  # {rationale}
      N: {1-5}  # {rationale}
    style: {generated}
    expertise: {generated}
    role: {generated}
    trait: {generated}
    quote: "{generated}"
    emoji: "{generated}"
    helper:
      name: {generated}
      style: "{generated}"
  # ... all 10 agents
```

**OCEAN Validation:** Before writing, verify:
- All 10 agents have `ocean:` blocks with O, C, E, A, N keys
- All scores are integers 1-5
- Each score has a rationale comment

**Important:** Read `VERSION` file at project root to set `pennyfarthing_version`.

## Portrait Generation (Optional)

After creating a theme, offer to generate portraits:

```bash
# Generate all portraits
./scripts/generate-portraits.sh --theme {name}

# Single agent
./scripts/generate-portraits.sh --theme {name} --role {role}

# Dry run preview
./scripts/generate-portraits.sh --theme {name} --dry-run
```

**Requirements:** Python 3 venv with diffusers, transformers, accelerate, torch, pillow, pyyaml, tqdm. Apple Silicon (MPS) or NVIDIA GPU (CUDA).

**Output:** `pennyfarthing-dist/personas/portraits/{theme}/{shortName}-{OCEAN}.png`

## Theme File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/personas/themes/` | Built-in themes (96+) |
| `.claude/pennyfarthing/themes/` | Project-level custom themes |
| `~/.claude/pennyfarthing/themes/` | User-level custom themes |
| `.pennyfarthing/config.local.yaml` | Theme selection (agent-writable, gitignored) |

## Theme Structure

```yaml
theme:
  name: theme-name
  description: Brief description

agents:
  sm:
    character: Character Name
    style: Communication style description
    trait: Key personality trait
    helper: Helper/assistant description
    ocean: { O: 3, C: 4, E: 2, A: 3, N: 2 }
    quirks: [...]
    catchphrases: [...]
  tea:
    # ...same structure...
```

## Validation Rules for Theme Names

- Lowercase letters only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- No conflicts with existing themes
