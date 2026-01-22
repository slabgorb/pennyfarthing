# Story 38-1 Summary: Fix stale references in agent files

## What Was Built

Fixed 6 stale/incorrect references across 4 agent documentation files. All changes were text replacements with no logic changes - focused maintenance to improve documentation accuracy and remove hardcoded theme dependencies.

## Key Technical Decisions

1. **Path consistency:** Updated all agent-scopes.yaml references to use the actual path `.claude/project/docs/agent-scopes.yaml` rather than outdated relative or incorrect paths.

2. **Theme neutrality:** Removed hardcoded Discworld character names (Carrot, Igor, Ponder, etc.) from orchestrator.md and sm-handoff.md, replacing with generic role names (SM, TEA, Dev, Reviewer) so documentation works with any persona theme.

3. **Subagent type correction:** Fixed reviewer-preflight.md to use `testing-runner` subagent type instead of `general-purpose`, matching the pattern used across all other agent files.

## Implementation Patterns

- **Documentation-only changes:** No runtime code modified; all fixes were markdown text replacements
- **Verification-first:** Each path fix verified against actual file existence before committing
- **Pattern consistency:** Checked existing agent files to ensure fixes match established conventions

## Files Modified

| File | Changes |
|------|---------|
| `pennyfarthing-dist/agents/README.md` | Fixed 2 wrong paths, corrected contradictory example |
| `pennyfarthing-dist/agents/orchestrator.md` | Removed hardcoded character names from agent table |
| `pennyfarthing-dist/agents/sm-handoff.md` | Replaced hardcoded characters with generic/placeholder |
| `pennyfarthing-dist/agents/reviewer-preflight.md` | Changed subagent_type to testing-runner |

## Lessons for Future Work

1. **Audit regularly:** Stale references accumulate during rapid development; periodic audits catch them early
2. **Theme-neutral documentation:** Agent files should use generic role names, not theme-specific characters
3. **Path validation:** Always verify file paths exist when documenting them
