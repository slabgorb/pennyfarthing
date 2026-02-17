# Workflow Definition Schema

This guide defines the YAML schema for custom workflows in Pennyfarthing.

## Overview

Workflows define agent sequences for different work types. Instead of the hardcoded TDD flow (SM → TEA → Dev → Reviewer), you can create custom flows for documentation, debugging, devops, and more.

## File Location

Workflows are defined in `.claude/workflows/*.yaml`

## Schema

```yaml
workflow:
  name: string          # Required: unique identifier
  description: string   # Optional: human-readable purpose
  version: string       # Optional: semver for tracking changes

  phases:               # Required: at least one phase
    - name: string      # Required: phase identifier
      agent: string     # Required: agent to invoke (sm, tea, dev, reviewer, etc.)
      input: string[]   # Optional: what this phase receives
      output: string[]  # Optional: what this phase produces
      gate:             # Optional: conditions to proceed
        type: string    # Required if gate present: approval, tests_pass, tests_fail, manual
        condition: string  # Optional: additional condition description

  triggers:             # Optional: when to use this workflow
    tags: string[]      # Optional: story tags that match
    types: string[]     # Optional: story types (feature, bug, chore, docs)
    points:             # Optional: point-based routing
      min: number       # Optional: minimum points
      max: number       # Optional: maximum points
    default: boolean    # Optional: use as fallback workflow

  permissions:          # Optional: required permissions for this workflow
    - tool: string      # Required: tool name (Bash, Read, WebFetch, etc.)
      scope: string     # Required: scope pattern (e.g., "npm test", "*.github.com")
      reason: string    # Required: human-readable reason for the permission
```

## Required Fields

| Field | Description |
|-------|-------------|
| `workflow.name` | Unique identifier for the workflow |
| `workflow.phases` | Array with at least one phase |
| `phases[].name` | Identifier for the phase |
| `phases[].agent` | Agent to invoke (sm, tea, dev, reviewer, architect, pm, tech-writer, ux-designer, devops, ba) |

## Optional Fields

| Field | Description |
|-------|-------------|
| `workflow.description` | Human-readable purpose |
| `workflow.version` | Semver version string |
| `phases[].input` | Array of inputs from previous phases |
| `phases[].output` | Array of outputs for next phases |
| `phases[].gate` | Conditions to proceed to next phase |
| `workflow.triggers` | Rules for automatic workflow selection |
| `workflow.permissions` | Array of permission presets required by the workflow |

## Gate Types

| Type | Description |
|------|-------------|
| `tests_pass` | All tests must pass |
| `tests_fail` | Tests must be failing (RED phase) |
| `approval` | Requires reviewer approval |
| `manual` | Manual confirmation required |

## Permission Presets

Workflows can declare required permissions that are checked at workflow start. If any permissions are missing, the user is prompted to grant them before proceeding.

### Permission Fields

| Field | Required | Description |
|-------|----------|-------------|
| `tool` | Yes | Tool name: `Bash`, `Read`, `Write`, `Edit`, `WebFetch`, `WebSearch`, `Glob`, `Grep`, `Task` |
| `scope` | Yes | Scope pattern for the permission (e.g., `"npm test"`, `"*.github.com"`, `"src/**/*"`) |
| `reason` | Yes | Human-readable explanation shown when prompting user |

### Permission Checking

On workflow start:
1. System reads workflow's `permissions` array
2. Compares against cached grants in `.claude/settings.local.json`
3. For each missing permission, prompts user with the `reason`
4. Granted permissions are cached for the session

### Example: TDD Workflow with Permissions

```yaml
workflow:
  name: tdd-with-permissions
  description: TDD workflow with pre-declared permissions
  version: "1.0.0"

  permissions:
    - tool: Bash
      scope: "npm test|npm run build"
      reason: "TDD workflow requires running tests and builds"
    - tool: Read
      scope: "src/**/*"
      reason: "Need to read source files for implementation"

  phases:
    - name: setup
      agent: sm
    - name: red
      agent: tea
      gate:
        type: tests_fail
    - name: green
      agent: dev
      gate:
        type: tests_pass
    - name: review
      agent: reviewer
      gate:
        type: approval
    - name: finish
      agent: sm
```

## Examples

### TDD Workflow

The standard test-driven development flow:

```yaml
workflow:
  name: tdd
  description: Test-driven development with code review
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
      output: [session_file, branches]

    - name: red
      agent: tea
      input: [session_file]
      output: [failing_tests]
      gate:
        type: tests_fail

    - name: green
      agent: dev
      input: [failing_tests]
      output: [implementation, passing_tests]
      gate:
        type: tests_pass

    - name: review
      agent: reviewer
      input: [implementation]
      output: [approval]
      gate:
        type: approval

    - name: finish
      agent: sm
      input: [approval]
      output: [archived_session]

  triggers:
    types: [feature]
    default: true
```

### Trivial Workflow

For small fixes that skip TEA:

```yaml
workflow:
  name: trivial
  description: Quick fixes without full TDD ceremony
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
    - name: implement
      agent: dev
      gate:
        type: tests_pass
    - name: review
      agent: reviewer
      gate:
        type: approval
    - name: finish
      agent: sm

  triggers:
    types: [chore, fix]
    points:
      max: 2
```

### Documentation Workflow

For docs-only work:

```yaml
workflow:
  name: docs
  description: Documentation updates
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
    - name: write
      agent: tech-writer
      output: [documentation]
    - name: review
      agent: reviewer
      gate:
        type: approval
    - name: finish
      agent: sm

  triggers:
    types: [docs]
    tags: [documentation]
```

## Trigger Priority

When multiple workflows match a story, the routing engine uses this priority:

1. Explicit `workflow:` tag on story
2. Most specific trigger match (tags > types > points)
3. `default: true` workflow as fallback

## Validation

Workflows are validated at load time. Invalid workflows will report errors with field paths:

```
Error: workflow.phases[1].agent is required
Error: workflow.triggers.points min (10) cannot be greater than max (5)
```

## Related

- Story 31-2: Workflow loader and validator
- Story 31-3: Story-to-workflow routing engine
- Story 31-5: /pf-workflow skill for listing and switching
- Story MSSCI-11710: Permission presets by workflow
