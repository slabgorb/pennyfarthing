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
- "Write assessment BEFORE starting exit protocol"

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
**Skills:** `/pf-sprint`, `/pf-jira`, `/pf-testing`
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

**Usage:** SM, TEA, Dev, Reviewer - runs `pf.sh workflow phase-check` on activation to determine correct owner.

```markdown
<phase-check>
## On Startup: Check Phase

Read `**Workflow:**` and `**Phase:**` from session. Query:
```bash
OWNER=$("$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh workflow phase-check {workflow} {phase})
```

**If OWNER != "dev":** Run `pf.sh handoff marker $OWNER`, output result, tell user.
</phase-check>
```

### `<handoff-gate>`

**Purpose:** Exit checklist that MUST be completed before handoff. Ensures assessment is written and subagent is spawned.

**Usage:** TEA, Dev, Reviewer - mandatory checklist before exiting.

```markdown
<handoff-gate>
## MANDATORY: Complete Before Exiting

- [ ] Write Assessment to session file
- [ ] Run `pf.sh handoff resolve-gate` — verify gate status
- [ ] Run `pf.sh handoff complete-phase` — atomic session update
- [ ] Run `pf.sh handoff marker {next_agent}` — emit marker and EXIT
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

## Session Tags

Tags used in session files (`.session/{story-id}-session.md`) for workflow state tracking.

### `<session>`

**Purpose:** Root container for all session data.

**Usage:** Wraps entire session file content.

```markdown
<session story="MSSCI-12345" workflow="tdd">
  <!-- session content -->
</session>
```

**Attributes:**
- `story` - Story identifier (Jira key or local ID)
- `workflow` - Workflow type: `tdd`, `trivial`, `bdd`, `agent-docs`

### `<meta>`

**Purpose:** Story metadata that doesn't change during the session.

**Usage:** Inside `<session>`, contains static story info.

```markdown
<meta>
  <jira>MSSCI-12345</jira>
  <epic>MSSCI-12300</epic>
  <points>3</points>
  <started>2026-02-03</started>
</meta>
```

### `<status>`

**Purpose:** Machine-readable workflow state for agent navigation.

**Usage:** Self-closing element updated at phase transitions.

```markdown
<status phase="green" next-agent="reviewer" handoff-ready="true"/>
```

**Attributes:**
- `phase` - Current workflow phase (`setup`, `red`, `green`, `review`, `finish`)
- `next-agent` - Agent to handle next (`sm`, `tea`, `dev`, `reviewer`)
- `handoff-ready` - Whether current work is complete (`true`/`false`)

### `<acceptance-criteria>`

**Purpose:** Track AC completion status in machine-parseable format.

**Usage:** Contains `<ac>` child elements.

```markdown
<acceptance-criteria>
  <ac id="1" status="done">User can create account</ac>
  <ac id="2" status="pending">Email validation works</ac>
</acceptance-criteria>
```

### `<ac>`

**Purpose:** Individual acceptance criterion.

**Attributes:**
- `id` - Numeric identifier (1, 2, 3...)
- `status` - `pending`, `in-progress`, `done`, `blocked`

### `<work-log>`

**Purpose:** Container for chronological agent contributions.

**Usage:** Contains `<entry>` and `<assessment>` elements.

### `<entry>`

**Purpose:** Standard work log entry from any agent.

**Attributes:**
- `agent` - Agent identifier (`sm`, `tea`, `dev`, `reviewer`)
- `date` - Entry date (YYYY-MM-DD)
- `phase` - Optional TDD phase (`red`, `green`, `refactor`)

```markdown
<entry agent="tea" date="2026-02-03" phase="red">
  Wrote failing tests for all ACs.
</entry>
```

### `<assessment>`

**Purpose:** Formal verdict from Reviewer agent.

**Attributes:**
- `agent` - Must be `reviewer`
- `verdict` - `approved`, `rejected`, `needs-work`

```markdown
<assessment agent="reviewer" verdict="approved">
  All ACs verified, code follows patterns.
</assessment>
```

**See also:** `guides/session-schema.md` for complete session file schema.

---

## Skill Tags

Tags used in skill files (`skills/{name}/SKILL.md`) for command documentation.

### `<run>`

**Purpose:** The exact command to execute for a skill command.

**Usage:** One per command, contains shell command.

```markdown
<run>
pf.sh sprint status [filter]
</run>
```

### `<args>`

**Purpose:** Document command arguments in table format.

**Usage:** Follows `<run>`, contains markdown table.

```markdown
<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `filter` | No | Filter by status: `todo`, `done` |
</args>
```

### `<example>`

**Purpose:** Show command usage with expected output.

**Usage:** Realistic invocation followed by commented output.

```markdown
<example>
pf.sh sprint check MSSCI-12038
# Returns: {"type": "story", "available": true}
</example>
```

### `<when>`

**Purpose:** Document conditions for using a command and next steps.

**Usage:** Trigger conditions or follow-up actions.

```markdown
<when>
- Starting new development work
- After promote, create Jira epic with `/pf-jira create epic`
</when>
```

### `<agent-activation>`

**Purpose:** Command to load agent persona before using skill.

**Usage:** Shell command for agent activation.

```markdown
<agent-activation>
Load SM persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/agent-session.sh" start "sm"
```
</agent-activation>
```

**See also:** `guides/skill-schema.md` for complete skill file schema.

---

## Workflow Step Tags

Tags used in workflow step files (`workflows/{name}/steps/step-*.md`) for BikeLane navigation.

### `<step-meta>`

**Purpose:** Machine-readable step metadata for workflow navigation.

**Usage:** Required at top of every step file.

```markdown
<step-meta>
number: 1
name: initialize
gate: false
next: step-02-context
</step-meta>
```

**Fields:**
- `number` - Step number (integer)
- `name` - Step identifier (kebab-case)
- `gate` - Whether step has checkpoint (boolean)
- `next` - Next step filename (optional)

### `<purpose>`

**Purpose:** Explain what the step accomplishes.

**Usage:** Clear, concise goal statement.

```markdown
<purpose>
Set up the architecture session by gathering inputs and establishing context.
</purpose>
```

### `<prerequisites>`

**Purpose:** What must be true before starting this step.

**Usage:** Bullet list of requirements.

```markdown
<prerequisites>
- PRD document exists
- Previous step completed
</prerequisites>
```

### `<instructions>`

**Purpose:** Step-by-step execution guide.

**Usage:** Numbered list of actions.

```markdown
<instructions>
1. Read the PRD document
2. Identify architectural concerns
3. Document recommendation
</instructions>
```

### `<actions>`

**Purpose:** Specific file and script operations.

**Usage:** Prefixed bullet list (Check:, Read:, Write:, Run:).

```markdown
<actions>
- Read: `{planning_artifacts}/*prd*.md`
- Write: `{output_file}` with session content
</actions>
```

### `<collaboration-menu>`

**Purpose:** Present user options after step completion.

**Usage:** Standard menu with keyboard shortcuts.

```markdown
<collaboration-menu>
- **[C] Continue** - Proceed to next step
- **[R] Revise** - Make changes
- **[H] Help** - Get guidance
</collaboration-menu>
```

### `<next-step>`

**Purpose:** Explicit navigation to the next step.

**Usage:** Instruction on which file to load.

```markdown
<next-step>
After gate passes, proceed to step-02-context.md
</next-step>
```

**See also:** `guides/workflow-step-schema.md` for complete workflow step schema.

---

## Adding New Tags

Before adding a new tag type:

1. Check if existing tags cover the use case
2. Document the tag's purpose and priority level
3. Update this file
4. Be consistent across all files using the tag
