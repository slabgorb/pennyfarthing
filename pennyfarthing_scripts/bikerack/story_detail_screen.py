"""StoryDetailScreen — Mission dossier detail view for BikeRack TUI.

Story 110-2: Story drill-through with dossier detail screen.
Pushed via Screen.push() from SprintPanel when user presses Enter on a story.
"""

from __future__ import annotations

from typing import Any

from textual.binding import Binding
from textual.screen import Screen


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
        """Compose the dossier layout. Stub — to be implemented by Dev."""
        yield from ()

    def get_pr_url(self) -> str | None:
        """Get the PR URL from story data. Stub."""
        return None

    def action_open_pr_link(self) -> bool:
        """Open PR link in browser. Stub — returns False."""
        return False
