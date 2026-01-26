"""
Tests for porting remaining jira-lib.mjs functions to Python (Story 63-7).

Run with: python -m pytest tests/python/test_jira_lib_port.py -v

Acceptance Criteria Coverage:
- [ ] All jira-lib.mjs utility functions ported
- [ ] jira-sync-story.mjs replaced with Python equivalent
- [ ] Epic creation logic ported from TypeScript
- [ ] Existing bash scripts can call Python versions
- [ ] Tests cover new Python code
- [ ] Backwards compatibility maintained
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# =============================================================================
# Tests for sprint.py additions (find_story, get_story_field)
# =============================================================================


class TestFindStory:
    """Tests for find_story() function in sprint.py."""

    @pytest.fixture
    def sprint_module(self):
        """Import sprint module."""
        from pennyfarthing_scripts import sprint
        return sprint

    @pytest.fixture
    def sample_epic(self):
        """Sample epic data for testing."""
        return {
            "id": "epic-63",
            "title": "Script Parallelism & Python Migration",
            "stories": [
                {"id": "63-1", "title": "Fix background tasks", "status": "done"},
                {"id": "63-2", "title": "Parallelize git-status-all", "status": "done"},
                {"id": "63-7", "title": "Port remaining Jira scripts", "status": "in_progress"},
            ],
        }

    def test_find_story_exists(self, sprint_module):
        """find_story function should exist."""
        assert hasattr(sprint_module, "find_story")

    def test_find_story_by_id(self, sprint_module, sample_epic):
        """Should find story by exact ID match."""
        story = sprint_module.find_story(sample_epic, "63-7")
        assert story is not None
        assert story["id"] == "63-7"
        assert story["title"] == "Port remaining Jira scripts"

    def test_find_story_not_found(self, sprint_module, sample_epic):
        """Should return None if story not found."""
        story = sprint_module.find_story(sample_epic, "63-99")
        assert story is None

    def test_find_story_none_epic(self, sprint_module):
        """Should handle None epic gracefully."""
        story = sprint_module.find_story(None, "63-7")
        assert story is None

    def test_find_story_no_stories(self, sprint_module):
        """Should handle epic with no stories."""
        epic = {"id": "epic-63", "title": "Empty Epic"}
        story = sprint_module.find_story(epic, "63-1")
        assert story is None


class TestGetStoryField:
    """Tests for get_story_field() function in sprint.py."""

    @pytest.fixture
    def sprint_module(self):
        """Import sprint module."""
        from pennyfarthing_scripts import sprint
        return sprint

    @pytest.fixture
    def sample_sprint_data(self):
        """Sample sprint data for testing."""
        return {
            "sprint": {"number": 12, "status": "active"},
            "epics": [
                {
                    "id": "epic-63",
                    "title": "Python Migration",
                    "stories": [
                        {
                            "id": "63-7",
                            "jira": "MSSCI-12401",
                            "title": "Port remaining Jira scripts",
                            "status": "in_progress",
                            "points": 3,
                            "workflow": "tdd",
                            "branch": "feat/63-7-jira-scripts-python",
                        },
                    ],
                },
            ],
        }

    def test_get_story_field_exists(self, sprint_module):
        """get_story_field function should exist."""
        assert hasattr(sprint_module, "get_story_field")

    def test_get_story_field_status(self, sprint_module, sample_sprint_data):
        """Should get status field from story."""
        status = sprint_module.get_story_field(sample_sprint_data, "63-7", "status")
        assert status == "in_progress"

    def test_get_story_field_points(self, sprint_module, sample_sprint_data):
        """Should get points field from story."""
        points = sprint_module.get_story_field(sample_sprint_data, "63-7", "points")
        assert points == 3

    def test_get_story_field_workflow(self, sprint_module, sample_sprint_data):
        """Should get workflow field from story."""
        workflow = sprint_module.get_story_field(sample_sprint_data, "63-7", "workflow")
        assert workflow == "tdd"

    def test_get_story_field_jira(self, sprint_module, sample_sprint_data):
        """Should get jira field from story."""
        jira = sprint_module.get_story_field(sample_sprint_data, "63-7", "jira")
        assert jira == "MSSCI-12401"

    def test_get_story_field_missing(self, sprint_module, sample_sprint_data):
        """Should return None for missing field."""
        value = sprint_module.get_story_field(sample_sprint_data, "63-7", "nonexistent")
        assert value is None

    def test_get_story_field_story_not_found(self, sprint_module, sample_sprint_data):
        """Should return None if story not found."""
        value = sprint_module.get_story_field(sample_sprint_data, "99-99", "status")
        assert value is None

    def test_get_story_field_extracts_epic_from_story_id(self, sprint_module, sample_sprint_data):
        """Should extract epic number from story ID (e.g., '63-7' -> epic 63)."""
        # Story 63-7 should be found in epic-63
        status = sprint_module.get_story_field(sample_sprint_data, "63-7", "status")
        assert status == "in_progress"


# =============================================================================
# Tests for jira.py additions (check_dependencies, map_github_to_jira)
# =============================================================================


class TestCheckDependencies:
    """Tests for check_dependencies() function in jira.py."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        from pennyfarthing_scripts import jira
        return jira

    def test_check_dependencies_exists(self, jira_module):
        """check_dependencies function should exist."""
        assert hasattr(jira_module, "check_dependencies")

    def test_check_dependencies_returns_dict(self, jira_module, mocker):
        """Should return a dict with available and missing lists."""
        mocker.patch("shutil.which", return_value="/usr/local/bin/jira")
        mocker.patch.dict("os.environ", {"JIRA_API_TOKEN": "test-token"})

        result = jira_module.check_dependencies()
        assert isinstance(result, dict)
        assert "available" in result
        assert "missing" in result

    def test_check_dependencies_detects_missing_cli(self, jira_module, mocker):
        """Should detect missing jira CLI."""
        mocker.patch("shutil.which", return_value=None)
        mocker.patch.dict("os.environ", {"JIRA_API_TOKEN": "test-token"})

        result = jira_module.check_dependencies()
        assert "jira" in result["missing"]

    def test_check_dependencies_detects_missing_token(self, jira_module, mocker):
        """Should detect missing JIRA_API_TOKEN."""
        mocker.patch("shutil.which", return_value="/usr/local/bin/jira")
        mocker.patch.dict("os.environ", {}, clear=True)

        result = jira_module.check_dependencies()
        assert "JIRA_API_TOKEN" in result["missing"]

    def test_check_dependencies_all_present(self, jira_module, mocker):
        """Should return empty missing list when all present."""
        mocker.patch("shutil.which", return_value="/usr/local/bin/jira")
        mocker.patch.dict("os.environ", {"JIRA_API_TOKEN": "test-token"})
        mocker.patch("pathlib.Path.exists", return_value=True)

        result = jira_module.check_dependencies()
        assert len(result["missing"]) == 0

    def test_check_dependencies_quiet_mode(self, jira_module, mocker, capsys):
        """Should suppress output in quiet mode."""
        mocker.patch("shutil.which", return_value="/usr/local/bin/jira")
        mocker.patch.dict("os.environ", {"JIRA_API_TOKEN": "test-token"})

        jira_module.check_dependencies(quiet=True)
        captured = capsys.readouterr()
        assert captured.out == ""


class TestMapGithubToJira:
    """Tests for map_github_to_jira() function in jira.py."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        from pennyfarthing_scripts import jira
        return jira

    def test_map_github_to_jira_exists(self, jira_module):
        """map_github_to_jira function should exist."""
        assert hasattr(jira_module, "map_github_to_jira")

    def test_map_github_to_jira_known_user(self, jira_module):
        """Should map known GitHub users to Jira emails."""
        assert jira_module.map_github_to_jira("slabgorb") == "keith.avery@1898andco.io"

    def test_map_github_to_jira_arcaven(self, jira_module):
        """Should map arcaven to correct email."""
        assert jira_module.map_github_to_jira("arcaven") == "michael.pursifull@1898andco.io"

    def test_map_github_to_jira_unknown_user(self, jira_module):
        """Should generate email for unknown users."""
        result = jira_module.map_github_to_jira("unknown-user")
        assert result == "unknown-user@1898andco.io"

    def test_map_github_to_jira_none(self, jira_module):
        """Should handle None input."""
        result = jira_module.map_github_to_jira(None)
        assert result is None


# =============================================================================
# Tests for jira_sync_story.py (CLI for single story sync)
# =============================================================================


class TestJiraSyncStoryModule:
    """Tests for jira_sync_story.py module existence."""

    def test_module_exists(self):
        """jira_sync_story.py module should exist."""
        jira_sync_story_path = PROJECT_ROOT / "pennyfarthing_scripts" / "jira_sync_story.py"
        assert jira_sync_story_path.exists(), "jira_sync_story.py not found"

    def test_module_imports(self):
        """jira_sync_story module should import without error."""
        from pennyfarthing_scripts import jira_sync_story
        assert jira_sync_story is not None


class TestJiraSyncStoryCLI:
    """Tests for jira_sync_story.py CLI interface."""

    @pytest.fixture
    def sync_story_module(self):
        """Import jira_sync_story module."""
        from pennyfarthing_scripts import jira_sync_story
        return sync_story_module

    def test_parse_args_exists(self):
        """parse_args function should exist."""
        from pennyfarthing_scripts import jira_sync_story
        assert hasattr(jira_sync_story, "parse_args")

    def test_parse_args_story_key(self):
        """Should parse story key from args."""
        from pennyfarthing_scripts.jira_sync_story import parse_args
        args = parse_args(["63-7"])
        assert args.story_key == "63-7"

    def test_parse_args_transition_flag(self):
        """Should parse --transition flag."""
        from pennyfarthing_scripts.jira_sync_story import parse_args
        args = parse_args(["63-7", "--transition"])
        assert args.transition is True

    def test_parse_args_points_flag(self):
        """Should parse --points flag."""
        from pennyfarthing_scripts.jira_sync_story import parse_args
        args = parse_args(["63-7", "--points"])
        assert args.points is True

    def test_parse_args_comment_flag(self):
        """Should parse --comment with message."""
        from pennyfarthing_scripts.jira_sync_story import parse_args
        args = parse_args(["63-7", "--comment", "Test comment"])
        assert args.comment == "Test comment"

    def test_parse_args_dry_run_flag(self):
        """Should parse --dry-run flag."""
        from pennyfarthing_scripts.jira_sync_story import parse_args
        args = parse_args(["63-7", "--dry-run"])
        assert args.dry_run is True


class TestJiraSyncStoryFunctions:
    """Tests for jira_sync_story.py main functions."""

    @pytest.fixture
    def sync_story_module(self):
        """Import jira_sync_story module."""
        from pennyfarthing_scripts import jira_sync_story
        return jira_sync_story

    def test_sync_story_function_exists(self, sync_story_module):
        """sync_story function should exist."""
        assert hasattr(sync_story_module, "sync_story")

    def test_sync_story_returns_result(self, sync_story_module, mocker):
        """sync_story should return a result dict."""
        mocker.patch.object(
            sync_story_module, "get_story_from_sprint", return_value={
                "id": "63-7",
                "jira": "MSSCI-12401",
                "status": "in_progress",
                "points": 3,
            }
        )
        mocker.patch.object(
            sync_story_module, "fetch_jira_issue", return_value={
                "fields": {"status": {"name": "To Do"}}
            }
        )

        result = sync_story_module.sync_story("63-7", dry_run=True)
        assert isinstance(result, dict)
        assert "success" in result

    def test_sync_story_not_found(self, sync_story_module, mocker):
        """Should handle story not found in sprint YAML."""
        mocker.patch.object(
            sync_story_module, "get_story_from_sprint", return_value=None
        )

        result = sync_story_module.sync_story("nonexistent", dry_run=True)
        assert result["success"] is False
        assert "not found" in result.get("error", "").lower()


# =============================================================================
# Tests for jira_epic_creation.py (epic creation logic)
# =============================================================================


class TestJiraEpicCreationModule:
    """Tests for jira_epic_creation.py module existence."""

    def test_module_exists(self):
        """jira_epic_creation.py module should exist."""
        epic_creation_path = PROJECT_ROOT / "pennyfarthing_scripts" / "jira_epic_creation.py"
        assert epic_creation_path.exists(), "jira_epic_creation.py not found"

    def test_module_imports(self):
        """jira_epic_creation module should import without error."""
        from pennyfarthing_scripts import jira_epic_creation
        assert jira_epic_creation is not None


class TestJiraEpicCreation:
    """Tests for epic creation functionality."""

    @pytest.fixture
    def epic_creation_module(self):
        """Import jira_epic_creation module."""
        from pennyfarthing_scripts import jira_epic_creation
        return epic_creation_module

    def test_create_epic_function_exists(self):
        """create_epic function should exist."""
        from pennyfarthing_scripts import jira_epic_creation
        assert hasattr(jira_epic_creation, "create_epic")

    def test_create_epic_returns_result(self, mocker):
        """create_epic should return a result dict."""
        from pennyfarthing_scripts import jira_epic_creation

        mocker.patch.object(
            jira_epic_creation, "call_jira_api", return_value={
                "key": "MSSCI-12500",
                "id": "12500",
            }
        )

        result = jira_epic_creation.create_epic(
            title="Test Epic",
            description="Test description",
            dry_run=True,
        )
        assert isinstance(result, dict)
        assert "success" in result

    def test_create_epic_dry_run(self, mocker):
        """Dry run should not make actual API calls."""
        from pennyfarthing_scripts import jira_epic_creation

        mock_api = mocker.patch.object(jira_epic_creation, "call_jira_api")

        result = jira_epic_creation.create_epic(
            title="Test Epic",
            description="Test description",
            dry_run=True,
        )

        # In dry run, should NOT call actual API
        mock_api.assert_not_called()
        assert result["dry_run"] is True


class TestEpicCreationFromSprintYAML:
    """Tests for creating epics from sprint YAML data."""

    def test_build_epic_payload_exists(self):
        """build_epic_payload function should exist."""
        from pennyfarthing_scripts import jira_epic_creation
        assert hasattr(jira_epic_creation, "build_epic_payload")

    def test_build_epic_payload_structure(self):
        """Should build correct Jira API payload structure."""
        from pennyfarthing_scripts import jira_epic_creation

        epic_data = {
            "id": "epic-63",
            "title": "Script Parallelism & Python Migration",
            "description": "Improve script performance through parallelism",
        }

        payload = jira_epic_creation.build_epic_payload(epic_data)

        assert "fields" in payload
        assert "summary" in payload["fields"]
        assert "description" in payload["fields"]
        assert "issuetype" in payload["fields"]
        assert payload["fields"]["issuetype"]["name"] == "Epic"


# =============================================================================
# Tests for backwards compatibility (bash can call Python)
# =============================================================================


class TestBackwardsCompatibility:
    """Tests for backwards compatibility with existing bash callers."""

    def test_jira_sync_story_can_run_as_script(self):
        """jira_sync_story.py should be runnable as a script."""
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.jira_sync_story", "--help"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        # Should not crash, and should show help
        assert result.returncode == 0 or "usage" in result.stdout.lower() or "usage" in result.stderr.lower()

    def test_jira_epic_creation_can_run_as_script(self):
        """jira_epic_creation.py should be runnable as a script."""
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.jira_epic_creation", "--help"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        # Should not crash, and should show help
        assert result.returncode == 0 or "usage" in result.stdout.lower() or "usage" in result.stderr.lower()
