# Step 7: Optional Tools

<step-meta>
step: 7
name: tools
workflow: installation-check
agent: devops
gate: false
next: step-08-summary
</step-meta>

<purpose>
Check optional components that enhance but are not required for core Pennyfarthing functionality. These include the Cyclist visual terminal and the pf Python CLI.
</purpose>

<prerequisites>
- Core installation verified (steps 1-6)
</prerequisites>

<instructions>
1. Run the doctor command for the tools category
2. For each result, explain what the tool provides and when it's needed:
   - **cyclist/installed**: Cyclist is the Electron visual terminal for Pennyfarthing. It provides a graphical UI with panels for sprint tracking, diffs, workflow visualization, and more. Not required for CLI-only usage.
   - **cyclist/node-pty**: node-pty powers the terminal panel in Cyclist. Without it, the embedded terminal won't work but other panels still function.
   - **cyclist/spawn-helper**: The native binary that node-pty uses to spawn processes. Must have execute permission on macOS/Linux. Missing permission causes `posix_spawnp` failures.
   - **tools/pf-cli**: The Python `pf` command provides agent activation (`pf agent start`), hook dispatch (`pf hooks`), and sprint management. Required for agent workflows. Installable via `uv tool install pennyfarthing-scripts` or `pipx install pennyfarthing-scripts`.
3. For missing tools, explain whether they're required or optional based on the user's workflow
4. Present the collaboration menu
</instructions>

<actions>
- Run: `pennyfarthing doctor --json --category tools`
- Check: Cyclist package location and node-pty health
- Check: `pf` CLI is available and reports a version
</actions>

<output>
Present results:

```markdown
## Optional Tools Check Results

### Cyclist Visual Terminal
| Check | Status | Detail |
|-------|--------|--------|
| installed | ... | ... |
| node-pty | ... | ... |
| spawn-helper | ... | ... |

### Python CLI
| Check | Status | Detail |
|-------|--------|--------|
| pf CLI | ... | ... |

### Recommendation
[Based on results, recommend which tools to install for the user's use case]
```
</output>

<collaboration-menu>
- **[F] Fix** - Run `pennyfarthing doctor --fix --category tools` to fix permissions or install pf CLI
- **[E] Explain** - Deep dive on a specific tool's purpose
- **[C] Continue** - Proceed to Summary
- **[R] Recheck** - Re-run after installing tools
</collaboration-menu>

<next-step>
After reviewing tools, proceed to step-08-summary.md for the final health report.
</next-step>

## Failure Modes

- Installing Cyclist when only CLI usage is needed (unnecessary complexity)
- spawn-helper permission issues after pnpm install (common on macOS)

## Success Metrics

- User understands which tools they need
- Required tools (pf CLI) are installed
- Optional tools have clear install path if wanted
