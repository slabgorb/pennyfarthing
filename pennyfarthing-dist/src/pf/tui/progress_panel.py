"""ProgressPanel — Unified story progress view for Frame TUI TUI.

Combines sprint-level metrics (burndown, epic progress, velocity, recently
completed) with story context, workflow phase, acceptance criteria, todos,
and git status into a single at-a-glance panel. Subscribes to 4 WS channels:
/ws/story, /ws/todos, /ws/git, /ws/sprint.

Story 120-8: Added Enter keybinding for story detail drill-through.
Story 120-3: Added sprint burndown, epic progress, velocity/timeline,
             and recently completed sections.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from rich.console import Group
from rich.text import Text
from textual.binding import Binding

from pf.tui.base_panel import (
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

    BINDINGS = [
        Binding("enter", "drill_detail", "Story Details", show=False),
    ]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._story_data: dict[str, Any] | None = None
        self._todos_data: dict[str, Any] | None = None
        self._git_data: dict[str, Any] | None = None
        self._sprint_data: dict[str, Any] | None = None
        self._sprint_dates: dict[str, str] = {}

    def on_mount(self) -> None:
        """Subscribe to all 4 channels and load sprint dates."""
        self._mounted = True
        self._sprint_dates = self._load_sprint_dates()
        if self._client is not None:
            self._client.subscribe("story", self._handle_story)
            self._client.subscribe("todos", self._handle_todos)
            self._client.subscribe("git", self._handle_git)
            self._client.subscribe("sprint", self._handle_sprint)

    def _load_sprint_dates(self) -> dict[str, str]:
        """Load start/end dates from sprint YAML (once at mount)."""
        try:
            from pf.sprint.loader import get_sprint_info

            info = get_sprint_info()
            return {
                "start_date": info.get("start_date", ""),
                "end_date": info.get("end_date", ""),
            }
        except Exception:
            return {}

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

    def drill_into_story(self) -> None:
        """Push StoryDetailScreen for the current story.

        Uses the ``collapsible`` variant — the drill-through renders through
        StoryDetailWidget's navigable Collapsible sections.
        """
        story_data = self._build_story_detail_data()
        if story_data is None:
            return
        from pf.tui.story_detail_screen import StoryDetailScreen

        try:
            self.app.push_screen(StoryDetailScreen(story_data=story_data, variant="collapsible"))
        except Exception:
            pass

    def action_drill_detail(self) -> None:
        """Action handler for Enter keybinding — drill into story details."""
        self.drill_into_story()

    def _build_story_detail_data(self) -> dict[str, Any] | None:
        """Build story_data dict suitable for StoryDetailScreen."""
        story = self._story_data or {}
        sprint = self._sprint_data or {}

        current = sprint.get("sprint", {}).get("currentStory")
        if isinstance(current, str) and current:
            story_id = current
        else:
            story_id = story.get("id", "")

        if not story_id and not story.get("title"):
            return None

        return {
            "id": story_id,
            "title": story.get("title", ""),
            "points": story.get("points", ""),
            "status": story.get("status", ""),
            "assignee": story.get("assignee", ""),
            "workflow": story.get("workflow", ""),
            "workflow_phase": story.get("phase", ""),
            **{
                k: v
                for k, v in story.items()
                if k
                not in (
                    "id",
                    "title",
                    "points",
                    "status",
                    "assignee",
                    "workflow",
                    "phase",
                )
            },
        }

    def _separator(self) -> Text:
        """Return a width-aware horizontal separator."""
        w = self.size.width - 2 if self.size.width > 4 else 35
        return Text("\u2500" * w, style="dim")

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render unified progress view."""
        parts: list[Any] = []

        # --- Story Header ---
        story_header = self._render_story_header()
        if story_header is not None:
            parts.append(story_header)
        else:
            next_header = self._render_next_story()
            if next_header is not None:
                parts.append(next_header)
            else:
                parts.append(
                    Text(
                        "No stories \u2014 backlog empty",
                        style="dim italic",
                    )
                )
        parts.append(self._separator())

        # --- Sprint Burndown ---
        burndown = self._render_burndown()
        if burndown is not None:
            parts.append(burndown)
            parts.append(self._separator())

        # --- Per-Epic Progress ---
        epics = self._render_epics_progress()
        if epics is not None:
            parts.append(epics)
            parts.append(self._separator())

        # --- Velocity & Timeline ---
        velocity = self._render_velocity_timeline()
        if velocity is not None:
            parts.append(velocity)
            parts.append(self._separator())

        # --- Recently Completed ---
        recent = self._render_recently_completed()
        if recent is not None:
            parts.append(recent)
            parts.append(self._separator())

        # --- Workflow Phase ---
        workflow = self._render_workflow()
        if workflow is not None:
            parts.append(workflow)
            parts.append(self._separator())

        # --- Acceptance Criteria ---
        ac = self._render_ac()
        if ac is not None:
            parts.append(ac)
            parts.append(self._separator())

        # --- Todos ---
        todos = self._render_todos()
        if todos is not None:
            parts.append(todos)
            parts.append(self._separator())

        # --- Git Summary ---
        git = self._render_git()
        if git is not None:
            parts.append(git)

        # --- Drill-through hint ---
        parts.append(Text(""))
        parts.append(Text("[Enter] Story Details", style="dim"))

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

    def _render_next_story(self) -> Text | None:
        """Render the next backlog story as a 'Next Story' header."""
        try:
            from pf.sprint.loader import get_stories_by_status

            backlog = get_stories_by_status("backlog")
            if not backlog:
                return None
            s = backlog[0]
            header = Text()
            header.append("Next Story  ", style="dim italic")
            header.append(s.get("id", ""), style="bold cyan")
            header.append("  ")
            header.append(s.get("title", ""), style="bold")
            pts = s.get("points", "")
            if pts:
                header.append(f"  {pts}pt", style="dim")
            header.append("\n")
            header.append("/sprint work to start", style="dim italic")
            return header
        except Exception:
            return None

    def _render_burndown(self) -> Text | None:
        """Render sprint burndown bar with done/remaining/WIP counts."""
        sprint = (self._sprint_data or {}).get("sprint", {})
        if not sprint:
            return None

        done = sprint.get("done", 0)
        remaining = sprint.get("remaining", 0)
        in_progress = sprint.get("inProgress", 0)
        total = done + remaining + in_progress
        if total == 0:
            return None

        pct = int(done / total * 100)
        sprint_num = sprint.get("number", "")

        line = Text()
        if sprint_num:
            line.append(f"Sprint {sprint_num}  ", style="bold")
        line.append_text(render_progress_bar(pct, width=20, fill_style="green"))
        line.append(f"  {done}d", style="green")
        line.append(f" \u00b7 {remaining}r", style="dim")
        line.append(f" \u00b7 {in_progress}w", style="yellow" if in_progress else "dim")
        return line

    def _render_epics_progress(self) -> Text | None:
        """Render per-epic progress bars (max 5 active epics)."""
        epics = (self._sprint_data or {}).get("epics", [])
        if not epics:
            return None

        # Filter to epics with at least one non-done story
        active: list[tuple[dict[str, Any], int, int]] = []
        for ep in epics:
            if not isinstance(ep, dict):
                continue
            done_s, total_s, _dp, _tp = _epic_stats(ep)
            if total_s > 0 and done_s < total_s:
                active.append((ep, done_s, total_s))
        if not active:
            return None

        lines = Text()
        lines.append("Epics\n", style="bold")
        for ep, done_s, total_s in active[:5]:
            epic_id = str(ep.get("id", ""))
            title = ep.get("title", "")
            pct = int(done_s / total_s * 100)
            lines.append(f"  {epic_id:<5}", style="dim")
            lines.append_text(render_progress_bar(pct, width=10, fill_style="dim green"))
            lines.append(f"  {done_s}/{total_s}   {title}\n")
        return lines

    def _render_velocity_timeline(self) -> Text | None:
        """Render days remaining, velocity, and projected completion."""
        sprint = (self._sprint_data or {}).get("sprint", {})
        if not sprint:
            return None

        # Parse dates — prefer YAML-loaded start, WS end, then fallback
        start_str = self._sprint_dates.get("start_date", "") or sprint.get("startDate", "")
        end_str = sprint.get("endDate", "") or self._sprint_dates.get("end_date", "")
        if not start_str or not end_str:
            return None

        try:
            start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
            end = datetime.strptime(end_str[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None

        today = date.today()
        total_days = max((end - start).days, 1)
        elapsed = max((today - start).days, 0)
        days_left = max((end - today).days, 0)

        done = sprint.get("done", 0)
        remaining = sprint.get("remaining", 0) + sprint.get("inProgress", 0)

        pts_per_day = round(done / max(elapsed, 1), 1)
        on_track = (
            pts_per_day * days_left >= remaining if days_left > 0 else done >= remaining + done
        )

        line = Text()
        line.append(f"Day {elapsed}/{total_days}  ", style="bold")
        line.append(f"{days_left}d left  ", style="dim")
        line.append(f"{pts_per_day} pts/day  ")
        if on_track:
            line.append("on track \u2713", style="green")
        else:
            line.append("at risk \u2717", style="red")
        return line

    def _render_recently_completed(self) -> Text | None:
        """Render last 3 completed stories."""
        epics = (self._sprint_data or {}).get("epics", [])
        if not epics:
            return None

        done_stories: list[dict[str, Any]] = []
        for ep in epics:
            if not isinstance(ep, dict):
                continue
            for s in ep.get("stories", []):
                if isinstance(s, dict) and s.get("status") == "done":
                    done_stories.append(s)

        if not done_stories:
            return None

        # Sort by completed date descending, take last 3
        done_stories.sort(
            key=lambda s: s.get("completed", "") or "",
            reverse=True,
        )

        lines = Text()
        lines.append("Done\n", style="bold")
        for s in done_stories[:3]:
            sid = s.get("id", "")
            title = s.get("title", "")
            pts = s.get("points", "")
            lines.append(f"  \u2713 {sid:<8}", style="green")
            lines.append(f"{title}")
            if pts:
                lines.append(f"  {pts}pt", style="dim")
            lines.append("\n")
        return lines

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
            if phase_status == "done" or (
                current_phase
                and phase_name != current_phase
                and _phase_before(phase_name, current_phase, phases)
            ):
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


def _epic_stats(epic: dict[str, Any]) -> tuple[int, int, int, int]:
    """Return (done_stories, total_stories, done_points, total_points) for an epic."""
    stories = epic.get("stories", [])
    total_stories = len(stories)
    done_stories = 0
    total_points = 0
    done_points = 0
    for s in stories:
        if not isinstance(s, dict):
            continue
        pts = s.get("points", 0)
        if not isinstance(pts, (int, float)):
            pts = 0
        total_points += pts
        if s.get("status") == "done":
            done_stories += 1
            done_points += pts
    return done_stories, total_stories, done_points, total_points


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
