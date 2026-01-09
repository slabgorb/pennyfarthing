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

1. **Changes propagate**: Agent definitions here affect all projects using pennyfarthing via npm
2. **Backwards compatibility**: Consider how changes affect existing project integrations
3. **Self-reference**: We use pennyfarthing to develop pennyfarthing (this is intentional)
4. **Official subagents**: All subagents use Claude Code's official agent format

## Architecture Principles

### Single Source of Truth
All agent definitions live in `pennyfarthing-dist/agents/`. Projects access via symlinks in `.claude/agents/`.

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
├── pennyfarthing-dist/      # Source files (managed)
│   ├── agents/              # Agent definitions + official subagents
│   ├── commands/            # Slash command definitions
│   ├── guides/              # Behavior guides
│   ├── skills/              # Project-agnostic knowledge domains
│   └── personas/            # Character themes
├── src/                     # NPM CLI source
├── scripts/                 # Utility scripts
└── tests/                   # Framework tests

After npm install in project:
.claude/
├── pennyfarthing/           # Copy of pennyfarthing-dist/
├── agents/                  # → symlink to pennyfarthing/agents/
├── commands/                # → symlink to pennyfarthing/commands/
├── skills/                  # → symlink to pennyfarthing/skills/
└── project/                 # Project-specific (user-editable)
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

## Cyclist Package

Cyclist is a visual terminal interface for Claude Code, providing:
- Real-time terminal output with persona styling
- Agent portraits and OCEAN personality traits
- Story/session progress tracking
- Git status and context information

### Key Modules

| Module | Purpose |
|--------|---------|
| `packages/cyclist/src/parser.ts` | Parse Claude CLI output for stats |
| `packages/cyclist/src/claude-service.ts` | Claude Code CLI wrapper (programmatic mode) |
| `packages/cyclist/src/otlp-receiver.ts` | OpenTelemetry metrics receiver |
| `packages/cyclist/src/pennyfarthing.ts` | Theme/persona config reader |

### Running Cyclist

```bash
# Web mode (browser)
just cyclist-web /path/to/project

# Electron mode
just cyclist-electron

# Server only (standalone)
just cyclist-server /path/to/project
```

### IPC Pattern

All main↔renderer communication uses typed IPC:
```typescript
// Define channels, create handlers, expose via preload
window.electronAPI.xxx.get()           // Request data
window.electronAPI.xxx.onUpdate(cb)    // Subscribe to updates
```

See `.claude/project/agents/dev-sidecar/gotchas.md` for IPC registration gotchas.
