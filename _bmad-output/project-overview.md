# Project Overview

## Executive Summary

**Pennyfarthing** is a Claude Code agent orchestration framework with TDD workflow and themed personas. It coordinates multiple AI agents through story-driven development cycles, enabling consistent, high-quality software delivery with AI assistance.

| Attribute | Value |
|-----------|-------|
| **Version** | 7.0.2 |
| **Node.js** | >=18.0.0 |
| **Type** | ES module with TypeScript (pnpm monorepo) |
| **License** | UNLICENSED |
| **Repository** | https://github.com/1898andCo/pennyfarthing.git |

## Business Purpose

Pennyfarthing solves the challenge of coordinating multiple AI agents in software development workflows by:

1. **Enforcing TDD discipline** - RED → GREEN → REVIEW cycle ensures test-first development
2. **Managing context efficiently** - Lazy loading and context optimization prevent token waste
3. **Providing traceability** - Session files and sprint tracking create audit trails
4. **Enabling specialization** - Different agents handle different concerns (testing, implementation, review)
5. **Supporting customization** - 102+ themed personas allow team personality alignment

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pennyfarthing Framework                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ @pf/core     │  │ @pf/cyclist  │  │ @pf/shared   │          │
│  │ CLI & Orch   │  │ Visual Term  │  │ Utilities    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────┴─────────────────┴─────────────────┴──────┐           │
│  │              pennyfarthing-dist/                 │           │
│  │  agents/ commands/ skills/ personas/ workflows/  │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
│  ┌────────────────────────────────────────────────┐             │
│  │              Runtime State                      │             │
│  │  .session/   sprint/   .pennyfarthing/         │             │
│  └────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Core Workflows

### TDD Flow (Default - 3+ Story Points)

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
           setup   red   green  review   archive
```

| Phase | Agent | Responsibility |
|-------|-------|----------------|
| Setup | SM (Scrum Master) | Story selection, context creation, branch setup |
| Red | TEA (Test Engineer) | Write failing tests covering acceptance criteria |
| Green | Dev (Developer) | Implement minimal code to pass tests |
| Review | Reviewer | Adversarial security/quality review |
| Finish | SM | Archive session, transition Jira, close story |

### Trivial Flow (1-2 Story Points)

```
/new-work → SM → Dev → Reviewer → SM (finish)
           setup  impl   review   archive
```

Skips TEA phase for chores, small fixes, and refactors.

### Agent-Docs Flow (Meta Work)

```
SM → Orchestrator → Tech Writer → SM
```

For agent/skill documentation maintenance.

## Key Components

### Packages (Monorepo)

| Package | Purpose | Entry Point |
|---------|---------|-------------|
| **@pennyfarthing/core** | CLI framework, orchestration | `bin/pennyfarthing.js` |
| **@pennyfarthing/cyclist** | Visual terminal (Electron + web) | `dist/main.js` (desktop), `dist/server.js` (web) |
| **@pennyfarthing/shared** | Shared utilities | `dist/index.js` |

### Distribution Content

| Directory | Count | Purpose |
|-----------|-------|---------|
| `agents/` | 18 | Main agents + subagents |
| `commands/` | 43 | Slash commands |
| `skills/` | 21+ | Knowledge domains |
| `workflows/` | 4 | Workflow definitions |
| `personas/` | 102+ | Themed characters |

## External Integrations

| System | Integration | Purpose |
|--------|-------------|---------|
| **Jira** | CLI (`jira` command) | Sprint tracking, story management |
| **GitHub** | Git operations, PRs | Version control, code review |
| **Claude Code** | `.claude/` discovery | AI agent interface |
| **OpenTelemetry** | OTLP receiver | Span tracking and enrichment |

## Quality Metrics

- **Test Coverage Target:** Not explicitly defined (framework-dependent)
- **Linting:** ESLint 9 with TypeScript rules
- **Type Safety:** Strict TypeScript mode
- **CI/CD:** GitHub Actions (build, lint, test)

## Success Criteria

Pennyfarthing is considered successful when:

1. Agents complete TDD cycles without human intervention
2. Session files accurately reflect workflow state
3. Jira/GitHub integrations sync correctly
4. Context usage stays within efficient bounds
5. Themed personas provide consistent character voice
