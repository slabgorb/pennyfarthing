# Pennyfarthing Scripts

Scripts are organized into categorical subdirectories. **Full paths are required** when invoking scripts to avoid ambiguity.

## Directory Structure

```
scripts/
├── core/       # Essential scripts (run.sh, agent-session.sh)
├── workflow/   # Workflow mechanics (finish-story.sh, check.sh)
├── sprint/     # Sprint YAML operations (sprint-status.sh)
├── story/      # Story operations (create-story.sh)
├── jira/       # Jira integration (jira-claim-story.sh)
├── git/        # Git operations (release.sh, worktree-manager.sh)
├── theme/      # Theme operations (list-themes.sh)
├── test/       # Test infrastructure (test-setup.sh)
├── lib/        # Shared bash libraries (common.sh, logging.sh)
├── misc/       # Uncategorized utilities
├── hooks/      # Git and Claude hooks
└── tests/      # Script tests
```

## Usage

All scripts are invoked via `run.sh` with **full category paths**:

```bash
# From project root
.pennyfarthing/scripts/core/run.sh core/agent-session.sh start sm
.pennyfarthing/scripts/core/run.sh sprint/sprint-status.sh
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh MSSCI-12345
.pennyfarthing/scripts/core/run.sh workflow/finish-story.sh MSSCI-12345
```

## Dogfooding Pattern

Pennyfarthing uses itself for development ("dogfooding"):

- **Source of truth:** `pennyfarthing-dist/scripts/`
- **Symlinked to:** `.pennyfarthing/scripts/` (for runtime use)
- **Write changes to:** `pennyfarthing-dist/scripts/` (not `.pennyfarthing/`)

When developing Pennyfarthing itself:
1. Edit files in `pennyfarthing-dist/scripts/`
2. Changes are immediately available via the symlink
3. Commit changes to `pennyfarthing-dist/`

For installed projects:
1. `npm install github:1898andCo/pennyfarthing` creates `.pennyfarthing/`
2. Scripts are accessed via `.pennyfarthing/scripts/`
3. Users don't modify scripts directly

## Adding New Scripts

1. Identify the appropriate category
2. Add script to `pennyfarthing-dist/scripts/{category}/`
3. Update the category's README.md
4. Update any skill.md files that reference the script

## Library Usage

Shared libraries in `lib/` are sourced by other scripts:

```bash
SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/../lib/common.sh"
source "$SCRIPT_DIR/../lib/logging.sh"
```
