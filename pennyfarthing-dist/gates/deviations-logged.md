<gate name="deviations-logged" model="haiku">

<purpose>
Verify the agent logged their Design Deviations section in the session file before handoff.
TEA must have a `### TEA (test design)` subheading. Dev must have a `### Dev (implementation)` subheading.
Either explicit entries or an explicit "No deviations from spec." is valid — the section just can't be missing.

Used by: tea-exit (after red phase), dev-exit (after green phase).
</purpose>

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `AGENT` | Yes | `tea` or `dev` — determines which subheading to check |
| `SESSION_FILE` | Yes | Path to session file |
</arguments>

<pass>
Check that the session file contains the expected subheading with at least one entry.

**For AGENT=tea:** Look for `### TEA (test design)` followed by at least one `-` line.
**For AGENT=dev:** Look for `### Dev (implementation)` followed by at least one `-` line.

```bash
# Extract the relevant section
HEADING="### TEA (test design)"   # or "### Dev (implementation)"
CONTENT=$(sed -n "/${HEADING}/,/^###/p" "${SESSION_FILE}" | grep -c '^- ')
```

If CONTENT >= 1, return:

```yaml
GATE_RESULT:
  status: pass
  gate: deviations-logged
  message: "Design deviations documented by {AGENT}"
  checks:
    - name: deviations-section
      status: pass
      detail: "{CONTENT} deviation entries logged under {HEADING}"
```
</pass>

<fail>
If the subheading is missing or has no entries:

```yaml
GATE_RESULT:
  status: fail
  gate: deviations-logged
  message: "Design deviations not documented"
  checks:
    - name: deviations-section
      status: fail
      detail: "Missing '{HEADING}' section or no entries in Design Deviations"
  recovery:
    - "Add a '{HEADING}' subheading under '## Design Deviations' in the session file"
    - "Log each spec deviation, or write '- No deviations from spec.' if none"
```
</fail>

</gate>
