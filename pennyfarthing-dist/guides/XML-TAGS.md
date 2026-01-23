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
