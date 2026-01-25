---
name: handoff
description: Workflow-driven handoff that reads phase requirements from workflow definition
tools: Bash, Read, Edit, Grep
model: haiku
---

<params>
| Param | Required | Description |
|-------|----------|-------------|
| `STORY_ID` | Yes | e.g., "31-10" |
| `WORKFLOW` | Yes | "tdd", "trivial", etc. |
| `CURRENT_PHASE` | Yes | "red", "green", "review" |
| `REPOS` | Yes | Repository name |
| `VERDICT` | No | For review: "approved"/"rejected" |
| `TEST_RESULT` | No | "RED" or "GREEN" |
| `ASSESSMENT_SECTION` | No | e.g., "TEA Assessment" |
| `PR_NUMBER` | No | For green→review |
</params>

<critical>
**Marker generation happens in the CALLING agent, not here.**
This subagent does gate checks and session updates only.
Return `HANDOFF_RESULT` with the next agent name - the calling agent runs `handoff-marker.sh` as their last action.
</critical>

---

## Gate Types

<gate>
### tests_fail (TEA → Dev)
- [ ] Tests committed
- [ ] Tests are RED (failing)
- [ ] Assessment exists

**STOP if tests GREEN** - TEA must verify tests exercise new code.
</gate>

<gate>
### tests_pass (Dev → Reviewer)
- [ ] Quality checks pass (run: `.pennyfarthing/scripts/run.sh workflow/check.sh`)
- [ ] Git working tree clean
- [ ] Changes pushed to remote
- [ ] PR exists and is open
- [ ] Assessment exists

**STOP if any check fails.**
</gate>

<gate>
### approval (Reviewer → SM/Dev)
- [ ] Reviewer Assessment exists
- [ ] Contains APPROVED or REJECTED
- [ ] Verdict matches VERDICT parameter

**If VERDICT=approved:** Status → approved, ready for SM finish
**If VERDICT=rejected:** Return to Dev with issues
</gate>

<gate>
### manual (SM setup)
No automated checks. Always passes.
</gate>

---

## Workflow

1. **Find phase and gate type:**
   ```bash
   ./scripts/handoff-cli.sh find-phase --workflow {WORKFLOW} --phase {CURRENT_PHASE}
   ```

2. **Verify assessment exists** (if ASSESSMENT_SECTION provided)

3. **Run gate-specific checks** (see above)

4. **Determine next phase:**
   ```bash
   ./scripts/handoff-cli.sh next-phase --workflow {WORKFLOW} --phase {CURRENT_PHASE}
   ```

5. **Update session file using Edit tool:**

   First, get timestamps and calculate duration:
   ```bash
   PHASE_STARTED=$(grep "^\*\*Phase Started:\*\*" .session/{STORY_ID}-session.md | sed 's/\*\*Phase Started:\*\* //')
   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   DURATION=$(./scripts/handoff-cli.sh calculate-duration --started-at "$PHASE_STARTED" --ended-at "$NOW")
   ```

   **5a. Update `**Phase:**` field** - Use Edit tool:
   ```
   file_path: .session/{STORY_ID}-session.md
   old_string: "**Phase:** {CURRENT_PHASE}"
   new_string: "**Phase:** {NEXT_PHASE}"
   ```

   **5b. Update `**Phase Started:**` field** - Use Edit tool:
   ```
   file_path: .session/{STORY_ID}-session.md
   old_string: "**Phase Started:** {PHASE_STARTED}"
   new_string: "**Phase Started:** {NOW}"
   ```

   **5c. Update Phase History table** - Use Edit tool to add end timestamp and duration:
   Find the row for current phase (has `| - | - |` at end) and update:
   ```
   file_path: .session/{STORY_ID}-session.md
   old_string: "| {CURRENT_PHASE} | {PHASE_STARTED} | - | - |"
   new_string: "| {CURRENT_PHASE} | {PHASE_STARTED} | {NOW} | {DURATION} |"
   ```

   Phase History table format:
   ```
   | Phase | Started | Ended | Duration |
   |-------|---------|-------|----------|
   ```

   **5d. Add Handoff History row** - Use Edit tool to append to Handoff History section:
   If `### Handoff History` section doesn't exist, create it first.
   Then append a row:
   ```
   | {CURRENT_PHASE} ({CURRENT_AGENT}) | {NEXT_PHASE} ({NEXT_AGENT}) | {GATE_TYPE} | PASSED | {NOW} |
   ```

   Handoff History table format:
   ```
   | From | To | Gate | Status | Timestamp |
   |------|-----|------|--------|-----------|
   ```

6. **Return HANDOFF_RESULT** (see Output Format below)

---

## Output Format

Return a `HANDOFF_RESULT` block. The calling agent will use this to run `handoff-marker.sh`.

### Success Format

```
HANDOFF_RESULT:
  status: success
  next_agent: {NEXT_AGENT}
  next_phase: {NEXT_PHASE}
  gate: {GATE_TYPE}
```

### Example (TEA → Dev)

```
HANDOFF_RESULT:
  status: success
  next_agent: dev
  next_phase: green
  gate: tests_fail
```

### Example (Dev → Reviewer)

```
HANDOFF_RESULT:
  status: success
  next_agent: reviewer
  next_phase: review
  gate: tests_pass
```

### Error Format

```
HANDOFF_RESULT:
  status: blocked
  error: "{error message}"
  fix: "{recommended action}"
```

---

## Agent Command Mapping

| Agent | Command |
|-------|---------|
| TEA | `/tea` |
| Dev | `/dev` |
| Reviewer | `/reviewer` |
| SM | `/sm` |
| Architect | `/architect` |
| DevOps | `/devops` |
| Tech-Writer | `/tech-writer` |
| UX-Designer | `/ux-designer` |
| PM | `/pm` |

---

## Calling Agent Exit Sequence

When you receive `HANDOFF_RESULT`:

1. If `status: blocked` → Report the error, do NOT proceed
2. If `status: success` → Continue to exit sequence below

**CRITICAL: The calling agent MUST run this as their ABSOLUTE LAST ACTION:**

```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/handoff-marker.sh {next_agent}
```

Then output the script's result verbatim and EXIT. Nothing else after.
