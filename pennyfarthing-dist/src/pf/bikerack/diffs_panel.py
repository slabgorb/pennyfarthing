"""DiffsPanel — Rich diff rendering with syntax highlighting for BikeRack TUI.

Story 103-18: Subscribes to /ws/diffs, renders file diffs with syntax
highlighting using Rich. File headers, added/removed line coloring, line numbers.

Story 103-19: Large diff handling — truncation at 1000 lines, pagination,
temp file storage for very large diffs (>5000 lines), non-blocking rendering.
"""

from __future__ import annotations

import os
import re
import tempfile
from typing import Any

from rich.console import Group
from rich.syntax import Syntax
from rich.text import Text
from textual.binding import Binding

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel

#: Default max content lines rendered per page before truncation kicks in.
DEFAULT_LINE_LIMIT = 1000

#: Diffs with more raw lines than this threshold are written to temp files.
TEMP_FILE_THRESHOLD = 5000

#: Skip syntax highlighting for diffs larger than this to maintain rendering performance.
#: At 5000+ lines, syntax highlighting cost becomes prohibitive for <100ms frame time.
HIGHLIGHT_THRESHOLD = 5000


class DiffsPanel(BasePanel):
    """Diff rendering panel with syntax highlighting.

    Subscribes to the ``diffs`` WebSocket channel and renders
    file diffs with syntax highlighting, colored added/removed lines,
    file headers, and line numbers.

    Large diffs (>1000 content lines) are truncated with a text indicator
    and support pagination via ``next_page()`` / ``prev_page()``.
    Very large diffs (>5000 lines) use temp file storage for memory efficiency.
    """

    channel: str = "diffs"
    panel_name: str = "Diffs"
    icon: str = PANEL_ICONS["diffs"][0]
    can_focus = True

    BINDINGS = [
        Binding("n", "next_file_key", "Next file"),
        Binding("p", "prev_file_key", "Prev file"),
    ]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._current_page: int = 0
        self._max_page: int = 0
        self._temp_files: list[str] = []
        self._current_file_index: int = 0
        self._total_files: int = 0

    def next_page(self) -> None:
        """Advance to the next page of truncated diff content."""
        if self._current_page < self._max_page:
            self._current_page += 1

    def prev_page(self) -> None:
        """Go back to the previous page of truncated diff content."""
        if self._current_page > 0:
            self._current_page -= 1

    def next_file(self) -> None:
        """Advance to the next file."""
        if self._current_file_index < self._total_files - 1:
            self._current_file_index += 1
            if self._last_payload:
                rendered = self.render_panel(self._last_payload)
                try:
                    self.update(rendered)
                except Exception:
                    pass

    def prev_file(self) -> None:
        """Go back to the previous file."""
        if self._current_file_index > 0:
            self._current_file_index -= 1
            if self._last_payload:
                rendered = self.render_panel(self._last_payload)
                try:
                    self.update(rendered)
                except Exception:
                    pass

    def navigate_to_file(self, path: str) -> None:
        """Jump to a specific file by path. No-op if not found."""
        if self._last_payload is None:
            return
        diffs = self._last_payload.get("diffs", [])
        for i, d in enumerate(diffs):
            if d.get("path") == path:
                self._current_file_index = i
                rendered = self.render_panel(self._last_payload)
                try:
                    self.update(rendered)
                except Exception:
                    pass
                return

    def action_next_file_key(self) -> None:
        """Binding action: advance to next file."""
        self.next_file()

    def action_prev_file_key(self) -> None:
        """Binding action: go to previous file."""
        self.prev_file()

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket message with pagination reset and temp management."""
        if not self._mounted or message is None:
            return
        self._current_page = 0
        self._current_file_index = 0
        self._cleanup_temp_files()
        self._store_large_diffs(message)
        super().handle_message(message)

    def on_unmount(self) -> None:
        """Clean up temp files and mark panel as unmounted."""
        self._cleanup_temp_files()
        super().on_unmount()

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render diff data showing one file at a time with file selector header."""
        diffs = payload.get("diffs", [])
        if not diffs:
            return Text("No diffs yet", style="dim italic")

        self._total_files = len(diffs)

        # Clamp file index
        if self._current_file_index >= len(diffs):
            self._current_file_index = len(diffs) - 1

        parts: list[Any] = []

        # File selector header
        selector = Text()
        selector.append("Files: ", style="dim")
        for i, d in enumerate(diffs):
            path = d.get("path", "unknown")
            additions = d.get("additions")
            deletions = d.get("deletions")
            stats = ""
            if additions is not None and deletions is not None:
                stats = f" +{additions} -{deletions}"

            if i == self._current_file_index:
                selector.append(f"[{i + 1}/{len(diffs)}] ", style="bold")
                selector.append(path, style="bold cyan")
                if stats:
                    selector.append(stats, style="bold dim")
            else:
                selector.append(path, style="dim")
                if stats:
                    selector.append(stats, style="dim")

            if i < len(diffs) - 1:
                selector.append("  |  ", style="dim")

        parts.append(selector)
        parts.append(Text("n:next  p:prev", style="dim"))
        parts.append(Text(""))

        # Render only current file's diff
        diff_entry = diffs[self._current_file_index]
        raw_diff = diff_entry.get("diff", "")
        skip_highlight = raw_diff.count("\n") > HIGHLIGHT_THRESHOLD

        file_parts, total_lines = _render_file_diff(
            diff_entry,
            page=self._current_page,
            page_size=DEFAULT_LINE_LIMIT,
            skip_highlight=skip_highlight,
        )
        parts.extend(file_parts)

        # Track max page for pagination bounds
        if total_lines > DEFAULT_LINE_LIMIT:
            self._max_page = -(-total_lines // DEFAULT_LINE_LIMIT) - 1
        else:
            self._max_page = 0

        return Group(*parts)

    def _store_large_diffs(self, message: dict[str, Any]) -> None:
        """Write very large diffs to temp files for memory-efficient access."""
        diffs = message.get("diffs", [])
        for diff_entry in diffs:
            raw_diff = diff_entry.get("diff", "")
            if raw_diff.count("\n") > TEMP_FILE_THRESHOLD:
                fd, path = tempfile.mkstemp(prefix="bikerack_diff_", suffix=".diff")
                with os.fdopen(fd, "w") as f:
                    f.write(raw_diff)
                self._temp_files.append(path)

    def _cleanup_temp_files(self) -> None:
        """Remove any temp files created for large diff storage."""
        for path in self._temp_files:
            try:
                os.unlink(path)
            except OSError:
                pass
        self._temp_files.clear()


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
    """Apply syntax highlighting to a single line using rich.syntax.Syntax."""
    if not code or not code.strip():
        return Text(code)
    try:
        syntax = Syntax(code, language, theme="monokai", background_color="default")
        highlighted = syntax.highlight(code)
        highlighted.rstrip()
        return highlighted
    except Exception:
        return Text(code)


def _render_file_diff(
    diff_entry: dict[str, Any],
    page: int = 0,
    page_size: int = DEFAULT_LINE_LIMIT,
    skip_highlight: bool = False,
) -> tuple[list[Any], int]:
    """Render a single file's diff as a list of Rich renderables.

    Args:
        diff_entry: Diff data from WebSocket payload
        page: Current page number for pagination
        page_size: Lines per page for truncation
        skip_highlight: Skip syntax highlighting for performance on large diffs

    Returns:
        Tuple of (renderable_parts, total_content_line_count).
    """
    path = diff_entry.get("path", "unknown")
    status = diff_entry.get("status", "")
    additions = diff_entry.get("additions")
    deletions = diff_entry.get("deletions")
    raw_diff = diff_entry.get("diff", "")

    # File header line: path [status] +N -N
    header = Text()
    header.append(path, style="bold cyan")
    if status:
        header.append(f"  {status}", style="dim")
    if additions is not None and deletions is not None:
        header.append(f"  +{additions} -{deletions}", style="dim")

    language = _detect_language(path)
    parts: list[Any] = [header]
    rendered_lines, total_lines = _parse_diff_lines(
        raw_diff,
        language,
        page=page,
        page_size=page_size,
        skip_highlight=skip_highlight,
    )
    parts.extend(rendered_lines)

    # Add truncation/pagination indicator if content was truncated
    if total_lines > page_size:
        total_pages = -(-total_lines // page_size)  # ceil division
        current_page_display = page + 1
        visible_end = min((page + 1) * page_size, total_lines)

        if page == 0:
            indicator = (
                f"Showing first {visible_end} of {total_lines} lines"
                f" — Page {current_page_display} / {total_pages}"
            )
        else:
            visible_start = page * page_size + 1
            indicator = (
                f"Showing lines {visible_start}-{visible_end}"
                f" of {total_lines} lines"
                f" — Page {current_page_display} / {total_pages}"
            )
        parts.append(Text(indicator, style="dim yellow"))

    return parts, total_lines


def _parse_diff_lines(
    raw_diff: str,
    language: str = "text",
    page: int = 0,
    page_size: int = DEFAULT_LINE_LIMIT,
    skip_highlight: bool = False,
) -> tuple[list[Any], int]:
    """Parse unified diff output into styled Rich Text lines with syntax highlighting.

    Optimized single-pass streaming:
    - Only highlight lines within current page range (unless skip_highlight=True)
    - Count total lines without building objects for them
    - Scan entire diff to get accurate total for pagination

    Args:
        raw_diff: Raw unified diff string
        language: Programming language for syntax highlighting
        page: Current page number for pagination
        page_size: Lines per page
        skip_highlight: Skip syntax highlighting for performance on large diffs

    Returns:
        Tuple of (rendered_lines, total_content_line_count).
    """
    if not raw_diff or not raw_diff.strip():
        return [], 0

    result: list[Any] = []
    line_num = 0
    content_idx = 0
    start = page * page_size
    end = start + page_size
    current_hunk_header = None

    for line in raw_diff.split("\n"):
        # Skip diff metadata lines (not counted as content)
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
            if start <= content_idx < end:
                result.append(Text(line, style="dim italic"))
            content_idx += 1
        elif line.startswith("@@"):
            # @@ line is metadata, extract line number but don't count as content
            current_hunk_header = line
            match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", line)
            if match:
                line_num = int(match.group(1)) - 1
            if start <= content_idx < end:
                result.append(Text(current_hunk_header, style="cyan"))
        elif line.startswith("+"):
            line_num += 1
            if start <= content_idx < end:
                t = Text()
                t.append(f"{line_num:4d} ", style="dim green")
                if not skip_highlight:
                    t.append_text(_highlight_code(line[1:], language))
                else:
                    t.append(line[1:])
                result.append(t)
            content_idx += 1
        elif line.startswith("-"):
            if start <= content_idx < end:
                t = Text()
                t.append("   - ", style="red")
                if not skip_highlight:
                    t.append_text(_highlight_code(line[1:], language))
                else:
                    t.append(line[1:])
                result.append(t)
            content_idx += 1
        elif line.startswith(" "):
            line_num += 1
            if start <= content_idx < end:
                t = Text()
                t.append(f"{line_num:4d} ", style="dim")
                if not skip_highlight:
                    t.append_text(_highlight_code(line[1:], language))
                else:
                    t.append(line[1:])
                result.append(t)
            content_idx += 1
        else:
            if start <= content_idx < end:
                result.append(Text(line, style="dim"))
            content_idx += 1

    return result, content_idx
