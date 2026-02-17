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
        self._story_data: dict[str, Any] = story_data or {}

    def compose(self):
        """Compose the dossier layout with header, ACs, workflow, git info."""
        data = self._story_data

        # Header section
        story_id = data.get("id", "?")
        title = data.get("title", "Unknown Story")
        points = data.get("points", "?")
        status = data.get("status", "unknown")
        jira_key = data.get("jiraKey", "")

        header_text = Text()
        header_text.append(f"{story_id}", style="bold cyan")
        header_text.append(f"  {title}", style="bold")
        header_text.append(f"\n{jira_key}", style="dim")
        header_text.append(f"  {points} pts", style="dim")
        header_text.append(f"  {status}", style="yellow")
        yield Static(header_text, id="dossier-header")

        # Acceptance Criteria section
        acs = data.get("acceptance_criteria", [])
        ac_text = Text()
        ac_text.append("Acceptance Criteria\n", style="bold underline")
        if acs:
            done_count = sum(1 for ac in acs if ac.get("done"))
            ac_text.append(f"  {done_count}/{len(acs)} complete\n", style="dim")
            for ac in acs:
                check = "\u2713" if ac.get("done") else "\u25cb"
                style = "green" if ac.get("done") else ""
                ac_text.append(f"  {check} {ac.get('text', '')}\n", style=style)
        else:
            ac_text.append("  No acceptance criteria\n", style="dim")
        yield Static(ac_text, id="dossier-ac")

        # Workflow section
        workflow = data.get("workflow", "")
        phase = data.get("workflow_phase", "")
        wf_text = Text()
        wf_text.append("Workflow\n", style="bold underline")
        if workflow:
            wf_text.append(f"  {workflow}", style="cyan")
            if phase:
                wf_text.append(f"  Phase: {phase}", style="yellow")
            wf_text.append("\n")
        else:
            wf_text.append("  No workflow\n", style="dim")
        yield Static(wf_text, id="dossier-workflow")

        # Git info section
        branch = data.get("git_branch", "")
        pr_url = data.get("pr_url")
        git_text = Text()
        git_text.append("Git\n", style="bold underline")
        if branch:
            git_text.append(f"  Branch: {branch}\n")
        if pr_url:
            git_text.append(f"  PR: {pr_url}\n", style="cyan")
        if not branch and not pr_url:
            git_text.append("  No git info\n", style="dim")
        yield Static(git_text, id="dossier-git")

        # Session notes section
        notes = data.get("session_notes", "")
        notes_text = Text()
        notes_text.append("Session Notes\n", style="bold underline")
        notes_text.append(f"  {notes or 'No notes'}\n")
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
