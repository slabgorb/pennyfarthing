"""RED tests for story 162-44 — the tail of the CWE-22 shard-path sweep.

Chain: 160-13 (``is_safe_shard_path``) → 162-12 (first sweep) → 164-3
(``path_validation``) → **this story** (the remaining sites + the architectural
elevation).

THE ONE RULE (inherited verbatim — do NOT invent a new convention)
------------------------------------------------------------------
Before a shard path is *read*, *written*, *moved*, or *unlinked*, the candidate
must be checked against its base dir:

  * ``pf.sprint.path_validation.validate_shard_filename`` / ``validate_sprint_id``
    — charset fail-closed (``[A-Za-z0-9._-]``, no ``..``, non-empty), raises
    ``ValueError``.
  * ``pf.sprint.shard_merge.is_safe_shard_path(candidate, base_dir)`` —
    ``resolve()``-based *containment*.

A candidate that fails is SKIPPED — never opened/written/moved/unlinked — and
the skip is surfaced via ``warnings.warn``. Fail closed.

WHY SYMLINKS, NOT BARE ``..``
----------------------------
``ref = "../../x"`` builds ``epic-../../x.yaml``; the ``epic-`` prefix glues to
the first component, so the OS walk needs a real dir named ``epic-..`` and
``.exists()`` gates the read out. That accidental safety is pinned below as a
regression guard. The genuinely exploitable vector is a **symlink inside** the
sprint/archive dir plus a ref (or a matching shard *name*) routing through it —
only a ``resolve()`` check catches it.

DELIVERABLE A — the architectural elevation (new API)
-----------------------------------------------------
The invariant currently lives in *convention*: every caller must remember to
call ``is_safe_shard_path``. Every site swept in this story is a caller that
forgot. Elevate it into the API instead:

    safe_ref_path(base_dir, ref, *, prefix="epic-", suffix=".yaml") -> Path
    safe_shards(base_dir, pattern="epic-*.yaml") -> Iterator[Path]

**PLACEMENT EXPECTATION (Dev: put them here):** ``pf.sprint.shard_merge`` —
co-located with ``is_safe_shard_path``, which already lives there and is already
imported widely (``loader``, ``archive_epic``, ``ws_push``). ``shard_merge`` has
no ``pf.sprint`` package-level imports, so it stays importable without dragging
in the CLI (162-30 import-cycle caution). The tests below resolve both names
with ``getattr`` at call time so a missing function fails as a clear RED
assertion instead of a module-level collection error.

DELIVERABLE B — sites swept here (spec list is the FLOOR; greps confirmed live)
------------------------------------------------------------------------------
  * ``archive_epic.archive_epic``      — raw ``epic.get('id','')`` in the
    context-file ``shutil.move`` (read + delete + write, all unguarded) FIRST
  * ``validate.adapters.sprint._discover_files`` — ``epic-*``/``initiative-*`` globs
  * ``story_add.add_initiative_story`` — ``initiative-{slug}.yaml`` read AND write
  * ``findings.aggregate._collect_done_stories`` ×3 + ``_find_jira_key_in_shard``
  * ``sprint.cli._find_epic_in_initiatives`` / ``_resolve_epic_ref`` /
    ``_epic_shard_path`` — initiative glob + shard build
  * ``epic_reindex.reindex_epic``      — ``epic-{shard_ref}.yaml`` read
  * ``yaml_io.write_sprint``           — stale-shard ``unlink()`` (out-of-bounds
    DELETE, the worst of the lot) + the shard write
  * ``epic_add.add_epic``              — pinned GREEN (already charset-guarded)

DELIVERABLE C — ``frame/ws_push.py``'s three SILENT skip sites must ``warn``.
DELIVERABLE D — ``migrate_completed_archive`` positive path stays green.
"""

from __future__ import annotations

import builtins
import warnings
from pathlib import Path
from typing import Any

import pytest
import yaml

from pf.sprint.archive_epic import archive_epic, migrate_completed_archive

# A ref that routes through an in-dir symlink named ``epic-link``:
#   base_dir / f"epic-{TRAVERSAL_REF}.yaml" == base_dir/epic-link/epic-PWNED.yaml
TRAVERSAL_REF = "link/epic-PWNED"

# Ref shapes gated out today by prefix-gluing + ``.exists()``. Regression pins:
# adding ``resolve()`` containment must not turn any of these into a leak.
LEXICAL_REFS = ["../../../pwned", "/etc/passwd", "..%2f..%2fpwned", "\\..\\..\\pwned"]


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def assert_contained(paths: list[Path], base: Path, what: str) -> None:
    """THE ONE RULE, as an assertion: no path touched outside ``base``."""
    escaped = [p for p in paths if not p.is_relative_to(base.resolve())]
    assert escaped == [], f"path traversal ({what}): touched outside {base}: {escaped}"


def _new_api(name: str) -> Any:
    """Resolve a Deliverable-A function, failing as a RED assertion if absent.

    Deliberately NOT a module-level import: an ImportError at collection time
    would take the whole file down and hide the site-sweep failures.
    """
    import pf.sprint.shard_merge as shard_merge

    fn = getattr(shard_merge, name, None)
    assert fn is not None, (
        f"Deliverable A: pf.sprint.shard_merge.{name} does not exist yet. "
        "Dev: add it to shard_merge.py (co-located with is_safe_shard_path)."
    )
    return fn


def _warned_about(records: list[warnings.WarningMessage], needle: str) -> bool:
    """True if any recorded warning mentions ``needle`` (ref or built path)."""
    return any(needle in str(r.message) for r in records)


@pytest.fixture
def opened(monkeypatch):
    """Record the resolved path of every ``open()`` call.

    The swept sites read via the ``open()`` builtin (``yaml.safe_load(f)``,
    ``_read_yaml_file``, ``_load_archive_file``), not ``Path.read_text``.
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
def escaping_sprint(tmp_path):
    """sprint/ with a real shard plus an ``epic-link`` escape symlink.

    Returns (root, sprint_dir, secret) where ``secret`` is the out-of-sprint
    shard that ``TRAVERSAL_REF`` resolves to.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(
        secret,
        {
            "id": "PWNED",
            "title": "LEAKED_SECRET",
            "jira": "PWN-1",
            "status": "done",
            "stories": [{"id": "PWNED-1", "status": "done", "jira": "PWN-2"}],
        },
    )
    (sprint_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    assert (
        not (sprint_dir / f"epic-{TRAVERSAL_REF}.yaml")
        .resolve()
        .is_relative_to(sprint_dir.resolve())
    ), "test setup: ref must escape sprint_dir"
    return tmp_path, sprint_dir, secret


@pytest.fixture
def escaping_archive(tmp_path):
    """sprint/archive/ with an ``epic-link`` escape symlink.

    Returns (root, archive_dir, secret).
    """
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(
        secret,
        {
            "jira": "PWN-1",
            "status": "done",
            "stories": [{"id": "PWNED-1", "status": "done", "jira": "PWN-2"}],
        },
    )
    (archive_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    return tmp_path, archive_dir, secret


# ===========================================================================
# DELIVERABLE A — safe_ref_path
# ===========================================================================


def test_safe_ref_path_returns_built_path_for_benign_ref(tmp_path):
    """A benign ref yields exactly ``base_dir/epic-{ref}.yaml``.

    The guard must be a drop-in replacement for the raw interpolation it
    replaces — otherwise Dev can't route the sweep sites through it.
    """
    safe_ref_path = _new_api("safe_ref_path")

    assert safe_ref_path(tmp_path, "162") == tmp_path / "epic-162.yaml"
    assert safe_ref_path(tmp_path, "OP-42") == tmp_path / "epic-OP-42.yaml"


def test_safe_ref_path_honours_prefix_and_suffix(tmp_path):
    """``prefix``/``suffix`` are parameterised.

    The sweep needs three flavours: ``epic-*.yaml``, ``initiative-*.yaml``
    (story_add, cli) and ``context-epic-*.md`` (archive_epic's context move).
    """
    safe_ref_path = _new_api("safe_ref_path")

    assert (
        safe_ref_path(tmp_path, "technical-debt", prefix="initiative-")
        == tmp_path / "initiative-technical-debt.yaml"
    )
    assert (
        safe_ref_path(tmp_path, "162", prefix="context-epic-", suffix=".md")
        == tmp_path / "context-epic-162.md"
    )


@pytest.mark.parametrize(
    "ref",
    [
        "",
        "../../../pwned",
        "/etc/passwd",
        "a..b",
        TRAVERSAL_REF,
        "..%2f..%2fpwned",
        "\\..\\..\\pwned",
        "sub/dir",
    ],
)
def test_safe_ref_path_rejects_hostile_charset(tmp_path, ref):
    """Charset layer: fail closed with ``ValueError`` on every hostile ref shape.

    Delegates to ``validate_shard_filename`` — do not re-implement, and do not
    weaken its semantics (inherited invariant, 164-3).
    """
    safe_ref_path = _new_api("safe_ref_path")

    with pytest.raises(ValueError):
        safe_ref_path(tmp_path, ref)


def test_safe_ref_path_rejects_charset_clean_ref_that_escapes_via_symlink(tmp_path):
    """Containment layer: a charset-CLEAN ref whose path is an escaping symlink.

    ``ref="42"`` passes every charset check, but ``base/epic-42.yaml`` is a
    symlink to ``outside/target.yaml``. Only ``resolve()``-based containment
    catches this — this is the whole reason ``is_safe_shard_path`` exists, and
    the reason ``safe_ref_path`` must apply BOTH layers, not just the charset.
    """
    safe_ref_path = _new_api("safe_ref_path")
    base = tmp_path / "sprint"
    base.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "target.yaml"
    _write_yaml(secret, {"id": "PWNED"})
    (base / "epic-42.yaml").symlink_to(secret)

    with pytest.raises(ValueError):
        safe_ref_path(base, "42")


# ===========================================================================
# DELIVERABLE A — safe_shards
# ===========================================================================


def test_safe_shards_yields_benign_shards(escaping_sprint):
    """The guarded iterator still yields every legitimate in-dir shard, sorted."""
    safe_shards = _new_api("safe_shards")
    _root, sprint_dir, _secret = escaping_sprint
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42"})
    _write_yaml(sprint_dir / "epic-7.yaml", {"id": "7"})

    names = sorted(p.name for p in safe_shards(sprint_dir))

    assert names == ["epic-42.yaml", "epic-7.yaml"], f"benign shards lost: {names}"


def test_safe_shards_skips_and_warns_on_escaping_shard(tmp_path):
    """A name-matching symlink pointing outside base is SKIPPED *and* warned about.

    A glob match is a *name* match: ``epic-evil.yaml`` matches happily even
    though it resolves outside. Silent skipping is not acceptable (SOUL: no
    silent failure) — the convention is skip + ``warnings.warn``.
    """
    safe_shards = _new_api("safe_shards")
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "secret.yaml"
    _write_yaml(secret, {"id": "PWNED"})
    (sprint_dir / "epic-evil.yaml").symlink_to(secret)
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42"})

    with pytest.warns(UserWarning) as records:
        yielded = list(safe_shards(sprint_dir))

    assert [p.name for p in yielded] == ["epic-42.yaml"], f"escapee yielded: {yielded}"
    assert _warned_about(list(records), "epic-evil.yaml"), (
        f"skip was silent; warnings seen: {[str(r.message) for r in records]}"
    )


def test_safe_shards_supports_alternate_patterns(escaping_archive):
    """``pattern`` is parameterised — the sweep needs three glob shapes.

    ``epic-*.yaml`` (shards), ``initiative-*.yaml`` (cli, story_add) and
    ``sprint-*-completed.yaml`` (archive indices).
    """
    safe_shards = _new_api("safe_shards")
    _root, archive_dir, _secret = escaping_archive
    _write_yaml(archive_dir / "sprint-9001-completed.yaml", {"sprint": {"number": 9001}})
    _write_yaml(archive_dir / "initiative-debt.yaml", {"name": "debt"})

    completed = [p.name for p in safe_shards(archive_dir, "sprint-*-completed.yaml")]
    initiatives = [p.name for p in safe_shards(archive_dir, "initiative-*.yaml")]

    assert completed == ["sprint-9001-completed.yaml"], completed
    assert initiatives == ["initiative-debt.yaml"], initiatives


def test_safe_shards_on_missing_base_dir_yields_nothing(tmp_path):
    """Fail closed, not loud: a missing base dir yields nothing and never raises.

    Several call sites (archive dirs on fresh projects) glob directories that
    may not exist; the guarded iterator must preserve that tolerance.
    """
    safe_shards = _new_api("safe_shards")

    assert list(safe_shards(tmp_path / "does-not-exist")) == []


@pytest.mark.parametrize("ref", LEXICAL_REFS)
def test_safe_ref_path_lexical_refs_rejected_not_escaped(tmp_path, ref):
    """Regression pin: bare lexical traversal refs stay contained (never escape).

    Today ``epic-../../x.yaml`` is *accidentally* safe (prefix-gluing +
    ``.exists()``). After the fix they must be explicitly rejected — either way
    they must never resolve outside base.
    """
    safe_ref_path = _new_api("safe_ref_path")

    with pytest.raises(ValueError):
        safe_ref_path(tmp_path, ref)


# ===========================================================================
# DELIVERABLE B1 — archive_epic.archive_epic: the raw ``epic.get('id')`` move
# (strictly the worst site: unguarded READ + DELETE + WRITE via shutil.move)
# ===========================================================================


@pytest.fixture
def archive_epic_project(tmp_path):
    """Project where the epic's shard ref is SAFE but its raw ``id`` is hostile.

    ``_get_epic_ref`` returns the validated jira key ``OP-42``, so archiving
    proceeds — but the context-file loop's SECOND candidate interpolates the
    raw, never-validated ``epic['id']`` into a filename. Two symlinks make the
    resulting ``shutil.move`` fully out-of-bounds on both ends:

      sprint/context/context-epic-link -> outside_src/   (move SOURCE)
      sprint/archive/context-epic-link -> outside_dst/   (move DEST)

    Returns (root, archive_dir, ctx_secret, dst_dir).
    """
    root = tmp_path
    sprint_dir = root / "sprint"
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir(parents=True)
    (sprint_dir / "context").mkdir()

    outside_src = tmp_path / "outside_src"
    outside_src.mkdir()
    outside_dst = tmp_path / "outside_dst"
    outside_dst.mkdir()
    ctx_secret = outside_src / "x.md"
    ctx_secret.write_text("TOP SECRET CONTEXT\n", encoding="utf-8")

    (sprint_dir / "context" / "context-epic-link").symlink_to(outside_src, target_is_directory=True)
    (archive_dir / "context-epic-link").symlink_to(outside_dst, target_is_directory=True)

    _write_yaml(
        sprint_dir / "current-sprint.yaml",
        {
            "sprint": {"number": 9001, "name": "Sprint 9001"},
            "epics": [
                {
                    "id": "link/x",  # raw, hostile, NEVER validated
                    "jira": "OP-42",  # validated -> epic_ref="OP-42"
                    "title": "Escape hatch",
                    "status": "done",
                    "stories": [{"id": "OP-42-1", "status": "done", "points": 1}],
                }
            ],
        },
    )
    return root, archive_dir, ctx_secret, outside_dst


def test_archive_epic_context_move_must_not_escape_archive_dir(archive_epic_project):
    """A crafted epic ``id`` must not move a context file outside the archive dir.

    RED: the loop at archive_epic.py ~607 builds
    ``context-epic-{epic['id']}.md`` from the RAW id — bypassing the
    ``_get_epic_ref``/``validate_shard_filename`` gate that protects the shard
    path two lines above — then ``shutil.move``s it. On HEAD the out-of-sprint
    file is deleted from ``outside_src/`` and written into ``outside_dst/``:
    an unguarded read, delete AND write in one call.
    """
    root, _archive_dir, ctx_secret, dst_dir = archive_epic_project
    before = ctx_secret.read_text(encoding="utf-8")

    result = archive_epic("OP-42", project_root=root)

    assert ctx_secret.exists(), (
        f"path traversal: out-of-sprint context file was MOVED AWAY: {ctx_secret} (result={result})"
    )
    assert ctx_secret.read_text(encoding="utf-8") == before
    assert list(dst_dir.iterdir()) == [], (
        f"path traversal: file written outside the archive dir: {list(dst_dir.iterdir())}"
    )


def test_archive_epic_context_move_still_moves_benign_context_file(tmp_path):
    """Preservation guard: a normal context file must still be archived."""
    root = tmp_path
    sprint_dir = root / "sprint"
    (sprint_dir / "archive").mkdir(parents=True)
    (sprint_dir / "context").mkdir()
    ctx = sprint_dir / "context" / "context-epic-77.md"
    ctx.write_text("benign\n", encoding="utf-8")
    _write_yaml(
        sprint_dir / "current-sprint.yaml",
        {
            "sprint": {"number": 9001, "name": "Sprint 9001"},
            "epics": [
                {
                    "id": "epic-77",
                    "title": "Benign",
                    "status": "done",
                    "stories": [{"id": "77-1", "status": "done", "points": 1}],
                }
            ],
        },
    )

    result = archive_epic("epic-77", project_root=root)

    assert result.get("success") is True, result
    assert result.get("context_moved") == "context-epic-77.md", result
    assert (sprint_dir / "archive" / "context-epic-77.md").is_file()
    assert not ctx.exists()


# ===========================================================================
# DELIVERABLE B — validate/adapters/sprint._discover_files (epic + initiative globs)
# ===========================================================================


def test_validate_adapter_discovery_rejects_escaping_shards(tmp_path):
    """The validator's discovery globs must not hand out escaping symlinks.

    RED: ``_discover_files`` globs ``epic-*.yaml`` / ``initiative-*.yaml`` with
    no containment check (validate/adapters/sprint.py:25-26), so in-dir
    symlinks pointing outside the sprint dir are returned and then opened by
    ``validate_sprint_yaml`` — an out-of-bounds read reported (with content
    excerpts) in the validation report.
    """
    from pf.validate.adapters.sprint import _discover_files

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret_epic = outside / "secret-epic.yaml"
    _write_yaml(secret_epic, {"id": "PWNED"})
    secret_init = outside / "secret-init.yaml"
    _write_yaml(secret_init, {"name": "PWNED"})
    (sprint_dir / "epic-evil.yaml").symlink_to(secret_epic)
    (sprint_dir / "initiative-evil.yaml").symlink_to(secret_init)
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42"})

    files = _discover_files(tmp_path)

    assert_contained([p.resolve() for p in files], sprint_dir, "_discover_files globs")
    assert any(p.name == "epic-42.yaml" for p in files), f"benign shard lost: {files}"


# ===========================================================================
# DELIVERABLE B — story_add.add_initiative_story (read AND write)
# ===========================================================================


def test_add_initiative_story_rejects_traversal_slug(tmp_path, monkeypatch, opened):
    """A traversal initiative slug must not read — or WRITE — outside sprint/.

    RED: ``init_path = root/"sprint"/f"initiative-{slug}.yaml"``
    (story_add.py ~244) interpolates the slug with no validation, so
    ``slug="link/initiative-target"`` routes through the in-dir symlink; the
    outside file is read, mutated and dumped back — an out-of-bounds WRITE.
    """
    from pf.common import config as pf_config
    from pf.sprint.story_add import add_initiative_story

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "initiative-target.yaml"
    _write_yaml(secret, {"name": "victim", "total_points": 0, "standalone_stories": []})
    (sprint_dir / "initiative-link").symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)
    before = secret.read_text(encoding="utf-8")

    result = add_initiative_story("link/initiative-target", "Pwned story", 1)

    assert secret.read_text(encoding="utf-8") == before, (
        f"path traversal: out-of-sprint initiative file was REWRITTEN: {secret}"
    )
    assert_contained(opened, sprint_dir, "add_initiative_story slug")
    assert result.get("success") is not True, f"traversal slug accepted: {result}"


def test_add_initiative_story_still_adds_to_benign_initiative(tmp_path, monkeypatch):
    """Preservation guard: a normal slug must still append a story."""
    from pf.common import config as pf_config
    from pf.sprint.story_add import add_initiative_story

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(
        sprint_dir / "initiative-debt.yaml",
        {"name": "debt", "total_points": 0, "standalone_stories": []},
    )
    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)

    result = add_initiative_story("debt", "Real story", 2)

    assert result.get("success") is True, result
    data = yaml.safe_load((sprint_dir / "initiative-debt.yaml").read_text())
    assert [s["title"] for s in data["standalone_stories"]] == ["Real story"]
    assert data["total_points"] == 2


# ===========================================================================
# DELIVERABLE B — findings/aggregate.py (×4)
# ===========================================================================


def _archive_index(epics: list[str], stories: list[dict]) -> dict:
    return {
        "sprint": {"number": 9001},
        "completed_epics": epics,
        "completed_stories": stories,
    }


def test_collect_done_stories_rejects_traversal_completed_epic_ref(escaping_archive, opened):
    """``completed_epics`` ref → archive shard read must be contained.

    RED: findings/aggregate.py:93 builds ``archive_dir/f"epic-{ref}.yaml"`` raw
    and opens it, leaking out-of-archive story ids + Jira keys into the sprint
    findings report.
    """
    from pf.findings.aggregate import _collect_done_stories

    root, archive_dir, secret = escaping_archive
    _write_yaml(archive_dir / "sprint-9001-completed.yaml", _archive_index([TRAVERSAL_REF], []))

    stories = _collect_done_stories(root, 9001)

    assert secret.resolve() not in opened, f"read out-of-archive shard {secret}"
    assert_contained(opened, root / "sprint", "aggregate completed_epics ref")
    assert "PWN-2" not in stories, f"out-of-archive story leaked: {stories}"


def test_find_jira_key_in_shard_rejects_traversal_epic_ref(escaping_archive, opened):
    """``_find_jira_key_in_shard``'s shard build must be contained.

    RED: findings/aggregate.py:135 is a second raw ``epic-{ref}.yaml`` build,
    reached from every ``completed_stories`` row's ``epic`` field.
    """
    from pf.findings.aggregate import _find_jira_key_in_shard

    _root, archive_dir, secret = escaping_archive

    key = _find_jira_key_in_shard(archive_dir, TRAVERSAL_REF, "PWNED-1")

    assert secret.resolve() not in opened, f"read out-of-archive shard {secret}"
    assert key == "", f"leaked jira key from out-of-archive shard: {key!r}"


def test_collect_done_stories_rejects_traversal_string_epic_ref(escaping_sprint, opened):
    """Current-sprint STRING epic ref → sprint shard read must be contained.

    RED: findings/aggregate.py:117 (``sprint_dir/f"epic-{ref}.yaml"``).
    """
    from pf.findings.aggregate import _collect_done_stories

    root, sprint_dir, secret = escaping_sprint
    _write_yaml(sprint_dir / "current-sprint.yaml", {"epics": [TRAVERSAL_REF]})

    stories = _collect_done_stories(root, 9001)

    assert secret.resolve() not in opened, f"read out-of-sprint shard {secret}"
    assert_contained(opened, sprint_dir, "aggregate string epic ref")
    assert "PWN-2" not in stories, f"out-of-sprint story leaked: {stories}"


def test_collect_done_stories_rejects_traversal_dict_epic_ref(escaping_sprint, opened):
    """Current-sprint DICT epic ref (``jira``/``id`` fallback) must be contained.

    RED: findings/aggregate.py:119 —
    ``f"epic-{ref.get('jira', ref.get('id',''))}.yaml"`` — a fourth raw build,
    and the one that reads an attacker-friendly ``id`` fallback.
    """
    from pf.findings.aggregate import _collect_done_stories

    root, sprint_dir, secret = escaping_sprint
    _write_yaml(sprint_dir / "current-sprint.yaml", {"epics": [{"id": TRAVERSAL_REF}]})

    stories = _collect_done_stories(root, 9001)

    assert secret.resolve() not in opened, f"read out-of-sprint shard {secret}"
    assert_contained(opened, sprint_dir, "aggregate dict epic ref")
    assert "PWN-2" not in stories, f"out-of-sprint story leaked: {stories}"


def test_collect_done_stories_still_collects_benign_shard(escaping_sprint, opened):
    """Preservation guard: a benign in-sprint shard must still be collected."""
    from pf.findings.aggregate import _collect_done_stories

    root, sprint_dir, _secret = escaping_sprint
    _write_yaml(
        sprint_dir / "epic-42.yaml",
        {"id": "42", "stories": [{"id": "42-1", "status": "done", "jira": "OP-9"}]},
    )
    _write_yaml(sprint_dir / "current-sprint.yaml", {"epics": ["42"]})

    stories = _collect_done_stories(root, 9001)

    assert "OP-9" in stories, f"benign shard story lost: {stories}"


# ===========================================================================
# DELIVERABLE B — sprint/cli.py initiative glob + shard build
# ===========================================================================


def test_resolve_epic_ref_rejects_traversal_ref(escaping_sprint, opened):
    """``_resolve_epic_ref`` must not read an out-of-sprint shard.

    RED: it routes through ``_epic_shard_path`` (sprint/cli.py:654), a raw
    ``epic-{ref}.yaml`` build with no containment check, then opens whatever
    ``.exists()`` says is there.
    """
    from pf.sprint.cli import _resolve_epic_ref

    _root, sprint_dir, secret = escaping_sprint

    resolved = _resolve_epic_ref(TRAVERSAL_REF, sprint_dir)

    assert secret.resolve() not in opened, f"read out-of-sprint shard {secret}"
    assert_contained(opened, sprint_dir, "_resolve_epic_ref shard build")
    assert resolved is None, f"out-of-sprint epic data leaked: {resolved}"


def test_resolve_epic_ref_still_resolves_benign_ref(escaping_sprint):
    """Preservation guard: a benign ref must still resolve from its shard."""
    from pf.sprint.cli import _resolve_epic_ref

    _root, sprint_dir, _secret = escaping_sprint
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42", "title": "Real"})

    assert _resolve_epic_ref("42", sprint_dir) == {"id": "42", "title": "Real"}


def test_find_epic_in_initiatives_rejects_escaping_initiative_glob(tmp_path, opened):
    """The initiative glob loop must not read a symlinked-out initiative file.

    RED: sprint/cli.py's four ``glob("initiative-*.yaml")`` loops (~673, ~792,
    ~1077, ~2005) are all unguarded; a glob match is a NAME match, so an in-dir
    symlink pointing outside is opened and its epic list is trusted.
    """
    from pf.sprint.cli import _find_epic_in_initiatives

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "secret-init.yaml"
    _write_yaml(secret, {"name": "PWNED", "epics": [{"id": "99", "title": "LEAKED"}]})
    (sprint_dir / "initiative-evil.yaml").symlink_to(secret)

    epic, source = _find_epic_in_initiatives("99", tmp_path)

    assert secret.resolve() not in opened, f"read out-of-sprint initiative {secret}"
    assert_contained(opened, sprint_dir, "_find_epic_in_initiatives glob")
    assert epic is None, f"out-of-sprint epic leaked: {epic} (source={source})"


def test_find_epic_in_initiatives_still_finds_benign_epic(tmp_path):
    """Preservation guard: an in-dir initiative must still resolve its epic."""
    from pf.sprint.cli import _find_epic_in_initiatives

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(
        sprint_dir / "initiative-debt.yaml",
        {"name": "debt", "epics": [{"id": "88", "title": "Real"}]},
    )

    epic, source = _find_epic_in_initiatives("88", tmp_path)

    assert epic == {"id": "88", "title": "Real"}, epic
    assert "debt" in str(source)


# ===========================================================================
# DELIVERABLE B — epic_reindex.reindex_epic
# ===========================================================================


def test_reindex_epic_rejects_traversal_shard_ref(escaping_sprint, opened):
    """``reindex_epic`` must not read — or adopt — an out-of-sprint shard.

    RED: epic_reindex.py:39 builds ``sprint_dir/f"epic-{shard_ref}.yaml"`` raw
    from a CLI argument and reads it; on the non-dry-run path it then appends
    the traversal ref to the sprint index, persisting the escape.
    """
    from pf.sprint.epic_reindex import reindex_epic

    _root, sprint_dir, secret = escaping_sprint
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": []})

    result = reindex_epic(sprint_path, TRAVERSAL_REF, dry_run=True)

    assert secret.resolve() not in opened, f"read out-of-sprint shard {secret}"
    assert_contained(opened, sprint_dir, "reindex_epic shard ref")
    assert result.get("success") is not True, f"traversal ref adopted: {result}"


def test_reindex_epic_still_adopts_benign_orphan(escaping_sprint):
    """Preservation guard: a genuine in-dir orphan shard must still be adopted."""
    from pf.sprint.epic_reindex import reindex_epic

    _root, sprint_dir, _secret = escaping_sprint
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": []})
    _write_yaml(sprint_dir / "epic-77.yaml", {"id": "77", "title": "Orphan"})

    result = reindex_epic(sprint_path, "77", dry_run=True)

    assert result.get("success") is True, result
    assert result["details"]["epic_id"] == "77", result
    assert result["details"]["shard_file"] == "epic-77.yaml", result


# ===========================================================================
# DELIVERABLE B — yaml_io.write_sprint (stale-shard unlink = out-of-bounds DELETE)
# ===========================================================================


def test_write_sprint_stale_shard_cleanup_must_not_delete_outside_sprint_dir(tmp_path):
    """The stale-shard cleanup must never ``unlink()`` outside the sprint dir.

    RED: ``write_sprint`` builds ``old_indexed`` from the ON-DISK index refs
    with a raw interpolation (yaml_io.py:420 — no ``_get_epic_ref``, no
    containment), then unconditionally ``stale.unlink()``s anything in
    ``old_indexed - written_shards`` (yaml_io.py:448-450). A traversal ref left
    in the index therefore DELETES an arbitrary out-of-sprint file — worse than
    the out-of-bounds write this story was filed for.
    """
    from pf.sprint.yaml_io import write_sprint

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(secret, {"id": "PWNED", "title": "DO NOT DELETE"})
    (sprint_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42", "title": "Real"})

    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": ["42", TRAVERSAL_REF]})

    write_sprint(sprint_path, {"sprint": {"number": 9001}, "epics": [{"id": "42"}]})

    assert secret.exists(), (
        f"path traversal: out-of-sprint file DELETED by stale-shard cleanup: {secret}"
    )


def test_write_sprint_still_deletes_genuinely_stale_in_dir_shard(tmp_path):
    """Preservation guard: an in-dir shard dropped from the index is still removed."""
    from pf.sprint.yaml_io import write_sprint

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42"})
    stale = sprint_dir / "epic-99.yaml"
    _write_yaml(stale, {"id": "99"})
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": ["42", "99"]})

    write_sprint(sprint_path, {"sprint": {"number": 9001}, "epics": [{"id": "42"}]})

    assert not stale.exists(), "genuinely stale in-dir shard was not cleaned up"
    assert (sprint_dir / "epic-42.yaml").exists()


def test_write_sprint_shard_write_stays_inside_sprint_dir(tmp_path):
    """Pin: the shard WRITE must not follow an escaping symlink.

    Expected GREEN on HEAD — ``_get_epic_ref`` charset-validates the ref (so no
    ``/`` can appear) and ``_write_yaml_file`` uses ``os.replace``, which
    replaces the symlink itself rather than writing through it. Pinned so the
    Deliverable-A refactor cannot regress it into a real out-of-bounds write.
    """
    from pf.sprint.yaml_io import write_sprint

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "target.yaml"
    _write_yaml(secret, {"id": "PWNED", "title": "DO NOT OVERWRITE"})
    before = secret.read_text(encoding="utf-8")
    (sprint_dir / "epic-42.yaml").symlink_to(secret)
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": ["42"]})

    write_sprint(
        sprint_path,
        {"sprint": {"number": 9001}, "epics": [{"id": "42", "title": "Real"}]},
    )

    assert secret.read_text(encoding="utf-8") == before, (
        f"path traversal: wrote through an escaping shard symlink to {secret}"
    )


# ===========================================================================
# DELIVERABLE B — epic_add.add_epic (expected GREEN pin: already charset-guarded)
# ===========================================================================


@pytest.mark.parametrize("hostile", [TRAVERSAL_REF, "../../../pwned", "a..b"])
def test_add_epic_rejects_traversal_epic_id(tmp_path, hostile):
    """Pin: ``add_epic`` fails closed on a traversal epic id.

    Expected GREEN on HEAD — epic_add.py:88 builds its shard path from
    ``_get_epic_ref``, which delegates to ``validate_shard_filename`` (164-3).
    Pinned so routing this site through ``safe_ref_path`` preserves the
    result-object contract (``{success: False, error}``, not a raised
    ``ValueError``) at the CLI boundary.
    """
    from pf.sprint.epic_add import add_epic

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": []})

    result = add_epic(sprint_path, hostile, "Hostile epic")

    assert result.get("success") is not True, f"traversal epic id accepted: {result}"
    escapees = [p for p in tmp_path.rglob("*.yaml") if "outside" in str(p)]
    assert escapees == [], f"wrote outside the sprint dir: {escapees}"


# ===========================================================================
# DELIVERABLE C — ws_push's three SILENT skip sites must warn
# ===========================================================================


@pytest.fixture
def ws_push_project(tmp_path, monkeypatch):
    """Point ``ws_push.fetch_sprint`` at ``tmp_path`` and return its dirs."""
    from pf.frame import ws_push

    sprint_dir = tmp_path / "sprint"
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setattr(ws_push, "_get_project_dir", lambda: str(tmp_path))
    return tmp_path, sprint_dir, archive_dir, outside


def test_ws_push_warns_when_skipping_escaping_sprint_ref(ws_push_project):
    """Site 1 (ws_push.py ~367, the ``ref_by_id`` pre-merge loop) must warn.

    RED: it ``continue``s silently. The index's first entry is an inline dict so
    ``merge_epic_shards`` early-returns without emitting its own warning —
    isolating this site as the only possible source of the warning.
    """
    from pf.frame.ws_push import fetch_sprint

    _root, sprint_dir, _archive_dir, outside = ws_push_project
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(secret, {"id": "PWNED", "title": "LEAKED"})
    (sprint_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    _write_yaml(
        sprint_dir / "current-sprint.yaml",
        {
            "sprint": {"number": 9001},
            "epics": [{"id": "inline", "title": "Inline"}, TRAVERSAL_REF],
        },
    )

    with warnings.catch_warnings(record=True) as records:
        warnings.simplefilter("always")
        payload = fetch_sprint()

    assert _warned_about(records, "epic-PWNED"), (
        f"skipped escaping sprint ref silently; warnings seen: {[str(r.message) for r in records]}"
    )
    ids = [e.get("id") for e in payload.get("epics", [])]
    assert "PWNED" not in ids, f"out-of-sprint epic leaked into payload: {ids}"


def test_ws_push_warns_when_skipping_escaping_archive_index(ws_push_project):
    """Site 2 (ws_push.py ~416, the ``sprint-*-completed.yaml`` glob) must warn.

    RED: silent ``continue``. Nothing else in ``fetch_sprint`` touches this
    glob, so any warning naming the file is attributable to this site.
    """
    from pf.frame.ws_push import fetch_sprint

    _root, sprint_dir, archive_dir, outside = ws_push_project
    _write_yaml(sprint_dir / "current-sprint.yaml", {"sprint": {"number": 9001}})
    secret = outside / "stolen.yaml"
    _write_yaml(
        secret,
        {
            "sprint": {"number": 9001},
            "completed_epics": [],
            "completed_stories": [{"id": "PWNED-1", "status": "done"}],
        },
    )
    (archive_dir / "sprint-9001-completed.yaml").symlink_to(secret)

    with warnings.catch_warnings(record=True) as records:
        warnings.simplefilter("always")
        fetch_sprint()

    assert _warned_about(records, "sprint-9001-completed.yaml"), (
        "skipped escaping archive index silently; warnings seen: "
        f"{[str(r.message) for r in records]}"
    )


def test_ws_push_warns_when_skipping_escaping_archive_shard_ref(ws_push_project):
    """Site 3 (ws_push.py ~427, the ``completed_epics`` ref build) must warn.

    RED: silent ``continue``. The archive index itself is a real in-dir file,
    so site 2 passes and only site 3 can produce the warning.
    """
    from pf.frame.ws_push import fetch_sprint

    _root, sprint_dir, archive_dir, outside = ws_push_project
    _write_yaml(sprint_dir / "current-sprint.yaml", {"sprint": {"number": 9001}})
    secret = outside / "epic-PWNED.yaml"
    _write_yaml(secret, {"id": "PWNED", "title": "LEAKED", "stories": []})
    (archive_dir / "epic-link").symlink_to(outside, target_is_directory=True)
    _write_yaml(
        archive_dir / "sprint-9001-completed.yaml",
        {
            "sprint": {"number": 9001},
            "completed_epics": [TRAVERSAL_REF],
            "completed_stories": [],
        },
    )

    with warnings.catch_warnings(record=True) as records:
        warnings.simplefilter("always")
        payload = fetch_sprint()

    assert _warned_about(records, "epic-PWNED"), (
        "skipped escaping archive shard ref silently; warnings seen: "
        f"{[str(r.message) for r in records]}"
    )
    ids = [e.get("id") for e in payload.get("completedEpics", [])]
    assert "PWNED" not in ids, f"out-of-archive epic leaked into payload: {ids}"


# ===========================================================================
# DELIVERABLE D — migrate_completed_archive positive path
# ===========================================================================


def test_migrate_completed_archive_positive_path(tmp_path):
    """A well-formed monolithic archive must still migrate to index+shard form.

    The sweep's guards must not regress the happy path: inline stories are
    grouped by epic, written to per-epic shards, and removed from the index
    (orphans stay).
    """
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["42", "77"],
            "completed_stories": [
                {"id": "42-1", "epic": "42", "title": "A", "points": 1},
                {"id": "42-2", "epic": "42", "title": "B", "points": 2},
                {"id": "77-1", "epic": "77", "title": "C", "points": 3},
                {"id": "loose-1", "epic": "unindexed", "title": "D", "points": 1},
            ],
        },
    )

    result = migrate_completed_archive(archive_path)

    assert result["success"] is True, result
    assert result["shards_created"] == 2, result
    assert result["stories_migrated"] == 3, result

    shard_42 = yaml.safe_load((archive_dir / "epic-42.yaml").read_text())
    assert [s["id"] for s in shard_42["stories"]] == ["42-1", "42-2"], shard_42
    shard_77 = yaml.safe_load((archive_dir / "epic-77.yaml").read_text())
    assert [s["id"] for s in shard_77["stories"]] == ["77-1"], shard_77

    index = yaml.safe_load(archive_path.read_text())
    assert [s["id"] for s in index["completed_stories"]] == ["loose-1"], index
    assert index["completed_epics"] == ["42", "77"], index


def test_migrate_completed_archive_merges_into_existing_shard(tmp_path):
    """Positive path, second flavour: an existing shard is merged, not clobbered."""
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    _write_yaml(
        archive_dir / "epic-42.yaml",
        {
            "jira": "42",
            "status": "done",
            "stories": [{"id": "42-0", "status": "done"}],
        },
    )
    archive_path = archive_dir / "sprint-9001-completed.yaml"
    _write_yaml(
        archive_path,
        {
            "sprint": {"number": 9001},
            "completed_epics": ["42"],
            "completed_stories": [{"id": "42-1", "epic": "42", "title": "A"}],
        },
    )

    result = migrate_completed_archive(archive_path)

    assert result["success"] is True, result
    assert result["shards_created"] == 0, result
    shard = yaml.safe_load((archive_dir / "epic-42.yaml").read_text())
    assert [s["id"] for s in shard["stories"]] == ["42-0", "42-1"], shard


# ===========================================================================
# Regression pins — the accidental safety of bare lexical refs must survive
# ===========================================================================


@pytest.mark.parametrize("ref", LEXICAL_REFS)
def test_lexical_refs_stay_contained_in_findings_aggregate(tmp_path, opened, ref):
    """Regression pin: bare lexical traversal refs never escape (green today).

    ``epic-../../x.yaml`` needs a real dir named ``epic-..``; prefix-gluing plus
    ``.exists()`` gates it out. Adding ``resolve()`` containment must not turn
    this into a leak.
    """
    from pf.findings.aggregate import _collect_done_stories

    sprint_dir = tmp_path / "deep" / "sprint"
    (sprint_dir / "archive").mkdir(parents=True)
    _write_yaml(sprint_dir / "current-sprint.yaml", {"epics": [ref]})

    stories = _collect_done_stories(tmp_path / "deep", 9001)

    assert_contained(opened, sprint_dir, f"aggregate lexical ref {ref!r}")
    assert stories == {}, f"lexical ref {ref!r} leaked stories: {stories}"


# ===========================================================================
# ROUND 2 — sprint/cli.py's `initiative-{name}.yaml` sites
#
# Reviewer DEMONSTRATED these two live at the end of round 1: the round-1 sweep
# guarded `_epic_shard_path` and the four `initiative-*.yaml` GLOBS but missed
# the two direct `initiative-{name}.yaml` INTERPOLATIONS driven by a raw CLI
# argument — the identical shape already guarded in ``story_add.py``.
# ===========================================================================


@pytest.fixture
def escaping_initiative(tmp_path, monkeypatch):
    """sprint/ with an ``initiative-pwned.yaml`` symlink pointing outside.

    ``name="pwned"`` is charset-CLEAN, so only ``resolve()`` containment catches
    it. Returns (root, sprint_dir, secret).
    """
    from pf.common import config as pf_config

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "target.yaml"
    _write_yaml(
        secret,
        {
            "name": "victim",
            "status": "active",
            "description": "TOP SECRET INITIATIVE",
            "epics": [{"id": "99", "title": "LEAKED_EPIC", "stories": []}],
            "standalone_stories": [{"id": "v-1", "title": "LEAKED_STORY"}],
        },
    )
    (sprint_dir / "initiative-pwned.yaml").symlink_to(secret)
    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)
    return tmp_path, sprint_dir, secret


def test_initiative_cancel_must_not_write_outside_sprint_dir(escaping_initiative):
    """[CRITICAL] ``initiative cancel`` must not REWRITE an out-of-sprint file.

    RED: ``init_file = sprint_dir / f"initiative-{name}.yaml"`` (cli.py ~1389)
    is built from a raw CLI argument with no containment check, and the command
    ends in ``open(init_file, "w")`` (~1474). ``pf sprint initiative cancel
    pwned`` therefore rewrote the OUTSIDE file to ``status: canceled`` and
    exited 0 — an out-of-bounds WRITE through an in-sprint symlink.
    """
    from click.testing import CliRunner

    from pf.sprint.cli import initiative_cancel

    _root, _sprint_dir, secret = escaping_initiative
    before = secret.read_text(encoding="utf-8")

    result = CliRunner().invoke(initiative_cancel, ["pwned"])

    assert secret.read_text(encoding="utf-8") == before, (
        f"path traversal: out-of-sprint initiative file was REWRITTEN: {secret}"
    )
    assert result.exit_code != 0, f"traversal initiative name accepted (exit 0): {result.output}"


def test_initiative_show_must_not_read_outside_sprint_dir(escaping_initiative, opened):
    """[HIGH] ``initiative show`` must not READ an out-of-sprint file.

    RED: the same unguarded ``initiative-{name}.yaml`` build (cli.py ~1303);
    ``--json`` then printed the outside file's contents verbatim.
    """
    from click.testing import CliRunner

    from pf.sprint.cli import initiative_show

    _root, sprint_dir, secret = escaping_initiative

    result = CliRunner().invoke(initiative_show, ["pwned", "--json"])

    assert secret.resolve() not in opened, f"read out-of-sprint initiative {secret}"
    assert_contained(opened, sprint_dir, "initiative_show name")
    assert "TOP SECRET INITIATIVE" not in result.output, (
        f"out-of-sprint initiative contents leaked: {result.output}"
    )
    assert "LEAKED_EPIC" not in result.output, f"leaked epic: {result.output}"
    assert result.exit_code != 0, f"traversal initiative name accepted (exit 0): {result.output}"


def test_initiative_show_still_shows_benign_initiative(tmp_path, monkeypatch):
    """Preservation guard: a normal initiative name must still render."""
    from click.testing import CliRunner

    from pf.common import config as pf_config
    from pf.sprint.cli import initiative_show

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(
        sprint_dir / "initiative-debt.yaml",
        {"name": "debt", "status": "active", "total_points": 5, "epics": []},
    )
    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)

    result = CliRunner().invoke(initiative_show, ["debt"])

    assert result.exit_code == 0, result.output
    assert "debt" in result.output


def test_initiative_cancel_still_cancels_benign_initiative(tmp_path, monkeypatch):
    """Preservation guard: a normal initiative must still be canceled + written."""
    from click.testing import CliRunner

    from pf.common import config as pf_config
    from pf.sprint.cli import initiative_cancel

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    init_file = sprint_dir / "initiative-debt.yaml"
    _write_yaml(
        init_file,
        {
            "name": "debt",
            "status": "active",
            "epics": [{"id": "88", "title": "Real", "stories": [{"id": "88-1"}]}],
            "standalone_stories": [{"id": "s-1", "title": "Loose"}],
        },
    )
    monkeypatch.setattr(pf_config, "get_project_root", lambda: tmp_path)

    result = CliRunner().invoke(initiative_cancel, ["debt"])

    assert result.exit_code == 0, result.output
    data = yaml.safe_load(init_file.read_text())
    assert data["status"] == "canceled", data
    assert data["epics"][0]["status"] == "canceled", data
    assert data["standalone_stories"][0]["status"] == "canceled", data


# ===========================================================================
# ROUND 2 — yaml_io.write_sprint's string-ref branch must not persist an
# unvalidated ref back into the sprint index
# ===========================================================================


def test_write_sprint_does_not_persist_unvalidated_string_ref(tmp_path):
    """A traversal STRING ref must not be written back into the sprint index.

    RED: the ``else`` branch of ``write_sprint``'s epic loop passes a raw string
    ref straight into ``epic_refs`` (and builds a ``written_shards`` path from
    it) with no validation, so a hostile ref round-trips into
    ``current-sprint.yaml`` and lies in wait for the next reader.
    """
    from pf.sprint.yaml_io import write_sprint

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    _write_yaml(sprint_dir / "epic-42.yaml", {"id": "42"})
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml(sprint_path, {"sprint": {"number": 9001}, "epics": ["42"]})

    write_sprint(
        sprint_path,
        {"sprint": {"number": 9001}, "epics": ["42", TRAVERSAL_REF]},
    )

    persisted = yaml.safe_load(sprint_path.read_text())["epics"]
    assert TRAVERSAL_REF not in persisted, (
        f"unvalidated traversal ref persisted into the sprint index: {persisted}"
    )
    assert "42" in persisted, f"benign string ref lost: {persisted}"
