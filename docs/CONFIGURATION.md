# Configuration Reference

Complete reference for all Pennyfarthing configuration options.

## Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `config.local.yaml` | Theme selection | `.pennyfarthing/` |
| `repos.yaml` | Multi-repo configuration | `.pennyfarthing/` |
| `shared-context.md` | Project overview and structure | `.claude/project/docs/` |
| `agent-scopes.yaml` | Agent scope configuration | `.claude/project/docs/` |
| `setup-env.sh` | Environment variables | `.claude/project/hooks/` |
| `current-sprint.yaml` | Sprint tracking | `sprint/` |
| `{story-id}-session.md` | Active work session | `.session/` |

---

## config.local.yaml

Controls theme selection (gitignored for per-developer preferences).

### Location

`.pennyfarthing/config.local.yaml`

### Example

```yaml
# Theme selection - 97 themes available
theme: discworld

# Workflow configuration
workflow:
  permission_mode: accept     # accept | turbo
  handoff_mode: manual        # manual | auto
  bell_mode: true             # true | false (enable/disable bell notifications)
  relay_mode: true            # true | false (enable/disable relay mode)

# Context budget thresholds
context_budget:
  tirepump_threshold: 60      # TirePump activation threshold (percent)
  imminent_threshold: 65      # Context imminent warning (percent)
  warning_threshold: 60       # Context warning (percent)
  critical_threshold: 85      # Context critical threshold (percent)
  max_tokens: 200000          # Maximum tokens

# Display options (Cyclist terminal)
display:
  show_flow: true             # Show workflow visualization
  show_ocean: false           # Show OCEAN personality scores
  sidebar_width: 300          # Sidebar width in pixels

# Notifications (Cyclist terminal)
notifications:
  phase_change: true          # Notify on phase changes
  sound: false                # Play sounds

# Theme attribute customization
attributes:
  verbosity: medium           # low | medium | high
  formality: casual           # formal | casual | playful
  humor: enabled              # disabled | subtle | enabled
  emoji_use: minimal          # none | minimal | frequent

# Per-agent overrides (optional)
overrides:
  dev:
    verbosity: high
    formality: formal
```

See [THEME-COMPARISON.md](THEME-COMPARISON.md) for all available themes.

For BikeLane workflow configuration and available workflow types, see [BIKELANE.md](BIKELANE.md) and [WORKFLOWS.md](WORKFLOWS.md).

### Options

#### `theme`

Which character set to use.

| Value | Description |
|-------|-------------|
| `discworld` | Terry Pratchett's Discworld (default) |
| `star-trek` | Star Trek: TNG characters |
| `literary-classics` | Classic literature characters |
| `minimalist` | Professional, no personas |

#### `attributes.verbosity`

Response length and detail level.

| Value | Description |
|-------|-------------|
| `low` | Brief, focused. Essential info only. |
| `medium` | Balanced. Context when helpful. (default) |
| `high` | Detailed explanations. Walk through reasoning. |

#### `attributes.formality`

Communication style.

| Value | Description |
|-------|-------------|
| `formal` | Professional, structured. Avoid contractions. |
| `casual` | Conversational but competent. (default) |
| `playful` | Light, humorous. Inject personality. |

#### `attributes.humor`

Character expression level.

| Value | Description |
|-------|-------------|
| `disabled` | No humor or character quirks. |
| `subtle` | Occasional character references. |
| `enabled` | Full character immersion. (default) |

#### `attributes.emoji_use`

Visual expression.

| Value | Description |
|-------|-------------|
| `none` | No emojis. Pure text. |
| `minimal` | Emojis for headers/status only. (default) |
| `frequent` | Emojis throughout responses. |

#### `overrides`

Per-agent attribute overrides. Keys are agent names:
- `orchestrator`, `sm`, `tea`, `dev`, `reviewer`
- `architect`, `pm`, `tech-writer`, `ux-designer`, `devops`, `ba`

#### `workflow.permission_mode`

Controls how permission prompts are handled.

| Value | Description |
|-------|-------------|
| `accept` | Show permission prompts for review (default) |
| `turbo` | Auto-accept permissions, enable auto-handoffs |

#### `workflow.handoff_mode`

Controls agent-to-agent handoff behavior.

| Value | Description |
|-------|-------------|
| `manual` | Wait for user to invoke next agent (default) |
| `auto` | Automatically hand off to next agent |

#### `workflow.bell_mode`

Enable or disable bell notifications in Cyclist.

| Value | Description |
|-------|-------------|
| `true` | Bell notifications enabled (default) |
| `false` | Bell notifications disabled |

#### `workflow.relay_mode`

Enable or disable relay mode for agent coordination.

| Value | Description |
|-------|-------------|
| `true` | Relay mode enabled (default) |
| `false` | Relay mode disabled |

#### `context_budget.tirepump_threshold`

Percentage threshold for TirePump activation (context clearing system). Default: `60`.

When context usage exceeds this threshold and `permission_mode` is `turbo`, TirePump automatically clears context and reloads the agent.

#### `context_budget.imminent_threshold`

Percentage threshold for imminent context warning. Default: `65`.

#### `context_budget.warning_threshold`

Percentage threshold for context warning. Default: `60`.

#### `context_budget.critical_threshold`

Percentage threshold for critical context warning. Default: `85`.

#### `context_budget.max_tokens`

Maximum token budget. Default: `200000`.

#### `display.show_flow`

Show workflow visualization in Cyclist terminal. Default: `true`.

#### `display.show_ocean`

Show OCEAN personality scores in Cyclist terminal. Default: `false`.

#### `display.sidebar_width`

Sidebar width in pixels for Cyclist terminal. Default: `300`.

#### `notifications.phase_change`

Enable notifications on workflow phase changes in Cyclist. Default: `true`.

#### `notifications.sound`

Enable sound notifications in Cyclist. Default: `false`.

---

## shared-context.md

Project overview loaded by all agents.

### Location

`.claude/project/docs/shared-context.md`

### Template

```markdown
# Shared Agent Context - [Project Name]

## Project Overview

- **Name:** Your Project
- **Type:** Web application / API / CLI / etc.
- **Sprint Status:** `sprint/current-sprint.yaml`
- **Active Work:** `.session/{story-id}-session.md`

## Tech Stack

| Repo | Language | Framework |
|------|----------|-----------|
| API | Go | Chi, PostgreSQL |
| UI | TypeScript | React, TailwindCSS |

## Repository Structure

\`\`\`
project-root/
├── api/           # Backend API
├── ui/            # Frontend UI
├── sprint/        # Sprint tracking
├── .session/      # Active work
└── .claude/       # Agent configuration
\`\`\`

## Git Branch Strategy

- **Branch from:** `develop`
- **PRs target:** `develop`
- **Main branch:** `main`

## Commands

### Development
\`\`\`bash
# Start dev servers
just dev

# Run tests
just test
\`\`\`

### Useful Scripts
| Script | Purpose |
|--------|---------|
| `just build` | Build for production |
| `just lint` | Run linters |
```

---

## agent-scopes.yaml

Defines which context each agent type loads.

### Location

`.claude/project/docs/agent-scopes.yaml`

### Template

```yaml
# Agent Scope Configuration

strategic_agents:
  - orchestrator
  - pm
  - sm
  - architect
  - devops

tactical_agents:
  - dev
  - tea
  - reviewer
  - tech-writer
  - ux-designer

context_loading:
  strategic:
    repos: all           # Load all repo contexts
    sprint: true         # Load full sprint status
    session: true        # Load active work session

  tactical:
    repos: target_only   # Load only story's target repo
    sprint: false        # Load story section only
    session: true        # Load active work session

# Project-specific patterns
file_patterns:
  api_repo: "api"
  ui_repo: "ui"
  test_patterns:
    api: "**/*_test.go"
    ui: "**/*.test.ts"
```

---

## repos.yaml

Flexible repository configuration for multi-repo projects.

### Location

`.pennyfarthing/repos.yaml`

### Purpose

Defines all repositories in your project with their types, commands, and dependencies. This replaces the legacy `API_REPO`/`UI_REPO` pattern for projects that need more flexibility.

### Template

```yaml
# Pennyfarthing Repository Configuration
version: "1.0"

# Backward compatibility - generates $API_REPO and $UI_REPO env vars
# Set to null if you don't need legacy compatibility
legacy_compat:
  api_repo: "Pennyfarthing-api"
  ui_repo: "Pennyfarthing-ui"
  create_symlinks: true

# Repository definitions
repos:
  Pennyfarthing-api:
    path: "Pennyfarthing-api"        # Relative to PROJECT_ROOT
    type: api                    # api | ui | adapter | service | shared | lib
    language: go
    test_command: "just test"
    build_command: "just build"
    lint_command: "golangci-lint run"
    dependencies: []             # Other repos this depends on

  Pennyfarthing-ui:
    path: "Pennyfarthing-ui"
    type: ui
    language: typescript
    test_command: "npm run test -- --run"
    build_command: "npm run build"
    lint_command: "npm run lint"
    dependencies: []

# Agent behavior by repo type (optional)
agent_config:
  type_behaviors:
    api:
      pre_test: "docker ps | grep $TEST_CONTAINER || just test-api-setup"
    ui:
      pre_test: ""
    adapter:
      isolated: true            # Adapters don't need other repos
    service:
      pre_test: "docker-compose up -d"

# Build/test order (respects dependencies)
build_order:
  - Pennyfarthing-api
  - Pennyfarthing-ui
```

### Repo Types

| Type | Description | Use Case |
|------|-------------|----------|
| `api` | Backend API | Main backend service |
| `ui` | Frontend UI | Web application frontend |
| `adapter` | External API adapter | Integration with external services |
| `service` | Microservice | Internal backend service |
| `shared` | Shared library | Code shared between repos |
| `lib` | Library package | Standalone library |

### Example Configurations

#### Adapter Project (Multiple Adapters)

```yaml
version: "1.0"

legacy_compat:
  api_repo: null
  ui_repo: null
  create_symlinks: false

repos:
  shared-contracts:
    path: "contracts"
    type: shared
    language: go
    test_command: "go test ./..."
    dependencies: []

  salesforce-adapter:
    path: "adapters/salesforce"
    type: adapter
    language: go
    test_command: "go test ./..."
    dependencies: [shared-contracts]

  dynamics-adapter:
    path: "adapters/dynamics"
    type: adapter
    language: go
    test_command: "go test ./..."
    dependencies: [shared-contracts]

build_order:
  - shared-contracts
  - salesforce-adapter
  - dynamics-adapter
```

#### Microservices

```yaml
version: "1.0"

repos:
  gateway:
    path: "services/gateway"
    type: api
    language: go
    test_command: "go test ./..."
    dependencies: []

  auth-service:
    path: "services/auth"
    type: service
    language: go
    test_command: "go test ./..."
    dependencies: [gateway]

  user-service:
    path: "services/user"
    type: service
    language: go
    test_command: "go test ./..."
    dependencies: [gateway, auth-service]

  web-app:
    path: "apps/web"
    type: ui
    language: typescript
    test_command: "npm test"
    dependencies: [gateway]

build_order:
  - gateway
  - auth-service
  - user-service
  - web-app
```

#### Single Repo

```yaml
version: "1.0"

legacy_compat:
  api_repo: null
  ui_repo: null
  create_symlinks: false

repos:
  my-project:
    path: "."
    type: api
    language: go
    test_command: "go test ./..."
    build_command: "go build -o bin/app"
```

### Using repos.yaml in Scripts

```bash
source $PROJECT_ROOT/scripts/repo-utils.sh

# Check mode
is_legacy_mode && echo "Legacy" || echo "repos.yaml"

# Iterate repos
for repo in $(get_repos); do
    echo "Repo: $repo"
    echo "  Path: $(get_repo_path $repo)"
    echo "  Type: $(get_repo_type $repo)"
    echo "  Test: $(get_test_command $repo)"
done

# Filter by type
for repo in $(get_repos_of_type "adapter"); do
    # Work with adapters
done

# Respect build order
for repo in $(get_build_order); do
    cd $PROJECT_ROOT/$(get_repo_path $repo)
    eval "$(get_build_command $repo)"
done
```

### Backward Compatibility

If `repos.yaml` doesn't exist, the system falls back to `$API_REPO` and `$UI_REPO` environment variables. Existing projects continue to work unchanged.

---

## setup-env.sh

Environment variables for agent sessions.

### Location

`.claude/project/hooks/setup-env.sh`

### Template

```bash
#!/bin/bash
# Environment setup hook

# Project identification
export PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
export PROJECT_NAME="your-project"
export PROJECT_LABEL="YOUR-PROJECT"  # For Jira labels

# Repository names
export API_REPO="your-project-api"
export UI_REPO="your-project-ui"

# Test container name
export TEST_CONTAINER="your-project-test-postgres"

# Source .env if exists
[ -f "$PROJECT_ROOT/.env" ] && set -a && source "$PROJECT_ROOT/.env" && set +a
```

### Usage

This file is sourced automatically by agent commands. Variables are available to:
- Agent session scripts
- Subagent prompts (via `$PROJECT_ROOT`, `$API_REPO`, etc.)
- Test runners

---

## current-sprint.yaml

Active sprint tracking.

### Location

`sprint/current-sprint.yaml`

### Structure

```yaml
sprint:
  name: Sprint 24
  start: 2025-01-06
  end: 2025-01-20
  goal: Complete authentication epic

backlog:
  - id: AUTH-1
    title: User login API
    status: ready          # draft | ready | blocked
    points: 3
    repos: [API]
    priority: high

  - id: AUTH-2
    title: Login UI
    status: ready
    points: 5
    repos: [UI]
    priority: medium

in_progress:
  - id: AUTH-3
    title: Session management
    status: in_progress
    points: 3
    repos: [API, UI]
    assignee: developer
    started: 2025-01-08

completed:
  - id: SETUP-1
    title: Project setup
    points: 2
    completed: 2025-01-07
```

### Story Status Values

| Status | Description |
|--------|-------------|
| `draft` | Story not fully defined |
| `ready` | Ready for work |
| `blocked` | Blocked by dependency |
| `in_progress` | Currently being worked |
| `review` | In code review |
| `approved` | Review passed, ready to finish |
| `done` | Completed |

---

## {story-id}-session.md

Active work session file.

### Location

`.session/{story-id}-session.md`

### Structure

```markdown
# Current Work Session

## Story
- **ID:** AUTH-3
- **Title:** Session management
- **Repos:** API, UI
- **Started:** 2025-01-08T10:30:00

## Acceptance Criteria
1. Sessions persist across page reloads
2. Session expires after 24 hours
3. User can log out to end session

## Technical Context
- Use Redis for session storage
- JWT for token validation
- See: api/internal/auth/session.go

## Progress
- [x] SM: Story setup complete
- [x] TEA: Tests written
- [ ] Dev: Implementation complete
- [ ] Reviewer: Code reviewed

## Status
tea_complete

## Notes
- Using existing Redis connection from config
- Need to add session middleware

## Files Changed
- api/internal/auth/session.go (new)
- api/internal/middleware/auth.go (modified)
- ui/src/hooks/useSession.ts (new)
```

### Status Values

| Status | Description |
|--------|-------------|
| `setup` | Story being set up |
| `tea_working` | TEA writing tests |
| `tea_complete` | Tests written, waiting for Dev |
| `dev_working` | Dev implementing |
| `dev_complete` | Implementation done, ready for review |
| `review` | In code review |
| `rejected` | Review rejected, back to Dev |
| `approved` | Review passed |

---

## Agent Sidecars

Project-specific knowledge for each agent.

### Location

`.pennyfarthing/sidecars/{agent-name}/patterns.md`

### Purpose

Store project-specific patterns, fixes, and knowledge that agents should remember.

### Example

```markdown
# Project Patterns - Dev Memory

## Project-Specific Knowledge

### Database Patterns
- Always use `db.Transaction()` for multi-step operations
- Connection pool size: 10 for dev, 50 for prod

### API Patterns
- All handlers in `internal/handlers/`
- Use `respond.JSON()` for responses
- Errors wrapped with `fmt.Errorf("context: %w", err)`

### Known Issues
- Redis connection flaky in test environment
- Use `TEST_REDIS_HOST` override

### Fixes Applied
- 2025-01-05: Fixed session expiry timezone issue
- 2025-01-03: Added retry logic for external API calls
```

---

## Environment Variables

Variables available during agent sessions.

### Required

| Variable | Description |
|----------|-------------|
| `PROJECT_ROOT` | Absolute path to project root |
| `PROJECT_NAME` | Project identifier |

### Optional

| Variable | Description |
|----------|-------------|
| `API_REPO` | API repository name |
| `UI_REPO` | UI repository name |
| `TEST_CONTAINER` | Test database container name |
| `PROJECT_LABEL` | Jira label for project |
| `JIRA_PROJECT` | Jira project key |
| `JIRA_USER` | Jira username/email |
| `JIRA_API_TOKEN` | Jira API token |

---

## Skill Registry

Skills are registered in the MCP server or settings.

### Skill Locations

- **Core skills:** `pennyfarthing-dist/skills/` (symlinked from `.claude/skills/`)
- **Project skills:** `.claude/project/skills/` (optional, for project-specific skills)

### Skill Structure

```
skills/
├── skill-name/
│   ├── skill.md          # Main skill definition
│   └── references/       # Supporting documentation
│       ├── patterns.md
│       └── examples.md
```

---

## Default Values

If configuration is missing, these defaults apply:

| Setting | Default |
|---------|---------|
| Theme | `discworld` |
| Verbosity | `medium` |
| Formality | `casual` |
| Humor | `enabled` |
| Emoji use | `minimal` |
| Context loading | Strategic: all, Tactical: target only |
