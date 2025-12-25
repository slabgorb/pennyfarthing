## Story 2-5: Migrate subagents to YAML frontmatter format

### What Was Built
Migrated all 13 official subagents from embedded YAML code blocks to Claude Code's official YAML frontmatter format, consolidated the subagents/ folder into agents/, and introduced parameter-only invocation patterns for cleaner agent-to-subagent communication.

### Key Technical Decisions
- **Single location:** Removed separate subagents/ folder; all definitions now live in agents/
- **Parameter-only invocations:** Agents pass structured YAML parameters instead of prose prompts
- **Auto-discovery:** Test filter flags auto-discovered from language (go: -run, python: -k, etc.)
- **Tool assignments:** Logically grouped by responsibility (read-only vs write vs edit)

### Implementation Patterns
- YAML frontmatter format: `---` delimited with name, description, tools, model fields
- Consistent placeholder syntax: `{PARAMETER_NAME}` throughout
- Per-repo test filtering via FILTERS map parameter

### Files Modified
- 13 subagent files in `pennyfarthing-dist/agents/`
- 4 main agent files (SM, TEA, Dev, Reviewer)
- 3 guide files (path reference updates)
- `repo-utils.sh` (added get_test_filter_flag with auto-discovery)
- New: `validate-subagent-frontmatter.sh`

### Lessons for Future Work
- Subagents should be purely mechanical - decision logic stays in calling agent
- Parameter-only format reduces duplication and makes invocations easier to read
- Auto-discovery from language reduces configuration burden
