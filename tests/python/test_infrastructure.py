"""
Tests for Python script infrastructure (Story 63-4).

These tests verify the pf package structure and core utilities.
Run with: python -m pytest tests/python/ -v
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
# The pf package moved under a src layout in 5d92bf792.
PACKAGE_ROOT = PROJECT_ROOT / "pennyfarthing-dist" / "src" / "pf"


class TestPyprojectToml:
    """Tests for pyproject.toml configuration."""

    def test_pyproject_toml_exists(self):
        """pyproject.toml should exist at project root."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        assert pyproject.exists(), "pyproject.toml not found at project root"

    def test_pyproject_has_project_name(self):
        """pyproject.toml should define project name."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        content = pyproject.read_text()
        assert 'name = "pennyfarthing-scripts"' in content

    def test_pyproject_has_python_version(self):
        """pyproject.toml should require Python 3.11+."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        content = pyproject.read_text()
        assert 'requires-python = ">=3.11"' in content

    def test_pyproject_has_core_dependencies(self):
        """pyproject.toml should list core dependencies."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        content = pyproject.read_text()
        assert "pyyaml" in content.lower()
        assert "httpx" in content.lower()


class TestPackageStructure:
    """Tests for pf package structure."""

    def test_package_directory_exists(self):
        """pf/ directory should exist."""
        assert PACKAGE_ROOT.exists(), f"pf/ directory not found at {PACKAGE_ROOT}"
        assert PACKAGE_ROOT.is_dir(), "pf should be a directory"

    def test_package_init_exists(self):
        """pf/__init__.py should exist."""
        init_file = PACKAGE_ROOT / "__init__.py"
        assert init_file.exists(), "__init__.py not found"

    def test_package_importable(self):
        """pf should be importable."""
        # Add package to path for import test
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            import pf
            assert pf.__version__
        finally:
            sys.path.pop(0)

    def test_config_module_exists(self):
        """pf/common/config.py should exist (config moved into pf.common)."""
        config_file = PACKAGE_ROOT / "common" / "config.py"
        assert config_file.exists(), "config.py module not found"

    def test_sprint_module_exists(self):
        """pf/sprint package should exist."""
        sprint_dir = PACKAGE_ROOT / "sprint"
        assert sprint_dir.exists(), "sprint package not found"
        assert sprint_dir.is_dir(), "sprint should be a package directory"
        assert (sprint_dir / "__init__.py").exists(), "sprint/__init__.py not found"

    def test_jira_module_exists(self):
        """pf/jira package should exist."""
        jira_dir = PACKAGE_ROOT / "jira"
        assert jira_dir.exists(), "jira package not found"
        assert jira_dir.is_dir(), "jira should be a package directory"
        assert (jira_dir / "__init__.py").exists(), "jira/__init__.py not found"


class TestConfigModule:
    """Tests for config loading utilities."""

    @pytest.fixture
    def config_module(self):
        """Import config module."""
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            from pf.common import config
            yield config
        finally:
            sys.path.pop(0)

    def test_load_yaml_config(self, config_module):
        """load_yaml_config should load YAML files."""
        # Use actual config file
        config_path = PROJECT_ROOT / ".pennyfarthing" / "config.local.yaml"
        if config_path.exists():
            result = config_module.load_yaml_config(config_path)
            assert isinstance(result, dict)

    def test_load_yaml_config_missing_file(self, config_module):
        """load_yaml_config should return None for missing files."""
        result = config_module.load_yaml_config(Path("/nonexistent/file.yaml"))
        assert result is None

    def test_get_project_root(self, config_module):
        """get_project_root should return project root path."""
        root = config_module.get_project_root()
        assert root.exists()
        # package.json is gone (JS/TS removed in 038d3c6f0); .pennyfarthing/ is
        # the marker get_project_root actually walks up looking for.
        assert (root / ".pennyfarthing").exists()


class TestSprintModule:
    """Tests for sprint YAML parsing."""

    @pytest.fixture
    def sprint_module(self):
        """Import sprint module."""
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            from pf import sprint
            yield sprint
        finally:
            sys.path.pop(0)

    def test_load_current_sprint(self, sprint_module):
        """load_current_sprint should load sprint/current-sprint.yaml."""
        data = sprint_module.load_current_sprint()
        assert data is not None
        assert "sprint" in data
        assert "epics" in data

    def test_get_sprint_info(self, sprint_module):
        """get_sprint_info should return sprint metadata."""
        info = sprint_module.get_sprint_info()
        assert "number" in info
        assert "status" in info

    def test_get_story_by_id(self, sprint_module):
        """get_story_by_id should find stories by ID."""
        # Dynamically find a real story ID from the sprint
        all_stories = sprint_module.get_all_stories()
        assert len(all_stories) > 0, "Sprint should have at least one story"
        first_story = all_stories[0]
        story_id = first_story["id"]

        story = sprint_module.get_story_by_id(story_id)
        assert story is not None
        assert story["id"] == story_id
        assert "title" in story

    def test_get_story_by_id_not_found(self, sprint_module):
        """get_story_by_id should return None for unknown IDs."""
        story = sprint_module.get_story_by_id("nonexistent-999")
        assert story is None

    def test_get_stories_by_status(self, sprint_module):
        """get_stories_by_status should filter stories."""
        backlog = sprint_module.get_stories_by_status("backlog")
        assert isinstance(backlog, list)
        for story in backlog:
            assert story["status"] == "backlog"


class TestJiraModule:
    """Tests for Jira CLI wrapper."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            from pf import jira
            yield jira
        finally:
            sys.path.pop(0)

    def test_jira_cli_available(self, jira_module):
        """jira CLI should be available."""
        assert jira_module.is_jira_cli_available()

    # Module-level get_issue/update_issue_status were replaced by the REST client:
    # JiraClient.get_issue_sync and pf.jira.operations.move_issue (result object).

    def test_get_issue(self, jira_module, monkeypatch):
        """JiraClient.get_issue_sync should fetch issue details via the REST API."""
        client = jira_module.JiraClient()
        monkeypatch.setattr(
            client,
            "_call_api_sync",
            lambda *args, **kwargs: {
                "key": "PROJ-12398",
                "fields": {"summary": "Test"},
            },
        )

        issue = client.get_issue_sync("PROJ-12398")
        assert issue["key"] == "PROJ-12398"

    def test_get_issue_not_found(self, jira_module, monkeypatch):
        """get_issue_sync should return None for missing issues."""
        client = jira_module.JiraClient()
        monkeypatch.setattr(client, "_call_api_sync", lambda *args, **kwargs: None)

        assert client.get_issue_sync("NONEXISTENT-999") is None

    def test_update_issue_status(self, jira_module, monkeypatch):
        """move_issue should transition issues and return a result object."""
        operations = jira_module.operations
        client = MagicMock()
        client.get_issue_sync.return_value = {
            "fields": {"status": {"name": "To Do"}}
        }
        client.transition_sync.return_value = {"success": True}
        monkeypatch.setattr(operations, "get_client", lambda *a, **kw: client)

        result = operations.move_issue("PROJ-12398", "In Progress")
        assert result["success"] is True
        client.transition_sync.assert_called_once_with("PROJ-12398", "In Progress")

    def test_update_issue_status_already_at_target(self, jira_module, monkeypatch):
        """move_issue should short-circuit when already at the target status."""
        operations = jira_module.operations
        client = MagicMock()
        client.get_issue_sync.return_value = {
            "fields": {"status": {"name": "In Progress"}}
        }
        monkeypatch.setattr(operations, "get_client", lambda *a, **kw: client)

        result = operations.move_issue("PROJ-12398", "In Progress")
        assert result["success"] is True
        assert result["already_at_status"] is True
        client.transition_sync.assert_not_called()
