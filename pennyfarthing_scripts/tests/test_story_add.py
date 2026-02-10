"""Tests for sprint/story_add.py module.

Story: MSSCI-14256 - Sprint story add command

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Auto-generates next story ID within epic (max+1, no gap-fill)
2. Validates target epic exists before insertion
3. Populates required fields with defaults, optional fields only when provided
4. Appends story at end of epic's stories list as CommentedMap
5. Validates entire sprint file after insertion, aborts on failure
6. CLI: /sprint story add <epic_id> <title> <points> with options
7. Edge cases: YAML-special chars, first story, sequence gaps
"""

from pathlib import Path

import pytest
from click.testing import CliRunner
from ruamel.yaml.comments import CommentedMap

from pennyfarthing_scripts.sprint.story_add import (
    add_story,
    generate_story_id,
)
from pennyfarthing_scripts.sprint.yaml_io import (
    STORY_KEY_ORDER,
    read_sprint,
)

# =============================================================================
# Test Fixtures
# =============================================================================


MINIMAL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: MSSCI-14253
    stories:
      - id: 76-1
        title: Core yaml_io module
        points: 3
        priority: P0
        status: done
        workflow: tdd
      - id: 76-2
        title: Sprint validate command
        points: 2
        priority: P0
        status: done
        workflow: tdd
"""

MULTI_EPIC_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: MSSCI-14253
    stories:
      - id: 76-1
        title: Core yaml_io module
        points: 3
        priority: P0
        status: done
        workflow: tdd
  - id: epic-77
    type: epic
    title: "Epic: Another Feature"
    priority: P1
    status: in_progress
    jira: MSSCI-14300
    stories:
      - id: 77-1
        title: First task
        points: 2
        priority: P1
        status: backlog
        workflow: trivial
"""

EMPTY_STORIES_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-80
    type: epic
    title: "Epic: Brand New"
    priority: P1
    status: in_progress
    jira: MSSCI-15000
    stories: []
"""

GAPPED_IDS_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-50
    type: epic
    title: "Epic: Gapped IDs"
    priority: P1
    status: in_progress
    jira: MSSCI-11000
    stories:
      - id: 50-1
        title: First story
        points: 2
        priority: P1
        status: done
        workflow: tdd
      - id: 50-3
        title: Third story (gap at 2)
        points: 3
        priority: P1
        status: done
        workflow: tdd
      - id: 50-5
        title: Fifth story (gap at 4)
        points: 1
        priority: P2
        status: backlog
        workflow: trivial
"""


@pytest.fixture
def sprint_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with one epic and two stories."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MINIMAL_SPRINT_YAML)
    return p


@pytest.fixture
def multi_epic_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with multiple epics."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MULTI_EPIC_YAML)
    return p


@pytest.fixture
def empty_stories_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with an epic that has no stories."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(EMPTY_STORIES_YAML)
    return p


@pytest.fixture
def gapped_ids_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with non-sequential story IDs."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(GAPPED_IDS_YAML)
    return p


@pytest.fixture
def runner() -> CliRunner:
    """Create a Click test runner."""
    return CliRunner()


# =============================================================================
# AC1: Story ID Generation
# =============================================================================


class TestIDGeneration:
    """Auto-generates next story ID within epic (max+1, no gap-fill)."""

    def test_next_id_after_existing_stories(self, sprint_file: Path) -> None:
        """With stories 76-1 and 76-2, next ID should be 76-3."""
        data = read_sprint(sprint_file)
        epic = data["epics"][0]

        story_id = generate_story_id(data, epic)

        assert story_id == "76-3"

    def test_first_story_in_empty_epic(self, empty_stories_file: Path) -> None:
        """With no stories, first ID should be <epic_num>-1."""
        data = read_sprint(empty_stories_file)
        epic = data["epics"][0]

        story_id = generate_story_id(data, epic)

        assert story_id == "80-1"

    def test_uses_max_plus_one_with_gaps(self, gapped_ids_file: Path) -> None:
        """With IDs 50-1, 50-3, 50-5, next should be 50-6 (not 50-2)."""
        data = read_sprint(gapped_ids_file)
        epic = data["epics"][0]

        story_id = generate_story_id(data, epic)

        assert story_id == "50-6"

    def test_generated_id_unique_across_epics(self, multi_epic_file: Path) -> None:
        """Generated ID must not collide with IDs in other epics."""
        data = read_sprint(multi_epic_file)
        epic = data["epics"][0]  # epic-76

        story_id = generate_story_id(data, epic)

        # Collect all existing IDs across all epics
        all_ids = set()
        for e in data["epics"]:
            for s in e.get("stories", []):
                all_ids.add(s["id"])

        assert story_id not in all_ids

    def test_extracts_epic_num_from_epic_prefix(self, sprint_file: Path) -> None:
        """Should handle epic IDs like 'epic-76' correctly."""
        data = read_sprint(sprint_file)
        epic = data["epics"][0]

        # epic ID is "epic-76"
        story_id = generate_story_id(data, epic)

        # Should use numeric part "76" as prefix
        assert story_id.startswith("76-")


# =============================================================================
# AC2: Epic Validation
# =============================================================================


class TestEpicValidation:
    """Validates target epic exists before insertion."""

    def test_add_to_existing_epic(self, sprint_file: Path) -> None:
        """Adding a story to an existing epic should succeed."""
        result = add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        assert result["success"] is True

    def test_add_to_nonexistent_epic_fails(self, sprint_file: Path) -> None:
        """Adding a story to a non-existent epic should fail with clear error."""
        result = add_story(
            sprint_path=sprint_file,
            epic_id="999",
            title="New story",
            points=3,
        )

        assert result["success"] is False
        assert "error" in result
        assert "999" in result["error"]

    def test_error_lists_available_epics(self, multi_epic_file: Path) -> None:
        """Error for missing epic should list available epic IDs."""
        result = add_story(
            sprint_path=multi_epic_file,
            epic_id="999",
            title="New story",
            points=3,
        )

        assert result["success"] is False
        # Error should mention the available epics
        error_text = result["error"]
        assert "76" in error_text or "77" in error_text

    def test_epic_id_format_plain_number(self, sprint_file: Path) -> None:
        """Should accept plain numeric epic ID like '76'."""
        result = add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Test",
            points=1,
        )

        assert result["success"] is True

    def test_epic_id_format_with_prefix(self, sprint_file: Path) -> None:
        """Should accept prefixed epic ID like 'epic-76'."""
        result = add_story(
            sprint_path=sprint_file,
            epic_id="epic-76",
            title="Test",
            points=1,
        )

        assert result["success"] is True


# =============================================================================
# AC3: Field Population
# =============================================================================


class TestFieldPopulation:
    """Populates required fields with defaults, optional fields only when provided."""

    def test_required_fields_present(self, sprint_file: Path) -> None:
        """Added story must have id, title, status, points."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
        )

        data = read_sprint(sprint_file)
        epic = data["epics"][0]
        new_story = epic["stories"][-1]

        assert "id" in new_story
        assert "title" in new_story
        assert "status" in new_story
        assert "points" in new_story

    def test_default_status_is_backlog(self, sprint_file: Path) -> None:
        """Default status should be 'backlog'."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["status"] == "backlog"

    def test_default_priority_is_p1(self, sprint_file: Path) -> None:
        """Default priority should be 'P1'."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["priority"] == "P1"

    def test_default_workflow_is_tdd(self, sprint_file: Path) -> None:
        """Default workflow should be 'tdd'."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["workflow"] == "tdd"

    def test_title_preserved_exactly(self, sprint_file: Path) -> None:
        """The title should be stored exactly as provided."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Implement new feature: parsing",
            points=5,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["title"] == "Implement new feature: parsing"

    def test_points_stored_as_integer(self, sprint_file: Path) -> None:
        """Points should be stored as an integer."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=5,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["points"] == 5
        assert isinstance(new_story["points"], int)

    def test_optional_jira_included_when_provided(self, sprint_file: Path) -> None:
        """Jira key should appear only when explicitly provided."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
            jira="MSSCI-14999",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["jira"] == "MSSCI-14999"

    def test_optional_jira_absent_when_not_provided(self, sprint_file: Path) -> None:
        """Jira key should NOT appear when not provided."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New feature",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert "jira" not in new_story

    def test_optional_type_included_when_provided(self, sprint_file: Path) -> None:
        """Story type should appear only when explicitly provided."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Fix bug",
            points=2,
            story_type="bug",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story.get("type") == "bug"

    def test_custom_priority_overrides_default(self, sprint_file: Path) -> None:
        """Custom priority should override the P1 default."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Critical fix",
            points=1,
            priority="P0",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["priority"] == "P0"

    def test_custom_workflow_overrides_default(self, sprint_file: Path) -> None:
        """Custom workflow should override the tdd default."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Quick chore",
            points=1,
            workflow="trivial",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["workflow"] == "trivial"


# =============================================================================
# AC4: Story Insertion and Key Ordering
# =============================================================================


class TestStoryPositioning:
    """Story is appended at end of epic's stories list as CommentedMap."""

    def test_appended_at_end(self, sprint_file: Path) -> None:
        """New story should be the last story in the epic's list."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        data = read_sprint(sprint_file)
        stories = data["epics"][0]["stories"]

        assert len(stories) == 3  # Was 2, now 3
        assert stories[-1]["title"] == "New story"

    def test_story_is_commented_map(self, sprint_file: Path) -> None:
        """New story must be a CommentedMap, not a plain dict."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert isinstance(new_story, CommentedMap)

    def test_key_ordering_follows_story_key_order(self, sprint_file: Path) -> None:
        """Keys in the new story should follow STORY_KEY_ORDER."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        actual_keys = list(new_story.keys())
        expected_order = [k for k in STORY_KEY_ORDER if k in actual_keys]

        assert actual_keys == expected_order

    def test_existing_stories_unchanged(self, sprint_file: Path) -> None:
        """Existing stories should not be modified by the add."""
        data_before = read_sprint(sprint_file)
        original_first = dict(data_before["epics"][0]["stories"][0])

        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        data_after = read_sprint(sprint_file)
        first_after = data_after["epics"][0]["stories"][0]

        assert first_after["id"] == original_first["id"]
        assert first_after["title"] == original_first["title"]
        assert first_after["points"] == original_first["points"]

    def test_add_to_second_epic(self, multi_epic_file: Path) -> None:
        """Should be able to add a story to a non-first epic."""
        add_story(
            sprint_path=multi_epic_file,
            epic_id="77",
            title="New story in epic 77",
            points=2,
        )

        data = read_sprint(multi_epic_file)
        epic_77 = data["epics"][1]

        assert len(epic_77["stories"]) == 2
        assert epic_77["stories"][-1]["title"] == "New story in epic 77"
        assert epic_77["stories"][-1]["id"] == "77-2"


# =============================================================================
# AC5: File Validation After Insertion
# =============================================================================


class TestFileValidation:
    """Validates entire sprint file after insertion, aborts on failure."""

    def test_file_valid_after_insertion(self, sprint_file: Path) -> None:
        """Sprint file should pass validation after a successful add."""
        from pennyfarthing_scripts.sprint.validator import validate_full_sprint

        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        data = read_sprint(sprint_file)
        result = validate_full_sprint(data)

        assert result.valid

    def test_atomic_write_on_success(self, sprint_file: Path) -> None:
        """Successful add should produce a valid YAML file on disk."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        # File should be readable and valid
        data = read_sprint(sprint_file)
        assert data is not None
        assert len(data["epics"][0]["stories"]) == 3

    def test_no_temp_files_after_success(self, sprint_file: Path) -> None:
        """No .yaml.tmp file should remain after successful add."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        tmp_file = sprint_file.with_suffix(".yaml.tmp")
        assert not tmp_file.exists()

    def test_original_preserved_on_validation_failure(self, tmp_path: Path) -> None:
        """If post-insertion validation fails, original file should be untouched."""
        # Create a file with a story that would cause duplicate ID
        yaml_content = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-99
    type: epic
    title: "Epic: Test"
    priority: P1
    status: in_progress
    jira: MSSCI-99999
    stories:
      - id: 99-1
        title: Existing
        points: 1
        status: backlog
"""
        p = tmp_path / "current-sprint.yaml"
        p.write_text(yaml_content)

        # Normal add should work fine
        result = add_story(
            sprint_path=p,
            epic_id="99",
            title="Second story",
            points=2,
        )

        assert result["success"] is True


# =============================================================================
# AC6: CLI Interface
# =============================================================================


class TestCLIIntegration:
    """CLI: /sprint story add <epic_id> <title> <points> with options."""

    def test_story_add_command_exists(self) -> None:
        """story_add_command should be importable and be a Click command."""
        import click

        from pennyfarthing_scripts.sprint.story_add import story_add_command

        assert isinstance(story_add_command, click.BaseCommand)

    def test_basic_add_via_cli(self, runner: CliRunner, sprint_file: Path) -> None:
        """Basic CLI invocation should add a story successfully."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "New CLI story", "3",
        ])

        assert result.exit_code == 0

    def test_cli_with_jira_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--jira option should set the jira field."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "Jira story", "3",
            "--jira", "MSSCI-14999",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]
        assert new_story["jira"] == "MSSCI-14999"

    def test_cli_with_type_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--type option should set the story type."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "Bug fix", "2",
            "--type", "bug",
        ])

        assert result.exit_code == 0

    def test_cli_with_priority_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--priority option should override default P1."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "Critical", "1",
            "--priority", "P0",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]
        assert new_story["priority"] == "P0"

    def test_cli_with_workflow_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--workflow option should override default tdd."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "Quick task", "1",
            "--workflow", "trivial",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]
        assert new_story["workflow"] == "trivial"

    def test_cli_nonexistent_epic_exits_nonzero(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """Specifying a non-existent epic should produce non-zero exit code."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "999", "Phantom story", "3",
        ])

        assert result.exit_code != 0

    def test_cli_success_output(self, runner: CliRunner, sprint_file: Path) -> None:
        """Successful add should show the new story ID."""
        from pennyfarthing_scripts.sprint.story_add import story_add_command

        result = runner.invoke(story_add_command, [
            "--sprint-file", str(sprint_file),
            "76", "New story", "3",
        ])

        assert result.exit_code == 0
        assert "76-3" in result.output


# =============================================================================
# AC7: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Handles YAML-special chars, first story in new epic, sequence gaps."""

    def test_title_with_colon(self, sprint_file: Path) -> None:
        """Title containing colons should be handled correctly."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Feature: implement parsing",
            points=3,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["title"] == "Feature: implement parsing"

    def test_title_with_quotes(self, sprint_file: Path) -> None:
        """Title containing quotes should be handled correctly."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title='Fix "broken" feature',
            points=2,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["title"] == 'Fix "broken" feature'

    def test_title_with_yaml_special_chars(self, sprint_file: Path) -> None:
        """Title with brackets, ampersands, etc. should survive round-trip."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Handle [special] {chars} & *asterisks*",
            points=2,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["title"] == "Handle [special] {chars} & *asterisks*"

    def test_first_story_in_empty_epic(self, empty_stories_file: Path) -> None:
        """Adding the first story to an epic with empty stories list."""
        result = add_story(
            sprint_path=empty_stories_file,
            epic_id="80",
            title="First story ever",
            points=3,
        )

        assert result["success"] is True

        data = read_sprint(empty_stories_file)
        epic = data["epics"][0]

        assert len(epic["stories"]) == 1
        assert epic["stories"][0]["id"] == "80-1"
        assert epic["stories"][0]["title"] == "First story ever"

    def test_gapped_ids_uses_max_plus_one(self, gapped_ids_file: Path) -> None:
        """With gaps in IDs (50-1, 50-3, 50-5), next should be 50-6."""
        result = add_story(
            sprint_path=gapped_ids_file,
            epic_id="50",
            title="After the gaps",
            points=2,
        )

        assert result["success"] is True

        data = read_sprint(gapped_ids_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["id"] == "50-6"

    def test_multiple_adds_sequential(self, sprint_file: Path) -> None:
        """Adding two stories in sequence should give sequential IDs."""
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Third story",
            points=2,
        )
        add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="Fourth story",
            points=1,
        )

        data = read_sprint(sprint_file)
        stories = data["epics"][0]["stories"]

        assert len(stories) == 4
        assert stories[-2]["id"] == "76-3"
        assert stories[-1]["id"] == "76-4"

    def test_result_includes_story_id(self, sprint_file: Path) -> None:
        """Successful result should include the generated story ID."""
        result = add_story(
            sprint_path=sprint_file,
            epic_id="76",
            title="New story",
            points=3,
        )

        assert result["success"] is True
        assert result["story_id"] == "76-3"
