"""
Hook CLI group — internal hooks called by Claude Code settings.

All hooks read JSON from stdin (Claude Code protocol) and output
JSON/text to stdout. Exit codes: 0=allow, 2=block (PreToolUse).

Usage in settings.local.json:
  "command": "pf hooks session-start"
  "command": "pf hooks statusline"
"""

import click


@click.group(hidden=True)
def hooks():
    """Internal hooks (called by Claude Code settings)."""
    pass


@hooks.command("dispatch")
@click.argument(
    "event",
    type=click.Choice(
        [
            "PreToolUse",
            "PostToolUse",
            "SessionStart",
            "Stop",
            "SessionEnd",
            "PreCompact",
        ]
    ),
)
def dispatch(event):
    """Run all hooks for EVENT in a single process."""
    from pf.hooks.dispatch import dispatch as run_dispatch

    run_dispatch(event)


@hooks.command("session-start")
def session_start():
    """SessionStart hook — session setup, Frame auto-start, OTEL config."""
    from pf.hooks.session_start import main

    main()


@hooks.command("session-stop")
def session_stop():
    """Stop hook — save checkpoint for cross-session continuity."""
    from pf.hooks.session_stop import main

    main()


@hooks.command("session-end")
def session_end():
    """SessionEnd hook — cleanup Frame TUI, tmux status, final checkpoint."""
    from pf.hooks.session_end import main

    main()


@hooks.command("pre-compact")
def pre_compact():
    """PreCompact hook — save context checkpoint before compaction."""
    from pf.hooks.pre_compact import main

    main()


@hooks.command("pre-edit-check")
def pre_edit_check():
    """PreToolUse hook — block edits to protected files."""
    from pf.hooks.pre_edit_check import main

    main()


@hooks.command("advisory-never-edit-zone")
def advisory_never_edit_zone():
    """PreToolUse hook — advise (never block) when editing a repos.yaml never-edit zone."""
    from pf.hooks.advisory_never_edit_zone import main

    main()


@hooks.command("advisory-model-tier")
def advisory_model_tier():
    """PreToolUse hook — advise (never block) when the session model doesn't match the phase's expected tier."""
    from pf.hooks.advisory_model_tier import main

    main()


@hooks.command("context-warning")
def context_warning():
    """PreToolUse hook — warn when context usage is high."""
    from pf.hooks.context_warning import main

    main()


@hooks.command("context-breaker")
def context_breaker():
    """PreToolUse hook — block tool execution at critical context usage."""
    from pf.hooks.context_breaker import main

    main()


@hooks.command("branch-protection")
def branch_protection():
    """PreToolUse hook — block commits/pushes to protected branches."""
    from pf.hooks.branch_protection import main

    main()


@hooks.command("pretooluse-forward")
def pretooluse_forward():
    """PreToolUse hook — forward tool inputs to Frame for audit log enrichment."""
    from pf.hooks.pretooluse_forward import main

    main()


@hooks.command("schema-validation")
def schema_validation():
    """PreToolUse hook — validate XML schema on Write operations."""
    from pf.hooks.schema_validation import main

    main()


@hooks.command("sprint-yaml")
def sprint_yaml():
    """PostToolUse hook — validate sprint YAML after Edit/Write."""
    from pf.hooks.sprint_yaml_validation import main

    main()


@hooks.command("agent-reload")
def agent_reload():
    """SessionStart hook — reload active agent after compact/clear."""
    from pf.hooks.agent_reload import main

    main()


@hooks.command("statusline")
def statusline():
    """statusLine hook — render Claude Code status bar."""
    from pf.hooks.statusline import main

    main()
