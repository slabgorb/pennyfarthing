# Source Tree Analysis

## Root Directory Structure

```
pennyfarthing/                          # Project root
├── packages/                           # [CRITICAL] Monorepo packages
│   ├── core/                          # CLI & orchestration
│   ├── cyclist/                       # Visual terminal
│   └── shared/                        # Shared utilities
│
├── pennyfarthing-dist/                 # [CRITICAL] Single source of truth
│   ├── agents/                        # Agent definitions (18)
│   ├── commands/                      # Slash commands (43)
│   ├── skills/                        # Knowledge domains (21+)
│   ├── workflows/                     # Workflow definitions (4)
│   ├── personas/                      # Themed characters (102+)
│   ├── guides/                        # Behavior patterns
│   ├── scripts/                       # Utility scripts
│   └── templates/                     # Sidecar templates
│
├── .claude/                           # [SYMLINKS] Claude Code discovery
│   ├── commands/                      # → pennyfarthing-dist/commands
│   └── skills/                        # → pennyfarthing-dist/skills
│
├── .pennyfarthing/                    # [SYMLINKS + CONFIG] User config
│   ├── agents/                        # → pennyfarthing-dist/agents
│   ├── guides/                        # → pennyfarthing-dist/guides
│   ├── personas/                      # → pennyfarthing-dist/personas
│   ├── scripts/                       # → pennyfarthing-dist/scripts
│   ├── sidecars/                      # Agent learning files
│   └── config.local.yaml              # Theme configuration
│
├── .bmad/                             # [BMAD] Brownfield discovery docs
│
├── sprint/                            # [RUNTIME] Sprint tracking
│   ├── current-sprint.yaml            # Active sprint data
│   ├── backlog.yaml                   # Future epics/stories
│   ├── archive/                       # Completed sprints
│   └── context/                       # Epic context files
│
├── .session/                          # [RUNTIME] Active work sessions
│   └── {story-id}-session.md          # Session files
│
├── docs/                              # Documentation (28 files)
│   ├── adr/                           # Architecture Decision Records
│   └── brownfield/                    # Discovery documentation
│
├── benchmarks/                        # Agent benchmarking
├── internal/                          # Dev results & showcase
├── scenarios/                         # Benchmark scenarios
│
├── package.json                       # Root workspace config
├── pnpm-workspace.yaml                # pnpm workspace definition
├── tsconfig.base.json                 # Shared TypeScript config
├── eslint.config.mjs                  # ESLint flat config
├── CLAUDE.md                          # Main AI guidance
└── README.md                          # User-facing overview
```

## Package Deep Dives

### @pennyfarthing/core (`packages/core/`)

```
packages/core/
├── bin/
│   └── pennyfarthing.js               # CLI entry point
├── src/
│   ├── cli/
│   │   ├── commands/                  # CLI subcommands
│   │   │   ├── init.ts               # Initialize in project
│   │   │   ├── update.ts             # Update to latest
│   │   │   ├── doctor.ts             # Health check
│   │   │   ├── uninstall.ts          # Remove from project
│   │   │   └── version.ts            # Version display
│   │   └── utils/                     # CLI utilities
│   │       ├── logger.ts             # Logging with chalk
│   │       ├── prompts.ts            # inquirer prompts
│   │       ├── manifest.ts           # Package manifest
│   │       └── files.ts              # File operations
│   ├── bmad/                          # BMAD artifact parsing
│   │   ├── story-parser.ts           # Parse story files
│   │   ├── epics-parser.ts           # Parse epics files
│   │   ├── context-reader.ts         # Project context
│   │   ├── story-exporter.ts         # Export stories
│   │   └── status-sync.ts            # Status synchronization
│   ├── jira/                          # Jira integration
│   │   └── jira-epic-creation.ts     # Epic auto-creation
│   ├── permissions/                   # Runtime permissions
│   └── workflow/                      # Workflow management
│       └── workflow-router.ts        # Story→workflow routing
├── dist/                              # [TRACKED] Compiled output
├── package.json
└── tsconfig.json
```

### @pennyfarthing/cyclist (`packages/cyclist/`)

```
packages/cyclist/
├── src/
│   ├── main.ts                        # Electron main process
│   ├── server.ts                      # WheelHub - Express server
│   ├── preload.ts                     # Electron preload script
│   ├── websocket.ts                   # Real-time communication
│   ├── agent-context.ts               # Agent state management
│   ├── story-context.ts               # Story/session tracking
│   ├── story-parser.ts                # Parse session files
│   ├── theme-metadata.ts              # Theme management
│   ├── otlp-receiver.ts               # OpenTelemetry receiver
│   ├── enriched-span-exporter.ts      # Span enrichment
│   ├── tdd-metrics.ts                 # TDD workflow metrics
│   ├── settings.ts                    # Settings management
│   ├── settings-window.ts             # Settings UI
│   ├── file-browser.ts                # File system navigation
│   ├── context-meter.ts               # Token usage tracking
│   ├── api/                           # REST API routes
│   │   ├── index.ts                  # Route exports
│   │   ├── stats-routes.ts           # Stats API
│   │   └── ...                       # Other routes
│   └── public/                        # Static assets
│       ├── index.html                # Main HTML
│       ├── css/                      # Stylesheets
│       └── js/                       # Frontend JavaScript
│           ├── main.js              # Main UI logic
│           ├── components/          # UI components
│           └── tiptap.bundle.js     # Rich text editor
├── tests/                             # Vitest tests
│   └── B-*.test.ts                   # Test files (B- prefix)
├── build/                             # Electron builder config
├── dist/                              # [TRACKED] Compiled output
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### @pennyfarthing/shared (`packages/shared/`)

```
packages/shared/
├── src/
│   ├── index.ts                       # Main exports
│   └── portraits.ts                   # Portrait path resolution
├── dist/                              # [TRACKED] Compiled output
├── package.json
└── tsconfig.json
```

## Key File Relationships

### Symlink Architecture

```
.claude/commands/  ──symlink──▶  pennyfarthing-dist/commands/
.claude/skills/    ──symlink──▶  pennyfarthing-dist/skills/
.pennyfarthing/agents/  ──symlink──▶  pennyfarthing-dist/agents/
.pennyfarthing/guides/  ──symlink──▶  pennyfarthing-dist/guides/
.pennyfarthing/personas/ ──symlink──▶ pennyfarthing-dist/personas/
.pennyfarthing/scripts/  ──symlink──▶ pennyfarthing-dist/scripts/
```

### Configuration Hierarchy

```
1. pennyfarthing-dist/           # Distributed defaults
2. .pennyfarthing/config.local.yaml  # User overrides (theme)
3. .claude/project/              # Project-specific customizations
4. sprint/current-sprint.yaml    # Runtime sprint state
5. .session/{id}-session.md      # Active work state
```

### Build Output Flow

```
packages/*/src/**/*.ts
    │
    ▼ (tsc)
packages/*/dist/**/*.js     # Compiled JavaScript
    │                       # (COMMITTED - not gitignored)
    ▼
npm publish → npmjs.com     # Distribution
    │
    ▼
npx pennyfarthing init      # User installation
```

## Critical Directories

| Directory | Criticality | Why |
|-----------|-------------|-----|
| `pennyfarthing-dist/` | **VERY HIGH** | Single source of truth for all definitions |
| `packages/core/src/` | **HIGH** | Core CLI and orchestration logic |
| `packages/cyclist/src/` | **HIGH** | Visual terminal implementation |
| `.session/` | **MEDIUM** | Runtime state (ephemeral) |
| `sprint/` | **MEDIUM** | Sprint tracking and context |
| `docs/` | **LOW** | Documentation (not distributed) |

## Files NOT to Modify

| Path | Reason |
|------|--------|
| `packages/*/dist/` | Generated output (but tracked) |
| `.claude/commands/` | Symlink to pennyfarthing-dist |
| `.claude/skills/` | Symlink to pennyfarthing-dist |
| `.pennyfarthing/agents/` | Symlink to pennyfarthing-dist |
| `pnpm-lock.yaml` | Auto-generated dependency lock |

## Files to Modify with Caution

| Path | Reason |
|------|--------|
| `pennyfarthing-dist/agents/*.md` | Affects all agent behavior |
| `sprint/current-sprint.yaml` | Active sprint state |
| `package.json` (root) | Affects all packages |
| `tsconfig.base.json` | Shared compiler options |
