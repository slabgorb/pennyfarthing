"""Finish a completed story: archive, merge PR, update Jira, update YAML.

Replaces finish-story.sh with native Python that correctly handles
sharded epic YAML files via read_sprint/write_sprint.

Steps:
  1. Archive session file to sprint/archive/{jira-key}-session.md
  2. Squash merge PR via gh (handle already-merged)
  3. Transition Jira to Done
  4. Update sprint YAML (status: done, completed date)
  5. Archive completed epics
  6. Git cleanup (checkout develop, pull, delete local branch)
  7. Remove session file
"""

import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

from pennyfarthing_scripts.sprint.loader import find_epic, find_story
from pennyfarthing_scripts.sprint.yaml_io import read_sprint, write_sprint

SESSION_FIELD_RE = re.compile(r"\*\*(\w[\w\s]*):\*\*\s*(.*)")


def _parse_session(session_path: Path) -> dict[str, str]:
    """Extract metadata fields from a session markdown file.

    Parses lines like ``**Jira:** MSSCI-14467`` and
    ``**PR:** #748 - title`` into a dict.
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


def _extract_jira_key(fields: dict[str, str]) -> str | None:
    """Get Jira key from session fields, handling markdown link format."""
    raw = fields.get("jira", "")
    # Strip markdown link: [MSSCI-14467](https://...)
    raw = re.sub(r"\[([^\]]+)\].*", r"\1", raw).strip()
    if re.match(r"^MSSCI-\d+$", raw):
        return raw
    return None


def _extract_pr_number(fields: dict[str, str]) -> str | None:
    """Get PR number from session fields like ``#748 - title``."""
    raw = fields.get("pr", "")
    m = re.search(r"#(\d+)", raw)
    return m.group(1) if m else None


def _extract_branch(fields: dict[str, str]) -> str | None:
    """Get branch name, stripping trailing annotations like ``(pushed)``."""
    raw = fields.get("branch", "")
    return re.sub(r"\s*\(.*\)\s*$", "", raw).strip() or None


def _run(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with sane defaults."""
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def finish_story(
    project_root: Path,
    story_id: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Finish a story: archive, merge, update Jira, update YAML, clean up.

    Args:
        project_root: Project root directory.
        story_id: Story ID (e.g., "83-2").
        dry_run: If True, report what would happen without side-effects.

    Returns:
        Result dict ``{success, data?, error?, steps?}``.
    """
    session_path = project_root / ".session" / f"{story_id}-session.md"
    sprint_path = project_root / "sprint" / "current-sprint.yaml"
    archive_dir = project_root / "sprint" / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    # --- Validate session ---
    if not session_path.exists():
        return {"success": False, "error": f"Session file not found: {session_path}"}

    fields = _parse_session(session_path)
    jira_key = _extract_jira_key(fields)
    branch = _extract_branch(fields)
    pr_number = _extract_pr_number(fields)

    # Fallback: resolve Jira key from sprint YAML
    if not jira_key:
        try:
            data = read_sprint(sprint_path)
            parts = story_id.split("-")
            if len(parts) >= 2:
                epic = find_epic(data, parts[0])
                story = find_story(epic, story_id) if epic else None
                if story:
                    jira_key = story.get("jira")
        except Exception:
            pass

    # Fallback: resolve PR from GitHub if not in session
    if not pr_number and branch:
        result = _run(["gh", "pr", "list", "--head", branch, "--json", "number", "--jq", ".[0].number"])
        if result.returncode == 0 and result.stdout.strip():
            pr_number = result.stdout.strip()

    today = date.today().isoformat()
    steps: list[dict[str, Any]] = []
    archive_name = f"{jira_key}-session.md" if jira_key else f"{story_id}-session.md"

    if dry_run:
        steps.append({"step": 1, "action": f"Archive session → {archive_dir / archive_name}"})
        if pr_number:
            steps.append({"step": 2, "action": f"Merge PR #{pr_number} (squash, delete branch)"})
        else:
            steps.append({"step": 2, "action": "No PR to merge"})
        if jira_key:
            steps.append({"step": 3, "action": f"Transition {jira_key} to Done"})
        else:
            steps.append({"step": 3, "action": "Skip Jira transition (no key)"})
        steps.append({"step": 4, "action": f"Update sprint YAML (status: done, completed: {today})"})
        steps.append({"step": 5, "action": "Archive completed epics"})
        steps.append({"step": 6, "action": f"Delete local branch: {branch}"})
        steps.append({"step": 7, "action": "Remove session file"})
        return {"success": True, "dry_run": True, "jira_key": jira_key, "steps": steps}

    # --- Step 1: Archive session ---
    archive_dest = archive_dir / archive_name
    shutil.copy2(session_path, archive_dest)
    steps.append({"step": 1, "action": "archive_session", "dest": str(archive_dest)})

    # --- Step 2: Merge PR ---
    if pr_number:
        result = _run(["gh", "pr", "merge", pr_number, "--squash", "--delete-branch"])
        if result.returncode == 0:
            steps.append({"step": 2, "action": "merge_pr", "pr": pr_number})
        else:
            steps.append({"step": 2, "action": "merge_pr", "pr": pr_number, "warning": "Already merged or failed"})
    else:
        steps.append({"step": 2, "action": "merge_pr", "skipped": True})

    # --- Step 3: Transition Jira ---
    if jira_key:
        result = _run(["jira", "issue", "move", jira_key, "Done"])
        if result.returncode == 0:
            steps.append({"step": 3, "action": "jira_done", "key": jira_key})
        else:
            steps.append({"step": 3, "action": "jira_done", "key": jira_key, "warning": "Already Done or failed"})
    else:
        steps.append({"step": 3, "action": "jira_done", "skipped": True, "warning": "No Jira key available"})

    # --- Step 4: Update sprint YAML ---
    try:
        data = read_sprint(sprint_path)
        parts = story_id.split("-")
        if len(parts) < 2:
            steps.append({"step": 4, "action": "yaml_update", "error": f"Invalid story ID: {story_id}"})
        else:
            epic = find_epic(data, parts[0])
            story = find_story(epic, story_id) if epic else None
            if story:
                story["status"] = "done"
                story["completed"] = today
                write_sprint(sprint_path, data)
                steps.append({"step": 4, "action": "yaml_update", "status": "done", "completed": today})
            else:
                steps.append({"step": 4, "action": "yaml_update", "warning": f"Story {story_id} not found in YAML"})
    except Exception as exc:
        steps.append({"step": 4, "action": "yaml_update", "error": str(exc)})

    # --- Step 5: Archive completed epics ---
    result = _run(
        [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "epic", "archive"],
        cwd=str(project_root),
    )
    steps.append({"step": 5, "action": "archive_epics", "ran": True})

    # --- Step 6: Git cleanup ---
    _run(["git", "checkout", "develop"], cwd=str(project_root))
    _run(["git", "pull", "origin", "develop"], cwd=str(project_root))
    if branch:
        _run(["git", "branch", "-d", branch], cwd=str(project_root))
    steps.append({"step": 6, "action": "git_cleanup", "branch": branch})

    # --- Step 7: Remove session file ---
    if session_path.exists():
        session_path.unlink()
    steps.append({"step": 7, "action": "remove_session"})

    return {
        "success": True,
        "story_id": story_id,
        "jira_key": jira_key,
        "steps": steps,
    }
