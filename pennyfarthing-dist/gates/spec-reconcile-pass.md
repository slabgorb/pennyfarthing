<gate name="spec-reconcile-pass" model="haiku">

<purpose>
Verify that the Architect has completed the spec-reconcile phase by writing the
`### Architect (reconcile)` subsection under `## Design Deviations` in the session file.

The gate is advisory on findings, blocking on structure: it passes when the subsection
exists with content (deviation entries or "No additional deviations found."), and fails
only when the subsection is absent or empty.

Used by: spec-reconcile phase (after review, before SM finish) in TDD workflow.
</purpose>

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `SESSION_FILE` | Yes | Path to session file |
</arguments>

<pass>
Run the Python validation function to check for the reconcile section:

```bash
# pf.* modules live in the pf CLI's OWN venv (uv-tool install), NOT the project
# .venv - derive the interpreter from the launcher shebang, never activate .venv.
PF_PY="$(sed -n '1s/^#!//p' "$(command -v pf)")"
"${PF_PY:?PF_PY not set - could not resolve the pf launcher interpreter}" - "${SESSION_FILE}" <<'PYEOF'
import json, sys
from pf.gates.spec_reconcile import validate_spec_reconcile
result = validate_spec_reconcile(sys.argv[1])
print(json.dumps(result, indent=2))
sys.exit(0 if result['success'] else 1)
PYEOF
```

If all checks pass, return:

```yaml
GATE_RESULT:
  status: pass
  gate: spec-reconcile-pass
  message: "Architect reconcile section present — spec reconciliation complete"
  checks:
    - name: reconcile-section
      status: pass
      detail: "### Architect (reconcile) subsection exists with content"
```
</pass>

<fail>
If the `### Architect (reconcile)` section is missing or empty:

```yaml
GATE_RESULT:
  status: fail
  gate: spec-reconcile-pass
  message: "Architect reconcile section required — run spec-reconcile phase"
  checks:
    - name: reconcile-section
      status: fail
      detail: "### Architect (reconcile) subsection is missing or empty"
  recovery:
    - "Run the spec-reconcile phase — the Architect must review all deviation entries"
    - "Write findings under '### Architect (reconcile)' in '## Design Deviations'"
    - "If no additional deviations found, write '- No additional deviations found.'"
```
</fail>

</gate>
