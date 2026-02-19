"""GitPanel — Multi-repo git status panel for BikeRack TUI.

Story 103-10: Subscribes to /ws/git, renders multi-repo git status
as Rich table with Nerd Font glyphs for branch and status indicators.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel


def _file_breakdown(dirty_files: list[dict]) -> Text:
    """Break down dirty files into +staged ~modified ?untracked counts."""
    staged = 0
    modified = 0
    untracked = 0
    for f in dirty_files:
        if not isinstance(f, dict):
            continue
        status = f.get("status", "  ")
        idx = status[0] if len(status) >= 1 else " "
        wt = status[1] if len(status) >= 2 else " "
        if idx == "?" and wt == "?":
            untracked += 1
        elif idx not in (" ", "?"):
            staged += 1
        elif wt not in (" ", "?"):
            modified += 1

    parts = Text()
    parts.append(f"+{staged}", style="green")
    parts.append(" ")
    parts.append(f"~{modified}", style="yellow")
    parts.append(" ")
    parts.append(f"?{untracked}", style="dim")
    return parts


_FILE_STATUS_MAP: dict[str, tuple[str, str, str]] = {
    "M": ("~", "Modified", "yellow"),
    "A": ("+", "Added", "green"),
    "D": ("-", "Deleted", "red"),
    "?": ("?", "Untracked", "dim"),
    "R": ("→", "Renamed", "cyan"),
}


def _parse_file_status(status: str) -> tuple[str, str, str]:
    """Parse git status code into (icon, label, style)."""
    if len(status) < 2:
        return _FILE_STATUS_MAP.get(status[:1], ("·", "Changed", "yellow"))
    idx, wt = status[0], status[1]
    if idx == "?" and wt == "?":
        return _FILE_STATUS_MAP["?"]
    if idx not in (" ", "?"):
        return _FILE_STATUS_MAP.get(idx, ("·", "Changed", "yellow"))
    if wt not in (" ", "?"):
        return _FILE_STATUS_MAP.get(wt, ("·", "Changed", "yellow"))
    return ("·", "Changed", "yellow")


class GitPanel(BasePanel):
    """Multi-repo git status panel.

    Subscribes to the ``git`` WebSocket channel and renders
    git status for all configured repos as a Rich table with
    columns: Repository, Branch, Commits, Changes, Status.
    """

    channel: str = "git"
    panel_name: str = "Git"
    icon: str = PANEL_ICONS["git"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render git status as Rich Tree with expandable file lists."""
        from rich.console import Group as RichGroup

        repos = payload.get("repos", [])
        if not repos:
            return Text("No repository data", style="dim italic")

        parts: list[Any] = []
        for repo in repos:
            branch = repo.get("branch", "")
            ahead = repo.get("ahead", 0)
            behind = repo.get("behind", 0)
            clean = repo.get("clean", True)
            dirty_files = repo.get("dirtyFiles", [])
            name = repo.get("name", "")

            # Build repo header line
            header = Text()
            arrow = "▼" if not clean and dirty_files else "▶"
            header.append(f"{arrow} ", style="bold")
            header.append(name, style="bold cyan")
            header.append(f"  \ue0a0 {branch}", style="dim")

            # Commits
            commit_parts = []
            if ahead:
                commit_parts.append(f"↑{ahead}")
            if behind:
                commit_parts.append(f"↓{behind}")
            header.append(f"  {' '.join(commit_parts) if commit_parts else '—'}", style="dim")

            # File breakdown
            header.append("  ")
            header.append_text(_file_breakdown(dirty_files))

            # Status
            header.append("  ")
            if clean:
                header.append("✓ clean", style="green")
            else:
                header.append("✗ dirty", style="red")

            parts.append(header)

            # Expanded file list for dirty repos
            if not clean and dirty_files:
                for f in dirty_files:
                    if not isinstance(f, dict):
                        continue
                    status_code = f.get("status", "  ")
                    path = f.get("path", "")
                    icon, label, style = _parse_file_status(status_code)
                    file_line = Text()
                    file_line.append("    ")
                    file_line.append(icon, style=f"bold {style}")
                    file_line.append(f" {path}", style=style)
                    parts.append(file_line)

            parts.append(Text(""))  # spacer

        return RichGroup(*parts)
