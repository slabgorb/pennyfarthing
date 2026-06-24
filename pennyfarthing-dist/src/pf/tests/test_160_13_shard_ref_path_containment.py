"""RED tests for story 160-13 (CWE-22, from 160-4 review finding).

Epic refs read from sprint YAML are interpolated into filesystem paths
WITHOUT a ``resolve()`` / containment check, then read:

    shard_merge.py:62   shard_file = sprint_dir / f"epic-{ref}.yaml"   # then read
    ws_push.py:227      _load_file(sprint_dir / f"epic-{ref}.yaml")    # ref_by_id pre-merge
    ws_push.py:278      shard_path = archive_dir / f"epic-{epic_ref}.yaml"  # archive loop

``ref`` / ``epic_ref`` come from untrusted-ish data (``data["epics"]`` and
``archive_data["completed_epics"]``). A crafted ref can build a path that
escapes the sprint directory and read an out-of-bounds file.

WHY SYMLINKS, NOT BARE ``../``
------------------------------
A bare ``ref = "../../../x"`` produces ``epic-../../../x.yaml``. Because the
``epic-`` prefix is glued to the first path component (``epic-..``), the
OS-level path walk used by ``Path.exists()`` / ``open()`` requires an on-disk
directory literally named ``epic-..`` — which does not exist — so the read is
gated out by ``.exists()`` / ``.is_file()`` and never actually escapes TODAY.
(That accidental safety is pinned by ``test_lexical_dotdot_ref_stays_contained``
as a regression guard — it must remain safe even after the fix adds resolve().)

The genuinely-exploitable vector is a **symlink inside the sprint/archive dir**
combined with a crafted ref that routes through it. ``.exists()`` follows the
symlink, the read escapes, and ONLY a ``.resolve()``-based containment check
catches it (a lexical ``..`` check would not). These tests therefore exercise
the symlink case end-to-end — verified to leak against HEAD.

DESIGNED INTERFACE (for Dev / GREEN)
------------------------------------
Before reading a shard path built from an epic ref, the code must ``resolve()``
the candidate path and confirm it is contained within the intended base
directory (``sprint_dir`` for the index/merge sites, ``archive_dir`` for the
archive site). A non-contained ref must be skipped (and surfaced, consistent
with the module's existing ``warnings.warn`` convention) — never read. Benign
refs and the already-safe lexical case must keep working unchanged.
"""

from __future__ import annotations

import json
import pathlib
from pathlib import Path

import pytest
import yaml

from pf.frame.ws_push import fetch_sprint
from pf.sprint.shard_merge import merge_epic_shards


def _yaml_loader(p: Path):
    """A load_file callable mirroring real shard reads (read + safe_load)."""
    return yaml.safe_load(Path(p).read_text(encoding="utf-8"))


def _escapes(path: Path, base: Path) -> bool:
    return not path.resolve().is_relative_to(base.resolve())


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


# ---------------------------------------------------------------------------
# Unit — merge_epic_shards (shard_merge.py:62)
# ---------------------------------------------------------------------------


def test_symlink_ref_not_merged_by_merge_epic_shards(tmp_path):
    """A ref routing through an in-dir symlink must not load an outside shard.

    RED: today merge_epic_shards builds ``sprint_dir/epic-link/epic-PWNED.yaml``,
    ``.exists()`` follows the symlink, ``load_file`` reads the out-of-sprint
    shard, and ``id: PWNED`` lands in the merged epics list.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "epic-PWNED.yaml").write_text("id: PWNED\ntitle: SECRET\n")
    (sprint_dir / "epic-link").symlink_to(outside, target_is_directory=True)

    # ref -> f"epic-{ref}.yaml" == "epic-link/epic-PWNED.yaml" -> outside/epic-PWNED.yaml
    ref = "link/epic-PWNED"
    constructed = sprint_dir / f"epic-{ref}.yaml"
    assert _escapes(constructed, sprint_dir), "test setup: ref must escape sprint_dir"

    reads: list[Path] = []

    def spy_load(p):
        reads.append(Path(p).resolve())
        return _yaml_loader(p)

    out = merge_epic_shards({"epics": [ref]}, sprint_dir, load_file=spy_load)

    merged_ids = [e.get("id") for e in out["epics"] if isinstance(e, dict)]
    assert "PWNED" not in merged_ids, (
        f"path traversal: out-of-sprint shard merged into epics: {merged_ids}"
    )
    escaped_reads = [r for r in reads if not r.is_relative_to(sprint_dir.resolve())]
    assert escaped_reads == [], (
        f"path traversal: shard read outside sprint_dir: {escaped_reads}"
    )


def test_lexical_dotdot_ref_stays_contained(tmp_path):
    """A bare ``../`` ref must never load an outside shard (regression guard).

    GREEN today (the ``epic-`` prefix + ``.exists()`` semantics gate it out),
    and must REMAIN green after the fix adds ``resolve()`` — i.e. introducing
    resolve() must not turn the currently-safe lexical case into a leak.
    Logged as a Design Deviation (intentional green, preservation guard).
    """
    sprint_dir = tmp_path / "deep" / "nested" / "sprint"
    sprint_dir.mkdir(parents=True)
    # Plant a secret where a 3x ``../`` ref would resolve to (lexically).
    secret = (sprint_dir / "epic-../../../pwned.yaml").resolve()
    assert _escapes(sprint_dir / "epic-../../../pwned.yaml", sprint_dir)
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("id: PWNED\ntitle: SECRET\n")

    reads: list[Path] = []

    def spy_load(p):
        reads.append(Path(p).resolve())
        return _yaml_loader(p)

    out = merge_epic_shards({"epics": ["../../../pwned"]}, sprint_dir, load_file=spy_load)

    merged_ids = [e.get("id") for e in out["epics"] if isinstance(e, dict)]
    assert "PWNED" not in merged_ids, f"lexical ../ ref leaked: {merged_ids}"
    escaped_reads = [r for r in reads if not r.is_relative_to(sprint_dir.resolve())]
    assert escaped_reads == [], f"lexical ../ ref read outside sprint_dir: {escaped_reads}"


def test_benign_ref_still_loads(tmp_path):
    """A normal in-dir shard ref must keep loading (preservation guard).

    GREEN today and post-fix; logged as a Design Deviation so the gate/Reviewer
    know the green test is intentional (containment must not reject legit refs).
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "epic-42.yaml").write_text("id: '42'\ntitle: Real Epic\n")

    out = merge_epic_shards({"epics": ["42"]}, sprint_dir, load_file=_yaml_loader)

    merged_ids = [e.get("id") for e in out["epics"] if isinstance(e, dict)]
    assert "42" in merged_ids, f"benign ref failed to load: {merged_ids}"


# ---------------------------------------------------------------------------
# Integration — fetch_sprint (ws_push.py:227 ref_by_id + merge, and :278 archive)
# ---------------------------------------------------------------------------


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so fetch_sprint() reads from it."""
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    (tmp_path / "sprint").mkdir()
    return tmp_path


@pytest.fixture
def read_recorder(monkeypatch):
    """Record the resolved path of every Path.read_text() call (delegates)."""
    seen: list[Path] = []
    orig = pathlib.Path.read_text

    def spy(self, *args, **kwargs):
        seen.append(Path(self).resolve())
        return orig(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "read_text", spy)
    return seen


def test_fetch_sprint_symlink_epic_ref_not_leaked(project_dir, read_recorder):
    """A traversal epic ref in the sprint index must not read/leak an outside shard.

    Covers the ref_by_id pre-merge read (ws_push.py:227) and the merge_epic_shards
    read. RED: both follow the symlink and surface ``PWNED`` in the payload.
    """
    sprint_dir = project_dir / "sprint"
    outside = project_dir / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    secret.write_text("id: PWNED\ntitle: LEAKED_SECRET\nstatus: backlog\nstories: []\n")
    (sprint_dir / "epic-link").symlink_to(outside, target_is_directory=True)

    ref = "link/epic-PWNED"
    assert _escapes(sprint_dir / f"epic-{ref}.yaml", sprint_dir), "test setup: ref must escape"
    _write_yaml(
        sprint_dir / "current-sprint.yaml",
        {"sprint": {"number": 9001}, "epics": [ref], "stories": []},
    )

    payload = fetch_sprint()

    assert secret.resolve() not in read_recorder, (
        f"path traversal: read out-of-sprint shard {secret.resolve()}"
    )
    blob = json.dumps(payload)
    assert "PWNED" not in blob and "LEAKED_SECRET" not in blob, (
        f"path traversal: out-of-sprint shard leaked into payload: {payload}"
    )


def test_fetch_sprint_archive_symlink_ref_not_leaked(project_dir, read_recorder):
    """A traversal completed-epic ref in the archive must not read/leak an outside shard.

    Covers the archive loop (ws_push.py:278). RED: ``.is_file()`` follows the
    symlink, ``read_text`` reads the out-of-sprint shard, ``PWNED`` surfaces.
    """
    sprint_dir = project_dir / "sprint"
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir()
    outside = project_dir / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    secret.write_text("id: PWNED\ntitle: LEAKED_SECRET\nstatus: done\nstories: []\n")
    (archive_dir / "epic-link").symlink_to(outside, target_is_directory=True)

    epic_ref = "link/epic-PWNED"
    assert _escapes(archive_dir / f"epic-{epic_ref}.yaml", archive_dir), "test setup: ref must escape"
    _write_yaml(
        sprint_dir / "current-sprint.yaml",
        {"sprint": {"number": 9001}, "epics": [], "stories": []},
    )
    _write_yaml(
        archive_dir / "sprint-9001-completed.yaml",
        {"sprint": {"number": 9001}, "completed_epics": [epic_ref]},
    )

    payload = fetch_sprint()

    assert secret.resolve() not in read_recorder, (
        f"path traversal: read out-of-archive shard {secret.resolve()}"
    )
    blob = json.dumps(payload)
    assert "PWNED" not in blob and "LEAKED_SECRET" not in blob, (
        f"path traversal: out-of-archive shard leaked into payload: {payload}"
    )
