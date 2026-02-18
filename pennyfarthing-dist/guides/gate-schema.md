# Gate File Schema

<info>
Gate files define quality checks that run at workflow phase boundaries. A gate file is a markdown document containing XML tags that instruct a subagent to evaluate pass/fail criteria before allowing a workflow to proceed.
</info>

## File Location

Gate files are discovered in this order (first match wins):

1. `.pennyfarthing/gates/{name}.md` — project-local override
2. `pennyfarthing-dist/gates/{name}.md` — built-in gates

## Schema

```xml
<gate name="gate-name" model="haiku">

<purpose>
What this gate checks and why it matters.
</purpose>

<pass>
Instructions for the subagent when all checks succeed.
Must include a GATE_RESULT YAML block with status: pass.
</pass>

<fail>
Instructions for the subagent when any check fails.
Must include a GATE_RESULT YAML block with status: fail.
Include recovery guidance so the agent knows how to fix the issue.
</fail>

</gate>
```

### Required Elements

| Element | Description |
|---------|-------------|
| `<gate name="...">` | Root element. `name` attribute is required, must be unique. |
| `<purpose>` | Describes what the gate checks. Helps agents understand context. |
| `<pass>` | Instructions when checks succeed. Must template a `GATE_RESULT` with `status: pass`. |
| `<fail>` | Instructions when checks fail. Must template a `GATE_RESULT` with `status: fail`. |

### Optional Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `model` | `haiku` | LLM model for the gate subagent. Use `haiku` for fast, cheap checks. |

### Nested Gates

Gates can contain nested `<gate>` elements for compound checks. Maximum nesting depth is **3 levels** (root = level 0).

```xml
<gate name="release-ready" model="haiku">
  <purpose>Verify release readiness</purpose>
  <pass>All release checks pass</pass>
  <fail>Release blocked</fail>

  <gate name="tests-pass" model="haiku">
    <purpose>All tests green</purpose>
    <pass>Tests passing</pass>
    <fail>Tests failing</fail>
  </gate>

  <gate name="lint-clean" model="haiku">
    <purpose>No lint errors</purpose>
    <pass>Lint clean</pass>
    <fail>Lint errors found</fail>
  </gate>
</gate>
```

**Rules for nesting:**
- Maximum depth: 3 (root at depth 0, deepest child at depth 3)
- Gate names must be unique within the file — no duplicates, no cycles
- Sibling gates at the same depth may share a parent but not a name

## GATE_RESULT Contract

Gate subagents must return a `GATE_RESULT` YAML block. The runtime uses default-deny: if no parseable result is found, the gate fails.

```yaml
GATE_RESULT:
  status: pass | fail
  gate: "gate-name"
  message: "Human-readable summary"
  checks:
    - name: check-name
      status: pass | fail
      detail: "What was checked and the outcome"
  recovery:                    # Only on fail
    - "Step to fix issue 1"
    - "Step to fix issue 2"
```

| Field | Required | Description |
|-------|----------|-------------|
| `status` | Yes | `pass` or `fail` — strict enum, no other values |
| `gate` | No | Gate name (for traceability) |
| `message` | Yes | One-line summary of the result |
| `checks` | No | Array of individual check results |
| `recovery` | No | Array of fix instructions (fail only) |

## Working Example

Here is a complete gate file that checks whether documentation exists for new exports:

```xml
<gate name="docs-check" model="haiku">

<purpose>
Verify that all new public exports have corresponding documentation.
Runs after the Dev phase to catch undocumented APIs before review.
</purpose>

<pass>
Check the git diff for new export statements. For each new export,
verify a matching entry exists in the relevant guide or README.

If all exports are documented, return:

GATE_RESULT:
  status: pass
  gate: docs-check
  message: "All new exports documented"
  checks:
    - name: export-coverage
      status: pass
      detail: "{N} new exports, all documented"
</pass>

<fail>
If any new export lacks documentation, list the gaps:

GATE_RESULT:
  status: fail
  gate: docs-check
  message: "Undocumented exports found"
  checks:
    - name: export-coverage
      status: fail
      detail: "{N} exports missing documentation"
  recovery:
    - "Add documentation for: {list of undocumented exports}"
    - "Update the relevant guide in pennyfarthing-dist/guides/"
</fail>

</gate>
```

## Workflow Integration

Gates are referenced in workflow YAML files via the `gate.file` field:

```yaml
workflow:
  name: my-workflow
  phases:
    - name: implement
      agent: dev
      gate:
        file: gates/tests-pass    # References pennyfarthing-dist/gates/tests-pass.md
        condition: All tests passing
```

The `gate.file` value is resolved by the gate file discovery algorithm (project-local first, built-in fallback).

### Built-in Gate Types vs File Gates

| Approach | When to Use |
|----------|-------------|
| `gate.type` (built-in) | Standard checks: `tests_pass`, `tests_fail`, `approval`, `manual` |
| `gate.file` (file-based) | Custom checks with specific pass/fail logic |
| Both | File-based gate with type for fallback categorization |

## Validation

Validate gate files before use:

```bash
pf.sh gate validate path/to/gate-file.md
```

The validator checks:
- **Schema:** `<gate>` tag with `name` attribute, `<purpose>`, `<pass>`, `<fail>` present and non-empty
- **Depth:** Nesting does not exceed 3 levels
- **Cycles:** No duplicate gate names (which would indicate cycles in nested structures)
- **Completeness:** Every gate (including nested) has all required elements

All errors are reported at once — fix everything in a single pass.

On success, the validator prints a structure summary:

```
Gate 'tests-pass' is valid
  Model: haiku
  Depth: 0 (no nesting)
  Children: 0
```

## Best Practices

1. **Keep gates focused.** One gate = one quality dimension. Use nesting for compound checks, not unrelated concerns.

2. **Write actionable fail instructions.** The `<fail>` block should tell the agent exactly how to diagnose and fix the issue. Include specific commands to run and files to check.

3. **Template the GATE_RESULT.** Include the exact YAML structure in both `<pass>` and `<fail>` blocks so the subagent knows the expected output format.

4. **Use `haiku` for speed.** Gate checks should be fast and cheap. Only use a larger model if the gate requires deep reasoning.

5. **Include checks for traceability.** The `checks` array in GATE_RESULT lets the calling agent see exactly what passed or failed without re-running the gate.

6. **Add recovery steps.** The `recovery` array in failed results gives the agent a clear path to fix issues and retry.

7. **Test with the validator.** Run `pf.sh gate validate` on your gate file before referencing it in a workflow.

## Related

- [Workflow Schema](workflow-schema.md) — How gates are referenced in workflow definitions
- [Approval Gates Pattern](patterns/approval-gates-pattern.md) — Pattern for approval-style gates
- Story 106-2: Gate subagent runner with GATE_RESULT contract
- Story 106-4: Gate file discovery and resolution
- Story 107-1: Gate schema validation at parse time
- Story 107-2: Acyclic validation and depth limit enforcement
