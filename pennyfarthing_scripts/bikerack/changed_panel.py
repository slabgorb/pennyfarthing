"""ChangedPanel — Changed file list with status for BikeRack TUI.

Story 103-14: Subscribes to /ws/git, extracts dirtyFiles from all repos,
renders Rich table with file path, change type icon, and status.
"""

from __future__ import annotations

from typing import Any

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
        """Render changed files grouped by repository."""
        repos = payload.get("repos", [])
        if not isinstance(repos, list):
            return Text("No changed files", style="dim italic")

        # Group files by repo
        repo_files: dict[str, list[dict[str, Any]]] = {}
        for repo in repos:
            if not isinstance(repo, dict):
                continue
            repo_name = repo.get("name", "unknown")
            dirty_files = repo.get("dirtyFiles", [])
            if not isinstance(dirty_files, list) or not dirty_files:
                continue
            repo_files[repo_name] = [f for f in dirty_files if isinstance(f, dict)]

        if not repo_files:
            return Text("No changed files", style="dim italic")

        from rich.console import Group as RichGroup

        parts: list[Any] = []
        for repo_name, files in repo_files.items():
            count = len(files)
            label = "file" if count == 1 else "files"
            header = Text()
            header.append(repo_name, style="bold cyan")
            header.append(f" ({count} {label})", style="dim")
            parts.append(header)

            for f in files:
                status_code = f.get("status", "  ")
                path = f.get("path", "")
                icon, label_text, style = _parse_status(status_code)
                line = Text()
                line.append("  ")
                line.append(icon, style=f"bold {style}")
                line.append(f" {path}", style="cyan")
                line.append(f"  {label_text}", style=style)
                parts.append(line)

            parts.append(Text(""))  # spacer between repos

        return RichGroup(*parts)
