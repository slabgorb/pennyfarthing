# Story 5-4: Add 'pennyfarthing theme show' command - Technical Context

## Story Overview
- **Epic:** epic-5 (Theme Management CLI)
- **Points:** 1
- **Priority:** P2
- **Repos:** pennyfarthing

## Current State

Stories 5-1 and 5-2 created the theme infrastructure:
- `getThemes()` - returns all ThemeInfo[]
- `getCurrentTheme(projectRoot)` - gets current theme name
- `getThemesDir()` - finds themes directory
- `parseThemeFile(filePath)` - parses single theme file (basic)

## Technical Approach

1. **Add `showCommand()` to `theme.ts`**:
   - No argument: show current theme
   - With argument: show specified theme
   - Display full theme details including all agents

2. **Enhance or add theme parsing** in `themes.ts`:
   - Need to extract more fields: style, quote, role, helper
   - Current `ThemeAgent` interface only has: character, style?, role?

3. **Output format**:
   ```
   Theme: shakespeare
   Description: Characters from Shakespeare's plays...
   
   Agents:
     sm:
       Character: Prospero
       Style: Wise orchestrator...
       Quote: "Now my charms are all o'erthrown..."
     tea:
       Character: Hamlet, Prince of Denmark
       Style: Analytical, questions everything...
       Quote: "To test, or not to test..."
   ```

## Files to Modify

| File | Change |
|------|--------|
| `src/cli/commands/theme.ts` | Add `showCommand()` export |
| `src/cli/utils/themes.ts` | Possibly enhance ThemeAgent interface |
| `src/cli/index.ts` | Register `theme show [name]` subcommand |

## Acceptance Criteria
- [ ] `pennyfarthing theme show` displays current theme details
- [ ] `pennyfarthing theme show <name>` displays specific theme
- [ ] Shows all agent character mappings
- [ ] Includes style and quote for each agent

## Testing Strategy

Manual tests:
1. `pennyfarthing theme show` - shows current (shakespeare)
2. `pennyfarthing theme show star-trek-tos` - shows specific theme
3. `pennyfarthing theme show invalid` - error handling
