# Agent Architecture

## Agent Hierarchy

### Production Agents (TDD Flow)

| Agent | Character | Role | Phase |
|-------|-----------|------|-------|
| **SM** | Scrum Master | Story coordination | Entry/Exit |
| **TEA** | Test Engineer | Write failing tests | RED |
| **Dev** | Developer | Implement code | GREEN |
| **Reviewer** | Code Reviewer | Quality gate | REVIEW |

### Experimental Agents (Strategic)

| Agent | Role | Scope |
|-------|------|-------|
| **Orchestrator** | Meta-operations | Process improvement |
| **PM** | Product Manager | Sprint planning, prioritization |
| **Architect** | System Design | Technical decisions, ADRs |
| **DevOps** | Infrastructure | CI/CD, deployment |
| **Tech Writer** | Documentation | Guides, API docs |
| **UX Designer** | UI/UX Design | Wireframes, flows |

## Subagent System

All subagents use `model: haiku` with `subagent_type: "general-purpose"`.

| Subagent | Purpose | Execution |
|----------|---------|-----------|
| `workflow-status-check` | Detect workflow state | Foreground |
| `generic-sm-setup` | Research or setup story | Background |
| `generic-sm-finish` | Preflight or execute finish | Background |
| `sm-file-summary` | Summarize files | Background |
| `sm-handoff` | SM→TEA/Dev handoff | Foreground |
| `testing-runner` | Run tests | Background |
| `reviewer-preflight` | Gather review data | Background |
| `generic-handoff` | Phase transitions | Foreground |

### Invocation Pattern

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true  # or false for sequential
  prompt: |
    Read and follow: .pennyfarthing/agents/{subagent-name}.md

    PARAMETER1: value
    PARAMETER2: value
```

### Background vs Foreground

**Background** (`run_in_background: true`):
- Independent operations (file summaries, research)
- Long-running tasks (tests while agent continues)
- Parallel exploration

**Foreground** (default):
- Status checks (need result to decide)
- Handoff operations (must complete first)
- Quality gates (test verification)

## Workflow Definitions

### TDD Workflow (3+ Story Points)

```
SM (setup) → TEA (red) → Dev (green) → Reviewer → SM (finish)
```

**Gates:**
- RED: Tests must be failing
- GREEN: Tests must be passing
- REVIEW: APPROVED or REJECTED verdict

### Trivial Workflow (1-2 Points)

```
SM (setup) → Dev (impl) → Reviewer → SM (finish)
```

Skips TEA (test writing phase).

### Agent-Docs Workflow

```
SM → Orchestrator (analyze/impl) → Tech Writer (review) → SM
```

For documentation maintenance.

## Session File Format

```markdown
## Story X-Y: [Title]
**Repos:** pennyfarthing/api/ui
**Branch:** feat/X-Y-slug
**Jira:** MSSCI-12345
**Phase:** setup | red | green | review | finish
**Status:** in_progress

## Workflow Tracking
**Workflow:** tdd | trivial | agent-docs
**Phase Started:** ISO 8601 timestamp

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|

## Story Context
[Technical approach, acceptance criteria]

## TEA Assessment
[Test files, coverage, status]

## Dev Assessment
[Files changed, PR #, branch]

## Reviewer Assessment
[Verdict, evidence, recommendations]
```

## Handoff Gates

### SM → TEA (TDD only)
- [ ] Epic context exists at `sprint/context/context-epic-{N}.md`
- [ ] Session file written
- [ ] Story context created
- [ ] Jira claimed
- [ ] Feature branch created

### TEA → Dev
- [ ] TEA Assessment written
- [ ] Tests committed and failing
- [ ] `generic-handoff` spawned
- [ ] CYCLIST:HANDOFF:/dev marker

### Dev → Reviewer
- [ ] Dev Assessment written
- [ ] All tests passing
- [ ] PR created and pushed
- [ ] `generic-handoff` spawned
- [ ] CYCLIST:HANDOFF:/reviewer marker

### Reviewer → SM
- [ ] Reviewer Assessment written
- [ ] VERDICT: approved or rejected
- [ ] `generic-handoff` spawned
- [ ] CYCLIST:HANDOFF:/sm (approved) or /dev (rejected)

## Context Management

### Strategic Agents (Full Scope)
- Agent file: ~200-300 lines
- Sprint status: ~100-150 lines
- Both repo contexts: ~60 lines
- **Total budget:** ~500-660 lines

### Tactical Agents (Story-Scoped)
- Agent file: ~250-400 lines
- Sprint status (story): ~50 lines
- Target repo context: ~100 lines
- **Total budget:** ~450-600 lines

### Context Check

```bash
$CLAUDE_PROJECT_DIR/scripts/check-context.sh --human

# < 60%: Normal handoff
# >= 60%: CONTEXT_CLEAR marker for Cyclist auto-reload
```

## Theme System

**Configuration:** `.pennyfarthing/config.local.yaml`

```yaml
theme: "alice-in-wonderland"
```

**Theme Provides:**
- Agent personas (character names, style)
- Subagent model selection (default: haiku)
- Behavioral preferences

**Theme Files:**
- `pennyfarthing-dist/personas/themes/{theme}/`
- 102+ themes available

## Agent Status Tags

```xml
<status>production</status>   <!-- Battle-tested -->
<status>stable</status>       <!-- Well-tested -->
<status>experimental</status> <!-- Under development -->
```

## Agent Sidecar Files

Each agent has learning files in `.pennyfarthing/sidecars/{agent}/`:

| File | Purpose |
|------|---------|
| `patterns.md` | Implementation patterns |
| `gotchas.md` | Common pitfalls |
| `decisions.md` | Decision framework |

## Cyclist Integration

### Markers

```markdown
<!-- CYCLIST:HANDOFF:/agent -->      <!-- Trigger quick-action button -->
<!-- CYCLIST:CONTEXT_CLEAR:/agent --> <!-- High context, auto-reload -->
```

### OTEL Integration

```
Claude Code spans → otlp-receiver.ts → enriched-span-exporter.ts
                                              ↓
                                    WebSocket → Frontend UI
```

## Agent Definition Structure

```markdown
# Agent Name - Role Title

<persona>
Auto-loaded by agent-session.sh from theme config.
</persona>

<status>production|stable|experimental</status>

<role>
**Primary:** What agent does
**Scope:** What areas it covers
</role>

<helpers>
Subagent invocation patterns and tools.
</helpers>

<responsibilities>
- Bullet list of responsibilities
</responsibilities>

<critical-gates>
Gates and requirements before proceeding.
</critical-gates>

<skills>
Skills the agent can invoke.
</skills>

<on-activation>
Steps to run when agent activates.
</on-activation>

<handoffs>
Handoff protocols to/from other agents.
</handoffs>

<exit>
Exit protocol and cleanup steps.
</exit>
```
