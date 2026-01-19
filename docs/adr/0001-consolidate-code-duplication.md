# ADR-0001: Consolidate Code Duplication Across CLI and Scripts

**Status:** Accepted
**Date:** 2025-12-31
**Author:** Architect (Naomi Nagata)

## Context

A comprehensive codebase analysis identified significant code duplication across TypeScript CLI commands, shell scripts, and agent definitions. This duplication:

1. Increases maintenance burden (changes must be made in multiple places)
2. Creates risk of divergence (copies getting out of sync)
3. Inflates codebase size unnecessarily
4. Makes behavior harder to reason about

## Decision

We will consolidate duplicated code into shared utilities following a phased approach, prioritizing high-impact duplication in the CLI layer first.

## Analysis Summary

### TypeScript CLI (`src/cli/`)

| Pattern | Locations | Lines Duplicated |
|---------|-----------|------------------|
| `findNodeModulesPath()` | init.ts:31-45, update.ts:32-44, doctor.ts:23-35 | 13 lines × 3 |
| Symlink array definitions | init.ts:168-173, update.ts:196-201, update.ts:281-286, doctor.ts:227-234 | 6 lines × 4 |
| `mergeSettingsLocalJson()` / `mergeSettingsHooks()` | init.ts:334-451, update.ts:453-569 | 117 lines × 2 (95% identical) |
| Symlink removal pattern | init.ts:179-193, update.ts:210-219 | 15 lines × 2 |
| TTY check pattern | prompts.ts:18, 43, 67 | 3 lines × 3 |

### Shell Scripts (`pennyfarthing-dist/scripts/`)

| Pattern | File | Occurrences |
|---------|------|-------------|
| `DRY_RUN` check | jira-lib.sh:60,78,110,140,171,203,227,301 | 8 |
| JSON field extraction | jira-lib.sh:176-186,209-216,237-240 | 3+ |
| Summary escaping | jira-lib.sh:67,85 | 2 |

### Agent Definitions (`pennyfarthing-dist/agents/`)

| Pattern | Files | Impact |
|---------|-------|--------|
| Error Recovery section | reviewer-handoff-approve.md, reviewer-handoff-reject.md, dev-handoff.md | 45+ lines identical |
| Reasoning-mode template | sm.md, tea.md, dev.md | 90% structural similarity |
| Frontmatter format | 8+ agent files | Repeated boilerplate |

## Proposed Changes

### Phase 1: CLI Utilities (High Priority)

Create new utility modules:

```
src/cli/utils/
├── node-modules.ts    # findNodeModulesPath()
├── constants.ts       # Agent lists, symlink definitions
├── symlinks.ts        # Symlink operations
└── settings.ts        # Unified settings merge function
```

#### 1.1 `src/cli/utils/node-modules.ts`

```typescript
import { join, dirname } from 'path';
import { pathExists } from './files.js';

export function findNodeModulesPath(projectRoot: string): string | null {
  // Check standard location first
  const standard = join(projectRoot, 'node_modules/pennyfarthing/pennyfarthing-dist');
  if (pathExists(standard)) return standard;

  // Check hoisted locations (monorepo)
  let dir = dirname(projectRoot);
  while (dir !== '/' && dir !== dirname(dir)) {
    const hoisted = join(dir, 'node_modules/pennyfarthing/pennyfarthing-dist');
    if (pathExists(hoisted)) return hoisted;
    dir = dirname(dir);
  }

  return null;
}
```

#### 1.2 `src/cli/utils/constants.ts`

```typescript
export const CORE_AGENTS = [
  'dev', 'tea', 'sm', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
] as const;

export const CORE_SYMLINKS = [
  { name: 'agents', link: '.claude/agents' },
  { name: 'guides', link: '.claude/guides' },
  { name: 'personas', link: '.claude/personas' },
  { name: 'scripts', link: '.claude/scripts' }
] as const;

export const ALL_SYMLINKS = [
  ...CORE_SYMLINKS,
  { name: 'commands', link: '.claude/commands' },
  { name: 'skills', link: '.claude/skills' }
] as const;

export const MANAGED_PATHS = [
  '.claude/agents',
  '.claude/commands',
  '.claude/guides',
  '.claude/skills',
  '.claude/personas',
  '.claude/scripts'
] as const;
```

#### 1.3 `src/cli/utils/symlinks.ts`

```typescript
import { unlinkSync } from 'fs';
import { removeSync, pathExists } from 'fs-extra';
import { isSymlink } from './files.js';

export function removeSymlinkOrDirectory(path: string, dryRun: boolean): boolean {
  if (!pathExists(path) && !isSymlink(path)) {
    return false;
  }

  if (dryRun) {
    return true;
  }

  try {
    unlinkSync(path);
    return true;
  } catch {
    try {
      removeSync(path);
      return true;
    } catch {
      return false;
    }
  }
}
```

#### 1.4 Merge settings functions

Consolidate `mergeSettingsLocalJson()` (init.ts) and `mergeSettingsHooks()` (update.ts) into a single `mergeSettingsHooks()` function in `src/cli/utils/settings.ts`.

### Phase 2: Shell Script Helpers (Medium Priority)

Add to `pennyfarthing-dist/scripts/utils/common.sh`:

```bash
#!/bin/bash
# Common utility functions for Pennyfarthing scripts

# Unified dry-run check with warning
# Returns 0 if dry-run is active (caller should return), 1 otherwise
dry_run_check() {
  local action="$1"
  if [ "$DRY_RUN" = true ]; then
    warn "[DRY-RUN] Would ${action}"
    return 0
  fi
  return 1
}

# Escape string for JQL queries
escape_for_jql() {
  echo "$1" | sed 's/"/\\"/g'
}

# Get Jira issue JSON with error handling
get_issue_json() {
  local key="$1"
  local json
  json=$(jira issue view "$key" --raw 2>/dev/null)
  if [ -z "$json" ]; then
    echo "{}"
    return 1
  fi
  echo "$json"
}

# Extract field from Jira JSON
get_jira_field() {
  local json="$1"
  local field_path="$2"
  local default="${3:-}"
  echo "$json" | jq -r "${field_path} // \"${default}\""
}
```

### Phase 3: Agent Template Consolidation (Lower Priority)

#### 3.1 Create shared error recovery guide

Create `pennyfarthing-dist/guides/handoff-error-recovery.md`:

```markdown
# Handoff Error Recovery Guide

Standard error recovery protocol for all handoff subagents.

## Retry Pattern

1. **Log the failure:** Note which step failed and why
2. **Diagnose:** What specifically went wrong?
3. **Adjust:** Try a different approach (max 2 retries)
4. **Escalate:** If still failing, report to calling agent

## Common Failures and Fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| Session file not found | Wrong story ID or path | Verify STORY_ID matches session filename |
| Section already exists | Duplicate handoff attempt | Skip if section present, log warning |
| Git operation failed | Uncommitted changes or conflicts | Stash changes, resolve conflicts |
| Permission denied | File ownership issues | Check file permissions |

## Escalation Format

When escalating to calling agent:
- Error type and message
- Steps attempted
- Current state of session file
- Suggested resolution
```

#### 3.2 Reference from handoff agents

Replace duplicated error recovery sections with:

```markdown
## Error Recovery

**See:** `.pennyfarthing/guides/handoff-error-recovery.md`
```

## Consequences

### Positive

- **Single source of truth** for shared logic
- **Reduced maintenance burden** - changes in one place
- **Smaller codebase** - ~300+ fewer duplicated lines
- **Consistent behavior** - shared utilities behave identically
- **Easier testing** - can unit test shared utilities

### Negative

- **Additional imports** needed in consuming files
- **Migration effort** required to update existing code
- **Potential for breaking changes** if utilities are modified incorrectly

### Neutral

- No runtime performance impact (same code, different location)
- Agent behavior unchanged (documentation consolidation only)

## Implementation Plan

| Phase | Scope | Estimated Impact | Status |
|-------|-------|------------------|--------|
| 1 | CLI utilities | ~150 lines consolidated | Complete |
| 2 | Shell helpers | ~50 lines consolidated | Complete |
| 3 | Agent templates | ~100 lines consolidated | Not implemented |

**Total reduction:** ~140 lines (Phases 1 & 2)

## Implementation Status

Commits:
- `68d3809` - Phase 1: CLI utilities (node-modules.ts, constants.ts, symlinks.ts)
- `a33bb02` - Phase 2: Bash helpers (common.sh, jira-lib.sh refactor)

### Phase 3 Decision

Phase 3 was attempted but reverted. Rationale:

1. **Haiku subagents don't reliably read referenced files** - They're task-focused with limited context
2. **Reliability > DRY for agent instructions** - Inline content ensures agents have the information
3. **Different trade-off than code** - Phases 1 & 2 consolidated executed code; Phase 3 was documentation

The ~90 lines of duplication in handoff agents is acceptable for reliable error handling.

## Alternatives Considered

### 1. Leave as-is

**Rejected:** Maintenance burden will compound as codebase grows.

### 2. Code generation from templates

**Deferred:** Overkill for current scale. May revisit if agent count grows significantly.

### 3. Symlink shared sections in markdown

**Rejected:** Markdown doesn't support includes; would require preprocessing step.

## References

- Analysis performed: 2025-12-31
- Files analyzed: 15+ TypeScript, 10+ shell scripts, 20+ agent definitions
- Tools used: Grep, file content analysis
