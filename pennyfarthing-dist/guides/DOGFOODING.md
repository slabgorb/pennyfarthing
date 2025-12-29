# Pennyfarthing Dogfooding Architecture

Pennyfarthing uses itself for development - "eating your own dogfood." This creates a dual-path architecture that requires careful synchronization.

## The Three Locations

```
pennyfarthing/
├── pennyfarthing-dist/          ← SOURCE OF TRUTH (distributable package)
│   ├── agents/
│   ├── commands/
│   ├── scripts/
│   └── ...
│
├── .claude/                      ← CLAUDE CODE INTEGRATION
│   ├── pennyfarthing/           ← LOCAL INSTALL (copy of pennyfarthing-dist)
│   │   ├── agents/
│   │   ├── commands/
│   │   └── scripts/             ← EXECUTED BY run.sh
│   │
│   ├── agents -> pennyfarthing/agents     (symlink)
│   ├── commands -> pennyfarthing/commands (symlink)
│   └── skills -> pennyfarthing/skills     (symlink)
│
└── scripts/                      ← PROJECT CONVENIENCE (symlinks to source)
    ├── run.sh -> ../pennyfarthing-dist/scripts/run.sh
    ├── release.sh -> ../pennyfarthing-dist/scripts/release.sh
    └── ...
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PENNYFARTHING PROJECT                          │
└─────────────────────────────────────────────────────────────────────────┘

   DEVELOPMENT                    EXECUTION                    DISTRIBUTION
   ───────────                    ─────────                    ────────────

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ pennyfarthing-   │         │ .claude/         │         │ Other Projects   │
│ dist/            │ ──COPY──│ pennyfarthing/   │         │ (npm install)    │
│                  │ ──────▶ │                  │         │                  │
│ • Source of truth│         │ • Local install  │         │ • Get fresh copy │
│ • Edit here      │         │ • Runs scripts   │         │ • pennyfarthing  │
│ • Commit changes │         │ • Used by Claude │         │   init creates   │
└────────┬─────────┘         └────────┬─────────┘         └──────────────────┘
         │                            │
         │                            │
         ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│ scripts/         │         │ run.sh execution │
│ (symlinks)       │         │ path:            │
│                  │         │                  │
│ Used for direct  │         │ .claude/         │
│ CLI invocation   │         │ pennyfarthing/   │
│ ./scripts/run.sh │         │ scripts/         │
└──────────────────┘         └──────────────────┘
```

## The Synchronization Problem

When you add a new file to `pennyfarthing-dist/`, it does NOT automatically appear in `.claude/pennyfarthing/`.

```
ADDING A NEW SCRIPT
═══════════════════

Step 1: Create in source
┌──────────────────────────────────────┐
│ pennyfarthing-dist/scripts/new.sh   │  ← File created here
└──────────────────────────────────────┘
                    │
                    │  scripts/new.sh symlink works
                    ▼
┌──────────────────────────────────────┐
│ scripts/new.sh -> ../pennyfarthing- │  ← Symlink resolves
│                   dist/scripts/new.sh│
└──────────────────────────────────────┘

                    BUT

┌──────────────────────────────────────┐
│ .claude/pennyfarthing/scripts/      │  ← FILE MISSING!
│                                      │
│   run.sh looks here and fails       │
└──────────────────────────────────────┘

Step 2: MUST also copy to local install
┌──────────────────────────────────────┐
│ cp pennyfarthing-dist/scripts/new.sh│
│    .claude/pennyfarthing/scripts/   │
└──────────────────────────────────────┘
```

## Why Two Paths?

### Path 1: `scripts/` Symlinks → `pennyfarthing-dist/`

```bash
# Direct CLI usage - symlinks to source
./scripts/release.sh --bump minor
     │
     └──▶ ../pennyfarthing-dist/scripts/release.sh
```

**Purpose:** Convenient direct access during development. Changes to `pennyfarthing-dist/` are immediately available.

### Path 2: `run.sh` → `.claude/pennyfarthing/scripts/`

```bash
# Via run.sh - uses local install
./scripts/run.sh release.sh --bump minor
     │
     └──▶ .claude/pennyfarthing/scripts/run.sh
              │
              └──▶ .claude/pennyfarthing/scripts/release.sh
```

**Purpose:** The `run.sh` bootstrap finds PROJECT_ROOT and executes from the local install. This mirrors how external projects use Pennyfarthing.

## The Recent Incident

```
WHAT HAPPENED
═════════════

1. deploy.sh existed in pennyfarthing-dist/scripts/
2. release.sh calls deploy.sh from $SCRIPT_DIR
3. run.sh executes from .claude/pennyfarthing/scripts/
4. deploy.sh was NOT in .claude/pennyfarthing/scripts/
5. Release failed with "no such file or directory"

FIX: Copy to both locations

  pennyfarthing-dist/scripts/deploy.sh  ← Source (for commits)
  .claude/pennyfarthing/scripts/deploy.sh  ← Local (for execution)
```

## Rules for Adding Files

### New Script

```bash
# 1. Create in source
vim pennyfarthing-dist/scripts/new-script.sh
chmod +x pennyfarthing-dist/scripts/new-script.sh

# 2. Copy to local install
cp pennyfarthing-dist/scripts/new-script.sh \
   .claude/pennyfarthing/scripts/

# 3. Create convenience symlink (optional)
ln -s ../pennyfarthing-dist/scripts/new-script.sh \
      scripts/new-script.sh

# 4. Commit source only (local install may be gitignored)
git add pennyfarthing-dist/scripts/new-script.sh
```

### New Agent/Command/Skill

```bash
# 1. Create in source
vim pennyfarthing-dist/agents/new-agent.md

# 2. Copy to local install
cp pennyfarthing-dist/agents/new-agent.md \
   .claude/pennyfarthing/agents/

# 3. Symlinks in .claude/ should already point to .claude/pennyfarthing/
#    so no additional symlink needed
```

## Directory Purposes

| Location | Purpose | Git Tracked | Execution |
|----------|---------|-------------|-----------|
| `pennyfarthing-dist/` | Source of truth | Yes | No |
| `.claude/pennyfarthing/` | Local install | Partial | Yes (via run.sh) |
| `scripts/` | Convenience symlinks | Yes (symlinks) | Yes (direct) |
| `.claude/agents` etc. | Claude integration | Yes (symlinks) | Via Claude |

## Automation Opportunity

Consider adding a sync script:

```bash
#!/bin/bash
# sync-dogfood.sh - Keep local install in sync with source

rsync -av --delete \
  pennyfarthing-dist/ \
  .claude/pennyfarthing/ \
  --exclude '.session'
```

Or a pre-commit hook to ensure synchronization.

## Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOGFOODING GOLDEN RULE                       │
│                                                                  │
│   When adding files to pennyfarthing-dist/, ALWAYS also copy    │
│   them to .claude/pennyfarthing/ for local execution.           │
│                                                                  │
│   Source: pennyfarthing-dist/   (commit this)                   │
│   Local:  .claude/pennyfarthing/ (execute from here)            │
└─────────────────────────────────────────────────────────────────┘
```
