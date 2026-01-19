# AI Agent Guidance

Guidance for AI agents working on the Pennyfarthing codebase.

## Do

### Before Writing Code

- [ ] Read existing code in the area you're modifying
- [ ] Check for existing patterns in similar files
- [ ] Review the agent/skill definition if modifying agent behavior
- [ ] Load relevant context lazily (don't load everything upfront)

### When Implementing

- [ ] Follow existing naming conventions (see Architecture Patterns)
- [ ] Use result objects for error handling, not exceptions
- [ ] Include `.js` extensions in all relative imports
- [ ] Write tests alongside implementation
- [ ] Update session file before handoff

### After Implementation

- [ ] Run `npm run build` to compile TypeScript
- [ ] Run `npm test` to verify tests pass
- [ ] Commit both `src/` and `dist/` changes
- [ ] Update session file with assessment

## Don't

### Never Do

- [ ] Modify symlinked directories (`.claude/commands/`, `.pennyfarthing/agents/`)
- [ ] Throw exceptions for business logic errors
- [ ] Use Opus model for subagents (use Haiku)
- [ ] Bypass state detection with hardcoded values
- [ ] Edit `sprint/current-sprint.yaml` during active sessions
- [ ] Commit without running build

### Avoid

- [ ] Loading unnecessary context (stay within budget)
- [ ] Creating new top-level directories
- [ ] Adding dependencies without checking for existing alternatives
- [ ] Using `any` type without documentation
- [ ] Skipping tests for "small" changes

## Context Loading

### When to Load What

| Situation | Load |
|-----------|------|
| Story implementation | Target repo context only |
| Sprint planning | Full sprint YAML |
| Agent modification | Relevant agent file + shared behavior |
| Cross-repo work | Both repo contexts (watch budget) |

### Context Budget Check

```bash
# Check current context usage
$CLAUDE_PROJECT_DIR/scripts/check-context.sh --human

# Strategic agents: ~500-660 lines
# Tactical agents: ~450-600 lines
```

### Lazy Loading Pattern

```typescript
// Load only when needed
let sprintData: SprintData | null = null;

function getSprintData(): SprintData {
  if (!sprintData) {
    sprintData = loadSprintYaml();
  }
  return sprintData;
}
```

## File Discovery

### Finding Definitions

| Looking For | Location |
|-------------|----------|
| Agent definitions | `pennyfarthing-dist/agents/*.md` |
| Slash commands | `pennyfarthing-dist/commands/*.md` |
| Skills | `pennyfarthing-dist/skills/*/skill.md` |
| Workflows | `pennyfarthing-dist/workflows/*.yaml` |
| Personas | `pennyfarthing-dist/personas/themes/` |

### Finding Implementation

| Component | Location |
|-----------|----------|
| CLI commands | `packages/core/src/cli/commands/` |
| BMAD parsing | `packages/core/src/bmad/` |
| Jira integration | `packages/core/src/jira/` |
| Cyclist server | `packages/cyclist/src/server.ts` |
| Cyclist API | `packages/cyclist/src/api/` |
| Frontend JS | `packages/cyclist/src/public/js/` |

### Finding Tests

| Package | Location | Pattern |
|---------|----------|---------|
| core | `packages/core/src/` | `*.test.ts` |
| shared | `packages/shared/src/` | `*.test.ts` |
| cyclist | `packages/cyclist/tests/` | `B-*.test.ts` |

## Common Tasks

### Adding a New Skill

1. Create `pennyfarthing-dist/skills/{skill-name}/skill.md`
2. Follow existing skill format (frontmatter + content)
3. Run `./scripts/utils/generate-skill-docs.sh`
4. Test via `/skill-name` command

### Modifying an Agent

1. Edit `pennyfarthing-dist/agents/{agent}.md`
2. Check for sidecar updates in `.pennyfarthing/sidecars/{agent}/`
3. Test agent behavior via `/agent` command
4. Update status tag if stability changes

### Adding a Subagent

1. Create `pennyfarthing-dist/agents/{subagent}.md`
2. Add entry to parent agent's `<helpers>` section
3. Document invocation pattern
4. Test via Task tool

### Fixing a Bug

1. Reproduce the issue
2. Write a failing test
3. Fix the implementation
4. Verify test passes
5. Run full test suite
6. Commit with story reference

## Error Messages

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module './file'` | Missing .js extension | Add `.js` to import |
| `agent-session.sh stop failed` | Assessment not written | Write assessment before handoff |
| `Symlink broken` | Dist not synced | Run `pennyfarthing doctor --fix` |
| `Context limit exceeded` | Too much loaded | Reduce context, use lazy loading |

## Debugging Tips

### Session File Issues

```bash
# Check session file state
cat .session/{story-id}-session.md

# Verify phase transitions
grep -E "^## |Phase:" .session/*-session.md
```

### Build Issues

```bash
# Clean rebuild
npm run clean && npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Test Issues

```bash
# Run specific package tests
pnpm --filter @pennyfarthing/cyclist test

# Run with verbose output
npm test -- --reporter=verbose
```

## Code Review Checklist

When reviewing AI-generated code, check:

- [ ] Follows existing patterns
- [ ] Uses result objects for errors
- [ ] Has `.js` extensions in imports
- [ ] Includes tests
- [ ] Updates relevant documentation
- [ ] Respects context budget
- [ ] Doesn't modify symlinked directories
- [ ] Commits include `dist/` changes

## Performance Considerations

### Token Efficiency

- Use Haiku for mechanical subagent tasks
- Load context lazily
- Avoid reading entire files when grep suffices
- Use targeted file reads with line offsets

### Build Efficiency

- `esbuild` is used for TipTap bundling (fast)
- `tsc` handles main compilation
- Incremental builds via `--watch` for development

## Integration Points

### Jira

```bash
# Use jira CLI
jira issue view PROJ-123
jira issue create --project PROJ --type Story ...
```

### Git

```bash
# Standard git operations
git checkout -b feat/{story-id}-{slug}
git push -u origin HEAD
```

### Cyclist

```markdown
<!-- Include markers in handoff -->
<!-- CYCLIST:HANDOFF:/agent -->
<!-- CYCLIST:CONTEXT_CLEAR:/agent -->
```

## Quick Reference Card

```
MODIFY:    pennyfarthing-dist/
DON'T:     .claude/*, .pennyfarthing/agents|guides|personas|scripts/
IMPORTS:   Always use .js extension
ERRORS:    Return {success, error}, don't throw
TESTS:     core/*.test.ts, cyclist/B-*.test.ts
BUILD:     npm run build (commits dist/)
SUBAGENTS: model: haiku
CONTEXT:   Check with check-context.sh
HANDOFF:   Write assessment FIRST
MARKERS:   CYCLIST:HANDOFF:/agent
```
