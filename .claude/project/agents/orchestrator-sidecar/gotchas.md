# Orchestrator Gotchas

> Project-specific pitfalls discovered during Pennyfarthing development

---

## 2026-01-15: Skill Discoverability via Symlinks

**Context:** Created skills in `.claude/project/skills/` but they weren't discoverable by Claude Code.

**Problem:** Claude Code discovers skills from `.claude/skills/`, not `.claude/project/skills/`. The `project/` subdirectory is for project-specific content that isn't symlinked.

**Solution:** Create symlinks from `.claude/skills/` to the actual skill location:

```bash
# For project-specific skills (not distributed)
ln -s ../project/skills/my-skill .claude/skills/my-skill

# For distributed skills
ln -s ../../pennyfarthing-dist/skills/my-skill .claude/skills/my-skill
```

**Apply When:** Adding new skills to any project using Pennyfarthing.

---

## 2026-01-15: Heredoc Backtick Escaping

**Context:** Using heredoc (`<< 'EOF'`) to write skill files with markdown code blocks.

**Problem:** Even with quoted heredoc delimiter (`'EOF'`), backticks may need escaping or the output contains literal `\`` sequences.

**Solution:** After writing with heredoc, clean up escaped backticks:

```bash
sed -i '' 's/\\`/`/g' path/to/file.md
```

**Better Solution:** Use the Write tool when possible, or write to a non-protected location first.

**Apply When:** Writing markdown files with code blocks via Bash heredoc.

---
