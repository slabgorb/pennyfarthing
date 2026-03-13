"""Tests for BikeRack DiffsPanel large diff handling (Story 103-19).

Verifies:
  AC1: DiffsPanel handles 10K+ line diffs without blocking event loop
  AC2: Truncation indicator displays correctly (text only, no graphics)
  AC3: Syntax highlighting preserved on truncated portion
  AC4: User can paginate or scroll to see more lines
  AC5: TUI remains responsive during large diff render (< 100ms frame time)
  AC6: Tests cover truncation @ 1000, 5000, 10K line boundaries
  AC7: Tests verify non-blocking behavior (async patterns)
  AC8: Temp files cleaned up on panel close

Run with: python -m pytest tests/python/test_bikerack_diffs_large.py -v
"""

from __future__ import annotations

import os
import time
from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from pf.tui.diffs_panel import DiffsPanel
from rich.console import Console

# ---------------------------------------------------------------------------
# Helpers — generate large diffs for testing
# ---------------------------------------------------------------------------


def _make_large_diff(num_lines: int, lang_ext: str = ".py") -> dict[str, Any]:
    """Generate a WebSocket message containing a diff with `num_lines` changed lines.

    Creates a valid unified diff with the specified number of added lines,
    suitable for passing to DiffsPanel.render_panel().
    """
    diff_lines = [
        f"diff --git a/src/large{lang_ext} b/src/large{lang_ext}",
        "index aaa1111..bbb2222 100644",
        f"--- a/src/large{lang_ext}",
        f"+++ b/src/large{lang_ext}",
        f"@@ -1,0 +1,{num_lines} @@",
    ]
    for i in range(1, num_lines + 1):
        if lang_ext == ".py":
            diff_lines.append(f"+def func_{i}(): return {i}")
        else:
            diff_lines.append(f"+line {i}: content here")

    return {
        "type": "init",
        "diffs": [
            {
                "id": f"diff-large-{num_lines}",
                "path": f"src/large{lang_ext}",
                "diff": "\n".join(diff_lines),
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "added",
                "additions": num_lines,
                "deletions": 0,
            },
        ],
    }


def _make_multi_file_large_diff(
    files: list[tuple[str, int]],
) -> dict[str, Any]:
    """Generate a multi-file diff message.

    Args:
        files: List of (path, num_lines) tuples.
    """
    diffs = []
    for path, num_lines in files:
        _ext = os.path.splitext(path)[1] or ".py"
        diff_lines = [
            f"diff --git a/{path} b/{path}",
            "index aaa..bbb 100644",
            f"--- a/{path}",
            f"+++ b/{path}",
            f"@@ -1,0 +1,{num_lines} @@",
        ]
        for i in range(1, num_lines + 1):
            diff_lines.append(f"+line {i}")
        diffs.append({
            "id": f"diff-{path}-{num_lines}",
            "path": path,
            "diff": "\n".join(diff_lines),
            "toolName": "Git",
            "timestamp": 1707900000,
            "status": "added",
            "additions": num_lines,
            "deletions": 0,
        })
    return {"type": "init", "diffs": diffs}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


def _count_rendered_content_lines(output: str) -> int:
    """Count non-empty content lines in rendered output (excludes headers, blanks)."""
    count = 0
    for line in output.split("\n"):
        stripped = line.strip()
        # Skip empty lines, file headers (path lines), and ANSI-only lines
        if not stripped:
            continue
        # Count lines that contain actual diff content (line numbers, +/- lines)
        if any(c.isdigit() for c in stripped) or "func_" in stripped or "line " in stripped:
            count += 1
    return count


# ---------------------------------------------------------------------------
# AC1 + AC6: Truncation at boundaries (1000, 5000, 10K lines)
# ---------------------------------------------------------------------------


class TestLargeDiffTruncation:
    """AC1/AC6: Diffs > 1000 lines are truncated with indicator."""

    def test_truncates_diff_over_default_limit(self):
        """A 2000-line diff should be truncated to ~1000 lines."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(2000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # The output should NOT contain all 2000 lines' worth of content.
        # Specifically, content from line 1500+ should not appear.
        assert "func_1500" not in output, (
            "Diff with 2000 lines should be truncated — line 1500 content should not appear"
        )

    def test_small_diff_not_truncated(self):
        """A 500-line diff should NOT be truncated."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(500)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # All 500 lines should be present
        assert "func_500" in output, (
            "Small diff (500 lines) should not be truncated — last line should appear"
        )
        # No truncation indicator should be shown
        assert "showing" not in output.lower() or "of" not in output.lower(), (
            "Small diff should not show truncation indicator"
        )

    def test_exact_limit_not_truncated(self):
        """A diff with exactly 1000 lines should NOT be truncated."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(1000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # Line 1000 should be present
        assert "func_1000" in output, (
            "Diff at exact limit (1000 lines) should not be truncated"
        )

    def test_truncation_at_1001_lines(self):
        """A 1001-line diff should trigger truncation."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(1001)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # Should have truncation indicator
        lower = output.lower()
        assert "showing" in lower and "1001" in lower, (
            "1001-line diff should show truncation indicator mentioning total (1001)"
        )

    def test_truncation_at_5000_boundary(self):
        """A 5001-line diff should be truncated with correct count."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(5001)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        lower = output.lower()
        assert "showing" in lower and "5001" in lower, (
            "5001-line diff should show truncation indicator with total count 5001"
        )

    def test_truncation_at_10k_boundary(self):
        """A 10001-line diff should be truncated with correct count."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(10001)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        lower = output.lower()
        assert "showing" in lower and "10001" in lower, (
            "10001-line diff should show truncation indicator with total count 10001"
        )


# ---------------------------------------------------------------------------
# AC2: Truncation indicator displays correctly
# ---------------------------------------------------------------------------


class TestTruncationIndicator:
    """AC2: Truncation indicator is text-only, shows line counts."""

    def test_indicator_shows_first_n_of_m_lines(self):
        """Truncation indicator must show 'showing first N of M lines' pattern."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(3000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        lower = output.lower()
        # Must contain a text indicator with both the visible count and total count
        assert "showing" in lower, (
            "Truncation indicator must contain 'showing'"
        )
        assert "3000" in output, (
            "Truncation indicator must show total line count (3000)"
        )

    def test_indicator_is_text_only_no_graphics(self):
        """Truncation indicator must be plain text, no box-drawing or graphics."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(2000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # Find the indicator line (contains "showing")
        indicator_lines = [
            line for line in output.split("\n")
            if "showing" in line.lower()
        ]
        assert len(indicator_lines) > 0, "No truncation indicator found"

        # Indicator should not contain box-drawing characters
        box_chars = set("┌┐└┘├┤┬┴┼─│═║╔╗╚╝╠╣╦╩╬")
        for line in indicator_lines:
            _plain = line.encode("ascii", errors="ignore").decode() + line
            bad = [c for c in line if c in box_chars]
            assert not bad, (
                f"Truncation indicator contains box-drawing chars: {bad}"
            )

    def test_indicator_for_multi_file_diff(self):
        """Multi-file diff where one file exceeds limit should show indicator when navigated to."""
        message = _make_multi_file_large_diff([
            ("src/small.py", 100),
            ("src/huge.py", 5000),
        ])
        panel = DiffsPanel(client=MagicMock())

        # First file (small) should render fully without truncation indicator
        result = panel.render_panel(message)
        output = _render_to_string(result)
        assert "src/small.py" in output

        # Navigate to the large file and re-render
        panel._current_file_index = 1
        result2 = panel.render_panel(message)
        output2 = _render_to_string(result2)

        # The huge file should have a truncation indicator
        lower2 = output2.lower()
        assert "showing" in lower2, (
            "Large file in multi-file diff should trigger truncation indicator"
        )


# ---------------------------------------------------------------------------
# AC3: Syntax highlighting preserved on truncated portion
# ---------------------------------------------------------------------------


class TestTruncatedSyntaxHighlighting:
    """AC3: Syntax highlighting works on truncated diffs."""

    def test_highlighting_preserved_on_truncated_python(self):
        """Python syntax highlighting should work on the visible portion of truncated diff."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(2000, lang_ext=".py")
        result = panel.render_panel(message)

        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()

        # Should have syntax highlighting colors (not just green/red diff colors)
        import re
        colors = set(re.findall(r"\x1b\[38;2;\d+;\d+;\d+[;\d]*m", raw))
        assert len(colors) >= 2, (
            f"Truncated Python diff should retain syntax highlighting colors, "
            f"got {len(colors)} unique colors"
        )

    def test_highlighting_preserved_on_truncated_typescript(self):
        """TypeScript syntax highlighting should work on truncated diff."""
        panel = DiffsPanel(client=MagicMock())
        # Generate large TypeScript diff
        message = _make_large_diff(2000, lang_ext=".ts")
        result = panel.render_panel(message)

        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()

        import re
        colors = set(re.findall(r"\x1b\[38;2;\d+;\d+;\d+[;\d]*m", raw))
        assert len(colors) >= 2, (
            f"Truncated TypeScript diff should retain syntax highlighting, "
            f"got {len(colors)} unique colors"
        )


# ---------------------------------------------------------------------------
# AC4: Pagination / scroll to see more lines
# ---------------------------------------------------------------------------


class TestDiffPagination:
    """AC4: User can paginate or scroll to see remaining lines."""

    def test_can_advance_to_next_page(self):
        """Panel should expose a method to advance to the next page of a truncated diff."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(3000)
        panel._last_payload = message

        # render_panel shows page 1 (first ~1000 lines)
        result_page1 = panel.render_panel(message)
        _output_page1 = _render_to_string(result_page1)

        # After advancing, should show different content
        assert hasattr(panel, "next_page"), (
            "DiffsPanel must have a next_page() method for pagination"
        )
        panel.next_page()
        # Re-render should show page 2 content
        result_page2 = panel.render_panel(message)
        output_page2 = _render_to_string(result_page2)

        # Page 2 should contain lines that weren't on page 1
        assert "func_1500" in output_page2 or "func_1200" in output_page2, (
            "Page 2 should show lines beyond the first page"
        )

    def test_can_go_back_to_previous_page(self):
        """Panel should expose a method to go back to previous page."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(3000)
        panel._last_payload = message

        assert hasattr(panel, "prev_page"), (
            "DiffsPanel must have a prev_page() method for pagination"
        )

    def test_page_indicator_text(self):
        """Pagination should show current page and total pages."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(3000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # Should show page indicator like "Page 1 / 3" or "Page 1 of 3"
        lower = output.lower()
        has_page_indicator = ("page" in lower and "/" in output) or (
            "page" in lower and "of" in lower
        )
        assert has_page_indicator, (
            "Truncated diff should show page indicator (e.g. 'Page 1 / 3')"
        )

    def test_first_page_no_previous(self):
        """On first page, prev_page should be a no-op (not error)."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(3000)
        panel._last_payload = message
        panel.render_panel(message)

        assert hasattr(panel, "prev_page"), "prev_page method required"
        # Should not raise
        panel.prev_page()

    def test_last_page_no_next(self):
        """On last page, next_page should be a no-op (not error)."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(1500)
        panel._last_payload = message
        panel.render_panel(message)

        assert hasattr(panel, "next_page"), "next_page method required"
        # Navigate to last page
        panel.next_page()
        # Should not raise on extra next_page call
        panel.next_page()


# ---------------------------------------------------------------------------
# AC5: TUI remains responsive during large diff render (< 100ms frame time)
# ---------------------------------------------------------------------------


class TestRenderPerformance:
    """AC5: Large diffs render within 100ms frame time budget."""

    def test_10k_diff_renders_under_100ms(self):
        """10K line diff should render in under 100ms."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(10000)

        start = time.monotonic()
        result = panel.render_panel(message)
        _render_to_string(result)
        elapsed_ms = (time.monotonic() - start) * 1000

        assert elapsed_ms < 100, (
            f"10K line diff render took {elapsed_ms:.1f}ms — must be under 100ms"
        )

    def test_50k_diff_renders_under_500ms(self):
        """50K line diff should render in under 500ms (graceful degradation)."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(50000)

        start = time.monotonic()
        result = panel.render_panel(message)
        _render_to_string(result)
        elapsed_ms = (time.monotonic() - start) * 1000

        assert elapsed_ms < 500, (
            f"50K line diff render took {elapsed_ms:.1f}ms — must be under 500ms"
        )


# ---------------------------------------------------------------------------
# AC7: Non-blocking behavior (async patterns)
# ---------------------------------------------------------------------------


class TestNonBlockingRendering:
    """AC7: Large diff rendering uses non-blocking async patterns."""

    def test_render_does_not_process_all_lines_synchronously(self):
        """Rendering 10K+ lines should not build all Rich Text objects upfront.

        The current implementation builds a Text() for every line in the diff.
        With truncation, only ~1000 Text objects should be created, not 10K.
        """
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(10000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # If truncation works, content from the end should NOT be present
        assert "func_9999" not in output, (
            "10K diff should not render line 9999 — truncation should limit output"
        )
        assert "func_10000" not in output, (
            "10K diff should not render line 10000 — truncation should limit output"
        )

    def test_line_count_in_output_bounded(self):
        """Rendered output should contain roughly the truncation limit of content lines."""
        panel = DiffsPanel(client=MagicMock())
        message = _make_large_diff(5000)
        result = panel.render_panel(message)
        output = _render_to_string(result)

        content_lines = _count_rendered_content_lines(output)
        # Should be roughly 1000 (the default limit), not 5000
        assert content_lines <= 1200, (
            f"Rendered {content_lines} content lines for 5000-line diff — "
            f"should be capped near 1000"
        )


# ---------------------------------------------------------------------------
# AC8: Temp files cleaned up on panel close
# ---------------------------------------------------------------------------


class TestTempFileManagement:
    """AC8: Very large diffs use temp files, cleaned up on close."""

    def test_very_large_diff_uses_temp_storage(self):
        """Diffs > 5000 lines should use temp file storage for memory efficiency."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        message = _make_large_diff(6000)
        panel.handle_message(message)

        # Panel should have created a temp file or have temp management
        has_temp = (
            hasattr(panel, "_temp_files")
            or hasattr(panel, "_temp_dir")
            or hasattr(panel, "_diff_cache_path")
        )
        assert has_temp, (
            "DiffsPanel should manage temp files for diffs > 5000 lines "
            "(expected _temp_files, _temp_dir, or _diff_cache_path attribute)"
        )

    def test_temp_files_cleaned_on_unmount(self):
        """Temp files should be deleted when panel is unmounted."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        message = _make_large_diff(6000)
        panel.handle_message(message)

        # Get references to any temp files created
        temp_paths: list[str] = []
        if hasattr(panel, "_temp_files") and panel._temp_files:
            temp_paths.extend(panel._temp_files)
        elif hasattr(panel, "_temp_dir") and panel._temp_dir:
            temp_paths.append(str(panel._temp_dir))

        # Unmount should clean up
        panel.on_unmount()

        for path in temp_paths:
            assert not os.path.exists(path), (
                f"Temp file {path} should be deleted after unmount"
            )

    def test_small_diff_no_temp_files(self):
        """Diffs under 5000 lines should NOT create temp files."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        message = _make_large_diff(1000)
        panel.handle_message(message)

        # Check no temp files were created
        has_temp_files = (
            (hasattr(panel, "_temp_files") and panel._temp_files)
            or (hasattr(panel, "_temp_dir") and panel._temp_dir)
        )
        assert not has_temp_files, (
            "Diffs under 5000 lines should not use temp file storage"
        )

    def test_multiple_updates_dont_leak_temp_files(self):
        """Receiving multiple large diffs should clean up previous temp files."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        # First large diff
        msg1 = _make_large_diff(6000)
        panel.handle_message(msg1)

        # Capture first set of temp paths
        first_temps: list[str] = []
        if hasattr(panel, "_temp_files") and panel._temp_files:
            first_temps.extend(list(panel._temp_files))

        # Second large diff should clean up first
        msg2 = _make_large_diff(7000)
        panel.handle_message(msg2)

        for path in first_temps:
            assert not os.path.exists(path), (
                f"Previous temp file {path} should be cleaned up when new diff arrives"
            )

        # Final cleanup
        panel.on_unmount()


# ---------------------------------------------------------------------------
# Edge cases — the kind of thing that floats up when you least expect it
# ---------------------------------------------------------------------------


class TestLargeDiffEdgeCases:
    """Edge cases for large diff handling."""

    def test_diff_with_mixed_add_remove_lines(self):
        """Large diff with interleaved adds and removes should truncate correctly."""
        diff_lines = [
            "diff --git a/src/mixed.py b/src/mixed.py",
            "index aaa..bbb 100644",
            "--- a/src/mixed.py",
            "+++ b/src/mixed.py",
            "@@ -1,2000 +1,2000 @@",
        ]
        for i in range(1, 2001):
            diff_lines.append(f"-old_line_{i} = {i}")
            diff_lines.append(f"+new_line_{i} = {i * 2}")

        message = {
            "type": "init",
            "diffs": [{
                "path": "src/mixed.py",
                "diff": "\n".join(diff_lines),
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
                "additions": 2000,
                "deletions": 2000,
            }],
        }

        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(message)
        output = _render_to_string(result)

        # Lines near the end should not appear (4000 total diff lines)
        assert "new_line_2000" not in output, (
            "Mixed add/remove diff should be truncated — end content should not appear"
        )

    def test_new_message_resets_pagination(self):
        """Receiving a new diff message should reset to page 1."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        msg1 = _make_large_diff(3000)
        panel.handle_message(msg1)

        if hasattr(panel, "next_page"):
            panel.next_page()  # Move to page 2

        # New message arrives — should reset to page 1
        msg2 = _make_large_diff(2000)
        panel.handle_message(msg2)

        result = panel.render_panel(msg2)
        output = _render_to_string(result)

        # Should show content from page 1 (early lines)
        assert "func_1" in output or "func_10" in output, (
            "New message should reset to page 1, showing early content"
        )

    def test_empty_large_diff_no_crash(self):
        """A diff entry with many empty lines should not crash."""
        diff_lines = [
            "diff --git a/src/empty.py b/src/empty.py",
            "index aaa..bbb 100644",
            "--- a/src/empty.py",
            "+++ b/src/empty.py",
            "@@ -1,0 +1,2000 @@",
        ]
        # 2000 empty added lines
        for _ in range(2000):
            diff_lines.append("+")

        message = {
            "type": "init",
            "diffs": [{
                "path": "src/empty.py",
                "diff": "\n".join(diff_lines),
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "added",
                "additions": 2000,
                "deletions": 0,
            }],
        }

        panel = DiffsPanel(client=MagicMock())
        # Should not raise
        result = panel.render_panel(message)
        output = _render_to_string(result)
        assert isinstance(output, str)
