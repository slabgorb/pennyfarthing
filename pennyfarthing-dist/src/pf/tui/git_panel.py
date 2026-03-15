"""GitPanel — Multi-repo git status panel with diff drill-through for Frame TUI TUI.

Story 103-10: Subscribes to /ws/git, renders multi-repo git status
as Rich table with Nerd Font glyphs for branch and status indicators.

Merge: Changed panel consolidated into Git panel — clickable file list
with Enter to view diff inline, Escape to return to repo overview.
"""

from __future__ import annotations

import os
import re
from typing import Any

from rich.console import Group as RichGroup
from rich.syntax import Syntax
from rich.text import Text
from textual.binding import Binding

from pf.tui.base_panel import PANEL_ICONS, BasePanel


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


# ---- Diff rendering helpers (from diffs_panel.py patterns) ----

_LANG_MAP: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".java": "java",
    ".css": "css",
    ".html": "html",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".sh": "bash",
    ".zsh": "bash",
    ".toml": "toml",
    ".xml": "xml",
    ".sql": "sql",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
}


def _detect_language(path: str) -> str:
    """Detect programming language from file path for syntax highlighting."""
    ext = os.path.splitext(path)[1].lower()
    return _LANG_MAP.get(ext, "text")


def _highlight_code(code: str, language: str) -> Text:
    """Apply syntax highlighting to a single line."""
    if not code or not code.strip():
        return Text(code)
    try:
        syntax = Syntax(code, language, theme="monokai", background_color="default")
        highlighted = syntax.highlight(code)
        highlighted.rstrip()
        return highlighted
    except Exception:
        return Text(code)


def _render_inline_diff(diff_entry: dict[str, Any]) -> list[Any]:
    """Render a single file diff inline for drill-through view."""
    path = diff_entry.get("path", "unknown")
    status = diff_entry.get("status", "")
    additions = diff_entry.get("additions")
    deletions = diff_entry.get("deletions")
    raw_diff = diff_entry.get("diff", "")

    header = Text()
    header.append(path, style="bold cyan")
    if status:
        header.append(f"  {status}", style="dim")
    if additions is not None and deletions is not None:
        header.append(f"  +{additions} -{deletions}", style="dim")

    language = _detect_language(path)
    parts: list[Any] = [header]

    if not raw_diff or not raw_diff.strip():
        parts.append(Text("(no diff content)", style="dim italic"))
        return parts

    line_num = 0
    for line in raw_diff.split("\n"):
        if line.startswith("diff --git") or line.startswith("index "):
            continue
        if line.startswith("---") or line.startswith("+++"):
            continue
        if line.startswith("new file") or line.startswith("deleted file"):
            continue
        if line.startswith("rename "):
            continue
        if line == "":
            continue

        if line.startswith("Binary files"):
            parts.append(Text(line, style="dim italic"))
        elif line.startswith("@@"):
            match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", line)
            if match:
                line_num = int(match.group(1)) - 1
            parts.append(Text(line, style="cyan"))
        elif line.startswith("+"):
            line_num += 1
            t = Text()
            t.append(f"{line_num:4d} ", style="dim green")
            t.append_text(_highlight_code(line[1:], language))
            parts.append(t)
        elif line.startswith("-"):
            t = Text()
            t.append("   - ", style="red")
            t.append_text(_highlight_code(line[1:], language))
            parts.append(t)
        elif line.startswith(" "):
            line_num += 1
            t = Text()
            t.append(f"{line_num:4d} ", style="dim")
            t.append_text(_highlight_code(line[1:], language))
            parts.append(t)
        else:
            parts.append(Text(line, style="dim"))

    return parts


class GitPanel(BasePanel):
    """Multi-repo git status panel with diff drill-through.

    Subscribes to the ``git`` and ``diffs`` WebSocket channels.
    Renders git status for all configured repos. Clicking a file
    (Enter) shows its diff inline; Escape returns to the overview.
    """

    channel: str = "git"
    panel_name: str = "Git"
    icon: str = PANEL_ICONS["git"][0]
    can_focus = True

    BINDINGS = [
        Binding("up", "select_prev_key", "Up"),
        Binding("down", "select_next_key", "Down"),
        Binding("enter", "drill_into_file", "View diff"),
        Binding("escape", "back_to_overview", "Back"),
        Binding("c", "toggle_collapse", "Toggle collapse"),
    ]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._selected_index: int = 0
        self._file_paths: list[str] = []
        self._viewing_diff: bool = False
        self._diff_file_path: str | None = None
        self._diffs_payload: dict[str, Any] | None = None
        self._collapsed_repos: set[str] = set()
        self._user_toggled_repos: set[str] = set()

        # Subscribe to diffs channel for diff data
        if client is not None:
            client.subscribe("diffs", self._handle_diffs_message)

    def _handle_diffs_message(self, message: dict[str, Any] | None) -> None:
        """Store diffs payload for drill-through rendering."""
        if message is not None:
            self._diffs_payload = message
            # If viewing a diff, re-render with updated diff data
            if self._viewing_diff:
                self._rerender()

    def toggle_repo_collapsed(self, repo_name: str) -> None:
        """Toggle the collapsed state of a repo section."""
        self._user_toggled_repos.add(repo_name)
        if repo_name in self._collapsed_repos:
            self._collapsed_repos.discard(repo_name)
        else:
            self._collapsed_repos.add(repo_name)

    def is_repo_collapsed(self, repo_name: str) -> bool:
        """Query whether a repo section is currently collapsed."""
        return repo_name in self._collapsed_repos

    def action_toggle_collapse(self) -> None:
        """Keybinding action: toggle collapse for the repo under selection."""
        if self._viewing_diff or not self._last_payload:
            return
        # Find which repo the current selection belongs to
        repos = self._last_payload.get("repos", [])
        idx = 0
        for repo in repos:
            if not isinstance(repo, dict):
                continue
            name = repo.get("name", "")
            if self.is_repo_collapsed(name):
                continue
            dirty_files = repo.get("dirtyFiles", [])
            file_count = len([f for f in dirty_files if isinstance(f, dict)])
            if idx <= self._selected_index < idx + file_count:
                self.toggle_repo_collapsed(name)
                self._build_file_paths(self._last_payload)
                self._rerender()
                return
            idx += file_count

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming git message — build file path index then render."""
        if message is not None:
            # Set default collapse state for repos not explicitly toggled by user
            repos = message.get("repos", [])
            if isinstance(repos, list):
                for repo in repos:
                    if not isinstance(repo, dict):
                        continue
                    name = repo.get("name", "")
                    if not name:
                        continue
                    if name in self._user_toggled_repos:
                        continue
                    clean = repo.get("clean", True)
                    dirty_files = repo.get("dirtyFiles", [])
                    if not clean and dirty_files:
                        self._collapsed_repos.discard(name)
                    else:
                        self._collapsed_repos.add(name)
            self._build_file_paths(message)
        super().handle_message(message)

    def _build_file_paths(self, payload: dict[str, Any]) -> None:
        """Extract flat list of file paths from repos payload, skipping collapsed repos."""
        paths: list[str] = []
        repos = payload.get("repos", [])
        if isinstance(repos, list):
            for repo in repos:
                if not isinstance(repo, dict):
                    continue
                name = repo.get("name", "")
                if self.is_repo_collapsed(name):
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
        if not self._viewing_diff:
            self.select_next()

    def action_select_prev_key(self) -> None:
        """Binding action: move selection up."""
        if not self._viewing_diff:
            self.select_prev()

    def action_drill_into_file(self) -> None:
        """Enter diff drill-through for the selected file."""
        if self._viewing_diff:
            return
        if not self._file_paths:
            return
        if self._selected_index >= len(self._file_paths):
            return
        self._diff_file_path = self._file_paths[self._selected_index]
        self._viewing_diff = True
        self._rerender()

    def action_back_to_overview(self) -> None:
        """Return to the repo overview from diff view."""
        if self._viewing_diff:
            self._viewing_diff = False
            self._diff_file_path = None
            self._rerender()

    def _rerender(self) -> None:
        """Re-render panel with current payload."""
        if self._last_payload:
            try:
                self.update(self.render_panel(self._last_payload))
            except Exception:
                pass

    def _find_diff_for_path(self, path: str) -> dict[str, Any] | None:
        """Find a diff entry matching the given file path."""
        if self._diffs_payload is None:
            return None
        diffs = self._diffs_payload.get("diffs", [])
        for d in diffs:
            d_path = d.get("path", "")
            if d_path == path or d_path.endswith(path) or path.endswith(d_path):
                return d
        return None

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render git status or diff drill-through view."""
        if self._viewing_diff and self._diff_file_path:
            return self._render_diff_view()
        return self._render_repo_overview(payload)

    def _render_diff_view(self) -> Any:
        """Render inline diff for the selected file."""
        parts: list[Any] = []

        # Back bar
        back = Text()
        back.append("← ", style="bold")
        back.append("Esc", style="bold yellow")
        back.append(" back  ", style="dim")
        back.append(self._diff_file_path or "", style="bold cyan")
        parts.append(back)
        parts.append(Text(""))

        diff_entry = self._find_diff_for_path(self._diff_file_path or "")
        if diff_entry:
            parts.extend(_render_inline_diff(diff_entry))
        else:
            parts.append(Text(f"No diff available for {self._diff_file_path}", style="dim italic"))

        return RichGroup(*parts)

    def _render_repo_overview(self, payload: dict[str, Any]) -> Any:
        """Render git status as repo list with selectable file lists."""
        repos = payload.get("repos", [])
        if not repos:
            return Text("No repository data", style="dim italic")

        result = Text()
        flat_idx = 0
        for repo in repos:
            branch = repo.get("branch", "")
            ahead = repo.get("ahead", 0)
            behind = repo.get("behind", 0)
            clean = repo.get("clean", True)
            dirty_files = repo.get("dirtyFiles", [])
            name = repo.get("name", "")
            collapsed = self.is_repo_collapsed(name)

            # Build repo header line
            arrow = "▶" if collapsed else "▼"
            result.append(f"{arrow} ", style="bold")
            result.append(name, style="bold cyan")
            result.append(f"  \ue0a0 {branch}", style="dim")

            # Commits
            commit_parts = []
            if ahead:
                commit_parts.append(f"↑{ahead}")
            if behind:
                commit_parts.append(f"↓{behind}")
            result.append(f"  {' '.join(commit_parts) if commit_parts else '—'}", style="dim")

            # File breakdown
            result.append("  ")
            if collapsed and dirty_files:
                file_count = len(dirty_files)
                result.append(f"{file_count} file{'s' if file_count != 1 else ''}", style="yellow")
            else:
                result.append_text(_file_breakdown(dirty_files))

            # Status
            result.append("  ")
            if clean:
                result.append("✓ clean", style="green")
            else:
                result.append("✗ dirty", style="red")

            result.append("\n")

            # Expanded file list for dirty repos — with selection highlight
            if not collapsed and not clean and dirty_files:
                for f in dirty_files:
                    if not isinstance(f, dict):
                        continue
                    status_code = f.get("status", "  ")
                    path = f.get("path", "")
                    icon, label, style = _parse_file_status(status_code)
                    is_selected = flat_idx == self._selected_index
                    if is_selected:
                        result.append("  › ", style="bold reverse")
                    else:
                        result.append("    ")
                    result.append(icon, style=f"bold {style}")
                    result.append(
                        f" {path}",
                        style="bold cyan reverse" if is_selected else style,
                    )
                    result.append("\n")
                    flat_idx += 1

            result.append("\n")  # spacer

        # Hint line
        if self._file_paths:
            result.append("↑↓", style="bold yellow")
            result.append(" select  ", style="dim")
            result.append("Enter", style="bold yellow")
            result.append(" view diff", style="dim")

        return result
