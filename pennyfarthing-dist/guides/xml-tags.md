# XML Tag Taxonomy

Pennyfarthing uses XML-style tags to structure agent definitions and skill documentation. These tags help LLMs identify and prioritize different types of content.

## Priority Tags

Tags that affect LLM behavior and attention.

### `<critical>`

**Purpose:** Non-negotiable rules that MUST be followed. LLMs should treat these as hard constraints.

**Usage:** Gates, invariants, protocol requirements, things that break the system if ignored.

```markdown
<critical>
**Never edit sprint YAML directly.** Use scripts.
</critical>
```

**Examples:**
- "Subagent output is NOT visible to Cyclist"
- "NEVER mark acceptance criteria as complete" (for subagents)
- "Write assessment BEFORE spawning handoff subagent"

### `<gate>`

**Purpose:** Prerequisites that MUST be verified before proceeding. Checklist-style validation.

**Usage:** Entry/exit conditions for workflows, handoff requirements, quality gates.

```markdown
<gate>
## Handoff Checklist
1. Session file exists
2. Acceptance criteria defined
3. Feature branches created
</gate>
```

**Difference from `<critical>`:** Gates are procedural checkpoints; critical items are invariant rules.

### `<info>`

**Purpose:** Contextual information that helps but doesn't constrain. Reference material.

**Usage:** Background context, defaults, file locations, tips.

```markdown
<info>
**Workflow:** SM → TEA → Dev → Reviewer → SM
**Skills:** `/sprint`, `/jira`, `/testing`
</info>
```

## Identity Tags

Tags that define agent personality and role.

### `<persona>`

**Purpose:** Character personality from the active theme. Loaded at agent activation.

**Usage:** Top of agent files, sets tone and style.

```markdown
<persona>
Auto-loaded by `agent-session.sh start` from theme config.
**Fallback if not loaded:** Supportive, methodical, detail-oriented
</persona>
```

### `<role>`

**Purpose:** Agent's position in the workflow and primary responsibility.

**Usage:** Brief statement of what the agent does and when it's invoked.

```markdown
<role>
Test specification, RED phase execution, handoff to Dev
</role>
```

## Structure Tags

Tags that organize agent content.

### `<helpers>`

**Purpose:** Describes Haiku subagents and their invocation pattern.

**Usage:** Lists subagents, their purposes, and how to spawn them.

### `<responsibilities>`

**Purpose:** Bullet list of what this agent does vs delegates.

### `<skills>`

**Purpose:** Slash commands this agent commonly uses.

### `<context>`

**Purpose:** Guide files and sidecars to reference.

### `<reasoning-mode>`

**Purpose:** Verbose/quiet toggle for showing thought process.

### `<on-activation>`

**Purpose:** Startup checklist - what to do when agent is invoked.

### `<exit>`

**Purpose:** How to leave agent mode and cleanup.

## Workflow Tags (TDD Agents)

Tags used by agents participating in the TDD workflow cycle (SM, TEA, Dev, Reviewer).

### `<phase-check>`

**Purpose:** Verify agent owns the current workflow phase before proceeding. Prevents agents from acting on stories they shouldn't own.

**Usage:** SM, TEA, Dev, Reviewer - runs `phase-owner.sh` on activation to determine correct owner.

```markdown
<phase-check>
## On Startup: Check Phase

Read `**Workflow:**` and `**Phase:**` from session. Query:
```bash
OWNER=$(.pennyfarthing/scripts/workflow/phase-owner.sh {workflow} {phase})
```

**If OWNER != "dev":** Run `handoff-marker.sh $OWNER`, output result, tell user.
</phase-check>
```

### `<handoff-gate>`

**Purpose:** Exit checklist that MUST be completed before handoff. Ensures assessment is written and subagent is spawned.

**Usage:** TEA, Dev, Reviewer - mandatory checklist before exiting.

```markdown
<handoff-gate>
## MANDATORY: Complete Before Exiting

- [ ] Write Assessment to session file
- [ ] Spawn `handoff` subagent
- [ ] Verify handoff completed (subagent emits marker)
</handoff-gate>
```

**Difference from `<gate>`:** `<handoff-gate>` is specifically for phase transitions; `<gate>` is for general prerequisites.

### `<handoffs>`

**Purpose:** Documents handoff relationships for strategic agents that coordinate but don't participate in the TDD cycle.

**Usage:** PM, Architect, DevOps, Tech-Writer, UX-Designer, Orchestrator.

```markdown
<handoffs>
### From PM/SM
**When:** Epic needs architectural design
**Input:** Business requirements, constraints
**Action:** Design solution and provide guidance

### To Dev
**When:** Design is complete
**Output:** Architecture decision and implementation plan
</handoffs>
```

## Subagent Tags

Tags used specifically by Haiku subagents for parameter contracts.

### `<params>`

**Purpose:** Define the parameter contract for subagents. Specifies what the calling agent must provide in the prompt.

**Usage:** Subagents only (sm-setup, sm-finish, sm-handoff, sm-file-summary, handoff, testing-runner, reviewer-preflight).

**Standard format (table):**
```markdown
<params>
| Param | Required | Description |
|-------|----------|-------------|
| `STORY_ID` | Yes | Story identifier, e.g., "31-10" |
| `WORKFLOW` | Yes | Workflow type: "tdd", "trivial", etc. |
| `FILTER` | No | Test name pattern for filtered runs |
</params>
```

**Note:** Use `<info>` for contextual information that isn't a parameter contract.

### `<output>`

**Purpose:** Define the standardized output format for subagents. Ensures calling agents receive both data AND instructions on what to do next.

**Usage:** All subagents must use this format for their final output.

**Standard format:**
```markdown
<output>
## Output Format

Return a `{SUBAGENT}_RESULT` block:

### Success
\`\`\`
{SUBAGENT}_RESULT:
  status: success
  {data fields...}

  next_steps:
    - {instruction 1}
    - {instruction 2}
\`\`\`

### Blocked
\`\`\`
{SUBAGENT}_RESULT:
  status: blocked
  error: "{description}"
  fix: "{recommended action}"

  next_steps:
    - {what caller should do}
\`\`\`
</output>
```

**Required fields:**
- `status`: `success` | `blocked` | `warning`
- `next_steps`: Array of instructions for the calling agent

**Why this matters:** Subagent output is NOT visible to users (only to the calling agent). Clear next steps ensure the caller knows exactly what to do with the result.

## Specialized Tags (Single-Agent Use)

Tags used by specific agents for their unique responsibilities.

### `<adversarial-mindset>`

**Purpose:** Sets skeptical review stance. Establishes the reviewer's critical, problem-hunting approach.

**Usage:** Reviewer-only.

```markdown
<adversarial-mindset>
**You are not here to approve code. You are here to find problems.**

Assume the code is broken until you prove otherwise.
**Default stance:** Skeptical. Suspicious. Looking for the flaw.
</adversarial-mindset>
```

### `<review-checklist>`

**Purpose:** Mandatory review steps the Reviewer must complete before making a judgment.

**Usage:** Reviewer-only.

```markdown
<review-checklist>
## MANDATORY Review Steps

- [ ] **Trace data flow:** Pick a user input, follow it end-to-end
- [ ] **Verify error handling:** What happens on failure?
- [ ] **Security analysis:** Auth checks? Input sanitization?
- [ ] **Make judgment:** APPROVE only if no Critical/High issues
</review-checklist>
```

### `<self-review>`

**Purpose:** Pre-handoff quality check for Dev to verify implementation before passing to Reviewer.

**Usage:** Dev-only.

```markdown
<self-review>
## Self-Review Before Handoff

- [ ] Code is wired to front end or other components
- [ ] Code follows project patterns
- [ ] All acceptance criteria met
- [ ] Tests passing (not skipped!)
</self-review>
```

## Usage Guidelines

1. **`<critical>` sparingly** - If everything is critical, nothing is. Reserve for true invariants.

2. **`<gate>` for checkpoints** - Use when there's a clear pass/fail condition.

3. **`<info>` generously** - Helpful context improves agent performance.

4. **Order matters:**
   ```
   <persona>      # Who am I?
   <role>         # What do I do?
   <helpers>      # Who helps me?
   <critical>     # What must I never violate?
   <gate>         # What must I check?
   <info>         # What's helpful to know?
   ```

5. **Close your tags** - Always use `</tag>` even though markdown parsers are lenient.

## Tag Locations

| Tag | Typical Location |
|-----|------------------|
| `<critical>` | Agent files, skill files, workflow instructions |
| `<gate>` | Subagent files (handoff, finish, setup) |
| `<info>` | Agent files, guide files |
| `<persona>` | Agent files (top) |
| `<role>` | Agent files (after persona) |

## Adding New Tags

Before adding a new tag type:

1. Check if existing tags cover the use case
2. Document the tag's purpose and priority level
3. Update this file
4. Be consistent across all files using the tag
