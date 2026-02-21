"""StoryDetailScreen — Mission dossier detail view for BikeRack TUI.

Story 110-2: Story drill-through with dossier detail screen.
Story 120-8: Upgraded to use StoryDetailWidget with native Textual widgets.
Pushed via Screen.push() from SprintPanel or ProgressPanel.
"""

from __future__ import annotations

import webbrowser
from typing import Any

from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.screen import Screen

from pf.bikerack.story_detail_widget import StoryDetailWidget


class StoryDetailScreen(Screen):
    """Detail screen showing story dossier layout.

    Delegates rendering to StoryDetailWidget inside a VerticalScroll.
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
            from pf.bikerack.story_detail_data import fetch_story_detail

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
        """Compose the dossier layout using StoryDetailWidget."""
        yield VerticalScroll(
            StoryDetailWidget(story_data=self._story_data),
            id="detail-scroll",
        )

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
