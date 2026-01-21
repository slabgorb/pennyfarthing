# Pennyfarthing Dogfooding Architecture (v7.0+)

Pennyfarthing uses itself for development - "eating your own dogfood." With v7.0's restructured directory layout, there's clear separation between Claude Code discovery (`.claude/`) and Pennyfarthing content (`.pennyfarthing/`).

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

## The Structure (v7.0+)

The v7.0 restructure separates concerns:
- **`.claude/`** - Claude Code discovery (commands, skills, project customizations)
- **`.pennyfarthing/`** - Pennyfarthing content (agents, guides, personas, scripts)

```
pennyfarthing/
├── pennyfarthing-dist/          <- SOURCE OF TRUTH (distributable package)
│   ├── agents/                  # 10 main agents + 8 subagents
│   ├── commands/                # 43 slash commands
│   ├── guides/                  # Behavior guides
│   ├── personas/                # 102 themed personas
│   ├── scripts/                 # Utility scripts
│   ├── skills/                  # 21 knowledge domains
│   └── workflows/               # Workflow definitions
│
├── .claude/                     <- CLAUDE CODE DISCOVERY
│   ├── commands -> ../pennyfarthing-dist/commands   (direct symlink)
│   ├── skills -> ../pennyfarthing-dist/skills       (direct symlink)
│   ├── scripts -> ../pennyfarthing-dist/scripts     (direct symlink)
│   └── project/                 <- Real directory (project-specific)
│       ├── agents/              <- Agent sidecars (patterns, gotchas, decisions)
│       ├── commands/            <- User commands (optional)
│       └── skills/              <- User skills (optional)
│
├── .pennyfarthing/              <- PENNYFARTHING CONTENT
│   ├── agents -> ../pennyfarthing-dist/agents       (direct symlink)
│   ├── guides -> ../pennyfarthing-dist/guides       (direct symlink)
│   ├── personas -> ../pennyfarthing-dist/personas   (direct symlink)
│   ├── scripts -> ../pennyfarthing-dist/scripts     (direct symlink)
│   ├── workflows -> ../pennyfarthing-dist/workflows (direct symlink)
│   ├── sidecars/                <- Agent learning files (real directory)
│   └── config.local.yaml        <- Theme selection (gitignored)
```

**Key insight:** Both `.claude/` and `.pennyfarthing/` use direct symlinks to `pennyfarthing-dist/`. This means everything resolves in a single hop - no symlink chains.

## Dogfood vs Fresh Install Parity

The dogfood structure is **identical** to what `pennyfarthing init` creates, except:

| Aspect | Dogfood | Fresh Install |
|--------|---------|---------------|
| Base path | `../pennyfarthing-dist/` | `../node_modules/@pennyfarthing/core/pennyfarthing-dist/` |
| Source | Local development | npm package |

The relative structure within `.claude/` and `.pennyfarthing/` is the same.

## Data Flow Diagram (v7.0+)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PENNYFARTHING PROJECT                          │
└─────────────────────────────────────────────────────────────────────────┘

   DEVELOPMENT                    EXECUTION                    DISTRIBUTION
   ───────────                    ─────────                    ────────────

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ pennyfarthing-   │         │ .claude/         │         │ Other Projects   │
│ dist/            │◀──LINK──│ (commands/skills)│         │ (npm install)    │
│                  │         │                  │         │                  │
│ • Source of truth│         │ .pennyfarthing/  │         │ • Symlink to     │
│ • Edit here      │◀──LINK──│ (agents/guides/  │         │   node_modules/  │
│ • Commit changes │         │  personas/scripts)         │   @pennyfarthing │
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
ADDING A NEW SCRIPT (v7.0+)
═══════════════════════════

Step 1: Create in source - DONE!
┌──────────────────────────────────────┐
│ pennyfarthing-dist/scripts/new.sh   │  <- File created here
└──────────────────────────────────────┘
         │
         │  .pennyfarthing/scripts is a direct symlink
         ▼
┌──────────────────────────────────────┐
│ .pennyfarthing/scripts/new.sh       │  <- Automatically available!
│                                      │
│   Single-hop symlink resolves        │
└──────────────────────────────────────┘
```

## Rules for Adding Files (v7.0+)

### New Script

```bash
# 1. Create in source - that's it!
vim pennyfarthing-dist/scripts/new-script.sh
chmod +x pennyfarthing-dist/scripts/new-script.sh

# 2. Commit
git add pennyfarthing-dist/scripts/new-script.sh

# No copy step needed - symlinks handle everything
# Available at: .pennyfarthing/scripts/new-script.sh
```

### New Agent

```bash
# 1. Create in source
vim pennyfarthing-dist/agents/new-agent.md

# 2. Commit
git add pennyfarthing-dist/agents/new-agent.md

# Symlink resolves automatically:
# .pennyfarthing/agents -> ../pennyfarthing-dist/agents
```

### New Command

```bash
# 1. Create in source - that's it!
vim pennyfarthing-dist/commands/new-command.md

# 2. Commit
git add pennyfarthing-dist/commands/new-command.md

# Symlink resolves automatically:
# .claude/commands -> ../pennyfarthing-dist/commands
```

### New Skill

```bash
# 1. Create skill directory in source
mkdir pennyfarthing-dist/skills/new-skill
vim pennyfarthing-dist/skills/new-skill/skill.md

# 2. Symlink is automatic (whole directory is symlinked)
# .claude/skills -> ../pennyfarthing-dist/skills

# 3. Commit
git add pennyfarthing-dist/skills/new-skill/
```

### Skill with Scripts

Skills can include scripts in a `scripts/` subdirectory. These need to be discoverable by `run.sh`, which looks in `.pennyfarthing/scripts/`.

```bash
# 1. Create skill with scripts
mkdir -p pennyfarthing-dist/skills/my-skill/scripts
vim pennyfarthing-dist/skills/my-skill/skill.md
vim pennyfarthing-dist/skills/my-skill/scripts/my-script.sh
chmod +x pennyfarthing-dist/skills/my-skill/scripts/my-script.sh

# 2. Add symlink from scripts/ to make it discoverable by run.sh
ln -s ../skills/my-skill/scripts/my-script.sh pennyfarthing-dist/scripts/my-script.sh

# 3. Commit all
git add pennyfarthing-dist/skills/my-skill/
git add pennyfarthing-dist/scripts/my-script.sh
```

**Why the symlink?** The `run.sh` bootstrap looks in `.pennyfarthing/scripts/` (which resolves to `pennyfarthing-dist/scripts/`). Skills can keep their scripts co-located for organization, then symlink into the main scripts directory for discoverability.

**In installed projects:** The installer copies skill scripts to `.pennyfarthing/scripts/` directly, so the pattern works identically.

### New Workflow

```bash
# 1. Create in source
vim pennyfarthing-dist/workflows/new-workflow.yaml

# 2. Commit
git add pennyfarthing-dist/workflows/new-workflow.yaml

# Symlink resolves automatically:
# .pennyfarthing/workflows -> ../pennyfarthing-dist/workflows
```

## Directory Purposes

| Location | Purpose | Git Tracked |
|----------|---------|-------------|
| `pennyfarthing-dist/` | Source of truth | Yes |
| `.claude/commands` | Symlink → `pennyfarthing-dist/commands` | Yes (symlink) |
| `.claude/skills` | Symlink → `pennyfarthing-dist/skills` | Yes (symlink) |
| `.claude/scripts` | Symlink → `pennyfarthing-dist/scripts` | Yes (symlink) |
| `.claude/project/` | Project-specific files | Yes |
| `.pennyfarthing/agents` | Symlink → `pennyfarthing-dist/agents` | Yes (symlink) |
| `.pennyfarthing/guides` | Symlink → `pennyfarthing-dist/guides` | Yes (symlink) |
| `.pennyfarthing/personas` | Symlink → `pennyfarthing-dist/personas` | Yes (symlink) |
| `.pennyfarthing/scripts` | Symlink → `pennyfarthing-dist/scripts` | Yes (symlink) |
| `.pennyfarthing/workflows` | Symlink → `pennyfarthing-dist/workflows` | Yes (symlink) |
| `.pennyfarthing/sidecars/` | Agent learning files | Yes |
| `.pennyfarthing/config.local.yaml` | Theme selection | No (gitignored) |

## Summary (v7.0+)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOGFOODING GOLDEN RULE (v7.0+)              │
│                                                                  │
│   Edit files in pennyfarthing-dist/ only.                       │
│   Symlinks handle everything else automatically.                 │
│                                                                  │
│   Source: pennyfarthing-dist/   (edit and commit here)          │
│                                                                  │
│   Discovery: .claude/           (direct symlinks to source)     │
│   Content:   .pennyfarthing/    (direct symlinks to source)     │
│                                                                  │
│   Exception: Skills with scripts need a symlink in              │
│   pennyfarthing-dist/scripts/ pointing to the skill's script.   │
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

## Cyclist Development

Cyclist is the visual terminal interface in `packages/cyclist/`. Use `just cyclist` for development:

```bash
# Start Cyclist (Electron with folder picker - default)
just cyclist

# Start Cyclist in current directory
just cyclist here

# Start Cyclist in specific directory
just cyclist dir=/path/to/project

# Web dev mode (browser + hot reload)
just cyclist web

# Web server only (production mode)
just cyclist server

# Enable verbose/debug logging
just cyclist verbose

# Combine flags
just cyclist here verbose
just cyclist web dir=/path/to/project
```

**Additional commands:**
```bash
just cyclist-setup          # First-time setup (clean, install, rebuild, build)
just cyclist-build          # Build TypeScript only
just cyclist-doctor         # Diagnose setup issues
just test-cyclist           # Run tests
just cyclist-build-and-install  # Build and install Cyclist.app
```

**Auto-build:** The `just cyclist` command automatically builds workspace dependencies (`@pennyfarthing/shared`, `@pennyfarthing/core`) if their `dist/` folders are missing. No manual build step needed when starting fresh.

### Troubleshooting

**Window not appearing:** The `package.json` has `"main": "dist/server.js"` for npm module use. The `dev` scripts explicitly run `electron dist/main.js` to use the correct entry point. If you run `electron .` directly, it will run the web server instead of the Electron app.

**Pennyfarthing project not detected:** Cyclist looks for `.pennyfarthing/config.local.yaml` or `.pennyfarthing/agents` etc. Make sure you're running from a Pennyfarthing-enabled project directory, or set `CYCLIST_PROJECT_DIR`:

```bash
CYCLIST_PROJECT_DIR=/path/to/project just cyclist-electron
```

**Native modules (node-pty) issues:**
```bash
just cyclist-rebuild   # Rebuild native modules for Electron
just cyclist-setup     # Full clean + install + rebuild + build
```

## Historical Note

- **Prior to v4.0**: `.claude/pennyfarthing/` was a copy of `pennyfarthing-dist/`, requiring manual synchronization.
- **v4.0-v4.0.3**: Used chained symlinks which caused permission issues with Claude Code.
- **v4.0.4-v6.x**: Direct single-hop symlinks, all content in `.claude/`.
- **v7.0+**: Split structure with `.claude/` for discovery and `.pennyfarthing/` for content.
