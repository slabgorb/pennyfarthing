"""SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: First panel implementation proving the BasePanel vertical slice.
Subscribes to /ws/sprint, renders sprint status as Rich table.
"""

from __future__ import annotations

from typing import Any

from rich.console import Group
from rich.padding import Padding
from rich.text import Text
from textual.binding import Binding

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel, render_progress_bar


def _status_badge(status: str) -> Text:
    """Convert status string to styled Rich Text badge."""
    s = status.lower().strip() if status else ""
    if s == "done":
        return Text("\u2713 done", style="green")
    if s == "in-progress":
        return Text("\u27f3 in-progress", style="yellow")
    if s == "backlog":
        return Text("\u25ef backlog", style="dim")
    if s == "blocked":
        return Text("! blocked", style="bold red")
    if s == "review":
        return Text("\u25ce review", style="cyan")
    return Text(status or "\u2014", style="dim")


class SprintPanel(BasePanel):
    """Sprint status panel.

    Subscribes to the ``sprint`` WebSocket channel and renders
    sprint status as a Rich table with story list, points, and velocity.
    """

    channel: str = "sprint"
    panel_name: str = "Sprint"
    icon: str = PANEL_ICONS["sprint"][0]
    can_focus = True

    BINDINGS = [
        Binding("j", "next_epic_key", "Next epic"),
        Binding("k", "prev_epic_key", "Prev epic"),
        Binding("e", "toggle_epic_key", "Toggle epic"),
    ]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._selected_epic: int = 0
        self._toggled: dict[str, bool] = {}  # epic_id -> user override

    def next_epic(self) -> None:
        """Move selection to the next epic."""
        epic_count = self._epic_count()
        if epic_count == 0:
            return
        self._selected_epic = (self._selected_epic + 1) % epic_count
        self._rerender()

    def prev_epic(self) -> None:
        """Move selection to the previous epic."""
        epic_count = self._epic_count()
        if epic_count == 0:
            return
        self._selected_epic = (self._selected_epic - 1) % epic_count
        self._rerender()

    def toggle_epic(self) -> None:
        """Toggle expand/collapse on the selected epic."""
        if self._last_payload is None:
            return
        epics = self._last_payload.get("epics", [])
        if not epics or self._selected_epic >= len(epics):
            return
        epic_id = epics[self._selected_epic].get("id", "")
        if epic_id:
            self._toggled[epic_id] = not self._is_expanded(epics[self._selected_epic])
        self._rerender()

    def action_next_epic_key(self) -> None:
        """Binding action: next epic."""
        self.next_epic()

    def action_prev_epic_key(self) -> None:
        """Binding action: previous epic."""
        self.prev_epic()

    def action_toggle_epic_key(self) -> None:
        """Binding action: toggle epic."""
        self.toggle_epic()

    def _rerender(self) -> None:
        if self._last_payload is not None:
            rendered = self.render_panel(self._last_payload)
            try:
                self.update(rendered)
            except Exception:
                pass

    def _epic_count(self) -> int:
        if self._last_payload is None:
            return 0
        return len(self._last_payload.get("epics", []))

    def _is_expanded(self, epic: dict[str, Any]) -> bool:
        """Check if an epic should be expanded."""
        epic_id = epic.get("id", "")
        if epic_id in self._toggled:
            return self._toggled[epic_id]
        # Default: expand if has incomplete work
        stories = epic.get("stories", [])
        total_pts = 0
        done_pts = 0
        has_in_progress = False
        for story in stories:
            pts = story.get("points", 0)
            if isinstance(pts, (int, float)):
                total_pts += pts
                status = (story.get("status") or "").lower().strip()
                if status == "done":
                    done_pts += pts
                if status == "in-progress":
                    has_in_progress = True
        return has_in_progress or done_pts < total_pts

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render sprint data with epic grouping and progress bars."""
        sprint = payload.get("sprint", {})
        metrics = payload.get("metrics", {})
        epics = payload.get("epics", [])
        current_story_id = sprint.get("currentStory", "")

        # Clamp selection
        if epics and self._selected_epic >= len(epics):
            self._selected_epic = len(epics) - 1

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

        hint = Text.from_markup("[dim]j/k:navigate  e:expand/collapse[/dim]")
        parts: list[Any] = [header, hint, Text("")]

        for i, epic in enumerate(epics):
            epic_id = epic.get("id", "")
            epic_title = epic.get("title", "")
            stories = epic.get("stories", [])

            # Calculate epic progress
            total_pts = 0
            done_pts = 0
            for story in stories:
                pts = story.get("points", 0)
                if isinstance(pts, (int, float)):
                    total_pts += pts
                    status = (story.get("status") or "").lower().strip()
                    if status == "done":
                        done_pts += pts

            expanded = self._is_expanded(epic)
            selected = i == self._selected_epic

            # Epic header: selector arrow epic-id progress-bar pts title
            arrow = "▼" if expanded else "▶"
            epic_line = Text(no_wrap=True, overflow="ellipsis")
            if selected:
                epic_line.append("› ", style="bold yellow")
            epic_line.append(f"{arrow} ", style="bold")
            epic_line.append(f"{epic_id}", style="bold cyan")
            epic_line.append("  ")

            if total_pts > 0:
                pct = int(done_pts / total_pts * 100)
                epic_line.append_text(render_progress_bar(pct, width=10))
                epic_line.append(f" {done_pts}/{total_pts} pts", style="dim")
            else:
                epic_line.append("0 pts", style="dim")

            epic_line.append(f"  {epic_title}", style="bold")

            parts.append(epic_line)

            # Show stories if expanded
            if expanded:
                for story in stories:
                    story_id = story.get("id", "")
                    title = story.get("title", "")
                    pts = story.get("points", "")
                    jira = story.get("jiraKey") or "—"
                    badge = _status_badge(story.get("status", ""))

                    # Fixed-width fields first, title last (truncates)
                    story_line = Text(no_wrap=True, overflow="ellipsis")
                    story_line.append_text(badge)
                    story_line.append(f" {story_id}", style="cyan" if story_id != current_story_id else "bold cyan")
                    story_line.append(f"  {jira}", style="dim")
                    story_line.append(f"  {pts}", style="dim")
                    story_line.append(f"  {title}")

                    if story_id == current_story_id:
                        story_line.stylize("bold")

                    parts.append(Padding(story_line, (0, 0, 0, 4)))

            parts.append(Text(""))  # spacer between epics

        return Group(*parts)
