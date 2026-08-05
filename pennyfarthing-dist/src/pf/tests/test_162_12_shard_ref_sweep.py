"""RED tests for story 162-12 — CWE-22 shard-ref sweep (follow-on to 160-13).

160-13 added ``is_safe_shard_path(candidate, base_dir)`` in ``shard_merge.py`` and
guarded three sites (merge_epic_shards' ref loop, and two sites in ``ws_push.py``).
The same untrusted-ref-to-path pattern remains UNGUARDED at the sites swept here.

THE ONE RULE (guard convention, inherited verbatim from 160-13)
---------------------------------------------------------------
Before any shard file is *read* (or written), the candidate path must be checked
with ``is_safe_shard_path(candidate, base_dir)``:

    base_dir = the sprint dir for sprint shards, the archive dir for archive shards.

A candidate that fails the check is SKIPPED — never opened — and the skip is
surfaced via the module's existing ``warnings.warn`` convention. Fail closed.
This holds for both flavours of candidate:

  1. **Interpolated refs** — ``base_dir / f"epic-{ref}.yaml"`` where ``ref`` comes
     from YAML data (``completed_epics``, story ``epic`` fields).
  2. **Glob results** — ``base_dir.glob("epic-*.yaml")`` /
     ``glob("initiative-*.yaml")`` / ``glob("sprint-*-completed.yaml")``. A glob
     match is a *name* match; a symlink whose name matches is yielded happily and
     resolves outside ``base_dir``. Glob loops must never yield a path that is
     read from outside ``base_dir``.

WHY SYMLINKS, NOT BARE ``../`` (unchanged from 160-13)
-----------------------------------------------------
``ref = "../../x"`` builds ``epic-../../x.yaml``; the ``epic-`` prefix is glued to
the first component, so the OS path walk needs a real directory named ``epic-..``
and ``.exists()`` gates the read out. That accidental safety is pinned below as a
regression guard — adding ``resolve()`` must not turn it into a leak. The
genuinely exploitable vector is a symlink *inside* the sprint/archive directory
plus a ref (or a shard name) routing through it, which only a ``resolve()``-based
containment check catches.

SITES SWEPT
-----------
  * ``loader.get_archived_stories``     — interpolated ref + ``sprint-*-completed`` glob
  * ``archive_epic.load_archive``       — interpolated ref
  * ``archive_epic.migrate_completed_archive`` — interpolated ref (read AND write)
  * ``archive_epic.backfill_epic_refs`` — ``sprint-*-completed`` glob
  * ``shard_merge.merge_epic_shards``   — initiative glob + orphan-scan glob
  * ``shard_merge.detect_orphan_shards``— initiative glob + orphan glob
"""

from __future__ import annotations

import builtins
from pathlib import Path

import pytest
import yaml

from pf.sprint.archive_epic import (
    backfill_epic_refs,
    load_archive,
    migrate_completed_archive,
)
from pf.sprint.loader import get_archived_stories
from pf.sprint.shard_merge import detect_orphan_shards, merge_epic_shards

# A ref that routes through an in-dir symlink named ``epic-link``:
#   base_dir / f"epic-{TRAVERSAL_REF}.yaml" == base_dir/epic-link/epic-PWNED.yaml
TRAVERSAL_REF = "link/epic-PWNED"

# Ref shapes that are gated out today by the ``epic-`` prefix + ``.exists()``.
# Pinned as regression guards: the fix must keep them contained.
LEXICAL_REFS = [
    "../../../pwned",
    "/etc/passwd",
    "..%2f..%2fpwned",
    "\\..\\..\\pwned",
]


def _yaml_loader(p: Path):
    """A load_file callable mirroring real shard reads (read + safe_load)."""
    return yaml.safe_load(Path(p).read_text(encoding="utf-8"))


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


def assert_contained(paths: list[Path], base: Path, what: str) -> None:
    """THE ONE RULE, as an assertion: no path touched outside ``base``."""
    escaped = [p for p in paths if not p.is_relative_to(base.resolve())]
    assert escaped == [], f"path traversal ({what}): touched outside {base}: {escaped}"


@pytest.fixture
def opened(monkeypatch):
    """Record the resolved path of every ``open()`` call.

    The swept sites read via the ``open()`` builtin (``load_yaml_config``,
    ``_load_archive_file``, ``_read_yaml_file``), not ``Path.read_text``.
    """
    seen: list[Path] = []
    real_open = builtins.open

    def spy(file, *args, **kwargs):
        if isinstance(file, (str, Path)):
            try:
                seen.append(Path(file).resolve())
            except (OSError, ValueError, RuntimeError):  # pragma: no cover
                pass
        return real_open(file, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", spy)
    return seen


@pytest.fixture
def archive_project(tmp_path):
    """Project root with sprint/archive/ and an ``epic-link`` escape symlink.

    Returns (root, archive_dir, secret) where ``secret`` is the out-of-archive
    shard that ``TRAVERSAL_REF`` resolves to.
    """
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(
        secret,
        {
            "jira": "PWNED",
            "status": "done",
            "stories": [{"id": "PWNED-1", "status": "done", "epic": "PWNED"}],
        },
    )
    (archive_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    assert (
        not (archive_dir / f"epic-{TRAVERSAL_REF}.yaml")
        .resolve()
        .is_relative_to(archive_dir.resolve())
    ), "test setup: ref must escape archive_dir"
    return tmp_path, archive_dir, secret


# ---------------------------------------------------------------------------
# loader.get_archived_stories — interpolated completed_epics ref
# ---------------------------------------------------------------------------


def test_get_archived_stories_rejects_traversal_epic_ref(archive_project, opened):
    """A traversal ref in ``completed_epics`` must not read an out-of-archive shard.

    RED: ``shard_path.exists()`` follows ``epic-link``, ``load_yaml_config`` reads
    the outside shard, and its stories are appended to the returned list.
    """
    root, archive_dir, secret = archive_project
    _write_yaml(
        archive_dir / "sprint-9001-completed.yaml",
        {
            "sprint": {"number": 9001},
            "completed_epics": [TRAVERSAL_REF],
            "completed_stories": [],
        },
    )

    stories = get_archived_stories(project_root=root)

    assert secret.resolve() not in opened, f"read out-of-archive shard {secret}"
    assert_contained(opened, archive_dir, "get_archived_stories ref")
    ids = [s.get("id") for s in stories]
    assert "PWNED-1" not in ids, f"out-of-archive story leaked: {ids}"


def test_get_archived_stories_rejects_escaping_archive_symlink(tmp_path, opened):
    """The ``sprint-*-completed.yaml`` glob loop must not read a symlinked escapee.

    RED: the glob matches on name, so an in-archive symlink pointing outside is
    yielded and read, and its ``completed_stories`` are returned.
    """
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "stolen.yaml"
    _write_yaml(
        secret,
        {
            "sprint": {"number": 9002},
            "completed_epics": [],
            "completed_stories": [{"id": "PWNED-1", "status": "done"}],
        },
    )
    (archive_dir / "sprint-9002-completed.yaml").symlink_to(secret)

    stories = get_archived_stories(project_root=tmp_path)

    assert secret.resolve() not in opened, f"read out-of-archive index {secret}"
    assert_contained(opened, archive_dir, "get_archived_stories glob")
    ids = [s.get("id") for s in stories]
    assert "PWNED-1" not in ids, f"out-of-archive story leaked: {ids}"


def test_get_archived_stories_still_loads_benign_shard(archive_project, opened):
    """Preservation guard: a normal in-archive shard ref must keep loading."""
    root, archive_dir, _ = archive_project
    _write_yaml(
        archive_dir / "epic-42.yaml",
        {"jira": "42", "status": "done", "stories": [{"id": "42-1", "status": "done"}]},
    )
    _write_yaml(
        archive_dir / "sprint-9001-completed.yaml",
        {
            "sprint": {"number": 9001},
            "completed_epics": ["42"],
            "completed_stories": [{"id": "42-orphan", "status": "done"}],
        },
    )

    ids = [s.get("id") for s in get_archived_stories(project_root=root)]

    assert "42-1" in ids, f"benign archive shard failed to load: {ids}"
    assert "42-orphan" in ids, f"index orphan lost: {ids}"


# ---------------------------------------------------------------------------
# archive_epic.load_archive — interpolated completed_epics ref
# ---------------------------------------------------------------------------


def test_load_archive_rejects_traversal_epic_ref(archive_project, opened):
    """A traversal ref in ``completed_epics`` must not read an out-of-archive shard.

    RED: ``load_archive`` builds ``archive_dir/epic-link/epic-PWNED.yaml``,
    ``.exists()`` follows the symlink, ``_read_yaml_file`` reads it, and the
    outside stories land in ``completed_stories``.
    """
    _root, archive_dir, secret = archive_project
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": [TRAVERSAL_REF],
            "completed_stories": [],
        },
    )

    result = load_archive(archive_path)

    assert secret.resolve() not in opened, f"read out-of-archive shard {secret}"
    assert_contained(opened, archive_dir, "load_archive ref")
    ids = [s.get("id") for s in result["completed_stories"]]
    assert "PWNED-1" not in ids, f"out-of-archive story leaked: {ids}"


def test_load_archive_still_merges_benign_shard(archive_project, opened):
    """Preservation guard: benign refs must still merge shard stories."""
    _root, archive_dir, _ = archive_project
    _write_yaml(
        archive_dir / "epic-42.yaml",
        {"jira": "42", "status": "done", "stories": [{"id": "42-1", "status": "done"}]},
    )
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["42"],
            "completed_stories": [],
        },
    )

    ids = [s.get("id") for s in load_archive(archive_path)["completed_stories"]]

    assert "42-1" in ids, f"benign archive shard failed to merge: {ids}"


@pytest.mark.parametrize("ref", LEXICAL_REFS)
def test_load_archive_lexical_refs_stay_contained(tmp_path, opened, ref):
    """Regression guard: non-symlink hostile ref shapes must stay contained.

    Green today (prefix-gluing + ``.exists()``); must remain green after the fix
    adds ``resolve()``-based containment.
    """
    archive_dir = tmp_path / "deep" / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {"sprint": {"number": 9001}, "completed_epics": [ref], "completed_stories": []},
    )

    result = load_archive(archive_path)

    assert_contained(opened, archive_dir, f"load_archive lexical ref {ref!r}")
    assert result["completed_stories"] == [], f"lexical ref {ref!r} leaked stories"


# ---------------------------------------------------------------------------
# archive_epic.migrate_completed_archive — interpolated ref (read AND write)
# ---------------------------------------------------------------------------


def test_migrate_completed_archive_rejects_traversal_epic_ref(archive_project, opened):
    """A traversal epic ref must not read — or WRITE — outside the archive dir.

    RED: ``shard_path = archive_dir / f"epic-{epic_ref}.yaml"`` follows the
    symlink; the existing outside shard is read and then rewritten in place with
    migrated stories — an out-of-bounds write, not just a read.
    """
    _root, archive_dir, secret = archive_project
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": [TRAVERSAL_REF],
            "completed_stories": [{"id": "9001-1", "status": "done", "epic": TRAVERSAL_REF}],
        },
    )
    before = secret.read_text()

    migrate_completed_archive(archive_path)

    assert_contained(opened, archive_dir, "migrate_completed_archive ref")
    assert secret.read_text() == before, (
        f"path traversal: out-of-archive shard was rewritten: {secret}"
    )


# ---------------------------------------------------------------------------
# archive_epic.backfill_epic_refs — sprint-*-completed glob
# ---------------------------------------------------------------------------


def test_backfill_epic_refs_rejects_escaping_archive_symlink(tmp_path, opened):
    """The backfill glob loop must not read a symlinked out-of-archive index.

    RED: the glob yields the in-archive symlink, ``_load_archive_file`` opens it,
    and the outside file's rows are walked (and reported).
    """
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    _write_yaml(tmp_path / "sprint" / "current-sprint.yaml", {"epics": [], "stories": []})
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "stolen.yaml"
    _write_yaml(
        secret,
        {
            "sprint": {"number": 9002},
            "completed_epics": [],
            "completed_stories": [{"id": "PWNED-1", "status": "done", "epic": ""}],
        },
    )
    (archive_dir / "sprint-9002-completed.yaml").symlink_to(secret)

    result = backfill_epic_refs(project_root=tmp_path)

    assert secret.resolve() not in opened, f"read out-of-archive index {secret}"
    # Base is the sprint tree, not archive_dir: backfill legitimately reads
    # sprint/current-sprint.yaml for the id->epic lookup. ``outside/`` still sits
    # outside this base, so an escaping archive read is still caught.
    assert_contained(opened, tmp_path / "sprint", "backfill_epic_refs glob")
    touched = [e.get("id") for e in result["backfilled"] + result["irrecoverable"]]
    assert "PWNED-1" not in touched, f"out-of-archive rows processed: {touched}"


# ---------------------------------------------------------------------------
# shard_merge glob loops — merge_epic_shards + detect_orphan_shards
# ---------------------------------------------------------------------------


@pytest.fixture
def sprint_with_escaping_shards(tmp_path):
    """Sprint dir with one real epic plus escaping epic-/initiative- symlinks.

    Returns (sprint_dir, secret_epic, secret_initiative).
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()

    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42", "title": "Real Epic"})

    secret_epic = outside / "secret-epic.yaml"
    _write_yaml(secret_epic, {"id": "PWNED", "title": "LEAKED_SECRET"})
    (sprint_dir / "epic-evil.yaml").symlink_to(secret_epic)

    secret_initiative = outside / "secret-initiative.yaml"
    _write_yaml(secret_initiative, {"id": "INIT-PWNED", "epics": ["PWNED"]})
    (sprint_dir / "initiative-evil.yaml").symlink_to(secret_initiative)

    return sprint_dir, secret_epic, secret_initiative


def _spy_loader(reads: list[Path]):
    def spy(p):
        reads.append(Path(p).resolve())
        return _yaml_loader(p)

    return spy


def test_merge_epic_shards_glob_loops_reject_escaping_shards(
    sprint_with_escaping_shards,
):
    """merge_epic_shards' initiative + orphan-scan globs must not read escapees.

    RED: both ``glob("initiative-*.yaml")`` and ``glob("epic-*.yaml")`` yield the
    in-dir symlinks and hand them to ``load_file``, reading outside sprint_dir.
    """
    sprint_dir, secret_epic, secret_initiative = sprint_with_escaping_shards
    reads: list[Path] = []

    merge_epic_shards({"epics": ["42"]}, sprint_dir, load_file=_spy_loader(reads))

    assert secret_epic.resolve() not in reads, f"read escaping shard {secret_epic}"
    assert secret_initiative.resolve() not in reads, f"read escaping initiative {secret_initiative}"
    assert_contained(reads, sprint_dir, "merge_epic_shards globs")


def test_merge_epic_shards_still_merges_benign_ref(sprint_with_escaping_shards):
    """Preservation guard: the real in-dir shard must still merge."""
    sprint_dir, _, _ = sprint_with_escaping_shards

    out = merge_epic_shards({"epics": ["42"]}, sprint_dir, load_file=_yaml_loader)

    ids = [e.get("id") for e in out["epics"] if isinstance(e, dict)]
    assert ids == ["42"], f"benign merge broken or escapee merged: {ids}"


def test_detect_orphan_shards_glob_loops_reject_escaping_shards(
    sprint_with_escaping_shards,
):
    """detect_orphan_shards' globs must not read — or report — escaping shards.

    RED: the ``epic-*.yaml`` glob yields ``epic-evil.yaml``, reads the outside
    file, and returns it as an orphan (leaking its id into the report).
    """
    sprint_dir, secret_epic, secret_initiative = sprint_with_escaping_shards
    reads: list[Path] = []

    orphans = detect_orphan_shards(
        {"epics": [{"id": "42"}]}, sprint_dir, load_file=_spy_loader(reads)
    )

    assert secret_epic.resolve() not in reads, f"read escaping shard {secret_epic}"
    assert secret_initiative.resolve() not in reads, f"read escaping initiative {secret_initiative}"
    assert_contained(reads, sprint_dir, "detect_orphan_shards globs")
    reported = [o.get("id") for o in orphans]
    assert "PWNED" not in reported, f"escaping shard reported as orphan: {reported}"


def test_detect_orphan_shards_still_reports_real_orphan(tmp_path):
    """Preservation guard: a genuine in-dir orphan must still be reported."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42", "title": "Indexed"})
    _write_yaml(sprint_dir / "epic-77.yaml", {"id": "77", "title": "Orphan"})

    orphans = detect_orphan_shards({"epics": [{"id": "42"}]}, sprint_dir, load_file=_yaml_loader)

    assert [o.get("id") for o in orphans] == ["77"], f"orphan detection broken: {orphans}"
