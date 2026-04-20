"""Tests for 151-2: fail loud on missing `epic` field during archive write,
plus a backfill helper that repairs historical archive entries.

Spec (from .session/151-2-session.md):

1. Archive-write helpers must raise a descriptive error when a completed-story
   entry lacks a usable ``epic`` reference (missing key or empty string).
   Silent fallbacks today cause such stories to be mis-grouped as orphans
   during shard migration or written with empty ``epic:`` lines, masking
   misconfigured finish flows.

2. A ``backfill_epic_refs`` helper walks the sprint archive (index file plus
   per-epic shards) and resolves missing ``epic`` fields from the live sprint
   YAML (by story-id lookup in each epic's ``stories`` list). Entries that
   cannot be resolved are reported as irrecoverable rather than silently
   patched.

Proposed Dev API (Dev may propose alternative shapes via consultation):

    # pf/sprint/archive_epic.py
    _write_archive_file(path, data)
        raises ValueError if any completed_stories entry has no ``epic``
        field or an empty ``epic`` value. Message must name the offending
        story id(s).

    backfill_epic_refs(project_root: Path | None = None) -> dict[str, Any]
        returns {"success": bool, "backfilled": [...], "irrecoverable": [...]}
        walking sprint/archive/sprint-*-completed.yaml entries.
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive_epic import _write_archive_file
from pf.sprint.yaml_io import _write_yaml_file


@pytest.fixture
def archive_tree(tmp_path: Path) -> Path:
    """Minimal sprint tree with an archive directory and active-sprint YAML."""
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
                "jira": "MSSCI-17079",
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


# --- _write_archive_file: fail loud on missing epic --------------------------


def test_write_archive_file_raises_when_completed_story_lacks_epic(
    archive_tree: Path,
) -> None:
    """Writing an archive with a completed-story entry missing `epic` must raise."""
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    data: dict[str, Any] = {
        "sprint": {"name": "TO Sprint 2610", "number": 2610},
        "completed_epics": [],
        "completed_stories": [
            {
                "id": "orphan-1",
                "title": "Story with no epic reference",
                "points": 1,
                "completed": "2026-04-10",
                # epic field intentionally omitted
            },
        ],
    }

    with pytest.raises(ValueError, match=r"(?i)(missing|without).*epic.*orphan-1"):
        _write_archive_file(archive_path, data)


def test_write_archive_file_raises_when_completed_story_has_empty_epic(
    archive_tree: Path,
) -> None:
    """Empty-string ``epic`` must also fail loud — it's semantically the same as missing."""
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    data: dict[str, Any] = {
        "sprint": {"name": "TO Sprint 2610", "number": 2610},
        "completed_epics": [],
        "completed_stories": [
            {
                "id": "empty-epic-1",
                "epic": "",
                "title": "Story with empty epic",
                "points": 1,
                "completed": "2026-04-10",
            },
        ],
    }

    with pytest.raises(ValueError, match=r"(?i)(empty|without).*epic.*empty-epic-1"):
        _write_archive_file(archive_path, data)


def test_write_archive_file_succeeds_when_every_story_has_epic(
    archive_tree: Path,
) -> None:
    """Baseline: well-formed data must write without error (no regression)."""
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    data: dict[str, Any] = {
        "sprint": {"name": "TO Sprint 2610", "number": 2610},
        "completed_epics": ["MSSCI-17079"],
        "completed_stories": [
            {
                "id": "151-2",
                "epic": "MSSCI-17079",
                "title": "Fail loud on epic",
                "points": 3,
                "completed": "2026-04-20",
            },
        ],
    }

    _write_archive_file(archive_path, data)

    assert archive_path.exists()
    content = archive_path.read_text()
    assert "151-2" in content
    assert "MSSCI-17079" in content


def test_write_archive_file_error_names_all_offending_stories(
    archive_tree: Path,
) -> None:
    """When multiple stories lack `epic`, the error should name every one of them."""
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    data: dict[str, Any] = {
        "sprint": {"name": "TO Sprint 2610", "number": 2610},
        "completed_epics": [],
        "completed_stories": [
            {"id": "alpha-1", "title": "no epic", "points": 1},
            {"id": "beta-2", "epic": "", "title": "empty epic", "points": 1},
            {"id": "gamma-3", "epic": "MSSCI-17079", "title": "ok", "points": 1},
        ],
    }

    with pytest.raises(ValueError) as exc:
        _write_archive_file(archive_path, data)

    msg = str(exc.value)
    assert "alpha-1" in msg
    assert "beta-2" in msg
    assert "gamma-3" not in msg


# --- backfill_epic_refs: repair historical archive entries -------------------


def _write_archive(archive_tree: Path, completed_stories: list[dict[str, Any]]) -> Path:
    """Write a minimal archive file bypassing the new validation for fixtures."""
    archive_path = archive_tree / "sprint" / "archive" / "sprint-2610-completed.yaml"
    body_lines = [
        "sprint:",
        "  name: TO Sprint 2610",
        "  number: 2610",
        "completed_epics: []",
        "completed_stories:",
    ]
    for story in completed_stories:
        body_lines.append(f"  - id: {story['id']}")
        if "epic" in story:
            body_lines.append(f"    epic: {story['epic']}")
        body_lines.append(f"    title: \"{story.get('title', '')}\"")
        body_lines.append(f"    points: {story.get('points', 0)}")
    archive_path.write_text("\n".join(body_lines) + "\n")
    return archive_path


def test_backfill_epic_refs_resolves_missing_epic_from_sprint(
    archive_tree: Path,
) -> None:
    """Missing ``epic`` on an archived story present in the live sprint yaml
    should be backfilled from the parent epic."""
    from pf.sprint.archive_epic import backfill_epic_refs  # type: ignore[attr-defined]

    archive_path = _write_archive(
        archive_tree,
        [
            {"id": "151-2", "title": "Fail loud on epic", "points": 3},  # no epic
        ],
    )

    result = backfill_epic_refs(project_root=archive_tree)

    assert result.get("success") is True, f"expected success, got {result}"
    backfilled = result.get("backfilled") or []
    irrecoverable = result.get("irrecoverable") or []

    assert len(backfilled) == 1, f"expected 1 backfilled, got {backfilled}"
    assert backfilled[0]["id"] == "151-2"
    assert backfilled[0]["epic"] == "MSSCI-17079"
    assert irrecoverable == []

    # Archive file should now contain the resolved epic
    content = archive_path.read_text()
    assert "MSSCI-17079" in content


def test_backfill_epic_refs_reports_irrecoverable(archive_tree: Path) -> None:
    """A story with missing epic that cannot be found anywhere should be
    reported as irrecoverable, not silently patched."""
    from pf.sprint.archive_epic import backfill_epic_refs  # type: ignore[attr-defined]

    _write_archive(
        archive_tree,
        [
            {"id": "ghost-99", "title": "Not in sprint", "points": 1},
        ],
    )

    result = backfill_epic_refs(project_root=archive_tree)

    backfilled = result.get("backfilled") or []
    irrecoverable = result.get("irrecoverable") or []

    assert backfilled == []
    assert len(irrecoverable) == 1
    assert irrecoverable[0]["id"] == "ghost-99"


def test_backfill_epic_refs_is_idempotent_on_clean_archive(
    archive_tree: Path,
) -> None:
    """A clean archive (every entry has `epic`) should report zero work."""
    from pf.sprint.archive_epic import backfill_epic_refs  # type: ignore[attr-defined]

    _write_archive(
        archive_tree,
        [
            {"id": "151-2", "epic": "MSSCI-17079", "title": "ok", "points": 3},
        ],
    )

    result = backfill_epic_refs(project_root=archive_tree)

    assert result.get("success") is True
    assert (result.get("backfilled") or []) == []
    assert (result.get("irrecoverable") or []) == []


# --- CLI smoke ---------------------------------------------------------------


def test_cli_backfill_epics_reports_resolution(
    archive_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`pf sprint backfill-epics` wraps the helper, prints a human summary,
    and exits zero when every missing epic is resolved."""
    from click.testing import CliRunner

    from pf.sprint.cli import sprint as sprint_cli

    _write_archive(
        archive_tree,
        [
            {"id": "151-2", "title": "no epic yet", "points": 3},
        ],
    )

    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(archive_tree)
    monkeypatch.setenv("PROJECT_ROOT", str(archive_tree))

    runner = CliRunner()
    result = runner.invoke(sprint_cli, ["backfill-epics"])

    assert result.exit_code == 0, result.output
    assert "Backfilled: 1" in result.output
    assert "151-2" in result.output
    assert "MSSCI-17079" in result.output
    assert "Irrecoverable: 0" in result.output


def test_cli_backfill_epics_exits_nonzero_on_irrecoverable(
    archive_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exit non-zero when any archive entry cannot be backfilled."""
    from click.testing import CliRunner

    from pf.sprint.cli import sprint as sprint_cli

    _write_archive(
        archive_tree,
        [
            {"id": "ghost-99", "title": "not in sprint", "points": 1},
        ],
    )

    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(archive_tree)
    monkeypatch.setenv("PROJECT_ROOT", str(archive_tree))

    runner = CliRunner()
    result = runner.invoke(sprint_cli, ["backfill-epics"])

    assert result.exit_code != 0
    assert "ghost-99" in result.output
    assert "Irrecoverable: 1" in result.output
