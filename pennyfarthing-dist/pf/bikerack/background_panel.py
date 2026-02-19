"""BackgroundPanel — Background task status display for BikeRack TUI.

Story 103-16: Subscribes to /ws/background-tasks, renders background task
list with status indicators (running, completed, failed).
"""

from __future__ import annotations

import time
from typing import Any

from rich.console import Group
from rich.text import Text

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel, format_duration


class BackgroundPanel(BasePanel):
    """Background task status panel.

    Subscribes to the ``background-tasks`` WebSocket channel and renders
    a list of background tasks with status indicators.
    """

    channel: str = "background-tasks"
    panel_name: str = "Background"
    icon: str = PANEL_ICONS["background"][0]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._timer = None

    def on_mount(self) -> None:
        """Subscribe to channel and start elapsed timer."""
        super().on_mount()
        self._timer = self.set_interval(1, self._tick)

    def on_unmount(self) -> None:
        """Stop timer and cleanup."""
        if self._timer is not None:
            self._timer.stop()
        super().on_unmount()

    def _tick(self) -> None:
        """Re-render every second to update elapsed times."""
        if self._last_payload is not None:
            rendered = self.render_panel(self._last_payload)
            try:
                self.update(rendered)
            except Exception:
                pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render background task data from WebSocket payload."""
        tasks = payload.get("tasks", [])
        if not isinstance(tasks, list) or not tasks:
            return Text("No background tasks", style="dim italic")

        running = 0
        done = 0
        failed = 0
        for task in tasks:
            if not isinstance(task, dict):
                continue
            if task.get("completedAt") is not None:
                if task.get("success"):
                    done += 1
                else:
                    failed += 1
            else:
                running += 1

        # Summary header
        summary = Text()
        summary.append(f"{running} running", style="yellow")
        summary.append("  ")
        summary.append(f"{done} done", style="green")
        if failed > 0:
            summary.append("  ")
            summary.append(f"{failed} failed", style="red")

        separator = Text("─" * 30, style="dim")

        # Task list
        parts: list[Any] = []
        for task in tasks:
            if not isinstance(task, dict):
                continue
            parts.append(_render_task(task))

        if not parts:
            return Text("No background tasks", style="dim italic")

        return Group(summary, separator, *parts)


def _render_task(task: dict[str, Any]) -> Text:
    """Render a single background task as a styled Text line."""
    description = task.get("description", "Unknown task")
    subagent_type = task.get("subagentType", "")
    completed_at = task.get("completedAt")
    started_at = task.get("startedAt")
    success = task.get("success")
    result = task.get("result", "")
    error = task.get("error", "")

    line = Text()

    if completed_at is not None:
        if success:
            line.append("✓ ", style="bold green")
            line.append(description)
            if subagent_type:
                line.append(f" [{subagent_type}]", style="dim")
            # Show duration if timestamps available
            duration = _calc_duration(started_at, completed_at)
            if duration:
                line.append(f" — {duration}", style="green")
            else:
                line.append(" — done", style="green")
            if result:
                line.append(f" ({result})", style="dim green")
        else:
            line.append("✗ ", style="bold red")
            line.append(description)
            if subagent_type:
                line.append(f" [{subagent_type}]", style="dim")
            duration = _calc_duration(started_at, completed_at)
            if duration:
                line.append(f" — {duration}", style="red")
            else:
                line.append(" — failed", style="red")
            if error:
                line.append(f"\n  {error}", style="red")
    else:
        line.append("⟳ ", style="bold yellow")
        line.append(description)
        if subagent_type:
            line.append(f" [{subagent_type}]", style="dim")
        # Live elapsed time for running tasks
        if started_at:
            try:
                elapsed = time.time() - float(started_at) / 1000  # startedAt is typically ms
                line.append(f" — {format_duration(elapsed)}", style="yellow")
            except (ValueError, TypeError):
                line.append(" — running", style="yellow")
        else:
            line.append(" — running", style="yellow")

    return line


def _calc_duration(started_at, completed_at) -> str:
    """Calculate duration string from timestamps."""
    if started_at is None or completed_at is None:
        return ""
    try:
        start = float(started_at) / 1000  # ms to seconds
        end = float(completed_at) / 1000
        return format_duration(end - start)
    except (ValueError, TypeError):
        return ""
