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
**Reflector required.** Final output MUST include one of:

Standard handoff (user clicks to continue):
```
<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
```

TirePump handoff (auto-clear context + load next agent):
```
<!-- CYCLIST:CONTEXT_CLEAR:/{NEXT_AGENT} -->
```

**Decision:** Run `check-context.sh` and check `USE_TIREPUMP`:
- If `USE_TIREPUMP=true` → emit `CONTEXT_CLEAR` (enables continuous autonomous runs)
- Otherwise → emit `HANDOFF`
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
   eval "$($CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/check-context.sh)"
   # USE_TIREPUMP=true means: turbo mode + context >60%
   # CONTEXT_PERCENT, PERMISSION_MODE also available
   ```

7. **Report result with Reflector:**
   - If `USE_TIREPUMP=true` → `<!-- CYCLIST:CONTEXT_CLEAR:/{NEXT_AGENT} -->`
   - Otherwise → `<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->`

---

## Output Format

```
HANDOFF COMPLETE

From: {CURRENT_PHASE} ({CURRENT_AGENT})
To: {NEXT_PHASE} ({NEXT_AGENT})
Gate: {GATE_TYPE} - PASSED

Context: {CONTEXT_PERCENT}%
Mode: {PERMISSION_MODE}
TirePump: {USE_TIREPUMP}

<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
or (if USE_TIREPUMP=true):
<!-- CYCLIST:CONTEXT_CLEAR:/{NEXT_AGENT} -->
```

## Error Format

```
HANDOFF BLOCKED

Step failed: {step}
Gate type: {gate}
Error: {message}

Recommended fix: {action}
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
| Reflector | `/reflector` |

