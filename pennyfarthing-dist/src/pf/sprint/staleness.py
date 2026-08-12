"""Base-branch staleness preflight.

Detects stories whose implementation surface has been touched on the
implementation repo's base branch since ``sprint.start_date``. Compares
the story's declared (or inferred) file paths against ``git log`` of the
base branch and surfaces any overlapping commits.

Public surface:

- ``check_story_staleness(story_id, ...)`` — returns a result dict with
  ``status`` ∈ ``{clean, drift, skipped, error}`` plus structured commit
  metadata on drift.
- ``staleness_cli(argv, ...)`` — argparse CLI returning an exit code:
  ``0`` for clean/skipped/acked, ``1`` for unacknowledged drift,
  ``2`` for hard error.

Both follow the SOUL.md "Return Results, Don't Throw" principle: errors
surface as ``success: False`` with a populated ``error`` field, never as
silent fallbacks. Silent fallbacks defeat the whole purpose of the check.
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
    r"\b[\w/.-]+\.(?:py|ts|tsx|js|jsx|json|md|yaml|yml|sh|toml|cfg)\b"
)

# A header token has the rendered ``%H|%aI|%s`` format, so the first
# pipe-separated field is a 40-char lowercase-hex SHA. File-path tokens never
# look like that, which lets ``_parse_git_log`` distinguish header tokens from
# file tokens without depending on a leading ``\n`` (the leading newline only
# attaches to the first file in each commit; subsequent files are bare NUL-
# separated tokens).
_HASH_RE = re.compile(r"[0-9a-f]{40}")

# Default base branch per repo. Mirrors repos.yaml; kept inline so this module
# stays self-contained for the test seam (``repo_path_overrides``).
_BASE_BRANCH_BY_REPO = {
    "pennyfarthing": "develop",
    "orchestrator": "main",
}

# Default remote per repo. Mirrors repos.yaml ``remote_name`` (story 162-27);
# both repos use ``origin`` today, so this defect is LATENT in-tree, but the
# seam makes ``_resolve_revision`` honor the configured remote (``<remote>/<base>``)
# rather than a hardcoded ``origin/`` — a non-origin repo would otherwise miss its
# real upstream tip and silently fall back to a stale local branch. Kept inline
# alongside ``_BASE_BRANCH_BY_REPO`` so the module stays self-contained.
_REMOTE_BY_REPO = {
    "pennyfarthing": "origin",
    "orchestrator": "origin",
}

# ``git log -z`` separates commits with NUL bytes, which cannot appear in commit
# subjects (git rejects them at write time). Within each NUL-separated chunk
# the format string output is followed by ``\n`` then the file list (newline-
# separated under ``--name-only``). Header fields are pipe-separated; the
# subject is the last field, so ``str.split("|", 2)`` is collision-safe even if
# the subject contains the pipe.
_COMMIT_RECORD_SEP = "\0"
_COMMIT_HEADER_FORMAT = "%H|%aI|%s"


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
    # ``--since=<value>`` flows directly into ``git log``. Git silently treats
    # an unrecognised free-text date as "match nothing" and returns exit 0 with
    # empty stdout, which the caller then reports as ``status=clean``. That is
    # exactly the silent-clean shape this preflight exists to prevent, so we
    # validate the YYYY-MM-DD shape at the boundary.
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", start_date_str):
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            since=start_date_str,
            error=(
                f"sprint.start_date is not a YYYY-MM-DD date: {start_date_str!r} — "
                "free-text dates are silently ignored by `git log --since`, "
                "which would produce a misleading clean result"
            ),
            ack=ack,
        )

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

    # An explicit ``implementation_surface`` field with the wrong YAML shape
    # (string scalar, dict, etc.) is a plausible authoring mistake. Rather
    # than silently routing to the title-heuristic with a misleading message,
    # surface a type error so the operator knows to fix the YAML.
    explicit_surface = story.get("implementation_surface")
    if explicit_surface is not None and not isinstance(explicit_surface, list):
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            since=start_date_str,
            error=(
                f"story {story_id!r} has malformed `implementation_surface`: "
                f"must be a list of path strings, got {type(explicit_surface).__name__}"
            ),
            ack=ack,
        )
    # A list with non-string or empty entries is a YAML authoring mistake.
    # Silently filtering the bad items would convert the operator's stated
    # intent (check N paths) into a partial check on the survivors, the same
    # silent-degradation shape the round-1 string-scalar fix addressed for
    # the outer type.
    if isinstance(explicit_surface, list):
        for idx, entry in enumerate(explicit_surface):
            if not isinstance(entry, str) or not entry:
                return _result(
                    success=False,
                    status="error",
                    story_id=story_id,
                    since=start_date_str,
                    error=(
                        f"story {story_id!r} has malformed `implementation_surface`: "
                        f"every entry must be a non-empty path string, "
                        f"got {type(entry).__name__} at index {idx}"
                    ),
                    ack=ack,
                )

    repo_name, repo_path = _resolve_repo_path(story, repo_path_overrides, project_root)
    if repo_name not in _BASE_BRANCH_BY_REPO:
        return _result(
            success=False,
            status="error",
            story_id=story_id,
            since=start_date_str,
            error=(
                f"unknown repo {repo_name!r}: no base branch configured in "
                f"_BASE_BRANCH_BY_REPO. Known: {sorted(_BASE_BRANCH_BY_REPO)}"
            ),
            ack=ack,
        )
    base_branch = _BASE_BRANCH_BY_REPO[repo_name]
    remote = _REMOTE_BY_REPO.get(repo_name, "origin")

    paths = _resolve_paths(story)
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
        repo_path, base_branch, start_date_str, paths, remote=remote
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
    # argparse calls ``sys.exit`` on missing/invalid args. Programmatic callers
    # need an int return per this function's contract, so we trap the SystemExit
    # and translate to exit code 2 (hard error).
    try:
        parsed = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2

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
    since: str = "",
    base_branch: str = "",
    warning: str | None = None,
    error: str | None = None,
    ack: bool = False,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "success": success,
        "status": status,
        "story_id": story_id,
        "since": since,
        "base_branch": base_branch,
        "paths_checked": paths_checked or [],
        "commits": commits or [],
    }
    if warning is not None:
        out["warning"] = warning
    if error is not None:
        out["error"] = error
    # ``acknowledged`` documents that drift was detected and deliberately
    # overridden. Setting it on a clean / skipped / error result misleads any
    # downstream audit consumer into believing an override happened on every
    # ack'd run, even when there was nothing to acknowledge.
    if ack and status == "drift":
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
        # Bound the regex input. ``_PATH_HEURISTIC_RE`` has overlapping char
        # classes (``\w``, ``/``, ``.``) and on long near-miss input the
        # engine retries each prefix position with quadratic runtime
        # (ReDoS). 2000 chars is well above any realistic story title or
        # description; truncation here keeps wall time bounded while still
        # picking up paths from typical operator-authored YAML.
        bounded = str(text)[:2000]
        for match in _PATH_HEURISTIC_RE.findall(bounded):
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
    # Empty or all-slash surface_path must never match any commit. Without
    # this guard, ``"".rstrip("/") + "/"`` and ``"/".rstrip("/") + "/"`` both
    # evaluate to ``"/"``, which startswith() accepts for every absolute path —
    # turning an upstream YAML mistake into a flood of false drift reports.
    if not surface_path.strip("/"):
        return False
    if "*" in surface_path or "?" in surface_path:
        return fnmatch.fnmatch(commit_file, surface_path)
    if commit_file == surface_path:
        return True
    return commit_file.startswith(surface_path.rstrip("/") + "/")


def _resolve_revision(
    repo: Path, base_branch: str, remote: str = "origin"
) -> tuple[str, str]:
    """Pick the git revision to log against. Prefers ``<remote>/<base>`` (the
    fetched upstream tip) and falls back to the local ``<base>`` branch when
    the remote-tracking ref doesn't exist (typical in ad-hoc test fixtures).

    ``remote`` honors the repo's configured remote name (story 162-27); the
    default ``origin`` preserves the pre-162-27 behavior for the common case.
    The probe stays in the bare ``<remote>/<base>`` shape — full-ref-path
    hardening is out of scope here because ``remote``/``base_branch`` come from
    repos.yaml config, not an operator-supplied session field.

    Returns ``(revision, error_message)``. On failure to resolve either ref,
    ``revision`` is empty and ``error_message`` describes which refs were tried.
    """
    candidates = [f"{remote}/{base_branch}", base_branch]
    tried: list[str] = []
    for ref in candidates:
        tried.append(ref)
        try:
            proc = subprocess.run(
                ["git", "-C", str(repo), "rev-parse", "--verify", "--quiet", ref],
                check=False,
                capture_output=True,
                text=True,
                shell=False,
            )
        except (FileNotFoundError, OSError) as exc:
            return "", f"git invocation failed while resolving {ref!r}: {exc}"
        if proc.returncode == 0:
            return ref, ""
    return "", f"could not resolve base ref in {repo}: tried {tried}"


def _run_git_log(
    repo: Path, base_branch: str, since: str, paths: list[str], remote: str = "origin"
) -> tuple[bool, str, str]:
    """Returns ``(success, stdout, error_message)``.

    Logs commits on the base branch (preferring ``<remote>/<base>``, falling
    back to the local branch) since ``since`` that touch any of ``paths``.

    Uses argv form (``shell=False``) so operator-controlled inputs cannot
    inject shell metacharacters. Uses ``-z`` so commit subjects containing
    arbitrary text (including any literal we might have chosen as a delimiter)
    cannot collide with the record separator — ``\\0`` is forbidden in commit
    subjects by git itself.
    """
    revision, ref_err = _resolve_revision(repo, base_branch, remote)
    if not revision:
        return False, "", ref_err

    cmd = [
        "git",
        "-C",
        str(repo),
        "log",
        revision,
        f"--since={since}",
        "--reverse",
        "--name-only",
        "-z",
        f"--format={_COMMIT_HEADER_FORMAT}",
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
    """Parse ``git log -z --name-only --format=%H|%aI|%s`` output.

    Under ``-z`` the output is a stream of NUL-terminated tokens. A header
    token contains the rendered ``--format`` string (three pipe-separated
    fields, the first of which is a 40-char SHA). If the commit touched any
    files, the first file is glued to the header by ``\\n``; subsequent
    files arrive as their own bare NUL-separated tokens with no leading
    ``\\n``. The next commit's header starts a new run.

    Header detection keys on shape (3 pipe-fields AND first looks like a
    SHA), not on the leading-newline of file tokens, so multi-file commits
    keep every file rather than dropping all but the first.

    NUL cannot appear in commit subjects or filenames in git, so this
    record separator is collision-free even for subjects that embed
    arbitrary delimiters or pipes.
    """
    commits: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for token in output.split(_COMMIT_RECORD_SEP):
        if not token:
            continue
        # A header has 3 pipe-separated fields and the first is a full SHA.
        # Use ``maxsplit=2`` so a subject containing pipes does not collide.
        parts = token.split("|", 2)
        if len(parts) == 3 and _HASH_RE.fullmatch(parts[0]):
            full_hash, date, subject_with_first_file = parts
            # The ``--name-only`` first file is glued to the format output
            # by a literal ``\n``. Split it off to recover both the subject
            # and the first file (if any).
            subject, _, first_file = subject_with_first_file.partition("\n")
            current = {
                "hash": full_hash,
                "short_hash": full_hash[:9],
                "date": date,
                "subject": subject,
                "files": [first_file.strip()] if first_file.strip() else [],
            }
            commits.append(current)
            continue
        # Otherwise this is a bare file-path token belonging to the most
        # recent commit. Strip any leading newline defensively (some git
        # versions add one, others do not).
        path = token.lstrip("\n").strip()
        if path and current is not None:
            current["files"].append(path)
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
