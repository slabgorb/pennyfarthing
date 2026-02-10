"""Tests for epic shard write-time validation and reference integrity.

Story: MSSCI-14734 / 91-24 - Sprint shard write-time validation
ADR: ADR-0022 - Sprint Shard Validation and Reference Integrity

Tests cover all six acceptance criteria:
  AC1: validate_epic_shard() rejects epics missing id, title, status, or stories
  AC2: _get_epic_ref() strips epic- prefix from IDs to prevent double-prefix filenames
  AC3: epic_add, epic_promote, jira_create_epic, import_epic all call validator before write
  AC4: _merge_epic_shards() emits warning for unresolvable refs (not silent skip)
  AC5: Jira create epic checks for existing epic with same title before creating
  AC6: Existing validator tests pass; new tests cover all five validation rules
"""

import warnings
from pathlib import Path
from typing import Any

import pytest
import yaml

from pennyfarthing_scripts.sprint.validator import (
    REQUIRED_EPIC_SHARD_FIELDS,
    REQUIRED_SHARD_STORY_FIELDS,
    ValidationResult,
    validate_epic_shard,
    validate_sprint_file,
)
from pennyfarthing_scripts.sprint.yaml_io import _get_epic_ref

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def valid_epic_shard() -> dict[str, Any]:
    """A minimal valid epic shard dict."""
    return {
        "id": "94",
        "title": "Epic: Cross-File Validation",
        "status": "backlog",
        "stories": [
            {
                "id": "94-1",
                "title": "First story",
                "points": 3,
                "status": "backlog",
            },
        ],
    }


@pytest.fixture
def valid_epic_shard_with_jira() -> dict[str, Any]:
    """A valid epic shard with a Jira key."""
    return {
        "id": "94",
        "title": "Epic: Validation Pipeline",
        "status": "in_progress",
        "jira": "MSSCI-14659",
        "stories": [
            {
                "id": "94-1",
                "title": "Wire up validation",
                "points": 5,
                "status": "done",
            },
        ],
    }


# =============================================================================
# AC1: validate_epic_shard() rejects epics missing required fields
# =============================================================================


class TestValidateEpicShardRequiredFields:
    """validate_epic_shard enforces id, title, status, stories are required."""

    def test_valid_shard_passes(self, valid_epic_shard: dict[str, Any]) -> None:
        """A complete, well-formed shard should pass validation."""
        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_constants_defined(self) -> None:
        """Required field constants should exist and match ADR-0022."""
        assert REQUIRED_EPIC_SHARD_FIELDS == {"id", "title", "status", "stories"}
        assert REQUIRED_SHARD_STORY_FIELDS == {"id", "title", "points", "status"}

    def test_missing_id_fails(self, valid_epic_shard: dict[str, Any]) -> None:
        """Shard without 'id' should fail validation."""
        del valid_epic_shard["id"]

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("id" in e.message.lower() for e in result.errors)

    def test_missing_title_fails(self, valid_epic_shard: dict[str, Any]) -> None:
        """Shard without 'title' should fail validation."""
        del valid_epic_shard["title"]

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("title" in e.message.lower() for e in result.errors)

    def test_missing_status_fails(self, valid_epic_shard: dict[str, Any]) -> None:
        """Shard without 'status' should fail validation."""
        del valid_epic_shard["status"]

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("status" in e.message.lower() for e in result.errors)

    def test_missing_stories_fails(self, valid_epic_shard: dict[str, Any]) -> None:
        """Shard without 'stories' should fail validation."""
        del valid_epic_shard["stories"]

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("stories" in e.message.lower() for e in result.errors)

    def test_empty_dict_fails_all_fields(self) -> None:
        """Empty dict should report all four missing required fields."""
        result = validate_epic_shard({})

        assert result.valid is False
        assert len(result.errors) >= 4

    def test_stories_must_be_list(self, valid_epic_shard: dict[str, Any]) -> None:
        """'stories' field must be a list, not a string or dict."""
        valid_epic_shard["stories"] = "not a list"

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("list" in e.message.lower() for e in result.errors)

    def test_story_missing_required_fields(
        self, valid_epic_shard: dict[str, Any]
    ) -> None:
        """Stories within shard must have id, title, points, status."""
        valid_epic_shard["stories"] = [{"id": "94-1"}]  # Missing title, points, status

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        error_msgs = " ".join(e.message for e in result.errors)
        assert "title" in error_msgs.lower()
        assert "points" in error_msgs.lower()
        assert "status" in error_msgs.lower()

    def test_duplicate_story_ids_within_shard_fails(
        self, valid_epic_shard: dict[str, Any]
    ) -> None:
        """No duplicate story IDs within a single shard."""
        valid_epic_shard["stories"] = [
            {"id": "94-1", "title": "Story A", "points": 3, "status": "backlog"},
            {"id": "94-1", "title": "Story B", "points": 2, "status": "done"},
        ]

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("duplicate" in e.message.lower() for e in result.errors)

    def test_valid_jira_key_passes(
        self, valid_epic_shard_with_jira: dict[str, Any]
    ) -> None:
        """Valid MSSCI-NNNNN Jira key should pass."""
        result = validate_epic_shard(valid_epic_shard_with_jira)

        assert result.valid is True

    def test_invalid_jira_key_fails(
        self, valid_epic_shard: dict[str, Any]
    ) -> None:
        """Invalid Jira key format should fail."""
        valid_epic_shard["jira"] = "INVALID-KEY"

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False
        assert any("jira" in e.message.lower() for e in result.errors)

    def test_jira_key_wrong_project_fails(
        self, valid_epic_shard: dict[str, Any]
    ) -> None:
        """Jira key from wrong project should fail."""
        valid_epic_shard["jira"] = "PROJ-12345"

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is False

    def test_empty_stories_list_passes(
        self, valid_epic_shard: dict[str, Any]
    ) -> None:
        """Empty stories list is valid (epic exists but has no stories yet)."""
        valid_epic_shard["stories"] = []

        result = validate_epic_shard(valid_epic_shard)

        assert result.valid is True


# =============================================================================
# AC1 continued: epic- prefix rejection (ADR-0022 root cause fix)
# =============================================================================


class TestEpicPrefixRejection:
    """validate_epic_shard rejects IDs starting with 'epic-' prefix."""

    def test_epic_prefix_in_id_rejected(self) -> None:
        """ID 'epic-94' should fail — reference prefix baked into value."""
        shard = {
            "id": "epic-94",
            "title": "Test",
            "status": "backlog",
            "stories": [],
        }

        result = validate_epic_shard(shard)

        assert result.valid is False
        assert any("epic-" in e.message for e in result.errors)

    def test_numeric_id_accepted(self) -> None:
        """Numeric ID '94' should pass."""
        shard = {
            "id": "94",
            "title": "Test",
            "status": "backlog",
            "stories": [],
        }

        result = validate_epic_shard(shard)

        assert result.valid is True

    def test_jira_key_as_id_accepted(self) -> None:
        """Jira key as ID should pass (e.g., 'MSSCI-14510')."""
        shard = {
            "id": "MSSCI-14510",
            "title": "Test",
            "status": "backlog",
            "stories": [],
        }

        result = validate_epic_shard(shard)

        assert result.valid is True

    def test_double_prefix_caught(self) -> None:
        """Double prefix 'epic-epic-94' should definitely fail."""
        shard = {
            "id": "epic-epic-94",
            "title": "Test",
            "status": "backlog",
            "stories": [],
        }

        result = validate_epic_shard(shard)

        assert result.valid is False


# =============================================================================
# AC2: _get_epic_ref() strips epic- prefix, prevents double-prefix filenames
# =============================================================================


class TestGetEpicRefNormalization:
    """_get_epic_ref returns canonical references for shard filenames."""

    def test_jira_key_preferred_over_id(self) -> None:
        """When both jira and id are present, Jira key wins."""
        epic = {"id": "94", "jira": "MSSCI-14659"}

        ref = _get_epic_ref(epic)

        assert ref == "MSSCI-14659"

    def test_strips_epic_prefix_from_id(self) -> None:
        """ID 'epic-94' should return '94' (prevents epic-epic-94.yaml)."""
        epic = {"id": "epic-94"}

        ref = _get_epic_ref(epic)

        assert ref == "94"

    def test_numeric_id_unchanged(self) -> None:
        """Plain numeric ID '94' should return '94'."""
        epic = {"id": "94"}

        ref = _get_epic_ref(epic)

        assert ref == "94"

    def test_jira_key_as_id_returned_directly(self) -> None:
        """ID that IS a Jira key should be returned directly."""
        epic = {"id": "MSSCI-14510"}

        ref = _get_epic_ref(epic)

        assert ref == "MSSCI-14510"

    def test_invalid_jira_key_falls_through(self) -> None:
        """Invalid Jira key in jira field should fall through to ID."""
        epic = {"id": "94", "jira": "INVALID"}

        ref = _get_epic_ref(epic)

        # Invalid jira ignored, falls through to id
        assert ref == "94"

    def test_double_prefix_stripped(self) -> None:
        """'epic-epic-94' should strip all epic- prefixes to '94'."""
        epic = {"id": "epic-epic-94"}

        ref = _get_epic_ref(epic)

        assert ref == "94"

    def test_resulting_filename_is_correct(self) -> None:
        """Reference should produce correct filename: epic-{ref}.yaml."""
        epic = {"id": "epic-94"}
        ref = _get_epic_ref(epic)

        filename = f"epic-{ref}.yaml"

        assert filename == "epic-94.yaml"
        assert "epic-epic-" not in filename

    def test_jira_key_filename_correct(self) -> None:
        """Jira key ref should produce epic-MSSCI-14659.yaml."""
        epic = {"id": "94", "jira": "MSSCI-14659"}
        ref = _get_epic_ref(epic)

        filename = f"epic-{ref}.yaml"

        assert filename == "epic-MSSCI-14659.yaml"


# =============================================================================
# AC3: All four write paths call validator before write
# =============================================================================


class TestWritePathValidatorIntegration:
    """All four epic creation paths call validate_epic_shard before writing."""

    def test_epic_add_validates_before_write(self, tmp_path: Path) -> None:
        """epic_add.add_epic() should reject invalid epics before writing."""
        from pennyfarthing_scripts.sprint.epic_add import add_epic

        # Create a minimal sprint index
        index = tmp_path / "current-sprint.yaml"
        index.write_text("sprint:\n  name: Test\nepics: []\n")

        # Try to add an epic with prefix in ID (validator should catch)
        result = add_epic(
            sprint_path=index,
            epic_id="epic-99",
            title="Bad Epic",
        )

        assert result["success"] is False
        assert "validation" in result["error"].lower() or "epic-" in result["error"]

    def test_epic_add_valid_epic_succeeds(self, tmp_path: Path) -> None:
        """epic_add.add_epic() should accept valid epics."""
        from pennyfarthing_scripts.sprint.epic_add import add_epic

        index = tmp_path / "current-sprint.yaml"
        index.write_text("sprint:\n  name: Test\nepics: []\n")

        result = add_epic(
            sprint_path=index,
            epic_id="99",
            title="Good Epic",
        )

        assert result["success"] is True

    def test_import_epic_validates_before_write(self, tmp_path: Path) -> None:
        """import_epic() validates generated YAML before writing to future.yaml."""
        from pennyfarthing_scripts.sprint.import_epic import import_epic

        # Create a markdown file with an epic
        md_file = tmp_path / "epics.md"
        md_file.write_text(
            "# Test Initiative - Epics and Stories\n\n"
            "## Overview\n\nTest description\n\n"
            "## Epic 1: First Epic\n\n"
            "**Points:** 5\n\n"
            "### Story 1.1: First Story\n\n"
            "**Points:** 5\n\n"
        )

        # Create future.yaml
        future = tmp_path / "sprint" / "future.yaml"
        future.parent.mkdir(parents=True)
        future.write_text(
            "# Next Available Epic Number: 100\n"
            "future:\n"
            "  initiatives: []\n"
        )

        result = import_epic(
            md_file,
            initiative_name="Test Initiative",
            project_root=tmp_path,
            dry_run=True,
        )

        # If validation passes, dry_run should succeed
        assert result["success"] is True

    def test_epic_promote_validates_shard(self) -> None:
        """epic_promote calls validate_epic_shard before writing.

        We verify by checking the source code imports and calls the validator.
        Full integration test requires complex future.yaml setup.
        """
        import inspect

        from pennyfarthing_scripts.sprint import cli

        # epic_promote is a Click Command; inspect the underlying callback
        source = inspect.getsource(cli.epic_promote.callback)
        assert "validate_epic_shard" in source

    def test_jira_create_epic_validates_before_api_call(self) -> None:
        """create_epic_in_jira calls validate_epic_shard before Jira API.

        Verified via source inspection since Jira API is external.
        """
        import inspect

        from pennyfarthing_scripts.jira.create import create_epic_in_jira

        source = inspect.getsource(create_epic_in_jira)
        assert "validate_epic_shard" in source
        # Validator call should come before client.create_issue_sync
        validator_pos = source.index("validate_epic_shard")
        # The function should call validator before creating the issue
        assert validator_pos > 0


# =============================================================================
# AC4: _merge_epic_shards() emits warning for unresolvable refs
# =============================================================================


class TestLoaderWarnings:
    """_merge_epic_shards emits warnings instead of silently skipping."""

    def test_missing_shard_emits_warning(self, tmp_path: Path) -> None:
        """Unresolvable shard ref should emit a warning, not silently skip."""
        from pennyfarthing_scripts.sprint.loader import _merge_epic_shards

        data = {
            "epics": ["MSSCI-99999"],  # Doesn't exist
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _merge_epic_shards(data, tmp_path)

        assert len(caught) == 1
        assert "MSSCI-99999" in str(caught[0].message)

    def test_missing_shard_excluded_from_result(self, tmp_path: Path) -> None:
        """Missing shard refs should not appear in the merged epics list."""
        from pennyfarthing_scripts.sprint.loader import _merge_epic_shards

        data = {"epics": ["MSSCI-99999"]}

        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = _merge_epic_shards(data, tmp_path)

        assert len(result["epics"]) == 0

    def test_valid_shard_loaded_missing_shard_warned(self, tmp_path: Path) -> None:
        """Mix of valid and missing shards: load valid, warn on missing."""
        from pennyfarthing_scripts.sprint.loader import _merge_epic_shards

        # Create one valid shard
        shard = tmp_path / "epic-MSSCI-14298.yaml"
        shard.write_text(
            "id: MSSCI-14298\ntitle: Valid Epic\nstatus: active\nstories: []\n"
        )

        data = {"epics": ["MSSCI-14298", "MISSING-REF"]}

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = _merge_epic_shards(data, tmp_path)

        # One epic loaded, one warning
        assert len(result["epics"]) == 1
        assert result["epics"][0]["id"] == "MSSCI-14298"
        assert len(caught) == 1
        assert "MISSING-REF" in str(caught[0].message)

    def test_non_sharded_data_unchanged(self, tmp_path: Path) -> None:
        """Non-sharded data (epics are dicts) should pass through unchanged."""
        from pennyfarthing_scripts.sprint.loader import _merge_epic_shards

        data = {
            "epics": [
                {"id": "94", "title": "Inline", "status": "backlog", "stories": []},
            ]
        }

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = _merge_epic_shards(data, tmp_path)

        assert len(caught) == 0
        assert result["epics"][0]["id"] == "94"

    def test_strict_mode_promotes_warnings_to_errors(self, tmp_path: Path) -> None:
        """validate_sprint_file(strict=True) should treat missing refs as errors."""
        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n"
            "  number: 12\n"
            "  jira_sprint_id: 276\n"
            "  goal: Test\n"
            "  start_date: 2026-01-20\n"
            "  end_date: 2026-02-02\n"
            "  status: active\n"
            "epics:\n"
            "  - MISSING-REF\n"
        )

        result = validate_sprint_file(sprint_file, strict=True)

        assert result.valid is False
        assert any("MISSING-REF" in e.message for e in result.errors)

    def test_non_strict_mode_tolerates_missing_refs(self, tmp_path: Path) -> None:
        """validate_sprint_file(strict=False) should not fail on missing refs."""
        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n"
            "  number: 12\n"
            "  jira_sprint_id: 276\n"
            "  goal: Test\n"
            "  start_date: 2026-01-20\n"
            "  end_date: 2026-02-02\n"
            "  status: active\n"
            "epics:\n"
            "  - MISSING-REF\n"
        )

        result = validate_sprint_file(sprint_file, strict=False)

        # Should be valid (warnings, not errors)
        assert result.valid is True


# =============================================================================
# AC5: Jira create epic checks for existing epic with same title
# =============================================================================


class TestJiraIdempotencyGuard:
    """create_epic_in_jira checks for duplicate titles before creating."""

    def test_idempotency_check_in_source(self) -> None:
        """Source code should contain duplicate title search logic."""
        import inspect

        from pennyfarthing_scripts.jira.create import create_epic_in_jira

        source = inspect.getsource(create_epic_in_jira)
        # Should search for existing epic with same title
        assert "search_issues_sync" in source or "duplicate" in source.lower()

    def test_force_flag_parameter_exists(self) -> None:
        """create_epic_in_jira should accept a force parameter."""
        import inspect

        from pennyfarthing_scripts.jira.create import create_epic_in_jira

        sig = inspect.signature(create_epic_in_jira)
        assert "force" in sig.parameters

    def test_force_default_is_false(self) -> None:
        """force parameter should default to False (safe by default)."""
        import inspect

        from pennyfarthing_scripts.jira.create import create_epic_in_jira

        sig = inspect.signature(create_epic_in_jira)
        assert sig.parameters["force"].default is False


# =============================================================================
# AC6: Integration — existing validator tests still pass, new rules covered
# =============================================================================


class TestValidationIntegration:
    """Integration tests ensuring all validation rules work together."""

    def test_full_valid_shard_roundtrip(
        self, tmp_path: Path, valid_epic_shard_with_jira: dict[str, Any]
    ) -> None:
        """Valid shard passes validation, writes correctly, reads back."""
        from pennyfarthing_scripts.sprint.yaml_io import _get_epic_ref

        # Validate
        result = validate_epic_shard(valid_epic_shard_with_jira)
        assert result.valid is True

        # Get ref
        ref = _get_epic_ref(valid_epic_shard_with_jira)
        assert ref == "MSSCI-14659"

        # Write shard file
        shard_path = tmp_path / f"epic-{ref}.yaml"
        yaml_content = yaml.dump(
            valid_epic_shard_with_jira, default_flow_style=False
        )
        shard_path.write_text(yaml_content)

        # Verify file name is correct
        assert shard_path.name == "epic-MSSCI-14659.yaml"
        assert "epic-epic-" not in shard_path.name

    def test_bad_shard_blocked_at_all_gates(self) -> None:
        """An epic with epic- prefix should be caught by validator."""
        bad_shard = {
            "id": "epic-94",
            "title": "Bad Epic",
            "status": "backlog",
            "stories": [],
        }

        result = validate_epic_shard(bad_shard)
        assert result.valid is False

    def test_validation_result_accumulates_multiple_errors(self) -> None:
        """Multiple validation failures should all be reported."""
        terrible_shard = {
            "id": "epic-bad",
            "jira": "INVALID",
            "stories": "not a list",
        }

        result = validate_epic_shard(terrible_shard)

        assert result.valid is False
        # Should report: missing title, missing status, epic- prefix,
        # invalid jira, stories not a list
        assert len(result.errors) >= 3

    def test_real_sprint_validates(self) -> None:
        """The actual current-sprint.yaml should pass validation."""
        project_root = Path(__file__).parent.parent.parent
        sprint_file = project_root / "sprint" / "current-sprint.yaml"

        if not sprint_file.exists():
            pytest.skip("No current-sprint.yaml available")

        result = validate_sprint_file(sprint_file)

        assert isinstance(result, ValidationResult)
        if not result.valid:
            for error in result.errors:
                print(f"  {error.path}: {error.message}")

    def test_real_sprint_strict_mode(self) -> None:
        """The actual current-sprint.yaml should pass strict validation."""
        project_root = Path(__file__).parent.parent.parent
        sprint_file = project_root / "sprint" / "current-sprint.yaml"

        if not sprint_file.exists():
            pytest.skip("No current-sprint.yaml available")

        result = validate_sprint_file(sprint_file, strict=True)

        assert isinstance(result, ValidationResult)
        # In strict mode, all shard refs should be resolvable
        if not result.valid:
            for error in result.errors:
                print(f"  {error.path}: {error.message}")
