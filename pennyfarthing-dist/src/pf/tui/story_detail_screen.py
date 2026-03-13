"""StoryDetailScreen — Mission dossier detail view for BikeRack TUI.

Story 110-2: Story drill-through with dossier detail screen.
Pushed via Screen.push() from SprintPanel when user presses Enter on a story.
"""

from __future__ import annotations

import webbrowser
from typing import Any

from rich.text import Text
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.screen import Screen
from textual.widgets import Markdown, Static

from pf.tui.base_panel import render_progress_bar

# Phase maps for known workflows
_WORKFLOW_PHASES: dict[str, list[str]] = {
    "tdd": ["setup", "red", "green", "verify", "review", "finish"],
    "bdd": ["setup", "design", "red", "green", "review", "finish"],
    "trivial": ["setup", "implement", "review", "finish"],
    "agent-docs": ["setup", "orchestrate", "write", "review", "finish"],
}

# Display labels for workflow phases
_PHASE_LABELS: dict[str, str] = {
    "setup": "SM",
    "red": "TEA",
    "green": "Dev",
    "verify": "TEA",
    "review": "Rev",
    "finish": "SM",
    "design": "UX",
    "implement": "Dev",
    "orchestrate": "Orch",
    "write": "TW",
}


def _render_workflow_dots(workflow: str, current_phase: str, status: str = "") -> Text | None:
    """Render workflow phase dots: [tdd] ✓ SM → ✓ TEA → ● Dev → ○ Rev → ○ SM"""
    phases = _WORKFLOW_PHASES.get(workflow)
    if not phases:
        # Fallback for unknown workflows
        if not workflow:
            return None
        line = Text()
        line.append(f"[{workflow}]", style="bold")
        if current_phase:
            line.append(f"  {current_phase}", style="yellow")
        return line

    line = Text()
    line.append(f"[{workflow}]", style="bold")
    line.append("  ")

    # Completed stories: all phases done
    all_done = status in ("done", "canceled") or (
        not current_phase and status not in ("backlog", "ready")
    )
    current_idx = phases.index(current_phase) if current_phase in phases else -1

    for i, phase in enumerate(phases):
        label = _PHASE_LABELS.get(phase, phase)

        if all_done or (current_idx >= 0 and i < current_idx):
            line.append("\u2713", style="green")
            line.append(f" {label}", style="dim")
        elif phase == current_phase:
            line.append("\u25cf", style="bold yellow")
            line.append(f" {label}", style="bold")
        else:
            line.append("\u25cb", style="dim")
            line.append(f" {label}", style="dim")

        if i < len(phases) - 1:
            line.append(" \u2192 ", style="dim")

    return line


class _MarkdownPreview(VerticalScroll):
    """Scrollable markdown preview container that yields children via compose()."""

    def __init__(self, *content_widgets: Any, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content_widgets = content_widgets

    def compose(self):
        yield from self._content_widgets


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
            from pf.tui.story_detail_data import fetch_story_detail

            enriched = fetch_story_detail(story_id, jira_key=ws_data.get("jiraKey", ""))
        except Exception:
            return ws_data

        if not enriched:
            return ws_data

        # Merge: enriched is base, WS data overwrites non-null values
        merged = {**enriched}
        for key, val in ws_data.items():
            if val is not None and val != []:
                merged[key] = val
        return merged

    def compose(self):
        """Compose the dossier layout with header, ACs, workflow, git info.

        Tufte-style dense layout — absent sections are simply omitted.
        """
        data = self._story_data

        # Header section
        title = data.get("title", "Unknown Story")
        points = data.get("points", "?")
        status = data.get("status", "unknown")
        jira_key = data.get("jiraKey", "")
        assignee = data.get("assignee", "")
        priority = data.get("priority", "")
        is_archived = data.get("archived", False)

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
            from pf.tui.sprint_panel import _format_assignee

            name = _format_assignee(assignee)
            if name:
                meta_parts.append(name)
        separator = " \u00b7 "
        header_text.append(f"\n{separator.join(meta_parts)}", style="dim")
        if is_archived:
            header_text.append("  ARCHIVED", style="dim italic")
        yield Static(header_text, id="dossier-header")

        # Workflow section — phase dots
        workflow = data.get("workflow", "")
        phase = data.get("workflow_phase", "")
        if workflow:
            wf_text = _render_workflow_dots(workflow, phase, status=status)
            if wf_text is not None:
                yield Static(wf_text, id="dossier-workflow")

        # AC section — progress bar
        acs = data.get("acceptance_criteria", [])
        if acs:
            done_count = sum(1 for ac in acs if ac.get("done"))
            total = len(acs)
            pct = int(done_count / total * 100) if total > 0 else 0
            ac_line = Text()
            ac_line.append("AC   ", style="bold")
            ac_line.append_text(render_progress_bar(pct, width=10))
            ac_line.append(f"  {done_count}/{total}")
            yield Static(ac_line, id="dossier-ac")

        # Context section — always show so user knows what's available
        has_epic_ctx = data.get("has_epic_context", False)
        has_story_ctx = data.get("has_story_context", False)
        ctx_text = Text()
        ctx_text.append("Ctx  ", style="bold")
        if has_epic_ctx:
            ctx_text.append("\u2713 Epic", style="green")
        else:
            ctx_text.append("\u25cb Epic", style="dim")
        ctx_text.append("  ")
        if has_story_ctx:
            ctx_text.append("\u2713 Story", style="green")
        else:
            ctx_text.append("\u25cb Story", style="dim")
        yield Static(ctx_text, id="dossier-context")

        # Git info section — single line
        branch = data.get("git_branch", "")
        pr_url = data.get("pr_url")
        if branch or pr_url:
            git_text = Text()
            git_text.append("Git  ", style="bold")
            if branch:
                git_text.append(branch, style="cyan")
            if pr_url:
                git_text.append(f"  PR: {pr_url}", style="cyan")
            yield Static(git_text, id="dossier-git")

        # Review section
        review_verdict = data.get("review_verdict", "")
        review_findings = data.get("review_findings", "")
        if review_verdict or review_findings:
            review_text = Text()
            review_text.append("Review  ", style="bold")
            if review_verdict:
                if "approved" in review_verdict.lower():
                    review_text.append(f"\u2713 {review_verdict}", style="green")
                else:
                    review_text.append(review_verdict, style="yellow")
            if review_findings:
                review_text.append(f"  {review_findings}", style="dim")
            yield Static(review_text, id="dossier-review")

        # Session notes section
        notes = data.get("session_notes", "")
        if notes:
            notes_text = Text()
            notes_text.append("Notes  ", style="bold")
            notes_text.append(notes)
            yield Static(notes_text, id="dossier-notes")

        # Markdown preview section (context files + session content)
        epic_content = data.get("epic_context_content", "")
        story_content = data.get("story_context_content", "")
        session_content = data.get("session_file_content", "")

        if epic_content or story_content or session_content:
            children = []
            if epic_content:
                children.append(Markdown(epic_content))
            if story_content:
                children.append(Markdown(story_content))
            if session_content:
                children.append(Markdown(session_content))
            yield _MarkdownPreview(*children, id="dossier-preview")

        # Keybinding hint
        hint = Text.from_markup("\n[dim][Escape] Back  [Enter] Open PR[/dim]")
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
