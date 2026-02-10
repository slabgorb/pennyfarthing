#!/usr/bin/env python3
"""
Welcome Hook (Python)

Display a friendly welcome message on session start.

For CLI: Displays ASCII art of a penny-farthing bicycle
For Cyclist: Sends WebSocket message to display logo and welcome

Called by Claude Code SessionStart hook.

Story: MSSCI-12409 - Hook consistency and WheelHub consolidation
"""

import json
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from hooks import (
    find_project_root,
    is_cyclist_running,
    load_settings,
    send_to_cyclist,
)

# Once-per-session guard
_welcome_shown_file: Path | None = None


def get_welcome_lock_path(project_root: Path) -> Path:
    """Get path to welcome shown lock file."""
    session_id = os.environ.get("CLAUDE_SESSION_ID", str(os.getpid()))
    session_dir = project_root / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir / f".welcome-shown-{session_id}"


def was_welcome_shown(project_root: Path) -> bool:
    """Check if welcome was already shown for this session."""
    lock_path = get_welcome_lock_path(project_root)
    return lock_path.exists()


def mark_welcome_shown(project_root: Path) -> None:
    """Mark welcome as shown for this session."""
    lock_path = get_welcome_lock_path(project_root)
    lock_path.touch()


def get_project_name(project_root: Path) -> str:
    """Get project name from package.json or directory name."""
    package_json = project_root / "package.json"
    if package_json.exists():
        try:
            with open(package_json) as f:
                data = json.load(f)
                name = data.get("name")
                if name:
                    return name
        except (json.JSONDecodeError, OSError):
            pass

    return project_root.name


def get_theme(project_root: Path) -> str | None:
    """Get current theme from settings."""
    settings = load_settings(project_root)
    return settings.theme


def display_cli_welcome(project_name: str, theme: str | None) -> None:
    """Display ASCII art welcome for CLI mode."""
    print("""
       ___
      /   \\
     |     |     Welcome to
     |     |    ╔═══════════════════════════════════╗
      \\___/     ║   ╔═╗╔═╗╔╗╔╔╗╔╦═╗╔═╗╔═╗╔═╗╦╔═╗   ║
        ║       ║   ╠═╝║╣ ║║║║║║ ╠╣ ╠═╣╠╦╝ ║ ╠═╣   ║
        ║       ║   ╩  ╚═╝╝╚╝╝╚╝╩  ╩ ╩╩╚═ ╩ ╩ ╩   ║
      ╔═╩═╗     ╚═══════════════════════════════════╝
     /     \\
    │   O   │   Agent-powered development with style
     \\     /
      ╚═══╝
""")

    if project_name:
        print(f"    Project: {project_name}")
    if theme:
        print(f"    Theme:   {theme}")
    print()


def send_cyclist_welcome(project_root: Path, project_name: str, theme: str | None) -> None:
    """Send welcome message to Cyclist via WebSocket API."""
    try:
        send_to_cyclist(
            endpoint="/api/welcome",
            data={
                "project": project_name or "",
                "theme": theme or "",
            },
            project_root=project_root,
            timeout=5,
        )
    except Exception:
        # Ignore errors - don't block hook
        pass


def main() -> None:
    """Main entry point for SessionStart welcome hook."""
    try:
        # Read and discard stdin (required by hook protocol)
        sys.stdin.read()

        # Find project root
        project_root = find_project_root()
        if not project_root:
            sys.exit(0)

        # Check if welcome was already shown for this session
        if was_welcome_shown(project_root):
            sys.exit(0)

        # Mark welcome as shown
        mark_welcome_shown(project_root)

        # Get project info
        project_name = get_project_name(project_root)
        theme = get_theme(project_root)

        # Check if running in Cyclist
        if is_cyclist_running(project_root):
            # Send welcome via WebSocket API
            send_cyclist_welcome(project_root, project_name, theme)
        else:
            # CLI mode - display ASCII art
            display_cli_welcome(project_name, theme)

        sys.exit(0)

    except Exception as e:
        # On error, exit silently
        print(f"[welcome-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
