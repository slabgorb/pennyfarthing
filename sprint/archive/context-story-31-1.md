# Story 31-1: Workflow Definition Schema - Technical Context

## Story Overview
- **Epic:** 31 - Customizable Workflow Engine
- **Points:** 3
- **Priority:** P0
- **Repos:** pennyfarthing

## Objective

Define the YAML schema for workflow definitions. This is the foundation - all other Epic 31 stories build on this schema.

## Current State

No workflow schema exists. The TDD flow is hardcoded in `sm.md`:
```
SM → TEA → Dev → Reviewer → SM
```

Scale routing is inline logic:
```
if points <= 2: skip TEA
```

## Technical Approach

### Schema Structure

```yaml
# .claude/workflows/example.yaml
workflow:
  name: string          # unique identifier
  description: string   # human-readable purpose
  version: string       # semver for tracking changes

  phases:
    - name: string      # phase identifier
      agent: string     # agent to invoke (sm, tea, dev, reviewer, etc.)
      input: string[]   # what this phase receives (optional)
      output: string[]  # what this phase produces (optional)
      gate:             # conditions to proceed (optional)
        type: string    # approval | tests_pass | manual
        condition: string

  triggers:             # when to use this workflow (optional)
    tags: string[]      # story tags that match
    types: string[]     # story types (feature, bug, chore, docs)
    points:             # point-based routing
      min: number
      max: number
    default: boolean    # use as fallback workflow
```

### Required vs Optional Fields

**Required:**
- `workflow.name`
- `workflow.phases` (at least one)
- `phases[].name`
- `phases[].agent`

**Optional:**
- `workflow.description`
- `workflow.version`
- `phases[].input`, `phases[].output`
- `phases[].gate`
- `workflow.triggers` (entire section)

### Example: TDD Workflow

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

### Example: Trivial Workflow (skip TEA)

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

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `pennyfarthing-dist/guides/workflow-schema.md` | CREATE | Schema documentation |
| `pennyfarthing-dist/workflows/tdd.yaml` | CREATE | Example TDD workflow |
| `pennyfarthing-dist/workflows/trivial.yaml` | CREATE | Example trivial workflow |

## Acceptance Criteria

- [ ] Schema documented in `pennyfarthing-dist/guides/workflow-schema.md`
- [ ] Supports workflow name, description, version
- [ ] Supports phase definitions with agent, input, output, gate
- [ ] Supports trigger rules (tags, type, points)
- [ ] Example workflows validate against schema

## Testing Strategy

TEA should write tests that:
1. Validate a well-formed workflow YAML
2. Reject workflows missing required fields (name, phases, agent)
3. Accept workflows with optional fields omitted
4. Validate trigger rules syntax
5. Ensure phase order is preserved

## Dependencies

- None - this is the foundation story

## Notes for TEA

Focus on schema validation tests, not loader implementation. The tests should:
- Define what a valid workflow looks like
- Define what errors to throw for invalid workflows
- Be implementation-agnostic (test the contract, not the code)

The loader (31-2) will implement the actual parsing and validation.
