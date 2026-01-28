# ADR-0002: Context Budget Optimization

**Status:** Superseded
**Date:** 2026-01-03
**Author:** Michael (with analysis assist)
**Superseded by:** ADR-0015 (Prime Activation System addresses context loading)
**Note:** The Prime system implements lazy context loading with `--minimal` and `--full` flags, addressing the core concern. Claude Code's skill system has also evolved since this ADR was written.

## Context

Pennyfarthing currently consumes ~68k/200k tokens (34%) at session start before any work begins. This includes:

- System tools: 18k tokens (Claude Code built-in, not controllable)
- Skills/commands: ~45k tokens (Pennyfarthing-controlled)
- Custom agents: 285 tokens
- Memory files: 1.1k tokens

Claude Code loads ALL files from `commands/*.md` and `skills/*/SKILL.md` into context at startup. Many of these are infrequently used but consume significant context budget.

### Biggest Consumers

| File | Size | Tokens (est.) | Usage Frequency |
|------|------|---------------|-----------------|
| commands/theme-maker.md | 19KB | ~4,800 | Rarely |
| commands/benchmark.md | 12KB | ~3,100 | Occasional |
| skills/judge/SKILL.md | 12KB | ~3,000 | Benchmarking only |
| commands/solo.md | 9KB | ~2,200 | Occasional |
| commands/sync-work-with-sprint.md | 9KB | ~2,200 | Rarely |
| commands/create-branches-from-story.md | 8KB | ~2,100 | Rarely |
| commands/git-cleanup.md | 8KB | ~2,100 | Rarely |

**Total from infrequently-used commands: ~19,500 tokens (~10% of budget)**

## Decision

*To be determined after review.*

The following options are under consideration:

### Option A: Lazy Loading Pattern (Recommended)

Move command implementations to separate files, leave minimal stubs in `commands/`:

```markdown
# theme-maker.md (stub - ~100 tokens instead of 4,800)
Creates custom persona themes interactively.
Usage: /theme-maker

Implementation: Read pennyfarthing-dist/commands-impl/theme-maker-full.md
```

The agent reads the full implementation only when the command is invoked.

**Pros:**
- No functionality loss
- Transparent to users
- Biggest context savings

**Cons:**
- Requires refactoring all large commands
- Two-step invocation (stub → full)
- May confuse agents if stub is too minimal

### Option B: Command Profiles

Create different command sets for different workflows:

```
commands/           # Core TDD (sm, tea, dev, reviewer, work)
commands-bench/     # Benchmarking (benchmark, solo, judge, finalize-run)
commands-admin/     # Admin/setup (theme-maker, git-cleanup, health-check)
```

Users symlink the profile they need for their session.

**Pros:**
- Clean separation of concerns
- Explicit user control
- Easy to understand

**Cons:**
- Requires user action to switch profiles
- Might forget to switch back
- Additional symlink management

### Option C: Trim Command Verbosity

Many commands include extensive examples and edge cases. Reduce to essentials:

- theme-maker: 19KB → ~5KB (remove extensive examples)
- benchmark: 12KB → ~4KB (move edge cases to separate doc)

**Pros:**
- No structural changes
- Quick wins
- Backwards compatible

**Cons:**
- May lose helpful context for complex commands
- Requires careful editing to preserve essential info
- Lower savings than other options

### Option D: Combined Approach

1. **Phase 1:** Trim verbosity on all large commands (quick win)
2. **Phase 2:** Implement lazy loading for commands >5KB
3. **Phase 3:** Consider profiles for specialized workflows (benchmarking)

## Consequences

### If Implemented

**Positive:**
- Recover 10-15% of context budget (~20-30k tokens)
- More headroom for complex multi-file operations
- Faster session starts (less to parse)
- Better experience for large codebase work

**Negative:**
- Migration effort required
- Potential for breaking changes if stubs are too minimal
- May need documentation updates

**Neutral:**
- User-facing command behavior unchanged
- No impact on command functionality

### If Not Implemented

- Context budget remains constrained
- May need to prioritize other optimization paths (smarter context loading, session splitting)
- Acceptable if other priorities are higher

## Questions for Keith

1. Is lazy loading worth the structural complexity?
2. Should this be prioritized over current backlog items?
3. Are there commands we could deprecate entirely?
4. Would command profiles (Option B) be acceptable UX?
5. Should user-level skills (`~/.claude/commands/`) also be audited?

## Estimated Savings by Option

| Approach | Token Savings | Effort | Risk |
|----------|---------------|--------|------|
| Trim verbosity (C) | 8-10k | Low | Low |
| Lazy loading (A) | 15-18k | Medium | Medium |
| Command profiles (B) | 15-18k | Low | Low |
| Combined (D) | 20-25k | Medium | Low |

## References

- Context usage measured via `/context` command
- File sizes via `wc -c` on command files
- Token estimates at ~4 chars/token ratio
