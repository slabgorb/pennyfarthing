# Shared Context (All Agents)

**This file provides project context that all agents need.**

Loaded automatically by `/prime --agent <name>` on agent activation.

---

## Project Info

**Project:** Pennyfarthing - Claude Code agent orchestration framework
**Version:** 6.3.0
**Type:** ES module with TypeScript (pnpm monorepo)
**Node:** >=18.0.0

### Directory Structure

```
pennyfarthing-dist/      # Single source of truth for all definitions
├── agents/              # 10 main agents + 14 official subagents
├── commands/            # 42 slash commands
├── guides/              # Behavior guides and patterns
├── skills/              # 18+ knowledge domain skills
├── personas/            # 102 themed agent personas
│   └── themes/          # Theme YAML files
└── scripts/             # Utility scripts

packages/                # Monorepo packages
├── core/                # CLI commands (init, update, doctor)
├── cyclist/             # Visual terminal (Electron/Express)
└── shared/              # Shared utilities (skill search, etc.)

src/                     # Main TypeScript source
sprint/                  # Sprint tracking (current-sprint.yaml)
.session/                # Active work sessions
.claude/                 # Project's Pennyfarthing setup (symlinks)
```

---

## Git Strategy

### Branch Structure

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Integration branch |
| `feat/{story-id}-*` | Feature branches |
| `fix/{story-id}-*` | Bug fix branches |

### PR Flow

1. Create branch from `develop`
2. Implement changes
3. PR targets `develop`
4. After approval, merge to `develop`
5. Release: merge `develop` to `main`

### Commit Format

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

---

## Sprint System

### Files

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Active sprint status |
| `sprint/archive/` | Completed sprints |
| `sprint/context/` | Epic technical context |

### Sprint Status Fields

```yaml
sprint:
  number: N
  goal: "Sprint goal"
summary:
  completed_points: N
  total_points: N
epics:
  - id: N
    title: "Epic title"
    stories: [...]
```

---

## Session System

### Active Work

Session files in `.session/{story-id}-session.md` track:
- Story context and ACs
- Current phase (sm/tea/dev/review)
- Workflow status
- Agent assessments

### Workflow Phases

```
SM (setup) → TEA (tests) → Dev (impl) → Reviewer (approve) → SM (finish)
```

---

## Build Commands

```bash
npm run build     # TypeScript compilation
npm run dev       # Watch mode
npm run clean     # Remove dist/
npm test          # Node.js native test runner
npm run lint      # ESLint
```

---

## Persona System

Configured in `.pennyfarthing/config.local.yaml`. Current theme provides character mappings for each agent with style attributes.

**102 themes available** across categories:
- **TV Series:** `mash`, `star-trek`, `the-office`, `breaking-bad`, `game-of-thrones`, etc.
- **Film:** `princess-bride`, `lord-of-the-rings`, `matrix`, `pulp-fiction`, etc.
- **Literature:** `alice-in-wonderland`, `discworld`, `shakespeare`, `jane-austen`, etc.
- **Anime:** `one-piece`, `naruto`, `dragon-ball-z`, `death-note`, etc.
- **Games:** `zelda`, `final-fantasy`, `mass-effect`, `portal`, etc.
- **History/Mythology:** `greek-mythology`, `norse-mythology`, `ancient-rome`, etc.

Use `/list-themes` to see all available themes, `/show-theme <name>` for details.

---

**This context is automatically loaded. Focus on your agent-specific responsibilities.**
