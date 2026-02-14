"""SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: First panel implementation proving the BasePanel vertical slice.
Subscribes to /ws/sprint, renders sprint status as Rich table.
"""

from __future__ import annotations

from typing import Any

from rich.console import Group
from rich.table import Table
from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel


class SprintPanel(BasePanel):
    """Sprint status panel.

    Subscribes to the ``sprint`` WebSocket channel and renders
    sprint status as a Rich table with story list, points, and velocity.
    """

    channel: str = "sprint"
    panel_name: str = "Sprint"
    icon: str = PANEL_ICONS["sprint"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render sprint data as Rich renderable.

        Returns a Group containing a sprint metrics header and a
        story table with columns: ID, Title, Status, Pts, Jira.
        """
        sprint = payload.get("sprint", {})
        metrics = payload.get("metrics", {})
        epics = payload.get("epics", [])

        # Sprint metrics header
        sprint_num = sprint.get("number", "")
        done = sprint.get("done", 0)
        remaining = sprint.get("remaining", 0)
        in_progress = sprint.get("inProgress", 0)
        velocity = metrics.get("velocity", 0)

        header = Text.from_markup(
            f"Sprint {sprint_num}  "
            f"[green]Done: {done}[/green] | "
            f"Remaining: {remaining} | "
            f"In Progress: {in_progress} | "
            f"Velocity: {velocity}"
        )

        # Story table
        table = Table(title=sprint.get("name", "Sprint"))
        table.add_column("ID", style="cyan")
        table.add_column("Title")
        table.add_column("Status")
        table.add_column("Pts", justify="right")
        table.add_column("Jira", style="dim")

        for epic in epics:
            for story in epic.get("stories", []):
                table.add_row(
                    story.get("id", ""),
                    story.get("title", ""),
                    story.get("status", ""),
                    str(story.get("points", "")),
                    story.get("jiraKey") or "—",
                )

        return Group(header, table)
