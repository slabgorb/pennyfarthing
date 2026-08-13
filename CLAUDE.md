# CLAUDE.md — Pennyfarthing Framework

Pennyfarthing is a Claude Code agent orchestration framework with BikeLane workflows and themed personas. **Version:** 13.6.0. Python-first architecture.

<critical>
## Implementation Rules

1. **Modify `pennyfarthing-dist/`** — single source of truth for all definitions
2. **Match model to task** — Haiku for mechanical tasks, Sonnet/Opus for analytical subagents
3. **Scripts use `.pennyfarthing/` paths** — never `pennyfarthing-dist/` in runtime
4. **Scripts must exist in ONE location only** — build-time validation prevents duplication
5. **Never edit symlink targets** — trace to `pennyfarthing-dist/`
6. **Python owns all logic** — `web/` is a pure view layer over the Frame API (ADR-0042 boundary rule: no client-side workflow derivation, YAML parsing, or theme logic; computations become Frame routes). No other JavaScript/TypeScript in this repo.
</critical>

<critical>
## Required Companion Plugin

Pennyfarthing requires the `superpowers@claude-plugins-official` Claude Code plugin. Install it once per Claude Code environment:

```
/plugin install superpowers@claude-plugins-official
```

Superpowers provides the generic software-craft skills (brainstorming, writing-plans, verification-before-completion, test-driven-development, systematic-debugging, etc.) that pennyfarthing forwarder commands and gates reference. Running `pf doctor` will report `superpowers_plugin` as FAIL if it is missing.
</critical>

<critical>
## Dogfooding Context

This repo is inlined at `pennyfarthing/` inside `pennyfarthing-orchestrator`. The `.pennyfarthing/` directory lives at the **orchestrator root**, not here.

TUI dashboard: `pf frame start`
(must run from orchestrator root where `.pennyfarthing/` exists)
</critical>

<git-operations>
Commit format: `<type>(<scope>): <subject>`

Two repos: `pennyfarthing-orchestrator/` (sprint, sessions, docs) and `pennyfarthing/` (framework source). This repo uses gitflow — PRs target `develop`.
</git-operations>

<info>
## Build & Test

```bash
python3 -m pytest pennyfarthing-dist/src/pf/tests/  # Python tests
pf validate                                          # Framework validation
```
</info>

<info>
## Directory Structure

**Architecture:** Python runtime. See ADR-0034.

| Directory | Purpose |
|-----------|---------|
| `pennyfarthing-dist/` | Published package (source of truth) — agents, commands, guides, skills, personas, workflows, scripts |
| `pennyfarthing-dist/src/pf/` | Python CLI package (hooks, jira, sprint, story, prime, frame, tui) |
| `web/` | Browser dashboard (React/Vite) — pure Frame API client, builds into `pf/frame/webui/dist` |
| `tests/` | Framework tests |
| `scripts/` | Framework dev only (NOT distributed) |

**Display:** TUI — `pf frame start` launches Textual terminal panels alongside Claude Code CLI.

**Scripts:** `pennyfarthing-dist/scripts/` (distributed, bash) and `pennyfarthing-dist/src/pf/` (distributed, Python). Path resolution via `find-root.sh` (walks up looking for `.pennyfarthing/`).
</info>

<info>
## Workflows & Agents

BikeLane workflow types: **Phased** (agent-driven handoffs) and **Stepped** (progressive gates). Workflow definitions live in `pennyfarthing-dist/workflows/*.yaml` — read the YAML for phase order, agents, tandem/team pairings, and gates. Use `pf workflow list` and `pf workflow show <name>` to inspect.

**Workflows of note:**
- `tdd` (default): lightweight Test-Driven Development — SM → TEA → Dev → Reviewer → SM. No architect spec phases.
- `sdd` (Spec-Driven Development): heavyweight feature flow adding architect spec-check, TEA verify, and architect spec-reconcile phases. Opt-in via `workflow: sdd` on a story.
- `spdd` (Superpower Driven Development): parallels `tdd.yaml` with per-phase `skills.required` lists that agents invoke and attest to in the session file. Composite gates (`spdd-red-exit`, `spdd-green-exit`) verify both artifacts and skill attestation. Opt-in via `workflow: spdd` on a story.

| Agent | Role | Agent | Role |
|-------|------|-------|------|
| SM | Story setup, completion | PM | Planning |
| TEA | Failing tests (RED) | Tech Writer | Documentation |
| Dev | Implementation (GREEN) | UX Designer | UI design |
| Reviewer | Adversarial review | DevOps | Infrastructure |
| Architect | System design | Orchestrator | Meta-operations |

**Subagents** (Task tool): `sm-setup`, `sm-finish`, `sm-file-summary`, `testing-runner`, `reviewer-preflight`, `tandem-backseat`

**Handoff:** Agent writes assessment → `pf handoff resolve-gate` → `complete-phase` → `marker` → next agent activates.

**Codenames:** Frame (server), TirePump (context clearing), JobFair (benchmarking), TUI (terminal dashboard), Peloton (pipeline replay benchmarks)

**Glossary:**

| Term | Definition |
|------|------------|
| Peloton test | Repeatable benchmark scenario for a full agent team (TEA→Dev→Reviewer), sourced from real external review findings. Ground truth = what the pipeline actually missed. Run via `pf benchmark replay`. |
| Pipeline replay | The harness (`pf benchmark replay run/score/compare`) that executes peloton tests against real code at a known commit. |
| JobFair | Single-agent benchmarking — tests one role in isolation against a rubric. |
</info>

<context>
## Component Guides

Read guides for detailed behavior, key files, and APIs. All paths relative to `pennyfarthing-dist/`.

### Guides (`guides/`)

| Component | Guide | Purpose |
|-----------|-------|---------|
| BikeLane | `guides/bikelane.md` | Workflow engine — phased, stepped, procedural |
| TUI | `guides/tui.md` | TUI dashboard for CLI-first dev |
| tmux | `guides/tmux.md` | tmux integration — server lifecycle, panes, config, troubleshooting |
| Gates | `guides/gates.md` | Phase transition quality checks |
| Handoff CLI | `guides/handoff-cli.md` | Gate resolution, session transitions, markers |
| Hooks | `guides/hooks.md` | Claude Code hooks — session, pre/post tool use |
| Relay Mode | `guides/relay-mode.md` | Auto-handoff execution |
| Prime | `guides/prime.md` | Agent activation with tiered context |
| Tandem | `guides/tandem-protocol.md` | Background observer pairing |
| Output Styles | `guides/output-styles.md` | Response modes (terse, verbose, teaching) |
| Brownfield | `guides/brownfield-tools.md` | Codebase analysis — hotspots, complexity, health |

### Schemas (`schemas/`)

| Schema | File | Purpose |
|--------|------|---------|
| Gate | `schemas/gate-schema.md` | Gate file format and GATE_RESULT contract |
| Session | `schemas/session-schema.md` | Session file XML structure |
| Workflow | `schemas/workflow-schema.md` | Workflow YAML configuration schema |
| Workflow Step | `schemas/workflow-step-schema.md` | Step file XML tag schema |
| Skill | `schemas/skill-schema.md` | Skill file structure and XML tags |
| Context | `schemas/context-schema.md` | Context document sections and validation |
| Handoff Document | `schemas/handoff-document-schema.md` | Inter-agent handoff contract for native subagents |

### Patterns (`patterns/`)

| Pattern | File | Purpose |
|---------|------|---------|
| Fan-out/Fan-in | `patterns/fan-out-fan-in-pattern.md` | Parallel agent execution and result aggregation |
| Approval Gates | `patterns/approval-gates-pattern.md` | Human/agent approval checkpoints |
| Helper Delegation | `patterns/helper-delegation-pattern.md` | Delegating mechanical work to subagents |
| TDD Flow | `patterns/tdd-flow-pattern.md` | RED-GREEN-REFACTOR agent workflow |

### Agent Templates (`agents/templates/`)

| Template | File | Purpose |
|----------|------|---------|
| Strategic | `agents/templates/agent-template-strategic.md` | Template for strategic (Opus-class) agents |
| Tactical | `agents/templates/agent-template-tactical.md` | Template for tactical (Haiku-class) subagents |

### Taxonomy (`guides/taxonomy/`)

| Resource | File | Purpose |
|----------|------|---------|
| XML Tags | `guides/taxonomy/xml-tags.md` | Complete XML tag reference for all file types |
| Command Tag Taxonomy | `guides/taxonomy/command-tag-taxonomy.md` | Tag classification and usage rules |
| Prompt Patterns | `guides/taxonomy/prompt-patterns.md` | Prompt engineering patterns and XML usage |
</context>
