# Story 6-1: Create /theme-maker command skeleton - Technical Context

## Story Overview
- **Epic:** 6 - Interactive Theme Wizard
- **Points:** 3 (P1)
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11197

## Current State

The theme management CLI is complete (Epic 5). We have:

1. **CLI commands** (`src/cli/commands/theme.ts`):
   - `pennyfarthing theme list` - List all themes
   - `pennyfarthing theme set <name>` - Activate a theme
   - `pennyfarthing theme show [name]` - Display theme details
   - `pennyfarthing theme create <name>` - Create theme non-interactively

2. **Utilities** (`src/cli/utils/themes.ts`):
   - `getThemes()` - Three-tier theme discovery (built-in, project, user)
   - `validateThemeName()` - Strict name validation (lowercase, letter-start, hyphens only)
   - `createTheme()` - Copy from base, update metadata, write file
   - `getProjectCustomThemesDir()` - Returns `.claude/pennyfarthing/themes/`

3. **Prompts** (`src/cli/utils/prompts.ts`):
   - `select()`, `input()`, `confirm()` for interactive workflows
   - Non-TTY fallback support built-in

## What Story 6-1 Builds

A **slash command** `/theme-maker` that launches an interactive wizard for creating custom themes. This is different from the existing `pennyfarthing theme create` CLI command.

### Key Distinction
- **CLI command** (`pennyfarthing theme create`): Non-interactive, flag-based
- **Slash command** (`/theme-maker`): Interactive wizard with modes, runs in Claude Code context

## Technical Approach

### File Structure
```
pennyfarthing-dist/
└── commands/
    └── theme-maker.md      # NEW: Slash command definition
```

The slash command will use Claude's `AskUserQuestion` tool for interaction, not inquirer prompts. This is a prompt-based command, not a TypeScript CLI handler.

### Flow Design
```
/theme-maker
    │
    ├─► 1. Ask theme name (validate: no spaces, no conflicts)
    │
    ├─► 2. Ask creation mode:
    │       ├─ AI-Driven: "I'll generate everything from a concept"
    │       ├─ Guided: "I'll suggest options, you pick"
    │       └─ Manual: "You specify everything"
    │
    ├─► 3. Dispatch to mode handler (Stories 6-2, 6-3, 6-4)
    │       For 6-1: Just stub the mode selection, don't implement modes
    │
    └─► 4. Write skeleton theme to .claude/pennyfarthing/themes/{name}.yaml
            Include: pennyfarthing_version field
```

### Theme Skeleton Structure
```yaml
# Custom theme: {name}
# Created by /theme-maker

theme:
  name: {Name}
  description: "Custom theme - edit to customize"
  pennyfarthing_version: "3.6.1"
  created: 2025-12-28

agents:
  # Placeholder - mode handlers will fill this in
```

### AskUserQuestion Patterns

**For theme name:**
```yaml
questions:
  - question: "What would you like to name your theme?"
    header: "Theme name"
    options:
      - label: "Enter name"
        description: "Lowercase, hyphens OK (e.g., 'my-custom-theme')"
    multiSelect: false
```

Actually - AskUserQuestion is for choices, not text input. For the theme name, we'll need to ask the user to provide the name as free text, then validate it.

**For mode selection:**
```yaml
questions:
  - question: "How would you like to create your theme?"
    header: "Creation mode"
    options:
      - label: "AI-Driven"
        description: "Describe a concept, I generate all 10 agent personas"
      - label: "Guided"
        description: "I suggest options per agent, you pick"
      - label: "Manual"
        description: "You specify character, style, quote for each agent"
    multiSelect: false
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `pennyfarthing-dist/commands/theme-maker.md` | CREATE | Main slash command definition |

## Acceptance Criteria

- [ ] AC1: `/theme-maker` launches interactive wizard
- [ ] AC2: Mode selection works with `AskUserQuestion`
- [ ] AC3: Creates theme directory if missing (`.claude/pennyfarthing/themes/`)
- [ ] AC4: Writes skeleton YAML with `pennyfarthing_version` field
- [ ] AC5: Validates theme name (no spaces, no conflicts)

## Testing Strategy

Since this is a slash command (not TypeScript), testing focuses on:

1. **Command parsing** - Verify the markdown is valid and parseable
2. **Integration test** - Manually invoke `/theme-maker` and verify:
   - Name validation rejects invalid names
   - Mode selection presents three options
   - Skeleton file is created correctly
   - Directory created if missing

## Dependencies & Risks

**Dependencies:**
- None - this is foundation work for Stories 6-2, 6-3, 6-4

**Risks:**
- AskUserQuestion doesn't support free-text input natively - need to ask user to provide name then validate
- Need to ensure skeleton YAML is valid for later mode handlers to populate

## Reference Files

| File | Purpose |
|------|---------|
| `src/cli/utils/themes.ts:247-265` | `validateThemeName()` logic to replicate |
| `pennyfarthing-dist/personas/themes/minimalist.yaml` | Reference skeleton structure |
| `pennyfarthing-dist/commands/create-theme.md` | Similar command for pattern reference |

## Patterns from Epic 5

From Story 5-3 summary:
- Three-layer theme architecture: built-in → project → user (with dedup)
- Strict name validation: lowercase, letter-start, hyphens only
- Base theme copying pattern for new themes

## Handoff Notes for TEA

This story creates the slash command skeleton. The mode handlers (Stories 6-2, 6-3, 6-4) will implement the actual persona generation logic. Focus tests on:
1. Name validation rejecting bad names
2. Mode selection working correctly
3. Directory creation when missing
4. Skeleton file structure validity
