---
name: dogfooding
description: Guidance for developing Pennyfarthing itself. Use when working in the pennyfarthing monorepo.
---

# Dogfooding Skill

## Overview

This skill provides guidance for developing Pennyfarthing using Pennyfarthing - "eating your own dogfood." It covers the unique aspects of working within the monorepo where `.claude/` symlinks point to `pennyfarthing-dist/`.

## Quick Reference

| Location | Purpose | Edit Here? |
|----------|---------|------------|
| `pennyfarthing-dist/` | Source of truth | YES |
| `.claude/` | Symlinks to source | NO |
| `.claude/project/` | Project-specific (not distributed) | YES |
| `packages/cyclist/` | Cyclist visual terminal | YES |
| `packages/shared/` | Shared utilities | YES |
| `src/` | CLI source | YES |

## Key Differences from Normal Projects

### 1. Direct Symlinks (Single Hop)

In the pennyfarthing repo, `.claude/` contains direct symlinks:

```
.claude/agents -> ../pennyfarthing-dist/agents     (direct)
.claude/personas -> ../pennyfarthing-dist/personas (direct)
.claude/scripts -> ../pennyfarthing-dist/scripts   (direct)
```

In installed projects, the path goes through `node_modules/`:

```
.claude/agents -> ../node_modules/pennyfarthing/pennyfarthing-dist/agents
```

### 2. Project-Specific vs Distributed

| Location | Distributed? | Use For |
|----------|--------------|---------|
| `pennyfarthing-dist/skills/` | YES | Skills shipped to users |
| `.claude/project/skills/` | NO | Pennyfarthing-only skills (like this one) |
| `pennyfarthing-dist/commands/` | YES | Commands shipped to users |
| `.claude/project/commands/` | NO | Pennyfarthing-only commands |

### 3. Portrait Resolution

Cyclist resolves portraits using `@pennyfarthing/shared` which walks up from its module location looking for `pennyfarthing-dist/`.

**Portrait Path:** `pennyfarthing-dist/personas/portraits/{theme}/{slug}.png`

**Slug Format:** `{shortName}-{OCEAN}` (e.g., `potter-45342`)

**Common Issue:** If portrait doesn't load, check:
1. Theme file has `shortName` field for the character
2. OCEAN scores match portrait filename
3. `portraitsDir` is resolving correctly in Cyclist

### 4. Monorepo Packages

```
packages/
├── cyclist/      # Electron visual terminal
│   ├── src/      # TypeScript source
│   └── dist/     # Compiled output (committed)
├── shared/       # @pennyfarthing/shared utilities
│   ├── src/      # TypeScript source
│   └── dist/     # Compiled output (committed)
```

**Important:** Both `dist/` directories are committed because we serve directly from GitHub.

## Development Workflow

### Adding a New Agent

```bash
# 1. Create in source
vim pennyfarthing-dist/agents/new-agent.md

# 2. Commit - symlink handles the rest
git add pennyfarthing-dist/agents/new-agent.md
```

### Adding a New Distributed Command

```bash
# 1. Create in source
vim pennyfarthing-dist/commands/new-command.md

# 2. Add symlink (commands use individual file symlinks)
ln -s ../../pennyfarthing-dist/commands/new-command.md .claude/commands/new-command.md

# 3. Commit both
git add pennyfarthing-dist/commands/new-command.md .claude/commands/new-command.md
```

### Adding a Pennyfarthing-Only Skill

```bash
# 1. Create in project-specific location (NOT pennyfarthing-dist)
mkdir -p .claude/project/skills/my-skill
vim .claude/project/skills/my-skill/skill.md

# 2. Commit
git add .claude/project/skills/my-skill/
```

### Adding a Distributed Skill

```bash
# 1. Create skill directory in source
mkdir pennyfarthing-dist/skills/new-skill
vim pennyfarthing-dist/skills/new-skill/skill.md

# 2. Add to skill registry
vim pennyfarthing-dist/skills/skill-registry.yaml

# 3. Add symlink
ln -s ../../pennyfarthing-dist/skills/new-skill .claude/skills/new-skill

# 4. Commit all
git add pennyfarthing-dist/skills/new-skill/
git add pennyfarthing-dist/skills/skill-registry.yaml
git add .claude/skills/new-skill
```

### Modifying Cyclist

```bash
# 1. Make changes in packages/cyclist/src/
vim packages/cyclist/src/public/js/persona.js

# 2. Build if TypeScript
cd packages/cyclist && pnpm build

# 3. Test locally
pnpm dev  # or: just cyclist

# 4. Commit both src and dist
git add packages/cyclist/
```

## Diagnostics

### Check Symlink Health

```bash
./pennyfarthing-dist/scripts/doctor-dogfood.sh
./pennyfarthing-dist/scripts/doctor-dogfood.sh --fix  # Auto-repair
```

### Check Portrait Resolution

```bash
# From project root
node -e "
const { resolvePennyfarthingDist, getPortraitPaths } = require('./packages/shared/dist/index.js');
const dist = resolvePennyfarthingDist();
console.log('Dist:', dist);
if (dist) {
  const paths = getPortraitPaths(dist);
  console.log('Portraits:', paths.portraitsDir);
}
"
```

### Check Theme/Persona Loading

```bash
# Check current theme config
yq 'theme' .pennyfarthing/config.local.yaml

# Check if theme file exists
ls pennyfarthing-dist/personas/themes/

# Check portrait files for a theme
ls pennyfarthing-dist/personas/portraits/{theme}/
```

## Common Issues

### Portrait Not Loading

**Symptom:** Cyclist shows placeholder instead of character portrait

**Causes:**
1. `shortName` missing in theme YAML
2. OCEAN scores don't match any portrait filename
3. `@pennyfarthing/shared` can't resolve `pennyfarthing-dist` path

**Fix:** Verify slug generation matches portrait filename:
- Theme YAML `shortName: Potter` + `ocean: {O:4,C:5,E:3,A:4,N:2}` → `potter-45342.png`

### Symlink Chain Issues

**Symptom:** Claude Code can't read files through symlinks

**Cause:** Chained symlinks (`.claude/x -> y -> z`) don't resolve properly

**Fix:** Use single-hop direct symlinks:
```bash
# Wrong (chained)
.claude/agents -> .claude/pennyfarthing/agents -> ../pennyfarthing-dist/agents

# Correct (direct)
.claude/agents -> ../pennyfarthing-dist/agents
```

### Changes Not Appearing

**Symptom:** Edited `pennyfarthing-dist/` but changes not visible in `.claude/`

**Cause:** Symlink broken or pointing wrong place

**Fix:**
```bash
ls -la .claude/agents  # Check symlink target
./pennyfarthing-dist/scripts/doctor-dogfood.sh --fix
```

## Testing Pennyfarthing Changes

### Before Committing

1. Run doctor: `./pennyfarthing-dist/scripts/doctor-dogfood.sh`
2. Test CLI: `node dist/cli/index.js doctor`
3. Test Cyclist: `cd packages/cyclist && pnpm dev`
4. Run tests: `pnpm test` (from monorepo root)

### Multi-Package Changes

When changes span packages, build in order:

```bash
# 1. Shared first (others depend on it)
cd packages/shared && pnpm build

# 2. Cyclist
cd packages/cyclist && pnpm build

# 3. CLI
pnpm build
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PENNYFARTHING_DIST` | Override dist path | `/custom/path/pennyfarthing-dist` |
| `CYCLIST_PROJECT_DIR` | Project directory for Cyclist | `/path/to/project` |
| `CYCLIST_SESSION_ID` | Session ID for agent tracking | `uuid` |
| `CYCLIST_THEME_PATH` | Override theme file path | `/path/to/theme.yaml` |

## See Also

- `docs/DOGFOODING.md` - Full architecture documentation
- `pennyfarthing-dist/scripts/doctor-dogfood.sh` - Health check script
- `packages/shared/src/portrait-resolver.ts` - Portrait path resolution
