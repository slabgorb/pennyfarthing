# Epic 5: Theme Management CLI - Technical Context

## Overview
Add CLI commands for managing persona themes without editing files. Users can list, switch, view, and create themes from the command line.

## Current Architecture

### Theme Storage
```
pennyfarthing-dist/personas/
├── attributes.yaml          # Shared attributes
└── themes/
    ├── discworld.yaml
    ├── jane-austen.yaml
    ├── literary-classics.yaml
    ├── minimalist.yaml
    ├── shakespeare.yaml      # Current default
    ├── star-trek-tng.yaml
    ├── star-trek-tos.yaml
    └── star-trek.yaml
```

### Theme Selection
- Stored in `.claude/persona-config.yaml`
- Format: `theme: shakespeare`
- Read by `agent-session.sh` when agents start

### Theme File Structure
```yaml
theme:
  name: Shakespeare
  description: "Characters from Shakespeare's plays"
  source: "The Complete Works..."

agents:
  sm:
    character: Prospero
    style: Wise orchestrator...
    quote: "Now my charms..."
    helper:
      name: Ariel
      style: Swift spirit...
```

## CLI Structure

### Existing Pattern (version.ts)
```typescript
import { logger } from '../utils/logger.js';
export async function versionCommand(): Promise<void> {
  // Simple sync logic
}
```

### Registration (index.ts)
Commands registered via Commander:
```typescript
program.command('version').action(versionCommand);
```

## Stories

| ID | Title | Points | Approach |
|----|-------|--------|----------|
| 5-1 | theme list | 2 | Read themes dir, mark current |
| 5-2 | theme set | 2 | Validate + update persona-config.yaml |
| 5-3 | theme create | 3 | Copy template, open for editing |
| 5-4 | theme show | 1 | Parse and display theme YAML |

## Key Files to Modify

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | Register theme subcommands |
| `src/cli/commands/theme.ts` | New - theme command logic |
| `src/cli/utils/themes.ts` | New - theme utilities |

## Implementation Notes

- Use `yaml` package (already in deps) for parsing
- Theme validation: check required fields (name, agents.sm at minimum)
- Path resolution: find pennyfarthing-dist via manifest or relative
- Custom themes: `.claude/pennyfarthing/themes/` (project) or `~/.claude/pennyfarthing/themes/` (user)
