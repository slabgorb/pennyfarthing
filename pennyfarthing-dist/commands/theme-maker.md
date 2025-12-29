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

Use `AskUserQuestion` to let the user choose their creation mode:

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

```yaml
# Custom theme: {name}
# Created by /theme-maker

theme:
  name: {Name}
  description: "Custom theme - edit to customize"
  pennyfarthing_version: "3.6.1"
  created: {date}

agents:
  # Mode handler will populate these (Stories 6-2, 6-3, 6-4)
  orchestrator:
    character: Coordinator
    style: Placeholder - run mode handler to customize
  sm:
    character: Coordinator
    style: Placeholder - run mode handler to customize
  tea:
    character: Tester
    style: Placeholder - run mode handler to customize
  dev:
    character: Developer
    style: Placeholder - run mode handler to customize
  reviewer:
    character: Reviewer
    style: Placeholder - run mode handler to customize
  architect:
    character: Architect
    style: Placeholder - run mode handler to customize
  pm:
    character: Manager
    style: Placeholder - run mode handler to customize
  tech-writer:
    character: Writer
    style: Placeholder - run mode handler to customize
  ux-designer:
    character: Designer
    style: Placeholder - run mode handler to customize
  devops:
    character: Operator
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
- `style`: 1-2 sentence communication style
- `expertise`: Areas of expertise in the universe context
- `role`: Role description within the universe
- `trait`: Character traits
- `quote`: Signature quote that captures their personality
- `emoji`: Single emoji representing them
- `helper`: Assistant with name and communication style

### Step 3: Preview Generated Theme

Display a preview of all generated agents before confirming:

```
## Theme Preview: {name}

**Universe:** {user's concept}

| Agent | Character | Style |
|-------|-----------|-------|
| orchestrator | {name} | {style summary} |
| sm | {name} | {style summary} |
| tea | {name} | {style summary} |
| dev | {name} | {style summary} |
| reviewer | {name} | {style summary} |
| architect | {name} | {style summary} |
| pm | {name} | {style summary} |
| tech-writer | {name} | {style summary} |
| ux-designer | {name} | {style summary} |
| devops | {name} | {style summary} |
```

### Step 4: Confirm or Regenerate

Use `AskUserQuestion` to let the user decide:

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

Write the complete theme to `.claude/pennyfarthing/themes/{name}.yaml` with full YAML structure:

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
  pennyfarthing_version: "3.6.1"
  created: {date}

agents:
  orchestrator:
    character: {generated}
    style: {generated}
    expertise: {generated}
    role: {generated}
    trait: {generated}
    quote: "{generated}"
    emoji: "{generated}"
    helper:
      name: {generated}
      style: "{generated}"
  # ... all 10 agents with complete definitions
```

Use `validateThemeSchema()` from `src/cli/utils/themes.ts` to verify the generated theme is valid before writing.
