"""ProgressPanel — Unified story progress view for BikeRack TUI.

Combines story context, workflow phase, acceptance criteria, todos, and
git status into a single at-a-glance panel. Subscribes to 4 WS channels:
/ws/story, /ws/todos, /ws/git, /ws/sprint.
"""

from __future__ import annotations

from typing import Any

from rich.console import Group
from rich.text import Text

from pf.bikerack.base_panel import (
    PANEL_ICONS,
    BasePanel,
    render_progress_bar,
)


class ProgressPanel(BasePanel):
    """Unified story progress panel.

    Subscribes to ``story``, ``todos``, ``git``, and ``sprint`` channels.
    Renders a compact overview combining story header, workflow phase,
    AC progress, todo progress, and git summary.
    """

    channel: str = "story"  # primary channel
    panel_name: str = "Progress"
    icon: str = PANEL_ICONS.get("progress", ("\uf200", "P"))[0]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._story_data: dict[str, Any] | None = None
        self._todos_data: dict[str, Any] | None = None
        self._git_data: dict[str, Any] | None = None
        self._sprint_data: dict[str, Any] | None = None

    def on_mount(self) -> None:
        """Subscribe to all 4 channels."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("story", self._handle_story)
            self._client.subscribe("todos", self._handle_todos)
            self._client.subscribe("git", self._handle_git)
            self._client.subscribe("sprint", self._handle_sprint)

    def _handle_story(self, message: dict[str, Any] | None) -> None:
        if message is None:
            return
        self._story_data = message
        self._rerender()

    def _handle_todos(self, message: dict[str, Any] | None) -> None:
        if message is None:
            return
        self._todos_data = message
        self._rerender()

    def _handle_git(self, message: dict[str, Any] | None) -> None:
        if message is None:
            return
        self._git_data = message
        self._rerender()

    def _handle_sprint(self, message: dict[str, Any] | None) -> None:
        if message is None:
            return
        self._sprint_data = message
        self._rerender()

    def _rerender(self) -> None:
        """Re-render with latest data from all channels."""
        rendered = self.render_panel({})
        try:
            self.update(rendered)
        except Exception:
            pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render unified progress view."""
        parts: list[Any] = []

        # --- Story Header ---
        story_header = self._render_story_header()
        if story_header is None:
            return Text(
                "No active story \u2014 start with /sprint work",
                style="dim italic",
            )
        parts.append(story_header)
        parts.append(Text("\u2500" * 35, style="dim"))

        # --- Workflow Phase ---
        workflow = self._render_workflow()
        if workflow is not None:
            parts.append(workflow)
            parts.append(Text("\u2500" * 35, style="dim"))

        # --- Acceptance Criteria ---
        ac = self._render_ac()
        if ac is not None:
            parts.append(ac)
            parts.append(Text("\u2500" * 35, style="dim"))

        # --- Todos ---
        todos = self._render_todos()
        if todos is not None:
            parts.append(todos)
            parts.append(Text("\u2500" * 35, style="dim"))

        # --- Git Summary ---
        git = self._render_git()
        if git is not None:
            parts.append(git)

        return Group(*parts)

    def _render_story_header(self) -> Text | None:
        """Render story ID, title, points, epic, assignee."""
        story = self._story_data or {}
        sprint = self._sprint_data or {}

        # Try sprint data for current story context
        current = sprint.get("sprint", {}).get("currentStory")
        if isinstance(current, str) and current:
            story_id = current
        else:
            story_id = story.get("id", "")

        title = story.get("title", "")
        points = story.get("points", "")
        epic = story.get("epic", "")
        assignee = story.get("assignee", "")

        # Also try to extract from sprint epics
        if not title and sprint:
            for ep in sprint.get("epics", []):
                for s in ep.get("stories", []):
                    if s.get("id") == story_id:
                        title = s.get("title", "")
                        points = s.get("points", "")
                        epic = ep.get("id", "")
                        break

        if not story_id and not title:
            return None

        header = Text()
        if story_id:
            header.append(story_id, style="bold cyan")
            header.append("  ")
        if title:
            header.append(title, style="bold")
        if points:
            header.append(f"  {points}pt", style="dim")

        # Second line: epic + assignee
        meta_parts: list[str] = []
        if epic:
            meta_parts.append(f"Epic {epic}")
        if assignee:
            meta_parts.append(assignee)
        if meta_parts:
            header.append("\n")
            header.append(" \u00b7 ".join(meta_parts), style="dim")

        return header

    def _render_workflow(self) -> Text | None:
        """Render workflow type badge and phase dots."""
        story = self._story_data or {}
        workflow = story.get("workflow", "")
        phases = story.get("workflowPhases", [])
        current_phase = story.get("phase", "")

        if not phases:
            return None

        line = Text()

        # Workflow type badge
        if workflow:
            line.append(f"[{workflow}]", style="bold")
            line.append("  ")

        # Phase dots
        for i, phase in enumerate(phases):
            phase_name = phase if isinstance(phase, str) else phase.get("name", "")
            phase_status = ""
            if isinstance(phase, dict):
                phase_status = phase.get("status", "")

            # Determine phase state
            if phase_status == "done" or (current_phase and phase_name != current_phase and _phase_before(phase_name, current_phase, phases)):
                line.append("\u2713", style="green")
            elif phase_name == current_phase:
                line.append("\u25cf", style="bold yellow")
            else:
                line.append("\u25cb", style="dim")

            line.append(f" {phase_name}", style="bold" if phase_name == current_phase else "dim")

            if i < len(phases) - 1:
                line.append(" \u2192 ", style="dim")

        return line

    def _render_ac(self) -> Text | None:
        """Render acceptance criteria progress bar."""
        story = self._story_data or {}
        criteria = story.get("criteria", [])
        if not criteria:
            return None

        total = len(criteria)
        done = sum(1 for c in criteria if isinstance(c, dict) and c.get("met"))

        if total == 0:
            return None

        pct = int(done / total * 100)
        line = Text()
        line.append("AC   ", style="bold")
        line.append_text(render_progress_bar(pct, width=10))
        line.append(f"  {done}/{total}")
        return line

    def _render_todos(self) -> Text | None:
        """Render todo progress bar with active task."""
        data = self._todos_data or {}
        todos = data.get("todos", [])
        if not todos:
            return None

        total = len(todos)
        done = sum(1 for t in todos if isinstance(t, dict) and t.get("status") == "done")
        active = None
        for t in todos:
            if isinstance(t, dict) and t.get("status") in ("in-progress", "active", "running"):
                active = t.get("description", t.get("title", ""))
                break

        if total == 0:
            return None

        pct = int(done / total * 100)
        line = Text()
        line.append("Todo ", style="bold")
        line.append_text(render_progress_bar(pct, width=10))
        line.append(f"  {done}/{total}")
        if active:
            line.append(f"  \u25cf {active}", style="yellow")
        return line

    def _render_git(self) -> Text | None:
        """Render git summary: branch, dirty counts, ahead/behind."""
        data = self._git_data or {}
        repos = data.get("repos", [])
        if not repos:
            return None

        line = Text()
        line.append("Git  ", style="bold")

        for repo in repos:
            if not isinstance(repo, dict):
                continue
            branch = repo.get("branch", "")
            dirty_files = repo.get("dirtyFiles", [])
            ahead = repo.get("ahead", 0)
            behind = repo.get("behind", 0)

            # Count file types
            modified = 0
            untracked = 0
            for f in dirty_files:
                if not isinstance(f, dict):
                    continue
                status = f.get("status", "  ")
                if status.startswith("?"):
                    untracked += 1
                else:
                    modified += 1

            part = Text()
            if branch:
                part.append(branch, style="cyan")
            part.append(f"  {modified}M", style="yellow" if modified else "dim")
            part.append(f" {untracked}U", style="dim")
            part.append(f"  \u2191{ahead}", style="green" if ahead else "dim")
            part.append(f" \u2193{behind}", style="red" if behind else "dim")

            line.append_text(part)

            # Only show first repo on main line, rest on separate lines
            break

        return line


def _phase_before(phase: str, current: str, phases: list) -> bool:
    """Check if phase comes before current in the phases list."""
    phase_idx = -1
    current_idx = -1
    for i, p in enumerate(phases):
        name = p if isinstance(p, str) else p.get("name", "")
        if name == phase:
            phase_idx = i
        if name == current:
            current_idx = i
    return phase_idx >= 0 and current_idx >= 0 and phase_idx < current_idx
