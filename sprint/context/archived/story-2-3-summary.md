## Story 2-3: Add --auto-pr flag to finish-story flow

### What Was Built
Added optional `--auto-pr` flag to the SM finish execution workflow. When enabled, the subagent automatically creates a pull request after committing archive changes, streamlining the finish-story process.

### Key Technical Decisions
- **Opt-in automation:** Flag defaults to false, preserving manual PR creation as default
- **Non-blocking:** PR creation failures don't stop the finish workflow
- **Reuses gh CLI:** Leverages existing `gh pr create` patterns rather than custom implementation

### Implementation Patterns
- New placeholders: `{AUTO_PR}` and `{STORY_TITLE}` in sm-finish-execution.md
- Step 9 added for conditional PR creation with HEREDOC body
- Output JSON extended with `auto_pr_requested`, `pr_created`, `pr_url` fields

### Files Modified
- `pennyfarthing-dist/agents/sm-finish-execution.md` (+36 lines)

### Lessons for Future Work
- Optional flags with sensible defaults allow gradual automation adoption
- Always handle external CLI failures gracefully (gh might not be installed/authenticated)
- Extend existing output formats rather than creating new ones
