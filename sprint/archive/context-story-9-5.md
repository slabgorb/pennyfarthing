# Story 9-5: Add Skill Usage Analytics - Technical Context

## Story Overview
| Field | Value |
|-------|-------|
| Epic | 9 - Skill Discovery & Documentation Hub |
| Points | 2 |
| Priority | P2 |
| Repos | pennyfarthing |
| Jira | MSSCI-11523 |

## Acceptance Criteria
- [ ] AC1: Skill usage logged to `.session/skill-usage.log`
- [ ] AC2: Weekly usage report available via script
- [ ] AC3: Identifies unused skills (from registry but never invoked)

## Current State

### Skill Registry
The skill registry at `pennyfarthing-dist/skills/skill-registry.yaml` contains 18 skills with full metadata (name, category, tags, examples, etc.). This is the source of truth for what skills exist.

### Session Infrastructure
- `.session/` directory stores session state, logs, and context files
- `agent-session.sh` handles agent lifecycle (start/stop)
- Logging pattern established: `.log` files for raw logs, `.md` for reports

### No Current Tracking
Skills are invoked via `/skill-name` commands but there's no mechanism to log these invocations. No usage data is currently captured.

## Technical Approach

### 1. Usage Log Format
Create `.session/skill-usage.log` as JSON Lines for easy parsing:
```json
{"ts":"2026-01-11T10:30:45Z","skill":"testing","agent":"dev","session":"abc123"}
```

### 2. Logging Hook
The Skill tool in Claude Code already invokes skills. The skill definition files could include a logging call, OR we add a wrapper script that logs before dispatching to the actual skill.

**Recommended approach:** Add a `log-skill-usage.sh` utility that skills call on activation:
```bash
# Called at start of each skill activation
$PROJECT_ROOT/.claude/scripts/utils/log-skill-usage.sh "skill-name" "agent-name"
```

### 3. Report Script
Create `scripts/utils/skill-usage-report.sh` that:
- Reads `.session/skill-usage.log`
- Counts invocations per skill
- Cross-references with `skill-registry.yaml` to find unused skills
- Outputs summary to stdout or `.session/skill-usage-report.md`

### 4. Integration Points
- **Skills:** Each skill's activation section calls the logging utility
- **Report:** Can be run manually or integrated into sprint finish flow

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `scripts/utils/log-skill-usage.sh` | Create | Log skill invocations |
| `scripts/utils/skill-usage-report.sh` | Create | Generate usage reports |
| `pennyfarthing-dist/skills/*/skill.md` | Modify (18 files) | Add logging call to activation |

## Testing Strategy

1. **Unit tests for log script:**
   - Logs correctly formatted JSON
   - Handles missing session gracefully
   - Appends (doesn't overwrite)

2. **Unit tests for report script:**
   - Parses log correctly
   - Identifies unused skills
   - Handles empty log

3. **Integration test:**
   - Invoke a skill, verify log entry created
   - Run report, verify skill appears in output

## Dependencies & Risks

**Dependencies:**
- `yq` for YAML parsing (already required)
- `jq` for JSON handling (already required)

**Risks:**
- Low: 2-point story with clear scope
- Skill invocation happens in Claude Code runtime, may need to verify hook actually fires

## Scale Assessment
**2 points = Trivial** - This is utility scripting with clear inputs/outputs. Route directly to Dev, skip TEA.
