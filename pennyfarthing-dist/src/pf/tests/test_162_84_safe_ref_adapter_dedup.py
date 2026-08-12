"""Tests for story 162-84 — dedup safe_ref_path adapters, throttle TUI warn.

(a) safe_ref_path_or_none shared helper — basic contract.
(b) _check_context_files repeated calls warn only once per skipped shard.
(c) archive_epic / loader hand-rolled guards replaced by safe_ref_path_or_none.

Regression: test_162_44_cwe22_shard_path_sweep.py remains the authority on
CWE-22 containment — the tests here cover the new shared helper's own contract
and the throttle behaviour only.
"""

from __future__ import annotations

import warnings
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# (a) safe_ref_path_or_none
# ---------------------------------------------------------------------------


def test_safe_ref_path_or_none_returns_path_for_benign_ref(tmp_path):
    """Benign ref → same result as safe_ref_path."""
    from pf.sprint.shard_merge import safe_ref_path, safe_ref_path_or_none

    assert safe_ref_path_or_none(tmp_path, "42") == safe_ref_path(tmp_path, "42")


def test_safe_ref_path_or_none_returns_none_and_warns_on_hostile_ref(tmp_path):
    """Hostile ref → None + warnings.warn (not ValueError)."""
    from pf.sprint.shard_merge import safe_ref_path_or_none

    with warnings.catch_warnings(record=True) as records:
        warnings.simplefilter("always")
        result = safe_ref_path_or_none(tmp_path, "link/escape")

    assert result is None
    assert len(records) == 1, f"expected 1 warning, got {len(records)}"
    assert "link/escape" in str(records[0].message)


def test_safe_ref_path_or_none_honours_prefix_and_suffix(tmp_path):
    """Parameterised prefix/suffix forwarded to safe_ref_path."""
    from pf.sprint.shard_merge import safe_ref_path_or_none

    result = safe_ref_path_or_none(tmp_path, "99", prefix="context-epic-", suffix=".md")
    assert result == tmp_path / "context-epic-99.md"


def test_safe_ref_path_or_none_returns_none_for_escaping_symlink(tmp_path):
    """Charset-clean ref whose shard is an escaping symlink → None.

    base_dir is ``tmp_path/sprint``; the symlink target is ``tmp_path/outside``
    so it escapes the base_dir containment check.
    """
    from pf.sprint.shard_merge import safe_ref_path_or_none

    base = tmp_path / "sprint"
    base.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "target.yaml"
    _write_yaml(secret, {"id": "PWNED"})
    (base / "epic-42.yaml").symlink_to(secret)

    with warnings.catch_warnings(record=True):
        warnings.simplefilter("always")
        result = safe_ref_path_or_none(base, "42")

    assert result is None


# ---------------------------------------------------------------------------
# (b) _check_context_files: symlinked shard warns only once across repaints
# ---------------------------------------------------------------------------


def test_check_context_files_skipped_shard_warns_once(tmp_path, monkeypatch):
    """Repeated _check_context_files calls over the same symlinked shard warn once.

    162-84(b): _check_context_files runs on every TUI repaint. Before this fix,
    safe_shards emitted a warning per skipped shard on EVERY call. After, the
    warning fires exactly once per unique shard path for the module's lifetime.
    """
    from pf.tui import story_detail_data
    from pf.tui.story_detail_data import _check_context_files

    # Reset the dedup set so this test is independent of run order.
    monkeypatch.setattr(story_detail_data, "_warned_shards", set())

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "context").mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "secret.yaml"
    _write_yaml(secret, {"id": "42"})
    # Symlinked shard: epic-evil.yaml points outside sprint/
    (sprint_dir / "epic-evil.yaml").symlink_to(secret)

    with warnings.catch_warnings(record=True) as records:
        warnings.simplefilter("always")
        _check_context_files("42-1", str(tmp_path))  # repaint 1
        _check_context_files("42-1", str(tmp_path))  # repaint 2
        _check_context_files("42-1", str(tmp_path))  # repaint 3

    matching = [w for w in records if "epic-evil.yaml" in str(w.message)]
    assert len(matching) == 1, (
        f"Expected exactly 1 warn for skipped shard, got {len(matching)}: "
        f"{[str(w.message) for w in matching]}"
    )


def test_check_context_files_benign_shards_still_work(tmp_path, monkeypatch):
    """Preservation: benign shards are still iterated; context files are found."""
    from pf.tui import story_detail_data
    from pf.tui.story_detail_data import _check_context_files

    monkeypatch.setattr(story_detail_data, "_warned_shards", set())

    sprint_dir = tmp_path / "sprint"
    context_dir = sprint_dir / "context"
    context_dir.mkdir(parents=True)
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42", "jira": "PROJ-99"})
    (context_dir / "context-epic-PROJ-99.md").write_text("jira ctx\n")

    result = _check_context_files("42-1", str(tmp_path))

    assert result["has_epic_context"] is True, result
    assert "PROJ-99" in result["epic_context_path"], result


# ---------------------------------------------------------------------------
# (c) archive_epic.migrate_completed_archive + load_archive: hand-rolled guards
#     replaced — traversal refs now warn and skip (same as before but via shared helper)
# ---------------------------------------------------------------------------


def test_migrate_completed_archive_rejects_traversal_epic_ref(tmp_path):
    """migrate_completed_archive with an escaping epic_ref: skip + warn, no out-of-bounds write."""
    from pf.sprint.archive_epic import migrate_completed_archive

    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "victim.yaml"
    _write_yaml(secret, {"id": "PWNED", "stories": []})

    # Hostile epic_ref embedded in completed_stories
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["link/PWNED"],
            "completed_stories": [
                {"id": "link/PWNED-1", "epic": "link/PWNED", "title": "Bad"}
            ],
        },
    )

    before = secret.read_text() if secret.exists() else None
    with warnings.catch_warnings(record=True):
        warnings.simplefilter("always")
        result = migrate_completed_archive(archive_path)

    # hostile epic shard must not have been created / touched
    assert secret.exists() == (before is not None), "out-of-bounds file touched"
    if before is not None:
        assert secret.read_text() == before, "out-of-bounds file was modified"
    # function still succeeds (orphan story survives); 0 shards created via traversal
    assert result.get("success") is True, result
    assert result.get("shards_created") == 0, result


def test_load_archive_rejects_traversal_epic_ref(tmp_path):
    """load_archive with an escaping completed_epics ref: skip + warn, no read."""
    from pf.sprint.archive_epic import load_archive

    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(secret, {"jira": "PWN-1", "stories": [{"id": "PWN-S1", "status": "done"}]})

    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["link/PWNED"],
            "completed_stories": [],
        },
    )

    with warnings.catch_warnings(record=True):
        warnings.simplefilter("always")
        data = load_archive(archive_path)

    story_ids = [s.get("id") for s in data.get("completed_stories", [])]
    assert "PWN-S1" not in story_ids, f"out-of-bounds story leaked: {story_ids}"


def test_loader_get_archived_stories_rejects_traversal_ref(tmp_path, monkeypatch):
    """loader.get_archived_stories with escaping completed_epics ref: skip + warn."""
    from pf.common import config as pf_config
    from pf.sprint.loader import get_archived_stories

    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)

    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(
        secret, {"jira": "PWN-1", "stories": [{"id": "PWNED-1", "status": "done"}]}
    )
    # Symlink inside archive_dir pointing to parent (escapes archive_dir)
    (archive_dir / "epic-link").symlink_to(outside, target_is_directory=True)

    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["link/PWNED"],
            "completed_stories": [],
        },
    )
    _write_yaml(
        tmp_path / "sprint" / "current-sprint.yaml",
        {"sprint": {"number": 9001}, "epics": []},
    )

    with warnings.catch_warnings(record=True):
        warnings.simplefilter("always")
        stories = get_archived_stories()

    assert "PWNED-1" not in [s.get("id") for s in stories], (
        f"out-of-bounds story leaked into get_archived_stories: {stories}"
    )
