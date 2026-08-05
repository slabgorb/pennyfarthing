"""
Sprint epic archiving.

Archives completed epics by moving their shard files to sprint/archive/.
The sprint completed file references archived epics by ID (not inlined).
"""

import re
import shutil
import warnings
from datetime import date
from pathlib import Path
from typing import Any

from pf.common.config import get_project_root
from pf.sprint.loader import load_sprint
from pf.sprint.shard_merge import is_safe_shard_path
from pf.sprint.yaml_io import (
    _get_epic_ref,
    _make_yaml,
    _read_yaml_file,
    _write_yaml_file,
    read_sprint,
)


def get_archive_path(project_root: Path | None = None) -> Path:
    """Get the archive file path for the current sprint.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Path to the sprint archive file

    Raises:
        ValueError: When sprint metadata has neither `name` nor `number` set,
            when the derived sprint id contains characters outside
            ``[A-Za-z0-9._-]`` or a ``..`` parent reference, or when the
            resolved path would escape ``sprint/archive/``. Result-object
            callers must wrap this (see ``archive_story``) — SOUL #10.
    """
    root = project_root or get_project_root()
    sprint_data = load_sprint(root)

    if not sprint_data or "sprint" not in sprint_data:
        raise ValueError("Could not load sprint data")

    sprint_info = sprint_data["sprint"]

    # Prefer `name` (or `jira_sprint_name` for Jira-linked sprints), else fall back
    # to `number`. Fail loud if neither is set — silently writing to
    # `sprint-unknown-completed.yaml` masks misconfigured sprints (epic 151).
    name = sprint_info.get("name") or sprint_info.get("jira_sprint_name")
    if name:
        sprint_id = str(name).split()[-1]
    else:
        number = sprint_info.get("number")
        if number is None or number == "":
            raise ValueError(
                "Cannot resolve archive filename: sprint metadata has neither 'name' "
                "nor 'number' set. Check sprint/current-sprint.yaml."
            )
        sprint_id = str(number)

    # Sanitize before building the path (CWE-22, 155-7): sprint_id comes from
    # sprint YAML metadata and is used verbatim in a filename. Restrict to a
    # filename-safe charset; `..` passes the charset check but is a parent ref,
    # so refuse it explicitly.
    if not re.fullmatch(r"[A-Za-z0-9._-]+", sprint_id) or ".." in sprint_id:
        raise ValueError(
            f"Invalid sprint id {sprint_id!r}: only [A-Za-z0-9._-] characters "
            "(and no '..') are allowed in the archive filename. "
            "Check sprint/current-sprint.yaml."
        )

    archive_dir = root / "sprint" / "archive"
    archive_path = archive_dir / f"sprint-{sprint_id}-completed.yaml"

    # Containment (defence-in-depth): the resolved path must stay directly
    # under sprint/archive/ even if the sanitization above is ever loosened.
    if archive_path.resolve().parent != archive_dir.resolve():
        raise ValueError(
            f"Archive path escapes the archive directory: {archive_path} "
            f"(resolves to {archive_path.resolve()})"
        )

    return archive_path


def ensure_archive_file(project_root: Path | None = None) -> Path:
    """Ensure archive file exists, creating with template if needed.

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        Path to the archive file
    """
    root = project_root or get_project_root()
    archive_path = get_archive_path(root)

    if archive_path.exists():
        return archive_path

    sprint_data = load_sprint(root)
    sprint_info = sprint_data.get("sprint", {})

    sprint_name = sprint_info.get("jira_sprint_name", "Unknown Sprint")
    sprint_id = sprint_info.get("jira_sprint_id", "")
    sprint_number = sprint_info.get("number", "")
    goal = sprint_info.get("goal", "")
    start_date = sprint_info.get("start_date", "")
    end_date = sprint_info.get("end_date", "")
    status = sprint_info.get("status", "active")

    template = f"""# Sprint {sprint_name} - Completed Work
# Jira Sprint ID: {sprint_id}
# Archived: {date.today().isoformat()}

sprint:
  name: "{sprint_name}"
  number: {sprint_number}
  jira_sprint_id: {sprint_id}
  jira_sprint_name: "{sprint_name}"
  goal: {goal}
  start_date: {start_date}
  end_date: {end_date}
  status: {status}

completed_epics:
  # Epic shard files live in sprint/archive/epic-{{ref}}.yaml

completed_stories:
  # Orphan stories not belonging to an epic
"""

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_path.write_text(template)

    return archive_path


def migrate_completed_archive(archive_path: Path) -> dict[str, Any]:
    """Migrate a monolithic completed archive to index+shard format.

    Extracts inlined stories from completed_stories, groups them by epic,
    writes per-epic shard files to the archive directory, and removes
    migrated stories from the index (keeping only orphans).

    Args:
        archive_path: Path to the sprint archive YAML file

    Returns:
        Dict with migration results {success, shards_created, stories_migrated}
    """
    archive_dir = archive_path.parent
    data = _load_archive_file(archive_path)
    epic_refs = set(data["completed_epics"])

    # Group stories by epic ref
    epic_stories: dict[str, list[dict[str, Any]]] = {}
    orphans: list[dict[str, Any]] = []
    for story in data["completed_stories"]:
        epic = story.get("epic", "")
        if epic in epic_refs:
            epic_stories.setdefault(epic, []).append(story)
        else:
            orphans.append(story)

    # Write per-epic shard files
    shards_created = 0
    stories_migrated = 0
    for epic_ref, stories in epic_stories.items():
        shard_path = archive_dir / f"epic-{epic_ref}.yaml"
        # Path traversal (CWE-22): this site both reads and rewrites the shard,
        # so an escaping ref would be an out-of-bounds write. Fail closed.
        if not is_safe_shard_path(shard_path, archive_dir):
            warnings.warn(
                f"Archived epic ref '{epic_ref}' escapes the archive directory "
                f"({shard_path}) — skipping",
                stacklevel=2,
            )
            continue
        if shard_path.exists():
            existing = _read_yaml_file(shard_path)
            existing_ids = {s["id"] for s in existing.get("stories", [])}
            merged = list(existing.get("stories", []))
            for s in stories:
                if s["id"] not in existing_ids:
                    merged.append(s)
            existing["stories"] = merged
            _write_yaml_file(shard_path, existing)
        else:
            shard_data = {
                "jira": epic_ref,
                "status": "done",
                "stories": stories,
            }
            _write_yaml_file(shard_path, shard_data)
            shards_created += 1
        stories_migrated += len(stories)

    # Update the index: keep only orphans
    data["completed_stories"] = orphans
    _write_archive_file(archive_path, data)

    return {
        "success": True,
        "shards_created": shards_created,
        "stories_migrated": stories_migrated,
    }


def load_archive(archive_path: Path) -> dict[str, Any]:
    """Load the archive index and merge stories from shard files.

    Like load_sprint() for the active sprint, this reads the index file
    and merges stories from per-epic shard files in the same directory.

    Args:
        archive_path: Path to the sprint archive YAML file

    Returns:
        Unified archive dict with all completed_stories from shards + orphans
    """
    data = _load_archive_file(archive_path)
    archive_dir = archive_path.parent

    # Collect stories from shards
    all_stories: list[dict[str, Any]] = []
    for epic_ref in data["completed_epics"]:
        shard_path = archive_dir / f"epic-{epic_ref}.yaml"
        if not is_safe_shard_path(shard_path, archive_dir):
            warnings.warn(
                f"Archived epic ref '{epic_ref}' escapes the archive directory "
                f"({shard_path}) — skipping",
                stacklevel=2,
            )
            continue
        if shard_path.exists():
            shard = _read_yaml_file(shard_path)
            all_stories.extend(shard.get("stories", []))

    # Add orphans from index
    all_stories.extend(data["completed_stories"])

    result = dict(data)
    result["completed_stories"] = all_stories
    return result


def _load_archive_file(archive_path: Path) -> dict[str, Any]:
    """Load the sprint archive file, handling both old and new formats.

    Args:
        archive_path: Path to the archive YAML file

    Returns:
        Archive data dict with completed_epics and completed_stories
    """
    yml = _make_yaml()
    with open(archive_path) as f:
        data = yml.load(f)

    if data is None:
        data = {}

    # Ensure new-format keys exist
    if "completed_epics" not in data:
        data["completed_epics"] = []
    if "completed_stories" not in data:
        data["completed_stories"] = []

    # Normalize: ensure lists are not None
    if data["completed_epics"] is None:
        data["completed_epics"] = []
    if data["completed_stories"] is None:
        data["completed_stories"] = []

    return data


def _write_archive_file(archive_path: Path, data: dict[str, Any]) -> None:
    """Write the sprint archive file.

    Args:
        archive_path: Path to the archive YAML file
        data: Archive data dict

    Raises:
        ValueError: When any `completed_stories` entry is missing a non-empty
            `epic` reference. The message names every offending story id so
            the caller can decide whether to backfill (``backfill_epic_refs``)
            or fix the inputs before retrying.
    """
    import io

    from ruamel.yaml.comments import CommentedMap, CommentedSeq

    offenders = [
        str(story.get("id") or "<unknown>")
        for story in data.get("completed_stories") or []
        if not (story.get("epic") or "").strip()
    ]
    if offenders:
        raise ValueError(
            "Refusing to write archive: completed_stories entries have "
            "missing or empty `epic` references: "
            + ", ".join(offenders)
            + ". Set a non-empty `epic` field, or run `backfill_epic_refs()` "
            "to repair historical entries."
        )

    yml = _make_yaml()

    # Build output preserving comments at the top
    cm = CommentedMap()
    if "sprint" in data:
        cm["sprint"] = data["sprint"]

    # completed_epics as string refs
    epic_refs = CommentedSeq()
    for ref in data.get("completed_epics", []):
        epic_refs.append(ref)
    cm["completed_epics"] = epic_refs

    # completed_stories for orphans
    stories = CommentedSeq()
    for story in data.get("completed_stories", []):
        stories.append(story)
    cm["completed_stories"] = stories

    stream = io.StringIO()
    yml.dump(cm, stream)
    output = stream.getvalue()

    # Clean trailing whitespace
    lines = output.split("\n")
    cleaned = [line.rstrip() for line in lines]
    result = "\n".join(cleaned).rstrip("\n") + "\n"

    archive_path.write_text(result)


def backfill_epic_refs(
    project_root: Path | None = None, *, prefix_parse: bool = False
) -> dict[str, Any]:
    """Repair archive entries whose `epic` field is missing or empty.

    Walks every ``sprint/archive/sprint-*-completed.yaml`` under ``project_root``
    and, for each completed-story entry that lacks a usable ``epic`` reference,
    looks the story up by id in the live sprint YAML. Resolved entries are
    patched in place; entries whose parent epic cannot be determined are
    reported as irrecoverable and left untouched.

    An archive file is only rewritten when every entry in it has a non-empty
    ``epic`` after repair — the `_write_archive_file` guard enforces that
    invariant.

    Args:
        project_root: Project root path (defaults to auto-detect).
        prefix_parse: Opt-in one-time migration mode for historical archives
            (155-10). For rows still unresolved after the live-sprint lookup
            (live data always wins), derive the epic from the story id iff it
            is an unambiguous numeric ``{epic}-{seq}`` (``144-5`` → ``'144'``).
            Off by default: the live finish path's no-prefix-parse rule (155-4)
            must not gain a silent fallback — anything not matching stays
            irrecoverable.

    Returns:
        {"success": True, "backfilled": [{"id", "epic"}, ...],
         "irrecoverable": [{"id"}, ...]}
    """
    root = project_root or get_project_root()
    archive_dir = root / "sprint" / "archive"

    backfilled: list[dict[str, str]] = []
    irrecoverable: list[dict[str, str]] = []

    id_to_epic: dict[str, str] = {}
    sprint_data = load_sprint(root) or {}
    for epic in sprint_data.get("epics") or []:
        if not isinstance(epic, dict):
            continue
        # Canonical epic-ref (SOUL #2) — the one formula used everywhere else in
        # this module; rejects jira sentinels + strips ``epic-`` (155-8).
        epic_ref = _get_epic_ref(epic)
        if not epic_ref:
            continue
        for story in epic.get("stories") or []:
            sid = story.get("id")
            if sid:
                id_to_epic[str(sid)] = epic_ref

    if not archive_dir.exists():
        return {"success": True, "backfilled": backfilled, "irrecoverable": irrecoverable}

    for archive_path in sorted(archive_dir.glob("sprint-*-completed.yaml")):
        # Path traversal (CWE-22): a glob match is a *name* match, so a symlink
        # inside the archive dir pointing outside it is yielded happily.
        if not is_safe_shard_path(archive_path, archive_dir):
            warnings.warn(
                f"Archive index {archive_path.name} escapes the archive directory "
                f"({archive_path}) — skipping",
                stacklevel=2,
            )
            continue
        data = _load_archive_file(archive_path)
        stories = data.get("completed_stories") or []
        file_changed = False

        for story in stories:
            if (story.get("epic") or "").strip():
                continue
            sid = str(story.get("id") or "").strip()
            resolved = id_to_epic.get(sid) if sid else None
            if not resolved and prefix_parse and sid:
                # Historical-archive migration only (155-10): unambiguous
                # numeric {epic}-{seq} ids may fall back to their prefix.
                match = re.fullmatch(r"(\d+)-\d+", sid)
                if match:
                    resolved = match.group(1)
            if resolved:
                story["epic"] = resolved
                backfilled.append({"id": sid, "epic": resolved})
                file_changed = True
            else:
                irrecoverable.append({"id": sid})

        if file_changed and all((s.get("epic") or "").strip() for s in stories):
            _write_archive_file(archive_path, data)

    return {"success": True, "backfilled": backfilled, "irrecoverable": irrecoverable}


def is_epic_complete(epic: dict[str, Any]) -> tuple[bool, list[str]]:
    """Check if an epic is complete by examining story statuses.

    Args:
        epic: Epic dict from sprint YAML

    Returns:
        Tuple of (is_complete, list of incomplete story IDs)
    """
    epic_status = epic.get("status", "backlog")
    if epic_status in ("done", "completed"):
        return True, []

    stories = epic.get("stories", [])
    if not stories:
        return False, []

    incomplete = []
    for story in stories:
        story_status = story.get("status", "backlog")
        if story_status not in ("done", "completed", "canceled", "cancelled"):
            incomplete.append(story.get("id", "unknown"))

    return len(incomplete) == 0, incomplete


def get_completed_epics(project_root: Path | None = None) -> list[dict[str, Any]]:
    """Get all epics that are complete (by status or story completion).

    Args:
        project_root: Project root path (defaults to auto-detect)

    Returns:
        List of completed epic dicts with completion info
    """
    root = project_root or get_project_root()
    sprint_data = load_sprint(root)

    if not sprint_data or "epics" not in sprint_data:
        return []

    completed = []
    for epic in sprint_data["epics"]:
        is_complete, incomplete_stories = is_epic_complete(epic)
        if is_complete:
            completed.append(
                {
                    "epic": epic,
                    "incomplete_stories": incomplete_stories,
                }
            )

    return completed


def archive_epic(
    epic_id: str,
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
    update_jira: bool = False,
) -> dict[str, Any]:
    """Archive a completed epic.

    Moves the epic shard file to sprint/archive/, adds the epic ref to the
    sprint completed file, and removes it from the current sprint index.
    Context files are also moved to archive.

    Args:
        epic_id: Epic ID to archive (e.g., "epic-64" or "PROJ-12465")
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes
        update_jira: If True, also transition epic to Done in Jira

    Returns:
        Dict with success status and details
    """
    root = project_root or get_project_root()
    sprint_dir = root / "sprint"
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    sprint_path = sprint_dir / "current-sprint.yaml"
    sprint_data = read_sprint(sprint_path)

    if not sprint_data or "epics" not in sprint_data:
        return {"success": False, "error": "Could not load sprint data"}

    # Find the epic in merged data
    epic = None
    for e in sprint_data["epics"]:
        eid = str(e.get("id", ""))
        ejira = str(e.get("jira", ""))
        if eid == epic_id or ejira == epic_id:
            epic = e
            break

    if not epic:
        return {"success": False, "error": f"Epic '{epic_id}' not found"}

    # Check completion
    is_complete, incomplete = is_epic_complete(epic)
    if not is_complete:
        return {
            "success": False,
            "error": f"Epic has {len(incomplete)} incomplete stories",
            "incomplete_stories": incomplete,
        }

    # Determine the shard ref (filename stem)
    epic_ref = _get_epic_ref(epic)
    shard_file = sprint_dir / f"epic-{epic_ref}.yaml"
    archive_shard = archive_dir / f"epic-{epic_ref}.yaml"
    story_count = len(epic.get("stories", []))
    total_points = sum(s.get("points", 0) for s in epic.get("stories", []))

    if dry_run:
        msg_parts = [f"Would archive {epic_id} ({story_count} stories, {total_points} pts)"]
        if shard_file.exists():
            msg_parts.append(f"  Move: {shard_file.name} → archive/")
        # Check for context file
        for ctx_name in [f"context-epic-{epic_ref}.md", f"context-epic-{epic.get('id', '')}.md"]:
            ctx_file = sprint_dir / "context" / ctx_name
            if ctx_file.exists():
                msg_parts.append(f"  Move: context/{ctx_name} → archive/")
                break
        return {
            "success": True,
            "dry_run": True,
            "epic": epic,
            "stories_archived": story_count,
            "total_points": total_points,
            "message": "\n".join(msg_parts),
        }

    # Resolve (and create if needed) the sprint archive file BEFORE any
    # filesystem mutation — a rejected sprint id must not strand a half-moved
    # shard (155-7 rework: validate before the first irreversible step, 155-12).
    try:
        archive_path = ensure_archive_file(root)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    # 1. Update epic status in the shard before moving
    if shard_file.exists():
        shard_data = _read_yaml_file(shard_file)
        shard_data["status"] = "done"
        if "completed" not in shard_data:
            shard_data["completed"] = date.today().isoformat()
        _write_yaml_file(shard_file, shard_data)
        # Move shard to archive
        shutil.move(str(shard_file), str(archive_shard))
    else:
        # No shard file on disk — write epic data directly to archive
        epic["status"] = "done"
        if "completed" not in epic:
            epic["completed"] = date.today().isoformat()
        _write_yaml_file(archive_shard, epic)

    # 2. Move context file if it exists
    context_moved = None
    for ctx_name in [f"context-epic-{epic_ref}.md", f"context-epic-{epic.get('id', '')}.md"]:
        ctx_file = sprint_dir / "context" / ctx_name
        if ctx_file.exists():
            shutil.move(str(ctx_file), str(archive_dir / ctx_name))
            context_moved = ctx_name
            break

    # 3. Add epic ref and completed stories to sprint completed file
    archive_data = _load_archive_file(archive_path)

    # Add ref if not already present
    if epic_ref not in archive_data["completed_epics"]:
        archive_data["completed_epics"].append(epic_ref)

    # Add each completed story to completed_stories list
    existing_ids = {s.get("id") for s in archive_data["completed_stories"]}
    epic_jira_ref = epic.get("jira", epic_ref)
    for story in epic.get("stories", []):
        story_id = story.get("id", "")
        if story_id and story_id not in existing_ids:
            archive_data["completed_stories"].append(
                {
                    "id": story_id,
                    "epic": epic_jira_ref,
                    "title": story.get("title", ""),
                    "points": story.get("points", 0),
                    "completed": story.get("completed", date.today().isoformat()),
                }
            )

    _write_archive_file(archive_path, archive_data)

    # 4. Remove epic from current-sprint.yaml index
    # Re-read the raw index (not merged) to update refs
    yml = _make_yaml()
    with open(sprint_path) as f:
        index_data = yml.load(f)

    epics_list = index_data.get("epics", [])
    # Remove the matching ref (string) or dict
    new_epics = []
    for item in epics_list:
        if isinstance(item, str):
            if item != epic_ref:
                new_epics.append(item)
        else:
            item_id = str(item.get("id", ""))
            item_jira = str(item.get("jira", ""))
            if item_id != epic_id and item_jira != epic_id:
                new_epics.append(item)

    from ruamel.yaml.comments import CommentedSeq

    index_data["epics"] = CommentedSeq(new_epics)
    _write_yaml_file(sprint_path, index_data)

    result = {
        "success": True,
        "epic_id": epic_id,
        "epic_ref": epic_ref,
        "stories_archived": story_count,
        "total_points": total_points,
        "archive_shard": str(archive_shard),
        "context_moved": context_moved,
        "message": f"Archived {epic_id} ({story_count} stories, {total_points} pts) → archive/epic-{epic_ref}.yaml",
    }

    # Update Jira if requested
    epic_jira = epic.get("jira", "")
    if update_jira and epic_jira:
        result["jira_updated"] = _update_jira_epic(str(epic_jira))

    return result


def _update_jira_epic(jira_key: str) -> bool:
    """Transition a Jira epic to Done.

    Args:
        jira_key: Jira issue key (e.g., "PROJ-12465")

    Returns:
        True if successful, False otherwise
    """
    import subprocess

    try:
        result = subprocess.run(
            ["jira", "issue", "move", jira_key, "Done"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def archive_all_completed(
    *,
    project_root: Path | None = None,
    dry_run: bool = False,
    update_jira: bool = False,
) -> dict[str, Any]:
    """Archive all completed epics.

    Args:
        project_root: Project root path (defaults to auto-detect)
        dry_run: If True, show what would be done without making changes
        update_jira: If True, also transition epics to Done in Jira

    Returns:
        Dict with results for each epic
    """
    root = project_root or get_project_root()
    completed = get_completed_epics(root)

    if not completed:
        return {
            "success": True,
            "message": "No completed epics found",
            "archived": [],
        }

    results = []
    for item in completed:
        epic = item["epic"]
        epic_id = str(epic.get("id", ""))
        result = archive_epic(
            epic_id,
            project_root=root,
            dry_run=dry_run,
            update_jira=update_jira,
        )
        results.append(result)

    total_stories = sum(r.get("stories_archived", 0) for r in results if r.get("success"))
    total_points = sum(r.get("total_points", 0) for r in results if r.get("success"))

    return {
        "success": all(r.get("success") for r in results),
        "archived": results,
        "message": f"Archived {len(results)} epics ({total_stories} stories, {total_points} pts)",
    }


def main(args: list[str] | None = None) -> int:
    """CLI entry point for epic archiving."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Archive completed epics from current sprint")
    parser.add_argument(
        "epic_id",
        nargs="?",
        help="Epic ID to archive (omit to scan all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--jira",
        action="store_true",
        help="Also update Jira epic status to Done",
    )

    parsed = parser.parse_args(args)

    if parsed.epic_id:
        result = archive_epic(
            parsed.epic_id,
            dry_run=parsed.dry_run,
            update_jira=parsed.jira,
        )
    else:
        result = archive_all_completed(
            dry_run=parsed.dry_run,
            update_jira=parsed.jira,
        )

    if result.get("success"):
        if parsed.dry_run:
            print("[DRY-RUN]", result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    print(f"  {r.get('message')}")
        else:
            print(result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    print(f"  \u2713 {r.get('message')}")
            elif result.get("archive_shard"):
                print(f"  Shard: {result.get('archive_shard')}")
                if result.get("context_moved"):
                    print(f"  Context: {result.get('context_moved')}")
        return 0
    else:
        print(f"Failed: {result.get('error')}", file=sys.stderr)
        if result.get("incomplete_stories"):
            print(f"  Incomplete: {', '.join(result['incomplete_stories'])}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
