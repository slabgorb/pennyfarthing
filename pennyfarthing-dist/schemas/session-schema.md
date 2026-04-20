# Session File XML Schema

Session files track active work sessions for stories. They are the highest-frequency agent interaction point in Pennyfarthing, making structured XML critical for reliable agent behavior.

## File Location

```
.session/{STORY_ID}-session.md
```

**Examples:**
- `.session/PROJ-12142-session.md`
- `.session/36-2-session.md`

## Complete Schema

```xml
<session story="STORY_ID" workflow="WORKFLOW_TYPE">
  <meta>
    <jira>PROJ-XXXXX</jira>
    <epic>PROJ-XXXXX</epic>
    <points>3</points>
    <started>2026-01-22</started>
  </meta>

  <status phase="PHASE" next-agent="AGENT" handoff-ready="BOOLEAN"/>

  <acceptance-criteria>
    <ac id="1" status="done">Description of AC1</ac>
    <ac id="2" status="pending">Description of AC2</ac>
    <ac id="3" status="blocked">Description of AC3 - blocked reason</ac>
  </acceptance-criteria>

  <context>
    Technical context, approach, key files involved...
    See: `.session/context-story-{id}.md` for full context.
  </context>

  <work-log>
    <entry agent="sm" date="2026-01-22">
      Setup notes...
    </entry>
    <entry agent="tea" date="2026-01-22" phase="red">
      Test writing notes...
    </entry>
    <entry agent="dev" date="2026-01-22" phase="green">
      Implementation notes...
    </entry>
    <assessment agent="reviewer" verdict="approved">
      Review findings...
    </assessment>
  </work-log>
</session>
```

## Element Reference

### `<session>` (Root Element)

**Purpose:** Container for all session data.

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `story` | Yes | Story identifier (Jira key or local ID) |
| `workflow` | Yes | Workflow type: `tdd`, `trivial`, `bdd`, `agent-docs` |

---

### `<meta>`

**Purpose:** Story metadata that doesn't change during the session.

**Child Elements:**
| Element | Required | Description |
|---------|----------|-------------|
| `<jira>` | Yes | Jira issue key (e.g., `PROJ-12142`) |
| `<epic>` | No | Parent epic's Jira key |
| `<points>` | No | Story points (1, 2, 3, 5, 8) |
| `<started>` | Yes | Session start date (YYYY-MM-DD) |

---

### `<status>`

**Purpose:** Machine-readable workflow state. Updated by agents at phase transitions.

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `phase` | Yes | Current workflow phase (see Phase Values) |
| `next-agent` | Yes | Agent that should handle next (e.g., `tea`, `dev`, `reviewer`, `sm`) |
| `handoff-ready` | No | `true` if current agent has completed work and is ready to hand off |

**Phase Values:**
| Workflow | Valid Phases |
|----------|--------------|
| `tdd` | `setup`, `red`, `green`, `review`, `finish` |
| `trivial` | `setup`, `implement`, `review`, `finish` |
| `bdd` | `setup`, `scenarios`, `implement`, `review`, `finish` |
| `agent-docs` | `setup`, `document`, `review`, `finish` |

---

### `<acceptance-criteria>`

**Purpose:** Track acceptance criteria completion status.

**Child Elements:**

#### `<ac>`

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Numeric identifier (1, 2, 3...) |
| `status` | Yes | `pending`, `in-progress`, `done`, `blocked` |

**Content:** Human-readable description of the acceptance criterion.

---

### `<context>`

**Purpose:** Brief technical context for the work. Can reference external context files for longer content.

**Content:** Free-form text describing:
- Technical approach
- Key files involved
- Relevant prior decisions
- Links to detailed context files

---

### `<work-log>`

**Purpose:** Chronological record of agent contributions.

**Child Elements:**

#### `<entry>`

**Purpose:** Standard work log entry from any agent.

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `agent` | Yes | Agent identifier: `sm`, `tea`, `dev`, `reviewer`, `architect`, etc. |
| `date` | Yes | Entry date (YYYY-MM-DD) |
| `phase` | No | TDD phase for TEA/Dev entries: `red`, `green`, `refactor` |

**Content:** Free-form text describing work done.

#### `<assessment>`

**Purpose:** Formal verdict from Reviewer agent.

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `agent` | Yes | Must be `reviewer` |
| `verdict` | Yes | `approved`, `rejected`, `needs-work` |

**Content:** Review findings, issues found, recommendations.

---

### `<skills-invoked>`

**Purpose:** Attestation log for superpowers skills invoked during a phase. Used by the SDD workflow and any future workflow that requires skill-attestation gates. Optional element; present only when a phase requires skill attestation.

**Child Elements:**

#### `<skill>`

**Attributes:**
| Attribute | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | Skill identifier without plugin prefix (e.g., `test-driven-development`) |
| `phase` | Yes | Phase during which the skill was invoked (e.g., `red`, `green`) |
| `at` | Yes | ISO 8601 timestamp of invocation (e.g., `2026-04-19T14:22:03Z`) |

**Content:** Empty element (self-closing).

**Example:**

```xml
<skills-invoked>
  <skill name="test-driven-development" phase="red" at="2026-04-19T14:22:03Z"/>
  <skill name="verification-before-completion" phase="green" at="2026-04-19T15:01:47Z"/>
  <skill name="requesting-code-review" phase="green" at="2026-04-19T15:02:14Z"/>
</skills-invoked>
```

**Agent protocol:** When a workflow phase has `skills.required` in its YAML definition, the activating agent invokes each listed skill via the Skill tool, then appends a `<skill>` entry to `<skills-invoked>` in the session file. Composite exit gates (e.g., `sdd-red-exit`, `sdd-green-exit`) read this element to verify required skills have been attested.

---

## Usage Examples

### New Session (SM Setup)

```xml
<session story="PROJ-12345" workflow="tdd">
  <meta>
    <jira>PROJ-12345</jira>
    <epic>PROJ-12300</epic>
    <points>3</points>
    <started>2026-02-03</started>
  </meta>

  <status phase="setup" next-agent="tea" handoff-ready="false"/>

  <acceptance-criteria>
    <ac id="1" status="pending">User can create new account</ac>
    <ac id="2" status="pending">Email validation works correctly</ac>
    <ac id="3" status="pending">Password strength indicator shows</ac>
  </acceptance-criteria>

  <context>
    Implementing user registration feature.
    See: `.session/context-story-PROJ-12345.md`
  </context>

  <work-log>
    <entry agent="sm" date="2026-02-03">
      Story setup complete. Jira claimed, branch created.
      Technical context written with file mapping.
    </entry>
  </work-log>
</session>
```

### After TEA Handoff

```xml
<session story="PROJ-12345" workflow="tdd">
  <!-- meta unchanged -->

  <status phase="red" next-agent="dev" handoff-ready="true"/>

  <acceptance-criteria>
    <ac id="1" status="pending">User can create new account</ac>
    <ac id="2" status="pending">Email validation works correctly</ac>
    <ac id="3" status="pending">Password strength indicator shows</ac>
  </acceptance-criteria>

  <!-- context unchanged -->

  <work-log>
    <entry agent="sm" date="2026-02-03">
      Story setup complete. Jira claimed, branch created.
    </entry>
    <entry agent="tea" date="2026-02-03" phase="red">
      Wrote failing tests for all 3 ACs.
      - `registration.test.ts`: 5 test cases
      - All tests verified failing (RED)
    </entry>
  </work-log>
</session>
```

### After Review (Approved)

```xml
<session story="PROJ-12345" workflow="tdd">
  <!-- meta unchanged -->

  <status phase="review" next-agent="sm" handoff-ready="true"/>

  <acceptance-criteria>
    <ac id="1" status="done">User can create new account</ac>
    <ac id="2" status="done">Email validation works correctly</ac>
    <ac id="3" status="done">Password strength indicator shows</ac>
  </acceptance-criteria>

  <!-- context unchanged -->

  <work-log>
    <entry agent="sm" date="2026-02-03">
      Story setup complete. Jira claimed, branch created.
    </entry>
    <entry agent="tea" date="2026-02-03" phase="red">
      Wrote failing tests for all 3 ACs.
    </entry>
    <entry agent="dev" date="2026-02-03" phase="green">
      Implemented registration feature.
      - All tests passing (GREEN)
      - PR: #456
    </entry>
    <assessment agent="reviewer" verdict="approved">
      **Verdict: APPROVED**

      All ACs verified, tests comprehensive, code follows patterns.
      No security issues found.
    </assessment>
  </work-log>
</session>
```

---

## Parsing Guidance

### Extracting Status

Scripts and agents can extract status using simple patterns:

```bash
# Extract phase
grep -oP 'phase="[^"]*"' session.md | head -1 | cut -d'"' -f2

# Extract next agent
grep -oP 'next-agent="[^"]*"' session.md | head -1 | cut -d'"' -f2

# Check handoff readiness
grep -oP 'handoff-ready="[^"]*"' session.md | head -1 | cut -d'"' -f2
```

### Extracting AC Status

```bash
# Count pending ACs
grep -c 'status="pending"' session.md

# Count done ACs
grep -c 'status="done"' session.md
```

---

## Migration Notes

### Converting Old Format

Old session files use plain markdown:

```markdown
## Workflow Status
- **Current Phase:** implement
- **Next Agent:** Reviewer
- **Handoff Ready:** Yes
```

Convert to:

```xml
<status phase="implement" next-agent="reviewer" handoff-ready="true"/>
```

### AC Conversion

Old format:
```markdown
## Acceptance Criteria
- [x] AC1: User can create account
- [ ] AC2: Email validation
```

New format:
```xml
<acceptance-criteria>
  <ac id="1" status="done">User can create account</ac>
  <ac id="2" status="pending">Email validation</ac>
</acceptance-criteria>
```

---

## Related Files

| File | Purpose |
|------|---------|
| `guides/taxonomy/xml-tags.md` | Complete XML tag taxonomy |
| `guides/session-artifacts.md` | Session file naming conventions |
| `scripts/core/agent-session.sh` | Create new session files |
| `scripts/workflow/fix-session-phase.sh` | Update session fields |
