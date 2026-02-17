"""StoryDetailScreen — Mission dossier detail view for BikeRack TUI.

Story 110-2: Story drill-through with dossier detail screen.
Pushed via Screen.push() from SprintPanel when user presses Enter on a story.
"""

from __future__ import annotations

import webbrowser
from typing import Any

from rich.text import Text
from textual.binding import Binding
from textual.screen import Screen
from textual.widgets import Static


class StoryDetailScreen(Screen):
    """Detail screen showing story dossier layout.

    Displays AC checklist, workflow phase dots, git branch, PR link,
    and session notes in a mission-dossier layout.
    """

    BINDINGS = [
        Binding("escape", "pop_screen", "Back"),
        Binding("enter", "open_pr_link", "Open PR"),
    ]

    def __init__(self, story_data: dict[str, Any] | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        ws_data: dict[str, Any] = story_data or {}
        self._story_data = self._enrich(ws_data)

    @staticmethod
    def _enrich(ws_data: dict[str, Any]) -> dict[str, Any]:
        """Merge WS data with file-based enrichment. WS wins for non-null fields."""
        story_id = ws_data.get("id", "")
        if not story_id:
            return ws_data

        try:
            from pennyfarthing_scripts.bikerack.story_detail_data import fetch_story_detail

            enriched = fetch_story_detail(story_id)
        except Exception:
            return ws_data

        if not enriched:
            return ws_data

        # Merge: enriched is base, WS data overwrites non-null values
        merged = {**enriched}
        for key, val in ws_data.items():
            if val is not None and val != "" and val != []:
                merged[key] = val
        return merged

    def compose(self):
        """Compose the dossier layout with header, ACs, workflow, git info.

        Absent sections are simply omitted (Tufte: absence is information).
        """
        data = self._story_data

        # Header section
        title = data.get("title", "Unknown Story")
        points = data.get("points", "?")
        status = data.get("status", "unknown")
        jira_key = data.get("jiraKey", "")
        assignee = data.get("assignee", "")
        priority = data.get("priority", "")

        header_text = Text()
        if jira_key:
            header_text.append(f"{jira_key}", style="bold cyan")
            header_text.append("  ")
        header_text.append(f"{title}", style="bold")
        # Metadata line
        meta_parts = [status]
        if points and points != "?":
            meta_parts.append(f"{points} pts")
        if priority:
            meta_parts.append(priority)
        if assignee:
            from pennyfarthing_scripts.bikerack.sprint_panel import _format_assignee

            name = _format_assignee(assignee)
            if name:
                meta_parts.append(name)
        separator = " \u00b7 "
        header_text.append(f"\n{separator.join(meta_parts)}", style="dim")
        yield Static(header_text, id="dossier-header")

        # Context section (only if context files exist)
        has_epic_ctx = data.get("has_epic_context", False)
        has_story_ctx = data.get("has_story_context", False)
        if has_epic_ctx or has_story_ctx:
            ctx_text = Text()
            ctx_text.append("Context\n", style="bold underline")
            if has_epic_ctx:
                ctx_text.append("  \u2713 Epic context\n", style="green")
            else:
                ctx_text.append("  \u25cb Epic context\n", style="dim")
            if has_story_ctx:
                ctx_text.append("  \u2713 Story context\n", style="green")
            else:
                ctx_text.append("  \u25cb Story context\n", style="dim")
            yield Static(ctx_text, id="dossier-context")

        # Acceptance Criteria section
        acs = data.get("acceptance_criteria", [])
        if acs:
            ac_text = Text()
            done_count = sum(1 for ac in acs if ac.get("done"))
            ac_text.append("Acceptance Criteria", style="bold underline")
            ac_text.append(f"  {done_count}/{len(acs)}\n", style="dim")
            for ac in acs:
                check = "\u2713" if ac.get("done") else "\u25cb"
                style = "green" if ac.get("done") else ""
                ac_text.append(f"  {check} {ac.get('text', '')}\n", style=style)
            yield Static(ac_text, id="dossier-ac")

        # Workflow section
        workflow = data.get("workflow", "")
        phase = data.get("workflow_phase", "")
        if workflow:
            wf_text = Text()
            wf_text.append("Workflow\n", style="bold underline")
            wf_text.append(f"  {workflow}", style="cyan")
            if phase:
                wf_text.append(f"  Phase: {phase}", style="yellow")
            wf_text.append("\n")
            yield Static(wf_text, id="dossier-workflow")

        # Git info section
        branch = data.get("git_branch", "")
        pr_url = data.get("pr_url")
        if branch or pr_url:
            git_text = Text()
            git_text.append("Git\n", style="bold underline")
            if branch:
                git_text.append(f"  Branch: {branch}\n")
            if pr_url:
                git_text.append(f"  PR: {pr_url}\n", style="cyan")
            yield Static(git_text, id="dossier-git")

        # Session notes section
        notes = data.get("session_notes", "")
        if notes:
            notes_text = Text()
            notes_text.append("Session Notes\n", style="bold underline")
            notes_text.append(f"  {notes}\n")
            yield Static(notes_text, id="dossier-notes")

        # Keybinding hint
        hint = Text.from_markup(
            "\n[dim][Escape] Back  [Enter] Open PR[/dim]"
        )
        yield Static(hint, id="dossier-hint")

    def action_pop_screen(self) -> None:
        """Pop this screen off the stack."""
        self.dismiss()

    def get_pr_url(self) -> str | None:
        """Get the PR URL from story data."""
        url = self._story_data.get("pr_url")
        return url if url else None

    def action_open_pr_link(self) -> bool:
        """Open PR link in browser via webbrowser.open()."""
        url = self.get_pr_url()
        if not url:
            return False
        webbrowser.open(url)
        return True
