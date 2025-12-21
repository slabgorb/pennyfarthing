# Configuration Reference

Complete reference for all Pennyfarthing configuration options.

## Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `persona-config.yaml` | Theme and personality settings | `.claude/` |
| `shared-context.md` | Project overview and structure | `.claude/project/docs/` |
| `agent-scopes.yaml` | Agent scope configuration | `.claude/project/docs/` |
| `setup-env.sh` | Environment variables | `.claude/project/hooks/` |
| `current-sprint.yaml` | Sprint tracking | `sprint/` |
| `current_work.md` | Active work session | `.session/` |

---

## persona-config.yaml

Controls agent personalities and behavior.

### Location

`.claude/persona-config.yaml`

### Full Example

```yaml
# Theme selection
theme: discworld

# Personality attributes
attributes:
  verbosity: medium      # low | medium | high
  formality: casual      # formal | casual | playful
  humor: enabled         # enabled | disabled | subtle
  emoji_use: minimal     # none | minimal | frequent

# Per-agent overrides (optional)
overrides:
  reviewer:
    humor: disabled
    verbosity: high
  dev:
    verbosity: low
```

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
- `architect`, `pm`, `tech-writer`, `ux-designer`, `devops`

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
- **Active Work:** `.session/current-work.md`

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

## current_work.md

Active work session file.

### Location

`.session/current_work.md`

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

`.claude/project/agents/{agent-name}-sidecar/patterns.md`

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

- **Core skills:** `pennyfarthing/skills/`
- **Project skills:** `.claude/project/skills/`

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
