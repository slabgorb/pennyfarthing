"""ChangedPanel — Changed file list with status for BikeRack TUI.

Story 103-14: Subscribes to /ws/git, extracts dirtyFiles from all repos,
renders Rich table with file path, change type icon, and status.

Story 110-1: Selectable file list with arrow navigation and Enter to navigate.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text
from textual.binding import Binding

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel

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
    change type icon, and status. Supports arrow-key selection
    and Enter to navigate to diffs.
    """

    channel: str = "git"
    panel_name: str = "Changed"
    icon: str = PANEL_ICONS["changed"][0]
    can_focus = True

    BINDINGS = [
        Binding("up", "select_prev_key", "Up"),
        Binding("down", "select_next_key", "Down"),
        Binding("enter", "select_file", "Select file"),
    ]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._selected_index: int = 0
        self._file_paths: list[str] = []

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming message — build file path index then render."""
        if message is not None:
            self._build_file_paths(message)
        super().handle_message(message)

    def _build_file_paths(self, payload: dict[str, Any]) -> None:
        """Extract flat list of file paths from repos payload."""
        paths: list[str] = []
        repos = payload.get("repos", [])
        if isinstance(repos, list):
            for repo in repos:
                if not isinstance(repo, dict):
                    continue
                dirty_files = repo.get("dirtyFiles", [])
                if not isinstance(dirty_files, list):
                    continue
                for f in dirty_files:
                    if isinstance(f, dict):
                        path = f.get("path", "")
                        if path:
                            paths.append(path)
        self._file_paths = paths
        if self._selected_index >= len(paths):
            self._selected_index = max(0, len(paths) - 1)

    def select_next(self) -> None:
        """Move selection to the next file."""
        if self._file_paths and self._selected_index < len(self._file_paths) - 1:
            self._selected_index += 1
            self._rerender()

    def select_prev(self) -> None:
        """Move selection to the previous file."""
        if self._selected_index > 0:
            self._selected_index -= 1
            self._rerender()

    def action_select_next_key(self) -> None:
        """Binding action: move selection down."""
        self.select_next()

    def action_select_prev_key(self) -> None:
        """Binding action: move selection up."""
        self.select_prev()

    def _rerender(self) -> None:
        """Re-render panel with current payload after selection change."""
        if self._last_payload:
            try:
                self.update(self.render_panel(self._last_payload))
            except Exception:
                pass

    def get_selected_path(self) -> str | None:
        """Return the currently selected file path, or None if empty."""
        if not self._file_paths:
            return None
        if self._selected_index >= len(self._file_paths):
            return None
        return self._file_paths[self._selected_index]

    def action_select_file(self) -> None:
        """Post NavigateToFile event for the selected file."""
        path = self.get_selected_path()
        if path is not None:
            from pf.bikerack.events import NavigateToFile

            self.post_message(NavigateToFile(path=path))

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render changed files grouped by repository with selection highlight."""
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
        flat_idx = 0
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
                is_selected = flat_idx == self._selected_index
                line = Text()
                if is_selected:
                    line.append("› ", style="bold reverse")
                else:
                    line.append("  ")
                line.append(icon, style=f"bold {style}")
                line.append(f" {path}", style="bold cyan reverse" if is_selected else "cyan")
                line.append(f"  {label_text}", style=style)
                parts.append(line)
                flat_idx += 1

            parts.append(Text(""))  # spacer between repos

        return RichGroup(*parts)
