# Dev Agent Gotchas

Lessons learned from debugging sessions.

## Pennyfarthing Installation

**Always use GitHub install:**
```bash
# CORRECT
npm install github:1898andCo/pennyfarthing

# WRONG - not published to npm
npm link pennyfarthing
```

The `pennyfarthing-dist/` directory is committed to repo but not generated during install.

## Symlink Structure

After install, `.claude/` contains symlinks to `node_modules/pennyfarthing/pennyfarthing-dist/`. If commands don't show, reinstall from GitHub.

## Remove Unused Code

When code becomes unused, **delete it immediately**. Don't ask.

## Tool IDs Are Useless

**NEVER show raw `tool_id` / `toolu_*` to users.** Display tool name instead.

## Cyclist Approval Gate

Claude Code's **PreToolUse hooks** are the only way to control tool execution externally. The hook script runs synchronously - Claude Code waits for it.

Key flow:
1. Hook receives tool info via stdin
2. Hook sends HTTP POST to Cyclist
3. Cyclist shows modal if approval needed
4. Hook outputs JSON with `permissionDecision`
5. Claude Code allows/blocks based on decision

---

*Add gotchas discovered during development below*
