# Workflow Step File XML Schema

Workflow step files define individual steps in BikeLane stepped workflows. A consistent XML schema enables reliable step parsing, gate enforcement, and navigation.

## File Location

```
workflows/{workflow-name}/steps/step-{NN}-{name}.md
workflows/{workflow-name}/steps-{mode}/step-{NN}-{name}.md
```

**Examples:**
- `workflows/architecture/steps/step-01-initialize.md`
- `workflows/prd/steps-c/step-05-domain.md` (create mode)
- `workflows/research/steps-market/step-02-customer-insights.md`

## Complete Schema

```markdown
# Step N: Step Title

<step-meta>
number: 1
name: initialize
gate: false
next: step-02-context
</step-meta>

<purpose>
What this step accomplishes in the workflow.
</purpose>

<prerequisites>
- Required input 1
- Required input 2
- Previous step must be complete
</prerequisites>

<instructions>
1. First action to take
2. Second action to take
3. Third action to take
</instructions>

<actions>
- Check: `{file_path}` for condition
- Read: `{input_path}/*.md`
- Write: `{output_file}`
- Run: `.pennyfarthing/scripts/path/to/script.sh`
</actions>

<output>
What to produce at end of this step.
Document format, required sections, etc.
</output>

<gate>
## Completion Criteria
- [ ] Criterion 1 met
- [ ] Criterion 2 met
- [ ] User confirmed output
</gate>

<collaboration-menu>
- **[C] Continue** - Proceed to next step
- **[R] Revise** - Make changes to output
- **[H] Help** - Get guidance on this step
- **[S] Skip** - Skip optional step
</collaboration-menu>

<next-step>
After gate passes, proceed to step-02-context.md
</next-step>

## Failure Modes

- Not checking prerequisites before starting
- Skipping user confirmation at gate
- Proceeding without all criteria met

## Success Metrics

- All gate criteria checked
- User confirmed satisfaction
- Output matches expected format
```

## Element Reference

### Step Title (Required)

Every step file must start with a markdown heading:

```markdown
# Step N: Descriptive Title
```

**Format:** `# Step {number}: {title}`

---

### `<step-meta>` (Required)

**Purpose:** Machine-readable step metadata for BikeLane navigation.

**Fields:**
| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `number` | Yes | Integer | Step number (1, 2, 3...) |
| `name` | Yes | String | Step identifier (kebab-case) |
| `gate` | Yes | Boolean | Whether step has a gate checkpoint |
| `next` | No | String | Next step filename (without .md) |

**Example:**
```xml
<step-meta>
number: 3
name: patterns
gate: true
next: step-04-components
</step-meta>
```

**Note:** The `next` field enables automatic navigation. Omit for final steps.

---

### `<purpose>`

**Purpose:** Explain what this step accomplishes in the workflow.

**Required:** Yes

**Content:** Clear, concise explanation of the step's goal.

**Example:**
```xml
<purpose>
Set up the architecture decision session by gathering inputs and establishing context.
This step validates prerequisites and prepares the working document.
</purpose>
```

---

### `<prerequisites>`

**Purpose:** What must be true before starting this step.

**Required:** Yes, if step has dependencies.

**Content:** Bullet list of requirements.

**Example:**
```xml
<prerequisites>
- PRD document exists at `{planning_artifacts}/prd.md`
- Previous step (discovery) completed
- User has approved problem statement
</prerequisites>
```

---

### `<instructions>`

**Purpose:** Step-by-step guide for executing this workflow step.

**Required:** Yes

**Content:** Numbered list of actions.

**Example:**
```xml
<instructions>
1. Read the PRD document to understand requirements
2. Identify key architectural concerns
3. List candidate patterns that address concerns
4. Evaluate trade-offs for each pattern
5. Document recommendation with rationale
</instructions>
```

**Guidelines:**
- Use imperative voice ("Read", "Identify", "Document")
- Keep steps atomic and actionable
- Order reflects execution sequence

---

### `<actions>`

**Purpose:** Specific file and script operations for this step.

**Required:** Recommended for steps with file operations.

**Content:** Bullet list with action type prefix.

**Action Types:**
| Prefix | Description |
|--------|-------------|
| `Check:` | Verify condition exists |
| `Read:` | Load file(s) for input |
| `Write:` | Create or update file |
| `Run:` | Execute script |
| `Create:` | Create new file/directory |
| `Delete:` | Remove file (cleanup) |

**Example:**
```xml
<actions>
- Check: `{output_file}` for existing workflow (continuation detection)
- Read: `{planning_artifacts}/*prd*.md`
- Read: `docs/adr/*.md` (scan for relevant prior decisions)
- Write: `{output_file}` with architecture session content
</actions>
```

**Variable Placeholders:**
| Variable | Description |
|----------|-------------|
| `{output_file}` | Workflow output document |
| `{planning_artifacts}` | Planning docs directory |
| `{project_root}` | Project root directory |
| `{story_id}` | Current story ID |

---

### `<output>`

**Purpose:** What this step produces.

**Required:** Yes

**Content:** Description of deliverable, format, required sections.

**Example:**
```xml
<output>
Add to session file:

```markdown
## Architecture Session: {project_name}

### Patterns Evaluated
| Pattern | Pros | Cons | Fit |
|---------|------|------|-----|
| Pattern A | ... | ... | High |
| Pattern B | ... | ... | Medium |

### Recommendation
[Selected pattern with rationale]
```
</output>
```

---

### `<gate>`

**Purpose:** Checkpoint criteria that must be met before proceeding.

**Required:** If `gate: true` in step-meta.

**Content:** Checklist of completion criteria.

**Example:**
```xml
<gate>
## Completion Criteria
- [ ] At least 3 patterns evaluated
- [ ] Trade-offs documented for each
- [ ] User confirmed recommendation
- [ ] No blocking questions remain
</gate>
```

**Guidelines:**
- Use checkbox format for trackable criteria
- Include user confirmation if step requires approval
- Keep criteria objective and verifiable

---

### `<switch>`

**Purpose:** Conditional navigation with branching. Maps to `AskUserQuestion` tool for user choices or agent-evaluated conditions.

**Required:** When step has branching navigation (options lead to different next steps).

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `tool` | No | `AskUserQuestion` for user-facing choices. Omit for agent-evaluated conditions. |
| `on` | No | Variable or condition driving the switch. Omit for user-choice switches. |

**Child elements:**
- `<case value="" next="">` — Each branch option. `next` is step filename, `LOOP` (re-present switch), or `EXIT`.
- `<default next="">` — Fallback branch. Optional when `tool="AskUserQuestion"`.

**Example (user choice):**
```xml
<switch tool="AskUserQuestion">
  <case value="continue" next="step-04-components">
    Continue — Save content and proceed to Component Design
  </case>
  <case value="revise" next="LOOP">
    Revise — Re-evaluate current output
  </case>
  <case value="advanced" next="LOOP">
    Advanced Elicitation — Explore deeper insights
  </case>
  <case value="party" next="LOOP">
    Party Mode — Multiple perspectives on the analysis
  </case>
</switch>
```

**Example (agent-evaluated):**
```xml
<switch on="execution_mode">
  <case value="tech-spec" next="step-03-execute">
    Tech-spec mode — load spec directly
  </case>
  <default next="step-02-context-gathering">
    Direct mode — gather context first
  </default>
</switch>
```

**Note:** Use `<switch>` when any option transitions to a different step. Use `<collaboration-menu>` only when ALL options loop back (no step transitions). See ADR-0032.

---

### `<collaboration-menu>` (Simple Loops Only)

**Purpose:** Present user options when ALL options loop back to the current step (no branching).

**Required:** Only when no option causes a step transition. Prefer `<switch>` for branching menus.

**Example:**
```xml
<collaboration-menu>
- **[R] Revise** - Make changes to current output
- **[H] Help** - Get guidance or clarification
</collaboration-menu>
```

**Migration:** If any option (e.g., `[C] Continue`) navigates to a different step, replace with `<switch tool="AskUserQuestion">`. See ADR-0032.

---

### `<next-step>`

**Purpose:** Explicit navigation to the next step.

**Required:** Recommended for clarity.

**Content:** Instruction on which file to load next.

**Example:**
```xml
<next-step>
After gate passes, proceed to step-04-components.md for Component Design.
</next-step>
```

---

## Optional Sections

### Failure Modes

**Purpose:** Common mistakes to avoid.

**Format:** Plain markdown section (not XML-tagged).

```markdown
## Failure Modes

- Proceeding with fresh initialization when existing workflow exists
- Not detecting PRD requirement
- Not confirming inputs with user before proceeding
```

### Success Metrics

**Purpose:** How to know the step succeeded.

**Format:** Plain markdown section (not XML-tagged).

```markdown
## Success Metrics

- All gate criteria checked
- User confirmed satisfaction
- Output matches expected format
```

### Continuation Detection

**Purpose:** Logic for resuming an interrupted workflow.

**Format:** Plain markdown section.

```markdown
## Continuation Detection

1. Look for existing `{output_file}`
2. If exists, read complete file including frontmatter
3. If frontmatter has `stepsCompleted` array → Load `./step-01b-continue.md`
4. If not exists → proceed with fresh initialization
```

---

## Complete Example

```markdown
# Step 3: Pattern Selection

<step-meta>
number: 3
name: patterns
gate: true
next: step-04-components
</step-meta>

<purpose>
Evaluate architectural patterns that address the identified concerns and select the most appropriate approach.
</purpose>

<prerequisites>
- Context analysis complete (step 2)
- Key concerns documented
- Constraints understood
</prerequisites>

<instructions>
1. Review concerns identified in context analysis
2. Identify candidate patterns (minimum 3)
3. Evaluate each pattern against constraints
4. Document trade-offs for each option
5. Select recommended pattern with rationale
6. Present options to user for confirmation
</instructions>

<actions>
- Read: `{output_file}` for context analysis
- Read: `docs/patterns/*.md` for pattern library
- Write: Pattern evaluation matrix to `{output_file}`
</actions>

<output>
Add to architecture document:

```markdown
## Pattern Evaluation

### Candidate Patterns
1. **Pattern A** - [brief description]
2. **Pattern B** - [brief description]
3. **Pattern C** - [brief description]

### Evaluation Matrix
| Pattern | Scalability | Complexity | Team Familiarity | Fit |
|---------|-------------|------------|------------------|-----|
| A | High | Medium | High | Best |
| B | Medium | Low | High | Good |
| C | High | High | Low | Poor |

### Recommendation
[Selected pattern] because [rationale]
```
</output>

<gate>
## Completion Criteria
- [ ] At least 3 patterns evaluated
- [ ] Trade-offs documented for each
- [ ] Recommendation includes rationale
- [ ] User confirmed pattern selection
</gate>

<collaboration-menu>
- **[C] Continue** - Proceed to Component Design
- **[R] Revise** - Re-evaluate pattern options
- **[H] Help** - Get guidance on pattern trade-offs
- **[B] Back** - Return to Context Analysis
</collaboration-menu>

<next-step>
After user confirms pattern selection, proceed to step-04-components.md for Component Design.
</next-step>

## Failure Modes

- Selecting pattern without evaluating alternatives
- Ignoring team familiarity constraints
- Not getting user confirmation

## Success Metrics

- Multiple patterns evaluated objectively
- Selection justified with clear rationale
- User confirmed recommended approach
```

---

## Tag Summary

| Tag | Purpose | Required |
|-----|---------|----------|
| `<step-meta>` | Step metadata | Yes |
| `<purpose>` | Step goal | Yes |
| `<prerequisites>` | Requirements | If applicable |
| `<instructions>` | Step-by-step guide | Yes |
| `<actions>` | File operations | Recommended |
| `<output>` | Deliverable description | Yes |
| `<gate>` | Completion criteria | If gate:true |
| `<collaboration-menu>` | User options | Recommended |
| `<next-step>` | Navigation hint | Recommended |

---

## Migration Checklist

When updating existing step files:

- [ ] Ensure `# Step N: Title` header present
- [ ] Add `<step-meta>` with all required fields
- [ ] Wrap purpose in `<purpose>` tags
- [ ] Wrap prerequisites in `<prerequisites>` tags
- [ ] Wrap instructions in `<instructions>` tags
- [ ] Add `<actions>` for file operations
- [ ] Wrap output template in `<output>` tags
- [ ] Add `<gate>` if step has checkpoint
- [ ] Add `<collaboration-menu>` with standard options
- [ ] Add `<next-step>` navigation hint

---

## Related Files

| File | Purpose |
|------|---------|
| `guides/taxonomy/xml-tags.md` | Complete XML tag taxonomy |
| `schemas/workflow-schema.md` | Workflow YAML configuration |
| `workflows/architecture/steps/step-01-initialize.md` | Reference implementation |
