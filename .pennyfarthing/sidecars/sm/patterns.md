# SM Agent Patterns

> Pennyfarthing-specific story management patterns

## Scale-Adaptive Workflow

| Points | Scale | Workflow |
|--------|-------|----------|
| 1-2 pts | Trivial | SM → Dev (skip TEA) |
| 3-5 pts | Standard | SM → TEA → Dev |
| 8+ pts | Complex | SM → TEA → Dev |

## Session File Structure

```markdown
## Story X-Y: [Title]
**Epic:** [Epic name]
**Points:** [N] | **Priority:** [P0/P1/P2]
**Repos:** [api/ui/both]
**Branch:** feat/X-Y-short-description
**Phase:** sm
**Status:** setup

## Acceptance Criteria
- [ ] AC1
- [ ] AC2

## Workflow
- [ ] SM: Story setup
- [ ] TEA: Write failing tests
- [ ] Dev: Implement to GREEN
- [ ] Reviewer: Code review
- [ ] SM: Finish story
```

## Helper Delegation

### When to Spawn Helpers
- Status checks → `workflow-status-check`
- Backlog research → `generic-sm-setup MODE=research`
- Story setup → `generic-sm-setup MODE=setup`
- Finish preflight → `generic-sm-finish PHASE=preflight`
- Finish execute → `generic-sm-finish PHASE=execute`

---

## Reserve Capacity for Emergent Work

**Problem:** Mid-sprint bug discoveries (like Story 4-5) compete with planned work.

**Solution:** Plan at 80-85% of velocity target to leave room for:
- Bug fixes discovered during development
- Process improvements identified during work
- Urgent customer requests

**Example:** Sprint 2 had 34 points planned against 20pt velocity. Story 4-5 (statusline bug) was added mid-sprint but handled smoothly due to strong velocity.

---

## Early Epic Start When Ahead of Schedule

**Trigger:** Sprint is 80%+ complete with significant time remaining.

**Action:**
1. Start next sprint's P1 stories early
2. Keep velocity attribution clean (story still counts toward next sprint)
3. Only start well-defined stories with clear acceptance criteria

**Example:** Sprint 2 story 6-1 started on Day 4 because 82% of points were done.

---

## Sprite/Portrait Regeneration

**Location:** `showcase/src/data/sprite-prompts/`

**Files:**
- `{theme}.md` - Visual descriptions for each character (generator reads the character name field)
- `generate-sprites.py` - SDXL-based portrait generator
- `queue-sprites.sh` - Batch generation script
- `requirements.txt` - Python dependencies

**Setup (one-time):**
```bash
cd showcase/src/data/sprite-prompts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Regenerate specific portraits:**
```bash
source showcase/src/data/sprite-prompts/.venv/bin/activate

# Delete portraits to regenerate
rm showcase/public/sprites/{theme}/{role}.png

# Update description in showcase/src/data/sprite-prompts/{theme}.md

# Regenerate (skips existing)
python3 showcase/src/data/sprite-prompts/generate-sprites.py --theme {theme} --skip-existing
```

**Requirements:** Apple Silicon Mac (M1/M2/M3) with ~10GB RAM, ~6.5GB disk for SDXL model.

---

## Jira CLI Commands

### Creating Stories with Parent Epic

**Context:** When syncing epics and stories to Jira, stories should be linked to their parent epic.

**Solution:** Use `-P` flag when creating stories to set parent epic directly.

**Example:**
```bash
# Create epic first
jira issue create -p MSSCI -tEpic \
    -s"[Cyclist] Epic 1: Web Prototype" \
    -b"Description" \
    -yHighest \
    -l pennyfarthing -l cyclist \
    --no-input

# Create stories with -P for parent
jira issue create -p MSSCI -tStory \
    -P MSSCI-11334 \
    -s"[Cyclist] E1-1: Project Setup" \
    -b"Description. Points: 3 | Done" \
    -yHighest \
    -l pennyfarthing -l cyclist \
    --no-input
```

**Key flags:**
- `-p MSSCI` - Project key (required)
- `-P MSSCI-xxxxx` - Parent epic key
- `-t Story|Epic` - Issue type
- `-s "title"` - Summary/title
- `-b "body"` - Description body
- `-y Highest|High|Medium` - Priority
- `-l label` - Labels (use multiple -l for multiple labels)
- `--no-input` - Non-interactive mode

**Why it works:** Using -P creates the parent link immediately, avoiding separate link commands.

---

### Linking Issues After Creation

**Context:** If a story was created without -P, link it manually.

**Solution:** Use `jira issue link` with correct link type. **First argument is PARENT, second is CHILD.**

**Example:**
```bash
# Link epic (parent) to story (child)
# Order: jira issue link <PARENT> <CHILD> "Parent-Child"
jira issue link MSSCI-11334 MSSCI-11335 "Parent-Child"
```

**IMPORTANT:** The order matters! First issue becomes the parent, second becomes the child.
- CORRECT: `jira issue link EPIC STORY "Parent-Child"` → Epic is parent of Story
- WRONG: `jira issue link STORY EPIC "Parent-Child"` → Story is parent of Epic (backwards!)

**Available link types:** Blocks, Parent-Child, Relates, Duplicate, etc.
Use exact link type name in quotes.

---

### Transitioning Issues

**Context:** Move issues through workflow states.

**Solution:** Use `jira issue move` with `-p MSSCI` project flag. Does NOT support `--no-input`.

**Example:**
```bash
jira issue move -p MSSCI MSSCI-11335 "In Progress"
jira issue move -p MSSCI MSSCI-11335 "Done"
```

**Note:** Some transitions require intermediate states (To Do → In Progress → Done).

---

### Assigning Issues

**Context:** Assign issues to yourself or team members.

**Solution:** Use `jira issue assign` with `-p MSSCI` project flag.

**Example:**
```bash
# Assign to self
jira issue assign -p MSSCI MSSCI-11335 $(jira me)

# Assign to someone else
jira issue assign -p MSSCI MSSCI-11335 "john.doe@company.com"

# Unassign
jira issue assign -p MSSCI MSSCI-11335 x
```

**IMPORTANT:** The `-p MSSCI` flag is required for most jira commands. The `assign` command does NOT support `--no-input`.

---

*Add story management patterns discovered during coordination below*

---

### Pennyfarthing Label for Jira Issues

**Context:** Pennyfarthing stories in Jira need to be distinguishable from other MSSCI project issues.

**Solution:** Always use the `pennyfarthing` label when creating or querying Jira issues for Pennyfarthing stories.

**Create with label:**
```bash
jira issue create --type Story --project MSSCI \
    --summary "28-1: Clipboard image paste" \
    --label pennyfarthing \
    --no-input
```

**Query by label:**
```bash
jira issue list --project MSSCI -q "labels = pennyfarthing"
```

**Why it works:** The pennyfarthing label filters out unrelated MSSCI issues (which may have similar naming patterns like "28.1" from other projects).

---

### Marking Stories Delivered in Another Story

**Context:** Sometimes one story's implementation covers multiple planned stories' acceptance criteria.

**Solution:** Mark subsidiary stories as done with `delivered_in` field referencing the parent story.

**Example in sprint YAML:**
```yaml
- id: 28-2
  title: Clipboard file paste
  status: done
  completed: 2026-01-12
  delivered_in: 28-1
  notes: Implemented as part of 28-1 (clipboardData.files handling)
```

**Why it works:** Maintains audit trail of what was delivered while avoiding duplicate work.

---

### Auto-Creating Jira Epics During Setup

**Context:** Starting with PR #315 (MSSCI-11841), SM setup automatically creates Jira epics when a local epic lacks a `jira` field.

**Solution:** Use `jira-epic-creation.ts` module to detect and auto-create missing epics before story claim.

**Implementation:**
```typescript
// packages/core/src/jira/jira-epic-creation.ts provides:
// - createEpicInJira() - Create epic via Jira CLI with secure arg passing
// - ensureEpicHasJiraKey() - Check existing or create new
// - updateSprintYamlWithJiraKey() - Atomic YAML updates
// - extractEpicNumberFromJiraKey() - Parse Jira key format
// - checkEpicJiraRequired() - Detect missing jira field
```

**Workflow:**
1. Extract epic number from story ID (e.g., "36-2" → "36")
2. Check if epic has `jira` field in sprint YAML
3. If missing or null, auto-create epic in Jira
4. Update sprint YAML with new Jira key
5. Continue with story claim

**Why it works:**
- Eliminates manual epic creation step
- Ensures all stories can link to parent epic
- Keeps sprint YAML and Jira in sync automatically
- Prevents workflow blocking due to missing Jira setup

**Integration with generic-sm-setup:**
The epic check happens at Step 1 (before story claim) in `generic-sm-setup.md` MODE=setup flow. This ensures the epic exists in Jira before attempting to claim and link the story.

---

### Bidirectional Sprint/Story Sync with Jira

**Context:** PR #322 (MSSCI-11842) added bidirectional sync between sprint YAML and Jira.

**Solution:** Use `jira-bidirectional-sync.mjs` to sync status, points, and stories both directions.

**Capabilities:**
- Status sync: YAML ↔ Jira (backlog/in_progress/done ↔ To Do/In Progress/Done)
- Story points: Update Jira with values from sprint YAML
- New story detection: Find stories in one system missing from the other
- Dry-run mode: Preview changes before applying

**Usage:**
```bash
# Dry run - show what would change
./.pennyfarthing/scripts/run.sh jira-bidirectional-sync.mjs --dry-run

# Apply status changes
./.pennyfarthing/scripts/run.sh jira-bidirectional-sync.mjs --sync-status

# Apply point updates
./.pennyfarthing/scripts/run.sh jira-bidirectional-sync.mjs --sync-points

# Full sync
./.pennyfarthing/scripts/run.sh jira-bidirectional-sync.mjs --sync-status --sync-points
```

**When to use:**
- After bulk story completion (sprint close)
- When Jira and YAML have diverged
- Before sprint retrospective to ensure accurate metrics
- When importing external Jira changes back to YAML

**Why it works:**
- Bidirectional ensures neither system is canonical (both can update)
- Dry-run prevents accidental mass updates
- Status mapping handles workflow differences
- Point sync enables accurate velocity tracking in Jira
