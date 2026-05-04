"""
Base-branch staleness preflight (Story 151-5).

Detects stories whose implementation surface has been touched on the
implementation repo's base branch since ``sprint.start_date``. Used by
``pf sprint work`` and the sm-setup subagent to catch stories whose scope
has been overtaken upstream before red phase begins, preventing the kind
of duplicate work that produced the 151-3 incident (PR #33 merging the
same scope on develop while a parallel SM/TEA/Dev pipeline reworked it on
a re-rebased branch).

The public surface is two callables:

- ``check_story_staleness(story_id, ...)`` — returns a result dict with
  ``status`` ∈ ``{clean, drift, skipped}`` plus structured commit metadata
  on drift.
- ``staleness_cli(argv, ...)`` — argparse CLI returning an exit code; non-zero
  on drift unless ``--ack`` is passed.

Both follow the SOUL.md "Return Results, Don't Throw" principle: errors
surface as ``success: False`` with a populated ``error`` field, never as
silent fallbacks. This is deliberate — silent fallbacks are exactly the
class of bug this story exists to prevent.
"""

from __future__ import annotations

import argparse
import fnmatch
import re
import subprocess
from pathlib import Path
from typing import Any

from pf.sprint.loader import load_sprint

# Regex for file-path-like substrings in a free-text story title/description.
# Matches things like ``story_finish.py``, ``pennyfarthing/foo.ts``, ``bar.yaml``.
# Used by the AC5 fallback heuristic when no ``implementation_surface`` field
# is set on the story.
_PATH_HEURISTIC_RE = re.compile(
    r"\b[\w/.-]+\.(?:py|ts|tsx|js|jsx|md|yaml|yml|sh|toml|cfg)\b"
)

# Default base branch per repo. Mirrors repos.yaml; kept inline so this module
# stays self-contained for the test seam (``repo_path_overrides``).
_BASE_BRANCH_BY_REPO = {
    "pennyfarthing": "develop",
    "orchestrator": "main",
}

# Magic delimiter used to split ``git log --format=...`` output into per-commit
# chunks. The format is ``<delim>HASH|ISO_DATE|SUBJECT\nfile1\nfile2\n...``.
_COMMIT_DELIM = "<<<COMMIT-DELIMITER-7f8a3b>>>"


def check_story_staleness(
    story_id: str,
    *,
    project_root: Path | None = None,
    repo_path_overrides: dict[str, Path] | None = None,
    ack: bool = False,
) -> dict[str, Any]:
    """Check whether ``story_id``'s implementation surface has been touched on the
    base branch since ``sprint.start_date``.

    Args:
        story_id: Story identifier (e.g., ``"151-5"``).
        project_root: Project root containing ``sprint/`` (auto-detected when None).
        repo_path_overrides: Test seam mapping repo name → on-disk path. In
            production, repo paths come from ``repos.yaml``; tests inject a
            tmp_path here.
        ack: If True, set ``acknowledged=True`` in the result. Does not change
            the detected status — drift remains drift.

    Returns:
        Result dict with keys: ``success``, ``status`` ∈ ``{clean, drift, skipped, error}``,
        ``story_id``, ``since``, ``base_branch``, ``paths_checked``, ``commits``,
        and optionally ``warning``, ``error``, ``acknowledged``.
    """
    if project_root is None:
        from pf.common.config import get_project_root

        project_root = get_project_root()

    sprint_data = load_sprint(project_root)
    if not sprint_data:
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            error=f"Could not load sprint data from {project_root}",
            ack=ack,
        )

    sprint_info = sprint_data.get("sprint") or {}
    start_date = sprint_info.get("start_date")
    if not start_date:
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            error=(
                "sprint.start_date is missing from current-sprint.yaml — "
                "cannot resolve staleness cutoff"
            ),
            ack=ack,
        )
    start_date_str = str(start_date)

    story = _find_story(sprint_data, story_id)
    if story is None:
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            since=start_date_str,
            error=f"story {story_id!r} not found in sprint YAML",
            ack=ack,
        )

    paths = _resolve_paths(story)
    repo_name, repo_path = _resolve_repo_path(story, repo_path_overrides, project_root)
    base_branch = _BASE_BRANCH_BY_REPO.get(repo_name, "develop")

    if not paths:
        return _result(
            success=True,
            status="skipped",
            story_id=story_id,
            since=start_date_str,
            base_branch=base_branch,
            paths_checked=[],
            commits=[],
            warning=(
                f"Could not infer implementation surface for story {story_id!r} — "
                "no `implementation_surface` field and no file-like patterns in "
                "title or description; preflight skipped"
            ),
            ack=ack,
        )

    git_ok, stdout, git_err = _run_git_log(
        repo_path, base_branch, start_date_str, paths
    )
    if not git_ok:
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            since=start_date_str,
            base_branch=base_branch,
            paths_checked=paths,
            error=git_err,
            ack=ack,
        )

    raw_commits = _parse_git_log(stdout)
    drift_commits: list[dict[str, Any]] = []
    for raw in raw_commits:
        overlap = _file_overlaps(raw["files"], paths)
        if overlap:
            drift_commits.append(
                {
                    "hash": raw["hash"],
                    "short_hash": raw["short_hash"],
                    "date": raw["date"],
                    "subject": raw["subject"],
                    "files_overlap": overlap,
                }
            )

    status = "drift" if drift_commits else "clean"
    return _result(
        success=True,
        status=status,
        story_id=story_id,
        since=start_date_str,
        base_branch=base_branch,
        paths_checked=paths,
        commits=drift_commits,
        ack=ack,
    )


def staleness_cli(
    argv: list[str],
    *,
    project_root: Path | None = None,
    repo_path_overrides: dict[str, Path] | None = None,
) -> int:
    """CLI entry point. Returns exit code: 0 clean/skipped/acked, 1 drift,
    2 hard error (missing start_date, story not found, git failure).
    """
    parser = argparse.ArgumentParser(
        prog="pf sprint check-staleness",
        description=(
            "Detect whether a story's implementation surface has been touched on "
            "the base branch since sprint start. Helps catch overtaken stories "
            "before red phase begins."
        ),
    )
    parser.add_argument("story_id", help="Story identifier (e.g., 151-5)")
    parser.add_argument(
        "--ack",
        action="store_true",
        help="Acknowledge any detected drift and proceed (logged in result).",
    )
    parsed = parser.parse_args(argv)

    result = check_story_staleness(
        parsed.story_id,
        project_root=project_root,
        repo_path_overrides=repo_path_overrides,
        ack=parsed.ack,
    )

    _print_human_summary(result)

    if not result.get("success"):
        return 2
    if result.get("status") == "drift" and not parsed.ack:
        return 1
    return 0


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _result(
    *,
    success: bool,
    status: str,
    story_id: str,
    paths_checked: list[str] | None = None,
    commits: list[dict[str, Any]] | None = None,
    since: str | None = None,
    base_branch: str | None = None,
    warning: str | None = None,
    error: str | None = None,
    ack: bool = False,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "success": success,
        "status": status,
        "story_id": story_id,
        "paths_checked": paths_checked or [],
        "commits": commits or [],
    }
    if since is not None:
        out["since"] = since
    if base_branch is not None:
        out["base_branch"] = base_branch
    if warning is not None:
        out["warning"] = warning
    if error is not None:
        out["error"] = error
    if ack:
        out["acknowledged"] = True
    return out


def _find_story(data: dict[str, Any], story_id: str) -> dict[str, Any] | None:
    for epic in data.get("epics", []) or []:
        if not isinstance(epic, dict):
            continue
        for story in epic.get("stories", []) or []:
            if isinstance(story, dict) and story.get("id") == story_id:
                return story
    for section in ("standalone_stories", "stories"):
        for story in data.get(section, []) or []:
            if isinstance(story, dict) and story.get("id") == story_id:
                return story
    return None


def _resolve_paths(story: dict[str, Any]) -> list[str]:
    explicit = story.get("implementation_surface")
    if isinstance(explicit, list) and explicit:
        return [str(p) for p in explicit if isinstance(p, str) and p]

    seen: set[str] = set()
    inferred: list[str] = []
    for text in (story.get("title") or "", story.get("description") or ""):
        for match in _PATH_HEURISTIC_RE.findall(str(text)):
            if match not in seen:
                seen.add(match)
                inferred.append(match)
    return inferred


def _resolve_repo_path(
    story: dict[str, Any],
    overrides: dict[str, Path] | None,
    project_root: Path,
) -> tuple[str, Path]:
    repos_field = story.get("repos") or "pennyfarthing"
    if isinstance(repos_field, list) and repos_field:
        repo_name = str(repos_field[0])
    else:
        repo_name = str(repos_field).split(",")[0].strip() or "pennyfarthing"

    if overrides and repo_name in overrides:
        return repo_name, overrides[repo_name]
    # In production layouts the implementation repo is a sibling of the
    # orchestrator project root (e.g., ``orc-penny/pennyfarthing/``).
    return repo_name, project_root.parent / repo_name


def _file_overlaps(commit_files: list[str], surface_paths: list[str]) -> list[str]:
    matched: list[str] = []
    for surface_path in surface_paths:
        for f in commit_files:
            if _path_matches(f, surface_path):
                if surface_path not in matched:
                    matched.append(surface_path)
                break
    return matched


def _path_matches(commit_file: str, surface_path: str) -> bool:
    if "*" in surface_path or "?" in surface_path:
        return fnmatch.fnmatch(commit_file, surface_path)
    if commit_file == surface_path:
        return True
    return commit_file.startswith(surface_path.rstrip("/") + "/")


def _run_git_log(
    repo: Path, base_branch: str, since: str, paths: list[str]
) -> tuple[bool, str, str]:
    """Returns ``(success, stdout, error_message)``.

    Uses argv form (``shell=False``) so operator-controlled inputs cannot
    inject shell metacharacters (lang-review §11).
    """
    cmd = [
        "git",
        "-C",
        str(repo),
        "log",
        f"--since={since}",
        "--reverse",
        "--name-only",
        f"--format={_COMMIT_DELIM}%H|%aI|%s",
        "--",
        *paths,
    ]
    try:
        proc = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            shell=False,
        )
    except (FileNotFoundError, OSError) as exc:
        return False, "", f"git invocation failed: {exc}"

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip() or "no stderr"
        return (
            False,
            "",
            f"git log returned exit {proc.returncode} in {repo}: {stderr}",
        )
    return True, proc.stdout, ""


def _parse_git_log(output: str) -> list[dict[str, Any]]:
    commits: list[dict[str, Any]] = []
    for chunk in output.split(_COMMIT_DELIM):
        chunk = chunk.strip()
        if not chunk:
            continue
        lines = chunk.split("\n")
        header = lines[0]
        parts = header.split("|", 2)
        if len(parts) != 3:
            continue
        full_hash, date, subject = parts
        files = [ln for ln in lines[1:] if ln.strip()]
        commits.append(
            {
                "hash": full_hash,
                "short_hash": full_hash[:9],
                "date": date,
                "subject": subject,
                "files": files,
            }
        )
    return commits


def _print_human_summary(result: dict[str, Any]) -> None:
    """Emit a one-screen summary of the staleness result to stdout."""
    status = result.get("status", "?")
    story_id = result.get("story_id", "?")
    if status == "clean":
        print(f"[staleness] {story_id}: clean — no overlapping commits since {result.get('since')}")
        return
    if status == "skipped":
        print(f"[staleness] {story_id}: skipped — {result.get('warning', '')}")
        return
    if status == "drift":
        print(
            f"[staleness] {story_id}: DRIFT — "
            f"{len(result.get('commits') or [])} overlapping commit(s) since "
            f"{result.get('since')} on origin/{result.get('base_branch')}"
        )
        for c in result.get("commits") or []:
            print(
                f"  {c.get('short_hash')} {c.get('date', '')[:10]} "
                f"{c.get('subject')}"
            )
            for path in c.get("files_overlap") or []:
                print(f"    overlaps: {path}")
        if result.get("acknowledged"):
            print("[staleness] acknowledged — proceeding.")
        return
    # error / unknown
    print(f"[staleness] {story_id}: ERROR — {result.get('error', 'unknown')}")
