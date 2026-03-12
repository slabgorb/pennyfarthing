"""BenchmarkPanel — Pipeline replay results + live run visibility for BikeRack TUI.

Single panel with three sub-views (keybind 1/2/3 within panel):
- History: scored run results with sparklines, drill-through
- OTEL: live OTEL event tail during benchmark runs
- Status: phase progress, token counts, duration timers

Subscribes to two WS channels:
- benchmark-history: periodic file-based poll of results
- benchmark-events: high-freq live stream during active runs
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from time import time
from typing import Any

from rich.console import Group
from rich.table import Table as RichTable
from rich.text import Text

from pf.bikerack.base_panel import (
    PANEL_ICONS,
    BasePanel,
    format_duration,
    render_progress_bar,
)

# Sparkline bar characters (8 levels of fill) — shared with audit_log_panel
_BARS = "▏▎▍▌▋▊▉█"

# Phase display order for status view
_PHASE_ORDER = ["tea", "dev", "reviewer"]
_PHASE_LABELS = {"tea": "TEA", "dev": "DEV", "reviewer": "REV"}
_PHASE_STYLES = {"tea": "cyan", "dev": "green", "reviewer": "red"}

# Score color thresholds
_SCORE_STYLE_GOOD = "bold green"
_SCORE_STYLE_MED = "bold yellow"
_SCORE_STYLE_BAD = "bold red"

MAX_HISTORY_ROWS = 200
MAX_OTEL_EVENTS = 200


def _score_style(pct: float) -> str:
    """Return Rich style for a score percentage."""
    if pct >= 70:
        return _SCORE_STYLE_GOOD
    if pct >= 40:
        return _SCORE_STYLE_MED
    return _SCORE_STYLE_BAD


def _sparkline(values: list[float], width: int = 8) -> str:
    """Generate a sparkline string from a list of values (0-100 scale)."""
    if not values:
        return ""
    result = []
    for v in values[-width:]:
        ratio = max(0, min(1, v / 100))
        idx = min(int(ratio * (len(_BARS) - 1)), len(_BARS) - 1)
        result.append(_BARS[idx])
    return "".join(result)


def _format_date(iso_str: str) -> str:
    """Format ISO date string to compact display."""
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%m/%d %H:%M")
    except (ValueError, TypeError):
        return iso_str[:10] if len(iso_str) >= 10 else iso_str


def _working_pattern(tool_counts: dict[str, int]) -> str:
    """Infer working pattern from tool counts."""
    reads = tool_counts.get("Read", 0) + tool_counts.get("read", 0)
    edits = tool_counts.get("Edit", 0) + tool_counts.get("edit", 0)
    writes = tool_counts.get("Write", 0) + tool_counts.get("write", 0)
    bashes = tool_counts.get("Bash", 0) + tool_counts.get("bash", 0)
    greps = tool_counts.get("Grep", 0) + tool_counts.get("grep", 0)
    globs = tool_counts.get("Glob", 0) + tool_counts.get("glob", 0)

    total = reads + edits + writes + bashes + greps + globs
    if total == 0:
        return "idle"
    if (edits + writes) > total * 0.4:
        return "editing"
    if bashes > total * 0.4:
        return "running commands"
    if (reads + greps + globs) > total * 0.5:
        return "reading source"
    return "mixed"


class BenchmarkPanel(BasePanel):
    """Benchmark panel — history, OTEL tail, and run status views.

    Subscribes to ``benchmark-history`` for file-based results and
    ``benchmark-events`` for live run data. Single panel with three
    sub-views toggled by keybindings.
    """

    channel: str = "benchmark-history"
    panel_name: str = "Benchmark"
    icon: str = PANEL_ICONS.get("benchmark", ("\uf080", "B"))[0]

    BINDINGS = [
        ("f1", "view_history", "History"),
        ("f2", "view_otel", "OTEL"),
        ("f3", "view_status", "Status"),
        ("j", "cursor_down", "Down"),
        ("k", "cursor_up", "Up"),
        ("down", "cursor_down", "Down"),
        ("up", "cursor_up", "Up"),
        ("enter", "select", "Expand"),
        ("v", "toggle_version_group", "Version"),
    ]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._view_mode: str = "history"  # "history" | "otel" | "status"
        self._history: list[dict[str, Any]] = []
        self._otel_events: list[dict[str, Any]] = []
        self._run_status: dict[str, Any] = {}
        self._selected_index: int | None = None
        self._expanded_rows: set[int] = set()
        self._version_grouping: bool = False

    def on_mount(self) -> None:
        """Subscribe to both benchmark channels."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("benchmark-history", self._handle_history)
            self._client.subscribe("benchmark-events", self._handle_events)

    def _handle_history(self, message: dict[str, Any] | None) -> None:
        """Handle benchmark-history channel messages."""
        if not self._mounted or message is None:
            return
        msg_type = message.get("type")
        if msg_type == "init" or msg_type == "update":
            runs = message.get("runs", [])
            if isinstance(runs, list):
                self._history = runs[:MAX_HISTORY_ROWS]
        self._rerender()

    def _handle_events(self, message: dict[str, Any] | None) -> None:
        """Handle benchmark-events channel messages (live run data)."""
        if not self._mounted or message is None:
            return
        msg_type = message.get("type")

        if msg_type == "phase":
            # Phase transition event
            self._run_status.update({
                "active": True,
                "current_phase": message.get("phase", ""),
                "phase_status": message.get("status", ""),
            })
            phases = self._run_status.setdefault("phases", {})
            phase = message.get("phase", "")
            status = message.get("status", "")
            if phase:
                if status == "started":
                    phases[phase] = {
                        "status": "running",
                        "started_at": time(),
                        "tokens": 0,
                        "cost": 0.0,
                    }
                elif status in ("completed", "done"):
                    if phase in phases:
                        phases[phase]["status"] = "done"
                        phases[phase]["ended_at"] = time()

        elif msg_type == "otel":
            # Live OTEL event
            event = message.get("event", {})
            if isinstance(event, dict):
                self._otel_events.append(event)
                if len(self._otel_events) > MAX_OTEL_EVENTS:
                    self._otel_events = self._otel_events[-MAX_OTEL_EVENTS:]
            # Update tool counts in run status
            tool_name = event.get("tool_name", "")
            if tool_name:
                phase = self._run_status.get("current_phase", "")
                tools = self._run_status.setdefault("tool_counts", {})
                phase_tools = tools.setdefault(phase, {})
                phase_tools[tool_name] = phase_tools.get(tool_name, 0) + 1

        elif msg_type == "tokens":
            # Token usage update
            phase = self._run_status.get("current_phase", "")
            phases = self._run_status.get("phases", {})
            if phase in phases:
                phases[phase]["tokens"] = message.get("tokens", 0)
                phases[phase]["cost"] = message.get("cost", 0.0)

        elif msg_type == "complete":
            # Run completed
            self._run_status["active"] = False

        self._rerender()

    def _rerender(self) -> None:
        """Re-render with current state."""
        if not self._mounted:
            return
        rendered = self.render_panel({})
        try:
            self.post_message(self.DataReceived(rendered))
        except Exception:
            pass

    # --- View mode switching ---

    def action_view_history(self) -> None:
        self._view_mode = "history"
        self._rerender()

    def action_view_otel(self) -> None:
        self._view_mode = "otel"
        self._rerender()

    def action_view_status(self) -> None:
        self._view_mode = "status"
        self._rerender()

    def action_toggle_version_group(self) -> None:
        self._version_grouping = not self._version_grouping
        self._rerender()

    # --- Row selection ---

    def action_cursor_down(self) -> None:
        if not self._history:
            return
        if self._selected_index is None:
            self._selected_index = 0
        elif self._selected_index < len(self._history) - 1:
            self._selected_index += 1
        self._rerender()

    def action_cursor_up(self) -> None:
        if not self._history:
            return
        if self._selected_index is None:
            self._selected_index = len(self._history) - 1
        elif self._selected_index > 0:
            self._selected_index -= 1
        self._rerender()

    def action_select(self) -> None:
        if self._selected_index is None:
            return
        if self._selected_index in self._expanded_rows:
            self._expanded_rows.discard(self._selected_index)
        else:
            self._expanded_rows.add(self._selected_index)
        self._rerender()

    # --- Rendering ---

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Dispatch to active sub-view renderer."""
        # View mode header
        header = Text()
        modes = [("F1 History", "history"), ("F2 OTEL", "otel"), ("F3 Status", "status")]
        for i, (label, mode) in enumerate(modes):
            if i > 0:
                header.append("  ", style="dim")
            if mode == self._view_mode:
                header.append(f"[{label}]", style="bold reverse")
            else:
                header.append(f" {label} ", style="dim")
        header.append("\n")

        if self._view_mode == "history":
            body = self._render_history()
        elif self._view_mode == "otel":
            body = self._render_otel()
        else:
            body = self._render_status()

        return Group(header, body)

    def _render_history(self) -> Any:
        """Render history sub-view: scored runs with sparklines."""
        if not self._history:
            return Text("No benchmark results yet", style="dim italic")

        if self._version_grouping:
            return self._render_history_by_version()

        # Build per-scenario sparkline data
        scenario_scores: dict[str, list[float]] = {}
        for run in self._history:
            sid = run.get("scenario_id", "")
            pct = run.get("score_pct", 0)
            scenario_scores.setdefault(sid, []).append(float(pct))

        table = RichTable(
            show_header=True, expand=True, box=None, pad_edge=False,
        )
        table.add_column("Scenario", no_wrap=True, width=20)
        table.add_column("Theme", no_wrap=True, width=12)
        table.add_column("Run", no_wrap=True, width=5, justify="right")
        table.add_column("Score", no_wrap=True, width=8, justify="right")
        table.add_column("Trend", no_wrap=True, width=10)
        table.add_column("Findings", no_wrap=True, width=10)
        table.add_column("Date", no_wrap=True, width=12)
        table.add_column("Version", no_wrap=True, width=15, overflow="ellipsis")

        for idx, run in enumerate(self._history):
            is_selected = self._selected_index == idx
            is_expanded = idx in self._expanded_rows
            row_style = "reverse" if is_selected else ""

            sid = run.get("scenario_id", "")
            theme = run.get("theme") or "control"
            run_id = str(run.get("run_id", ""))
            score_pct = run.get("score_pct", 0)
            total_caught = run.get("total_caught", 0)
            total_findings = run.get("total_findings", 0)
            run_date = _format_date(run.get("date", ""))
            version = run.get("version", "")

            scores = scenario_scores.get(sid, [])
            trend = _sparkline(scores)

            table.add_row(
                Text(sid, style=row_style, no_wrap=True, overflow="ellipsis"),
                Text(theme, style=f"dim {row_style}".strip()),
                Text(run_id, style=row_style),
                Text(f"{score_pct}%", style=f"{_score_style(score_pct)} {row_style}".strip()),
                Text(trend, style=f"blue {row_style}".strip()),
                Text(f"{total_caught}/{total_findings}", style=f"dim {row_style}".strip()),
                Text(run_date, style=f"dim {row_style}".strip()),
                Text(str(version), style=f"dim {row_style}".strip(), no_wrap=True, overflow="ellipsis"),
                style=row_style,
            )

            # Expanded detail block (drill-through)
            if is_expanded:
                detail = self._render_run_detail(run)
                table.add_row("", "", "", "", "", "", "", detail)

        return table

    def _render_history_by_version(self) -> Any:
        """Render history grouped by framework version."""
        groups: dict[str, list[dict[str, Any]]] = {}
        for run in self._history:
            version = run.get("version", "unknown")
            groups.setdefault(str(version), []).append(run)

        table = RichTable(
            show_header=True, expand=True, box=None, pad_edge=False,
        )
        table.add_column("Version", no_wrap=True, width=25)
        table.add_column("Runs", no_wrap=True, width=6, justify="right")
        table.add_column("Mean", no_wrap=True, width=8, justify="right")
        table.add_column("Median", no_wrap=True, width=8, justify="right")
        table.add_column("Trend", no_wrap=True, width=10)

        for version in sorted(groups.keys()):
            runs = groups[version]
            pcts = [r.get("score_pct", 0) for r in runs]
            mean = sum(pcts) / len(pcts) if pcts else 0
            sorted_pcts = sorted(pcts)
            median = sorted_pcts[len(sorted_pcts) // 2] if sorted_pcts else 0
            trend = _sparkline(pcts)

            table.add_row(
                Text(version, no_wrap=True, overflow="ellipsis"),
                str(len(runs)),
                Text(f"{mean:.1f}%", style=_score_style(mean)),
                Text(f"{median:.1f}%", style=_score_style(median)),
                Text(trend, style="blue"),
            )

        return table

    def _render_run_detail(self, run: dict[str, Any]) -> Text:
        """Render expanded detail for a single run (drill-through)."""
        parts: list[str] = []

        # Findings
        findings = run.get("findings", [])
        if findings:
            parts.append("Findings:")
            for f in findings:
                fid = f.get("finding_id", "")
                title = f.get("title", "")
                caught = f.get("caught", False)
                caught_by = f.get("caught_by", "")
                weight = f.get("weight", 1)
                status = "CAUGHT" if caught else "MISSED"
                by_str = f" by {caught_by}" if caught_by else ""
                parts.append(f"  [{status}] {fid}: {title} ({weight}pt){by_str}")

        # Token usage / cost
        token_usage = run.get("token_usage", {})
        if token_usage:
            parts.append("")
            parts.append("Token Usage:")
            for phase, usage in token_usage.items():
                tokens = usage.get("tokens", 0)
                cost = usage.get("cost", 0)
                parts.append(f"  {phase}: {tokens:,} tokens (${cost:.2f})")

        # Duration
        duration = run.get("duration_s")
        if duration:
            parts.append(f"Duration: {format_duration(duration)}")

        # Narrative excerpt
        narrative = run.get("narrative_excerpt", "")
        if narrative:
            parts.append("")
            parts.append(f"Narrative: {narrative[:200]}")

        detail_text = "\n".join(parts) if parts else "(no details)"
        sep = "\n  │ "
        return Text(f"  │ {detail_text.replace(chr(10), sep)}", style="dim italic")

    def _render_otel(self) -> Any:
        """Render OTEL event tail sub-view."""
        if not self._otel_events:
            active = self._run_status.get("active", False)
            if active:
                return Text("Waiting for OTEL events...", style="dim italic")
            return Text("No active benchmark run — start one with:\n  pf benchmark replay run <scenario>", style="dim italic")

        table = RichTable(
            show_header=True, expand=True, box=None, pad_edge=False,
        )
        table.add_column("Time", style="dim", no_wrap=True, width=8)
        table.add_column("Phase", no_wrap=True, width=8)
        table.add_column("Tool", no_wrap=True, width=11)
        table.add_column("Input", no_wrap=True, overflow="ellipsis", ratio=1)

        for event in reversed(self._otel_events[-50:]):
            ts = event.get("timestamp", "")
            if isinstance(ts, (int, float)):
                try:
                    dt = datetime.fromtimestamp(ts / 1000, tz=UTC)
                    ts_str = dt.strftime("%H:%M:%S")
                except (ValueError, OSError):
                    ts_str = "—"
            else:
                ts_str = str(ts)[:8] if ts else "—"

            phase = event.get("phase", "")
            tool = event.get("tool_name", "")
            input_text = event.get("input", "")
            if len(input_text) > 80:
                input_text = input_text[:79] + "…"

            phase_style = _PHASE_STYLES.get(phase, "dim")

            table.add_row(
                ts_str,
                Text(phase, style=phase_style),
                Text(tool, style="bold cyan"),
                Text(input_text, style="dim", no_wrap=True, overflow="ellipsis"),
            )

        return table

    def _render_status(self) -> Any:
        """Render run status sub-view: phase progress, timers, patterns."""
        if not self._run_status.get("active", False):
            return Text("No active benchmark run", style="dim italic")

        parts: list[Any] = []

        # Phase progress bar
        phases_data = self._run_status.get("phases", {})
        current = self._run_status.get("current_phase", "")

        phase_line = Text()
        phase_line.append("Pipeline  ", style="bold")
        for i, phase in enumerate(_PHASE_ORDER):
            if i > 0:
                phase_line.append(" → ", style="dim")

            pdata = phases_data.get(phase, {})
            status = pdata.get("status", "pending")
            style = _PHASE_STYLES.get(phase, "dim")

            if status == "done":
                phase_line.append("✓", style=f"bold {style}")
                phase_line.append(f" {_PHASE_LABELS.get(phase, phase)}", style=f"dim {style}")
            elif status == "running":
                phase_line.append("●", style=f"bold {style}")
                phase_line.append(f" {_PHASE_LABELS.get(phase, phase)}", style=f"bold {style}")
                # Duration timer
                started = pdata.get("started_at")
                if started:
                    elapsed = time() - started
                    phase_line.append(f" {format_duration(elapsed)}", style="dim")
            else:
                phase_line.append("○", style="dim")
                phase_line.append(f" {_PHASE_LABELS.get(phase, phase)}", style="dim")

        parts.append(phase_line)

        # Per-phase token counts and cost
        for phase in _PHASE_ORDER:
            pdata = phases_data.get(phase, {})
            if pdata.get("status") in ("running", "done"):
                tokens = pdata.get("tokens", 0)
                cost = pdata.get("cost", 0.0)
                status = pdata.get("status", "")

                line = Text()
                line.append(f"  {_PHASE_LABELS.get(phase, phase):<5}", style=_PHASE_STYLES.get(phase, "dim"))
                if tokens:
                    line.append(f"{tokens:>8,} tokens", style="dim")
                if cost:
                    line.append(f"  ${cost:.2f}", style="dim")

                # Duration
                started = pdata.get("started_at")
                ended = pdata.get("ended_at")
                if started:
                    duration = (ended or time()) - started
                    line.append(f"  {format_duration(duration)}", style="dim")

                parts.append(line)

        # Working pattern (last 5 tool uses)
        tool_counts = self._run_status.get("tool_counts", {})
        current_tools = tool_counts.get(current, {})
        if current_tools:
            parts.append(Text(""))
            pattern = _working_pattern(current_tools)
            parts.append(Text(f"  Pattern: {pattern}", style="dim italic"))

            # File touch count
            total_tools = sum(current_tools.values())
            file_tools = sum(
                current_tools.get(t, 0) for t in ("Read", "Edit", "Write", "read", "edit", "write")
            )
            parts.append(
                Text(f"  Tools: {total_tools}  Files: {file_tools}", style="dim")
            )

        # Recent OTEL events (last 5)
        if self._otel_events:
            parts.append(Text(""))
            parts.append(Text("Recent Events", style="bold dim"))
            for event in self._otel_events[-5:]:
                tool = event.get("tool_name", "")
                input_text = event.get("input", "")[:50]
                parts.append(Text(f"  {tool}: {input_text}", style="dim"))

        return Group(*parts)
