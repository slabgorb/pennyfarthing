"""
Hook CLI group — internal hooks called by Claude Code settings.

All hooks read JSON from stdin (Claude Code protocol) and output
JSON/text to stdout. Exit codes: 0=allow, 2=block (PreToolUse).

Usage in settings.local.json:
  "command": "pf hooks session-start"
  "command": "pf hooks bell-mode"
  "command": "pf hooks statusline"
"""

import click


@click.group(hidden=True)
def hooks():
    """Internal hooks (called by Claude Code settings)."""
    pass


@hooks.command("session-start")
def session_start():
    """SessionStart hook — session setup, WheelHub auto-start, OTEL config."""
    from pennyfarthing_scripts.hooks.session_start import main
    main()


@hooks.command("session-stop")
def session_stop():
    """Stop hook — save checkpoint for cross-session continuity."""
    from pennyfarthing_scripts.hooks.session_stop import main
    main()


@hooks.command("reflector-check")
def reflector_check():
    """Stop hook — enforce CYCLIST reflector markers on every turn."""
    from pennyfarthing_scripts.hooks.reflector_check import main
    main()


@hooks.command("pre-edit-check")
def pre_edit_check():
    """PreToolUse hook — block edits to protected files."""
    from pennyfarthing_scripts.hooks.pre_edit_check import main
    main()


@hooks.command("context-warning")
def context_warning():
    """PreToolUse hook — warn when context usage is high."""
    from pennyfarthing_scripts.hooks.context_warning import main
    main()


@hooks.command("context-breaker")
def context_breaker():
    """PreToolUse hook — block tool execution at critical context usage."""
    from pennyfarthing_scripts.hooks.context_breaker import main
    main()


@hooks.command("cyclist-pretooluse")
def cyclist_pretooluse():
    """PreToolUse hook — route approval through WheelHub when Cyclist is running."""
    from pennyfarthing_scripts.hooks.cyclist_pretooluse import main
    main()


@hooks.command("schema-validation")
def schema_validation():
    """PreToolUse hook — validate XML schema on Write operations."""
    from pennyfarthing_scripts.hooks.schema_validation import main
    main()


@hooks.command("bell-mode")
def bell_mode():
    """PostToolUse hook — bell queue + tandem observation injection."""
    from pennyfarthing_scripts.hooks.bell_mode import main
    main()


@hooks.command("sprint-yaml")
def sprint_yaml():
    """PostToolUse hook — validate sprint YAML after Edit/Write."""
    from pennyfarthing_scripts.hooks.sprint_yaml_validation import main
    main()


@hooks.command("statusline")
def statusline():
    """statusLine hook — render Claude Code status bar."""
    from pennyfarthing_scripts.hooks.statusline import main
    main()
