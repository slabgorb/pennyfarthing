# Pennyfarthing Dogfooding Architecture (v4.0+)

Pennyfarthing uses itself for development - "eating your own dogfood." With v4.0's symlink-based installation, synchronization issues are eliminated.

## The Structure (v4.0+)

```
pennyfarthing/
├── pennyfarthing-dist/          ← SOURCE OF TRUTH (distributable package)
│   ├── agents/
│   ├── commands/
│   ├── scripts/
│   └── ...
│
├── .claude/                      ← CLAUDE CODE INTEGRATION
│   ├── pennyfarthing/ -> ../pennyfarthing-dist/   ← SYMLINK (not a copy!)
│   │
│   ├── agents -> pennyfarthing/agents     (symlink)
│   ├── commands -> pennyfarthing/commands (symlink)
│   └── skills -> pennyfarthing/skills     (symlink)
│
└── scripts/ -> .claude/pennyfarthing/scripts/    ← SYMLINK to source
```

**Key change in v4.0:** `.claude/pennyfarthing/` is now a symlink to `pennyfarthing-dist/`, not a copy. Changes to source are immediately available everywhere.

## Data Flow Diagram (v4.0+)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PENNYFARTHING PROJECT                          │
└─────────────────────────────────────────────────────────────────────────┘

   DEVELOPMENT                    EXECUTION                    DISTRIBUTION
   ───────────                    ─────────                    ────────────

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ pennyfarthing-   │         │ .claude/         │         │ Other Projects   │
│ dist/            │◀──LINK──│ pennyfarthing/   │         │ (npm install)    │
│                  │         │ (symlink)        │         │                  │
│ • Source of truth│         │ • Points here    │         │ • Symlink to     │
│ • Edit here      │         │ • No sync needed │         │   node_modules/  │
│ • Commit changes │         │ • Used by Claude │         │   pennyfarthing  │
└────────┬─────────┘         └──────────────────┘         └──────────────────┘
         │
         │ All symlinks resolve to here
         ▼
┌──────────────────┐
│ Single source    │
│ of truth         │
│                  │
│ Edit once,       │
│ works everywhere │
└──────────────────┘
```

## No More Sync Problems (v4.0+)

With symlinks, the old synchronization nightmare is gone:

```
ADDING A NEW SCRIPT (v4.0+)
═══════════════════════════

Step 1: Create in source - DONE!
┌──────────────────────────────────────┐
│ pennyfarthing-dist/scripts/new.sh   │  ← File created here
└──────────────────────────────────────┘
         │
         │  .claude/pennyfarthing/ is a symlink
         ▼
┌──────────────────────────────────────┐
│ .claude/pennyfarthing/scripts/      │  ← Automatically available!
│                                      │
│   Symlink resolves to source         │
└──────────────────────────────────────┘
```

## Rules for Adding Files (v4.0+)

### New Script

```bash
# 1. Create in source - that's it!
vim pennyfarthing-dist/scripts/new-script.sh
chmod +x pennyfarthing-dist/scripts/new-script.sh

# 2. Commit
git add pennyfarthing-dist/scripts/new-script.sh

# No copy step needed - symlinks handle everything
```

### New Agent/Command/Skill

```bash
# 1. Create in source
vim pennyfarthing-dist/agents/new-agent.md

# 2. Commit
git add pennyfarthing-dist/agents/new-agent.md

# Symlink chain resolves automatically:
# .claude/agents -> .claude/pennyfarthing/agents -> pennyfarthing-dist/agents
```

## Directory Purposes

| Location | Purpose | Git Tracked |
|----------|---------|-------------|
| `pennyfarthing-dist/` | Source of truth | Yes |
| `.claude/pennyfarthing/` | Symlink to source | Yes (symlink) |
| `scripts/` | Symlink to pennyfarthing scripts | Yes (symlink) |
| `.claude/agents` etc. | Symlinks to pennyfarthing | Yes (symlinks) |

## Summary (v4.0+)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOGFOODING GOLDEN RULE (v4.0+)               │
│                                                                  │
│   Edit files in pennyfarthing-dist/ only.                       │
│   Symlinks handle everything else automatically.                 │
│                                                                  │
│   Source: pennyfarthing-dist/   (edit and commit here)          │
│   Local:  .claude/pennyfarthing/ -> symlink (no manual sync)    │
└─────────────────────────────────────────────────────────────────┘
```

## Known Path Divergences

While symlinks eliminate most sync issues, there's one key architectural difference between dogfooding and npm installation:

```
DOGFOODING (pennyfarthing repo)          NPM INSTALLATION (other projects)
─────────────────────────────────        ────────────────────────────────
.claude/pennyfarthing/                   .claude/scripts/
  → ../pennyfarthing-dist/                 → node_modules/pennyfarthing/
                                               pennyfarthing-dist/scripts/
.claude/pennyfarthing/scripts/
  (accessed through symlink chain)        (direct symlink to scripts/)
```

**Important:** Scripts that locate other scripts must use `.claude/scripts/` (the canonical path after init), NOT `.claude/pennyfarthing/scripts/` (dogfooding-specific).

### 2024-12-31: run.sh Path Fix

`run.sh` was hardcoded to look for scripts at `.claude/pennyfarthing/scripts/` which worked in dogfooding but failed in npm-installed projects where scripts live at `.claude/scripts/`. Fixed by updating `run.sh` to use `.claude/scripts/` consistently.

## Project Configuration

The consolidated project configuration lives at `.claude/project/pennyfarthing-settings.yaml`:

```yaml
# Pennyfarthing Project Settings

repos:
  pennyfarthing:
    path: "."
    type: cli
    language: bash

services:
  port_offset: 100
  definitions:
    - name: Showcase
      base_port: 4321
      env_var: SHOWCASE_PORT

testing:
  log_dir: ".session"
```

### Services Configuration

Services define dev server ports for worktree management. Each service gets offset ports in worktrees:

```
Main checkout:     SHOWCASE_PORT=4321
Worktree #1:       SHOWCASE_PORT=4421  (4321 + 100*1)
Worktree #2:       SHOWCASE_PORT=4521  (4321 + 100*2)
```

Test with: `./scripts/run.sh worktree-manager.sh ports <worktree-name>`

### 2025-01-04: repos.yaml → pennyfarthing-settings.yaml

Renamed `repos.yaml` to `pennyfarthing-settings.yaml` and added the `services` section for worktree port management. The file now consolidates repos, services, and testing configuration in one place.

## Historical Note

Prior to v4.0, `.claude/pennyfarthing/` was a copy of `pennyfarthing-dist/`, requiring manual synchronization. This led to "file not found" errors when scripts were added to source but not copied to the local install. The v4.0 symlink architecture eliminates this entire class of bugs.
