# Agent Behavior Guide

**For all Pennyfarthing agents.**

---

## Critical Protocols

<critical>
**Reflector markers:** Run `handoff-marker.sh {next_agent}` as your ABSOLUTE LAST ACTION and output the result verbatim. See `<agent-exit-protocol>` below.
</critical>

<critical>
**Path resolution:** Use `.pennyfarthing/scripts/core/run.sh` for all script calls - it handles path resolution.
For direct commands, use relative paths from project root (Claude Code starts there).

```bash
# GOOD: Use run.sh wrapper
.pennyfarthing/scripts/core/run.sh workflow/check.sh

# GOOD: Relative paths for simple commands
just test
npm run build

# BAD: $CLAUDE_PROJECT_DIR doesn't exist in Bash calls
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/foo.sh  # BROKEN!
```
</critical>

<critical>
**Session file:** `.session/{story-id}-session.md` - extract `**Phase:**` (whose turn), `**Workflow:**`, `**Repos:**`, `**Feature Branch:**`.
</critical>

<critical>
**Handoff Action:** After handoff subagent returns, run `handoff-marker.sh` as LAST action, output result, EXIT.
</critical>

<critical>
**Test delegation:** Never run tests directly. Always use `testing-runner` subagent.
</critical>

<critical>
**Sidecar memory:** Capture learnings BEFORE spawning handoff subagent. Don't wait until exit.
</critical>

---

## Reference

<info>
**Workflow:** SM → TEA → Dev → Reviewer → SM (finish). Trivial (1-2 pts) skips TEA.

**Confidence:** HIGH=proceed, MEDIUM=ask before risky, LOW=always ask.

**Skills:** `/sprint-context`, `/testing`, `/dev-patterns`, `/jira`, `/just`

**Reflector:** HTML comments parsed by Cyclist UI (see below).

**Turn efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Background tasks:** Don't block unless result needed. Cyclist notifies on completion.

**Sidecar location:** `.pennyfarthing/sidecars/{agent}/` with `patterns.md`, `gotchas.md`, `decisions.md`.

**Subagent skills:** Include skill paths in prompts - subagents don't auto-load skills.

**Worktree:** Get path from session: `WORKTREE_PATH=$(grep "^path:" "$SESSION_FILE" | cut -d' ' -f2)`

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink permission issue).
</info>

---

## Project Context

<info>
**Project:** Pennyfarthing - Claude Code agent orchestration (pnpm monorepo, TypeScript)

**Key paths:**
- `pennyfarthing-dist/` - agents, commands, skills, guides, personas
- `sprint/current-sprint.yaml` - active sprint
- `.session/` - active work sessions

**Git:** Branch from `develop`, PR to `develop`, release merges to `main`.

**Commit:** `<type>(<scope>): <subject>` + `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`

**Build:** `npm run build`, `npm test`, `npm run lint`
</info>

---

## Sprint YAML and Jira Interaction Rules

<critical>
**Never directly edit sprint YAML.** All sprint YAML modifications MUST go through dedicated scripts.
</critical>

<info>
**Rule 1:** Use `/sprint` skill for sprint operations
- `/sprint status` - View sprint
- `/sprint backlog` - View available stories
- `/sprint work` - Start a story
- `/sprint archive` - Archive completed story

**Rule 2:** Use `/story` skill for story operations
- `/story finish` - Complete story (handles YAML, Jira, merge, archive)
- `/story create` - Add new story to sprint

**Rule 3:** Use `/jira` skill for all Jira operations
- `/jira claim` - Assign and move to In Progress
- `/jira move` - Transition status
- `/jira view` - Check status
- `/jira sync` - Sync YAML ↔ Jira

**Rule 4:** All sprint YAML access goes through scripts
```bash
# GOOD: Use scripts for ALL operations
.pennyfarthing/scripts/core/run.sh sprint/get-story-field.sh X-Y workflow
.pennyfarthing/scripts/core/run.sh sprint/get-epic-field.sh 35 jira
.pennyfarthing/scripts/core/run.sh sprint/check-story.sh X-Y

# BAD: Direct yq queries (even read-only)
yq '.epics[].stories[] | ...' sprint/current-sprint.yaml
```

**Script Responsibilities:**
| Operation | Script | Skill |
|-----------|--------|-------|
| Get story field | `get-story-field.sh` | - |
| Get epic field | `get-epic-field.sh` | - |
| Check story/epic | `check-story.sh` | `/sprint work` |
| Start story | `jira-claim-story.sh` | `/jira claim` |
| Finish story | `finish-story.sh` | `/story finish` |
| Archive story | `archive-story.sh --apply` | `/sprint archive` |
| Sync to Jira | `sync-epic-jira.sh` | `/jira sync` |
| Create epic | `create-jira-epic.sh` | `/jira create epic` |
</info>

---


## Persona System

<info>
**Config:** `.pennyfarthing/config.local.yaml` with `theme:` field.

**many themes available:** `/list-themes` to browse, `/show-theme <name>` for details, `/set-theme <name>` to change.

**Categories:** TV Series, Film, Literature, Anime, Games, History/Mythology.

**Attributes:** `verbosity` (low/medium/high), `formality` (formal/casual/playful), `humor` (enabled/disabled/subtle).

**Per-agent override:**
```yaml
overrides:
  reviewer:
    theme: discworld  # Keep Granny even in Star Trek mode
```
</info>

---

## Reflector

<critical>
**EVERY TURN MUST END WITH A CYCLIST MARKER.** A Stop hook enforces this - you will be blocked if you forget.
</critical>

<info>
HTML comments that agents emit to signal Cyclist UI. Format: `<!-- CYCLIST:TYPE:value -->`

| Type | Value | Cyclist Action |
|------|-------|----------------|
| `HANDOFF` | `/agent` | Shows "Continue with /agent" button |
| `CONTEXT_CLEAR` | `/agent` | Clears session, reloads with agent |
| `QUESTION` | `yesno` or `open` | Shows input dialog |
| `CHOICES` | `opt1,opt2,opt3` | Shows choice buttons |
| `CONTINUE` | (none) | Shows "Continue" button for status updates |

**Examples:**
```
<!-- CYCLIST:HANDOFF:/tea -->
<!-- CYCLIST:CONTEXT_CLEAR:/dev -->
<!-- CYCLIST:QUESTION:yesno -->
<!-- CYCLIST:QUESTION:open -->
<!-- CYCLIST:CHOICES:option1,option2,option3 -->
<!-- CYCLIST:CONTINUE -->
```

**When to use:**
- `HANDOFF` - End of phase (TEA→Dev, Dev→Reviewer)
- `CONTEXT_CLEAR` - Context >80% at handoff
- `QUESTION`/`CHOICES` - User input needed mid-work
- `CONTINUE` - Status updates, task completion, any turn that isn't a handoff or question
</info>

<critical>
**Marker Selection Guide:**

| Situation | Marker |
|-----------|--------|
| Workflow handoff to next agent | `<!-- CYCLIST:HANDOFF:/agent -->` |
| Handoff with context >80% | `<!-- CYCLIST:CONTEXT_CLEAR:/agent -->` |
| Yes/no question | `<!-- CYCLIST:QUESTION:yesno -->` |
| Open-ended question | `<!-- CYCLIST:QUESTION:open -->` |
| Multiple choice | `<!-- CYCLIST:CHOICES:a,b,c -->` |
| Status update / task complete | `<!-- CYCLIST:CONTINUE -->` |
| Providing information | `<!-- CYCLIST:CONTINUE -->` |
| Reporting an error/blocker | `<!-- CYCLIST:CONTINUE -->` |

**Question types requiring QUESTION/CHOICES markers:**
- Direct questions ending with `?`
- Implicit questions: "let me know if...", "would you like...", "should I..."
- Choice offerings: "Option A or Option B"
- Requests for input: "what do you think", "your preference"
- Clarification requests: "could you clarify"

**Exempt from question detection (but still need CONTINUE):**
- Rhetorical questions you answer yourself
- Questions inside code blocks or examples
- Historical context ("the question was...")
</critical>

---

<agent-exit-protocol>
## Agent Exit Protocol

### Exit Sequence

1. Write assessment to session file
2. Spawn `handoff` subagent
3. Await `HANDOFF_RESULT`
4. If `status: blocked` → report error, stop
5. **Run this as ABSOLUTE LAST ACTION:**
   ```bash
   .pennyfarthing/scripts/core/handoff-marker.sh {next_agent}
   ```
6. **Output the script result verbatim and EXIT**

### HANDOFF_RESULT Format

```
HANDOFF_RESULT:
  status: success|blocked
  next_agent: {agent_name}
  error: "{message}"  # if blocked
```

### Script Output (emit verbatim)

```
---
AGENT_COMMAND:
  marker: "<!-- CYCLIST:HANDOFF:/dev -->"
  fallback: "Run `/dev` to continue"
---
```

**Nothing after the marker. EXIT.**
</agent-exit-protocol>

<wrong-phase-detection>
## Wrong Phase Detection

When an agent detects the story is NOT in their phase, emit a marker immediately.

### How to Check (works with custom workflows)

1. Read `**Workflow:**` and `**Phase:**` from session file
2. Query the phase owner:
   ```bash
   OWNER=$(.pennyfarthing/scripts/core/run.sh workflow/phase-owner.sh {workflow} {phase})
   ```
3. If `$OWNER` != your agent name → story belongs to another agent

### Action When Not Your Phase

```bash
.pennyfarthing/scripts/core/handoff-marker.sh {OWNER}
```

Then output the result verbatim. This triggers Cyclist's handoff button.

### Example

Dev reads session: `**Workflow:** tdd`, `**Phase:** review`

```bash
OWNER=$(.pennyfarthing/scripts/core/run.sh workflow/phase-owner.sh tdd review)
# Returns: reviewer
```

Since "reviewer" != "dev", Dev runs:
```bash
.pennyfarthing/scripts/core/handoff-marker.sh reviewer
```

### Do NOT just say "run /reviewer"

Wrong:
> The story is in review. Run `/reviewer` to continue.

Right:
> The story is in review phase.
>
> <!-- CYCLIST:HANDOFF:/reviewer -->
>
> Run `/reviewer` to continue
</wrong-phase-detection>
