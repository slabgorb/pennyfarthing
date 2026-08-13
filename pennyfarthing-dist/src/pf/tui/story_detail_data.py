"""Story detail data fetching for Frame TUI TUI.

Story 110-2: Fetch story detail data (AC, session, workflow) via file read or API.
Returns enriched story data for StoryDetailScreen dossier layout.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

from pf.sprint.session_parse import parse_session as _parse_session_shared
from pf.sprint.shard_merge import safe_ref_path_or_none, safe_shards

# 162-84: module-level dedup set — suppresses repeated safe_shards warnings
# across TUI repaints that each call _check_context_files.
_warned_shards: set[str] = set()


def _safe_str_path(base_dir: str, ref: str, *, prefix: str, suffix: str) -> str | None:
    """``safe_ref_path_or_none`` adapter for this module's ``os.path`` string paths.

    Every path this module builds is interpolated from a ref that arrives
    verbatim out of sprint YAML (``ws_push`` ships ``epic_data['id']`` and the
    shard's ``jira:`` straight from ``merge_epic_shards`` to the TUI), so all of
    them were traversable via a symlink inside ``sprint/context/``, ``.session/``
    or ``sprint/archive/`` (CWE-22, 162-44 round 2 — this module appeared in no
    prior inventory). Returns ``None`` when the ref is unsafe, which each caller
    treats as "no such file" — these are display lookups, so a hostile ref
    should render as absent, not raise into the TUI event loop.

    162-84: thin ``str`` wrapper over the shared ``safe_ref_path_or_none`` adapter.
    """
    path = safe_ref_path_or_none(Path(base_dir), ref, prefix=prefix, suffix=suffix)
    return str(path) if path is not None else None


def _safe_shards_once(base_dir: Path, pattern: str = "epic-*.yaml") -> list[Path]:
    """``safe_shards`` wrapper: suppress repeated skipped-shard warns across repaints.

    ``_check_context_files`` runs on every TUI repaint; ``safe_shards`` emits a
    ``warnings.warn`` per skipped (symlinked) shard, so one bad symlink warns on
    every render cycle. This wrapper catches those warnings, re-emits only the
    first occurrence per unique message (keyed into ``_warned_shards``), and
    returns the contained matches as a list so the caller can iterate normally.

    162-84: throttle for the per-repaint warn.
    """
    import warnings as _w

    with _w.catch_warnings(record=True) as _caught:
        _w.simplefilter("always")
        results = list(safe_shards(base_dir, pattern))
    for w in _caught:
        key = str(w.message)
        if key not in _warned_shards:
            _warned_shards.add(key)
            _w.warn(str(w.message), w.category, stacklevel=2)
    return results


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


def _find_session_file(
    story_id: str, project_root: str | None, jira_key: str = ""
) -> tuple[str | None, bool]:
    """Locate the session file for a story, trying active then archive.

    Returns:
        (path, is_archived) tuple. path is None when no session file found.
    """
    # 1. Active session in project root
    if project_root:
        candidate = _safe_str_path(
            os.path.join(project_root, ".session"), story_id, prefix="", suffix="-session.md"
        )
        if candidate and os.path.isfile(candidate):
            return (candidate, False)
    # Walk up from CWD looking for .session/{story_id}-session.md
    path = os.getcwd()
    while True:
        candidate = _safe_str_path(
            os.path.join(path, ".session"), story_id, prefix="", suffix="-session.md"
        )
        if candidate and os.path.isfile(candidate):
            return (candidate, False)
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent

    # 2. Archive by local ID: sprint/archive/{story_id}-session.md
    if project_root:
        archive_dir = os.path.join(project_root, "sprint", "archive")
        candidate = _safe_str_path(archive_dir, story_id, prefix="", suffix="-session.md")
        if candidate and os.path.isfile(candidate):
            return (candidate, True)

        # 3. Archive by Jira key: sprint/archive/{jira_key}-session.md
        if jira_key:
            candidate = _safe_str_path(archive_dir, jira_key, prefix="", suffix="-session.md")
            if candidate and os.path.isfile(candidate):
                return (candidate, True)

    return (None, False)


def _parse_session_file(session_path: str) -> dict[str, Any]:
    """Parse a session markdown file for metadata fields."""
    result: dict[str, Any] = {}
    with open(session_path) as f:
        content = f.read()

    # Parse title from first heading: # Story X-Y: Title
    title_match = re.search(r"^# Story [\w-]+:\s*(.+)", content, re.MULTILINE)
    if title_match:
        result["title"] = title_match.group(1).strip()

    # Parse bold metadata fields via shared anchored parser (164-13).
    # Anchored regex, fence-skip, Story Details authority, first-wins.
    session_fields = _parse_session_shared(Path(session_path))
    _KEY_MAP = {
        "phase": ("workflow_phase", None),
        "workflow": ("workflow", None),
        "branch": ("git_branch", None),
        "jira": ("jiraKey", None),
        "points": ("points", "int"),
        "review verdict": ("review_verdict", None),
        "review findings": ("review_findings", None),
    }
    for src_key, (dst_key, transform) in _KEY_MAP.items():
        if src_key in session_fields:
            value = session_fields[src_key]
            if transform == "int":
                try:
                    result[dst_key] = int(value)
                except ValueError:
                    result[dst_key] = value
            else:
                result[dst_key] = value

    # Parse ACs from ## Acceptance Criteria section
    ac_match = re.search(r"## Acceptance Criteria\n(.*?)(?=\n##|\Z)", content, re.DOTALL)
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
    log_match = re.search(r"## Session Log\n(.*?)(?=\n##|\Z)", content, re.DOTALL)
    if log_match:
        result["session_notes"] = log_match.group(1).strip()

    return result


def _get_sprint_story_status(story_id: str) -> str | None:
    """Try to get story status from pf sprint CLI."""
    import sys

    try:
        out = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "field", story_id, "status"],
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
        context_dir = os.path.join(project_root, "sprint", "context")
        # Try numeric ID first (e.g. context-epic-110.md)
        epic_path = _safe_str_path(context_dir, epic_num, prefix="context-epic-", suffix=".md")
        if epic_path and os.path.isfile(epic_path):
            result["has_epic_context"] = True
            result["epic_context_path"] = epic_path
        else:
            # Try PROJ-keyed context file by reading epic Jira key from shard.
            # _safe_shards_once, not a bare glob: a glob match is a *name* match,
            # so a symlinked epic-*.yaml inside sprint/ was opened below.
            # 162-84: _safe_shards_once dedupes per-repaint warns.
            sprint_dir = os.path.join(project_root, "sprint")
            for shard in _safe_shards_once(Path(sprint_dir), "epic-*.yaml"):
                try:
                    with open(shard) as f:
                        for line in f:
                            if line.startswith("id:"):
                                shard_id = line.split(":", 1)[1].strip().strip("'\"")
                                if shard_id == epic_num:
                                    break
                        else:
                            continue
                    with open(shard) as f:
                        for line in f:
                            if line.startswith("jira:"):
                                jira_key = line.split(":", 1)[1].strip().strip("'\"")
                                keyed_path = _safe_str_path(
                                    context_dir, jira_key, prefix="context-epic-", suffix=".md"
                                )
                                if keyed_path and os.path.isfile(keyed_path):
                                    result["has_epic_context"] = True
                                    result["epic_context_path"] = keyed_path
                                break
                except Exception:
                    continue
                if result["has_epic_context"]:
                    break

    story_path = _safe_str_path(
        os.path.join(project_root, "sprint", "context"),
        story_id,
        prefix="context-story-",
        suffix=".md",
    )
    if story_path and os.path.isfile(story_path):
        result["has_story_context"] = True
        result["story_context_path"] = story_path

    return result


def fetch_story_detail(
    story_id: str,
    project_root: str | None = None,
    jira_key: str = "",
) -> dict[str, Any]:
    """Fetch detailed story data including ACs, session, workflow, and git info.

    Args:
        story_id: Story identifier (e.g. "110-2").
        project_root: Path to project root (for file reads). Auto-detected if None.
        jira_key: Jira key (e.g. "PROJ-15397") for archive lookup.

    Returns:
        Dict with keys: id, title, points, status, jiraKey,
        acceptance_criteria, workflow, workflow_phase,
        git_branch, pr_url, session_notes, archived.
        Always returns a populated dict with defaults; enriched with
        session data when a session file exists.
    """
    root = project_root or _find_project_root()

    result: dict[str, Any] = {"id": story_id, "archived": False}

    # Parse session file if available
    session_path, is_archived = _find_session_file(story_id, root, jira_key=jira_key)
    if session_path:
        result["archived"] = is_archived
        session_data = _parse_session_file(session_path)
        result.update(session_data)

        # Get PR URL if we have a branch
        if "pr_url" not in result:
            pr_url = _get_pr_url(result.get("git_branch", ""))
            result["pr_url"] = pr_url

        # Load raw session file content
        try:
            with open(session_path) as f:
                result["session_file_content"] = f.read()
        except Exception:
            result["session_file_content"] = ""

    # Get status from sprint YAML if not in session
    if "status" not in result:
        status = _get_sprint_story_status(story_id)
        if status:
            result["status"] = status

    # Check for context files (independent of session)
    context_info = _check_context_files(story_id, root)
    result.update(context_info)

    # Load context file contents
    if context_info.get("epic_context_path"):
        try:
            with open(context_info["epic_context_path"]) as f:
                result["epic_context_content"] = f.read()
        except Exception:
            result["epic_context_content"] = ""

    if context_info.get("story_context_path"):
        try:
            with open(context_info["story_context_path"]) as f:
                result["story_context_content"] = f.read()
        except Exception:
            result["story_context_content"] = ""

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
    result.setdefault("epic_context_content", "")
    result.setdefault("story_context_content", "")
    result.setdefault("session_file_content", "")
    result.setdefault("archived", False)

    return result
