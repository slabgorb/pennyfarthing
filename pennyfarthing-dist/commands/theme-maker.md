---
description: Interactive wizard for creating custom persona themes
---

# Theme Maker

Interactive wizard for creating custom persona themes. Unlike `/create-theme` which uses CLI flags, this command walks you through the theme creation process interactively.

## Usage

```
/theme-maker
```

## Flow

### Step 1: Theme Name

Ask the user for a theme name. They provide it as free text.

**Validation rules:**
- Lowercase letters only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- No conflicts with existing themes

If invalid, explain the rules and ask again.

### Step 2: Mode Selection

Output `<!-- CYCLIST:CHOICES:mode -->` marker, then use AskUserQuestion:

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

### Step 3: Dispatch to Mode Handler

Based on selection:
- **AI-Driven** → Follow AI-Driven mode instructions (Story 6-2)
- **Guided** → Follow Guided mode instructions (Story 6-3)
- **Manual** → Follow Manual mode instructions (Story 6-4)

For now (Story 6-1 skeleton), just acknowledge the selection and create a skeleton.

### Step 4: Create Theme

1. Create theme directory if missing:
   ```
   .claude/pennyfarthing/themes/
   ```

2. Write skeleton theme file to `.claude/pennyfarthing/themes/{name}.yaml`:

**Important:** Read the current version from the `VERSION` file at project root to set `pennyfarthing_version`.

```yaml
# Custom theme: {name}
# Created by /theme-maker

theme:
  name: {Name}
  description: "Custom theme - edit to customize"
  pennyfarthing_version: "{current version from VERSION file}"
  created: {date}

agents:
  # Mode handler will populate these (Stories 6-2, 6-3, 6-4)
  orchestrator:
    character: Coordinator
    shortName: Coordinator
    style: Placeholder - run mode handler to customize
  sm:
    character: Coordinator
    shortName: Coordinator
    style: Placeholder - run mode handler to customize
  tea:
    character: Tester
    shortName: Tester
    style: Placeholder - run mode handler to customize
  dev:
    character: Developer
    shortName: Developer
    style: Placeholder - run mode handler to customize
  reviewer:
    character: Reviewer
    shortName: Reviewer
    style: Placeholder - run mode handler to customize
  architect:
    character: Architect
    shortName: Architect
    style: Placeholder - run mode handler to customize
  pm:
    character: Manager
    shortName: Manager
    style: Placeholder - run mode handler to customize
  tech-writer:
    character: Writer
    shortName: Writer
    style: Placeholder - run mode handler to customize
  ux-designer:
    character: Designer
    shortName: Designer
    style: Placeholder - run mode handler to customize
  devops:
    character: Operator
    shortName: Operator
    style: Placeholder - run mode handler to customize
```

### Step 5: Next Steps

After creating the skeleton, tell the user:

1. Theme file created at `.claude/pennyfarthing/themes/{name}.yaml`
2. To activate: `/set-theme {name}`
3. To customize: Edit the YAML file or run mode handler when available

---

## AI-Driven Mode

When the user selects AI-Driven mode, generate all 10 agent personas from a single concept description.

### Step 1: Get Universe Description

Ask the user to describe their theme concept as free-text input:

> "Describe your theme universe or concept. Examples: 'noir detective', 'pirates', 'ancient Rome', 'cyberpunk', 'medieval fantasy'"

Accept any creative concept - the AI will generate appropriate characters.

### Step 2: Generate All Agents

Based on the universe description, generate personas for all 10 agents:

| Agent | Role to Fill | Character Should Be |
|-------|--------------|---------------------|
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

For each agent, generate:
- `character`: Name fitting the universe
- `shortName`: Display name for UI (see Short Name Generation below)
- `visual`: Visual description for portrait generation (see Visual Descriptions below)
- `ocean`: OCEAN personality profile (see Role-Appropriate OCEAN Profiles below)
- `style`: 1-2 sentence communication style
- `expertise`: Areas of expertise in the universe context
- `role`: Role description within the universe
- `trait`: Character traits
- `quote`: Signature quote that captures their personality
- `emoji`: Single emoji representing them
- `helper`: Assistant with name and communication style

#### Short Name Generation

The `shortName` is a concise display name for portrait labels. Follow this priority:

1. **Quoted nicknames first**: If character has a quoted nickname like "Hannibal" or "Starbuck", use it
2. **Unique first name**: If first name is unique among all characters in the theme
3. **Unique surname**: If surname distinguishes the character
4. **First + Last**: If needed for disambiguation
5. **Iconic names**: Keep full for iconic two-word names (e.g., "Big Brother", "Sun Tzu")

Skip titles like "Dr.", "Captain", "President" when extracting shortName.

Examples:
- `Colonel John "Hannibal" Smith` → `Hannibal`
- `Kara "Starbuck" Thrace` → `Starbuck`
- `President Josiah Bartlet` → `Josiah`
- `Big Brother` → `Big Brother` (iconic, keep full)

#### Visual Descriptions

The `visual` field provides a portrait prompt for image generation. These descriptions are used by `./scripts/generate-portraits.sh` to create woodcut-style portraits.

**Guidelines:**
- Focus on physical appearance, distinctive features, and visual props
- Include clothing, expression, and setting elements
- Be specific and visual - describe what a portrait would show
- Avoid abstract concepts - translate personality to visual cues

**Examples:**
- `"Stout sea captain in blue shirt and captain's hat, frustrated but caring expression"`
- `"Scholarly man with glasses, surrounded by coconut-based inventions, explaining something"`
- `"Massive bound wolf with fierce eyes, chains visible, barely contained power"`
- `"Elegant socialite with pearls, perfectly coiffed hair, holding documentation"`

**For non-character entities** (like objects or places used as personas):
- Describe them visually as if they were a character
- `"Bamboo and coconut radio receiver with antenna, static crackling"` (for The Radio)
- `"Crystal clear tropical lagoon surrounded by palm trees, naturally inviting"` (for The Lagoon)

#### Role-Appropriate OCEAN Profiles

When generating OCEAN scores, balance character personality with role requirements. Each dimension uses a 1-5 scale. Include a brief rationale comment for each score.

| Agent | Recommended Profile | Rationale |
|-------|---------------------|-----------|
| orchestrator | High O (4-5), Moderate C (3-4) | Pattern-seer needs openness to possibilities |
| sm | High A (4-5), Moderate C (3-4) | Coordination requires agreeableness |
| tea | High C (4-5), High O (4-5) | Testing needs conscientiousness + creativity |
| dev | High C (4-5), Moderate O (3-4) | Building needs discipline + problem-solving |
| reviewer | High C (4-5), Low A (2-3) | Critical review prioritizes standards over harmony |
| architect | High O (4-5), High C (4-5) | Design needs vision + structure |
| pm | High E (4-5), High A (4-5) | Stakeholder mgmt needs sociability |
| tech-writer | High C (4-5), Low N (1-2) | Documentation needs precision + calm |
| ux-designer | High A (4-5), High O (4-5) | User advocacy needs empathy + creativity |
| devops | High C (4-5), Low N (1-2) | Operations needs reliability + stability |

Reference `OCEAN-BENCHMARKING.md` for detailed guidance on personality-to-role mapping.

### Step 3: Preview Generated Theme

Display a preview of all generated agents before confirming:

```
## Theme Preview: {name}

**Universe:** {user's concept}

| Agent | Character | Short | Style |
|-------|-----------|-------|-------|
| orchestrator | {name} | {shortName} | {style summary} |
| sm | {name} | {shortName} | {style summary} |
| tea | {name} | {shortName} | {style summary} |
| dev | {name} | {shortName} | {style summary} |
| reviewer | {name} | {shortName} | {style summary} |
| architect | {name} | {shortName} | {style summary} |
| pm | {name} | {shortName} | {style summary} |
| tech-writer | {name} | {shortName} | {style summary} |
| ux-designer | {name} | {shortName} | {style summary} |
| devops | {name} | {shortName} | {style summary} |
```

### Step 4: Confirm or Regenerate

Output `<!-- CYCLIST:CHOICES:confirm -->` marker, then use AskUserQuestion:

```yaml
questions:
  - question: "How does this theme look?"
    header: "Confirm"
    options:
      - label: "Looks great, save it!"
        description: "Write the theme file and activate it"
      - label: "Regenerate"
        description: "Generate a fresh set of characters from the same concept"
      - label: "Try different concept"
        description: "Go back and describe a different universe"
    multiSelect: false
```

If **Regenerate**: Generate a completely new set of characters and return to Step 3.

If **Confirm**: Write the complete theme file and proceed to Step 5.

### Step 5: Write Theme File

Write the complete theme to `.claude/pennyfarthing/themes/{name}.yaml` with full YAML structure.

**Important:** Read the current version from the `VERSION` file at project root to set `pennyfarthing_version`.

```yaml
# Custom theme: {name}
# Created by /theme-maker AI-Driven mode
# Universe: {user's concept}

theme:
  name: {Name}
  description: "{Generated description based on concept}"
  source: "AI-generated from: {concept}"
  default_emoji_use: minimal
  default_humor: enabled
  character_immersion: high
  user_title: {Appropriate title}
  pennyfarthing_version: "{current version from VERSION file}"
  created: {date}

agents:
  orchestrator:
    character: {generated}
    shortName: {generated - see Short Name Generation}
    visual: "{generated - see Visual Descriptions}"
    ocean:
      O: {1-5}  # {rationale - e.g., "Cosmic awareness"}
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
  # ... all 10 agents with complete definitions including ocean blocks, shortName, and visual
```

**OCEAN Validation:** Before writing the theme file, verify all OCEAN profiles are complete and valid:
- All 10 agents have `ocean:` blocks with O, C, E, A, N keys
- All scores are integers 1-5
- Each score has a rationale comment

Use `validateThemeSchema()` from `src/cli/utils/themes.ts` to verify the generated theme is valid before writing.

### Step 6: Generate Portraits (Optional)

After writing the theme file, offer to generate portraits:

```yaml
questions:
  - question: "Would you like to generate portraits for this theme?"
    header: "Portraits"
    options:
      - label: "Yes, generate portraits"
        description: "Run portrait generator using Stable Diffusion SDXL (requires GPU/MPS)"
      - label: "No, skip portraits"
        description: "Theme file is ready, portraits can be generated later"
    multiSelect: false
```

**If Yes:** Run the portrait generator:

```bash
./scripts/generate-portraits.sh --theme {theme-name}
```

**Generate a single agent's portrait:**
```bash
./scripts/generate-portraits.sh --theme {theme-name} --role {role}
```

**Requirements:**
- Python 3 venv at `.venv/` with: `pip install diffusers transformers accelerate torch pillow pyyaml tqdm`
- Apple Silicon Mac (MPS) or NVIDIA GPU (CUDA)
- First run downloads ~6.5GB SDXL model

**Dry run first:** To preview what will be generated:
```bash
./scripts/generate-portraits.sh --theme {theme-name} --dry-run
```

**Output:** `pennyfarthing-dist/personas/portraits/{theme}/{shortName}-{OCEAN}.png`

**If generation fails:** The theme file is still valid - portraits can be generated later manually.

---

## Guided Mode

When the user selects Guided mode, walk through each agent and suggest 3-4 character options for them to pick.

### Step 1: Get Universe Description

Same as AI-Driven mode - ask for the theme concept:

> "Describe your theme universe or concept."

### Step 2: Generate Options for Each Agent

For each agent type, generate 3-4 fitting character suggestions based on the universe. Output `<!-- CYCLIST:CHOICES:agent -->` marker, then present options using AskUserQuestion:

```yaml
questions:
  - question: "Who should be your SM (Scrum Master - team leader)?"
    header: "SM"
    options:
      - label: "{Character 1}"
        description: "{Brief description fitting the universe}"
      - label: "{Character 2}"
        description: "{Brief description}"
      - label: "{Character 3}"
        description: "{Brief description}"
      - label: "Other"
        description: "Enter a custom character name"
    multiSelect: false
```

If user selects "Other", prompt for custom character name as free text.

**Agent Order:**
1. orchestrator
2. sm
3. tea
4. dev
5. reviewer
6. architect
7. pm
8. tech-writer
9. ux-designer
10. devops

### Step 3: Generate Details and OCEAN Profiles

After the user picks a character for each agent, generate the remaining fields:
- `ocean`: OCEAN personality profile (see AI-Driven mode for role-appropriate profiles)
- `style`: Communication style fitting the character
- `trait`: Key personality traits
- `quote`: Signature quote
- `emoji`: Representative emoji
- `helper`: Assistant name and style

The AI fills in these details based on the selected character and universe context.

#### OCEAN Generation for Selected Characters

When generating OCEAN profiles in Guided mode:
1. Consider the selected character's known personality traits
2. Balance character personality with agent role requirements (see Role-Appropriate OCEAN Profiles in AI-Driven mode)
3. Show reasoning to the user, e.g.:
   > "**OCEAN Profile for Kirk (SM):** High E (5) for charismatic command, High A (4) for crew devotion, High C (4) for Starfleet discipline..."
4. Include rationale comments in the YAML output

### Step 4: Preview Theme with OCEAN Profiles

Show a preview of the complete theme before confirming. Include OCEAN scores for each agent:

```
### Theme Preview: {name}

**Universe:** {concept}

| Agent | Character | Short | Style | OCEAN |
|-------|-----------|-------|-------|-------|
| orchestrator | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| sm | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| tea | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| dev | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| reviewer | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| architect | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| pm | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| tech-writer | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| ux-designer | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
| devops | {selected} | {shortName} | {generated style} | O:{n} C:{n} E:{n} A:{n} N:{n} |
```

### Step 5: Confirm or Edit

Output `<!-- CYCLIST:CHOICES:confirm -->` marker, then use AskUserQuestion:

```yaml
questions:
  - question: "How does this theme look?"
    header: "Confirm"
    options:
      - label: "Looks great, save it!"
        description: "Write the theme file"
      - label: "Go back and change selections"
        description: "Edit previous character choices"
      - label: "Start over"
        description: "Return to universe description"
    multiSelect: false
```

If **Go back**: Allow editing previous selections by showing the agent list and letting user pick which to change.

If **Confirm**: Write the complete theme file using the same format as AI-Driven mode, including OCEAN blocks with rationale comments for all 10 agents.

**OCEAN Validation:** Before writing, verify all OCEAN profiles are complete (see AI-Driven mode validation checklist).

### Navigation

Users can go back to change previous selections at any point during the agent selection process. Track selections and allow revisiting any agent before final confirmation.

---

## Manual Mode

When the user selects Manual mode, they specify character, style, and quote for each agent directly. No AI suggestions - full control.

### Step 1: Get Theme Description

Ask the user to describe their theme for the metadata:

> "Provide a brief description for your theme (1-2 sentences). This appears in theme listings."

Example: "Characters from 1940s noir detective fiction"

### Step 2: Collect Agent Details

For each agent, collect three pieces of information. Use free-text prompts (not AskUserQuestion with options).

**Agent Order:**
1. sm
2. tea
3. dev
4. reviewer
5. architect
6. pm
7. tech-writer
8. ux-designer
9. devops
10. orchestrator

For each agent, ask:

> "**{Agent} ({role description})**"
> "Character name (or 'skip' to use default):"

If not skipped, continue:
> "Communication style (1-2 sentences):"
> "Signature quote:"

**Skip Handling:**
If user types "skip", use these defaults:
- character: Generic role name (e.g., "Coordinator" for sm)
- style: "Professional and direct"
- quote: (leave empty)

**Role Descriptions for Prompts:**

| Agent | Role Description |
|-------|------------------|
| sm | Scrum Master - team leader, coordinator |
| tea | Test Engineer - analyst, finds flaws |
| dev | Developer - builder, practical |
| reviewer | Code Reviewer - critical, high standards |
| architect | System Architect - big-picture designer |
| pm | Product Manager - strategic planner |
| tech-writer | Technical Writer - clear communicator |
| ux-designer | UX Designer - user advocate |
| devops | DevOps Engineer - infrastructure, reliability |
| orchestrator | Orchestrator - meta-coordinator, pattern-seer |

### Step 3: OCEAN Profile Option

After collecting character details, offer the user a choice for OCEAN profiles:

```yaml
questions:
  - question: "How would you like to handle OCEAN personality profiles?"
    header: "OCEAN"
    options:
      - label: "Auto-generate (Recommended)"
        description: "Generate OCEAN scores based on character traits and agent roles"
      - label: "Specify manually"
        description: "Enter O/C/E/A/N scores (1-5) for each agent"
    multiSelect: false
```

**If Auto-generate:** Generate OCEAN profiles based on:
1. Character personality derived from their style and quotes
2. Agent role requirements (see Role-Appropriate OCEAN Profiles in AI-Driven mode)
3. Show generated profiles to user before finalizing

**If Specify manually:** For each agent, prompt:
> "**OCEAN for {character} ({agent})** - Enter scores 1-5 for each dimension:"
> "O (Openness): "
> "C (Conscientiousness): "
> "E (Extraversion): "
> "A (Agreeableness): "
> "N (Neuroticism): "
> "Brief rationale (optional): "

### Step 4: Generate Remaining Fields

After OCEAN profiles are determined, generate the remaining fields for each agent:
- `expertise`: Areas of expertise based on character and role
- `role`: Role description within the theme context
- `trait`: Key personality traits derived from style
- `emoji`: Single representative emoji
- `helper`: Assistant name and style fitting the character

### Step 5: Preview Theme with OCEAN

Show a preview of the complete theme including OCEAN profiles:

```
## Theme Preview: {name}

**Description:** {user's description}

| Agent | Character | Short | Style | OCEAN | Quote |
|-------|-----------|-------|-------|-------|-------|
| sm | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| tea | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| dev | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| reviewer | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| architect | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| pm | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| tech-writer | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| ux-designer | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| devops | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
| orchestrator | {provided} | {shortName} | {provided} | O:{n} C:{n} E:{n} A:{n} N:{n} | {provided} |
```

### Step 6: Confirm or Edit

Output `<!-- CYCLIST:CHOICES:confirm -->` marker, then use AskUserQuestion:

```yaml
questions:
  - question: "How does this theme look?"
    header: "Confirm"
    options:
      - label: "Looks great, save it!"
        description: "Write the theme file"
      - label: "Edit an agent"
        description: "Change details for a specific agent"
      - label: "Start over"
        description: "Begin from scratch"
    multiSelect: false
```

If **Edit an agent**: Ask which agent to edit, then re-prompt for that agent's details only. Also offer to edit OCEAN scores.

If **Confirm**: Write the complete theme file using the same format as AI-Driven mode, including OCEAN blocks.

### Theme File Output

Write to `.claude/pennyfarthing/themes/{name}.yaml`:

```yaml
# Custom theme: {name}
# Created by /theme-maker Manual mode

theme:
  name: {Name}
  description: "{user's description}"
  source: "Manually created"
  default_emoji_use: minimal
  default_humor: enabled
  character_immersion: high
  pennyfarthing_version: "{current version from VERSION file}"
  created: {date}

agents:
  sm:
    character: {user provided}
    shortName: {generated - see Short Name Generation}
    ocean:
      O: {1-5}  # {rationale}
      C: {1-5}  # {rationale}
      E: {1-5}  # {rationale}
      A: {1-5}  # {rationale}
      N: {1-5}  # {rationale}
    style: {user provided}
    expertise: {AI generated}
    role: {AI generated}
    trait: {AI generated from style}
    quote: "{user provided}"
    emoji: "{AI generated}"
    helper:
      name: {AI generated}
      style: "{AI generated}"
  # ... all 10 agents with ocean blocks
```

**OCEAN Validation:** Before writing, verify all OCEAN profiles are complete:
- All 10 agents have `ocean:` blocks with O, C, E, A, N keys
- All scores are integers 1-5
- Each score has a rationale comment

Use `validateThemeSchema()` from `src/cli/utils/themes.ts` to verify the theme is valid before writing.
