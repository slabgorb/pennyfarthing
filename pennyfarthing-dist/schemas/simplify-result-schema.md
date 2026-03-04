# SIMPLIFY_RESULT Schema

<info>
The SIMPLIFY_RESULT format is the structured YAML contract returned by every simplify teammate during TEA's verify phase. It enables TEA to reliably aggregate, interpret, and apply findings from parallel teammates (simplify-reuse, simplify-quality, simplify-efficiency).
</info>

## Schema

```yaml
SIMPLIFY_RESULT:
  agent: simplify-reuse | simplify-quality | simplify-efficiency
  status: clean | findings
  findings:
    - file: "path/to/file.ts"
      line: 42
      category: "duplicated-logic"
      description: "What was found"
      suggestion: "What to do about it"
      confidence: high | medium | low
```

## Field Definitions

| Field | Type | Required | Valid Values | Purpose |
|-------|------|----------|--------------|---------|
| `agent` | enum | Yes | `simplify-reuse`, `simplify-quality`, `simplify-efficiency` | Identifies which teammate generated this result |
| `status` | enum | Yes | `clean`, `findings` | Overall result — `clean` if no issues, `findings` if one or more findings present |
| `findings` | array | When status=findings | Array of finding objects | List of specific issues discovered |

### Finding Fields

| Field | Type | Required | Constraints | Purpose |
|-------|------|----------|-------------|---------|
| `file` | string | Yes | Relative path from repo root, forward slashes | File containing the issue |
| `line` | integer | Yes | ≥ 1 | Line number where issue starts |
| `category` | string | Yes | Teammate-specific enum (see below) | Category of the finding |
| `description` | string | Yes | Free text | Human-readable description of what was found |
| `suggestion` | string | Yes | Free text | Specific action to resolve the issue |
| `confidence` | enum | Yes | `high`, `medium`, `low` | Confidence level in finding correctness |

## Format Requirements

- **Machine-parseable:** YAML syntax must be valid and parseable by TEA's aggregation logic
- **Status consistency:** When `status: clean`, the `findings` array must be empty (`[]`) or absent
- **Line numbers:** Must be positive integers corresponding to actual source file lines
- **File paths:** Relative to repository root; use forward slashes even on Windows

## Category Values by Teammate

### simplify-reuse

| Category | Description |
|----------|-------------|
| `duplicated-logic` | Code that appears in multiple files with identical or near-identical logic |
| `extractable-helper` | Repeated pattern that could be extracted into a shared function |
| `shared-constant` | Constant values that should be defined once and reused |
| `shared-type` | Type definitions that could be shared across files |

### simplify-quality

| Category | Description |
|----------|-------------|
| `naming` | Variable, function, or class names that don't reflect intent |
| `dead-code` | Unreachable or unused code |
| `unclear-structure` | Function/class structure that makes intent hard to follow |
| `unnecessary-comment` | Comments that restate code instead of explaining why |
| `readability` | General readability improvements (line length, nesting, spacing) |

### simplify-efficiency

| Category | Description |
|----------|-------------|
| `over-engineering` | Unnecessary abstraction or generalization for a single use case |
| `unnecessary-complexity` | Complex approach when a simpler one suffices |
| `redundant-operation` | Repeated computation that could be cached or computed once |
| `premature-abstraction` | Abstraction added before it's actually needed |

## Confidence Level Semantics

TEA interprets confidence levels to determine how findings are handled:

| Level | TEA Action | Description |
|-------|------------|-------------|
| `high` | Auto-apply without manual review | Unambiguous, safe, clearly correct. TEA applies the suggestion directly. |
| `medium` | Review manually before applying | Likely correct but may have context-dependent nuance. TEA evaluates before acting. |
| `low` | Document but do not apply | Suggestion or observation, not a clear defect. TEA records in assessment but does not apply without explicit review. |

## Non-Finding Cases

When a teammate finds no issues, it returns a clean result:

```yaml
SIMPLIFY_RESULT:
  agent: simplify-reuse
  status: clean
  findings: []
```

TEA distinguishes between:
- **No findings** (`status: clean`, findings empty) — teammate completed analysis, code is clean for that dimension
- **No response** (no SIMPLIFY_RESULT returned) — teammate failed or timed out; TEA logs a warning

## Examples

### Example 1: Clean Report (No Findings)

```yaml
SIMPLIFY_RESULT:
  agent: simplify-reuse
  status: clean
  findings: []
```

### Example 2: Single High-Confidence Finding

```yaml
SIMPLIFY_RESULT:
  agent: simplify-quality
  status: findings
  findings:
    - file: "src/services/user-service.ts"
      line: 42
      category: naming
      description: "Variable 'x' does not indicate its purpose; appears to be a user configuration object"
      suggestion: "Rename 'x' to 'userConfig' to improve code clarity"
      confidence: high
```

### Example 3: Multiple Findings with Mixed Confidence

```yaml
SIMPLIFY_RESULT:
  agent: simplify-efficiency
  status: findings
  findings:
    - file: "src/utils/validators.ts"
      line: 12
      category: redundant-operation
      description: "The validation regex is compiled in every function call; should be defined once at module level"
      suggestion: "Extract regex to module-level constant and reuse in all functions"
      confidence: high
    - file: "src/components/form.tsx"
      line: 88
      category: over-engineering
      description: "Custom form state management layer wraps React Hook Form; adds unnecessary indirection"
      suggestion: "Consider using React Hook Form directly without the wrapper to reduce indirection"
      confidence: medium
    - file: "src/api/client.ts"
      line: 156
      category: unnecessary-complexity
      description: "Error retry logic uses exponential backoff with jitter; simple linear retry would suffice for this API"
      suggestion: "Simplify retry strategy from exponential backoff to linear backoff"
      confidence: low
```

## Consuming Agents

This format is produced and consumed by the following agent definitions:

| Agent | Role | Path |
|-------|------|------|
| simplify-reuse | Produces results (reuse dimension) | `pennyfarthing-dist/agents/simplify-reuse.md` |
| simplify-quality | Produces results (quality dimension) | `pennyfarthing-dist/agents/simplify-quality.md` |
| simplify-efficiency | Produces results (efficiency dimension) | `pennyfarthing-dist/agents/simplify-efficiency.md` |
| TEA | Aggregates and applies results | `pennyfarthing-dist/agents/tea.md` |

## Related

- [Epic Context](../../sprint/context/context-epic-138.md) — Simplify Integration overview and architecture
- [Fan-out/Fan-in Pattern](../patterns/fan-out-fan-in-pattern.md) — Parallel agent result aggregation
- [Gate Schema](gate-schema.md) — GATE_RESULT contract (analogous structured output)
- Story 138-4: TEA verify phase integration (consumes this schema)
- Story 138-6: TEA assessment template with simplify report section
