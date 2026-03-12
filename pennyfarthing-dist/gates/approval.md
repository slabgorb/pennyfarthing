<gate name="approval" model="haiku">

<purpose>
Verify the reviewer has issued an explicit verdict on the code review
AND that all specialist subagents were consulted during the review.
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

3. **Verify subagent dispatch** (see nested gate below)

If the review is APPROVED and all subagates pass, return:

```yaml
GATE_RESULT:
  status: pass
  gate: approval
  message: "Code review APPROVED by reviewer, all specialist subagents consulted"
  checks:
    - name: reviewer-verdict
      status: pass
      detail: "Explicit APPROVED verdict found in Reviewer Assessment"
    - name: subagent-dispatch
      status: pass
      detail: "All 7 specialist tags found in assessment"
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

3. **Missing subagent tags:** The reviewer skipped specialist subagents.
   - See nested gate failure for details on which tags are missing

Return with actionable recovery guidance:

```yaml
GATE_RESULT:
  status: fail
  gate: approval
  message: "Gate failed: {reason}"
  checks:
    - name: reviewer-verdict
      status: pass | fail
      detail: "{verdict status}"
    - name: subagent-dispatch
      status: pass | fail
      detail: "{tag coverage status}"
  recovery:
    - "Address reviewer findings: {finding1}, {finding2}"
    - "Re-run review with all specialist subagents"
```
</fail>

<gate name="subagent-dispatch" model="haiku">

<purpose>
Verify the Reviewer ran all 7 specialist subagents during the review.
The Reviewer Assessment must contain tagged findings or explicit dismissals
from each specialist category. This prevents rubber-stamp reviews that skip
the parallel analysis pipeline.
</purpose>

<pass>
Search the Reviewer Assessment section in the session file for these 7 tags.
Each tag must appear at least once — either as a confirmed finding or an
explicit dismissal (e.g., "[SEC] No security concerns" counts).

**Required tags:**
- `[EDGE]` — edge-hunter (boundary conditions)
- `[SILENT]` — silent-failure-hunter (swallowed errors)
- `[TEST]` — test-analyzer (test quality)
- `[DOC]` — comment-analyzer (documentation)
- `[TYPE]` — type-design (type invariants)
- `[SEC]` — security (vulnerabilities)
- `[SIMPLE]` — simplifier (unnecessary complexity)

If all 7 tags are present, return:

```yaml
GATE_RESULT:
  status: pass
  gate: subagent-dispatch
  message: "All 7 specialist subagent categories represented in assessment"
  checks:
    - name: tag-coverage
      status: pass
      detail: "Found: [EDGE], [SILENT], [TEST], [DOC], [TYPE], [SEC], [SIMPLE]"
```
</pass>

<fail>
If any tags are missing, the reviewer skipped specialist subagents.
List which tags are present and which are missing.

```yaml
GATE_RESULT:
  status: fail
  gate: subagent-dispatch
  message: "Missing specialist subagent tags: {missing_list}"
  checks:
    - name: tag-coverage
      status: fail
      detail: "Found: {present_list}. Missing: {missing_list}"
  recovery:
    - "Re-run the review phase with all 8 subagents spawned in parallel"
    - "Each specialist must be represented in the assessment with its tag"
    - "Tags: [EDGE], [SILENT], [TEST], [DOC], [TYPE], [SEC], [SIMPLE]"
```
</fail>

</gate>

</gate>
