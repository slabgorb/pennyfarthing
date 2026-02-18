# Skill File XML Schema

Skill files document slash commands and their usage. A consistent XML schema ensures agents can reliably parse commands, arguments, and execution patterns.

## File Location

```
skills/{skill-name}/SKILL.md
```

**Examples:**
- `skills/sprint/SKILL.md`
- `skills/testing/SKILL.md`
- `skills/jira/SKILL.md`

## Complete Schema

```markdown
---
name: skill-name
description: |
  One-line or multiline description of what this skill does.
  IMPORTANT notes can go here.
args: "[command|arg1|arg2]"
---

# /skill-name - Human Readable Title

<critical>
Non-negotiable rules for this skill.
**Never** do X. **Always** do Y.
</critical>

## Commands

### `/skill-name` or `/skill-name command`

Description of what this command does.

<run>
.pennyfarthing/scripts/path/to/script.sh [args]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `arg1` | Yes | What this argument does |
| `arg2` | No | Optional argument |
</args>

<example>
.pennyfarthing/scripts/path/to/script.sh value1
# Returns: expected output format
</example>

<output>
What the command returns and how to interpret it.
</output>

<when>
Conditions for using this command.
What to do next after running it.
</when>

---

### `/skill-name another-command`

Another command description...

## Agent Activation

<agent-activation>
Load agent persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/agent-session.sh" start "agent-name"
```
</agent-activation>

## Quick Reference

| Command | Script/Action |
|---------|---------------|
| `/skill-name` | `script.sh` |
| `/skill-name cmd` | `script.sh cmd` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/other-skill` | Related functionality |
```

## Element Reference

### YAML Frontmatter (Required)

Every skill file must have YAML frontmatter:

```yaml
---
name: skill-name          # Required: lowercase, hyphenated
description: |            # Required: what this skill does
  Description text...
args: "[arg1|arg2]"       # Optional: argument summary
---
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier, matches directory name |
| `description` | Yes | Human-readable description |
| `args` | No | Argument syntax summary |

---

### `<critical>`

**Purpose:** Non-negotiable rules that MUST be followed. LLMs treat these as hard constraints.

**When to Use:**
- Rules that break the system if ignored
- Security constraints
- Data integrity requirements

**Example:**
```xml
<critical>
**Never manually edit** `sprint/current-sprint.yaml`. Use scripts.
</critical>
```

**Note:** Use sparingly. If everything is critical, nothing is.

---

### `<run>`

**Purpose:** The exact command to execute for this skill command.

**Required:** Yes, for every command that has a script.

**Content:** Single shell command or script invocation.

**Example:**
```xml
<run>
pf.sh sprint status [filter]
</run>
```

**Guidelines:**
- Use `.pennyfarthing/scripts/` paths (never `pennyfarthing-dist/`)
- Include argument placeholders in `[brackets]`
- One command per `<run>` block

---

### `<args>`

**Purpose:** Document the arguments a command accepts.

**Required:** Yes, if command takes arguments.

**Format:** Markdown table with standard columns.

**Example:**
```xml
<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `35-2` or `MSSCI-12345`) |
| `--verbose` | No | Show detailed output |
</args>
```

**Columns:**
| Column | Description |
|--------|-------------|
| `Arg` | Argument name (backtick-wrapped) |
| `Required` | `Yes` or `No` |
| `Description` | What this argument does |

---

### `<example>`

**Purpose:** Show how to use the command with expected output.

**Required:** Recommended for all commands.

**Content:** Command invocation followed by commented output.

**Example:**
```xml
<example>
pf.sh sprint check MSSCI-12038
# Returns: {"type": "story", "available": true, "title": "...", ...}
</example>
```

**Guidelines:**
- Show realistic values
- Include the expected return format
- Multiple examples are fine

---

### `<output>`

**Purpose:** Describe what the command returns and how to interpret it.

**Required:** Yes, for every command.

**Content:** Description of output format, fields, and interpretation.

**Example:**
```xml
<output>
Sprint metadata, stories by status (grouped under epic headers), points breakdown.
When filtered, only shows epics with matching stories.
</output>
```

---

### `<when>`

**Purpose:** Document when to use this command and what to do next.

**Required:** If there are specific conditions or next steps.

**Content:** Conditions that trigger this command, or follow-up actions.

**Example:**
```xml
<when>
- Starting new development work
- `/pf-session new` is an alias for this command
Next steps after promote:
- Review appended YAML in current-sprint.yaml
- Create Jira epic: `/pf-jira create epic <epic-id>`
</when>
```

---

### `<agent-activation>`

**Purpose:** Command to load an agent persona before using skill commands.

**Required:** Only if skill requires agent activation.

**Content:** The shell command to activate the agent.

**Example:**
```xml
<agent-activation>
Load SM persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/agent-session.sh" start "sm"
```
</agent-activation>
```

---

## Complete Example

Here's a well-structured skill file following the schema:

```markdown
---
name: sprint
description: |
  Sprint status, backlog, story, and epic management. Use when checking sprint
  status, managing stories, or working with epics.
args: "[status|backlog|work|story|epic|standalone]"
---

# /sprint - Sprint Management

<critical>
Never manually edit sprint YAML. Use the provided commands.
</critical>

## Commands

### `/pf-sprint story add <epic-id> "<title>" <points>`

Add a new story to an epic.

<run>
pf.sh sprint story add <epic-id> "<title>" <points>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Parent epic (e.g., `epic-76`) |
| `title` | Yes | Story title (quoted if contains spaces) |
| `points` | Yes | Story points |
</args>

<example>
pf.sh sprint story add epic-76 "Add user authentication" 3
</example>

<output>
Confirmation with new story ID and details.
</output>

<when>
After creating, use `/pf-sprint story size` for sizing guidelines.
</when>

---

### `/pf-sprint story finish <story-id>`

Complete a story after PR merge.

<run>
pf.sh sprint story finish <story-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story to finish (e.g., `MSSCI-12052`) |
</args>

<example>
pf.sh sprint story finish MSSCI-12052
# Archives story, updates Jira, cleans session files
</example>

<output>
Confirmation of archive location and cleanup actions.
</output>

<when>
Use after PR is merged and story work is complete.
</when>

---

## Agent Activation

<agent-activation>
Load SM persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/agent-session.sh" start "sm"
```
</agent-activation>

## Quick Reference

| Command | Script/CLI |
|---------|------------|
| `/pf-sprint story add ...` | `sprint story add` |
| `/pf-sprint story size` | `sprint story size` |
| `/pf-sprint story finish <id>` | `sprint story finish` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/pf-sprint` | Sprint management |
| `/pf-jira` | Jira operations |
```

---

## Tag Summary

| Tag | Purpose | Required |
|-----|---------|----------|
| `<critical>` | Non-negotiable rules | If applicable |
| `<run>` | Command to execute | Yes, per command |
| `<args>` | Argument table | If command takes args |
| `<example>` | Usage with output | Recommended |
| `<output>` | Return value description | Yes, per command |
| `<when>` | Conditions/next steps | If applicable |
| `<agent-activation>` | Agent loading | If skill requires agent |

---

## Migration Checklist

When updating existing skill files:

- [ ] Add YAML frontmatter if missing
- [ ] Wrap critical rules in `<critical>` tags
- [ ] Add `<run>` for each command
- [ ] Add `<args>` table for commands with arguments
- [ ] Add `<example>` with realistic values
- [ ] Add `<output>` describing return format
- [ ] Add `<when>` for conditional commands
- [ ] Add `<agent-activation>` if agent is required

---

## Related Files

| File | Purpose |
|------|---------|
| `guides/xml-tags.md` | Complete XML tag taxonomy |
| `skills/sprint/SKILL.md` | Reference implementation |
| `skill-registry.yaml` | Skill registration |
