# Step 04: Sprint Management

<purpose>
Learn how Pennyfarthing organizes work using sprints, epics, and stories. Then practice the full sprint lifecycle hands-on by creating, claiming, completing, and cleaning up a practice story.
</purpose>

<instructions>
1. Explain the sprint/epic/story hierarchy
2. Demonstrate read-only sprint commands
3. Run the hands-on practice exercise
4. Clean up practice artifacts
5. Offer deep-dive into advanced sprint topics
</instructions>

<output>
- Developer understands sprint/epic/story hierarchy
- Developer has practiced the full sprint lifecycle (create, claim, complete, cleanup)
- Practice artifacts are fully cleaned up
- Developer knows key sprint commands
</output>

## SPRINT CONCEPTS

Pennyfarthing uses a three-level hierarchy to organize work:

```
Sprint (time-boxed period)
  └── Epic (feature group, tracked in Jira)
        └── Story (unit of work, 1-5 points)
```

**Sprints** are two-week periods. Each sprint has a `current-sprint.yaml` index file that references one or more **epic shards** — separate YAML files per epic.

**Epics** group related stories. Each epic gets its own shard file (`sprint/epic-{jira-key}.yaml`) so multiple agents can work on different epics without merge conflicts.

**Stories** are the atomic unit of work. Each story has:
- An ID (e.g., `132-15`)
- A Jira key (e.g., `MSSCI-15651`)
- Points (1-5, measuring complexity)
- A workflow (tdd, trivial, etc.)
- A status (backlog → in_progress → in_review → done)

### Jira Integration

Pennyfarthing syncs stories bidirectionally with Jira. When you claim a story locally, it updates Jira. When Jira status changes, `pf jira bidirectional` syncs back. This keeps both systems in sync without manual effort.

## SPRINT COMMANDS

Let's see your current sprint:

```bash
pf sprint status
```

This shows all stories grouped by status. Now check the backlog:

```bash
pf sprint backlog
```

This shows available stories grouped by epic. You can also look at individual stories:

```bash
pf sprint story show <story-id>
```

<switch>
**How would you like to proceed?**

Use AskUserQuestion to offer:

1. **Try It** — Run `pf sprint status` and `pf sprint backlog` to see your sprint data live.
2. **Continue** — Move on to the hands-on practice exercise.
</switch>

## HANDS-ON PRACTICE

Now let's practice the full sprint lifecycle. You'll create a practice story, claim it, make a change, and complete it — experiencing the real workflow.

### Phase 1: Setup (automated)

The tour creates a temporary practice epic and story for you to work with:

```bash
# The tour runs this automatically:
# 1. Copies practice epic template to sprint/epic-tour-practice.yaml
# 2. Registers it in the sprint index
```

Let's verify the practice story appeared:

```bash
pf sprint status
pf sprint backlog
```

You should see a "Guided Tour Practice Epic" with one story: "Practice: Add a comment to a file."

### Phase 2: Claim the Story

Now claim the practice story — just like you would with a real story:

```bash
pf sprint work tour-practice-1
```

This transitions the story from `backlog` to `in_progress` and creates a session file at `.session/tour-practice-1-session.md`. The session file tracks the story's context, acceptance criteria, and agent assessments.

### Phase 3: Do the Work

For this practice, make a trivial edit — add a comment to any file in your project:

```
// Tour practice edit — you can remove this
```

In a real story, you'd:
1. Write failing tests (TEA agent, RED phase)
2. Implement the feature (Dev agent, GREEN phase)
3. Get a code review (Reviewer agent)
4. Create a PR and merge

For practice, we'll skip the full TDD workflow.

### Phase 4: Complete the Story

Now finish the practice story:

```bash
pf sprint story finish tour-practice-1
```

This transitions the story through `in_review` → `done`, archives the session file, and cleans up. Let's verify:

```bash
pf sprint status
```

The practice story should now show as done.

### Phase 5: Cleanup

We'll clean up all practice artifacts now so they don't pollute your sprint data:

1. Remove the practice epic shard (`sprint/epic-tour-practice.yaml`)
2. Remove any session artifacts (`.session/tour-practice-1-session.md`)
3. Remove any archive artifacts (`sprint/archive/tour-practice-1-session.md`)
4. Revert the practice file edit via `git checkout` on that file

```bash
# The tour handles cleanup automatically
```

Let's verify everything is clean:

```bash
pf sprint status
```

The practice epic and story should be gone.

## DEEP DIVE

<switch>
**Want to dig deeper into sprint internals?**

Use AskUserQuestion to offer:

1. **Dig In** — Learn about YAML shards, epic lifecycle, archive process, and Jira sync.
2. **Skip** — Continue to the next step.
</switch>

### YAML Shards

Sprint data is split across multiple files to avoid merge conflicts:

```
sprint/
  current-sprint.yaml    # Index: sprint metadata + epic refs
  epic-MSSCI-15616.yaml  # One shard per epic
  epic-MSSCI-15620.yaml
  archive/               # Completed story sessions
```

The index file (`current-sprint.yaml`) lists which epics are active. Each epic shard contains the epic metadata and its stories. This means two agents working on different epics never touch the same file.

### Epic Lifecycle

Epics flow through: `planning` → `active` → `completed` → archived.

- `pf sprint epic add` creates a new epic
- Stories are added with `pf sprint story add`
- When all stories are done, the epic can be archived with `pf sprint epic archive`

### Archive Process

When a story is finished (`pf sprint story finish`):
1. The session file is moved to `sprint/archive/`
2. The story status is set to `done`
3. Jira is updated (if configured)

### Jira Sync

Bidirectional sync keeps YAML and Jira in agreement:
- `pf jira sync` pushes YAML → Jira
- `pf jira bidirectional` pulls Jira → YAML (Jira wins by default)
- `pf jira reconcile` reports mismatches without changing anything

## NEXT

Proceed to step 5 to learn about configuration and customization.
