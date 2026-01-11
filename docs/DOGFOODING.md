# Pennyfarthing Dogfooding Architecture (v4.0+)

Pennyfarthing uses itself for development - "eating your own dogfood." With v4.0's symlink-based installation, synchronization issues are eliminated.

## Quick Start for New Developers

```bash
# Clone the repo
git clone https://github.com/1898andCo/pennyfarthing.git
cd pennyfarthing

# Install dependencies
pnpm install

# Install git hooks
./pennyfarthing-dist/scripts/install-git-hooks.sh

# Check your setup
./pennyfarthing-dist/scripts/doctor-dogfood.sh

# Fix any issues automatically
./pennyfarthing-dist/scripts/doctor-dogfood.sh --fix
```

## The Structure (v4.0.4+)

The dogfooding structure now matches exactly what `pennyfarthing init` creates:

```
pennyfarthing/
├── pennyfarthing-dist/          <- SOURCE OF TRUTH (distributable package)
│   ├── agents/
│   ├── commands/
│   ├── scripts/
│   ├── skills/
│   └── ...
│
├── .claude/                      <- CLAUDE CODE INTEGRATION
│   ├── agents -> ../pennyfarthing-dist/agents       (direct symlink)
│   ├── guides -> ../pennyfarthing-dist/guides       (direct symlink)
│   ├── personas -> ../pennyfarthing-dist/personas   (direct symlink)
│   ├── scripts -> ../pennyfarthing-dist/scripts     (direct symlink)
│   │
│   ├── commands/                 <- DIRECTORY (not symlink!)
│   │   ├── dev.md -> ../../pennyfarthing-dist/commands/dev.md
│   │   ├── sm.md -> ../../pennyfarthing-dist/commands/sm.md
│   │   └── ... (individual file symlinks)
│   │
│   ├── skills/                   <- DIRECTORY (not symlink!)
│   │   ├── testing -> ../../pennyfarthing-dist/skills/testing
│   │   ├── changelog -> ../../pennyfarthing-dist/skills/changelog
│   │   └── ... (individual folder symlinks)
│   │
│   └── project/                  <- Real directory (project-specific)
│       ├── agents/               <- Agent sidecars
│       ├── commands/             <- User commands (optional)
│       └── skills/               <- User skills (optional)
```

**Key insight:** The `.claude/commands/` and `.claude/skills/` directories allow adding user-specific commands/skills alongside built-ins without conflicts.

## Dogfood vs Fresh Install Parity

The dogfood structure is **identical** to what `pennyfarthing init` creates, except:

| Aspect | Dogfood | Fresh Install |
|--------|---------|---------------|
| Base path | `../pennyfarthing-dist/` | `../node_modules/pennyfarthing/pennyfarthing-dist/` |
| Source | Local development | npm package |

The relative structure within `.claude/` is the same.

## Data Flow Diagram (v4.0.4+)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PENNYFARTHING PROJECT                          │
└─────────────────────────────────────────────────────────────────────────┘

   DEVELOPMENT                    EXECUTION                    DISTRIBUTION
   ───────────                    ─────────                    ────────────

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ pennyfarthing-   │         │ .claude/         │         │ Other Projects   │
│ dist/            │◀──LINK──│                  │         │ (npm install)    │
│                  │         │ Direct symlinks  │         │                  │
│ • Source of truth│         │ to source        │         │ • Symlink to     │
│ • Edit here      │         │ (single hop)     │         │   node_modules/  │
│ • Commit changes │         │                  │         │                  │
└────────┬─────────┘         └──────────────────┘         └──────────────────┘
         │
         │ All symlinks resolve here (1 hop)
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
│ pennyfarthing-dist/scripts/new.sh   │  <- File created here
└──────────────────────────────────────┘
         │
         │  .claude/scripts is a direct symlink
         ▼
┌──────────────────────────────────────┐
│ .claude/scripts/new.sh              │  <- Automatically available!
│                                      │
│   Single-hop symlink resolves        │
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

### New Agent

```bash
# 1. Create in source
vim pennyfarthing-dist/agents/new-agent.md

# 2. Commit
git add pennyfarthing-dist/agents/new-agent.md

# Symlink resolves automatically:
# .claude/agents -> ../pennyfarthing-dist/agents
```

### New Command

```bash
# 1. Create in source
vim pennyfarthing-dist/commands/new-command.md

# 2. Add symlink to .claude/commands/
ln -s ../../pennyfarthing-dist/commands/new-command.md .claude/commands/new-command.md

# 3. Commit both
git add pennyfarthing-dist/commands/new-command.md
git add .claude/commands/new-command.md
```

Note: Commands use individual file symlinks to allow user-defined commands alongside built-ins.

### New Skill

```bash
# 1. Create skill directory in source
mkdir pennyfarthing-dist/skills/new-skill
vim pennyfarthing-dist/skills/new-skill/skill.md

# 2. Add symlink to .claude/skills/
ln -s ../../pennyfarthing-dist/skills/new-skill .claude/skills/new-skill

# 3. Commit both
git add pennyfarthing-dist/skills/new-skill/
git add .claude/skills/new-skill
```

## Directory Purposes

| Location | Purpose | Git Tracked |
|----------|---------|-------------|
| `pennyfarthing-dist/` | Source of truth | Yes |
| `.claude/agents` | Symlink to source | Yes (symlink) |
| `.claude/commands/` | Directory with file symlinks | Yes |
| `.claude/skills/` | Directory with folder symlinks | Yes |
| `.claude/project/` | Project-specific files | Yes |

## Summary (v4.0.4+)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOGFOODING GOLDEN RULE (v4.0.4+)            │
│                                                                  │
│   Edit files in pennyfarthing-dist/ only.                       │
│   Symlinks handle everything else automatically.                 │
│                                                                  │
│   Source: pennyfarthing-dist/   (edit and commit here)          │
│   Local:  .claude/* -> direct symlinks (single hop)             │
│                                                                  │
│   For commands/skills: add individual symlinks to the           │
│   .claude/commands/ or .claude/skills/ directories.             │
└─────────────────────────────────────────────────────────────────┘
```

## Git Hooks

Pennyfarthing provides git hooks that `pennyfarthing init` installs for clients. For dogfooding, these must be installed manually.

### Available Hooks

| Hook | Purpose |
|------|---------|
| `pre-commit` | Block direct commits to main/develop (except sprint/ on develop) |
| `pre-push` | Remind to sync Jira when sprint files change |
| `post-merge` | Auto-update sprint YAML when feature branches are merged |

### Installation (Dogfooding)

```bash
# Use the install script
./pennyfarthing-dist/scripts/install-git-hooks.sh

# Or manually create symlinks
ln -sf ../../pennyfarthing-dist/scripts/hooks/pre-commit.sh .git/hooks/pre-commit
ln -sf ../../pennyfarthing-dist/scripts/hooks/pre-push.sh .git/hooks/pre-push
ln -sf ../../pennyfarthing-dist/scripts/hooks/post-merge.sh .git/hooks/post-merge

# Verify
ls -la .git/hooks/ | grep -v sample
```

## Historical Note

Prior to v4.0, `.claude/pennyfarthing/` was a copy of `pennyfarthing-dist/`, requiring manual synchronization.

v4.0-v4.0.3 used chained symlinks (`.claude/pennyfarthing -> ../pennyfarthing-dist`, then `.claude/agents -> pennyfarthing/agents`). This caused permission issues with Claude Code which doesn't follow symlink chains.

v4.0.4+ uses direct single-hop symlinks, matching what `pennyfarthing init` creates for external users.
