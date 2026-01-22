# Epic 49: Skill Frontmatter Enhancement - Technical Context

## Epic Overview

**Jira:** MSSCI-11952
**Goal:** Improve skill discoverability by enhancing SKILL.md frontmatter per Anthropic's official guidance. Follow-on to Epic 9's infrastructure work.
**Status:** 7 of 11 stories complete

## Completed Work

| Story | Title | What Was Done |
|-------|-------|---------------|
| MSSCI-11953 | 'when to use' context | Added contextual usage guidance to skills |
| MSSCI-11954 | allowed-tools | Added tool restrictions to context-sensitive skills |
| MSSCI-11955 | Progressive disclosure | Large skills now load incrementally |
| MSSCI-11956 | systematic-debugging skill | New debugging methodology skill created |
| MSSCI-11957 | Reviewer severity levels | Reviewer now categorizes findings by severity |
| MSSCI-12034 | /sprint skill | Prescriptive skill with helper scripts |
| MSSCI-12043 | Epic management commands | /sprint promote, epic create, epic sync |

## Remaining Stories

| Story | Title | Points | Description |
|-------|-------|--------|-------------|
| MSSCI-12035 | Rewrite /story skill | 2 | Replace story-management with prescriptive /story |
| MSSCI-12036 | Rewrite /workflow skill | 2 | Prescriptive version with scripts |
| MSSCI-12037 | Rewrite /just skill | 1 | Prescriptive version with scripts |
| MSSCI-12038 | Remove /backlog skill | 1 | Consolidated into /sprint backlog |

## Technical Landscape

### Skill Structure

Skills live in `pennyfarthing-dist/skills/{name}/skill.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: |
  Multi-line description. First line becomes the skill registry entry.
  Use when [trigger conditions].
args: "[optional|arguments]"  # Optional - only if skill accepts args
---
```

### The Prescriptive Pattern (from /sprint)

The `/sprint` skill established the pattern for remaining stories:

1. **YAML frontmatter** with name, description, args
2. **Commands section** with clear subcommand structure
3. **Helper scripts** in `.pennyfarthing/scripts/` for deterministic operations
4. **"Run:" blocks** showing exact bash commands
5. **No manual YAML editing** - always use scripts

Example from /sprint:
```markdown
### `/sprint backlog`
Show available stories grouped by epic.

**Run:**
\`\`\`bash
.pennyfarthing/scripts/run.sh sprint/available-stories.sh
\`\`\`
```

### Current Non-Prescriptive Skills

**story-management** (→ becomes /story):
- Currently documentation-style, no scripts
- Covers sizing guidelines, sprint management patterns
- Needs: `check-story.sh`, `create-story.sh`, `size-story.sh`

**workflow** (→ prescriptive rewrite):
- Currently has inline shell snippets
- Needs: `list-workflows.sh`, `show-workflow.sh`, `set-workflow.sh`

**just** (→ prescriptive rewrite):
- Currently documentation of common recipes
- Needs: wrapper scripts or just passthrough with project detection

**backlog** (→ remove):
- Simple script wrapper, now redundant
- `/sprint backlog` does the same thing
- Remove symlink from `.claude/skills/`

### Key Files

| Path | Purpose |
|------|---------|
| `pennyfarthing-dist/skills/` | Skill definitions (single source of truth) |
| `.claude/skills/` | Symlinks to pennyfarthing-dist/skills |
| `.pennyfarthing/scripts/` | Helper scripts for skills |
| `pennyfarthing-dist/skills/skill-registry.yaml` | Skill metadata registry |

### Symlink Pattern

Skills are discovered via symlinks:
```
.claude/skills/sprint → ../../pennyfarthing-dist/skills/sprint
```

When removing a skill (like /backlog), delete the symlink from `.claude/skills/`.

## Dependencies

- Scripts use `yq` for YAML parsing
- `jira` CLI for Jira operations
- `run.sh` wrapper handles path resolution

## Testing Approach

Skills are trivial workflow - no TEA phase. Verification:
1. Run the skill command
2. Verify script output is correct
3. Verify Claude Code discovers the skill via frontmatter
