# BikeLane: Pennyfarthing Workflow System

BikeLane is Pennyfarthing's comprehensive workflow orchestration system. It provides a unified framework for coordinating agent activities across three distinct workflow types: phased, stepped, and procedural. Each workflow type serves different development needs while sharing common infrastructure for state tracking, variable resolution, and agent coordination.

## Overview

BikeLane workflows enable:
- Structured agent collaboration through defined phases or steps
- Progressive disclosure of context for complex planning processes
- Flexible procedural guidance for exploratory tasks
- Session-based state tracking for cross-session resumability
- Dynamic variable resolution from multiple sources
- User gates for quality control at critical decision points

## Workflow Types

BikeLane supports three workflow types, each optimized for different collaboration patterns:

### Phased Workflows

Agent-driven development cycles with automatic handoffs between agents. These workflows move through predefined phases with agents taking turns to accomplish specific objectives.

**Characteristics:**
- Automatic phase transitions
- Agent-to-agent handoffs
- Clear role boundaries
- State-driven execution

**Use Cases:**
- Development cycles (TDD, BDD)
- Quick fixes without ceremony
- Documentation updates

**Available Workflows:**
- `tdd` - Test-driven development with code review
- `bdd` - Behavior-driven development with UX design phase
- `trivial` - Quick fixes without full TDD ceremony
- `agent-docs` - Agent file and process documentation updates

### Stepped Workflows

Progressive disclosure workflows that execute one step at a time with explicit user gates for quality control. Inspired by BMAD methodology, these workflows break complex planning and decision-making processes into manageable increments.

**Characteristics:**
- One step loaded at a time (reduced context)
- User approval gates at decision points
- Tri-modal support (create/validate/edit)
- Progressive artifact building
- BMAD 6.0 compatible

**Use Cases:**
- Architecture decisions
- Product planning
- Research and discovery
- Sprint planning
- Requirements definition

**Available Workflows:**
- `prd` - Product requirements documentation (tri-modal: create/validate/edit)
- `architecture` - Architectural decision-making with progressive disclosure
- `research` - Research and discovery (tri-modal: market/domain/technical)
- `sprint-planning` - Sprint planning session facilitation
- `epics-and-stories` - Epic and story breakdown
- `product-brief` - Product brief creation
- `project-context` - Project context documentation
- `implementation-readiness` - Implementation readiness assessment
- `ux-design` - User experience design
- `quick-dev` - Quick development planning

### Procedural Workflows

Flexible agent-guided processes without strict step sequences. These workflows provide structure and best practices while allowing agents to adapt their approach to the specific situation.

**Characteristics:**
- No fixed step sequence
- Checklist-based guidance
- Agent discretion on execution order
- Exploratory and adaptive

**Use Cases:**
- Brainstorming sessions
- Code reviews
- Retrospectives

**Available Workflows:**
- `brainstorming` - Structured problem-solving brainstorm session
- `code-review` - Code review checklists and patterns
- `retrospective` - Sprint retrospective facilitation

## Quick Start

```bash
# List all workflows (shows type indicators)
/workflow list

# Start a phased workflow (automatic execution)
/workflow start tdd

# Start a stepped workflow (progressive steps)
/workflow start architecture

# Start in a specific mode
/workflow start prd --mode validate

# Start a procedural workflow (guided execution)
/workflow start brainstorming

# Resume an interrupted workflow
/workflow resume

# Check current workflow progress
/workflow status
```

## Stepped Workflow Deep Dive

Stepped workflows are BikeLane's most sophisticated workflow type, enabling BMAD-style progressive disclosure for complex processes.

### Creating a Stepped Workflow

#### 1. Workflow YAML Definition

Create a YAML file in `pennyfarthing-dist/workflows/`:

```yaml
# pennyfarthing-dist/workflows/my-workflow.yaml
workflow:
  name: my-workflow
  description: Description of what this workflow accomplishes
  version: "1.0.0"
  type: stepped                    # Enables stepped execution

  # Step configuration
  steps:
    path: ./my-workflow/steps/     # Directory containing step files
    pattern: step-{nn}-*.md        # Naming pattern (nn = zero-padded number)

  # Variables available in step files
  variables:
    output_file: planning-artifacts/output.md
    input_required:
      - prd                        # Prerequisites

  # User approval gates
  gates:
    after_steps: [2, 4, 6]         # Pause after these step numbers
    gate_marker: "<!-- GATE -->"   # Or detect from step file content

  # Output template (optional)
  template: ./my-workflow/templates/output.md

  # Agent assignment
  agent: architect                 # Which agent runs this workflow

  # Triggers - when to suggest this workflow
  triggers:
    types: [architecture, design]
    tags: [my-workflow, stepped]
```

#### 2. Step Files

Create markdown files following the `step-{nn}-name.md` pattern:

```markdown
# Step 1: Initialize

<step-meta>
number: 1
name: initialize
gate: false
</step-meta>

## Purpose

Brief description of what this step accomplishes.

## Instructions

1. First action to take
2. Second action to take
3. Third action to take

## Actions

- Read: `{planning_artifacts}/*.md`
- Grep: Search for relevant patterns
- Write: Update session file

## Output

Add to session file:

\`\`\`markdown
## Step 1 Output

[Expected output structure]
\`\`\`

## Next Step

Brief note about what comes next.
```

#### 3. Gate Steps

For steps requiring user approval, add `gate: true` to the meta block and include a gate prompt:

```markdown
# Step 3: Decision Point

<step-meta>
number: 3
name: decision-point
gate: true
</step-meta>

## Purpose

[Step content...]

<!-- GATE -->

## Gate: Confirm Decision

Before proceeding, confirm the analysis is complete:

- **[C] Continue** - Proceed to next step
- **[R] Revise** - Need to gather more information
```

#### 4. Output Template (Optional)

Create a template for the final output document:

```markdown
# {document_title}

**Status:** Proposed
**Date:** {date}
**Author:** {agent} ({persona})
**Story:** {story_id}

## Context

{context_summary}

## Decision

{decision_content}

## Consequences

{consequences}

---

*Generated by Pennyfarthing {workflow_name} workflow*
```

### Tri-Modal Support

Stepped workflows can support multiple execution modes for flexible artifact management. This is particularly useful for workflows that need to create, validate, or edit artifacts.

#### Standard Tri-Modal Pattern

The classic BMAD pattern with create, validate, and edit modes:

```yaml
workflow:
  # ...
  modes:
    default: create              # Default mode if not specified
    create: ./steps-c/           # Create new artifacts
    validate: ./steps-v/         # Validate existing artifacts
    edit: ./steps-e/             # Edit/update artifacts
```

#### Custom Mode Names

Pennyfarthing extends BMAD by supporting custom mode names for domain-specific workflows:

```yaml
workflow:
  # ...
  modes:
    default: market
    market: ./steps-market/      # Market research
    domain: ./steps-domain/      # Domain analysis
    technical: ./steps-technical/ # Technical feasibility
```

#### Starting in Different Modes

```bash
# Start in default mode
/workflow start architecture

# Start in validate mode
/workflow start prd --mode validate

# Start in edit mode
/workflow start prd --mode edit

# Start in custom mode
/workflow start research --mode domain
```

#### Mode Behavior

| Mode Type | Purpose | Step Directory Pattern |
|-----------|---------|------------------------|
| **Create** | Generate new artifacts from scratch | `./steps/` or `./steps-c/` |
| **Validate** | Check existing artifacts against criteria | `./steps-v/` |
| **Edit** | Update or revise existing artifacts | `./steps-e/` |
| **Custom** | Domain-specific execution paths | `./steps-{mode}/` |

### Gate Detection

Gates can be detected from three sources (in priority order):

1. **Workflow YAML**: `gates.after_steps: [2, 4, 6]`
2. **Step Meta**: `gate: true` in `<step-meta>` block
3. **Content Marker**: `<!-- GATE -->` in step content

When a gate is detected:
1. The gate prompt is displayed to the user
2. Execution pauses waiting for user input
3. User selects [C]ontinue or [R]evise
4. Decision is recorded in the session file
5. Execution continues or repeats based on choice

### Variable Resolution

Variables in step files (`{variable_name}`) are resolved from multiple sources in priority order:

| Priority | Source | Example Variables |
|----------|--------|-------------------|
| 1 | Workflow YAML `variables:` | `output_file`, `input_required` |
| 2 | Session file | `story_id`, `workflow_mode`, `current_step` |
| 3 | `.pennyfarthing/config.local.yaml` | `user_name`, `theme` |
| 4 | Environment/system | `project_root`, `date` |
| 5 | Defaults | `planning_artifacts: planning-artifacts/` |

#### Standard Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `{project_root}` | Project root directory | `$PWD` |
| `{project_name}` | Project name | Directory name |
| `{user_name}` | User's name | From config |
| `{date}` | Current date | ISO format |
| `{planning_artifacts}` | Planning output directory | `planning-artifacts/` |
| `{session_file}` | Current session file path | Auto-detected |
| `{current_step}` | Current step number | From session |
| `{workflow_mode}` | Current mode | From session |

### Session State Tracking

Stepped workflow progress is tracked in the session file:

```markdown
## Workflow State

- **Workflow:** architecture
- **Type:** stepped
- **Mode:** create
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Started:** 2026-01-21T10:30:00Z
- **Last Updated:** 2026-01-21T11:45:00Z

## Step 1: Initialization
[Output from step 1]

## Step 2: Context Analysis
[Output from step 2]

## Step 3: Pattern Selection
[In progress...]
```

## BMAD 6.0 Compatibility

Pennyfarthing provides full import support for BMAD workflows with automatic conversion of syntax and structure.

### Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| Stepped workflows | Full | Core workflow type |
| Procedural workflows | Full | Flexible guidance workflows |
| Tri-modal (create/validate/edit) | Full | Standard BMAD pattern |
| Custom mode names | Extended | Pennyfarthing enhancement |
| Variable resolution | Full | Auto-converts hyphens to underscores |
| Gate configuration | Full | Multiple detection methods |
| Step file format | Compatible | Converts to frontmatter |

### Migration Script

Import BMAD workflows automatically:

```bash
node pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs \
  --source ~/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/prd \
  --target pennyfarthing-dist/workflows/prd
```

The migration script:
- Converts `{var-name}` to `{var_name}` (hyphen to underscore)
- Transforms `<step-meta>` tags to YAML frontmatter
- Preserves mode directories and gate configuration
- Validates step file naming and references

### Key Differences from BMAD

| Aspect | BMAD | Pennyfarthing |
|--------|------|---------------|
| Variable syntax | `{var-name}` | `{var_name}` (auto-converted) |
| Step metadata | `<step-meta>` XML tags | YAML frontmatter |
| Custom modes | Not supported | Fully supported |

### Imported BMAD Workflows

The following BMAD workflows are included:

| Workflow | Type | Modes | Description |
|----------|------|-------|-------------|
| prd | stepped | create/validate/edit | Product requirements documentation |
| product-brief | stepped | single | Product brief creation |
| research | stepped | market/domain/technical | Research and discovery |
| epics-and-stories | stepped | single | Epic and story breakdown |
| implementation-readiness | stepped | single | Implementation readiness assessment |
| ux-design | stepped | single | User experience design |
| sprint-planning | stepped | single | Sprint planning facilitation |
| retrospective | procedural | - | Sprint retrospective |
| project-context | stepped | single | Project context documentation |

See [docs/bmad-compatibility-matrix.md](/Users/keithavery/Projects/pennyfarthing-2/docs/bmad-compatibility-matrix.md) for complete compatibility details.

## Schema Reference

### Workflow YAML Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Workflow identifier |
| `description` | string | Yes | Human-readable description |
| `version` | string | Yes | Semantic version |
| `type` | `stepped` \| `phased` \| `procedural` | Yes | Workflow type |
| `steps.path` | string | Stepped only | Directory containing step files |
| `steps.pattern` | string | Stepped only | File naming pattern |
| `variables` | object | No | Variables available in steps |
| `modes` | object | No | Mode-to-directory mapping |
| `gates.after_steps` | number[] | No | Step numbers requiring approval |
| `gates.gate_marker` | string | No | Marker for inline gates |
| `template` | string | No | Output template path |
| `agent` | string | Yes | Agent to execute workflow |
| `triggers.types` | string[] | No | Story types that trigger this workflow |
| `triggers.tags` | string[] | No | Tags that trigger this workflow |

### Step Meta Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | number | Yes | Step sequence number |
| `name` | string | Yes | Step identifier (kebab-case) |
| `gate` | boolean | No | Whether step requires user approval |

## Example: Architecture Workflow

The architecture workflow demonstrates a complete stepped workflow implementation:

```
pennyfarthing-dist/workflows/
├── architecture.yaml
└── architecture/
    ├── steps/
    │   ├── step-01-initialize.md
    │   ├── step-02-context.md      (gate)
    │   ├── step-03-patterns.md
    │   ├── step-04-components.md   (gate)
    │   ├── step-05-interfaces.md
    │   ├── step-06-risks.md        (gate)
    │   └── step-07-document.md
    └── templates/
        └── architecture-decision.md
```

### Flow Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Initialize │───▶│   Context   │───▶│  Patterns   │
│   Step 1    │    │   Step 2    │    │   Step 3    │
└─────────────┘    └──────┬──────┘    └─────────────┘
                         │                   │
                      [GATE]                 │
                         │                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Document   │◀───│    Risks    │◀───│ Components  │
│   Step 7    │    │   Step 6    │    │   Step 4    │
└─────────────┘    └──────┬──────┘    └──────┬──────┘
                         │                   │
                      [GATE]              [GATE]
                         │                   │
                         │            ┌──────┴──────┐
                         └────────────│ Interfaces  │
                                      │   Step 5    │
                                      └─────────────┘
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `/workflow list` | List all workflows with type indicators |
| `/workflow show [name]` | Show workflow details |
| `/workflow start <name>` | Start a workflow |
| `/workflow start <name> --mode <mode>` | Start in specific mode |
| `/workflow resume` | Resume interrupted workflow |
| `/workflow resume <name>` | Resume specific workflow |
| `/workflow status` | Show current workflow progress |

## Best Practices

### Stepped Workflow Design

#### Step Design

1. **Single Responsibility**: Each step should accomplish one clear objective
2. **Clear Actions**: List specific files to read, patterns to search, outputs to produce
3. **Meaningful Gates**: Place gates at decision points, not after every step
4. **Progressive Output**: Each step builds on previous step's output

#### Gate Placement

Place gates after steps that:
- Make significant decisions that affect subsequent steps
- Require user validation of analysis or findings
- Complete major workflow phases
- Produce artifacts that need review before proceeding

#### Variable Usage

- Define workflow-specific variables in the YAML `variables:` section
- Use standard variables for common values (`{date}`, `{project_name}`)
- Document required inputs in `input_required` array
- Provide sensible defaults where possible

### Phased Workflow Design

1. **Clear Phase Boundaries**: Each phase should have distinct entry and exit criteria
2. **Agent Specialization**: Assign agents with appropriate skills to each phase
3. **Handoff Protocol**: Define what information passes between phases
4. **State Detection**: Ensure agents can detect current phase from session files

### Procedural Workflow Design

1. **Comprehensive Checklists**: Provide thorough guidance while allowing flexibility
2. **Clear Objectives**: Define what success looks like
3. **Best Practices**: Include patterns, anti-patterns, and gotchas
4. **Tool Suggestions**: Recommend specific tools or commands for common tasks

## Complete Workflow Inventory

### Phased Workflows (4)

| Workflow | Description | Primary Agents |
|----------|-------------|----------------|
| `tdd` | Test-driven development with code review | TEA, Dev, Reviewer |
| `bdd` | Behavior-driven development with UX design phase | UX, TEA, Dev, Reviewer |
| `trivial` | Quick fixes without full TDD ceremony | Dev, Reviewer |
| `agent-docs` | Agent file and process documentation updates | Tech Writer |

### Stepped Workflows (10)

| Workflow | Description | Modes | Agent |
|----------|-------------|-------|-------|
| `prd` | Product requirements documentation | create/validate/edit | PM |
| `architecture` | Architectural decision-making | single | Architect |
| `research` | Research and discovery | market/domain/technical | PM |
| `sprint-planning` | Sprint planning session | single | SM |
| `epics-and-stories` | Epic and story breakdown | single | PM |
| `product-brief` | Product brief creation | single | PM |
| `project-context` | Project context documentation | single | Tech Writer |
| `implementation-readiness` | Implementation readiness assessment | single | Architect |
| `ux-design` | User experience design | single | UX Designer |
| `quick-dev` | Quick development planning | single | Dev |

### Procedural Workflows (3)

| Workflow | Description | Agent |
|----------|-------------|-------|
| `brainstorming` | Structured problem-solving brainstorm | PM |
| `code-review` | Code review checklists and patterns | Reviewer |
| `retrospective` | Sprint retrospective facilitation | SM |

## Troubleshooting

### Workflow Not Found

```
Error: Workflow 'my-workflow' not found
```

**Solution**: Ensure workflow YAML exists in `pennyfarthing-dist/workflows/` and has valid syntax.

### Step Files Not Loading

```
Error: No step files found matching pattern
```

**Solution**: Verify `steps.path` and `steps.pattern` in workflow YAML match actual file locations.

### Variable Not Resolved

```
Warning: Unresolved variable {my_var}
```

**Solution**: Define the variable in workflow YAML `variables:` section or check spelling.

### Gate Not Detected

**Possible causes**:
1. Step number not in `gates.after_steps`
2. `gate: false` or missing in `<step-meta>`
3. `<!-- GATE -->` marker missing from content

### Mode Not Found

```
Error: Mode 'custom-mode' not configured
```

**Solution**: Add mode to `modes:` section in workflow YAML with appropriate directory path.

## Related Documentation

- [docs/bmad-compatibility-matrix.md](/Users/keithavery/Projects/pennyfarthing-2/docs/bmad-compatibility-matrix.md) - BMAD import compatibility
- [Workflow Skill](/workflow) - Command reference
- [Architecture Workflow Example](/Users/keithavery/Projects/pennyfarthing-2/pennyfarthing-dist/workflows/architecture.yaml) - Reference implementation
- [ADR-0006: State Detection Pattern](/Users/keithavery/Projects/pennyfarthing-2/docs/adr/0006-state-detection-pattern.md) - Workflow state management
