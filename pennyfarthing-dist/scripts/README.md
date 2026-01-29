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

## Distributed Scripts

**These scripts ship to users via npm.** They become available at `.pennyfarthing/scripts/` in consumer projects.

### What Goes Here

Scripts that users need for their workflows:
- Sprint/story management
- Jira integration
- Git operations
- Workflow mechanics
- Theme management
- Portrait generation (requires GPU setup)

### What Does NOT Go Here

Meta scripts for Pennyfarthing development belong in `scripts/` (at repo root):
- `deploy.sh` (release Pennyfarthing itself)
- Benchmark runners
- Job Fair evaluation
- Other CI/development tools

See `CLAUDE.md` for the full decision tree.

### Development

When developing Pennyfarthing (in orchestrator pattern):
1. Edit files in `pennyfarthing/pennyfarthing-dist/scripts/`
2. Run `just sync` from orchestrator to rebuild
3. Changes available via `.pennyfarthing/scripts/` symlinks
4. Commit changes to `pennyfarthing/` repo

For installed projects (via npm):
1. `npm install @pennyfarthing/core` creates `.pennyfarthing/`
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
