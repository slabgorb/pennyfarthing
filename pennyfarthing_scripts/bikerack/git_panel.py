"""GitPanel — Multi-repo git status panel for BikeRack TUI.

Story 103-10: Subscribes to /ws/git, renders multi-repo git status
as Rich table with Nerd Font glyphs for branch and status indicators.
"""

from __future__ import annotations

from typing import Any

from rich.table import Table

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel


class GitPanel(BasePanel):
    """Multi-repo git status panel.

    Subscribes to the ``git`` WebSocket channel and renders
    git status for all configured repos as a Rich table with
    columns: Repository, Branch, Commits, Changes, Status.
    """

    channel: str = "git"
    panel_name: str = "Git"
    icon: str = PANEL_ICONS["git"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render git status as Rich table — stub, not yet implemented."""
        return Table()
