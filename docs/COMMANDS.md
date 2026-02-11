# Slash Commands Reference

Complete reference for all 46 Pennyfarthing slash commands.

## Command Categories

- [TDD Workflow](#tdd-workflow-commands)
- [Agent Activation](#agent-activation-commands)
- [Planning](#planning-commands)
- [Benchmarking](#benchmarking-commands)
- [Operations](#operations-commands)
- [Sync](#sync-commands)
- [Theme](#theme-commands)

---

## TDD Workflow Commands

### `/work`

**Purpose:** Resume work or start new - smart entry point that picks up where you left off

**Usage:**
```
/work
```

**What it does:**
1. Detects current workflow state
2. If work in progress: suggests appropriate agent to continue
3. If finished work: invokes SM to complete story
4. If no work: invokes /new-work to pick up new story
5. If missing epic context: prompts to run /start-epic

**Entry point for:** Resuming interrupted work or starting fresh

### `/new-work`

**Purpose:** Start a new work session (primary entry point)

**Usage:**
```
/new-work
```

**What it does:**
1. Activates SM (Scrum Master)
2. Checks for existing work in progress
3. If new work: helps select/create story, sets up session
4. If existing work: resumes from current state
5. If finished work: triggers finish workflow

**Entry point for:** The entire TDD flow

### `/check`

**Purpose:** Run quality gates (lint, type check, tests) before handoff

**Usage:**
```
/check
/check --repo api
/check --tests-only
/check --filter "TestUserLogin"
```

**What it does:**
1. Runs lint (if configured)
2. Runs type check (if TypeScript)
3. Runs tests
4. Reports pass/fail status
5. Blocks handoff to Reviewer if checks fail

---

## Agent Activation Commands

### `/sm`

**Purpose:** Activate the Scrum Master agent

**Usage:**
```
/sm
```

**When to use:**
- Story management
- Sprint coordination
- Direct SM tasks (outside TDD flow)

### `/tea`

**Purpose:** Activate the Test Engineer agent

**Usage:**
```
/tea
```

**When to use:**
- Writing tests
- Test strategy
- Continuing TDD flow after SM handoff

### `/dev`

**Purpose:** Activate the Developer agent

**Usage:**
```
/dev
```

**When to use:**
- Implementing features
- Making tests pass
- Continuing TDD flow after TEA handoff

### `/reviewer`

**Purpose:** Activate the Code Reviewer agent

**Usage:**
```
/reviewer
```

**When to use:**
- Code review
- Security analysis
- Continuing TDD flow after Dev handoff

### `/architect`

**Purpose:** Activate the System Architect agent

**Usage:**
```
/architect
```

**When to use:**
- Design decisions
- Architecture questions
- Pattern guidance

### `/pm`

**Purpose:** Activate the Product Manager agent

**Usage:**
```
/pm
```

**When to use:**
- Sprint planning
- Prioritization
- Strategic decisions

### `/tech-writer`

**Purpose:** Activate the Technical Writer agent

**Usage:**
```
/tech-writer
```

**When to use:**
- Documentation tasks
- API docs
- User guides

### `/ux-designer`

**Purpose:** Activate the UX Designer agent

**Usage:**
```
/ux-designer
```

**When to use:**
- UI design
- UX improvements
- Accessibility review

### `/devops`

**Purpose:** Activate the DevOps Engineer agent

**Usage:**
```
/devops
```

**When to use:**
- CI/CD configuration
- Infrastructure tasks
- Deployment issues

### `/orchestrator`

**Purpose:** Activate the Orchestrator agent

**Usage:**
```
/orchestrator
```

**When to use:**
- Process improvement
- Framework maintenance
- Meta-operations

---

## Planning Commands

### `/sprint-planning`

**Purpose:** Facilitate a sprint planning session

**Usage:**
```
/sprint-planning
```

**What it does:**
1. Reviews current sprint status
2. Analyzes backlog
3. Facilitates story selection
4. Helps estimate and prioritize
5. Updates sprint tracking

### `/retro`

**Purpose:** Facilitate a sprint retrospective

**Usage:**
```
/retro
```

**What it does:**
1. Reviews completed sprint
2. Gathers what went well
3. Identifies improvements
4. Creates action items

### `/start-epic`

**Purpose:** Start an epic - move to current sprint and generate tech context

**Usage:**
```
/start-epic [epic-id]
```

**What it does:**
1. Moves epic to current sprint
2. Generates technical context
3. Breaks down into stories (if needed)
4. Updates tracking

### `/close-epic`

**Purpose:** Close an epic - verify completion, update status, and archive context

**Usage:**
```
/close-epic [epic-id]
```

**What it does:**
1. Verifies all stories in epic are done
2. Updates epic status to done
3. Calculates completed points
4. Optionally transitions Jira epic to Done
5. Optionally archives epic context file

### `/brainstorm` (alias: `/brainstorming`)

**Purpose:** Structured problem-solving brainstorm session

**Usage:**
```
/brainstorm [topic]
/brainstorming [topic]
```

**What it does:**
1. Follows 5-phase structured approach (Problem Definition, Divergent Thinking, Clustering, Evaluation, Selection)
2. Scores ideas on impact, effort, and risk
3. Selects 1-3 ideas to pursue
4. Produces actionable recommendations with next steps

### `/party-mode`

**Purpose:** Free-form creative brainstorming with all agents

**Usage:**
```
/party-mode [topic]
```

**What it does:**
1. Activates multiple agents
2. Free-form discussion
3. Creative problem solving
4. Less structured than `/brainstorm`

### `/job-fair`

**Purpose:** Discover which characters in a theme excel at each role

**Usage:**
```
/job-fair <theme>
/job-fair <theme> --runs 2
/job-fair <theme> --roles dev,reviewer
```

**What it does:**
1. Runs every character in a theme against benchmarks
2. Tests characters in their native roles
3. Can test cross-role performance
4. Identifies hidden talents across the cast
5. Saves results matrix showing performance by character and role

---

## Benchmarking Commands

### `/solo`

**Purpose:** Run a single agent on a standardized scenario for evaluation

**Usage:**
```
/solo discworld:reviewer --scenario order-service
/solo ted-lasso:sm --scenario sprint-planning-conflict --runs 4
/solo control:dev --scenario tdd-shopping-cart --no-judge
```

**Arguments:**
- `theme:agent` - Persona and role to evaluate (e.g., `discworld:reviewer`)
- `--scenario <name>` - Scenario from `scenarios/` directory
- `--runs N` - Number of runs (default: 1, max: 20)
- `--no-judge` - Skip evaluation, return raw response

**What it does:**
1. Loads specified theme and agent persona
2. Runs agent on scenario with `--tools ""` (critical for valid results)
3. Evaluates response with `/judge` (unless `--no-judge`)
4. Saves results to `internal/results/solo/`

**See also:** [BENCHMARKING.md](BENCHMARKING.md)

### `/benchmark-control`

**Purpose:** Create a statistical baseline for a scenario

**Usage:**
```
/benchmark-control reviewer --scenario order-service
/benchmark-control dev --scenario tdd-shopping-cart --runs 10
```

**Arguments:**
- `agent` - Role to benchmark (sm, dev, reviewer, architect, tea)
- `--scenario <name>` - Scenario name (or choose interactively)
- `--runs N` - Number of runs (default: 10 for baselines)

**What it does:**
1. Runs the control (no-persona) agent N times
2. Calculates mean, standard deviation, 95% CI
3. Saves baseline to `internal/results/baselines/{scenario}/{role}/`

**Required before:** Using `/benchmark` to compare personas

### `/benchmark`

**Purpose:** Compare a persona's performance against the control baseline

**Usage:**
```
/benchmark discworld reviewer --scenario order-service
/benchmark the-expanse sm --scenario sprint-planning-conflict --runs 8
```

**Arguments:**
- `theme` - Persona theme (e.g., `discworld`, `the-expanse`)
- `agent` - Role to benchmark
- `--scenario <name>` - Scenario name (or choose interactively)
- `--runs N` - Number of runs (default: 4)

**What it does:**
1. Runs persona agent N times on scenario
2. Compares against baseline with Cohen's d effect size
3. Calculates 95% confidence intervals
4. Saves results to `internal/results/benchmarks/{scenario}/{theme}-{role}/`

**Requires:** Control baseline created with `/benchmark-control`

---

## Operations Commands

### `/repo-status`

**Purpose:** Check git status of all project repos

**Usage:**
```
/repo-status
```

**What it does:**
1. Checks each repo's git status
2. Reports uncommitted changes
3. Shows branch information
4. Identifies sync issues

### `/git-cleanup`

**Purpose:** Clean up git repos by organizing changes into proper commits/branches by initiative

**Usage:**
```
/git-cleanup
```

**What it does:**
1. Analyzes uncommitted changes
2. Organizes by initiative/feature
3. Creates appropriate branches
4. Structures clean commits

### `/chore`

**Purpose:** Quick commit for small changes without full git-cleanup ceremony

**Usage:**
```
/chore
/chore "update sprint tracking"
/chore doc "update README"
/chore ux "adjust button spacing"
```

**What it does:**
1. Creates branch from develop (chore/*, docs/*, or ux/*)
2. Commits all dirty changes with conventional message
3. Merges to develop locally
4. Pushes develop
5. Fast path for maintenance, config, docs, or styling tweaks

### `/standalone`

**Purpose:** Wrap current changes into a standalone Jira story, branch, PR, and merge

**Usage:**
```
/standalone
/standalone "Add drift detection script"
/standalone "Add drift detection script" 2
```

**What it does:**
1. Creates Jira story for the changes
2. Creates feature branch
3. Commits and pushes
4. Creates PR with summary
5. Merges PR and marks story Done
6. Fast path for shipping completed work that deserves tracking but didn't need story setup upfront

### `/release`

**Purpose:** Merge develop to main and push (optional version bump)

**Usage:**
```
/release
/release --bump patch
/release --bump minor
/release --dry-run
```

**What it does:**
1. Pulls latest develop and main
2. Merges develop into main
3. Pushes main and develop
4. Optionally bumps version and creates GitHub release

### `/parallel-work`

**Purpose:** Start parallel work in a new worktree

**Usage:**
```
/parallel-work
```

**What it does:**
1. Creates git worktree
2. Sets up parallel workspace
3. Creates session file for the new story
4. Hands to SM to complete story setup in worktree context
5. Allows concurrent work on different stories

### `/create-branches-from-story`

**Purpose:** Create feature branches in both repos from a story

**Usage:**
```
/create-branches-from-story [story-id]
```

**What it does:**
1. Reads story details
2. Creates branches in API repo (if needed)
3. Creates branches in UI repo (if needed)
4. Names branches consistently

---

## Sync Commands

### `/sync-epic-to-jira`

**Purpose:** Sync an epic to Jira

**Usage:**
```
/sync-epic-to-jira [epic-id]
```

**What it does:**
1. Reads local epic definition
2. Creates/updates Jira epic
3. Creates/updates stories
4. Syncs status

### `/sync-work-with-sprint`

**Purpose:** Sync current work session with unified sprint status

**Usage:**
```
/sync-work-with-sprint
```

**What it does:**
1. Reads current work session
2. Updates sprint YAML
3. Ensures consistency
4. Resolves conflicts

### `/update-domain-docs`

**Purpose:** Update CLAUDE-*.md domain documentation files based on current codebase

**Usage:**
```
/update-domain-docs
```

**What it does:**
1. Analyzes current codebase
2. Updates domain documentation
3. Reflects current patterns
4. Updates file references

### `/sprint`

**Purpose:** Sprint status, backlog, and story management

**Usage:**
```
/sprint [status|backlog|work|archive|new|future|promote] [args...]
```

**What it does:**
1. Shows sprint status with story counts and points
2. Lists available stories ready for work
3. Starts work on a story
4. Archives completed stories
5. Manages future work and epic promotion

---

## Theme Commands

### `/theme-maker`

**Purpose:** Interactive wizard for creating custom persona themes

**Usage:**
```
/theme-maker
```

**What it does:**
1. Prompts for a theme name (lowercase, hyphens allowed)
2. Offers three creation modes
3. Walks through theme creation
4. Writes theme file to `.claude/pennyfarthing/themes/`
5. Optionally activates the new theme

**Creation Modes:**

| Mode | Description | Best For |
|------|-------------|----------|
| **AI-Driven** | Describe a concept, AI generates all 10 personas | Quick creation, exploring ideas |
| **Guided** | AI suggests characters, you pick from options | Balance of control and convenience |
| **Manual** | You specify character, style, quote for each agent | Full control, specific vision |

**Theme Name Rules:**
- Lowercase letters only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- Cannot conflict with existing themes

**Example Session:**

```
> /theme-maker

Theme name: noir-detective

How would you like to create your theme?
  ● AI-Driven (Recommended)
  ○ Guided
  ○ Manual

Describe your theme universe:
> 1940s noir detective fiction - fedoras, femme fatales,
  rain-slicked streets, whiskey, and moral ambiguity

[AI generates 10 agent personas...]

## Theme Preview: noir-detective

| Agent | Character | Style |
|-------|-----------|-------|
| sm | Sam Spade | World-weary, trusts no one, gets the job done |
| tea | The Forensics Guy | Meticulous, finds what others miss |
| dev | The Mechanic | Quiet, capable, fixes problems permanently |
| ... | ... | ... |

How does this look?
  ● Looks great, save it!
  ○ Regenerate
  ○ Try different concept

Theme saved to .claude/pennyfarthing/themes/noir-detective.yaml
Activate with: /set-theme noir-detective
```

**Output:**

Creates a complete theme file at `.claude/pennyfarthing/themes/{name}.yaml` with:
- Theme metadata (name, description, version, created date)
- All 10 agent definitions (character, style, trait, quote, emoji, helper)

**Related Commands:**
- `/set-theme` - Activate a theme
- `/show-theme` - View theme details
- `/list-themes` - List available themes

**See also:** [Persona System](PERSONAS.md)

### `/set-theme`

**Purpose:** Change the active persona theme

**Usage:**
```
/set-theme <name>
```

**What it does:**
1. Validates theme exists
2. Updates `.pennyfarthing/config.local.yaml`
3. Theme takes effect on next agent activation

### `/show-theme`

**Purpose:** Display details of a theme

**Usage:**
```
/show-theme [name]    # Specific theme
/show-theme           # Current theme
```

**What it does:**
1. Loads theme definition
2. Displays all agent characters and styles
3. Shows theme metadata

### `/list-themes`

**Purpose:** List all available themes

**Usage:**
```
/list-themes
```

**What it does:**
1. Scans built-in themes
2. Scans custom themes in `.claude/pennyfarthing/themes/`
3. Lists all with descriptions

### `/create-theme`

**Purpose:** Create a new custom persona theme

**Usage:**
```
/create-theme <name>
/create-theme <name> --base <theme>
/create-theme <name> --user
```

**What it does:**
1. Creates a new theme file
2. Optionally bases it on an existing theme (default: minimalist)
3. Can create as user-level theme (available across all projects)
4. Guides user on next steps for customization

---

## Utility Commands

### `/continue-session`

**Purpose:** Resume work from a saved checkpoint after context circuit breaker

**Usage:**
```
/continue-session
/continue-session --list
/continue-session --story-id ID
```

**What it does:**
1. Scans for saved checkpoints in `.session/checkpoints.log`
2. Presents available checkpoints to restore
3. Restores checkpoint and finds matching session file
4. Resumes appropriate agent based on workflow phase
5. Recovery command for context overflow situations

### `/prime`

**Purpose:** Load essential project context at agent activation

**Usage:**
```
/prime
/prime --minimal
/prime --full
/prime --agent <name>
```

**What it does:**
1. Loads CLAUDE.md and user instructions
2. Loads sprint summary and active session
3. Optionally loads agent sidecar patterns
4. Optionally includes domain documentation
5. Automatically invoked on agent activation

### `/permissions`

**Purpose:** View and manage runtime permission grants

**Usage:**
```
/permissions
/permissions grant <tool> "<scope>" [--type <type>]
/permissions revoke <tool>
/permissions show <tool>
```

**What it does:**
1. Lists all active permission grants
2. Grants tool access with scope patterns
3. Revokes permissions for specific tools
4. Shows detailed grant information

### `/workflow`

**Purpose:** List available workflows, show current workflow details, and switch workflows

**Usage:**
```
/workflow
/workflow show [name]
/workflow set <name>
/workflow start <name> [--mode <mode>]
/workflow resume [name]
```

**What it does:**
1. Lists available workflows (TDD, trivial, agent-docs)
2. Shows current workflow phase and details
3. Switches to different workflow pattern mid-session
4. Manages BikeLane stepped workflows

---

## System Commands

### `/health-check`

**Purpose:** Check Pennyfarthing installation health and apply updates

**Usage:**
```
/health-check
pennyfarthing doctor
pennyfarthing doctor --fix
```

**What it does:**
1. Checks manifest.json validity
2. Verifies all managed files present
3. Validates symlinks
4. Checks for available updates
5. Can auto-fix broken symlinks and missing directories

### `/run-ci`

**Purpose:** Detect and run CI locally

**Usage:**
```
/run-ci
/run-ci --detect-only
/run-ci --dry-run
```

**What it does:**
1. Auto-detects CI system (Justfile, GitHub Actions, GitLab CI, npm fallback)
2. Runs appropriate CI commands locally
3. Reproduces CI environment for debugging
4. Verifies CI will pass before pushing

### `/help`

**Purpose:** Context-aware help for Pennyfarthing commands, agents, and workflows

**Usage:**
```
/help
```

**What it does:**
1. Provides quick-start guidance
2. Shows TDD workflow overview
3. Lists all agents and commands
4. Shows available themes
5. Provides context-aware suggestions based on current state

---

## Command Quick Reference

| Command | Purpose | Category |
|---------|---------|----------|
| `/work` | Resume or start work | TDD |
| `/new-work` | Start work session | TDD |
| `/check` | Run quality gates | TDD |
| `/sm` | Scrum Master | Agent |
| `/tea` | Test Engineer | Agent |
| `/dev` | Developer | Agent |
| `/reviewer` | Code Reviewer | Agent |
| `/architect` | System Architect | Agent |
| `/pm` | Product Manager | Agent |
| `/tech-writer` | Technical Writer | Agent |
| `/ux-designer` | UX Designer | Agent |
| `/devops` | DevOps Engineer | Agent |
| `/orchestrator` | Orchestrator | Agent |
| `/sprint` | Sprint management | Planning |
| `/sprint-planning` | Plan sprint | Planning |
| `/retro` | Sprint retrospective | Planning |
| `/start-epic` | Start an epic | Planning |
| `/close-epic` | Close an epic | Planning |
| `/brainstorm` | Problem solving | Planning |
| `/party-mode` | Creative brainstorm | Planning |
| `/job-fair` | Character benchmarking | Planning |
| `/solo` | Single agent evaluation | Benchmarking |
| `/benchmark-control` | Create baseline | Benchmarking |
| `/benchmark` | Compare vs baseline | Benchmarking |
| `/repo-status` | Check git status | Operations |
| `/git-cleanup` | Organize commits | Operations |
| `/chore` | Quick commit | Operations |
| `/standalone` | Jira story+PR+merge | Operations |
| `/release` | Merge to main | Operations |
| `/parallel-work` | Create worktree | Operations |
| `/create-branches-from-story` | Create branches | Operations |
| `/sync-epic-to-jira` | Sync to Jira | Sync |
| `/sync-work-with-sprint` | Sync work/sprint | Sync |
| `/update-domain-docs` | Update docs | Sync |
| `/theme-maker` | Create custom theme | Theme |
| `/create-theme` | Create theme | Theme |
| `/set-theme` | Change active theme | Theme |
| `/show-theme` | View theme details | Theme |
| `/list-themes` | List available themes | Theme |
| `/continue-session` | Resume checkpoint | Utility |
| `/prime` | Load project context | Utility |
| `/permissions` | Manage permissions | Utility |
| `/workflow` | Workflow management | Utility |
| `/health-check` | Check installation | System |
| `/run-ci` | Run CI locally | System |
| `/help` | Get help | System |

---

## Usage Tips

### Starting Work

Always use `/new-work` to start. It handles:
- New stories
- Resuming work
- Finishing work

### Direct Agent Activation

Use direct commands (`/dev`, `/tea`, etc.) when:
- You need that agent specifically
- You're outside the TDD flow
- You want to skip state detection

### Planning Sessions

Use planning commands at sprint boundaries:
- `/sprint-planning` at sprint start
- `/retro` at sprint end
- `/start-epic` when beginning new epics

### Maintenance

Run periodically:
- `/repo-status` - Check for uncommitted work
- `/git-cleanup` - Organize messy history
- `/sync-work-with-sprint` - Keep tracking in sync
