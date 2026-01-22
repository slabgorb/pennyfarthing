---
name: handoff
description: Workflow-driven handoff that reads phase requirements from workflow definition
tools: Bash, Read, Edit, Grep
model: haiku
---

<info>
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
</info>

<critical>
**Subagent output is NOT visible to Cyclist.** Tool results are not parsed for markers.
You MUST return an explicit `AGENT_COMMAND` block for the calling agent to execute.
The calling agent will parse this block and emit the appropriate marker in their direct output.
</critical>

---

## Gate Types

<gate>
### tests_fail (TEA → Dev)
- Tests committed
- Tests are RED (failing)
- Assessment exists

**STOP if tests GREEN** - TEA must verify tests exercise new code.
</gate>

<gate>
### tests_pass (Dev → Reviewer)
- Quality checks pass (`check.sh`)
- Git working tree clean
- Changes pushed to remote
- PR exists and is open
- Assessment exists

**STOP if any check fails.**
</gate>

<gate>
### approval (Reviewer → SM/Dev)
- Reviewer Assessment exists
- Contains APPROVED or REJECTED
- Verdict matches VERDICT parameter

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

6. **Check context and determine handoff type:**
   ```bash
   eval "$($CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/core/check-context.sh)"
   echo "IS_CYCLIST=$IS_CYCLIST"
   echo "USE_TIREPUMP=$USE_TIREPUMP"
   echo "CONTEXT_PERCENT=$CONTEXT_PERCENT"
   echo "PERMISSION_MODE=$PERMISSION_MODE"
   ```

7. **Return AGENT_COMMAND block** (see Output Format below)

---

## Output Format

Your output MUST end with an `AGENT_COMMAND` block. The calling agent will parse this and emit the appropriate marker.

```
HANDOFF COMPLETE

From: {CURRENT_PHASE} ({CURRENT_AGENT})
To: {NEXT_PHASE} ({NEXT_AGENT})
Gate: {GATE_TYPE} - PASSED

Context: {CONTEXT_PERCENT}%
Mode: {PERMISSION_MODE}
Cyclist: {IS_CYCLIST}
TirePump: {USE_TIREPUMP}

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: {MARKER_TYPE}
  marker_value: {NEXT_AGENT}
  fallback_message: "Run `/{NEXT_AGENT}` to continue"
---
```

### Marker Type Decision

| IS_CYCLIST | USE_TIREPUMP | marker_type | Calling Agent Action |
|------------|--------------|-------------|---------------------|
| false | * | none | Agent outputs: `fallback_message` text only |
| true | false | handoff | Agent outputs: `<!-- CYCLIST:HANDOFF:/{marker_value} -->` |
| true | true | context_clear | Agent outputs: `<!-- CYCLIST:CONTEXT_CLEAR:/{marker_value} -->` |

### Example Output (Cyclist, TirePump active)

```
HANDOFF COMPLETE

From: green (Dev)
To: review (Reviewer)
Gate: tests_pass - PASSED

Context: 72%
Mode: turbo
Cyclist: true
TirePump: true

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: context_clear
  marker_value: reviewer
  fallback_message: "Run `/reviewer` to continue"
---
```

### Example Output (Cyclist, no TirePump)

```
HANDOFF COMPLETE

From: red (TEA)
To: green (Dev)
Gate: tests_fail - PASSED

Context: 35%
Mode: accept
Cyclist: true
TirePump: false

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: handoff
  marker_value: dev
  fallback_message: "Run `/dev` to continue"
---
```

### Example Output (Not Cyclist)

```
HANDOFF COMPLETE

From: red (TEA)
To: green (Dev)
Gate: tests_fail - PASSED

Context: unknown
Mode: unknown
Cyclist: false
TirePump: false

---
AGENT_COMMAND:
  action: emit_marker
  marker_type: none
  marker_value: dev
  fallback_message: "Run `/dev` to continue"
---
```

## Error Format

```
HANDOFF BLOCKED

Step failed: {step}
Gate type: {gate}
Error: {message}

Recommended fix: {action}

---
AGENT_COMMAND:
  action: blocked
  reason: "{message}"
---
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

---

## Calling Agent Instructions

When you receive this subagent's output, parse the `AGENT_COMMAND` block and:

1. If `action: blocked` → Report the error, do not emit any marker
2. If `marker_type: none` → Output the `fallback_message` text only
3. If `marker_type: handoff` → Output: `<!-- CYCLIST:HANDOFF:/{marker_value} -->`
4. If `marker_type: context_clear` → Output: `<!-- CYCLIST:CONTEXT_CLEAR:/{marker_value} -->`

**CRITICAL: The marker MUST appear in the calling agent's direct text output, not in a tool result.**
