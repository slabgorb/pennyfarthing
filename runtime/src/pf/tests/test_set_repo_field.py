"""Tests for set_repo_field writer — Story 147-6.

Verifies that set_repo_field() can update individual fields in
.pennyfarthing/repos.yaml, returning result objects and preserving
existing data.

RED state: Tests will fail until set_repo_field is implemented in
pf/git/repos.py.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.git.repos import set_repo_field


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
    """Set up a project with .pennyfarthing/repos.yaml."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(
        yaml.dump(SAMPLE_REPOS_YAML, default_flow_style=False)
    )
    return tmp_path


def _read_repos_yaml(project: Path) -> dict:
    """Helper to read back repos.yaml after mutation."""
    return yaml.safe_load((project / ".pennyfarthing" / "repos.yaml").read_text())


# ===========================================================================
# 1. Result object format
# ===========================================================================


class TestResultObjectFormat:
    """set_repo_field returns {success, data?, error?} — never throws."""

    def test_success_result_has_success_true(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "description", "Updated", project_root=project)
        assert result["success"] is True

    def test_success_result_has_data_key(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "description", "Updated", project_root=project)
        assert "data" in result

    def test_error_result_has_success_false(self, project: Path) -> None:
        result = set_repo_field("nonexistent_repo", "description", "x", project_root=project)
        assert result["success"] is False

    def test_error_result_has_error_key(self, project: Path) -> None:
        result = set_repo_field("nonexistent_repo", "description", "x", project_root=project)
        assert "error" in result
        assert isinstance(result["error"], str)
        assert len(result["error"]) > 0

    def test_does_not_throw_on_missing_repo(self, project: Path) -> None:
        """Must return error result, not raise an exception."""
        result = set_repo_field("ghost_repo", "field", "value", project_root=project)
        assert result["success"] is False


# ===========================================================================
# 2. Happy path — update existing field
# ===========================================================================


class TestUpdateExistingField:
    """Updating a field that already exists on a known repo."""

    def test_updates_string_field(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "description", "New description", project_root=project)
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["orchestrator"]["description"] == "New description"

    def test_updates_boolean_field(self, project: Path) -> None:
        result = set_repo_field("pennyfarthing", "simplify", True, project_root=project)
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["pennyfarthing"]["simplify"] is True

    def test_updates_default_branch(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "default_branch", "develop", project_root=project)
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["orchestrator"]["default_branch"] == "develop"

    def test_data_contains_old_and_new_value(self, project: Path) -> None:
        """Result data should include the previous and new value."""
        result = set_repo_field("orchestrator", "description", "Changed", project_root=project)
        assert result["success"] is True
        assert result["data"]["old_value"] == "Sprint management"
        assert result["data"]["new_value"] == "Changed"


# ===========================================================================
# 3. Add new field to repo entry
# ===========================================================================


class TestAddNewField:
    """Adding a field that doesn't yet exist on the repo entry."""

    def test_adds_new_string_field(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "lint_command", "ruff check", project_root=project)
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["orchestrator"]["lint_command"] == "ruff check"

    def test_adds_new_boolean_field(self, project: Path) -> None:
        result = set_repo_field("orchestrator", "simplify", True, project_root=project)
        assert result["success"] is True
        data = _read_repos_yaml(project)
        assert data["repos"]["orchestrator"]["simplify"] is True

    def test_old_value_is_none_for_new_field(self, project: Path) -> None:
        """When adding a new field, old_value should be None."""
        result = set_repo_field("orchestrator", "lint_command", "ruff check", project_root=project)
        assert result["success"] is True
        assert result["data"]["old_value"] is None


# ===========================================================================
# 4. Preserves other repo fields when updating one
# ===========================================================================


class TestPreservesOtherFields:
    """Updating one field must not clobber other fields on the same repo."""

    def test_other_fields_unchanged_on_same_repo(self, project: Path) -> None:
        set_repo_field("orchestrator", "description", "Changed", project_root=project)
        data = _read_repos_yaml(project)
        repo = data["repos"]["orchestrator"]
        assert repo["path"] == "."
        assert repo["type"] == "orchestrator"
        assert repo["default_branch"] == "main"
        assert repo["branch_strategy"] == "trunk-based"
        assert repo["test_command"] == "pytest"

    def test_other_repos_unchanged(self, project: Path) -> None:
        set_repo_field("orchestrator", "description", "Changed", project_root=project)
        data = _read_repos_yaml(project)
        pf_repo = data["repos"]["pennyfarthing"]
        assert pf_repo["description"] == "Framework source"
        assert pf_repo["default_branch"] == "develop"
        assert pf_repo["type"] == "framework"

    def test_top_level_keys_preserved(self, project: Path) -> None:
        """Top-level keys like pr_title_format must survive repo field edits."""
        set_repo_field("orchestrator", "description", "Changed", project_root=project)
        data = _read_repos_yaml(project)
        assert data["pr_title_format"] == "{jira_key} - {type}({scope}): {title}"


# ===========================================================================
# 5. Missing/unknown repo name → error result
# ===========================================================================


class TestMissingRepo:
    """Unknown repo names return error results, not exceptions."""

    def test_unknown_repo_returns_error(self, project: Path) -> None:
        result = set_repo_field("no_such_repo", "description", "x", project_root=project)
        assert result["success"] is False
        assert "no_such_repo" in result["error"]

    def test_unknown_repo_does_not_modify_file(self, project: Path) -> None:
        original = (project / ".pennyfarthing" / "repos.yaml").read_text()
        set_repo_field("no_such_repo", "description", "x", project_root=project)
        after = (project / ".pennyfarthing" / "repos.yaml").read_text()
        assert original == after


# ===========================================================================
# 6. Edge cases — missing file, empty YAML, no repos key
# ===========================================================================


class TestEdgeCases:
    """Degenerate inputs that should return error results, not crash."""

    def test_missing_repos_yaml(self, tmp_path: Path) -> None:
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # No repos.yaml file
        result = set_repo_field("orchestrator", "description", "x", project_root=tmp_path)
        assert result["success"] is False
        assert "error" in result

    def test_empty_repos_yaml(self, tmp_path: Path) -> None:
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text("")
        result = set_repo_field("orchestrator", "description", "x", project_root=tmp_path)
        assert result["success"] is False

    def test_repos_yaml_without_repos_key(self, tmp_path: Path) -> None:
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(yaml.dump({"something_else": True}))
        result = set_repo_field("orchestrator", "description", "x", project_root=tmp_path)
        assert result["success"] is False

    def test_no_pennyfarthing_dir(self, tmp_path: Path) -> None:
        result = set_repo_field("orchestrator", "description", "x", project_root=tmp_path)
        assert result["success"] is False

    def test_noop_when_value_unchanged(self, project: Path) -> None:
        """Setting a field to its current value should still succeed."""
        result = set_repo_field("orchestrator", "description", "Sprint management", project_root=project)
        assert result["success"] is True
        assert result["data"]["old_value"] == result["data"]["new_value"]
