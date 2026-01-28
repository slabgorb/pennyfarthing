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

## Cyclist Working Directory

**Cyclist must be started from project root**, not from `packages/cyclist/`. The Claude subprocess inherits the working directory, and if started from the wrong place, agents can't access sprint files, session files, or other project resources.

Check with:
```bash
ps aux | grep cyclist  # Look at the cwd
```

If permissions are failing for project files, restart Cyclist from project root.

## Tailing Cyclist Logs

**Dev mode** (running via `just cyclist` or `npm run dev`):
```bash
tail -f /tmp/cyclist.log
```

**Packaged app** (no file logging by default):
```bash
# Kill existing and relaunch with log capture
pkill -f "Cyclist.app"
/Applications/Cyclist.app/Contents/MacOS/Cyclist 2>&1 | tee /tmp/cyclist-live.log
```

Search for errors:
```bash
grep -i -E "(error|warn|exception|fail)" /tmp/cyclist.log | tail -50
```

## Finding Project Root

**Use `.pennyfarthing/` as the marker**, not `pennyfarthing-dist/`.

The `.pennyfarthing/` directory is the most reliable marker - it's created by `pennyfarthing init` in any project using Pennyfarthing, and it exists at the monorepo root for dogfooding too.

`pennyfarthing-dist/` is problematic because:
- It exists as a symlink in `packages/core/` pointing to `../../pennyfarthing-dist`
- `findMonorepoRoot()` would find the symlink first and return wrong path

```typescript
// GOOD: Use .pennyfarthing as marker
if (existsSync(join(dir, '.pennyfarthing'))) {
  return dir;
}

// BAD: pennyfarthing-dist can be a symlink
if (existsSync(join(dir, 'pennyfarthing-dist'))) {
  return dir;  // Might return packages/core/ instead of root!
}
```

---

*Add gotchas discovered during development below*
