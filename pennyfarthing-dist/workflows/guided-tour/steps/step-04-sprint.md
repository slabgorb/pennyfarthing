# Step 4: Sprint & Story Management

<step-meta>
step: 4
name: sprint
workflow: guided-tour
agent: orchestrator
gate: true
next: step-05-config
</step-meta>

<purpose>
Show how Pennyfarthing tracks work through sprints, epics, and stories. The sprint system uses YAML files for tracking and integrates with Jira for external visibility.
</purpose>

<prerequisites>
- Step 3 (Agents & Workflows) completed
- Sprint YAML files exist in `sprint/` directory
</prerequisites>

<instructions>
1. Explain the sprint tracking model: sprints contain epics, epics contain stories
2. Show current sprint status with `pf sprint status`
3. Explain story lifecycle: backlog → in_progress → done
4. Show how to view the backlog with `pf sprint backlog`
5. Explain the `/pf-sprint work` command for starting stories
6. Mention Jira integration via `pf jira` commands
</instructions>

<actions>
- Run: `pf sprint status` to show current sprint overview
- Run: `pf sprint backlog` to list available stories
- Show: `pf sprint story show <id>` for story details
</actions>

<output>
Present sprint management overview:

```markdown
## Sprint Management

Pennyfarthing tracks work in a YAML-based sprint system:

**Hierarchy:** Sprint → Epic → Story

**Key commands:**
- `pf sprint status` — Current sprint overview
- `pf sprint backlog` — Available stories by epic
- `pf sprint work <story-id>` — Start working on a story
- `pf sprint story show <id>` — View story details
- `pf jira view <key>` — Check the Jira issue

**Story lifecycle:**
backlog → in_progress → (TDD phases) → done → archived
```
</output>

<gate>
## Completion Criteria
- [ ] User has seen the sprint status
- [ ] User understands the epic/story hierarchy
- [ ] User knows how to start work with `pf sprint work`
</gate>

<collaboration-menu>
- **[C] Continue** — Proceed to hooks and configuration
- **[T] Try It** — Run `pf sprint status` or `pf sprint backlog`
- **[H] Help** — Learn about Jira integration or story workflows
- **[S] Skip** — Move to configuration
</collaboration-menu>
