---
name: context
description: |
  Create epic or story context documents. Reads sprint YAML for epic/story data,
  reads context-schema.yaml for required sections, populates templates, and writes
  output to sprint/context/. Epic context is a single-agent operation (no tandem).
  Story context uses PM + tandem partner (added in 130-2/130-3).
args: "create epic {id}"
---

# /pf-context — Context Document Creation

Create structured context documents that downstream agents (TEA, Dev) consume during implementation.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/pf-context create epic {id}` | Create epic context document |

## Create Epic Context

When invoked with `create epic {id}`:

### Step 1: Read the Schema

Read `pennyfarthing-dist/templates/context-schema.yaml` to get the required and optional sections for epic context documents. The schema is the ONLY authority for sections — never hardcode section names.

### Step 2: Locate the Epic

Find the epic in sprint data. Try these approaches in order:

1. **By ordinal ID:** Run `pf sprint epic show {id}` to get epic metadata (title, Jira key, stories, points, repo)
2. **By Jira key:** If `{id}` is a Jira key (e.g., MSSCI-15685), use it directly

Extract from the epic metadata:
- Epic title
- Jira key
- Story count and total points
- Priority
- Repo
- Story list with titles and points

### Step 3: Find Planning Documents

Check the epic's context in the sprint for referenced planning documents:

1. Read `sprint/context/context-epic-{id}.md` if it already exists (may have partial content)
2. Search `sprint/planning/` for PRDs and related docs that reference this epic
3. Check `docs/adr/` for ADRs that reference this epic's Jira key or topic

Build a planning documents table with document names, paths, and relevant sections.

### Step 4: Load the Template

Read the epic context template at `pennyfarthing-dist/templates/context-epic-template.md`.

### Step 5: Fill the Template

Populate each section from the data gathered:

| Section | Source |
|---------|--------|
| **Overview** | Epic title, description, priority, repo, story count from sprint data |
| **Planning Documents** | Table built in Step 3 |
| **Background** | Synthesize from planning docs — WHY this epic exists, current state, problem being solved |
| **Technical Architecture** | From ADR/planning docs — component structure, key files, data flow, interfaces |
| **Cross-Epic Dependencies** | From sprint data — what this epic depends on and what depends on it |

**Section quality guidelines:**
- Overview: 2-3 sentences plus metadata fields
- Background: 2-4 paragraphs with subsections as needed
- Technical Architecture: Component diagram, key files table, flow description
- Planning Documents: Table with document, path, and relevant sections
- Cross-Epic Dependencies: Bulleted lists of depends-on and depended-on-by

### Step 6: Write the Output

Write the completed context document to:

```
sprint/context/context-epic-{id}.md
```

Where `{id}` is the ordinal epic ID (e.g., `130`), not the Jira key.

### Step 7: Validate (if available)

If the context validator is available, run:

```bash
pf context-docs validate epic {id}
```

Report any validation errors. If the validator is not yet installed, skip this step.

## Constraints

- **Schema-driven:** Always read `context-schema.yaml` for sections (ADR-0029 Rule #2)
- **No tandem:** Epic context is strategic summary — single-agent operation
- **Naming convention:** `context-epic-{id}.md` with ordinal ID (ADR-0029 Rule #1)
- **Output location:** `sprint/context/` only (ADR-0029 Rule #7)
- **No frontmatter required:** Epic contexts have no required frontmatter (backward compat)

## Examples

### Create epic context for epic 130

```
/pf-context create epic 130
```

Reads epic 130 metadata, finds planning docs (PRD, ADR-0029), fills template, writes to `sprint/context/context-epic-130.md`.

### Create epic context by Jira key

```
/pf-context create epic MSSCI-15685
```

Resolves Jira key to ordinal ID, then follows the same flow.
