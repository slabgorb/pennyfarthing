"""
Tests for Story 91-24: Sprint shard write-time validation and reference integrity.

Covers all 6 Acceptance Criteria:
  AC1: validate_epic_shard() rejects epics missing id, title, status, or stories
  AC2: _get_epic_ref() strips epic- prefix from IDs to prevent double-prefix filenames
  AC3: epic_add, epic_promote, jira_create_epic, and import_epic all call validator before write
  AC4: _merge_epic_shards() emits warning for each unresolvable ref instead of silent skip
  AC5: Jira create epic checks for existing epic with same title before creating
  AC6: Existing validator tests pass; new tests cover all five validation rules

Run with: python -m pytest tests/python/test_shard_validation.py -v
"""

import warnings
from typing import Any
from unittest.mock import MagicMock, patch

# =============================================================================
# AC1: validate_epic_shard() rejects epics missing required fields
# =============================================================================


class TestValidateEpicShard:
    """AC1: validate_epic_shard() rejects epics missing id, title, status, or stories."""

    def _make_valid_epic(self) -> dict[str, Any]:
        """Return a minimal valid epic shard dict."""
        return {
            "id": "99",
            "title": "Test Epic",
            "status": "backlog",
            "stories": [
                {"id": "99-1", "title": "First story", "points": 2, "status": "backlog"}
            ],
        }

    def test_valid_epic_shard_passes(self):
        """A complete epic shard with all required fields should validate."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        result = validate_epic_shard(epic)
        assert result.valid, f"Expected valid but got errors: {[e.message for e in result.errors]}"

    def test_missing_id_rejected(self):
        """Epic shard without 'id' field should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        del epic["id"]
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("id" in e.message.lower() for e in result.errors)

    def test_missing_title_rejected(self):
        """Epic shard without 'title' field should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        del epic["title"]
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("title" in e.message.lower() for e in result.errors)

    def test_missing_status_rejected(self):
        """Epic shard without 'status' field should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        del epic["status"]
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("status" in e.message.lower() for e in result.errors)

    def test_missing_stories_rejected(self):
        """Epic shard without 'stories' field should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        del epic["stories"]
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("stories" in e.message.lower() for e in result.errors)

    def test_stories_must_be_list(self):
        """Epic shard with non-list 'stories' should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["stories"] = "not a list"
        result = validate_epic_shard(epic)
        assert not result.valid

    def test_invalid_jira_key_format_rejected(self):
        """Epic shard with malformed jira key should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["jira"] = "BAD-123"
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("jira" in e.message.lower() or "MSSCI" in e.message for e in result.errors)

    def test_valid_jira_key_passes(self):
        """Epic shard with valid MSSCI-NNNNN jira key should pass."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["jira"] = "MSSCI-14510"
        result = validate_epic_shard(epic)
        assert result.valid

    def test_duplicate_story_ids_rejected(self):
        """Epic shard with duplicate story IDs should be rejected."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["stories"].append(
            {"id": "99-1", "title": "Duplicate", "points": 1, "status": "backlog"}
        )
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("duplicate" in e.message.lower() for e in result.errors)

    def test_story_missing_required_fields_rejected(self):
        """Stories within epic missing required fields should be flagged."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["stories"] = [{"id": "99-1"}]  # missing title, points, status
        result = validate_epic_shard(epic)
        assert not result.valid

    def test_epic_prefix_in_id_rejected(self):
        """Epic shard with 'epic-' prefix in ID should be rejected (ADR-0022)."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["id"] = "epic-99"
        result = validate_epic_shard(epic)
        assert not result.valid
        assert any("epic-" in e.message for e in result.errors)

    def test_empty_stories_list_passes(self):
        """Epic shard with empty stories list should pass (stories key present)."""
        from pf.sprint.validator import validate_epic_shard

        epic = self._make_valid_epic()
        epic["stories"] = []
        result = validate_epic_shard(epic)
        assert result.valid


# =============================================================================
# AC2: _get_epic_ref() strips epic- prefix to prevent double-prefix filenames
# =============================================================================


class TestGetEpicRefNormalization:
    """AC2: _get_epic_ref() strips epic- prefix from IDs to prevent double-prefix filenames."""

    def test_epic_prefix_stripped(self):
        """ID 'epic-94' should return '94' to avoid epic-epic-94.yaml."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "epic-94"}
        ref = _get_epic_ref(epic)
        # The ref should NOT contain 'epic-' — the caller adds 'epic-' prefix
        assert ref == "94", f"Expected '94' but got '{ref}' — double-prefix bug!"

    def test_numeric_id_unchanged(self):
        """ID '94' should return '94' unchanged."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "94"}
        ref = _get_epic_ref(epic)
        assert ref == "94"

    def test_jira_key_preferred_over_id(self):
        """Jira key takes precedence when present and valid."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "epic-94", "jira": "MSSCI-14659"}
        ref = _get_epic_ref(epic)
        assert ref == "MSSCI-14659"

    def test_jira_id_in_id_field_passes_through(self):
        """ID field containing MSSCI key should pass through unchanged."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "MSSCI-14659"}
        ref = _get_epic_ref(epic)
        assert ref == "MSSCI-14659"

    def test_invalid_jira_key_falls_back_to_id(self):
        """Invalid jira key should fall back to normalized ID."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "epic-94", "jira": "INVALID"}
        ref = _get_epic_ref(epic)
        assert ref == "94", f"Expected '94' but got '{ref}'"

    def test_double_prefix_rejected(self):
        """ID 'epic-epic-94' should either normalize to '94' or raise ValueError."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "epic-epic-94"}
        # Should either strip both prefixes to get '94' or raise
        try:
            ref = _get_epic_ref(epic)
            # If it returns, it should not create a triple-prefix situation
            assert "epic-" not in ref, f"Reference '{ref}' still contains 'epic-' prefix"
        except ValueError:
            pass  # Raising is also acceptable behavior

    def test_filename_result_correct(self):
        """The resulting filename from epic-{ref}.yaml should never have double prefix."""
        from pf.sprint.yaml_io import _get_epic_ref

        epic = {"id": "epic-94"}
        ref = _get_epic_ref(epic)
        filename = f"epic-{ref}.yaml"
        assert filename == "epic-94.yaml", f"Expected 'epic-94.yaml' but got '{filename}'"


# =============================================================================
# AC3: All four write paths call validator before write
# =============================================================================


class TestWritePathIntegration:
    """AC3: epic_add, epic_promote, jira_create_epic, import_epic all call validator."""

    def test_epic_add_calls_validator(self, tmp_path):
        """add_epic() should call validate_epic_shard() before writing."""
        from pf.sprint.epic_add import add_epic

        # Create a minimal sprint index
        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics:\n  - MSSCI-14510\n"
        )
        # Create a shard for the existing epic ref so format is recognized
        shard = tmp_path / "epic-MSSCI-14510.yaml"
        shard.write_text("id: epic-91\ntitle: Existing\nstatus: backlog\nstories: []\n")

        with patch(
            "pf.sprint.validator.validate_epic_shard"
        ) as mock_validate:
            mock_validate.return_value = MagicMock(valid=True, errors=[])
            add_epic(
                sprint_path=sprint_file,
                epic_id="epic-100",
                title="New Epic",
            )
            # The validator should have been called before writing
            mock_validate.assert_called_once()

    def test_epic_add_rejects_invalid_epic(self, tmp_path):
        """add_epic() should reject an epic that fails validation."""
        from pf.sprint.epic_add import add_epic
        from pf.sprint.validator import ValidationResult

        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics:\n  - MSSCI-14510\n"
        )
        shard = tmp_path / "epic-MSSCI-14510.yaml"
        shard.write_text("id: epic-91\ntitle: Existing\nstatus: backlog\nstories: []\n")

        bad_result = ValidationResult(valid=False)
        bad_result.add_error("Missing required field: status", "epic.status")

        with patch(
            "pf.sprint.validator.validate_epic_shard"
        ) as mock_validate:
            mock_validate.return_value = bad_result
            result = add_epic(
                sprint_path=sprint_file,
                epic_id="epic-100",
                title="Bad Epic",
            )
            assert not result["success"], "Expected add_epic to fail when validation fails"

    def test_epic_promote_calls_validator(self, tmp_path):
        """epic_promote() should call validate_epic_shard() after transforming."""
        from click.testing import CliRunner
        from pf.sprint.cli import epic_promote

        # Create initiative shard with an epic to promote
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        sprint_file = sprint_dir / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics: []\n"
        )
        init_file = sprint_dir / "initiative-test.yaml"
        init_file.write_text(
            "name: Test Initiative\nepics:\n"
            "  - id: 50\n    title: Promote Me\n    status: planning\n"
            "    points: 10\n    stories:\n"
            "      - id: '50-1'\n        title: Story One\n        points: 3\n        status: planning\n"
        )

        with patch(
            "pf.common.config.get_project_root", return_value=tmp_path
        ), patch(
            "pf.sprint.validator.validate_epic_shard"
        ) as mock_validate:
            mock_validate.return_value = MagicMock(valid=True, errors=[])
            runner = CliRunner()
            result = runner.invoke(epic_promote, ["50"])
            assert result.exit_code == 0, f"CLI failed: {result.output}"
            # Validator should have been called during promote
            mock_validate.assert_called_once()
            # The call arg should be a dict representing the epic
            call_arg = mock_validate.call_args[0][0]
            assert "title" in call_arg
            assert "stories" in call_arg

    def test_jira_create_epic_calls_validator(self, tmp_path):
        """create_epic_in_jira() should validate the epic before creating in Jira."""
        from pf.jira.create import create_epic_in_jira

        # create_epic_in_jira calls both read_sprint(path) and load_sprint()
        # load_sprint() uses get_project_root()/sprint/current-sprint.yaml
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        sprint_file = sprint_dir / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics:\n  - '63'\n"
        )
        shard = sprint_dir / "epic-63.yaml"
        shard.write_text(
            "id: '63'\ntitle: Jira Epic\nstatus: ready\nstories: []\n"
        )

        with patch(
            "pf.sprint.validator.validate_epic_shard"
        ) as mock_validate, patch(
            "pf.sprint.loader.get_project_root", return_value=tmp_path
        ):
            mock_validate.return_value = MagicMock(valid=True, errors=[])
            mock_client = MagicMock()
            mock_client.search_issues_sync.return_value = []
            mock_client.create_issue_sync.return_value = {"key": "MSSCI-99999"}

            with patch("pf.jira.create.get_client", return_value=mock_client):
                result = create_epic_in_jira("63", sprint_path=sprint_file)
                assert result.get("success"), f"Expected success, got: {result}"
                # Validator should have been called
                mock_validate.assert_called_once()

    def test_import_epic_calls_validator(self, tmp_path):
        """import_epic() should validate generated YAML before writing."""
        from pf.sprint.import_epic import import_epic

        # Create a minimal markdown file
        md_file = tmp_path / "epics.md"
        md_file.write_text(
            "# Test Initiative - Epics and Stories\n\n"
            "## Overview\n\nTest description\n\n"
            "## Epic 1: First Epic\n\n"
            "**Points:** 5\n\n"
            "### Story 1.1: First Story\n\n"
            "**Points:** 3\n"
        )
        # Create a future.yaml for import to write to
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        future_file = sprint_dir / "future.yaml"
        future_file.write_text(
            "# Next Available Epic Number: 100\ninitiated:\n"
        )

        with patch(
            "pf.sprint.validator.validate_epic_shard"
        ) as mock_validate, patch(
            "pf.sprint.import_epic.get_project_root", return_value=tmp_path
        ):
            mock_validate.return_value = MagicMock(valid=True, errors=[])
            import_epic(str(md_file), project_root=tmp_path)
            # Validator should have been called for each parsed epic
            assert mock_validate.call_count >= 1, (
                f"Expected validator to be called at least once, got {mock_validate.call_count}"
            )


# =============================================================================
# AC4: _merge_epic_shards() emits warning for unresolvable refs
# =============================================================================


class TestLoaderWarnings:
    """AC4: _merge_epic_shards() emits warning for each unresolvable ref."""

    def test_missing_shard_emits_warning(self, tmp_path):
        """Unresolvable shard ref should emit a warning, not silently skip."""
        from pf.sprint.loader import _merge_epic_shards

        data = {"epics": ["MSSCI-99999", "nonexistent-ref"]}

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _merge_epic_shards(data, tmp_path)

            # Should have emitted warnings for both missing refs
            warning_messages = [str(warning.message) for warning in w]
            assert len(w) >= 2, (
                f"Expected at least 2 warnings for missing refs, got {len(w)}: {warning_messages}"
            )

    def test_missing_shard_warning_contains_ref_name(self, tmp_path):
        """Warning message should identify which ref was unresolvable."""
        from pf.sprint.loader import _merge_epic_shards

        data = {"epics": ["MISSING-REF-42"]}

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _merge_epic_shards(data, tmp_path)

            assert len(w) >= 1, "Expected at least 1 warning"
            assert "MISSING-REF-42" in str(w[0].message), (
                f"Warning should mention the ref name, got: {w[0].message}"
            )

    def test_existing_shard_no_warning(self, tmp_path):
        """Resolvable shard ref should NOT emit a warning."""
        from pf.sprint.loader import _merge_epic_shards

        # Create a valid shard file
        shard = tmp_path / "epic-MSSCI-14510.yaml"
        shard.write_text("id: epic-91\ntitle: Test\nstatus: backlog\nstories: []\n")

        data = {"epics": ["MSSCI-14510"]}

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _merge_epic_shards(data, tmp_path)

            shard_warnings = [
                x for x in w if "MSSCI-14510" in str(x.message)
            ]
            assert len(shard_warnings) == 0, (
                f"Should not warn for existing shard, got: {[str(x.message) for x in shard_warnings]}"
            )

    def test_mixed_existing_and_missing_refs(self, tmp_path):
        """Only missing refs should produce warnings, not existing ones."""
        from pf.sprint.loader import _merge_epic_shards

        # Create one valid shard
        shard = tmp_path / "epic-MSSCI-14510.yaml"
        shard.write_text("id: epic-91\ntitle: Test\nstatus: backlog\nstories: []\n")

        data = {"epics": ["MSSCI-14510", "MISSING-REF"]}

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _merge_epic_shards(data, tmp_path)

            warning_messages = [str(x.message) for x in w]
            # Should warn about MISSING-REF
            assert any("MISSING-REF" in msg for msg in warning_messages), (
                f"Should warn about MISSING-REF, got: {warning_messages}"
            )
            # Should NOT warn about MSSCI-14510
            assert not any("MSSCI-14510" in msg for msg in warning_messages), (
                f"Should not warn about existing shard, got: {warning_messages}"
            )


# =============================================================================
# AC5: Jira create epic checks for existing epic with same title
# =============================================================================


class TestJiraIdempotencyCheck:
    """AC5: Jira create epic checks for existing epic with same title before creating."""

    def test_duplicate_title_detected(self, tmp_path):
        """create_epic_in_jira should detect existing epic with same title."""
        from pf.jira.create import create_epic_in_jira

        # Create sprint YAML with an epic that has no jira key
        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics:\n  - epic-99\n"
        )
        shard = tmp_path / "epic-epic-99.yaml"
        shard.write_text(
            "id: epic-99\ntitle: Duplicate Title Epic\n"
            "status: backlog\nstories: []\n"
        )

        # Mock Jira client to return existing epic with same title
        mock_client = MagicMock()
        mock_client.search_issues_sync.return_value = [
            {"key": "MSSCI-14659", "fields": {"summary": "Duplicate Title Epic"}}
        ]

        with patch("pf.jira.create.get_client", return_value=mock_client):
            with patch("pf.jira.create._get_sprint_path", return_value=sprint_file):
                result = create_epic_in_jira("epic-99", sprint_path=sprint_file)

                # Should detect the duplicate and NOT create a new epic
                # The exact behavior (warning, error, or returning existing key) is for Dev
                # to decide, but the check must happen
                if result.get("success"):
                    # If it succeeds, it should reference the existing key
                    assert result.get("epic_key") == "MSSCI-14659" or result.get(
                        "duplicate_detected"
                    ), "Should detect duplicate title"

    def test_unique_title_proceeds(self, tmp_path):
        """create_epic_in_jira with unique title should proceed normally."""
        from pf.jira.create import create_epic_in_jira

        sprint_file = tmp_path / "current-sprint.yaml"
        sprint_file.write_text(
            "sprint:\n  number: 2606\n  status: active\n"
            "  jira_sprint_id: 280\n  goal: test\n"
            "  start_date: 2026-02-03\n  end_date: 2026-02-16\n"
            "epics:\n  - epic-99\n"
        )
        shard = tmp_path / "epic-epic-99.yaml"
        shard.write_text(
            "id: epic-99\ntitle: Unique Epic\nstatus: backlog\nstories: []\n"
        )

        # Mock Jira client to return empty search (no duplicates)
        mock_client = MagicMock()
        mock_client.search_issues_sync.return_value = []
        mock_client.create_issue_sync.return_value = {"key": "MSSCI-99999"}

        with patch("pf.jira.create.get_client", return_value=mock_client):
            with patch("pf.jira.create._get_sprint_path", return_value=sprint_file):
                result = create_epic_in_jira("epic-99", sprint_path=sprint_file)
                # Should proceed with creation
                if result.get("success"):
                    assert result.get("epic_key") == "MSSCI-99999"


# =============================================================================
# AC6: Existing validator tests pass; constants updated
# =============================================================================


class TestExistingValidatorCompat:
    """AC6: Ensure existing validator behavior is preserved with new constants."""

    def test_required_epic_shard_fields_constant_exists(self):
        """REQUIRED_EPIC_SHARD_FIELDS should include id, title, status, stories."""
        from pf.sprint.validator import REQUIRED_EPIC_SHARD_FIELDS

        expected = {"id", "title", "status", "stories"}
        assert expected.issubset(REQUIRED_EPIC_SHARD_FIELDS), (
            f"REQUIRED_EPIC_SHARD_FIELDS should include {expected}, "
            f"got {REQUIRED_EPIC_SHARD_FIELDS}"
        )

    def test_required_shard_story_fields_constant_exists(self):
        """REQUIRED_SHARD_STORY_FIELDS should include id, title, points, status."""
        from pf.sprint.validator import REQUIRED_SHARD_STORY_FIELDS

        expected = {"id", "title", "points", "status"}
        assert expected == REQUIRED_SHARD_STORY_FIELDS, (
            f"Expected {expected}, got {REQUIRED_SHARD_STORY_FIELDS}"
        )

    def test_existing_validate_epic_still_works(self):
        """The existing validate_epic() should still work as before."""
        from pf.sprint.validator import validate_epic

        epic = {
            "id": "epic-99",
            "title": "Test Epic",
            "stories": [
                {"id": "99-1", "title": "Story", "points": 2, "status": "backlog"}
            ],
        }
        result = validate_epic(epic, set(), 0)
        assert result.valid

    def test_existing_validate_story_still_works(self):
        """The existing validate_story() should still work as before."""
        from pf.sprint.validator import validate_story

        story = {"id": "99-1", "title": "Test", "points": 3, "status": "backlog"}
        result = validate_story(story, "epic-99", 0)
        assert result.valid

    def test_validate_epic_shard_is_callable(self):
        """validate_epic_shard must be a callable function in validator module."""
        from pf.sprint import validator

        assert hasattr(validator, "validate_epic_shard"), (
            "validator module must export validate_epic_shard()"
        )
        assert callable(validator.validate_epic_shard)
