"""Tests for depends_on validation across ALL story locations.

Story 160-2 (from 156-3 review): ``_validate_depends_on`` — and the
``all_story_ids`` known-ids set that feeds it — only walk ``epics[].stories``.
Stories under ``standalone_stories`` or the top-level ``stories`` list are
never checked, so a dangling ``depends_on`` on such a story passes silently;
and a valid ``depends_on`` pointing AT such a story can false-fail because the
target isn't in the known-ids set.

Two-sided gap in pennyfarthing-dist/src/pf/sprint/validator.py:
  (a) the depends_on WALK skips standalone_stories + top-level stories, and
  (b) the known-ids RESOLUTION SET omits those same locations.
There is also a guard ``if all_story_ids:`` in ``validate_full_sprint`` that
short-circuits depends_on validation entirely when there are no *epic*
stories — so a sprint composed solely of standalone/top-level stories never
runs depends_on validation at all.

The fix (per SM): a single story-iteration helper covering
epics[].stories + standalone_stories + top-level stories (one truth), used
for BOTH the known-ids set and the depends_on walk, while preserving the
160-8 archived-story allowance for all locations.

TDD RED phase: these tests pin the fixed behavior and MUST FAIL against the
current implementation.

Acceptance Criteria:
1. A dangling depends_on on a story in ``standalone_stories`` fails validation.
2. A dangling depends_on on a story in the top-level ``stories`` list fails.
3. depends_on references pointing TO standalone/top-level stories (from any
   location) resolve correctly (no false "non-existent" error).
4. The 160-8 archived-story allowance (deps on completed/archived stories
   don't hard-fail) is preserved for ALL story locations.
5. Existing valid sprint fixtures pass (no regression).
"""

from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

from pf.sprint.validator import (
    ValidationSeverity,
    validate_full_sprint,
)

# =============================================================================
# Fixtures — mirror test_160_8_archived_depends_on.py conventions
# =============================================================================


def _write_archive(archive_dir: Path, completed_ids: list[str]) -> None:
    """Write a sprint-*-completed.yaml archive file with the given story IDs."""
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = {
        "sprint": {
            "name": "TO Sprint 2604",
            "number": 2604,
            "jira_sprint_id": 276,
            "jira_sprint_name": "TO Sprint 2604",
        },
        "completed_stories": [
            {"id": sid, "points": 2, "status": "done", "title": f"Done {sid}"}
            for sid in completed_ids
        ],
    }
    with open(archive_dir / "sprint-2604-completed.yaml", "w") as f:
        yaml.dump(archive, f)


def _sprint_header() -> dict[str, Any]:
    """A minimal valid sprint header."""
    return {
        "name": "TO Sprint 2604",
        "number": 2604,
        "jira_sprint_id": 276,
        "jira_sprint_name": "TO Sprint 2604",
        "goal": "Complete the sprint",
        "start_date": "2026-01-20",
        "end_date": "2026-02-02",
        "status": "active",
    }


def _story(
    sid: str,
    *,
    depends_on: str | None = None,
    status: str = "backlog",
    points: int = 2,
) -> dict[str, Any]:
    """Build a minimal valid story dict."""
    story: dict[str, Any] = {
        "id": sid,
        "title": f"Story {sid}",
        "points": points,
        "status": status,
    }
    if depends_on is not None:
        story["depends_on"] = depends_on
    return story


def _epic(stories: list[dict[str, Any]], eid: str = "epic-160") -> dict[str, Any]:
    """Wrap stories in a minimal valid epic."""
    return {
        "id": eid,
        "type": "epic",
        "title": "Epic: validator hardening",
        "priority": "P1",
        "status": "in_progress",
        "stories": stories,
    }


def _merged_sprint(
    *,
    epic_stories: list[dict[str, Any]] | None = None,
    standalone_stories: list[dict[str, Any]] | None = None,
    top_level_stories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a merged-sprint document spanning any of the three story locations."""
    data: dict[str, Any] = {"sprint": _sprint_header()}
    if epic_stories is not None:
        data["epics"] = [_epic(epic_stories)]
    if standalone_stories is not None:
        data["standalone_stories"] = standalone_stories
    if top_level_stories is not None:
        data["stories"] = top_level_stories
    return data


def _depends_on_errors(result: Any) -> list[Any]:
    """Hard depends_on ERRORs from a ValidationResult."""
    return [
        e
        for e in result.errors
        if e.severity == ValidationSeverity.ERROR and "depends_on" in e.path
    ]


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """A tmp project root; patches archive-loader root resolution to it."""
    (tmp_path / "sprint").mkdir(parents=True, exist_ok=True)
    with patch("pf.sprint.loader.get_project_root", return_value=tmp_path), patch(
        "pf.common.config.get_project_root", return_value=tmp_path
    ):
        yield tmp_path


# =============================================================================
# AC1 — dangling depends_on on a standalone story fails
# =============================================================================


class TestDanglingDepOnStandaloneStoryFails:
    def test_standalone_story_dangling_dep_fails(self, project_root: Path) -> None:
        """AC1: a standalone story's dangling depends_on must ERROR.

        Today it passes silently — the walk never visits standalone_stories.
        """
        data = _merged_sprint(
            epic_stories=[_story("160-1")],  # anchor so all_story_ids is non-empty
            standalone_stories=[_story("160-2", depends_on="ghost-standalone")],
        )

        result = validate_full_sprint(data)

        assert not result.valid, (
            "a dangling depends_on on a standalone_stories story must fail "
            f"validation, got errors: {result.errors}"
        )
        assert any(
            "non-existent" in e.message and "ghost-standalone" in e.message
            for e in result.errors
        ), f"expected non-existent error for standalone dep, got: {result.errors}"

    def test_standalone_only_sprint_dangling_dep_fails(
        self, project_root: Path
    ) -> None:
        """AC1 (guard): a sprint with ONLY standalone stories still runs the walk.

        The ``if all_story_ids:`` guard short-circuits depends_on validation
        when there are no epic stories; a standalone-only sprint must still
        catch a dangling reference.
        """
        data = _merged_sprint(
            standalone_stories=[_story("160-2", depends_on="ghost-standalone")],
        )

        result = validate_full_sprint(data)

        assert not result.valid, (
            "a standalone-only sprint must still validate depends_on, "
            f"got errors: {result.errors}"
        )
        assert any(
            "non-existent" in e.message for e in result.errors
        ), f"expected non-existent error, got: {result.errors}"


# =============================================================================
# AC2 — dangling depends_on on a top-level story fails
# =============================================================================


class TestDanglingDepOnTopLevelStoryFails:
    def test_top_level_story_dangling_dep_fails(self, project_root: Path) -> None:
        """AC2: a top-level ``stories`` entry's dangling depends_on must ERROR."""
        data = _merged_sprint(
            epic_stories=[_story("160-1")],  # anchor
            top_level_stories=[_story("160-3", depends_on="ghost-top-level")],
        )

        result = validate_full_sprint(data)

        assert not result.valid, (
            "a dangling depends_on on a top-level story must fail validation, "
            f"got errors: {result.errors}"
        )
        assert any(
            "non-existent" in e.message and "ghost-top-level" in e.message
            for e in result.errors
        ), f"expected non-existent error for top-level dep, got: {result.errors}"

    def test_top_level_only_sprint_dangling_dep_fails(
        self, project_root: Path
    ) -> None:
        """AC2 (guard): a top-level-only sprint still runs the depends_on walk."""
        data = _merged_sprint(
            top_level_stories=[_story("160-3", depends_on="ghost-top-level")],
        )

        result = validate_full_sprint(data)

        assert not result.valid, (
            "a top-level-only sprint must still validate depends_on, "
            f"got errors: {result.errors}"
        )
        assert any("non-existent" in e.message for e in result.errors)


# =============================================================================
# AC3 — deps pointing AT standalone/top-level stories resolve from any location
# =============================================================================


class TestDepsPointingAtStandaloneOrTopLevelResolve:
    def test_epic_story_dep_on_standalone_story_resolves(
        self, project_root: Path
    ) -> None:
        """AC3: an epic story depending on a standalone story must NOT false-fail.

        The standalone target is absent from today's known-ids set, so this is
        currently reported as non-existent.
        """
        data = _merged_sprint(
            epic_stories=[_story("160-1", depends_on="160-2")],
            standalone_stories=[_story("160-2")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a dep pointing at a standalone story must resolve, "
            f"got errors: {result.errors}"
        )
        assert not any(
            "non-existent" in e.message for e in result.errors
        ), "valid dep on a standalone story must not be flagged non-existent"

    def test_epic_story_dep_on_top_level_story_resolves(
        self, project_root: Path
    ) -> None:
        """AC3: an epic story depending on a top-level story must resolve."""
        data = _merged_sprint(
            epic_stories=[_story("160-1", depends_on="160-3")],
            top_level_stories=[_story("160-3")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a dep pointing at a top-level story must resolve, "
            f"got errors: {result.errors}"
        )
        assert not any("non-existent" in e.message for e in result.errors)

    def test_standalone_story_dep_on_epic_story_resolves(
        self, project_root: Path
    ) -> None:
        """AC3: a standalone story depending on an epic story must resolve.

        Exercises the walk from the standalone location against the epic
        known-ids — the inverse direction.
        """
        data = _merged_sprint(
            epic_stories=[_story("160-1")],
            standalone_stories=[_story("160-2", depends_on="160-1")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a standalone story's dep on an epic story must resolve, "
            f"got errors: {result.errors}"
        )
        assert not any("non-existent" in e.message for e in result.errors)

    def test_standalone_dep_on_top_level_story_resolves(
        self, project_root: Path
    ) -> None:
        """AC3: a standalone story depending on a top-level story resolves."""
        data = _merged_sprint(
            epic_stories=[_story("160-1")],  # anchor
            standalone_stories=[_story("160-2", depends_on="160-3")],
            top_level_stories=[_story("160-3")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a standalone->top-level dep must resolve, "
            f"got errors: {result.errors}"
        )
        assert not any("non-existent" in e.message for e in result.errors)


# =============================================================================
# AC4 — archived-story allowance (160-8) preserved for all locations
# =============================================================================


class TestArchivedAllowancePreservedForAllLocations:
    def test_standalone_dep_on_archived_story_passes(
        self, project_root: Path
    ) -> None:
        """AC4: a standalone story whose dep is archived must NOT hard-fail."""
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-9"])
        data = _merged_sprint(
            epic_stories=[_story("160-1")],  # anchor
            standalone_stories=[_story("160-2", depends_on="160-9")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a standalone story's dep on an archived story must pass, "
            f"got errors: {result.errors}"
        )
        assert _depends_on_errors(result) == [], (
            "archived dep from a standalone story must not produce a hard "
            f"depends_on ERROR, got: {_depends_on_errors(result)}"
        )

    def test_top_level_dep_on_archived_story_passes(
        self, project_root: Path
    ) -> None:
        """AC4: a top-level story whose dep is archived must NOT hard-fail."""
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-9"])
        data = _merged_sprint(
            epic_stories=[_story("160-1")],  # anchor
            top_level_stories=[_story("160-3", depends_on="160-9")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a top-level story's dep on an archived story must pass, "
            f"got errors: {result.errors}"
        )
        assert _depends_on_errors(result) == []

    def test_standalone_dep_on_neither_active_nor_archived_still_fails(
        self, project_root: Path
    ) -> None:
        """AC4 boundary: archive allowance must not over-relax standalone deps."""
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-9"])
        data = _merged_sprint(
            epic_stories=[_story("160-1")],
            standalone_stories=[_story("160-2", depends_on="truly-gone")],
        )

        result = validate_full_sprint(data)

        assert not result.valid, (
            "a standalone dep that is neither active nor archived must still "
            f"fail, got errors: {result.errors}"
        )
        assert any(
            "non-existent" in e.message and "truly-gone" in e.message
            for e in result.errors
        )


# =============================================================================
# AC5 — no regression: valid multi-location sprints still pass
# =============================================================================


class TestNoRegression:
    def test_valid_multi_location_sprint_passes(self, project_root: Path) -> None:
        """AC5: a sprint with valid deps across all three locations passes."""
        data = _merged_sprint(
            epic_stories=[
                _story("160-1", status="done"),
                _story("160-2", depends_on="160-1"),
            ],
            standalone_stories=[_story("160-4", depends_on="160-1")],
            top_level_stories=[_story("160-5", depends_on="160-4")],
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "a fully valid multi-location sprint must pass, "
            f"got errors: {result.errors}"
        )

    def test_no_depends_on_anywhere_passes(self, project_root: Path) -> None:
        """AC5: stories in all locations with no depends_on at all pass cleanly."""
        data = _merged_sprint(
            epic_stories=[_story("160-1")],
            standalone_stories=[_story("160-2")],
            top_level_stories=[_story("160-3")],
        )

        result = validate_full_sprint(data)

        assert result.valid, f"no-dep multi-location sprint must pass: {result.errors}"
        assert _depends_on_errors(result) == []
