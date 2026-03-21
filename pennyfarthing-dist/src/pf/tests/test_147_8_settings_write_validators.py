"""Tests for write-time validators on settings and repo writers — Story 147-8.

RED phase: These tests define the expected behavior of validators that
reject invalid data before persisting to config.local.yaml and repos.yaml.
All tests should FAIL until validators are implemented.

Validation functions under test:
- validate_setting(key, value) -> ValidationResult
- validate_repo_field(repo_name, field, value, project_root) -> ValidationResult

Both integrated into set_setting/set_setting_typed/set_repo_field write paths.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.git.repos import set_repo_field
from pf.settings.settings import DEFAULTS, set_setting, set_setting_typed
from pf.sprint.validator import ValidationResult


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_REPOS_YAML = {
    "pr_title_format": "{jira_key} - {type}({scope}): {title}",
    "repos": {
        "orchestrator": {
            "path": ".",
            "type": "orchestrator",
            "description": "Sprint management",
            "default_branch": "main",
            "branch_strategy": "trunk-based",
            "test_command": "pytest",
            "simplify": False,
            "pr_strategy": "standard",
        },
        "pennyfarthing": {
            "path": "pennyfarthing",
            "type": "framework",
            "description": "Framework source",
            "default_branch": "develop",
            "branch_strategy": "gitflow",
            "simplify": False,
        },
    },
}


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Set up a project with .pennyfarthing/ containing config and repos."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(
        yaml.dump(SAMPLE_REPOS_YAML, default_flow_style=False)
    )
    # Write a minimal config.local.yaml
    (pf_dir / "config.local.yaml").write_text(
        yaml.dump({"theme": "firefly"}, default_flow_style=False)
    )
    return tmp_path


def _read_repos_yaml(project: Path) -> dict:
    return yaml.safe_load((project / ".pennyfarthing" / "repos.yaml").read_text())


def _read_config_yaml(project: Path) -> dict:
    return yaml.safe_load((project / ".pennyfarthing" / "config.local.yaml").read_text())


# ===========================================================================
# 1. validate_setting — exists and returns ValidationResult
# ===========================================================================


class TestValidateSettingExists:
    """A validate_setting function must exist and return ValidationResult."""

    def test_validate_setting_importable(self) -> None:
        from pf.settings.validators import validate_setting  # noqa: F401

    def test_returns_validation_result(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("theme", "firefly")
        assert isinstance(result, ValidationResult)


# ===========================================================================
# 2. Settings — reject unknown keys
# ===========================================================================


class TestSettingsRejectUnknownKeys:
    """Settings writes should reject keys not present in DEFAULTS."""

    def test_unknown_top_level_key_rejected(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("nonexistent_setting", "value")
        assert not result.valid
        assert any("unknown" in e.message.lower() or "not a known" in e.message.lower()
                    for e in result.errors)

    def test_unknown_nested_key_rejected(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.nonexistent_key", "value")
        assert not result.valid

    def test_known_top_level_key_accepted(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("theme", "firefly")
        assert result.valid

    def test_known_nested_key_accepted(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.relay_mode", True)
        assert result.valid


# ===========================================================================
# 3. Settings — type validation for bool settings
# ===========================================================================


class TestSettingsTypeValidation:
    """Bool settings should reject non-bool values."""

    def test_bool_setting_rejects_string(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.relay_mode", "not_a_bool")
        assert not result.valid

    def test_bool_setting_accepts_true(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.relay_mode", True)
        assert result.valid

    def test_bool_setting_accepts_false(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.relay_mode", False)
        assert result.valid

    def test_bool_setting_rejects_int(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.git_monitor", 1)
        assert not result.valid


# ===========================================================================
# 4. Settings — constrained value validation (select widgets)
# ===========================================================================


class TestSettingsConstrainedValues:
    """Settings with select widgets should only accept valid options."""

    def test_permission_mode_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("permission_mode", "yolo")
        assert not result.valid

    def test_permission_mode_accepts_standard(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("permission_mode", "standard")
        assert result.valid

    def test_permission_mode_accepts_accept(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("permission_mode", "accept")
        assert result.valid

    def test_permission_mode_accepts_strict(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("permission_mode", "strict")
        assert result.valid

    def test_pr_mode_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.pr_mode", "invalid_mode")
        assert not result.valid

    def test_pr_mode_accepts_draft(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.pr_mode", "draft")
        assert result.valid

    def test_pr_merge_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.pr_merge", "yeet")
        assert not result.valid

    def test_startup_agent_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.startup_agent", "batman")
        assert not result.valid

    def test_startup_agent_accepts_sm(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.startup_agent", "sm")
        assert result.valid

    def test_portrait_size_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("portrait_size", "gigantic")
        assert not result.valid

    def test_portrait_position_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("portrait_position", "center")
        assert not result.valid

    def test_portrait_dock_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("portrait_dock", "middle")
        assert not result.valid


# ===========================================================================
# 5. Settings — string settings accept strings
# ===========================================================================


class TestSettingsStringValidation:
    """String/input settings should accept string values."""

    def test_jira_project_accepts_string(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("jira.project", "PROJ")
        assert result.valid

    def test_jira_url_accepts_string(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("jira.url", "https://example.atlassian.net")
        assert result.valid


# ===========================================================================
# 6. Settings — empty key rejected
# ===========================================================================


class TestSettingsEmptyKey:
    """Empty or blank keys should be rejected."""

    def test_empty_key_rejected(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("", "value")
        assert not result.valid

    def test_whitespace_key_rejected(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("   ", "value")
        assert not result.valid


# ===========================================================================
# 7. Settings write integration — set_setting rejects invalid data
# ===========================================================================


class TestSetSettingIntegration:
    """set_setting and set_setting_typed should reject invalid data before write."""

    def test_set_setting_typed_rejects_invalid_permission_mode(self, project: Path, monkeypatch) -> None:
        monkeypatch.setattr("pf.settings.settings.get_project_root", lambda: project)
        result = set_setting_typed("permission_mode", "yolo")
        assert result.get("success") is False
        assert "error" in result

    def test_set_setting_rejects_unknown_key(self, project: Path, monkeypatch) -> None:
        monkeypatch.setattr("pf.settings.settings.get_project_root", lambda: project)
        result = set_setting("totally.fake.key", "value")
        assert result.get("success") is False

    def test_set_setting_typed_rejects_bool_as_string(self, project: Path, monkeypatch) -> None:
        monkeypatch.setattr("pf.settings.settings.get_project_root", lambda: project)
        result = set_setting_typed("workflow.relay_mode", "not_a_bool")
        assert result.get("success") is False

    def test_set_setting_typed_does_not_persist_invalid(self, project: Path, monkeypatch) -> None:
        """Invalid writes must not modify config.local.yaml."""
        monkeypatch.setattr("pf.settings.settings.get_project_root", lambda: project)
        original = (project / ".pennyfarthing" / "config.local.yaml").read_text()
        set_setting_typed("permission_mode", "yolo")
        after = (project / ".pennyfarthing" / "config.local.yaml").read_text()
        assert original == after

    def test_set_setting_typed_valid_write_succeeds(self, project: Path, monkeypatch) -> None:
        """Valid writes should still work after adding validators."""
        monkeypatch.setattr("pf.settings.settings.get_project_root", lambda: project)
        monkeypatch.setattr("pf.common.config.get_project_root", lambda: project)
        result = set_setting_typed("workflow.relay_mode", True)
        # After validation is added, set_setting_typed returns a result dict
        # For now it returns the config dict — once integrated, it returns {success, ...}
        # Accept either: the function should not raise
        assert result is not None


# ===========================================================================
# 8. validate_repo_field — exists and returns ValidationResult
# ===========================================================================


class TestValidateRepoFieldExists:
    """A validate_repo_field function must exist and return ValidationResult."""

    def test_validate_repo_field_importable(self) -> None:
        from pf.settings.validators import validate_repo_field  # noqa: F401

    def test_returns_validation_result(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("description", "some description")
        assert isinstance(result, ValidationResult)


# ===========================================================================
# 9. Repo fields — constrained values (branch_strategy, pr_strategy)
# ===========================================================================


class TestRepoFieldConstrainedValues:
    """Repo fields with select options should only accept valid choices."""

    def test_branch_strategy_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("branch_strategy", "yolo-driven")
        assert not result.valid

    def test_branch_strategy_accepts_trunk_based(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("branch_strategy", "trunk-based")
        assert result.valid

    def test_branch_strategy_accepts_gitflow(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("branch_strategy", "gitflow")
        assert result.valid

    def test_pr_strategy_rejects_invalid(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("pr_strategy", "chaos")
        assert not result.valid

    def test_pr_strategy_accepts_standard(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("pr_strategy", "standard")
        assert result.valid

    def test_pr_strategy_accepts_stacked(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("pr_strategy", "stacked")
        assert result.valid


# ===========================================================================
# 10. Repo fields — type validation (bool fields)
# ===========================================================================


class TestRepoFieldTypeValidation:
    """Bool repo fields should reject non-bool values."""

    def test_simplify_rejects_string(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("simplify", "yes")
        assert not result.valid

    def test_simplify_accepts_true(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("simplify", True)
        assert result.valid

    def test_simplify_accepts_false(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("simplify", False)
        assert result.valid

    def test_simplify_rejects_int(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("simplify", 1)
        assert not result.valid


# ===========================================================================
# 11. Repo fields — read-only fields rejected
# ===========================================================================


class TestRepoFieldReadOnly:
    """Read-only fields should not be writable."""

    def test_owns_field_rejected(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("owns", ["some/path"])
        assert not result.valid

    def test_never_edit_field_rejected(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("never_edit", ["node_modules/"])
        assert not result.valid

    def test_symlinks_field_rejected(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("symlinks", {".claude": "pennyfarthing-dist"})
        assert not result.valid

    def test_type_field_rejected(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("type", "api")
        assert not result.valid


# ===========================================================================
# 12. Repo fields — string fields accept strings
# ===========================================================================


class TestRepoFieldStringValidation:
    """String/input fields should accept string values."""

    def test_description_accepts_string(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("description", "A useful description")
        assert result.valid

    def test_test_command_accepts_string(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("test_command", "pytest -x")
        assert result.valid

    def test_build_command_accepts_string(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("build_command", "make build")
        assert result.valid

    def test_default_branch_accepts_string(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("default_branch", "main")
        assert result.valid


# ===========================================================================
# 13. Repo writer integration — set_repo_field rejects invalid data
# ===========================================================================


class TestSetRepoFieldIntegration:
    """set_repo_field should reject invalid data before writing to disk."""

    def test_rejects_invalid_branch_strategy(self, project: Path) -> None:
        result = set_repo_field(
            "orchestrator", "branch_strategy", "yolo", project_root=project
        )
        assert result["success"] is False
        assert "error" in result

    def test_rejects_write_to_readonly_field(self, project: Path) -> None:
        result = set_repo_field(
            "orchestrator", "owns", ["some/path"], project_root=project
        )
        assert result["success"] is False

    def test_rejects_non_bool_for_simplify(self, project: Path) -> None:
        result = set_repo_field(
            "orchestrator", "simplify", "yes", project_root=project
        )
        assert result["success"] is False

    def test_does_not_persist_invalid_write(self, project: Path) -> None:
        """Invalid writes must not modify repos.yaml."""
        original = (project / ".pennyfarthing" / "repos.yaml").read_text()
        set_repo_field("orchestrator", "branch_strategy", "yolo", project_root=project)
        after = (project / ".pennyfarthing" / "repos.yaml").read_text()
        assert original == after

    def test_valid_write_still_succeeds(self, project: Path) -> None:
        """Valid writes should still work after adding validators."""
        result = set_repo_field(
            "orchestrator", "description", "Updated", project_root=project
        )
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["orchestrator"]["description"] == "Updated"

    def test_rejects_invalid_pr_strategy(self, project: Path) -> None:
        result = set_repo_field(
            "orchestrator", "pr_strategy", "chaos", project_root=project
        )
        assert result["success"] is False


# ===========================================================================
# 14. Validation error messages are actionable
# ===========================================================================


class TestValidationErrorMessages:
    """Validation errors should include helpful context."""

    def test_unknown_setting_error_mentions_key(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("totally.fake", "value")
        assert not result.valid
        assert any("totally.fake" in e.message for e in result.errors)

    def test_invalid_option_error_lists_valid_options(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("permission_mode", "yolo")
        assert not result.valid
        assert any("standard" in e.message.lower() for e in result.errors)

    def test_type_error_mentions_expected_type(self) -> None:
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.relay_mode", "not_a_bool")
        assert not result.valid
        assert any("bool" in e.message.lower() for e in result.errors)

    def test_readonly_error_mentions_readonly(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("owns", ["x"])
        assert not result.valid
        assert any("read" in e.message.lower() for e in result.errors)

    def test_repo_field_constraint_error_lists_options(self) -> None:
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("branch_strategy", "yolo")
        assert not result.valid
        assert any("trunk-based" in e.message.lower() or "gitflow" in e.message.lower()
                    for e in result.errors)
