<gate name="sm-setup-exit" model="haiku">

<purpose>
Verify SM has completed story setup before handing off to the next agent.
Without a properly configured session file, the next agent cannot function.
Extracts the inline pre-handoff checklist from sm.md.
</purpose>

<pass>
Run these checks in order:

1. **session-exists:** Check `.session/{story-id}-session.md` exists.
   ```bash
   ls .session/{story-id}-session.md
   ```

2. **session-fields-set:** Read session file and verify:
   - `**Workflow:**` field present and non-empty
   - `**Phase:**` field present and set to `setup`

3. **story-context-exists:** Verify:
   - `sprint/context/context-epic-{N}.md` exists (extract epic number from story ID)
   - Session file contains technical approach section
   - Session file contains acceptance criteria

4. **branch-created:** For each repo in session `**Repos:**`:
   - Run `git branch --show-current`
   - Confirm not on `main` or `develop`

If ALL pass, return:

```yaml
GATE_RESULT:
  status: pass
  gate: sm-setup-exit
  message: "Session {story-id} ready. Workflow: {workflow}, Branch: {branch}"
  checks:
    - name: session-exists
      status: pass
      detail: ".session/{story-id}-session.md exists"
    - name: session-fields-set
      status: pass
      detail: "Workflow: {workflow}, Phase: setup"
    - name: story-context-exists
      status: pass
      detail: "Epic context and story ACs present"
    - name: branch-created
      status: pass
      detail: "Branch {branch} created in {repos}"
```
</pass>

<fail>
If ANY check fails, report all results:

```yaml
GATE_RESULT:
  status: fail
  gate: sm-setup-exit
  message: "Setup incomplete: {summary}"
  checks:
    - name: session-exists
      status: pass | fail
      detail: "{exists or missing}"
    - name: session-fields-set
      status: pass | fail
      detail: "{fields present or missing fields list}"
    - name: story-context-exists
      status: pass | fail
      detail: "{context present or missing sections}"
    - name: branch-created
      status: pass | fail
      detail: "{branch status per repo}"
  recovery:
    - "Run sm-setup to create session file"
    - "Set Workflow and Phase fields in session"
    - "Write story context with technical approach and ACs"
    - "Create feature branch: git checkout -b feat/{story-slug}"
```
</fail>

</gate>
