# ADR-0005: Single Source of Truth via Symlinks

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

Pennyfarthing is an agent orchestration framework that must be:
1. **Distributed** - Installed via npm into user projects
2. **Updatable** - Changes propagate without manual copy/paste
3. **Discoverable** - Claude Code must find commands and skills in `.claude/`
4. **Maintainable** - Single place to modify definitions

The challenge: How do we maintain canonical definitions in one location while satisfying Claude Code's discovery requirements and enabling updates?

## Decision

All agent, command, skill, persona, and guide definitions live in a single canonical location (`pennyfarthing-dist/`), accessed via symlinks:

```
pennyfarthing-dist/           # Canonical definitions (source of truth)
    ↓ (symlinks)
.claude/commands/             # Claude Code discovery
.claude/skills/
.pennyfarthing/agents/        # Pennyfarthing discovery
.pennyfarthing/guides/
.pennyfarthing/personas/
```

### Implementation

1. **Source Directory:** `pennyfarthing-dist/` contains all managed content
2. **Symlink Creation:** `pennyfarthing init` creates symlinks from discovery locations
3. **Update Propagation:** `pennyfarthing update` refreshes symlinks to new versions
4. **Health Checks:** `pennyfarthing doctor --fix` repairs broken symlinks

### What Goes Where

| Content | Canonical Location | Symlinked To |
|---------|-------------------|--------------|
| Agent definitions | `pennyfarthing-dist/agents/` | `.pennyfarthing/agents/` |
| Slash commands | `pennyfarthing-dist/commands/` | `.claude/commands/` |
| Skills | `pennyfarthing-dist/skills/` | `.claude/skills/` |
| Personas | `pennyfarthing-dist/personas/` | `.pennyfarthing/personas/` |
| Guides | `pennyfarthing-dist/guides/` | `.pennyfarthing/guides/` |
| Scripts | `pennyfarthing-dist/scripts/` | `.pennyfarthing/scripts/` |

### User-Editable Content

Project-specific content lives in non-symlinked directories:
- `.claude/project/commands/` - Custom project commands
- `.claude/project/skills/` - Custom project skills
- `.pennyfarthing/sidecars/` - Agent learning files
- `.pennyfarthing/config.local.yaml` - Theme configuration

## Consequences

### Positive

- **Single source of truth** - Changes made in one place affect all consumers
- **Automatic updates** - `pennyfarthing update` refreshes all symlinks
- **No copy drift** - Symlinks always point to current version
- **Clear separation** - Managed vs project files are obvious
- **Claude Code compatible** - Symlinks satisfy `.claude/` discovery requirements

### Negative

- **Symlink complexity** - Some tools/editors handle symlinks poorly
- **Platform differences** - Windows symlink support varies
- **Repair needed** - Broken symlinks require `doctor --fix`
- **Indirect access** - Must understand the symlink structure to find source files

### Constraints

- **Never modify symlinked directories** - Changes will be lost on update
- **Always modify `pennyfarthing-dist/`** - This is the canonical source
- **Run `pennyfarthing doctor`** - After manual file operations

## Alternatives Considered

### 1. Direct File Copies

Copy files instead of symlinks during install/update.

**Rejected:** Creates drift between source and installed versions. Updates require full re-copy and risk losing local modifications.

### 2. Build-Time Generation

Generate `.claude/` and `.pennyfarthing/` directories at build time.

**Rejected:** Adds build step complexity. Harder to debug as source isn't directly visible.

### 3. Claude Code Configuration

Configure Claude Code to look in alternate locations.

**Rejected:** Claude Code expects `.claude/` directory structure. Would require Claude Code changes.

## Implementation Notes

The symlink architecture was implemented in the initial framework design and has proven stable across 100+ themes and 40+ commands.

Key files:
- `src/cli/commands/init.ts` - Symlink creation
- `src/cli/commands/update.ts` - Symlink refresh
- `src/cli/commands/doctor.ts` - Symlink health checks
- `src/cli/utils/symlinks.ts` - Shared symlink operations

## References

- BMAD Architecture Review (2026-01-19)
- ADR-0001: Consolidate Code Duplication (symlink utilities)
