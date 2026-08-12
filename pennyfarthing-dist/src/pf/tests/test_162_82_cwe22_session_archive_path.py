"""RED tests for story 162-82 — CWE-22 guard for .session/{story_id}-* archive paths.

Follow-up to 162-44: the same CWE-22 class (path traversal via symlink), different
domain (.session/ and sprint/archive/ rather than sprint shards).

story_finish.py currently builds paths from RAW args / session-file values:
    L1334: session_path = project_root / ".session" / f"{story_id}-session.md"
    L1476: archive_name = f"{jira_key}-session.md" if jira_key else f"{story_id}-session.md"
    L1479: dialogue_path = project_root / ".session" / f"{story_id}-dialogue.md"
    L1480: dialogue_archive_name = ...

These must be routed through safe_ref_path (prefix='', suffix='-session.md' or
'-dialogue.md') + result-object translation of ValueError (SOUL #10).

EXPLOIT VECTORS
--------------
1. session-path symlink  — .session/{story_id}-session.md is a symlink pointing
   outside .session/. The current unguarded READ follows it, exposing the outside
   file to _parse_session.

2. archive-path symlink  — sprint/archive/{story_id}-session.md is a symlink
   pointing outside sprint/archive/. The current unguarded shutil.copy2 follows
   it, writing the session content to the outside target.

PASS AN EXPLICIT project_root — never rely on monkeypatch.chdir (get_project_root
reads env vars before cwd).
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Sprint YAML / session helpers
# ---------------------------------------------------------------------------

_STORY_ID = "162-82"

_SPRINT_YAML = f"""\
sprint:
  name: "Test Sprint"
  status: active
epics:
  - id: "162"
    type: epic
    title: "Security Test Epic"
    status: in_progress
    stories:
      - id: {_STORY_ID}
        title: CWE-22 session archive guard
        points: 2
        status: in_progress
        workflow: tdd
"""

# Session with sentinel branch/pr — finish_story reaches the archive step
# without needing a real gh CLI call.
_SESSION_SENTINEL = f"""\
# Story {_STORY_ID}: CWE-22 session archive guard

## Story Details

- **ID:** {_STORY_ID}
- **Workflow:** tdd
- **Branch:** none
- **PR:** none
"""


def _build_project(tmp_path: Path) -> Path:
    """Minimal project structure: sprint YAML + archive dir + .session dir."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(_SPRINT_YAML)
    (sprint_dir / "archive").mkdir()
    (tmp_path / ".session").mkdir()
    return tmp_path


# ---------------------------------------------------------------------------
# Exploit 1: .session/{story_id}-session.md is a symlink pointing outside
# ---------------------------------------------------------------------------


def test_session_symlink_escape_is_blocked(tmp_path: Path) -> None:
    """finish_story must refuse to read a session file that resolves outside .session/.

    EXPLOIT (RED state): .session/{story_id}-session.md is a symlink whose
    resolved path lies outside .session/. The unguarded raw path build follows
    the symlink — session_path.exists() returns True, _parse_session reads the
    outside file. The function returns a non-traversal error (e.g., "No PR and
    no branch") proving it parsed the outside content.

    GUARD (GREEN state): safe_ref_path(project_root / ".session", story_id,
    prefix="", suffix="-session.md") calls is_safe_shard_path, detects the
    escape, raises ValueError. finish_story translates it to
    {"success": False, "error": "... traversal ..."} before any I/O.
    """
    from pf.sprint.story_finish import finish_story

    project_root = _build_project(tmp_path)
    session_dir = project_root / ".session"

    # Outside file — the symlink target. Must EXIST so session_path.exists()
    # returns True and the function proceeds to _parse_session (proving the read).
    outside_file = tmp_path / "outside-session-target.txt"
    outside_file.write_text("# outside file — should NEVER be parsed by finish_story\n")

    # Symlink: .session/162-82-session.md → ../outside-session-target.txt
    # Resolves to tmp_path/outside-session-target.txt (outside .session/).
    session_link = session_dir / f"{_STORY_ID}-session.md"
    session_link.symlink_to(outside_file)

    # Sanity: confirm the symlink DOES escape .session/
    assert not session_link.resolve().is_relative_to(session_dir.resolve()), (
        "Test setup error: symlink does not escape .session/"
    )

    result = finish_story(project_root=project_root, story_id=_STORY_ID)

    assert result["success"] is False
    error = result.get("error", "")

    # After the fix, the error must be traversal-related.
    # In RED state (no fix), the error is about missing branch/PR or similar —
    # NOT about traversal — proving the exploit reached _parse_session.
    assert "traversal" in error.lower() or "escapes" in error.lower() or (
        "Invalid" in error and ("session" in error.lower() or "story_id" in error.lower())
    ), (
        f"EXPLOIT ACTIVE: finish_story read the outside file and returned a "
        f"non-traversal error: {error!r}\n"
        "Fix: route session_path build (story_finish.py:1334) through "
        "safe_ref_path(project_root / '.session', story_id, prefix='', "
        "suffix='-session.md')."
    )


# ---------------------------------------------------------------------------
# Exploit 2: sprint/archive/{story_id}-session.md is a symlink pointing outside
# ---------------------------------------------------------------------------


def test_archive_symlink_escape_is_blocked(tmp_path: Path) -> None:
    """finish_story must refuse to write an archive file that resolves outside sprint/archive/.

    EXPLOIT (RED state): sprint/archive/{story_id}-session.md is a symlink
    pointing to a path outside sprint/archive/. shutil.copy2 follows the
    symlink and writes the session content to the outside target, creating
    outside-archive-target.txt.

    GUARD (GREEN state): safe_ref_path(archive_dir, story_id, prefix="",
    suffix="-session.md") detects the symlink escape at L1476, returns
    {"success": False, "error": "... traversal ..."} before the copy.
    """
    from pf.sprint.story_finish import finish_story

    project_root = _build_project(tmp_path)
    session_dir = project_root / ".session"
    archive_dir = project_root / "sprint" / "archive"

    # Real session file (NOT a symlink) with sentinel branch/pr so we reach
    # the archive step without a gh CLI call.
    (session_dir / f"{_STORY_ID}-session.md").write_text(_SESSION_SENTINEL)

    # Symlink in archive: 162-82-session.md → ../../outside-archive-target.txt
    # That resolves to project_root/outside-archive-target.txt.
    outside_target = project_root / "outside-archive-target.txt"
    archive_link = archive_dir / f"{_STORY_ID}-session.md"
    archive_link.symlink_to(outside_target)

    # Sanity: symlink points outside archive_dir
    # (resolve() on a dangling symlink returns the lexical target)
    assert not archive_link.parent.joinpath(
        archive_link.readlink()
    ).resolve().is_relative_to(archive_dir.resolve()), (
        "Test setup error: archive symlink does not escape sprint/archive/"
    )

    result = finish_story(project_root=project_root, story_id=_STORY_ID)

    # After fix: traversal guard fired — outside file was NOT created.
    # In RED state: shutil.copy2 followed the symlink and created outside_target.
    assert not outside_target.exists(), (
        f"EXPLOIT ACTIVE: shutil.copy2 followed the archive symlink and wrote "
        f"to {outside_target} (outside sprint/archive/).\n"
        f"finish_story result: {result}\n"
        "Fix: route archive_name build (story_finish.py:1476) through "
        "safe_ref_path(archive_dir, story_id, prefix='', suffix='-session.md')."
    )
    assert result["success"] is False
    error = result.get("error", "")
    assert "traversal" in error.lower() or "escapes" in error.lower() or (
        "Invalid" in error and ("archive" in error.lower() or "story_id" in error.lower()
                                or story_id_in_error(error))
    ), (
        f"Expected traversal guard error, got: {error!r}"
    )


def story_id_in_error(error: str) -> bool:
    return _STORY_ID in error
