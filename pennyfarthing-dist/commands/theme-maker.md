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
