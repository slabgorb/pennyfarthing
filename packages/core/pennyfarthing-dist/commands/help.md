---
description: Context-aware help for Pennyfarthing commands, agents, and workflows
---

<purpose>
Get help with Pennyfarthing commands, agents, themes, and workflows.
Provides quick-start guidance for new users and context-aware suggestions based on current work state.
</purpose>

<when-to-use>
- New to Pennyfarthing and need orientation
- Looking for a specific command or agent
- Want to understand the TDD workflow
- Need to check available themes
- Forgot what command to use next
</when-to-use>

<quick-start>

## New to Pennyfarthing?

Start here:

1. **`/work`** - Smart entry point (resumes existing work or starts new)
2. **`/new-work`** - Start a fresh work session from backlog
3. **`/health-check`** - Verify your installation is working

### First Time Setup

If Pennyfarthing isn't installed yet:
```bash
npx pennyfarthing init
```

</quick-start>

<workflow>

## TDD Workflow

Pennyfarthing uses Test-Driven Development with four core agents:

```
SM → TEA → Dev → Reviewer → SM (finish)
```

| Phase | Agent | Command | Role |
|-------|-------|---------|------|
| Setup | SM (Scrum Master) | `/sm` | Story selection, context creation |
| RED | TEA (Test Engineer) | `/tea` | Write failing tests |
| GREEN | Dev (Developer) | `/dev` | Implement to pass tests |
| Review | Reviewer | `/reviewer` | Code review, quality enforcement |
| Finish | SM | `/sm` | Merge PR, archive session |

### Workflow Commands

| Command | Description |
|---------|-------------|
| `/new-work` | Start a new work session with Pennyfarthing |
| `/work` | Resume work or start new - smart entry point |
| `/sm` | Scrum Master - Story coordination and sprint management |
| `/tea` | Test Engineer/Architect - Test strategy and TDD |
| `/dev` | Developer - Feature implementation and coding |
| `/reviewer` | Code Reviewer - Critical code review and quality enforcement |
| `/check` | Run quality gates (lint, type check, tests) before handoff |

</workflow>

<agents>

## All Agents (24)

### TDD Workflow Agents

| Agent | Command | Role |
|-------|---------|------|
| SM | `/sm` | Scrum Master - Story coordination, sprint management, workflow entry/exit |
| TEA | `/tea` | Test Engineer - Test strategy, TDD design, RED phase |
| Dev | `/dev` | Developer - Implementation, feature shipping, GREEN phase |
| Reviewer | `/reviewer` | Code Reviewer - Quality enforcement, adversarial review |

### Specialist Agents

| Agent | Command | Role |
|-------|---------|------|
| Architect | `/architect` | System Architect - Technical design and architecture |
| PM | `/pm` | Product Manager - Strategic planning and prioritization |
| DevOps | `/devops` | DevOps Engineer - Infrastructure and deployment automation |
| Tech-Writer | `/tech-writer` | Technical Writer - Documentation creation and maintenance |
| UX-Designer | `/ux-designer` | UX Designer - User experience design and UI patterns |
| Orchestrator | `/orchestrator` | Orchestrator - Coordinator of all agents and meta operations |

</agents>

<commands>

## All Commands (43)

### TDD Workflow (7)
| Command | Description |
|---------|-------------|
| `/new-work` | Start a new work session with Pennyfarthing |
| `/work` | Resume work or start new - smart entry point |
| `/sm` | Scrum Master - Story coordination and sprint management |
| `/tea` | Test Engineer/Architect - Test strategy and TDD |
| `/dev` | Developer - Feature implementation and coding |
| `/reviewer` | Code Reviewer - Critical code review and quality enforcement |
| `/check` | Run quality gates (lint, type check, tests) before handoff |

### Specialist Agents (6)
| Command | Description |
|---------|-------------|
| `/architect` | System Architect - Technical design and architecture |
| `/pm` | Product Manager - Strategic planning and prioritization |
| `/devops` | DevOps Engineer - Infrastructure and deployment automation |
| `/tech-writer` | Technical Writer - Documentation creation and maintenance |
| `/ux-designer` | UX Designer - User experience design and UI patterns |
| `/orchestrator` | Orchestrator - Coordinator of all agents and meta operations |

### Sprint & Planning (5)
| Command | Description |
|---------|-------------|
| `/sprint-planning` | Facilitate sprint planning session |
| `/start-epic` | Start an epic - move to current sprint and generate tech context |
| `/retro` | Facilitate a sprint retrospective |
| `/sync-work-with-sprint` | Sync Pennyfarthing work session with unified sprint status |
| `/sync-epic-to-jira` | Sync Pennyfarthing epic to Jira MSSCI project |

### Context & Loading (2)
| Command | Description |
|---------|-------------|
| `/prime` | Load essential project context at agent activation |
| `/health-check` | Check Pennyfarthing installation health and apply updates |

### Theme Management (5)
| Command | Description |
|---------|-------------|
| `/list-themes` | List all available persona themes |
| `/show-theme` | Show details of a theme including all agent personas |
| `/set-theme` | Set the active persona theme |
| `/create-theme` | Create a new custom persona theme |
| `/theme-maker` | Interactive wizard for creating custom persona themes |

### Creative & Brainstorm (4)
| Command | Description |
|---------|-------------|
| `/party-mode` | Free-form creative brainstorming with all agents |
| `/brainstorm` | Structured problem-solving brainstorm session |
| `/job-fair` | Discover which characters in a theme excel at each role |
| `/solo` | Run a single agent on a scenario with absolute rubric scoring |

### Benchmarking (2)
| Command | Description |
|---------|-------------|
| `/benchmark` | Compare an agent's performance against a stored baseline |
| `/benchmark-control` | Create control baseline for a scenario |

### Git & Repository (4)
| Command | Description |
|---------|-------------|
| `/repo-status` | Check git status of all project repos |
| `/git-cleanup` | Clean up git repos by organizing changes into commits/branches |
| `/create-branches-from-story` | Create feature branches in both repos from a story |
| `/release` | Merge develop to main and push (optional version bump) |

### Utility (4)
| Command | Description |
|---------|-------------|
| `/continue-session` | Resume work from a saved checkpoint after context circuit breaker |
| `/parallel-work` | Start parallel work in a new worktree |
| `/update-domain-docs` | Update CLAUDE-*.md domain documentation files |
| `/help` | This help command |

</commands>

<themes>

## Themes

Pennyfarthing agents adopt personas from themed character sets. There are **102 themes** available.

### Popular Themes

| Theme | Description |
|-------|-------------|
| `rome` | Characters from HBO's Rome series |
| `star-trek-tos` | Original Star Trek series characters |
| `star-trek-tng` | Star Trek: The Next Generation characters |
| `discworld` | Terry Pratchett's Discworld characters |
| `shakespeare` | Shakespearean characters |
| `jane-austen` | Jane Austen novel characters |
| `breaking-bad` | Breaking Bad characters |
| `battlestar-galactica` | Battlestar Galactica characters |

Run `/list-themes` to see all 102 available themes.

### Theme Commands

| Command | Description |
|---------|-------------|
| `/list-themes` | See all available themes |
| `/show-theme` | View current theme with character mappings |
| `/set-theme <name>` | Change to a different theme |
| `/create-theme` | Create a custom theme |
| `/theme-maker` | Interactive theme creation wizard |

### Current Theme

Check your current theme:
```bash
cat .pennyfarthing/config.local.yaml
```

</themes>

<context-aware>

## Context-Aware Help

Based on your current state, here's what you might need:

### No Active Session
- Use `/work` or `/new-work` to begin
- Check `/health-check` if first time

### In Dev Phase
- Run `/check` before handoff
- Then `/reviewer` for code review

### In Review Phase
- Reviewer will approve or reject
- Then `/sm` to finish the story

### Between Stories
- `/work` to pick up next story
- `/sprint-planning` for planning session

</context-aware>

<reference>

## Documentation

- **Project Setup:** `CLAUDE.md`
- **Sprint Status:** `sprint/current-sprint.yaml`
- **Active Session:** `.session/*-session.md`
- **Agent Definitions:** `pennyfarthing-dist/agents/*.md`
- **Command Definitions:** `pennyfarthing-dist/commands/*.md`
- **Theme Files:** `pennyfarthing-dist/personas/themes/*.yaml`
- **Guides:** `.pennyfarthing/guides/*.md`

## Getting More Help

For detailed help on a specific command, read its definition file:
```bash
cat pennyfarthing-dist/commands/<command-name>.md
```

For agent documentation:
```bash
cat pennyfarthing-dist/agents/<agent-name>.md
```

</reference>
