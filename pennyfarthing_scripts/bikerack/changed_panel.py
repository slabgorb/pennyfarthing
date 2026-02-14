"""ChangedPanel — Changed file list with status for BikeRack TUI.

Story 103-14: Subscribes to /ws/git, extracts dirtyFiles from all repos,
renders Rich table with file path, change type icon, and status.
"""

from __future__ import annotations

from typing import Any

from rich.table import Table
from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel

# Status code → (icon, label, style)
_STATUS_MAP: dict[str, tuple[str, str, str]] = {
    "M": ("~", "Modified", "yellow"),
    "A": ("+", "Added", "green"),
    "D": ("-", "Deleted", "red"),
    "?": ("?", "Untracked", "dim"),
    "R": ("→", "Renamed", "cyan"),
}

_DEFAULT_STATUS: tuple[str, str, str] = ("·", "Changed", "yellow")


def _parse_status(status: str) -> tuple[str, str, str]:
    """Parse 2-char git status code into (icon, label, style).

    First char = index (staging area), second char = working tree.
    Uses the most significant non-space character.
    """
    if len(status) < 2:
        return _STATUS_MAP.get(status[:1], _DEFAULT_STATUS)

    idx, wt = status[0], status[1]

    # Untracked: both chars are '?'
    if idx == "?" and wt == "?":
        return _STATUS_MAP["?"]

    # Index change takes priority if present
    if idx not in (" ", "?"):
        return _STATUS_MAP.get(idx, _DEFAULT_STATUS)

    # Working tree change
    if wt not in (" ", "?"):
        return _STATUS_MAP.get(wt, _DEFAULT_STATUS)

    return _DEFAULT_STATUS


class ChangedPanel(BasePanel):
    """Changed file list panel.

    Subscribes to the ``git`` WebSocket channel and renders
    dirty files from all repos as a Rich table with file path,
    change type icon, and status.
    """

    channel: str = "git"
    panel_name: str = "Changed"
    icon: str = PANEL_ICONS["changed"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render changed file data from WebSocket payload."""
        repos = payload.get("repos", [])
        if not isinstance(repos, list):
            return Text("No changed files", style="dim italic")

        files: list[tuple[str, dict[str, Any]]] = []
        for repo in repos:
            if not isinstance(repo, dict):
                continue
            repo_name = repo.get("name", "")
            dirty_files = repo.get("dirtyFiles", [])
            if not isinstance(dirty_files, list):
                continue
            for f in dirty_files:
                if not isinstance(f, dict):
                    continue
                files.append((repo_name, f))

        if not files:
            return Text("No changed files", style="dim italic")

        table = Table()
        table.add_column("", width=2)
        table.add_column("File", style="cyan")
        table.add_column("Status")
        table.add_column("Repo", style="dim")

        for repo_name, f in files:
            status_code = f.get("status", "  ")
            path = f.get("path", "")
            icon, label, style = _parse_status(status_code)
            table.add_row(
                Text(icon, style=f"bold {style}"),
                path,
                Text(label, style=style),
                repo_name,
            )

        return table
