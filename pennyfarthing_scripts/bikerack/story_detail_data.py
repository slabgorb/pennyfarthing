"""Story detail data fetching for BikeRack TUI.

Story 110-2: Fetch story detail data (AC, session, workflow) via file read or API.
Returns enriched story data for StoryDetailScreen dossier layout.
"""

from __future__ import annotations

import os
import re
import subprocess
from typing import Any


def _find_project_root() -> str | None:
    """Walk up from CWD looking for .pennyfarthing/ directory."""
    path = os.getcwd()
    while True:
        if os.path.isdir(os.path.join(path, ".pennyfarthing")):
            return path
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent


def _find_session_file(story_id: str, project_root: str | None) -> str | None:
    """Locate the session file for a story, trying given root then walking up."""
    filename = f"{story_id}-session.md"
    if project_root:
        candidate = os.path.join(project_root, ".session", filename)
        if os.path.isfile(candidate):
            return candidate
    # Walk up from CWD looking for .session/{story_id}-session.md
    path = os.getcwd()
    while True:
        candidate = os.path.join(path, ".session", filename)
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent


def _parse_session_file(session_path: str) -> dict[str, Any]:
    """Parse a session markdown file for metadata fields."""
    result: dict[str, Any] = {}
    with open(session_path) as f:
        content = f.read()

    # Parse title from first heading: # Story X-Y: Title
    title_match = re.search(r"^# Story [\w-]+:\s*(.+)", content, re.MULTILINE)
    if title_match:
        result["title"] = title_match.group(1).strip()

    # Parse bold metadata lines: **Key:** value
    for match in re.finditer(r"\*\*(\w[\w\s]*?):\*\*\s*(.*)", content):
        key = match.group(1).strip().lower()
        value = match.group(2).strip()
        if key == "phase":
            result["workflow_phase"] = value
        elif key == "workflow":
            result["workflow"] = value
        elif key == "branch":
            result["git_branch"] = value
        elif key == "jira":
            result["jiraKey"] = value
        elif key == "points":
            try:
                result["points"] = int(value)
            except ValueError:
                result["points"] = value
        elif key == "review verdict":
            result["review_verdict"] = value
        elif key == "review findings":
            result["review_findings"] = value

    # Parse ACs from ## Acceptance Criteria section
    ac_match = re.search(
        r"## Acceptance Criteria\n(.*?)(?=\n##|\Z)", content, re.DOTALL
    )
    if ac_match:
        ac_text = ac_match.group(1)
        acs: list[dict[str, Any]] = []
        for line in ac_text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # Strip leading number. or - or *
            text = re.sub(r"^[\d]+\.\s*", "", line).strip()
            text = re.sub(r"^[-*]\s*", "", text).strip()
            if text:
                acs.append({"text": text, "done": False})
        if acs:
            result["acceptance_criteria"] = acs

    # Parse session notes from ## Session Log section
    log_match = re.search(
        r"## Session Log\n(.*?)(?=\n##|\Z)", content, re.DOTALL
    )
    if log_match:
        result["session_notes"] = log_match.group(1).strip()

    return result


def _get_sprint_story_status(story_id: str) -> str | None:
    """Try to get story status from pf sprint CLI."""
    try:
        out = subprocess.run(
            ["pf", "sprint", "story", "field", story_id, "status"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return None


def _get_pr_url(branch: str) -> str | None:
    """Try to get PR URL for a branch via gh CLI."""
    if not branch:
        return None
    try:
        out = subprocess.run(
            [
                "gh",
                "pr",
                "list",
                "--head",
                branch,
                "--json",
                "url",
                "--jq",
                ".[0].url",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return None


def _check_context_files(story_id: str, project_root: str | None) -> dict[str, Any]:
    """Check for epic and story context files.

    Args:
        story_id: Story identifier (e.g. "110-2").
        project_root: Path to project root.

    Returns:
        Dict with has_epic_context, has_story_context, and their paths.
    """
    result: dict[str, Any] = {
        "has_epic_context": False,
        "has_story_context": False,
        "epic_context_path": "",
        "story_context_path": "",
    }
    if not project_root:
        return result

    # Extract epic number from story ID (e.g. "110-2" → "110")
    parts = story_id.split("-")
    if parts:
        epic_num = parts[0]
        epic_path = os.path.join(project_root, "sprint", "context", f"context-epic-{epic_num}.md")
        if os.path.isfile(epic_path):
            result["has_epic_context"] = True
            result["epic_context_path"] = epic_path

    story_path = os.path.join(project_root, "sprint", "context", f"context-story-{story_id}.md")
    if os.path.isfile(story_path):
        result["has_story_context"] = True
        result["story_context_path"] = story_path

    return result


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
    session_path = _find_session_file(story_id, project_root)
    if not session_path:
        return {}

    result: dict[str, Any] = {"id": story_id}

    # Parse session file (primary data source)
    session_data = _parse_session_file(session_path)
    result.update(session_data)

    # Get status from sprint YAML if not in session
    if "status" not in result:
        status = _get_sprint_story_status(story_id)
        if status:
            result["status"] = status

    # Get PR URL if we have a branch
    if "pr_url" not in result:
        pr_url = _get_pr_url(result.get("git_branch", ""))
        result["pr_url"] = pr_url

    # Check for context files
    root = project_root or _find_project_root()
    context_info = _check_context_files(story_id, root)
    result.update(context_info)

    # Ensure all required keys exist with defaults
    result.setdefault("title", "")
    result.setdefault("points", 0)
    result.setdefault("status", "unknown")
    result.setdefault("jiraKey", "")
    result.setdefault("acceptance_criteria", [])
    result.setdefault("workflow", "")
    result.setdefault("workflow_phase", "")
    result.setdefault("git_branch", "")
    result.setdefault("pr_url", None)
    result.setdefault("session_notes", "")
    result.setdefault("review_findings", "")
    result.setdefault("review_verdict", "")

    return result
