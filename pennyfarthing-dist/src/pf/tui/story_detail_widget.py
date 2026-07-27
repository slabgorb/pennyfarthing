"""StoryDetailWidget — Reusable story detail view using native Textual widgets.

Story 120-8: Story details and progress page enrichment with native Textual widgets.
Renders story data inside Collapsible sections with Rule separators.
Used by both StoryDetailScreen and ProgressPanel drill-through.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text
from textual.widget import Widget
from textual.widgets import Collapsible, Rule, Static

from pf.tui.ac_shapes import ac_done_count, ac_is_done, ac_label


class StoryDetailWidget(Widget):
    """Reusable story detail view with native Textual widgets.

    Renders story data as Collapsible sections for ACs, Workflow, Git,
    Context, and Session Notes. Absent sections are omitted (Tufte pattern).
    """

    def __init__(self, story_data: dict[str, Any] | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._story_data: dict[str, Any] = story_data or {}

    def compose(self):
        """Compose the detail layout with header and collapsible sections."""
        data = self._story_data

        # Header — always present
        yield self._build_header(data)

        # Sections — only yielded when data exists
        sections_yielded = 0

        # Acceptance Criteria
        acs = data.get("acceptance_criteria", [])
        if acs:
            if sections_yielded > 0:
                yield Rule()
            done_count = ac_done_count(acs)
            yield self._build_ac_section(acs, done_count)
            sections_yielded += 1

        # Workflow
        workflow = data.get("workflow", "")
        if workflow:
            if sections_yielded > 0:
                yield Rule()
            phase = data.get("workflow_phase", "")
            yield self._build_workflow_section(workflow, phase)
            sections_yielded += 1

        # Git
        branch = data.get("git_branch", "")
        pr_url = data.get("pr_url")
        if branch or pr_url:
            if sections_yielded > 0:
                yield Rule()
            yield self._build_git_section(branch, pr_url)
            sections_yielded += 1

        # Context
        has_epic_ctx = data.get("has_epic_context", False)
        has_story_ctx = data.get("has_story_context", False)
        if has_epic_ctx or has_story_ctx:
            if sections_yielded > 0:
                yield Rule()
            yield self._build_context_section(has_epic_ctx, has_story_ctx)
            sections_yielded += 1

        # Session Notes
        notes = data.get("session_notes", "")
        if notes:
            if sections_yielded > 0:
                yield Rule()
            yield self._build_notes_section(notes)
            sections_yielded += 1

    @staticmethod
    def _build_header(data: dict[str, Any]) -> Static:
        """Build the story header with title and metadata."""
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
        if points and points != "?":
            header_text.append(f"  {points}pt", style="dim")

        meta_parts = [status]
        if priority:
            meta_parts.append(priority)
        if assignee:
            meta_parts.append(assignee)
        separator = " \u00b7 "
        header_text.append(f"\n{separator.join(meta_parts)}", style="dim")

        return Static(header_text, id="detail-header")

    @staticmethod
    def _build_ac_section(acs: list[dict[str, Any]], done_count: int) -> Collapsible:
        """Build the Acceptance Criteria collapsible section."""
        ac_text = Text()
        for ac in acs:
            done = ac_is_done(ac)
            check = "\u2713" if done else "\u25cb"
            style = "green" if done else ""
            ac_text.append(f"  {check} {ac_label(ac)}\n", style=style)

        return Collapsible(
            Static(ac_text),
            title=f"Acceptance Criteria  {done_count}/{len(acs)}",
        )

    @staticmethod
    def _build_workflow_section(workflow: str, phase: str) -> Collapsible:
        """Build the Workflow collapsible section."""
        wf_text = Text()
        wf_text.append(f"  [{workflow}]", style="cyan")
        if phase:
            wf_text.append(f"  Phase: {phase}", style="yellow")

        return Collapsible(Static(wf_text), title="Workflow")

    @staticmethod
    def _build_git_section(branch: str, pr_url: str | None) -> Collapsible:
        """Build the Git collapsible section."""
        git_text = Text()
        if branch:
            git_text.append(f"  Branch: {branch}\n")
        if pr_url:
            git_text.append(f"  PR: {pr_url}\n", style="cyan")

        return Collapsible(Static(git_text), title="Git")

    @staticmethod
    def _build_context_section(has_epic: bool, has_story: bool) -> Collapsible:
        """Build the Context collapsible section."""
        ctx_text = Text()
        if has_epic:
            ctx_text.append("  \u2713 Epic context\n", style="green")
        else:
            ctx_text.append("  \u25cb Epic context\n", style="dim")
        if has_story:
            ctx_text.append("  \u2713 Story context\n", style="green")
        else:
            ctx_text.append("  \u25cb Story context\n", style="dim")

        return Collapsible(Static(ctx_text), title="Context")

    @staticmethod
    def _build_notes_section(notes: str) -> Collapsible:
        """Build the Session Notes collapsible section."""
        return Collapsible(Static(f"  {notes}"), title="Session Notes")
