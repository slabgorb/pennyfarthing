# Audit: Files Pennyfarthing Produces Outside `.pennyfarthing/`

**Story:** PROJ-14365
**Epic:** epic-85 (Clean Install Consolidation)
**Date:** 2026-02-06
**Source:** `packages/core/src/cli/commands/init.ts`, `update.ts`, `doctor.ts`, `utils/settings.ts`, `utils/symlinks.ts`, `utils/constants.ts`

## Summary

Pennyfarthing `init` and `update` create files in **5 distinct locations** outside `.pennyfarthing/`. This audit catalogs every file with its source, purpose, and recommended migration plan.

**Total files/dirs outside `.pennyfarthing/`:** 22+
**Created by init:** 19
**Created by update (migration only):** 3 additional
**Runtime-generated:** 0 (runtime files already live in `.pennyfarthing/`)

---

## 1. `.claude/` Root Files

### 1.1 `manifest.json`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:229-233` via `writeManifest()` |
| **Updated by** | `update.ts:198-203` |
| **Content** | Version, projectName, installationType, nodeModulesPath, managedPaths, fileHashes |
| **Gitignored** | No (committed) |
| **Claude Code reads it** | No |
| **Migration plan** | **Move** to `.pennyfarthing/manifest.json` |
| **Notes** | Only read by Pennyfarthing's own init/update/doctor. No external dependency on `.claude/` location. |

### 1.2 `settings.local.json`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:369` via `mergeSettingsLocalJson()` |
| **Updated by** | `update.ts:103`, `doctor.ts` fix functions |
| **Content** | Hooks (SessionStart, SessionEnd, Stop, PreToolUse, PostToolUse), permissions, statusLine, env vars |
| **Gitignored** | Yes |
| **Claude Code reads it** | **Yes** — this is how Claude Code discovers hooks and permissions |
| **Migration plan** | **Symlink** — canonical at `.pennyfarthing/settings.local.json`, symlink at `.claude/settings.local.json` |
| **Notes** | Claude Code requires this at `.claude/settings.local.json`. Cannot simply move. The symlink approach preserves discovery while consolidating ownership. |

### 1.3 `preferences.yaml`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:331` (skip-if-exists template) |
| **Template** | `templates/preferences.yaml.template` |
| **Content** | User preferences (display, behavior settings) |
| **Gitignored** | No (committed) |
| **Claude Code reads it** | No |
| **Migration plan** | **Move** to `.pennyfarthing/preferences.yaml` |
| **Notes** | User-customized after first edit. Only read by Pennyfarthing agents. |

### 1.4 `persona-config.yaml`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:331` (skip-if-exists template) |
| **Template** | `templates/persona-config.yaml.template` |
| **Content** | Theme selection, persona display settings |
| **Gitignored** | No (committed, but `.claude/persona-config.local.yaml` is gitignored) |
| **Claude Code reads it** | No |
| **Migration plan** | **Deprecate** — partially done. `.pennyfarthing/config.local.yaml` is already the runtime config. Doctor already flags this as legacy. Remove template generation for this path; update code to read from `.pennyfarthing/config.local.yaml` exclusively. |
| **Notes** | Doctor's `checkLegacyFiles()` already detects dual configs. Story PROJ-14367 covers this specifically. |

---

## 2. `.claude/commands/` Directory

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:170-172` via `copyCommandsDirectory()` |
| **Updated by** | `update.ts:180-181` |
| **Content** | Merged directory: built-in command `.md` files copied from `node_modules/.../commands/` + user commands from `.claude/project/commands/` |
| **Gitignored** | No (committed) |
| **Claude Code reads it** | **Yes** — command discovery requires `.claude/commands/` |
| **Migration plan** | **Keep** — Claude Code requires this path for command discovery. Continue copying built-in commands here. |
| **Notes** | `ALL_SYMLINKS` in constants.ts includes `{ name: 'commands', link: '.claude/commands' }`. This is a hard requirement from Claude Code. The copy approach (not symlink) allows merging built-in + user commands. |

---

## 3. `.claude/skills/` Directory

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:175-177` via `copySkillsDirectory()` |
| **Updated by** | `update.ts:183-184` |
| **Content** | Merged directory: built-in skill subdirs copied from `node_modules/.../skills/` + user skills from `.claude/project/skills/` |
| **Gitignored** | No (committed) |
| **Claude Code reads it** | **Yes** — skill discovery requires `.claude/skills/` |
| **Migration plan** | **Keep** — Claude Code requires this path for skill discovery. Continue copying built-in skills here. |
| **Notes** | Same as commands — hard Claude Code requirement. Skills are directories (not single files), each containing `skill.md` + supporting files. |

---

## 4. `.claude/project/` Subtree

### 4.1 `.claude/project/docs/shared-context.md`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:333` (skip-if-exists template) |
| **Template** | `templates/shared-context.md.template` |
| **Content** | Project description, tech stack, conventions |
| **Claude Code reads it** | **Yes** — loaded as project context via `.claude/project/docs/` convention |
| **Migration plan** | **Keep** — Claude Code reads `.claude/project/docs/` for context. This is a Claude Code convention, not a Pennyfarthing invention. |

### 4.2 `.claude/project/docs/agent-scopes.yaml`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:334` (skip-if-exists template) |
| **Template** | `templates/agent-scopes.yaml.template` |
| **Content** | Agent scope definitions (what each agent can/cannot do) |
| **Claude Code reads it** | **Yes** — loaded as project context |
| **Migration plan** | **Keep** — same reasoning as shared-context.md. Part of Claude Code's project context system. |

### 4.3 `.claude/project/hooks/setup-env.sh`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:336` (skip-if-exists template, mode 0o755) |
| **Template** | `templates/setup-env.sh.template` |
| **Content** | Environment setup (PROJECT_ROOT export, PATH modifications) |
| **Claude Code reads it** | **Yes** — referenced in `settings.local.json` SessionStart hooks |
| **Migration plan** | **Move** to `.pennyfarthing/project/hooks/setup-env.sh` and update the hook path in `settings.local.json`. Doctor fix functions reference `"$CLAUDE_PROJECT_DIR"/.claude/project/hooks/setup-env.sh`. |
| **Notes** | Story PROJ-14368 covers this. The hook command path in settings.local.json needs updating. |

### 4.4 `.claude/project/pennyfarthing-settings.yaml`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:335` (skip-if-exists template) |
| **Template** | `templates/pennyfarthing-settings.yaml.template` |
| **Content** | Repo definitions, test commands, build commands |
| **Claude Code reads it** | Indirectly — referenced by agents, not by Claude Code directly |
| **Migration plan** | **Move** to `.pennyfarthing/project/pennyfarthing-settings.yaml` |
| **Notes** | Only read by Pennyfarthing scripts/agents. No Claude Code dependency. |

### 4.5 `.pennyfarthing/repos.yaml`

| Attribute | Value |
|-----------|-------|
| **Created by** | `/pf-setup` workflow (not init directly) |
| **Content** | Repository definitions for multi-repo orchestrators |
| **Claude Code reads it** | No |
| **Migration plan** | **Done** — moved to `.pennyfarthing/repos.yaml` |
| **Notes** | Generated by setup workflow, not by init template. Read by sprint scripts. |

### 4.6 `.claude/project/commands/` (empty directory)

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:98` |
| **Content** | User custom command `.md` files (initially empty) |
| **Claude Code reads it** | No — files are copied into `.claude/commands/` during init/update |
| **Migration plan** | **Move** to `.pennyfarthing/project/commands/` — this is the staging area for user commands, not the discovery path |
| **Notes** | Update `copyCommandsDirectory()` to read from new location. |

### 4.7 `.claude/project/skills/` (empty directory)

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:99` |
| **Content** | User custom skill directories (initially empty) |
| **Claude Code reads it** | No — skills are copied into `.claude/skills/` during init/update |
| **Migration plan** | **Move** to `.pennyfarthing/project/skills/` — same as commands |
| **Notes** | Update `copySkillsDirectory()` to read from new location. |

---

## 5. `.git/hooks/`

### 5.1 `pre-commit`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:258-318` via `installGitHooks()` |
| **Source** | `node_modules/.../scripts/hooks/pre-commit.sh` |
| **Content** | Branch protection, agent validation, sprint YAML validation |
| **Migration plan** | **Keep** — `.git/hooks/` is the standard git hooks location. No migration needed. |
| **Notes** | Contains `pennyfarthing` marker for detection. Backs up existing non-Pennyfarthing hooks. |

### 5.2 `pre-push`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:258-318` via `installGitHooks()` |
| **Source** | `node_modules/.../scripts/hooks/pre-push.sh` |
| **Content** | Jira sync reminder |
| **Migration plan** | **Keep** |

### 5.3 `post-merge`

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:258-318` via `installGitHooks()` |
| **Source** | `node_modules/.../scripts/hooks/post-merge.sh` |
| **Content** | Sprint YAML auto-update, workspace cleanup |
| **Migration plan** | **Keep** |

---

## 6. Other Locations

### 6.1 `.session/` directory

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:105` |
| **Content** | Active work session files (`{story-id}-session.md`) |
| **Gitignored** | Yes (except `.session/.gitkeep`) |
| **Migration plan** | **Keep** or **Move** to `.pennyfarthing/sessions/`. Low priority — already gitignored and clearly Pennyfarthing-owned by convention. |
| **Notes** | Contains `context-story-*.md` files at runtime. |

### 6.2 `sprint/` directory

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:103` |
| **Content** | Sprint YAML, archive, context files |
| **Migration plan** | **Keep** — this is project-level data, not framework data. Belongs at project root. |
| **Notes** | Sprint data is user/project data, not framework files. Moving it under `.pennyfarthing/` would conflate framework with project data. |

### 6.3 `.gitignore` entries

| Attribute | Value |
|-----------|-------|
| **Created by** | `init.ts:372-411` via `updateGitignore()` |
| **Content** | Appends Pennyfarthing runtime entries |
| **Migration plan** | **Keep** — `.gitignore` is the standard location. Entries should be updated when file paths change. |
| **Entries added** | `.session/*`, `!.session/.gitkeep`, `.claude/settings.local.json`, `.claude/persona-config.local.yaml`, `.pennyfarthing/config.local.yaml`, `*.pid`, `*-pid`, `*-port`, `.pennyfarthing/*.json`, `.cyclist-*` |

---

## Migration Plan Summary

### Move to `.pennyfarthing/` (7 items)

| Current Path | New Path | Blocker |
|--------------|----------|---------|
| `.claude/manifest.json` | `.pennyfarthing/manifest.json` | Update `manifest.ts` read/write paths |
| `.claude/preferences.yaml` | `.pennyfarthing/preferences.yaml` | Update agent reads |
| `.claude/project/hooks/setup-env.sh` | `.pennyfarthing/project/hooks/setup-env.sh` | Update settings.local.json hook path |
| `.claude/project/pennyfarthing-settings.yaml` | `.pennyfarthing/project/pennyfarthing-settings.yaml` | Update script reads |
| `.claude/project/commands/` | `.pennyfarthing/project/commands/` | Update `copyCommandsDirectory()` source |
| `.claude/project/skills/` | `.pennyfarthing/project/skills/` | Update `copySkillsDirectory()` source |
| `.claude/project/repos.yaml` | `.pennyfarthing/repos.yaml` | **Done** — scripts updated |

### Symlink (1 item)

| Current Path | Canonical Path | Reason |
|--------------|---------------|--------|
| `.claude/settings.local.json` | `.pennyfarthing/settings.local.json` | Claude Code requires `.claude/settings.local.json` |

### Deprecate (1 item)

| Path | Reason | Action |
|------|--------|--------|
| `.claude/persona-config.yaml` | Superseded by `.pennyfarthing/config.local.yaml` | Stop generating, doctor already flags |

### Keep in place (8 items)

| Path | Reason |
|------|--------|
| `.claude/commands/` | Claude Code command discovery (hard requirement) |
| `.claude/skills/` | Claude Code skill discovery (hard requirement) |
| `.claude/project/docs/shared-context.md` | Claude Code project context convention |
| `.claude/project/docs/agent-scopes.yaml` | Claude Code project context convention |
| `.git/hooks/pre-commit` | Standard git hooks location |
| `.git/hooks/pre-push` | Standard git hooks location |
| `.git/hooks/post-merge` | Standard git hooks location |
| `sprint/` | Project data, not framework files |

### Keep but consider moving (1 item)

| Path | Notes |
|------|-------|
| `.session/` | Already gitignored. Could move to `.pennyfarthing/sessions/` for consolidation but low priority. |

### Update references (1 item)

| File | Updates needed |
|------|---------------|
| `.gitignore` | Update paths when files move (e.g., `.claude/persona-config.local.yaml` → `.pennyfarthing/` equivalent) |

---

## Legacy Paths (Already Handled)

These are cleaned up by init/update but worth documenting:

| Legacy Path | Cleaned by | Status |
|-------------|-----------|--------|
| `.claude/pennyfarthing/` | `init.ts:138-144` | Removed on init |
| `.claude/agents/` | `init.ts:147-154` | Removed on init (now `.pennyfarthing/agents/`) |
| `.claude/guides/` | `init.ts:147-154` | Removed on init |
| `.claude/personas/` | `init.ts:147-154` | Removed on init |
| `.claude/scripts/` | `init.ts:147-154` | Removed on init |
| `.claude/project/agents/{agent}-sidecar/` | `update.ts:211-267` | Migrated to `.pennyfarthing/sidecars/` |
| `sprint/sidecars/` | `update.ts:211-267` | Migrated to `.pennyfarthing/sidecars/` |
| `.claude/scripts/statusline.sh` | `doctor.ts:1468-1488` | Flagged by doctor |
| `.claude/persona-config.yaml` | `doctor.ts:1490-1507` | Flagged by doctor |

---

## Impact on Subsequent Stories

| Story | Files Affected | Notes |
|-------|---------------|-------|
| PROJ-14366 (settings.local.json) | 1.2 | Symlink approach |
| PROJ-14367 (persona-config.yaml) | 1.4 | Deprecation |
| PROJ-14368 (project hooks) | 4.3, 4.4, 4.5, 4.6, 4.7 | Move `.claude/project/` subtree |
| PROJ-14369 (sidecars) | Legacy paths | Already mostly done |
| PROJ-14370 (init command) | All "Move" items | Update init to use new paths |
| PROJ-14371 (update command) | All "Move" items | Migration logic |
| PROJ-14372 (doctor) | All items | Validate new layout |
