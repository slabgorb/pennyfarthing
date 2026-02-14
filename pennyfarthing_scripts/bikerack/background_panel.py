"""BackgroundPanel — Background task status display for BikeRack TUI.

Story 103-16: Subscribes to /ws/background-tasks, renders background task
list with status indicators (running, completed, failed).
"""

from __future__ import annotations

from typing import Any

from rich.console import Group
from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel


class BackgroundPanel(BasePanel):
    """Background task status panel.

    Subscribes to the ``background-tasks`` WebSocket channel and renders
    a list of background tasks with status indicators.
    """

    channel: str = "background-tasks"
    panel_name: str = "Background"
    icon: str = PANEL_ICONS["background"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render background task data from WebSocket payload."""
        tasks = payload.get("tasks", [])
        if not isinstance(tasks, list) or not tasks:
            return Text("No background tasks", style="dim italic")

        parts: list[Any] = []
        for task in tasks:
            if not isinstance(task, dict):
                continue
            parts.append(_render_task(task))

        if not parts:
            return Text("No background tasks", style="dim italic")

        return Group(*parts)


def _render_task(task: dict[str, Any]) -> Text:
    """Render a single background task as a styled Text line."""
    description = task.get("description", "Unknown task")
    subagent_type = task.get("subagentType", "")
    completed_at = task.get("completedAt")
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
            line.append(" — done", style="green")
            if result:
                line.append(f" ({result})", style="dim green")
        else:
            line.append("✗ ", style="bold red")
            line.append(description)
            if subagent_type:
                line.append(f" [{subagent_type}]", style="dim")
            line.append(" — failed", style="red")
            if error:
                line.append(f"\n  {error}", style="red")
    else:
        line.append("⟳ ", style="bold yellow")
        line.append(description)
        if subagent_type:
            line.append(f" [{subagent_type}]", style="dim")
        line.append(" — running", style="yellow")

    return line
