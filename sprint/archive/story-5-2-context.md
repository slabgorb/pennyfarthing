# Story 5-2: Add 'pennyfarthing theme set' command - Technical Context

## Story Overview
- **Epic:** epic-5 (Theme Management CLI)
- **Points:** 2
- **Priority:** P1
- **Repos:** pennyfarthing

## Current State

Story 5-1 created the theme infrastructure in `src/cli/utils/themes.ts`:
- `getThemes()` - returns all available themes as `ThemeInfo[]`
- `getCurrentTheme(projectRoot)` - reads current theme from persona-config.yaml
- `getThemesDir()` - finds themes directory with fallback paths
- `getAgentSamples(theme)` - formats agent preview string

The command structure exists in `src/cli/index.ts`:
```typescript
const themeCmd = program.command('theme');
themeCmd.command('list').action(themeListCommand);
// Add: themeCmd.command('set').action(themeSetCommand);
```

## Technical Approach

1. **Add `setTheme()` utility** to `themes.ts`:
   - Takes themeName and projectRoot
   - Validates theme exists via `getThemes()`
   - Writes/creates `.claude/persona-config.yaml`
   - Returns the ThemeInfo for confirmation display

2. **Add `setCommand()` to `theme.ts`**:
   - Accept theme name as argument
   - Find project root (reuse existing `findProjectRoot()`)
   - Call `setTheme()` 
   - Display confirmation with agent preview

3. **Error handling**:
   - Theme not found: list available themes, suggest similar names
   - No project root: "Not in a Pennyfarthing project"
   - Write error: display error message

## Files to Modify

| File | Change |
|------|--------|
| `src/cli/utils/themes.ts` | Add `setTheme()` function |
| `src/cli/commands/theme.ts` | Add `setCommand()` export |
| `src/cli/index.ts` | Register `theme set <name>` subcommand |

## Acceptance Criteria
- [ ] `pennyfarthing theme set <name>` changes active theme
- [ ] Updates `.claude/persona-config.yaml` correctly
- [ ] Shows confirmation with new theme preview
- [ ] Validates theme exists before changing
- [ ] Helpful error for unknown themes

## Testing Strategy

Manual tests:
1. `pennyfarthing theme set star-trek-tos` - should switch and show confirmation
2. `pennyfarthing theme set invalid` - should show error with available themes
3. `pennyfarthing theme list` - should show new current theme marked
4. Run from subdirectory - should still work

## Dependencies & Risks

- **Dependency:** Reuses all utilities from story 5-1
- **Risk:** File write permissions on persona-config.yaml (mitigate: proper error handling)
- **Risk:** YAML formatting (mitigate: use yaml library's stringify)
