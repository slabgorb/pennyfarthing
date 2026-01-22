# Story 2-7: Add User-Customizable Output Styles and Preferences

## What Was Built

Added user customization capabilities to Pennyfarthing through Claude Code's native output styles and a new preferences system. Users can now select from three output styles (verbose, terse, teaching) and control agent behavior through preferences like `character_voice` to toggle persona flavor.

## Key Technical Decisions

1. **Preferences location:** `.claude/pennyfarthing/preferences.yaml` with `.local.yaml` override pattern - keeps all Pennyfarthing config together while supporting gitignored personal preferences.

2. **Output styles format:** Plain markdown files compatible with Claude Code's `/output-style` command - no custom parsing needed.

3. **Fail-open defaults:** When preferences file is missing or malformed, behavior defaults to enabled (existing behavior preserved). This prevents breaking changes for existing installations.

## Implementation Patterns

- **Config file detection pattern:** `is_character_voice_enabled()` mirrors existing persona config loading at `agent-session.sh:32-56` - check `.local.yaml` first, then default, then fallback.

- **Template installation pattern:** Added to `skipIfExistsTemplates` array in `init.ts` - templates are installed on fresh init but never overwrite user customizations.

- **yq error suppression:** `2>/dev/null` with explicit null checks - graceful degradation if yq unavailable.

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/output-styles/verbose.md` | New - detailed explanations style |
| `pennyfarthing-dist/output-styles/terse.md` | New - minimal output style |
| `pennyfarthing-dist/output-styles/teaching.md` | New - explains reasoning style |
| `pennyfarthing-dist/templates/preferences.yaml.template` | New - default preferences |
| `pennyfarthing-dist/scripts/agent-session.sh` | Added `is_character_voice_enabled()` |
| `src/cli/commands/init.ts` | Added preferences template to install list |
| `README.md` | Added Customization section |

## Lessons for Future Work

1. **yq alternative operator gotcha:** `// true` in yq returns the right side if left is `false` OR `null`. Use explicit null checks instead of alternative operator for boolean fields.

2. **Template-only preferences:** `explain_decisions` and `auto_commit` are defined in template but not yet wired up. Future stories can implement these using the same `is_*_enabled()` pattern.

3. **Test both bash and zsh:** The test script uses `#!/usr/bin/env bash` while agent-session.sh uses zsh. Both work because the constructs used are POSIX-compatible.
