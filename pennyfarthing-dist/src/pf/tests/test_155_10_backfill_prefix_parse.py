"""Tests for 155-10: prefix-parse migration mode for historical archive rows.

Spec (155-4 AC3 follow-up; see sprint/context/context-story-155-10.md):

``backfill_epic_refs`` resolves empty ``epic: ''`` archive rows ONLY from live
sprint data, so the 77 historical rows in the orchestrator repo's
``sprint/archive/sprint-2610-completed.yaml`` (epics 143/144/145/146/147/148/
150/151 — all long-archived) are marked irrecoverable and the file is never
rewritten. This story adds a one-time prefix-parse migration path
(``144-5`` → epic ``'144'``), guarded so it does NOT weaken the live finish
path's no-prefix-parse rule from 155-4.

Designed interface (Dev may propose alternatives via consultation, but the
guard semantics below are the spec):

    backfill_epic_refs(project_root: Path | None = None, *, prefix_parse: bool = False)
        prefix_parse=False (default): behavior IDENTICAL to today — live-sprint
            lookup only, unresolved rows irrecoverable. The migration must be
            opt-in; an always-on fallback is a silent-fallback regression
            (lang-review silent-exceptions, SOUL "no silent fallbacks").
        prefix_parse=True: for rows still unresolved after the live-sprint
            lookup (live data always wins), derive the epic from the story id
            iff the id matches unambiguous numeric ``{epic}-{seq}``
            (``^\\d+-\\d+$``). Anything else stays irrecoverable
            (lang-review input-validation). Epic is written as a STRING
            (``'144'``), matching the quoted refs the archive format uses.
        The existing all-or-nothing rewrite invariant is unchanged: a file is
        only rewritten when every row resolves, so the rewrite always passes
        the ``_write_archive_file`` non-empty-epic guard.

    CLI: ``pf sprint backfill-epics --prefix-parse`` passes the flag through;
        the default invocation keeps today's fail-loud exit-nonzero contract.

Intentional GREEN-on-arrival guards (logged as TEA Design Deviations — they
pin that the fix cannot over-apply):
  - test_default_mode_numeric_id_stays_irrecoverable
  - test_default_cli_still_exits_nonzero_on_numeric_irrecoverable
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive_epic import _load_archive_file
from pf.sprint.yaml_io import _write_yaml_file


@pytest.fixture
def archive_tree(tmp_path: Path) -> Path:
    """Minimal sprint tree with an archive dir and a live sprint containing
    exactly one resolvable story (151-2 → PROJ-17079), mirroring the fixture
    in test_archive_epic_field_validation.py."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()

    index: dict[str, Any] = {
        "sprint": {
            "name": "TO Sprint 2610",
            "number": 2610,
            "jira_sprint_name": "TO Sprint 2610",
            "status": "active",
        },
        "epics": [
            {
                "id": "epic-151",
                "jira": "PROJ-17079",
                "status": "in_progress",
                "stories": [
                    {"id": "151-2", "title": "Fail loud on epic", "points": 3},
                ],
            },
        ],
        "stories": [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def _write_archive(archive_tree: Path, completed_stories: list[dict[str, Any]]) -> Path:
    """Write a minimal archive file bypassing `_write_archive_file` validation.

    Ids are quoted so YAML cannot reinterpret edge-case ids (`-5`, `144`) as
    numbers.
    """
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    body_lines = [
        "sprint:",
        "  name: TO Sprint 2610",
        "  number: 2610",
        "completed_epics: []",
        "completed_stories:",
    ]
    for story in completed_stories:
        body_lines.append(f"  - id: '{story['id']}'")
        if "epic" in story:
            body_lines.append(f"    epic: {story['epic']}")
        body_lines.append(f"    title: \"{story.get('title', '')}\"")
        body_lines.append(f"    points: {story.get('points', 0)}")
        if "completed" in story:
            body_lines.append(f"    completed: '{story['completed']}'")
    archive_path.write_text("\n".join(body_lines) + "\n")
    return archive_path


def _backfill_prefix(project_root: Path) -> dict[str, Any]:
    """Invoke the designed prefix-parse mode, converting a missing-parameter
    TypeError into an assertion failure (RED for the right reason)."""
    from pf.sprint.archive_epic import backfill_epic_refs

    try:
        return backfill_epic_refs(project_root=project_root, prefix_parse=True)
    except TypeError as exc:
        pytest.fail(
            "backfill_epic_refs does not accept prefix_parse=True yet "
            f"(155-10 designed interface): {exc}"
        )


# --- prefix-parse mode: resolves numeric historical ids ----------------------


def test_prefix_parse_resolves_numeric_historical_ids(archive_tree: Path) -> None:
    """Rows mirroring the real sprint-2610 offenders (numeric {epic}-{seq} ids
    from long-archived epics) must be backfilled from the id prefix, the file
    rewritten, and rows that already carry an epic ref left untouched."""
    archive_path = _write_archive(
        archive_tree,
        [
            {
                "id": "144-5",
                "title": "Add Assumptions section to story context schema",
                "points": 1,
                "completed": "2026-03-13",
            },
            {
                "id": "143-16",
                "title": "BikeRack observability for subagent transitions",
                "points": 3,
                "completed": "2026-03-13",
            },
            {
                "id": "150-3",
                "title": "Historical story from epic 150",
                "points": 2,
                "completed": "2026-03-14",
            },
            {
                "id": "143-14",
                "epic": "PROJ-16358",
                "title": "Tandem mode with native subagents",
                "points": 3,
                "completed": "2026-03-13",
            },
        ],
    )

    result = _backfill_prefix(archive_tree)

    assert result.get("success") is True, f"expected success, got {result}"
    backfilled = {e["id"]: e["epic"] for e in result.get("backfilled") or []}
    assert backfilled == {"144-5": "144", "143-16": "143", "150-3": "150"}, (
        f"expected prefix-parsed epics, got {backfilled}"
    )
    assert (result.get("irrecoverable") or []) == []

    # The file must be rewritten with every row resolved — i.e. the rewrite
    # passed the _write_archive_file non-empty-epic guard.
    data = _load_archive_file(archive_path)
    rows = {s["id"]: s for s in data["completed_stories"]}
    assert rows["144-5"]["epic"] == "144"  # string, matching quoted archive refs
    assert rows["143-16"]["epic"] == "143"
    assert rows["150-3"]["epic"] == "150"
    # Pre-resolved row untouched; payload fields survive the rewrite.
    assert rows["143-14"]["epic"] == "PROJ-16358"
    assert rows["144-5"]["title"] == "Add Assumptions section to story context schema"
    assert rows["144-5"]["points"] == 1


def test_prefix_parse_is_idempotent_after_migration(archive_tree: Path) -> None:
    """A second prefix-parse run over the migrated file reports zero work."""
    _write_archive(
        archive_tree,
        [
            {"id": "144-5", "title": "historical", "points": 1},
        ],
    )

    first = _backfill_prefix(archive_tree)
    assert {e["id"] for e in first.get("backfilled") or []} == {"144-5"}

    second = _backfill_prefix(archive_tree)
    assert second.get("success") is True
    assert (second.get("backfilled") or []) == []
    assert (second.get("irrecoverable") or []) == []


def test_prefix_parse_prefers_live_sprint_resolution(archive_tree: Path) -> None:
    """Live sprint data always wins: 151-2 exists in the live sprint under
    PROJ-17079, so prefix-parse mode must resolve it to the Jira ref — never
    to the bare prefix '151'."""
    archive_path = _write_archive(
        archive_tree,
        [
            {"id": "151-2", "title": "Fail loud on epic", "points": 3},
        ],
    )

    result = _backfill_prefix(archive_tree)

    backfilled = {e["id"]: e["epic"] for e in result.get("backfilled") or []}
    assert backfilled == {"151-2": "PROJ-17079"}, (
        f"live-sprint resolution must take precedence over prefix, got {backfilled}"
    )
    data = _load_archive_file(archive_path)
    assert data["completed_stories"][0]["epic"] == "PROJ-17079"


@pytest.mark.parametrize(
    "bad_id",
    [
        "ghost-99",  # non-numeric prefix
        "144",  # no sequence part
        "144-",  # dangling separator
        "-5",  # no epic part
        "144-x",  # non-numeric sequence
        "144-5-6",  # ambiguous — more than {epic}-{seq}
    ],
)
def test_prefix_parse_rejects_non_conforming_ids(
    archive_tree: Path, bad_id: str
) -> None:
    """Only unambiguous numeric {epic}-{seq} ids qualify for prefix-parse.
    Anything else stays irrecoverable and the file is left untouched
    (lang-review input-validation; all-or-nothing rewrite invariant)."""
    archive_path = _write_archive(
        archive_tree,
        [
            {"id": bad_id, "title": "malformed", "points": 1},
        ],
    )
    before = archive_path.read_text()

    result = _backfill_prefix(archive_tree)

    irrecoverable_ids = {e["id"] for e in result.get("irrecoverable") or []}
    assert irrecoverable_ids == {bad_id}, (
        f"{bad_id!r} must stay irrecoverable under prefix-parse, got {result}"
    )
    assert (result.get("backfilled") or []) == []
    assert archive_path.read_text() == before, (
        f"file must not be rewritten when {bad_id!r} is unresolved"
    )


def test_prefix_parse_mixed_file_keeps_all_or_nothing_rewrite(
    archive_tree: Path,
) -> None:
    """A file containing one prefix-parseable row AND one genuinely
    irrecoverable row must NOT be rewritten — the existing invariant that a
    file only rewrites when every row resolves is unchanged in prefix mode."""
    archive_path = _write_archive(
        archive_tree,
        [
            {"id": "144-5", "title": "historical", "points": 1},
            {"id": "ghost-99", "title": "not parseable", "points": 1},
        ],
    )
    before = archive_path.read_text()

    result = _backfill_prefix(archive_tree)

    irrecoverable_ids = {e["id"] for e in result.get("irrecoverable") or []}
    assert "ghost-99" in irrecoverable_ids
    assert archive_path.read_text() == before, (
        "partially-resolved file must not be rewritten (would fail the "
        "_write_archive_file guard or drop the invariant)"
    )


# --- CLI: --prefix-parse flag ------------------------------------------------


def test_cli_backfill_epics_prefix_parse_flag(
    archive_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`pf sprint backfill-epics --prefix-parse` runs the migration and exits
    zero when every historical row resolves."""
    from click.testing import CliRunner

    from pf.sprint.cli import sprint as sprint_cli

    _write_archive(
        archive_tree,
        [
            {"id": "144-5", "title": "historical", "points": 1},
            {"id": "143-16", "title": "historical", "points": 3},
        ],
    )

    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(archive_tree)
    monkeypatch.setenv("PROJECT_ROOT", str(archive_tree))

    runner = CliRunner()
    result = runner.invoke(sprint_cli, ["backfill-epics", "--prefix-parse"])

    assert result.exit_code == 0, result.output
    assert "Backfilled: 2" in result.output
    assert "144-5" in result.output
    assert "143-16" in result.output
    assert "Irrecoverable: 0" in result.output


# --- guards: the default path must NOT weaken (GREEN on arrival) -------------


def test_default_mode_numeric_id_stays_irrecoverable(archive_tree: Path) -> None:
    """GREEN-on-arrival guard (intentional): without prefix_parse, a numeric
    {epic}-{seq} id absent from the live sprint stays irrecoverable and the
    file is untouched. Goes RED only if Dev makes prefix-parse always-on —
    the 155-4 no-silent-fallback rule."""
    from pf.sprint.archive_epic import backfill_epic_refs

    archive_path = _write_archive(
        archive_tree,
        [
            {"id": "144-5", "title": "historical", "points": 1},
        ],
    )
    before = archive_path.read_text()

    result = backfill_epic_refs(project_root=archive_tree)

    assert (result.get("backfilled") or []) == []
    irrecoverable_ids = {e["id"] for e in result.get("irrecoverable") or []}
    assert irrecoverable_ids == {"144-5"}
    assert archive_path.read_text() == before


def test_default_cli_still_exits_nonzero_on_numeric_irrecoverable(
    archive_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GREEN-on-arrival guard (intentional): the default CLI invocation keeps
    today's fail-loud contract on the same tree the flag would migrate."""
    from click.testing import CliRunner

    from pf.sprint.cli import sprint as sprint_cli

    _write_archive(
        archive_tree,
        [
            {"id": "144-5", "title": "historical", "points": 1},
        ],
    )

    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(archive_tree)
    monkeypatch.setenv("PROJECT_ROOT", str(archive_tree))

    runner = CliRunner()
    result = runner.invoke(sprint_cli, ["backfill-epics"])

    assert result.exit_code != 0
    assert "Irrecoverable: 1" in result.output
    assert "144-5" in result.output
