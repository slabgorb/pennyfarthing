# Step 5: Hooks & Configuration

<step-meta>
step: 5
name: config
workflow: guided-tour
agent: orchestrator
gate: true
next: complete
</step-meta>

<purpose>
Explore Pennyfarthing's hook system and configuration options. Hooks intercept Claude Code events (session start, tool use, stop) to add framework behavior. Configuration lives in `.pennyfarthing/config.local.yaml`.
</purpose>

<prerequisites>
- Step 4 (Sprint) completed
- `.pennyfarthing/config.local.yaml` exists
</prerequisites>

<instructions>
1. Explain the hook system: hooks intercept Claude Code lifecycle events
2. List the key hooks: session-start, bell-mode, reflector-check, pre-edit-check
3. Show the config file structure and key settings
4. Explain workflow settings: permission_mode, relay_mode, bell_mode
5. Show how to view current settings with `pf settings show`
6. Summarize the tour and suggest next steps
</instructions>

<actions>
- Read: `.pennyfarthing/config.local.yaml` to show current settings
- Run: `pf settings show` if available
- Show: hook list and what each one does
</actions>

<output>
Present hooks and config overview:

```markdown
## Hooks & Configuration

**Hooks** intercept Claude Code events to add framework behavior:

| Hook | Event | Purpose |
|------|-------|---------|
| session-start | SessionStart | Setup, welcome banner, WheelHub |
| bell-mode | PostToolUse | Message queue injection |
| pre-edit-check | PreToolUse | Block edits to protected files |
| reflector-check | Stop | Enforce Cyclist markers |

**Configuration** in `.pennyfarthing/config.local.yaml`:
```yaml
theme: discworld
workflow:
  permission_mode: manual  # plan, manual, accept
  relay_mode: false         # auto-handoff between agents
  bell_mode: false          # message queue injection
```

## Tour Complete!

You've explored Pennyfarthing's five key areas. Next steps:
- Run `/pf-sprint work` to pick up a story
- Run `/pf-help` for command reference anytime
- Check the getting-started guide for deeper documentation
```
</output>

<gate>
## Completion Criteria
- [ ] User has seen the hook system overview
- [ ] User understands the config file structure
- [ ] User knows where to go next (sprint work, help, guides)
</gate>

<collaboration-menu>
- **[C] Continue** — Complete the tour
- **[T] Try It** — View your config file or run `pf settings show`
- **[H] Help** — Deep dive on a specific hook or setting
- **[S] Skip** — Finish the tour
</collaboration-menu>
