"""SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: First panel implementation proving the BasePanel vertical slice.
Story 110-2: Added per-story cursor navigation and drill-through.
Subscribes to /ws/sprint, renders sprint status with epic grouping.
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
        Binding("down", "next_story_key", "Next story", show=False),
        Binding("up", "prev_story_key", "Prev story", show=False),
        Binding("enter", "drill_into_story_key", "Open story", show=False),
    ]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._selected_epic: int = 0
        self._toggled: dict[str, bool] = {}  # epic_id -> user override
        self._selected_story: int = -1  # -1 = no story selected

    def next_epic(self) -> None:
        """Move selection to the next epic."""
        epic_count = self._epic_count()
        if epic_count == 0:
            return
        self._selected_epic = (self._selected_epic + 1) % epic_count
        self._selected_story = -1
        self._rerender()

    def prev_epic(self) -> None:
        """Move selection to the previous epic."""
        epic_count = self._epic_count()
        if epic_count == 0:
            return
        self._selected_epic = (self._selected_epic - 1) % epic_count
        self._selected_story = -1
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

    def next_story(self) -> None:
        """Move cursor to next story within expanded epic."""
        if self._last_payload is None:
            return
        epics = self._last_payload.get("epics", [])
        if not epics or self._selected_epic >= len(epics):
            return
        epic = epics[self._selected_epic]
        if not self._is_expanded(epic):
            return
        stories = epic.get("stories", [])
        if not stories:
            return
        self._selected_story = (self._selected_story + 1) % len(stories)
        self._rerender()

    def prev_story(self) -> None:
        """Move cursor to previous story within expanded epic."""
        if self._last_payload is None:
            return
        epics = self._last_payload.get("epics", [])
        if not epics or self._selected_epic >= len(epics):
            return
        epic = epics[self._selected_epic]
        if not self._is_expanded(epic):
            return
        stories = epic.get("stories", [])
        if not stories:
            return
        if self._selected_story == -1:
            self._selected_story = len(stories) - 1
        else:
            self._selected_story = (self._selected_story - 1) % len(stories)
        self._rerender()

    def get_selected_story(self) -> dict[str, Any] | None:
        """Return the currently selected story data, or None if no story selected."""
        if self._selected_story < 0 or self._last_payload is None:
            return None
        epics = self._last_payload.get("epics", [])
        if not epics or self._selected_epic >= len(epics):
            return None
        stories = epics[self._selected_epic].get("stories", [])
        if self._selected_story >= len(stories):
            return None
        return stories[self._selected_story]

    def drill_into_story(self) -> None:
        """Push StoryDetailScreen for the selected story."""
        story = self.get_selected_story()
        if story is None:
            return
        from pennyfarthing_scripts.bikerack.story_detail_screen import StoryDetailScreen

        try:
            self.app.push_screen(StoryDetailScreen(story_data=story))
        except Exception:
            pass

    def action_next_epic_key(self) -> None:
        """Binding action: next epic."""
        self.next_epic()

    def action_prev_epic_key(self) -> None:
        """Binding action: previous epic."""
        self.prev_epic()

    def action_toggle_epic_key(self) -> None:
        """Binding action: toggle epic."""
        self.toggle_epic()

    def action_next_story_key(self) -> None:
        """Binding action: next story."""
        self.next_story()

    def action_prev_story_key(self) -> None:
        """Binding action: previous story."""
        self.prev_story()

    def action_drill_into_story_key(self) -> None:
        """Binding action: drill into story."""
        self.drill_into_story()

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

        hint = Text.from_markup(
            "[dim]j/k:navigate  e:expand/collapse  \u2191/\u2193:stories  Enter:open[/dim]"
        )
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
            arrow = "\u25bc" if expanded else "\u25b6"
            epic_line = Text(no_wrap=True, overflow="ellipsis")
            if selected:
                epic_line.append("\u203a ", style="bold yellow")
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
                for si, story in enumerate(stories):
                    story_id = story.get("id", "")
                    title = story.get("title", "")
                    pts = story.get("points", "")
                    jira = story.get("jiraKey") or "\u2014"
                    badge = _status_badge(story.get("status", ""))

                    is_story_selected = selected and si == self._selected_story

                    # Fixed-width fields first, title last (truncates)
                    story_line = Text(no_wrap=True, overflow="ellipsis")
                    if is_story_selected:
                        story_line.append("\u25b8 ", style="bold yellow")
                    story_line.append_text(badge)
                    story_line.append(
                        f" {story_id}",
                        style="cyan" if story_id != current_story_id else "bold cyan",
                    )
                    story_line.append(f"  {jira}", style="dim")
                    story_line.append(f"  {pts}", style="dim")
                    story_line.append(f"  {title}")

                    if story_id == current_story_id:
                        story_line.stylize("bold")

                    parts.append(Padding(story_line, (0, 0, 0, 4)))

            parts.append(Text(""))  # spacer between epics

        return Group(*parts)
