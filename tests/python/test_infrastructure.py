"""
Tests for Python script infrastructure (Story 63-4).

These tests verify the pennyfarthing_scripts package structure and core utilities.
Run with: python -m pytest tests/python/ -v
"""

import subprocess
import sys
from pathlib import Path

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent


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
    """Tests for pennyfarthing_scripts package structure."""

    def test_package_directory_exists(self):
        """pennyfarthing_scripts/ directory should exist."""
        package_dir = PROJECT_ROOT / "pennyfarthing_scripts"
        assert package_dir.exists(), "pennyfarthing_scripts/ directory not found"
        assert package_dir.is_dir(), "pennyfarthing_scripts should be a directory"

    def test_package_init_exists(self):
        """pennyfarthing_scripts/__init__.py should exist."""
        init_file = PROJECT_ROOT / "pennyfarthing_scripts" / "__init__.py"
        assert init_file.exists(), "__init__.py not found"

    def test_package_importable(self):
        """pennyfarthing_scripts should be importable."""
        # Add package to path for import test
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            import pennyfarthing_scripts
            assert pennyfarthing_scripts.__version__
        finally:
            sys.path.pop(0)

    def test_config_module_exists(self):
        """pennyfarthing_scripts/config.py should exist."""
        config_file = PROJECT_ROOT / "pennyfarthing_scripts" / "config.py"
        assert config_file.exists(), "config.py module not found"

    def test_sprint_module_exists(self):
        """pennyfarthing_scripts/sprint.py should exist."""
        sprint_file = PROJECT_ROOT / "pennyfarthing_scripts" / "sprint.py"
        assert sprint_file.exists(), "sprint.py module not found"

    def test_jira_module_exists(self):
        """pennyfarthing_scripts/jira.py should exist."""
        jira_file = PROJECT_ROOT / "pennyfarthing_scripts" / "jira.py"
        assert jira_file.exists(), "jira.py module not found"


class TestConfigModule:
    """Tests for config loading utilities."""

    @pytest.fixture
    def config_module(self):
        """Import config module."""
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            from pennyfarthing_scripts import config
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
        assert (root / "package.json").exists()  # Pennyfarthing marker


class TestSprintModule:
    """Tests for sprint YAML parsing."""

    @pytest.fixture
    def sprint_module(self):
        """Import sprint module."""
        sys.path.insert(0, str(PROJECT_ROOT))
        try:
            from pennyfarthing_scripts import sprint
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
        # Use a known story ID from the sprint
        story = sprint_module.get_story_by_id("63-4")
        assert story is not None
        assert story["id"] == "63-4"
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
            from pennyfarthing_scripts import jira
            yield jira
        finally:
            sys.path.pop(0)

    def test_jira_cli_available(self, jira_module):
        """jira CLI should be available."""
        assert jira_module.is_jira_cli_available()

    def test_get_issue(self, jira_module, mocker):
        """get_issue should fetch issue details via CLI."""
        # Mock subprocess to avoid actual Jira calls
        mock_result = mocker.patch("subprocess.run")
        mock_result.return_value.returncode = 0
        mock_result.return_value.stdout = '{"key": "MSSCI-12398", "fields": {"summary": "Test"}}'

        issue = jira_module.get_issue("MSSCI-12398")
        assert issue["key"] == "MSSCI-12398"

    def test_get_issue_not_found(self, jira_module, mocker):
        """get_issue should return None for missing issues."""
        mock_result = mocker.patch("subprocess.run")
        mock_result.return_value.returncode = 1
        mock_result.return_value.stderr = "Issue not found"

        issue = jira_module.get_issue("NONEXISTENT-999")
        assert issue is None

    def test_update_issue_status(self, jira_module, mocker):
        """update_issue_status should transition issues."""
        mock_result = mocker.patch("subprocess.run")
        mock_result.return_value.returncode = 0

        result = jira_module.update_issue_status("MSSCI-12398", "In Progress")
        assert result is True
