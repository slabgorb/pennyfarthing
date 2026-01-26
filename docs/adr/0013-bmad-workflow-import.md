# ADR-0013: Stepped Workflow Support (BMAD-Inspired)

**Status:** Proposed
**Date:** 2026-01-19
**Author:** Architect (The White Queen)

## Context

BMAD-METHOD is an AI-driven agile development framework with 21+ specialized agents and 50+ guided workflows. Pennyfarthing shares similar goals (agent orchestration for software development) but uses different formats and execution models.

Rather than creating a separate BMAD compatibility layer, we will **extend Pennyfarthing's native workflow system** to support BMAD-style features. This makes stepped workflows a first-class Pennyfarthing capability.

### BMAD Features Worth Adopting

| Feature | Description | Value |
|---------|-------------|-------|
| **Progressive disclosure** | One step file loaded at a time | Focused execution, reduced context |
| **Step-based execution** | Sequential steps with clear boundaries | Resumable, auditable |
| **User approval gates** | Pause points requiring user confirmation | Quality control, human-in-loop |
| **Tri-modal workflows** | Create/Validate/Edit modes | Flexible artifact management |
| **State tracking** | `stepsCompleted` array | Cross-session resumability |
| **Variable resolution** | `{project_name}`, `{user_name}` | Dynamic content |

### Pennyfarthing Current State

- **Workflows:** Simple YAML phase definitions (`tdd.yaml`, `trivial.yaml`)
- **Execution:** State detection from `.session/{story-id}-session.md`
- **Agents:** Markdown definitions with themed personas
- **Limitation:** No support for step-based workflows, progressive disclosure, or tri-modal patterns

## Decision

Extend Pennyfarthing's workflow system to support a new `type: stepped` workflow format that enables BMAD-style features natively. Existing `type: phased` workflows (TDD, trivial, BDD) continue to work unchanged.

### Core Design Principles

1. **Native, not imported** - Stepped workflows are Pennyfarthing workflows, not BMAD compatibility
2. **Backward compatible** - Existing workflows work without modification
3. **Progressive disclosure** - One step loaded at a time to focus agent attention
4. **Session-based state** - Track progress in session files, consistent with existing patterns
5. **Themed personas preserved** - Stepped workflows use Pennyfarthing's persona system

### Extended Workflow Format

```yaml
# pennyfarthing-dist/workflows/architecture.yaml
workflow:
  name: architecture
  description: Collaborative architectural decision-making
  version: "1.0.0"
  type: stepped                    # NEW: enables step-based execution

  # Step configuration
  steps:
    path: ./steps/                 # Directory containing step files
    pattern: step-{nn}-*.md        # Naming pattern (nn = zero-padded number)

  # Tri-modal support (optional)
  modes:
    default: create                # Default mode if not specified
    create: ./steps/               # Create mode steps
    validate: ./steps-v/           # Validation-only steps
    edit: ./steps-e/               # Edit mode steps

  # Variables available in step files
  variables:
    output_file: planning-artifacts/architecture.md
    input_required:
      - prd                        # Must have PRD before running

  # User approval gates
  gates:
    after_steps: [1, 3, 7]         # Pause after these step numbers
    gate_marker: "<!-- GATE -->"   # Or detect from step file content

  # Output template (optional)
  template: ./templates/architecture.md

  # Agent assignment
  agent: architect                 # Primary agent for this workflow

  # Legacy phase mapping (for compatibility)
  phases: []                       # Empty = pure stepped workflow
```

### Step File Format

```markdown
# Step 2: Context Analysis

<step-meta>
number: 2
name: context-analysis
gate: true
</step-meta>

## Purpose
Analyze the project context and identify architectural concerns.

## Instructions

1. Load project context from `{project_context}` if it exists
2. Extract technical constraints from the PRD
3. Identify integration points and external dependencies
4. Note any technology preferences or constraints

## Actions

- Read: `{planning_artifacts}/*prd*.md`
- Read: `**/project-context.md` (if exists)
- Read: `{planning_artifacts}/*brief*.md` (if exists)

## Output

Add findings to `## Architecture Context` section in session file:

```markdown
## Architecture Context

### Technical Constraints
- [List constraints from PRD]

### Integration Points
- [List external systems/APIs]

### Technology Preferences
- [List any stated preferences]
```

## Gate

Confirm context analysis before proceeding:

- [C] Continue to pattern selection
- [R] Revise - need to gather more context
```

### Session File Extensions

Extend session files to track stepped workflow progress:

```markdown
# Session: architecture-planning

## Workflow State
- **Workflow:** architecture
- **Type:** stepped
- **Mode:** create
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Started:** 2026-01-19T10:30:00Z
- **Last Updated:** 2026-01-19T11:45:00Z

## Step 1: Initialization
[Output from step 1]

## Step 2: Context Analysis
[Output from step 2]

## Step 3: Pattern Selection
[In progress...]
```

### Workflow Commands

```bash
# List available workflows
/workflow list                     # Shows both phased and stepped

# Start a stepped workflow
/workflow start architecture       # Starts in default (create) mode
/workflow start architecture --mode validate
/workflow start prd --edit

# Resume interrupted workflow
/workflow resume                   # Detects and resumes incomplete workflows
/workflow resume architecture      # Resume specific workflow

# Check workflow status
/workflow status                   # Shows current step, progress
```

### Execution Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    Stepped Workflow Execution                    │
└─────────────────────────────────────────────────────────────────┘

1. Load workflow.yaml
   └── Validate type: stepped
   └── Resolve variables from config + session

2. Check for existing session
   ├── Found: Resume from last completed step
   └── Not found: Create new session, start step 1

3. For each step:
   ├── Load step-{nn}-*.md file
   ├── Resolve variables in content
   ├── Execute instructions (agent performs actions)
   ├── Write output to session file
   ├── Check for gate
   │   ├── Gate present: Pause, wait for user [C]ontinue
   │   └── No gate: Proceed to next step
   └── Update stepsCompleted in session

4. On completion:
   └── Mark workflow complete in session
   └── Optionally generate output document from template
```

### Variable Resolution

Variables are resolved from multiple sources in priority order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Workflow YAML `variables:` | `output_file` |
| 2 | Session file | `story_id`, `workflow_mode` |
| 3 | `.pennyfarthing/config.local.yaml` | `user_name`, `theme` |
| 4 | Environment/system | `project_root`, `date` |
| 5 | Defaults | `planning_artifacts: planning-artifacts/` |

**Standard Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `{project_root}` | Project root directory | `$PWD` |
| `{project_name}` | Project name | Directory name |
| `{user_name}` | User's name | From config |
| `{date}` | Current date | ISO format |
| `{planning_artifacts}` | Planning output directory | `planning-artifacts/` |
| `{implementation_artifacts}` | Implementation output | `implementation-artifacts/` |
| `{project_context}` | Project context file | `**/project-context.md` |
| `{session_file}` | Current session file path | Auto-detected |
| `{current_step}` | Current step number | From session |
| `{workflow_mode}` | Current mode (create/validate/edit) | From session |

### BMAD Workflow Migration

BMAD workflows can be migrated to Pennyfarthing stepped format:

| BMAD Component | Pennyfarthing Equivalent |
|----------------|--------------------------|
| `workflow.md` | `workflow.yaml` with `type: stepped` |
| `steps/step-01-*.md` | `steps/step-01-*.md` (same format, minor tweaks) |
| `steps-c/`, `steps-v/`, `steps-e/` | `modes:` section in workflow.yaml |
| Frontmatter `stepsCompleted` | Session file `## Workflow State` |
| `{config_source}:variable` | Direct variable reference `{variable}` |
| `workflow.xml` tasks | Not migrated (use existing phased workflows) |

**Migration script provided:** `pennyfarthing-dist/scripts/migrate-bmad-workflow.sh`

## Consequences

### Positive

- **Native capability** - Stepped workflows are first-class Pennyfarthing features
- **No separate system** - Users learn one workflow system, not two
- **BMAD compatibility** - Can migrate BMAD planning workflows
- **Progressive disclosure** - Focused agent execution, better results
- **Resumability** - Pick up where you left off across sessions
- **Quality gates** - Human approval points ensure oversight
- **Themed personas** - Stepped workflows use Alice in Wonderland (or other themes)

### Negative

- **Schema complexity** - Workflow YAML has more options to understand
- **Migration effort** - BMAD workflows need conversion (not direct import)
- **No XML support** - BMAD's `instructions.xml` format not supported

### Neutral

- **Two workflow types** - `phased` and `stepped` serve different purposes
- **Session file growth** - Stepped workflows add more content to sessions

## Alternatives Considered

### 1. Separate `/bmad` Command

**Rejected:** Creates two parallel systems. Users must learn BMAD concepts separately. Maintenance burden of tracking BMAD updates.

### 2. Direct BMAD Import (Original ADR)

**Superseded:** The original proposal created a compatibility layer. This revision makes stepped workflows native, which is cleaner and more maintainable.

### 3. Convert All BMAD to Phased Workflows

**Rejected:** Loses the progressive disclosure benefit. BMAD's micro-file architecture is valuable and worth preserving.

### 4. Full XML Instruction Engine

**Not planned:** BMAD's XML format (`dev-story`) is powerful but complex. Pennyfarthing's TDD workflow already handles implementation well. Focus on planning workflows where stepped execution adds most value.

## Implementation Plan

| Phase | Scope | Priority | Status |
|-------|-------|----------|--------|
| 1 | Workflow YAML schema extension (`type: stepped`) | High | Pending |
| 2 | Step file parser and variable resolution | High | Pending |
| 3 | Session file state tracking extensions | High | Pending |
| 4 | `/workflow` command updates (start, resume, status) | High | Pending |
| 5 | Gate detection and user approval flow | Medium | Pending |
| 6 | Tri-modal support (create/validate/edit) | Medium | Pending |
| 7 | BMAD migration script | Low | Pending |
| 8 | Example stepped workflows (architecture, prd) | Low | Pending |

## Implementation Guidance for Dev

### Phase 1: Schema Extension

1. Update `pennyfarthing-dist/workflows/` YAML schema to support:
   ```yaml
   type: stepped | phased    # phased is default for backward compat
   steps:
     path: string
     pattern: string
   modes:
     default: string
     create: string
     validate: string
     edit: string
   variables: object
   gates:
     after_steps: number[]
     gate_marker: string
   template: string
   ```

2. Workflow loader detects `type` and routes to appropriate executor

### Phase 2: Step Parser

1. Create step file parser that:
   - Extracts `<step-meta>` block (optional)
   - Resolves `{variable}` placeholders
   - Identifies gate markers (`<!-- GATE -->` or from meta)

2. Variable resolver with priority chain:
   - Workflow → Session → Config → Environment → Defaults

### Phase 3: Session State

1. Extend session file format:
   ```markdown
   ## Workflow State
   - **Workflow:** {name}
   - **Type:** stepped
   - **Mode:** {mode}
   - **Current Step:** {n}
   - **Steps Completed:** [{array}]
   ```

2. Session reader/writer for stepped workflow state

### Phase 4: Commands

1. `/workflow list` - Show all workflows with type indicator
2. `/workflow start <name> [--mode]` - Begin stepped workflow
3. `/workflow resume [name]` - Continue from last step
4. `/workflow status` - Show current progress

### Phase 5: Gates

1. Gate detection from:
   - `gates.after_steps` in workflow YAML
   - `gate: true` in step meta
   - `<!-- GATE -->` marker in step content

2. Gate UI:
   - Display gate prompt from step file
   - Wait for user input ([C]ontinue, [R]evise, etc.)
   - Record decision in session

### Phase 6: Tri-Modal

1. Mode selection at workflow start
2. Route to appropriate steps directory based on mode
3. Track mode in session state

## Example: Architecture Workflow

```yaml
# pennyfarthing-dist/workflows/architecture.yaml
workflow:
  name: architecture
  description: Collaborative architectural decision-making workflow
  version: "1.0.0"
  type: stepped
  agent: architect

  steps:
    path: ./architecture-steps/
    pattern: step-{nn}-*.md

  variables:
    output_file: planning-artifacts/architecture.md
    input_required:
      - prd

  gates:
    after_steps: [1, 4, 7]

  template: ./templates/architecture-template.md
```

```
pennyfarthing-dist/workflows/architecture-steps/
├── step-01-init.md
├── step-02-context.md
├── step-03-constraints.md
├── step-04-patterns.md
├── step-05-components.md
├── step-06-interfaces.md
├── step-07-validation.md
└── step-08-complete.md
```

## Open Questions

1. **Should stepped workflows integrate with Jira?**
   - Could create Jira tasks for each step
   - Or track overall workflow as single Jira item

2. **How to handle step failures?**
   - Retry current step?
   - Allow skipping with warning?
   - Require manual intervention?

3. **Should steps be executable by subagents?**
   - Main agent orchestrates, Haiku executes mechanical steps
   - Could reduce context usage for long workflows

4. **Output document vs session file?**
   - BMAD writes to output document with frontmatter
   - Pennyfarthing uses session files
   - Could support both patterns

## References

- BMAD-METHOD: https://github.com/bmad-code-org/BMAD-METHOD
- BMAD Version: 6.0.0-alpha.23
- Analysis Date: 2026-01-19
- Brainstorm Session: 2026-01-19 (problem: extend workflow system for BMAD features)
