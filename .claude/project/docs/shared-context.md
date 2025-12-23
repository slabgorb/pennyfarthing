# Pennyfarthing Development Context

> "The outer loop goes once, the inner loop goes many times."

## What This Project Is

Pennyfarthing is a **shared agent orchestration framework** designed to be embedded in other projects. It provides:

- **Agent definitions**: Reusable agent personas and behaviors
- **Subagent coordinators**: Lightweight handoff automation (Haiku-based)
- **Slash commands**: Entry points for workflows
- **Persona system**: Themeable character overlays
- **Skills**: Project-agnostic knowledge domains

## Meta-Development Considerations

When working on pennyfarthing itself, remember:

1. **Changes propagate**: Agent definitions here affect all projects using pennyfarthing as a submodule
2. **Backwards compatibility**: Consider how changes affect existing project integrations
3. **Self-reference**: We use pennyfarthing to develop pennyfarthing (this is intentional)

## Architecture Principles

### Single Source of Truth
All agent definitions live in `core/agents/`. Projects symlink to these, never copy.

### Context Budgeting
Agents should load 500-800 lines max. Design for just-in-time loading.

### Hierarchical Agents
- **Strategic** (PM, Architect, Orchestrator): Full project scope
- **Tactical** (SM, TEA, Dev, Reviewer): Story-scoped execution

### Subagent Pattern
Main agent (Opus) thinks and decides. Helper (Haiku) executes mechanical work.

## Directory Structure

```
pennyfarthing/
├── core/
│   ├── agents/          # Agent definitions (single source of truth)
│   ├── subagents/       # Haiku-based handoff coordinators
│   ├── commands/        # Slash command definitions
│   └── docs/            # Core documentation
├── personas/
│   ├── attributes.yaml  # Personality dimensions
│   └── themes/          # Character themes (discworld, star-trek, etc.)
├── skills/              # Project-agnostic knowledge domains
├── benchmarks/          # Agent performance testing
└── scripts/             # Initialization and utilities
```

## Key Domains for Development

### LLM-in-the-Loop Patterns
- ReAct (Reason + Act)
- Plan-and-Execute
- Self-Reflection
- Tool augmentation

### Human-in-the-Loop Patterns
- Confidence protocols (HIGH/MEDIUM/LOW)
- Approval gates
- Handoff detection and routing

### Agentic Coding Patterns
- TDD workflow orchestration
- Multi-agent collaboration
- Context window management
- State persistence via session files

## Utility Scripts

Sprint 1 introduced reusable utilities in `scripts/utils/`:

### Retry Utilities (`scripts/utils/retry.sh`)

Exponential backoff for resilient command execution:

```bash
source scripts/utils/retry.sh

# Retry with: 3 attempts, 1s initial delay, 10s max delay
retry_with_backoff 3 1 10 curl -s https://api.example.com/health

# Primary command with fallback
command_with_fallback "git pull --ff-only" "git pull --no-rebase"
```

### Checkpoint Utilities (`scripts/utils/checkpoint.sh`)

Session state persistence for resumable work:

```bash
source scripts/utils/checkpoint.sh

# Save checkpoint
checkpoint_save "story_phase" "dev"
checkpoint_save "last_file" "src/main.go:42"

# Restore checkpoint
phase=$(checkpoint_restore "story_phase")

# List recent checkpoints
checkpoint_list

# Rotate to prevent unbounded growth
checkpoint_rotate 500
```

### Repo Scanning (`scripts/utils/repo-scan.sh`)

Cross-repo git status for workflow coordination:

```bash
source scripts/utils/repo-scan.sh

# Single repo status: repo|branch|uncommitted|ahead
scan_repo_git_status pennyfarthing

# All configured repos
scan_all_repos_status

# Check for open PR on branch
check_repo_pr pennyfarthing feature/my-branch
```

## Testing Changes

When modifying agent behavior:
1. Use the benchmark framework in `benchmarks/`
2. Test across multiple personas to ensure capability isn't tied to theme
3. Consider edge cases in handoff transitions
