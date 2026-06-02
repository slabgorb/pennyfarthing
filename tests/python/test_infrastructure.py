"""
Tests for Python script infrastructure (Story 63-4).

These tests verify the pf package structure and core utilities.
Run with: python -m pytest tests/python/ -v
"""

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock

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
    """Tests for pf package structure."""

    def test_package_directory_exists(self):
        """pf/ directory should exist."""
        package_dir = PROJECT_ROOT / "pf"
        assert package_dir.exists(), "pf/ directory not found"
        assert package_dir.is_dir(), "pf should be a directory"

    def test_package_init_exists(self):
        """pf/__init__.py should exist."""
        init_file = PROJECT_ROOT / "pf" / "__init__.py"
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
        """pf/config.py should exist."""
        config_file = PROJECT_ROOT / "pf" / "config.py"
        assert config_file.exists(), "config.py module not found"

    def test_sprint_module_exists(self):
        """pf/sprint package should exist."""
        sprint_dir = PROJECT_ROOT / "pf" / "sprint"
        assert sprint_dir.exists(), "sprint package not found"
        assert sprint_dir.is_dir(), "sprint should be a package directory"
        assert (sprint_dir / "__init__.py").exists(), "sprint/__init__.py not found"

    def test_jira_module_exists(self):
        """pf/jira package should exist."""
        jira_dir = PROJECT_ROOT / "pf" / "jira"
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
        assert (root / "package.json").exists()  # Pennyfarthing marker


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

    def test_get_issue(self, jira_module, monkeypatch):
        """get_issue should fetch issue details via CLI."""
        # Mock subprocess to avoid actual Jira calls
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = '{"key": "PROJ-12398", "fields": {"summary": "Test"}}'
        monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: mock_result)

        issue = jira_module.get_issue("PROJ-12398")
        assert issue["key"] == "PROJ-12398"

    def test_get_issue_not_found(self, jira_module, monkeypatch):
        """get_issue should return None for missing issues."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Issue not found"
        monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: mock_result)

        issue = jira_module.get_issue("NONEXISTENT-999")
        assert issue is None

    def test_update_issue_status(self, jira_module, monkeypatch):
        """update_issue_status should transition issues."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: mock_result)

        result = jira_module.update_issue_status("PROJ-12398", "In Progress")
        assert result is True
