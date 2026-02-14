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
        """Render git status as Rich table with Nerd Font glyphs."""
        table = Table()
        table.add_column("Repository", style="cyan")
        table.add_column("Branch")
        table.add_column("Commits")
        table.add_column("Changes", justify="right")
        table.add_column("Status")

        for repo in payload.get("repos", []):
            branch = repo.get("branch", "")
            ahead = repo.get("ahead", 0)
            behind = repo.get("behind", 0)
            clean = repo.get("clean", True)
            dirty_files = repo.get("dirtyFiles", [])

            # Branch with Nerd Font glyph
            branch_col = f"\ue0a0 {branch}"

            # Commits: ahead/behind with arrow glyphs
            parts = []
            if ahead:
                parts.append(f"\u2b06{ahead}")
            if behind:
                parts.append(f"\u2b07{behind}")
            commits_col = " ".join(parts) if parts else "—"

            # Changes: count of dirty files
            changes_col = str(len(dirty_files))

            # Status: checkmark or cross
            status_col = "\u2713" if clean else "\u2717"

            table.add_row(
                repo.get("name", ""),
                branch_col,
                commits_col,
                changes_col,
                status_col,
            )

        return table
