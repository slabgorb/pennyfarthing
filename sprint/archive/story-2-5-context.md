# Story 2-5: Technical Context

## Overview
Convert all 13 subagents from embedded YAML code blocks to Claude Code's official YAML frontmatter format.

## Current Format (to migrate FROM)
```markdown
# Subagent Name

**Purpose:** Description
**Model:** haiku

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "descriptive name"
```

## Prompt Template
[markdown content with {PLACEHOLDERS}]
```

## Target Format (to migrate TO)
```markdown
---
name: subagent-name
description: What it does
tools: Bash, Read, Glob, Grep
model: haiku
---
[system prompt - the actual instructions]
```

## Files to Migrate (13 total)

Location: `pennyfarthing-dist/subagents/`

| File | Current Lines | Purpose |
|------|---------------|---------|
| workflow-status-check.md | 196 | Universal entry point for all agents |
| sm-work-research.md | ~100 | Find available work from backlog |
| sm-file-summary.md | ~80 | Read files, create summaries |
| sm-story-setup.md | 149 | Claim Jira, create branch, write session |
| sm-handoff.md | ~60 | SM→TEA handoff |
| sm-finish-bookkeeping.md | ~80 | Archive and cleanup |
| sm-finish-execution.md | ~100 | Execute finish workflow |
| tea-handoff.md | ~60 | RED phase complete handoff |
| dev-handoff.md | ~60 | GREEN phase complete handoff |
| reviewer-preflight.md | ~80 | Gather data before review |
| reviewer-handoff-approve.md | ~60 | Approve and finalize |
| reviewer-handoff-reject.md | ~60 | Reject and escalate |
| testing-runner.md | 188 | Config-driven test execution |

## Migration Rules

1. **name:** Use kebab-case filename without .md (e.g., `workflow-status-check`)
2. **description:** Use existing Purpose/description text
3. **tools:** Standard set: `Bash, Read, Glob, Grep` (add Edit, Write if subagent modifies files)
4. **model:** Keep `haiku` for all tactical subagents
5. **Body:** Everything after `## Prompt Template` becomes the body after `---`
6. **Placeholders:** Keep `{STORY_ID}`, `{REPOS}`, `{BRANCH}` syntax unchanged

## Tool Requirements by Subagent

| Subagent | Tools Needed |
|----------|--------------|
| workflow-status-check | Bash, Read, Glob, Grep |
| sm-work-research | Bash, Read, Glob, Grep |
| sm-file-summary | Read, Glob, Grep |
| sm-story-setup | Bash, Read, Edit, Write |
| sm-handoff | Bash, Read, Edit |
| sm-finish-bookkeeping | Bash, Read, Glob, Grep |
| sm-finish-execution | Bash, Read, Edit, Write |
| tea-handoff | Bash, Read, Edit, Grep |
| dev-handoff | Bash, Read, Edit, Grep |
| reviewer-preflight | Bash, Read, Glob, Grep |
| reviewer-handoff-approve | Bash, Read, Edit, Grep |
| reviewer-handoff-reject | Bash, Read, Edit, Grep |
| testing-runner | Bash, Read, Glob, Grep |

## Symlink Consideration

The `.claude/subagents/` directory symlinks to `pennyfarthing-dist/subagents/`.
Edit the source files in `pennyfarthing-dist/subagents/` - symlinks will reflect changes.

## Acceptance Criteria

- [ ] All 13 subagents use YAML frontmatter format (--- delimited)
- [ ] Each has name, description, tools, model fields
- [ ] Subagents auto-discovered by Claude Code from .claude/agents/
- [ ] Agent invocation patterns updated if needed
- [ ] Documentation reflects new format

## Notes

- This is a 3-point story (standard TDD flow: TEA → Dev → Reviewer)
- No functional changes to subagent behavior - format migration only
- Preserve all placeholder syntax for calling agents
- Test by invoking a migrated subagent via Task tool
