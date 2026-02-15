<gate name="approval" model="haiku">

<purpose>
Verify the reviewer has issued an explicit verdict on the code review.
This gate runs after the Reviewer agent's review phase to confirm
the code has been formally approved or rejected before proceeding.
</purpose>

<pass>
Check the session file for a Reviewer Assessment section:

1. **Find verdict:** Look for `## Reviewer Assessment` section in the session file.
   - Search for an explicit APPROVED verdict
   - The verdict must be unambiguous — not "looks good" but "APPROVED"

2. **Verify completeness:** The assessment should include:
   - A clear verdict (APPROVED)
   - Summary of what was reviewed

If the review is APPROVED, return:

```yaml
GATE_RESULT:
  status: pass
  gate: approval
  message: "Code review APPROVED by reviewer"
  checks:
    - name: reviewer-verdict
      status: pass
      detail: "Explicit APPROVED verdict found in Reviewer Assessment"
```
</pass>

<fail>
If the review is not approved, diagnose and report:

1. **REJECTED verdict:** The reviewer found issues that need addressing.
   - Extract the specific findings from the Reviewer Assessment
   - List each finding with its severity
   - These must be addressed before the gate can pass

2. **No verdict found:** The reviewer hasn't completed the review yet.
   - The Reviewer Assessment section is missing or incomplete
   - The reviewer needs to complete their review

Return with actionable recovery guidance:

```yaml
GATE_RESULT:
  status: fail
  gate: approval
  message: "Gate failed: {REJECTED with findings | No verdict found}"
  checks:
    - name: reviewer-verdict
      status: fail
      detail: "{REJECTED: list findings | Missing: no assessment found}"
  recovery:
    - "Address reviewer findings: {finding1}, {finding2}"
    - "Request re-review after fixes are applied"
```
</fail>

</gate>
