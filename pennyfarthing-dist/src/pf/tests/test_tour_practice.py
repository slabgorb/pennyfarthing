"""Tests for 132-15: Add practice story to guided tour sprint step.

Verifies:
1. Practice epic template exists with correct YAML structure
2. Practice lifecycle module (practice.py) exists with required functions
3. step-04-sprint.md contains practice exercise section
4. Existing step-04 explanatory content is preserved
5. Practice flow is designed for Jira-less operation
6. Cleanup instructions are present
7. Sprint validation tolerance for tour_artifact marker
8. Orphan detection function exists
9. Try It / Dig In switch options preserved
10. Practice section uses correct story/epic IDs
11. Behavioral: lifecycle functions work end-to-end (create, cleanup, detect)
12. Behavioral: sprint index integration (shard discoverable by sprint system)
13. Behavioral: error handling returns result objects, not exceptions
"""

from __future__ import annotations

import importlib
import inspect
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def dist_root() -> Path:
    """Resolve the pennyfarthing-dist root."""
    here = Path(__file__).resolve()
    # tests/ -> pf/ -> src/ -> pennyfarthing-dist/
    return here.parent.parent.parent.parent


@pytest.fixture
def template_path(dist_root: Path) -> Path:
    """Path to the practice epic template."""
    return dist_root / "workflows" / "guided-tour" / "templates" / "epic-tour-practice.yaml"


@pytest.fixture
def template_content(template_path: Path) -> dict:
    """Parse the practice epic template YAML."""
    assert template_path.exists(), f"Practice epic template not found at {template_path}"
    return yaml.safe_load(template_path.read_text())


@pytest.fixture
def step_04_path(dist_root: Path) -> Path:
    """Path to step-04-sprint.md."""
    return dist_root / "workflows" / "guided-tour" / "steps" / "step-04-sprint.md"


@pytest.fixture
def step_04(step_04_path: Path) -> str:
    """Read step-04-sprint.md content."""
    assert step_04_path.exists(), f"step-04-sprint.md not found at {step_04_path}"
    return step_04_path.read_text()


@pytest.fixture
def practice_module():
    """Import the practice module."""
    return importlib.import_module("pf.tour.practice")


# ---------------------------------------------------------------------------
# AC1: Practice epic template structure
# ---------------------------------------------------------------------------


class TestPracticeEpicTemplate:
    """AC1: Template exists with correct structure for practice epic/story."""

    def test_template_file_exists(self, template_path: Path) -> None:
        """Practice epic template must exist."""
        assert template_path.exists(), (
            "epic-tour-practice.yaml template must exist at "
            "workflows/guided-tour/templates/"
        )

    def test_template_has_epic_id(self, template_content: dict) -> None:
        """Template must have a recognizable practice epic ID."""
        epic_id = template_content.get("id", "")
        assert "tour-practice" in epic_id, (
            f"Template epic ID must contain 'tour-practice', got '{epic_id}'"
        )

    def test_template_has_tour_artifact_marker(self, template_content: dict) -> None:
        """Template epic must have tour_artifact: true marker."""
        assert template_content.get("tour_artifact") is True, (
            "Template epic must have 'tour_artifact: true' marker"
        )

    def test_template_has_stories(self, template_content: dict) -> None:
        """Template must contain at least one practice story."""
        stories = template_content.get("stories", [])
        assert len(stories) >= 1, "Template must have at least one practice story"

    def test_practice_story_id(self, template_content: dict) -> None:
        """Practice story must have ID 'tour-practice-1'."""
        stories = template_content.get("stories", [])
        story_ids = [s.get("id") for s in stories]
        assert "tour-practice-1" in story_ids, (
            f"Template must have story with id 'tour-practice-1', got {story_ids}"
        )

    def test_practice_story_trivial_workflow(self, template_content: dict) -> None:
        """Practice story must use trivial workflow (not TDD)."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        assert practice.get("workflow") == "trivial", (
            f"Practice story must use 'trivial' workflow, got '{practice.get('workflow')}'"
        )

    def test_practice_story_no_jira(self, template_content: dict) -> None:
        """Practice story must have null jira (works without Jira configured)."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        assert practice.get("jira") is None, (
            f"Practice story must have jira: null, got '{practice.get('jira')}'"
        )

    def test_practice_story_has_tour_artifact(self, template_content: dict) -> None:
        """Practice story must also have tour_artifact: true."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        assert practice.get("tour_artifact") is True, (
            "Practice story must have 'tour_artifact: true' marker"
        )

    def test_practice_story_minimal_points(self, template_content: dict) -> None:
        """Practice story should have minimal points (1) to avoid velocity distortion."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        assert practice.get("points", 0) <= 1, (
            f"Practice story should have <=1 points, got {practice.get('points')}"
        )


# ---------------------------------------------------------------------------
# AC1/AC5/AC6/AC8: Practice lifecycle module
# ---------------------------------------------------------------------------


class TestPracticeModule:
    """Practice lifecycle module must exist with required functions."""

    def test_module_importable(self, practice_module) -> None:
        """pf.tour.practice must be importable."""
        assert practice_module is not None

    def test_has_create_function(self, practice_module) -> None:
        """Module must have create_practice_epic() function."""
        assert hasattr(practice_module, "create_practice_epic"), (
            "practice module must have 'create_practice_epic' function"
        )
        assert callable(practice_module.create_practice_epic)

    def test_has_cleanup_function(self, practice_module) -> None:
        """Module must have cleanup_practice() function."""
        assert hasattr(practice_module, "cleanup_practice"), (
            "practice module must have 'cleanup_practice' function"
        )
        assert callable(practice_module.cleanup_practice)

    def test_has_detect_orphaned_function(self, practice_module) -> None:
        """Module must have detect_orphaned_practice() function (AC8)."""
        assert hasattr(practice_module, "detect_orphaned_practice"), (
            "practice module must have 'detect_orphaned_practice' function"
        )
        assert callable(practice_module.detect_orphaned_practice)

    def test_create_returns_result(self, practice_module) -> None:
        """create_practice_epic must accept a project_root parameter."""
        sig = inspect.signature(practice_module.create_practice_epic)
        params = list(sig.parameters.keys())
        assert len(params) >= 1, (
            "create_practice_epic must accept at least one parameter (project_root)"
        )

    def test_cleanup_returns_result(self, practice_module) -> None:
        """cleanup_practice must accept a project_root parameter."""
        sig = inspect.signature(practice_module.cleanup_practice)
        params = list(sig.parameters.keys())
        assert len(params) >= 1, (
            "cleanup_practice must accept at least one parameter (project_root)"
        )

    def test_detect_returns_result(self, practice_module) -> None:
        """detect_orphaned_practice must accept a project_root parameter."""
        sig = inspect.signature(practice_module.detect_orphaned_practice)
        params = list(sig.parameters.keys())
        assert len(params) >= 1, (
            "detect_orphaned_practice must accept at least one parameter (project_root)"
        )


# ---------------------------------------------------------------------------
# AC2/AC3/AC4: step-04 practice exercise content
# ---------------------------------------------------------------------------


class TestStepFourPracticeSection:
    """step-04-sprint.md must contain the practice exercise."""

    def test_step_04_exists(self, step_04_path: Path) -> None:
        """step-04-sprint.md must exist in guided-tour steps."""
        assert step_04_path.exists(), (
            "step-04-sprint.md must exist at workflows/guided-tour/steps/"
        )

    def test_practice_section_exists(self, step_04: str) -> None:
        """step-04 must contain a practice section."""
        lower = step_04.lower()
        assert "practice" in lower, (
            "step-04-sprint.md must contain a 'practice' section"
        )

    def test_mentions_sprint_work_command(self, step_04: str) -> None:
        """Practice section must mention claiming the story (AC2)."""
        assert "pf sprint work tour-practice-1" in step_04 or \
               "sprint work tour-practice-1" in step_04, (
            "step-04 must mention 'pf sprint work tour-practice-1' for claiming"
        )

    def test_mentions_story_finish_command(self, step_04: str) -> None:
        """Practice section must mention completing the story (AC3)."""
        assert "story finish tour-practice-1" in step_04 or \
               "sprint story finish tour-practice-1" in step_04, (
            "step-04 must mention finishing the practice story"
        )

    def test_mentions_sprint_status(self, step_04: str) -> None:
        """Practice section must mention checking status (AC4)."""
        assert "sprint status" in step_04.lower(), (
            "step-04 must mention 'pf sprint status' to show progression"
        )

    def test_mentions_backlog(self, step_04: str) -> None:
        """Practice section must mention backlog to show story appearing."""
        assert "backlog" in step_04.lower(), (
            "step-04 must mention backlog (developer sees story appear)"
        )


# ---------------------------------------------------------------------------
# AC5: Cleanup before step 5
# ---------------------------------------------------------------------------


class TestCleanupInstructions:
    """AC5: All practice artifacts must be cleaned up."""

    def test_cleanup_section_exists(self, step_04: str) -> None:
        """step-04 must have cleanup instructions."""
        lower = step_04.lower()
        assert "cleanup" in lower or "clean up" in lower, (
            "step-04 must contain cleanup instructions"
        )

    def test_cleanup_mentions_shard_removal(self, step_04: str) -> None:
        """Cleanup must mention removing the practice epic shard."""
        lower = step_04.lower()
        assert "epic-tour-practice" in lower or "tour-practice" in lower, (
            "Cleanup must reference the practice epic shard for removal"
        )

    def test_cleanup_mentions_session_removal(self, step_04: str) -> None:
        """Cleanup must mention removing session artifacts."""
        lower = step_04.lower()
        assert "session" in lower, (
            "Cleanup must mention removing session artifacts"
        )


# ---------------------------------------------------------------------------
# AC9: Try It / Dig In switch options preserved
# ---------------------------------------------------------------------------


class TestExistingOptionsPreserved:
    """AC9: Existing switch options must still work."""

    def test_try_it_option_exists(self, step_04: str) -> None:
        """step-04 must still have a 'Try It' option."""
        lower = step_04.lower()
        assert "try it" in lower or "try" in lower, (
            "step-04 must preserve the 'Try It' switch option"
        )

    def test_dig_in_option_exists(self, step_04: str) -> None:
        """step-04 must still have a 'Dig In' or deep-dive option."""
        lower = step_04.lower()
        assert "dig in" in lower or "deep" in lower or "deep-dive" in lower, (
            "step-04 must preserve the 'Dig In' / deep-dive option"
        )


# ---------------------------------------------------------------------------
# AC10: Existing explanatory content preserved
# ---------------------------------------------------------------------------


class TestExistingContentPreserved:
    """AC10: Existing step-04 explanatory content must be preserved."""

    def test_sprint_hierarchy_explained(self, step_04: str) -> None:
        """step-04 must still explain sprint/epic/story hierarchy."""
        lower = step_04.lower()
        assert "epic" in lower and "story" in lower, (
            "step-04 must still explain the sprint/epic/story hierarchy"
        )

    def test_sprint_status_demo(self, step_04: str) -> None:
        """step-04 must still demonstrate pf sprint status."""
        assert "pf sprint status" in step_04 or "sprint status" in step_04.lower(), (
            "step-04 must still demonstrate the sprint status command"
        )

    def test_jira_integration_mentioned(self, step_04: str) -> None:
        """step-04 must still mention Jira integration."""
        lower = step_04.lower()
        assert "jira" in lower, (
            "step-04 must still mention Jira integration"
        )


# ---------------------------------------------------------------------------
# AC7: Sprint validation tolerance
# ---------------------------------------------------------------------------


class TestSprintValidationTolerance:
    """AC7: tour_artifact field must not break sprint validation."""

    def test_template_uses_standard_fields(self, template_content: dict) -> None:
        """Template epic must have required standard fields (id, title, status, stories)."""
        required = {"id", "title", "status", "stories"}
        actual = set(template_content.keys())
        missing = required - actual
        assert not missing, (
            f"Template missing required fields: {missing}"
        )

    def test_practice_story_has_standard_fields(self, template_content: dict) -> None:
        """Practice story must have required standard fields."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        required = {"id", "title", "points", "status"}
        actual = set(practice.keys())
        missing = required - actual
        assert not missing, (
            f"Practice story missing required fields: {missing}"
        )

    def test_epic_status_is_active(self, template_content: dict) -> None:
        """Template epic status must be 'active' for sprint inclusion."""
        assert template_content.get("status") == "active", (
            f"Template epic status must be 'active', got '{template_content.get('status')}'"
        )

    def test_practice_story_status_is_backlog(self, template_content: dict) -> None:
        """Practice story must start in 'backlog' status."""
        stories = template_content.get("stories", [])
        practice = next((s for s in stories if s.get("id") == "tour-practice-1"), None)
        assert practice is not None, "Practice story tour-practice-1 not found"
        assert practice.get("status") == "backlog", (
            f"Practice story must start in 'backlog', got '{practice.get('status')}'"
        )


# ---------------------------------------------------------------------------
# Behavioral: create_practice_epic() end-to-end
# ---------------------------------------------------------------------------


MINIMAL_SPRINT_INDEX = """\
sprint:
  name: Test Sprint
  status: active
epics:
  - EXISTING-001
"""

EXISTING_EPIC_SHARD = """\
id: EXISTING-001
title: Existing Epic
jira: EXISTING-001
status: active
stories: []
"""


@pytest.fixture
def mock_project(tmp_path: Path, dist_root: Path) -> Path:
    """Create a mock project root with sprint/ directory and index file."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(MINIMAL_SPRINT_INDEX)
    (sprint_dir / "epic-EXISTING-001.yaml").write_text(EXISTING_EPIC_SHARD)
    # Also create .session/ and sprint/archive/ for cleanup tests
    (tmp_path / ".session").mkdir()
    (sprint_dir / "archive").mkdir()
    return tmp_path


class TestCreatePracticeEpicBehavioral:
    """Behavioral tests: create_practice_epic() must actually work."""

    def test_creates_shard_file(self, mock_project: Path, practice_module) -> None:
        """create_practice_epic must copy the template into sprint/."""
        result = practice_module.create_practice_epic(mock_project)
        assert result["success"] is True, f"Expected success, got: {result}"
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        assert shard.exists(), "Shard file must be created in sprint/"

    def test_shard_contains_valid_yaml(self, mock_project: Path, practice_module) -> None:
        """Created shard must be valid YAML with practice epic data."""
        practice_module.create_practice_epic(mock_project)
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        data = yaml.safe_load(shard.read_text())
        assert data["id"] == "epic-tour-practice"
        assert data["tour_artifact"] is True

    def test_returns_shard_path(self, mock_project: Path, practice_module) -> None:
        """Result must include the shard_path."""
        result = practice_module.create_practice_epic(mock_project)
        assert "shard_path" in result, "Result must include shard_path"
        assert "epic-tour-practice.yaml" in result["shard_path"]

    def test_idempotent_second_call(self, mock_project: Path, practice_module) -> None:
        """Second call must return reused=True without overwriting."""
        practice_module.create_practice_epic(mock_project)
        result = practice_module.create_practice_epic(mock_project)
        assert result["success"] is True
        assert result.get("reused") is True, "Second call must return reused=True"

    def test_error_when_no_sprint_dir(self, tmp_path: Path, practice_module) -> None:
        """Must return error result when sprint/ doesn't exist."""
        result = practice_module.create_practice_epic(tmp_path)
        assert result["success"] is False
        assert "error" in result

    def test_registers_epic_in_sprint_index(self, mock_project: Path, practice_module) -> None:
        """create_practice_epic must add ref to current-sprint.yaml epics list.

        The sprint system (shard_merge.merge_epic_shards) only loads shards
        listed in the index. An unindexed shard is silently skipped, making
        the practice story invisible to pf sprint commands (AC1, AC2, AC4).

        The ref must be 'tour-practice' (not 'epic-tour-practice') because
        shard_merge constructs filenames as f"epic-{ref}.yaml". Using the
        full epic ID would produce 'epic-epic-tour-practice.yaml'.
        """
        practice_module.create_practice_epic(mock_project)
        index_path = mock_project / "sprint" / "current-sprint.yaml"
        index_data = yaml.safe_load(index_path.read_text())
        epics = index_data.get("epics", [])
        assert "tour-practice" in epics, (
            f"Practice epic ref must be 'tour-practice' in epics list "
            f"(not 'epic-tour-practice' — shard_merge prepends 'epic-'), "
            f"got {epics}"
        )

    def test_registered_ref_resolves_to_shard(self, mock_project: Path, practice_module) -> None:
        """The registered ref must resolve to the actual shard file via shard_merge convention.

        shard_merge constructs: sprint_dir / f"epic-{ref}.yaml"
        So the ref in the index must produce the correct shard filename.
        """
        practice_module.create_practice_epic(mock_project)
        index_path = mock_project / "sprint" / "current-sprint.yaml"
        index_data = yaml.safe_load(index_path.read_text())
        epics = index_data.get("epics", [])
        # Find the practice ref (not the existing EXISTING-001)
        practice_refs = [r for r in epics if "tour-practice" in str(r)]
        assert len(practice_refs) == 1, f"Expected one practice ref, got {practice_refs}"
        ref = practice_refs[0]
        # Verify the ref resolves to the actual shard file
        expected_shard = mock_project / "sprint" / f"epic-{ref}.yaml"
        assert expected_shard.exists(), (
            f"Ref '{ref}' resolves to '{expected_shard.name}' which does not exist. "
            f"shard_merge would fail to load this epic."
        )

    def test_catches_copy_errors(self, mock_project: Path, practice_module, monkeypatch) -> None:
        """create_practice_epic must catch OSError and return result, not raise.

        Project convention: return {success, error?}, don't throw.
        """
        import shutil

        def broken_copy(*args, **kwargs):
            raise OSError("Permission denied")

        monkeypatch.setattr(shutil, "copy2", broken_copy)
        result = practice_module.create_practice_epic(mock_project)
        assert result["success"] is False, (
            "copy2 failure must return {success: False}, not raise"
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# Behavioral: cleanup_practice() end-to-end
# ---------------------------------------------------------------------------


class TestCleanupPracticeBehavioral:
    """Behavioral tests: cleanup_practice() must actually remove artifacts."""

    def test_removes_shard_file(self, mock_project: Path, practice_module) -> None:
        """cleanup must remove sprint/epic-tour-practice.yaml."""
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        shard.write_text("id: epic-tour-practice\n")
        result = practice_module.cleanup_practice(mock_project)
        assert result["success"] is True
        assert not shard.exists(), "Shard file must be removed"

    def test_removes_session_file(self, mock_project: Path, practice_module) -> None:
        """cleanup must remove .session/tour-practice-1-session.md."""
        session = mock_project / ".session" / "tour-practice-1-session.md"
        session.write_text("# Practice session\n")
        result = practice_module.cleanup_practice(mock_project)
        assert result["success"] is True
        assert not session.exists(), "Session file must be removed"

    def test_removes_archive_file(self, mock_project: Path, practice_module) -> None:
        """cleanup must remove sprint/archive/tour-practice-1-session.md."""
        archive = mock_project / "sprint" / "archive" / "tour-practice-1-session.md"
        archive.write_text("# Archived practice session\n")
        result = practice_module.cleanup_practice(mock_project)
        assert result["success"] is True
        assert not archive.exists(), "Archive file must be removed"

    def test_returns_removed_list(self, mock_project: Path, practice_module) -> None:
        """cleanup must report which files were removed."""
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        shard.write_text("id: epic-tour-practice\n")
        result = practice_module.cleanup_practice(mock_project)
        assert len(result["removed"]) == 1
        assert "epic-tour-practice.yaml" in result["removed"][0]

    def test_handles_no_artifacts(self, mock_project: Path, practice_module) -> None:
        """cleanup with no artifacts must succeed with empty removed list."""
        result = practice_module.cleanup_practice(mock_project)
        assert result["success"] is True
        assert result["removed"] == []

    def test_removes_epic_ref_from_index(self, mock_project: Path, practice_module) -> None:
        """cleanup must also remove the epic ref from current-sprint.yaml.

        If create_practice_epic registers the ref, cleanup must unregister it.
        Otherwise the sprint index will reference a missing shard file.
        The ref is 'tour-practice' (matching shard_merge convention).
        """
        # Simulate: index has the practice epic ref (correct ref, not epic ID)
        index_path = mock_project / "sprint" / "current-sprint.yaml"
        index_data = yaml.safe_load(index_path.read_text())
        index_data["epics"].append("tour-practice")
        index_path.write_text(yaml.dump(index_data, default_flow_style=False))
        # Create the shard so cleanup has something to remove
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        shard.write_text("id: epic-tour-practice\n")

        practice_module.cleanup_practice(mock_project)

        index_after = yaml.safe_load(index_path.read_text())
        epics_after = index_after.get("epics", [])
        assert "tour-practice" not in epics_after, (
            f"Practice epic ref must be removed from index after cleanup, "
            f"got {epics_after}"
        )


# ---------------------------------------------------------------------------
# Behavioral: detect_orphaned_practice() end-to-end
# ---------------------------------------------------------------------------


class TestDetectOrphanedPracticeBehavioral:
    """Behavioral tests: detect_orphaned_practice() must find leftover artifacts."""

    def test_detects_shard(self, mock_project: Path, practice_module) -> None:
        """Must detect orphaned shard file."""
        shard = mock_project / "sprint" / "epic-tour-practice.yaml"
        shard.write_text("id: epic-tour-practice\n")
        result = practice_module.detect_orphaned_practice(mock_project)
        assert result["found"] is True
        assert any("epic-tour-practice" in a for a in result["artifacts"])

    def test_detects_session(self, mock_project: Path, practice_module) -> None:
        """Must detect orphaned session file."""
        session = mock_project / ".session" / "tour-practice-1-session.md"
        session.write_text("# Orphaned\n")
        result = practice_module.detect_orphaned_practice(mock_project)
        assert result["found"] is True
        assert any("tour-practice-1" in a for a in result["artifacts"])

    def test_detects_archive(self, mock_project: Path, practice_module) -> None:
        """Must detect orphaned archive file."""
        archive = mock_project / "sprint" / "archive" / "tour-practice-1-session.md"
        archive.write_text("# Archived orphan\n")
        result = practice_module.detect_orphaned_practice(mock_project)
        assert result["found"] is True

    def test_clean_project_returns_not_found(self, mock_project: Path, practice_module) -> None:
        """No artifacts present must return found=False."""
        result = practice_module.detect_orphaned_practice(mock_project)
        assert result["found"] is False
        assert result["artifacts"] == []

    def test_detects_multiple_artifacts(self, mock_project: Path, practice_module) -> None:
        """Must detect all orphaned artifacts at once."""
        (mock_project / "sprint" / "epic-tour-practice.yaml").write_text("id: epic-tour-practice\n")
        (mock_project / ".session" / "tour-practice-1-session.md").write_text("# Session\n")
        (mock_project / "sprint" / "archive" / "tour-practice-1-session.md").write_text("# Archive\n")
        result = practice_module.detect_orphaned_practice(mock_project)
        assert result["found"] is True
        assert len(result["artifacts"]) == 3, (
            f"Expected 3 artifacts, found {len(result['artifacts'])}: {result['artifacts']}"
        )
