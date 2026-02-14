"""DiffsPanel — Rich diff rendering with syntax highlighting for BikeRack TUI.

Story 103-18: Subscribes to /ws/diffs, renders file diffs with syntax
highlighting using Rich. File headers, added/removed line coloring, line numbers.
"""

from __future__ import annotations

import re
from typing import Any

from rich.console import Group
from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel


class DiffsPanel(BasePanel):
    """Diff rendering panel with syntax highlighting.

    Subscribes to the ``diffs`` WebSocket channel and renders
    file diffs with syntax highlighting, colored added/removed lines,
    file headers, and line numbers.
    """

    channel: str = "diffs"
    panel_name: str = "Diffs"
    icon: str = PANEL_ICONS["diffs"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render diff data from WebSocket payload."""
        diffs = payload.get("diffs", [])
        if not diffs:
            return Text("No diffs yet", style="dim italic")

        parts: list[Any] = []
        for diff_entry in diffs:
            parts.extend(_render_file_diff(diff_entry))
            parts.append(Text(""))  # separator between files

        return Group(*parts)


def _render_file_diff(diff_entry: dict[str, Any]) -> list[Any]:
    """Render a single file's diff as a list of Rich renderables."""
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

    parts: list[Any] = [header]
    parts.extend(_parse_diff_lines(raw_diff))
    return parts


def _parse_diff_lines(raw_diff: str) -> list[Any]:
    """Parse unified diff output into styled Rich Text lines."""
    if not raw_diff or not raw_diff.strip():
        return []

    result: list[Any] = []
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

        if line.startswith("Binary files"):
            result.append(Text(line, style="dim italic"))
        elif line.startswith("@@"):
            match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", line)
            if match:
                line_num = int(match.group(1)) - 1
            result.append(Text(line, style="cyan"))
        elif line.startswith("+"):
            line_num += 1
            t = Text()
            t.append(f"{line_num:4d} ", style="dim green")
            t.append(line[1:], style="green")
            result.append(t)
        elif line.startswith("-"):
            t = Text()
            t.append("     ", style="dim")
            t.append(line[1:], style="red")
            result.append(t)
        elif line.startswith(" "):
            line_num += 1
            t = Text()
            t.append(f"{line_num:4d} ", style="dim")
            t.append(line[1:], style="dim")
            result.append(t)
        elif line == "":
            continue
        else:
            result.append(Text(line, style="dim"))

    return result
