"""Tests for archived-dependency resolution in merged-sprint validation.

Story 160-8 (gh #90): Dangling depends_on to a completed/archived story fails
whole-sprint validation, blocking ALL story update & finish.

The bug: ``_validate_depends_on`` only resolves ``depends_on`` targets against
the set of *active* story IDs in the merged sprint. When a dependency story is
finished and moved to ``sprint/archive/``, the reference is treated as
"non-existent" and a hard ``ValidationError`` is raised. Because
``pf sprint story update`` / ``finish`` validate the *entire* merged sprint
after writing, one stale archived reference blocks every unrelated story's
update/finish sprint-wide.

TDD RED phase: these tests pin the fixed behavior and MUST FAIL against the
current implementation (which has no archive awareness).

Acceptance Criteria:
1. A depends_on referencing a story present in sprint/archive/ (completed)
   passes merged-sprint validation.
2. A depends_on referencing a story that exists nowhere (active or archive)
   still fails with the existing ValidationError.
3. Regression: the gh#90 repro — dep archived -> sprint-wide update of an
   unrelated story is unblocked.
4. Existing validator behavior (active-dep resolution, cycle detection) is
   preserved. (Covered here + by the existing test_sprint_validator.py suite.)
"""

from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

from pf.sprint.story_update import update_story
from pf.sprint.validator import validate_full_sprint
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — a tmp project root with an active sprint + an archive file
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


def _merged_sprint(stories: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a minimal merged-sprint document with one epic of given stories."""
    return {
        "sprint": {
            "name": "TO Sprint 2604",
            "number": 2604,
            "jira_sprint_id": 276,
            "jira_sprint_name": "TO Sprint 2604",
            "goal": "Complete the sprint",
            "start_date": "2026-01-20",
            "end_date": "2026-02-02",
            "status": "active",
        },
        "epics": [
            {
                "id": "epic-160",
                "type": "epic",
                "title": "Epic: validator hardening",
                "priority": "P1",
                "status": "in_progress",
                "stories": stories,
            }
        ],
    }


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """A tmp project root with sprint/ + sprint/archive/ scaffolding.

    Patches ``get_project_root`` everywhere the archive loader resolves it so
    the validator's archive lookup resolves to this isolated tree.
    """
    (tmp_path / "sprint").mkdir(parents=True, exist_ok=True)
    with patch("pf.sprint.loader.get_project_root", return_value=tmp_path), patch(
        "pf.common.config.get_project_root", return_value=tmp_path
    ):
        yield tmp_path


# =============================================================================
# AC1 — archived dependency resolves as satisfied (validator layer)
# =============================================================================


class TestArchivedDependencyPassesValidation:
    def test_depends_on_archived_story_passes_full_sprint_validation(
        self, project_root: Path
    ) -> None:
        """AC1: dep pointing at an archived (completed) story is satisfied."""
        # B is finished and archived; only A remains active and depends on B.
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-1"])
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "Dependent story",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "160-1",
                }
            ]
        )

        result = validate_full_sprint(data)

        assert result.valid, (
            "depends_on -> archived story must pass validation, "
            f"got errors: {result.errors}"
        )
        assert not any(
            "non-existent" in e.message for e in result.errors
        ), "archived dependency must not be reported as non-existent"

    def test_archived_dependency_emits_no_hard_error(self, project_root: Path) -> None:
        """AC1: a satisfied (archived) dep is accepted — warning at most, never ERROR."""
        from pf.sprint.validator import ValidationSeverity

        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-1"])
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "Dependent story",
                    "points": 3,
                    "status": "in_progress",
                    "depends_on": "160-1",
                }
            ]
        )

        result = validate_full_sprint(data)

        hard_errors = [
            e
            for e in result.errors
            if e.severity == ValidationSeverity.ERROR
            and "depends_on" in e.path
        ]
        assert hard_errors == [], (
            "archived dependency must not produce a hard depends_on ERROR, "
            f"got: {hard_errors}"
        )


# =============================================================================
# AC2 — truly non-existent dependency still errors
# =============================================================================


class TestNonexistentDependencyStillErrors:
    def test_depends_on_nowhere_story_still_fails(self, project_root: Path) -> None:
        """AC2: a dep that exists in neither active sprint nor archive ERRORS."""
        # Archive has an unrelated completed story; the referenced dep is absent.
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-99"])
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "Dependent story",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "does-not-exist",
                }
            ]
        )

        result = validate_full_sprint(data)

        assert not result.valid, "dangling dep with no active/archived target must fail"
        assert any(
            "non-existent" in e.message and "does-not-exist" in e.message
            for e in result.errors
        ), f"expected non-existent error for unknown dep, got: {result.errors}"

    def test_nonexistent_dep_errors_even_with_empty_archive(
        self, project_root: Path
    ) -> None:
        """AC2: missing archive dir must not silently swallow a dangling ref."""
        # No archive file written at all.
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "Dependent story",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "ghost-1",
                }
            ]
        )

        result = validate_full_sprint(data)

        assert not result.valid
        assert any("non-existent" in e.message for e in result.errors)


# =============================================================================
# AC4 — existing active-dep + cycle behavior preserved (regression guard)
# =============================================================================


class TestExistingDependsOnBehaviorPreserved:
    def test_active_intra_sprint_dependency_still_passes(
        self, project_root: Path
    ) -> None:
        """AC4: an active dep resolved within the merged sprint still passes."""
        data = _merged_sprint(
            [
                {"id": "160-1", "title": "Dep", "points": 2, "status": "done"},
                {
                    "id": "160-2",
                    "title": "Dependent",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "160-1",
                },
            ]
        )

        result = validate_full_sprint(data)

        assert result.valid, f"active intra-sprint dep must pass, got: {result.errors}"

    def test_circular_dependency_still_detected(self, project_root: Path) -> None:
        """AC4: cycle detection is unaffected by archive resolution."""
        data = _merged_sprint(
            [
                {
                    "id": "160-1",
                    "title": "A",
                    "points": 2,
                    "status": "backlog",
                    "depends_on": "160-2",
                },
                {
                    "id": "160-2",
                    "title": "B",
                    "points": 2,
                    "status": "backlog",
                    "depends_on": "160-1",
                },
            ]
        )

        result = validate_full_sprint(data)

        assert not result.valid
        assert any(
            "Circular dependency" in e.message for e in result.errors
        ), f"cycle must still be detected, got: {result.errors}"


# =============================================================================
# AC3 — gh#90 repro: sprint-wide update unblocked when a dep is archived
# =============================================================================


class TestGh90UpdateUnblockedByArchivedDep:
    def _write_sprint(self, root: Path) -> Path:
        """Active merged sprint: A depends_on B (B archived), plus unrelated C."""
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "A depends on archived B",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "160-1",  # 160-1 is archived
                },
                {
                    "id": "160-3",
                    "title": "Unrelated story C",
                    "points": 2,
                    "status": "backlog",
                },
            ]
        )
        sprint_path = root / "sprint" / "current-sprint.yaml"
        with open(sprint_path, "w") as f:
            yaml.dump(data, f)
        return sprint_path

    def test_update_unrelated_story_succeeds_when_dep_is_archived(
        self, project_root: Path
    ) -> None:
        """AC3: updating C must succeed even though A->B(archived) is in the sprint."""
        _write_archive(project_root / "sprint" / "archive", completed_ids=["160-1"])
        sprint_path = self._write_sprint(project_root)

        result = update_story(sprint_path, "160-3", status="in_progress")

        assert result["success"], (
            "update of unrelated story C must not be blocked by an archived "
            f"dependency on another story (gh#90), got: {result.get('error')}"
        )

        # And the write actually landed.
        written = read_sprint(sprint_path)
        stories = written["epics"][0]["stories"]
        c = next(s for s in stories if s["id"] == "160-3")
        assert c["status"] == "in_progress"

    def test_update_still_blocked_by_truly_dangling_dep(
        self, project_root: Path
    ) -> None:
        """AC2/AC3 boundary: a real dangling ref still blocks update (no false pass)."""
        # No archive entry for the referenced dep -> genuinely non-existent.
        _write_archive(project_root / "sprint" / "archive", completed_ids=[])
        data = _merged_sprint(
            [
                {
                    "id": "160-2",
                    "title": "A depends on ghost",
                    "points": 3,
                    "status": "backlog",
                    "depends_on": "ghost-1",
                },
                {
                    "id": "160-3",
                    "title": "Unrelated story C",
                    "points": 2,
                    "status": "backlog",
                },
            ]
        )
        sprint_path = project_root / "sprint" / "current-sprint.yaml"
        with open(sprint_path, "w") as f:
            yaml.dump(data, f)

        result = update_story(sprint_path, "160-3", status="in_progress")

        assert not result["success"], (
            "a genuinely dangling depends_on must still block update (validator "
            "must not over-relax)"
        )
        assert "Validation failed" in result.get("error", "")
