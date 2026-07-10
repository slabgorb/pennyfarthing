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

import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pf.git.repos import RepoConfig

from pf.sprint.archive_epic import _load_archive_file, _write_archive_file, ensure_archive_file
from pf.sprint.loader import (
    _has_real_jira_key,
    find_story_in_data,
    format_story_not_found_error,
)
from pf.sprint.story_transition import transition_story
from pf.sprint.yaml_io import _get_epic_ref, read_sprint

SESSION_FIELD_RE = re.compile(r"\*\*(\w[\w\s]*):\*\*\s*(.*)")


def _resolve_epic_ref(project_root: Path, story_id: str, story: dict) -> str:
    """Resolve a story's parent epic id from *authoritative* sprint data.

    The story->epic link is structural: the story lives inside its epic's
    ``stories`` list. ``find_story_in_data`` returns that containing epic, whose
    ``jira`` (or numeric ``id``) is the canonical reference. Falls back to an
    explicit ``jira_epic``/``epic`` field on the story dict (e.g. standalone
    stories that carry their own epic ref).

    Returns ``""`` when no authoritative epic can be determined. The caller must
    then fail loud rather than fabricate one from the id prefix — a naive prefix
    parse turns ``ghost-99`` into ``ghost``, exactly the silent fabrication this
    fix forbids (gh #16).
    """
    try:
        data = read_sprint(project_root / "sprint" / "current-sprint.yaml")
        epic, _found, _location = find_story_in_data(data, story_id)
    except (FileNotFoundError, ValueError):
        # Sprint index missing or malformed — fall through to the explicit
        # field, then to the fail-loud empty result. We never silently invent
        # an epic here.
        epic = None
    if isinstance(epic, dict):
        # Delegate to the one canonical epic-ref formula (SOUL #2). This rejects
        # truthy jira sentinels (none/null/x) and strips the ``epic-`` prefix
        # (ADR-0022), where the old inline ``jira or id`` chain diverged (155-8).
        ref = _get_epic_ref(epic)
        if ref:
            return ref

    explicit = story.get("jira_epic") or story.get("epic") or ""
    return str(explicit).strip()


def _add_story_to_completed(project_root: Path, story_id: str, story: dict) -> dict[str, Any]:
    """Add a story to the sprint completed file.

    Called during story finish so that findings aggregation can discover
    the story even before its parent epic is fully archived.

    The completed row's ``epic`` is sourced from authoritative sprint data via
    :func:`_resolve_epic_ref` (never from the story dict's absent ``epic`` key,
    which always resolved to ``""`` — gh #16). When the parent epic cannot be
    resolved the write fails loud rather than emitting an empty / fabricated
    epic or silently dropping the row.

    Returns:
        Result dict ``{"success": True, "epic": ...}`` on success, or
        ``{"success": False, "error": ...}`` when the epic is unresolvable or
        the archive guard rejects the write (SOUL #10 — return results, never
        swallow).
    """
    epic_ref = _resolve_epic_ref(project_root, story_id, story)
    if not epic_ref:
        return {
            "success": False,
            "error": (
                f"Cannot resolve parent epic for story {story_id!r}: it is absent "
                "from sprint data and carries no explicit epic field. Refusing to "
                "archive a completed row with an empty epic (gh #16)."
            ),
        }

    archive_path = ensure_archive_file(project_root)
    archive_data = _load_archive_file(archive_path)

    existing_ids = {s.get("id") for s in archive_data["completed_stories"]}
    if story_id in existing_ids:
        return {"success": True, "epic": epic_ref, "skipped": "already-present"}

    archive_data["completed_stories"].append(
        {
            "id": story_id,
            "epic": epic_ref,
            "title": story.get("title", ""),
            "points": story.get("points", 0),
            "completed": story.get("completed", date.today().isoformat()),
        }
    )
    try:
        _write_archive_file(archive_path, archive_data)
    except ValueError as exc:
        # A pre-existing row with an empty epic trips the 151-2 guard. Surface it
        # as a result instead of crashing finish or silently dropping the row;
        # backfill (`backfill_epic_refs`) repairs the historical entries.
        return {"success": False, "error": str(exc)}
    return {"success": True, "epic": epic_ref}


def _parse_session(session_path: Path) -> dict[str, str]:
    """Extract metadata fields from a session markdown file.

    Parses lines like ``**Jira:** PROJ-14467`` and
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
    # Strip markdown link: [PROJ-14467](https://...)
    raw = re.sub(r"\[([^\]]+)\].*", r"\1", raw).strip()
    if re.match(r"^PROJ-\d+$", raw):
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


def _pr_is_merged(pr_number: str) -> bool:
    """Return True only when ``gh`` reports the PR in the ``MERGED`` state.

    A zero exit from ``gh pr merge`` is not proof the code landed — the merge can
    silently no-op while the PR stays OPEN (gh #71 / #60). Finish must confirm
    the actual PR state before transitioning the story to ``done``.
    """
    result = _run(["gh", "pr", "view", pr_number, "--json", "state"])
    if result.returncode != 0:
        return False
    try:
        state = json.loads(result.stdout).get("state", "")
    except (json.JSONDecodeError, ValueError):
        return False
    return state == "MERGED"


def _pr_block_reason(pr_number: str) -> str | None:
    """Return an actionable abort message when the PR is definitively NOT cleanly
    mergeable (``mergeable == CONFLICTING`` / ``mergeStateStatus == DIRTY``), else
    ``None``.

    ``None`` ("do not block") also covers MERGEABLE/CLEAN PRs *and* indeterminate
    mergeability — ``UNKNOWN`` (GitHub still computing) or a ``gh`` error. Those
    fall through to the merge attempt, which is guarded by the post-merge
    :func:`_pr_is_merged` verification (gh #71/#60). Only a definitively
    conflicting PR is hard-blocked here, before any irreversible finish step
    (gh #113).
    """
    result = _run(
        ["gh", "pr", "view", pr_number, "--json", "mergeable,mergeStateStatus,baseRefName"]
    )
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        return None
    mergeable = str(data.get("mergeable", "")).upper()
    state_status = str(data.get("mergeStateStatus", "")).upper()
    if mergeable == "CONFLICTING" or state_status == "DIRTY":
        base = data.get("baseRefName") or "the base branch"
        return (
            f"PR #{pr_number} is CONFLICTING — rebase on {base} and resolve the "
            "conflicts before finishing"
        )
    return None


def _git_cleanup(
    project_root: Path,
    branch: str | None,
    repo_config: "RepoConfig | None",
) -> list[dict[str, Any]]:
    """Step 6: for gitflow repos, return to the base branch and delete the
    merged feature branch; for trunk-based or unidentified repos, record a skip.

    Cleanup runs only for a *known gitflow* repo. Trunk-based repos have no
    feature-branch workflow, and an unresolved repo (``repo_config is None``)
    must not be guessed at — running ``git checkout develop`` on a main-only
    repo is exactly the failure this story removes. In both cases cleanup is
    skipped, using the repo's own ``default_branch`` (never a hardcoded guess).

    Returns the step entries to append to the finish report.
    """
    if repo_config is None or not repo_config.is_gitflow:
        reason = "root-repo-unresolved" if repo_config is None else "trunk-based"
        return [{"step": 6, "action": "git_cleanup", "skipped": reason, "branch": branch}]

    base = repo_config.default_branch
    _run(["git", "checkout", base], cwd=str(project_root))
    _run(["git", "pull", "origin", base], cwd=str(project_root))
    if branch:
        # `--` guards against a branch value that looks like a git flag.
        _run(["git", "branch", "-d", "--", branch], cwd=str(project_root))
    return [{"step": 6, "action": "git_cleanup", "branch": branch}]


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
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Session file not found: {session_path}",
        }

    # --- Validate story exists in sprint YAML (155-6) ---
    # An unknown/typo'd id must abort loudly and list candidate IDs, exactly like
    # update/remove — and BEFORE any irreversible step (archive, merge, cleanup)
    # or the dry-run preview. Previously finish only tripped a LATE yaml-update
    # failure via transition_story, after the session was already archived, while
    # the dry-run path reported a clean plan for a story that does not exist
    # (epic 155: finish must not lie). Reuse this single read below.
    #
    # read_sprint raises FileNotFoundError/ValueError on a missing or malformed
    # sprint YAML; keep finish_story's no-throw contract (SOUL #10) by turning
    # that into a result dict rather than letting a raw traceback escape.
    try:
        data = read_sprint(sprint_path)
    except (FileNotFoundError, ValueError) as exc:
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Could not read sprint data: {exc}",
        }
    _epic, story, _location = find_story_in_data(data, story_id)
    if story is None:
        return {
            "success": False,
            "story_id": story_id,
            "error": format_story_not_found_error(data, story_id),
        }

    fields = _parse_session(session_path)
    jira_key = _extract_jira_key(fields)
    branch = _extract_branch(fields)
    pr_number = _extract_pr_number(fields)

    # Resolve Jira key from sprint YAML when the session omits it, reusing the
    # story resolved above. Sentinel jira values ("none"/"null"/"x") are truthy
    # strings but mean "no Jira"; only adopt a real key so archive name, jira
    # step, and the reported jira_key all behave as no-Jira (story 160-3).
    if not jira_key and _has_real_jira_key(story):
        jira_key = story.get("jira")

    # Fallback: resolve PR from GitHub if not in session
    if not pr_number and branch:
        result = _run(
            ["gh", "pr", "list", "--head", branch, "--json", "number", "--jq", ".[0].number"]
        )
        if result.returncode == 0 and result.stdout.strip():
            pr_number = result.stdout.strip()

    today = date.today().isoformat()
    steps: list[dict[str, Any]] = []
    archive_name = f"{jira_key}-session.md" if jira_key else f"{story_id}-session.md"

    # Check for dialogue file
    dialogue_path = project_root / ".session" / f"{story_id}-dialogue.md"
    dialogue_archive_name = f"{jira_key}-dialogue.md" if jira_key else f"{story_id}-dialogue.md"

    if dry_run:
        from pf.common.pr_config import get_pr_merge_mode

        steps.append({"step": 1, "action": f"Archive session → {archive_dir / archive_name}"})
        if dialogue_path.exists():
            steps.append(
                {
                    "step": "1b",
                    "action": f"Archive dialogue → {archive_dir / dialogue_archive_name}",
                }
            )
        if pr_number and get_pr_merge_mode() == "human":
            steps.append(
                {"step": 2, "action": f"PR #{pr_number} — waiting for human review and merge"}
            )
        elif pr_number:
            steps.append({"step": 2, "action": f"Merge PR #{pr_number} (squash, delete branch)"})
        else:
            steps.append({"step": 2, "action": "No PR to merge"})
        if jira_key:
            steps.append({"step": 3, "action": f"Transition {jira_key} to Done"})
        else:
            steps.append({"step": 3, "action": "Skip Jira transition (no key)"})
        steps.append(
            {"step": 4, "action": f"Update sprint YAML (status: done, completed: {today})"}
        )
        steps.append({"step": "4c", "action": "Generate demo artifacts"})
        steps.append({"step": 5, "action": "Archive completed epics"})
        steps.append({"step": 6, "action": f"Delete local branch: {branch}"})
        steps.append({"step": 7, "action": "Remove session file"})
        return {"success": True, "dry_run": True, "jira_key": jira_key, "steps": steps}

    # --- Pre-merge gate (gh #113): a definitively non-mergeable PR aborts finish
    # BEFORE any irreversible step. 155-1 made the merge load-bearing; this stops
    # the ceremony even earlier — ahead of archive_session — so a CONFLICTING PR
    # leaves the session, the YAML, and the archive untouched and reports an
    # actionable rebase message instead of a generic merge failure. Indeterminate
    # mergeability (UNKNOWN / gh error) is NOT blocked here: it falls through to
    # the merge + post-merge _pr_is_merged verification.
    from pf.common.pr_config import get_pr_merge_mode

    if pr_number and get_pr_merge_mode() == "auto":
        block_reason = _pr_block_reason(pr_number)
        if block_reason:
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": pr_number,
                    "success": False,
                    "error": block_reason,
                }
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": block_reason,
                "steps": steps,
            }

    # --- Step 2: Merge PR (runs BEFORE archive) ---
    # The merge is verified here, ahead of the (irreversible) session archive, so
    # a blocked/denied or un-landed merge aborts finish leaving NO stray archive
    # copy in sprint/archive/ (155-15). 155-1 already made the merge load-bearing
    # for the ``done`` transition + session removal; this ordering extends the
    # same guarantee to archiving. The pre-merge CONFLICTING gate above still
    # short-circuits definitively-conflicting PRs even earlier. A review-required
    # guardrail (mergeable=MERGEABLE, mergeStateStatus=BLOCKED) is not detectable
    # as CONFLICTING; it surfaces as a non-zero ``gh pr merge`` (or a merge that
    # never reaches MERGED) and is caught by the two abort branches below —
    # before Step 1 archives anything.
    pr_merge_mode = get_pr_merge_mode()
    if pr_merge_mode == "human":
        # Human merge mode never auto-merges; the story is left in_review below
        # for a human to merge. Nothing here is load-bearing.
        if pr_number:
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": pr_number,
                    "mode": "human",
                    "message": f"PR #{pr_number} ready for human review and merge",
                }
            )
        else:
            steps.append({"step": 2, "action": "merge_pr", "mode": "human", "skipped": True})
    elif pr_number:
        # Auto merge mode: the merge is load-bearing. A non-zero merge OR a
        # merge that did not actually land must abort finish BEFORE the story is
        # flipped to ``done`` AND before the session is archived — otherwise we
        # mark a story shipped whose code never reached the base branch
        # (gh #71 / #60) or leave a stray archive that lies about completion
        # (155-15). Return loud, run no irreversible step (no archive, no
        # transition, no session removal).
        merge_result = _run(["gh", "pr", "merge", pr_number, "--squash", "--delete-branch"])
        if merge_result.returncode != 0:
            stderr = (merge_result.stderr or "").strip()
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": pr_number,
                    "success": False,
                    "error": stderr or "gh pr merge returned non-zero",
                }
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": (
                    f"PR #{pr_number} merge failed: "
                    f"{stderr or 'gh pr merge returned non-zero'} — "
                    "refusing to mark the story done with unmerged code"
                ),
                "steps": steps,
            }
        if not _pr_is_merged(pr_number):
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": pr_number,
                    "success": False,
                    "error": "PR is not in MERGED state after the merge step",
                }
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": (
                    f"PR #{pr_number} is not MERGED after the merge step — "
                    "refusing to mark the story done with unmerged code"
                ),
                "steps": steps,
            }
        steps.append({"step": 2, "action": "merge_pr", "pr": pr_number, "merged": True})
    else:
        steps.append({"step": 2, "action": "merge_pr", "skipped": True})

    # --- Step 1 / 1b: Archive session + dialogue (only after the merge is verified) ---
    # Kept labelled "step 1"/"1b" for report stability, but executed after Step 2 so a
    # blocked/denied merge never leaves a stray archive behind (155-15). Reached only
    # when the merge landed, was skipped (no PR), or is a human-merge hold.
    #
    # The copy now sits AFTER the irreversible merge (gh pr merge --delete-branch), so
    # an OSError here (disk full, permission, session file vanished) must NOT propagate
    # past finish_story's no-throw contract (SOUL #10) into an unhandled traceback at
    # the CLI boundary — that would leave a merged/branch-deleted PR with the story
    # stuck in_review and the session unremoved. Abort loud-but-clean, exactly like the
    # merge/verify/transition failures above: return a result dict, run no further
    # irreversible step (no done transition, no session removal).
    try:
        archive_dest = archive_dir / archive_name
        shutil.copy2(session_path, archive_dest)
        steps.append({"step": 1, "action": "archive_session", "dest": str(archive_dest)})

        if dialogue_path.exists():
            dialogue_dest = archive_dir / dialogue_archive_name
            shutil.copy2(dialogue_path, dialogue_dest)
            steps.append(
                {"step": "1b", "action": "archive_dialogue", "dest": str(dialogue_dest)}
            )
    except OSError as exc:
        steps.append(
            {
                "step": 1,
                "action": "archive_session",
                "success": False,
                "error": str(exc),
            }
        )
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": (
                f"Failed to archive session for {story_id}: {exc} — refusing to "
                "mark the story done with an un-archived session"
            ),
            "steps": steps,
        }

    # --- Steps 3 & 4: Transition via state machine (Jira + YAML atomically) ---
    # Story should already be in_review (transitioned at review phase entry).
    # If still in_progress (legacy/edge case), do the two-step.
    try:
        data = read_sprint(sprint_path)
        _epic, current_story, _location = find_story_in_data(data, story_id)
        current_status = (
            current_story.get("status", "in_progress") if current_story else "in_progress"
        )
    except Exception:
        current_status = "in_progress"

    # Bridge through intermediate states to reach in_review (or done).
    # Stories may be stuck in backlog if work.py:start_work() never ran.
    if current_status == "backlog":
        transition_story(project_root, story_id, "in_progress")
        current_status = "in_progress"
    if current_status == "in_progress":
        transition_story(project_root, story_id, "in_review")

    if pr_merge_mode == "auto":
        t_result = transition_story(project_root, story_id, "done")
    else:
        # Human merge mode: leave in in_review until human merges
        t_result = {"success": True, "to_status": "in_review"}
    if t_result.get("success"):
        if jira_key:
            steps.append({"step": 3, "action": "jira_done", "key": jira_key})
        else:
            steps.append({"step": 3, "action": "jira_done", "skipped": True})
        steps.append({"step": 4, "action": "yaml_update", "status": "done", "completed": today})
    else:
        # Loud fail: a yaml-update failure during the final transition leaves
        # the sprint in inconsistent state. Stop now — do NOT run irreversible
        # cleanup (epic archive, branch delete, session removal).
        transition_error = t_result.get("error", "Transition failed")
        if jira_key:
            steps.append(
                {
                    "step": 3,
                    "action": "jira_done",
                    "key": jira_key,
                    "success": False,
                    "error": transition_error,
                }
            )
        else:
            steps.append(
                {
                    "step": 3,
                    "action": "jira_done",
                    "skipped": True,
                    "success": False,
                    "error": "No Jira key available",
                }
            )
        steps.append(
            {
                "step": 4,
                "action": "yaml_update",
                "success": False,
                "error": transition_error,
            }
        )
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": f"yaml-update step failed during finish: {transition_error}",
            "steps": steps,
        }

    # --- Step 4b: Add story to completed file ---
    # Surface the add-result as a step rather than swallowing it: an unresolved
    # epic must not silently drop the completed row (gh #16). This bookkeeping
    # add is non-fatal to finish, but the failure is recorded, never hidden.
    data = read_sprint(sprint_path)
    _epic, completed_story, _location = find_story_in_data(data, story_id)
    if completed_story:
        add_result = _add_story_to_completed(project_root, story_id, completed_story)
        if add_result.get("success"):
            steps.append(
                {"step": "4b", "action": "add_completed_story", "epic": add_result.get("epic")}
            )
        else:
            steps.append(
                {
                    "step": "4b",
                    "action": "add_completed_story",
                    "success": False,
                    "error": add_result.get("error"),
                }
            )

    # --- Step 4c: Generate demo artifacts (non-fatal) ---
    try:
        from pf.demo import orchestrator as demo_orchestrator

        demo_result = demo_orchestrator.generate(
            story_id, project_root=project_root
        )
        if demo_result.get("success"):
            steps.append({"step": "4c", "action": "demo_generate"})
        else:
            steps.append(
                {
                    "step": "4c",
                    "action": "demo_generate",
                    "warning": demo_result.get("error", "Demo generation failed"),
                }
            )
    except Exception as exc:
        steps.append(
            {
                "step": "4c",
                "action": "demo_generate",
                "warning": f"Demo generation error: {exc}",
            }
        )

    # --- Step 5: Archive completed epics ---
    result = _run(
        [sys.executable, "-m", "pf.cli", "sprint", "epic", "archive"],
        cwd=str(project_root),
    )
    steps.append({"step": 5, "action": "archive_epics", "ran": True})

    # --- Step 6: Git cleanup ---
    # Resolve the config for the repo at the project root (cwd of cleanup).
    # Only a known gitflow root repo gets branch cleanup; trunk-based or an
    # unresolved root (root_repo is None) is skipped by _git_cleanup.
    # Local import: avoids a circular dependency (pf.git.repos imports nothing
    # from pf.sprint, but the reverse top-level import would couple the layers).
    from pf.git.repos import load_repos_config

    root_repo = next(
        (rc for rc in load_repos_config(project_root).values() if rc.path in (".", "")),
        None,
    )
    steps.extend(_git_cleanup(project_root, branch, root_repo))

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
