"""Story detail data fetching for BikeRack TUI.

Story 110-2: Fetch story detail data (AC, session, workflow) via file read or API.
Returns enriched story data for StoryDetailScreen dossier layout.
"""

from __future__ import annotations

from typing import Any


def fetch_story_detail(
    story_id: str,
    project_root: str | None = None,
) -> dict[str, Any]:
    """Fetch detailed story data including ACs, session, workflow, and git info.

    Args:
        story_id: Story identifier (e.g. "110-2").
        project_root: Path to project root (for file reads). Auto-detected if None.

    Returns:
        Dict with keys: id, title, points, status, jiraKey,
        acceptance_criteria, workflow, workflow_phase,
        git_branch, pr_url, session_notes.
        Empty dict if story not found.
    """
    return {}
