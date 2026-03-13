"""Signal collector — gather story signals for demo artifact generation.

Collects acceptance criteria, PR diff, commits, session fields, and review
findings from a completed story. Returns a SignalBundle dataclass.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from pf.demo.models import SignalBundle

SESSION_FIELD_RE = re.compile(r"\*\*(\w[\w\s]*):\*\*\s*(.*)")
DIFF_FILE_RE = re.compile(r"diff --git a/(.+?) b/")
MAX_DIFF_CHARS = 50_000


def collect_signals(
    story_id: str,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Collect all signals for a completed story.

    Args:
        story_id: Story identifier (e.g., "145-1")
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Result object: {success: bool, data?: SignalBundle, error?: str}
    """
    if not story_id:
        return {"success": False, "error": "story_id is required"}

    if project_root is None:
        from pf.common.config import get_project_root

        project_root = get_project_root()

    from pf.sprint.loader import load_sprint

    sprint_data = load_sprint(project_root)
    if sprint_data is None:
        return {"success": False, "error": "Sprint data not found"}

    story, epic = _find_story_in_sprint(sprint_data, story_id)
    if story is None:
        return {"success": False, "error": f"Story {story_id} not found in sprint data"}

    title = story.get("title", "")
    jira_key = story.get("jira") or None
    points = story.get("points")
    acceptance_criteria = story.get("acceptance_criteria", [])
    branch = story.get("branch", "")

    session_path = project_root / ".session" / f"{story_id}-session.md"
    session_fields = parse_session_fields(session_path)

    diff_result = get_pr_diff(branch, project_root=project_root)
    pr_diff = diff_result.get("data", "") if diff_result["success"] else ""

    file_extensions = extract_file_extensions(pr_diff)

    commit_messages = get_commit_messages(branch, project_root=project_root)

    review_findings = get_review_findings(story_id, project_root=project_root)

    bundle = SignalBundle(
        story_id=story_id,
        title=title,
        jira_key=jira_key,
        points=points,
        acceptance_criteria=acceptance_criteria,
        pr_diff=pr_diff,
        commit_messages=commit_messages,
        session_fields=session_fields,
        review_findings=review_findings,
        file_extensions=file_extensions,
    )

    return {"success": True, "data": bundle}


def _find_story_in_sprint(
    sprint_data: dict[str, Any], story_id: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Search all epics in sprint data for a story by ID."""
    for epic in sprint_data.get("epics", []):
        for story in epic.get("stories", []):
            if story.get("id") == story_id:
                return story, epic
    return None, None


def parse_session_fields(session_path: Path) -> dict[str, str]:
    """Extract **Key:** Value fields from a session markdown file.

    Reuses the same regex pattern as story_finish.py.

    Args:
        session_path: Path to the session .md file

    Returns:
        Dict mapping lowercase field names to their string values
    """
    fields: dict[str, str] = {}
    if not session_path.exists():
        return fields
    for line in session_path.read_text().splitlines():
        m = SESSION_FIELD_RE.search(line)
        if m:
            key = m.group(1).strip().lower()
            value = m.group(2).strip()
            fields[key] = value
    return fields


def get_pr_diff(
    branch: str,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Retrieve PR diff via gh CLI, falling back to git diff.

    Args:
        branch: Feature branch name
        project_root: Project root path

    Returns:
        Result object: {success: bool, data?: str, error?: str}
    """
    cwd = str(project_root) if project_root else None

    # Try gh pr diff first
    gh_result = subprocess.run(
        ["gh", "pr", "diff", "--name-only", branch],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if gh_result.returncode == 0:
        diff = gh_result.stdout[:MAX_DIFF_CHARS]
        return {"success": True, "data": diff}

    # Fallback to git diff
    git_result = subprocess.run(
        ["git", "diff", f"develop...{branch}"],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if git_result.returncode == 0:
        diff = git_result.stdout[:MAX_DIFF_CHARS]
        return {"success": True, "data": diff}

    return {"success": False, "error": "Failed to retrieve diff via gh and git"}


def get_commit_messages(
    branch: str,
    base_branch: str = "develop",
    project_root: Path | None = None,
) -> list[str]:
    """Get commit messages from the story branch.

    Args:
        branch: Feature branch name
        base_branch: Base branch to diff against
        project_root: Project root path

    Returns:
        List of commit message strings
    """
    cwd = str(project_root) if project_root else None

    result = subprocess.run(
        ["git", "log", f"{base_branch}..{branch}", "--pretty=format:%B"],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return []

    # Split on double newlines to separate commit messages
    messages = [m.strip() for m in result.stdout.strip().split("\n\n") if m.strip()]
    return messages


def extract_file_extensions(diff_text: str) -> set[str]:
    """Extract unique file extensions from a diff.

    Args:
        diff_text: Unified diff text

    Returns:
        Set of extensions like {".py", ".ts", ".rs"}
    """
    extensions: set[str] = set()
    for match in DIFF_FILE_RE.finditer(diff_text):
        filepath = match.group(1)
        before, sep, ext = filepath.rpartition(".")
        if sep and ext:  # sep is empty for extensionless files like Dockerfile
            extensions.add(f".{ext}")
    return extensions


def get_review_findings(
    story_id: str,
    project_root: Path | None = None,
) -> str | None:
    """Retrieve review findings for a story if available.

    Checks sprint/archive/findings/{story-id}.md first,
    then falls back to None.

    Args:
        story_id: Story identifier
        project_root: Project root path

    Returns:
        Findings text or None if not found
    """
    if project_root is None:
        from pf.common.config import get_project_root

        project_root = get_project_root()

    findings_path = project_root / "sprint" / "archive" / "findings" / f"{story_id}.md"
    if findings_path.exists():
        return findings_path.read_text()

    return None
