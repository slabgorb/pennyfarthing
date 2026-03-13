<gate name="approval" model="haiku">

<purpose>
Verify the reviewer has issued an explicit verdict on the code review
AND that all specialist subagents were dispatched, received, assessed,
and their results documented with clear decisions. This gate runs after
the Reviewer agent's review phase to confirm the code has been formally
approved or rejected before proceeding.
</purpose>

<pass>
Check the session file for a Reviewer Assessment section AND a complete Subagent Results table:

1. **Find verdict:** Look for `## Reviewer Assessment` section in the session file.
   - Search for an explicit APPROVED verdict
   - The verdict must be unambiguous — not "looks good" but "APPROVED"

2. **Verify completeness:** The assessment should include:
   - A clear verdict (APPROVED)
   - Summary of what was reviewed

3. **Verify subagent completion** (see nested gate below) — ALL subagents must be received and assessed

4. **Verify subagent dispatch tags** (see nested gate below) — ALL 7 specialist tags present

If the review is APPROVED and all subgates pass, return:

```yaml
GATE_RESULT:
  status: pass
  gate: approval
  message: "Code review APPROVED by reviewer, all specialist subagents received and assessed"
  checks:
    - name: reviewer-verdict
      status: pass
      detail: "Explicit APPROVED verdict found in Reviewer Assessment"
    - name: subagent-completion
      status: pass
      detail: "All 8 subagents received with decisions documented"
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

3. **Incomplete subagent results:** The reviewer did not wait for all subagents.
   - See nested gate failure for details on which subagents are missing
   - The reviewer MUST wait for all subagents — context pressure is not an excuse

4. **Missing subagent tags:** The reviewer skipped specialist subagents.
   - See nested gate failure for details on which tags are missing

5. **Missing decisions:** Subagent findings exist but no confirm/dismiss/defer decision.
   - Every finding from every subagent must have a documented decision
   - "Skipped because context was high" is NOT a valid decision

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
    - name: subagent-completion
      status: pass | fail
      detail: "{completion status — which subagents missing}"
    - name: subagent-dispatch
      status: pass | fail
      detail: "{tag coverage status}"
  recovery:
    - "Address reviewer findings: {finding1}, {finding2}"
    - "Complete the Subagent Results table — all 8 rows must show Received: Yes"
    - "Document decisions for all findings — confirmed, dismissed (with rationale), or deferred"
    - "Re-run review with all specialist subagents"
```
</fail>

<gate name="subagent-completion" model="haiku">

<purpose>
Verify the Reviewer waited for ALL 8 subagents to return before writing the assessment.
The session file must contain a `## Subagent Results` table with all 8 rows filled,
each showing `Received: Yes` (or an explicit error notation), and every finding having
a documented decision. This prevents rushed reviews where the reviewer skips subagent
results due to context pressure or impatience.
</purpose>

<pass>
Search the session file for a `## Subagent Results` section containing:

1. **A table with 8 rows** — one for each specialist subagent
2. **Every row shows `Yes` in the Received column** (or explicit error/timeout notation)
3. **Every row has a Decision** — `confirmed N, dismissed N, deferred N` or `N/A` for clean results
4. **An `All received: Yes` line** after the table

**Required subagents (8):**
- `reviewer-preflight`
- `reviewer-edge-hunter`
- `reviewer-silent-failure-hunter`
- `reviewer-test-analyzer`
- `reviewer-comment-analyzer`
- `reviewer-type-design`
- `reviewer-security`
- `reviewer-simplifier`

If all 8 are received and decisions are documented, return:

```yaml
GATE_RESULT:
  status: pass
  gate: subagent-completion
  message: "All 8 subagents received and assessed with documented decisions"
  checks:
    - name: all-received
      status: pass
      detail: "8/8 subagents returned results"
    - name: all-decided
      status: pass
      detail: "Every finding has a confirm/dismiss/defer decision"
```
</pass>

<fail>
If the Subagent Results table is missing, incomplete, or has gaps:

1. **No table:** The reviewer skipped the completion gate entirely
2. **Missing rows:** Some subagents were not waited for
3. **Missing decisions:** Findings exist but lack confirm/dismiss/defer

```yaml
GATE_RESULT:
  status: fail
  gate: subagent-completion
  message: "Subagent results incomplete: {specific problem}"
  checks:
    - name: all-received
      status: fail
      detail: "{N}/8 subagents received. Missing: {list}"
    - name: all-decided
      status: fail
      detail: "Findings without decisions: {count}"
  recovery:
    - "Wait for all subagents to return — do not proceed until complete"
    - "Fill in every row of the Subagent Results table"
    - "Document a decision for every finding: confirmed, dismissed (with rationale), or deferred"
    - "Context pressure is not a reason to skip — the system handles context management"
```
</fail>

</gate>

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
