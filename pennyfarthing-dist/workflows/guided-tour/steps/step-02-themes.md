# Step 2: Theme Selection

<step-meta>
step: 2
name: themes
workflow: guided-tour
agent: orchestrator
gate: true
next: step-03-agents
</step-meta>

<purpose>
Explore Pennyfarthing's persona theme system. Each theme provides a cast of characters that bring personality to the agent roles. The user will browse available themes and optionally set one.
</purpose>

<prerequisites>
- Step 1 (Welcome) completed
- `.pennyfarthing/config.local.yaml` exists
</prerequisites>

<instructions>
1. Explain the theme system: each theme maps agent roles to fictional characters
2. List available themes using `pf theme list`
3. Show the current theme (if set) using `pf theme show`
4. Let the user browse a specific theme to see its character roster
5. Optionally set a theme using `pf theme set <name>`
</instructions>

<actions>
- Run: `pf theme list` to show available themes
- Run: `pf theme show` to display current theme details
- Run: `pf theme set <name>` if user wants to change
</actions>

<output>
Show the theme list and explain what themes do:

```markdown
## Persona Themes

Themes give each agent a character voice. For example, in the **discworld** theme:
- Dev → Ponder Stibbons (methodical wizard)
- Reviewer → Granny Weatherwax (sees through everything)
- SM → Captain Carrot (earnest, by-the-book)

Your current theme: {current_theme}

Available themes: {theme_list}
```
</output>

<gate>
## Completion Criteria
- [ ] User has seen the list of available themes
- [ ] User understands that themes map characters to agent roles
- [ ] Current theme is displayed (or user has selected one)
</gate>

<collaboration-menu>
- **[C] Continue** — Proceed to agent activation
- **[T] Try It** — Run `pf theme list` and `pf theme show`
- **[H] Help** — Explain how themes affect agent behavior
- **[S] Skip** — Keep current theme and move on
</collaboration-menu>
