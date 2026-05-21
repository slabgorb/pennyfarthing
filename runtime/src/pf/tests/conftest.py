"""Pytest configuration for pf tests.

Story 63-9: Reorganize pf into fan-out CLI pattern.
Story 126-1: Updated for src/ layout migration.
"""

import sys
from collections.abc import Generator
from pathlib import Path

import pytest

# Project root (where pyproject.toml lives): src/pf/tests -> src/pf -> src -> pennyfarthing-dist
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# For src-layout, add src/ to sys.path so "import pf" resolves to src/pf/
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


@pytest.fixture(autouse=True)
def _no_real_tmux(monkeypatch):
    """Block all real tmux calls globally.

    Every tmux interaction goes through pf.tmux.panes._run_tmux.
    Mock it to return a safe error dict so no panes are ever spawned.
    """
    from unittest.mock import MagicMock

    mock = MagicMock(return_value={"success": False, "error": "blocked by test fixture"})
    monkeypatch.setattr("pf.tmux.panes._run_tmux", mock)


@pytest.fixture(autouse=True)
def textual_app_context():
    """Provide a Textual app context for all tests.

    Many Textual widgets (Input, Switch, Select) access self.app during
    initialization. This sets the active_app context variable so widgets
    can be created outside a running event loop.
    """
    from unittest.mock import MagicMock, PropertyMock, patch

    from textual._context import active_app, active_message_pump
    from textual.app import App

    class _MinimalApp(App):
        pass

    app = _MinimalApp()
    # Mock the screen property to avoid ScreenStackError
    mock_screen = MagicMock()
    mock_screen.scroll_target_y = 0
    with patch.object(type(app), "screen", new_callable=PropertyMock, return_value=mock_screen):
        token = active_app.set(app)
        pump_token = active_message_pump.set(app)
        yield app
        active_message_pump.reset(pump_token)
        active_app.reset(token)


@pytest.fixture
def project_root() -> Path:
    """Return the project root path."""
    return PROJECT_ROOT


@pytest.fixture
def sprint_yaml_path(project_root: Path) -> Path:
    """Return path to current-sprint.yaml."""
    return project_root / "sprint" / "current-sprint.yaml"


@pytest.fixture
def mock_jira_client() -> Generator:
    """Mock JiraClient for tests that don't need real API calls."""
    from unittest.mock import MagicMock, patch

    mock_client = MagicMock()
    mock_client.get_issue_sync.return_value = {
        "key": "PROJ-12345",
        "fields": {
            "summary": "Test Issue",
            "status": {"name": "To Do"},
            "customfield_10031": 3,
        },
    }
    mock_client.get_issue_async.return_value = mock_client.get_issue_sync.return_value
    mock_client.create_issue_sync.return_value = {"key": "PROJ-12346", "id": "10001"}

    with patch("pf.jira.client.JiraClient", return_value=mock_client):
        yield mock_client


@pytest.fixture
def sample_sprint_data() -> dict:
    """Return sample sprint data for testing."""
    return {
        "sprint": {
            "name": "TO Sprint 2604",
            "jira_sprint_id": 276,
            "status": "active",
            "start_date": "2026-01-20",
            "end_date": "2026-02-02",
        },
        "epics": [
            {
                "id": "epic-63",
                "title": "Test Epic",
                "jira": "PROJ-12000",
                "stories": [
                    {
                        "id": "63-1",
                        "title": "First Story",
                        "status": "backlog",
                        "points": 3,
                        "jira": "PROJ-12001",
                    },
                    {
                        "id": "63-2",
                        "title": "Second Story",
                        "status": "in_progress",
                        "points": 5,
                        "jira": "PROJ-12002",
                    },
                ],
            },
        ],
    }


@pytest.fixture
def pf_config_root(tmp_path, monkeypatch):
    """Fixture that routes pf.paths.config_path() into a controlled tmp dir.

    Sets CLAUDE_PLUGIN_DATA so that paths.config_path(tmp_path) resolves
    to <plugin_data>/projects/<hash>/config.local.yaml instead of the
    legacy .pennyfarthing/ layout.  Also sets GIT_CEILING_DIRECTORIES so
    that paths.project_root() doesn't walk up into an enclosing repo.

    Usage::

        def test_something(pf_config_root):
            root = pf_config_root.project_dir
            pf_config_root.write_config("theme: test\\n")
            # call production code with project_dir=root
            # then read back via pf_config_root.read_text()
    """
    from pf import paths

    plugin_data = tmp_path / "plugin_data"
    plugin_data.mkdir()
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

    project_dir = tmp_path / "project"
    project_dir.mkdir()

    class _ConfigRoot:
        def __init__(self, pd):
            self.project_dir = pd

        @property
        def config_path(self):
            return paths.config_path(self.project_dir)

        def write_config(self, text: str) -> None:
            p = self.config_path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)

        def read_text(self) -> str:
            return self.config_path.read_text()

        def read_config(self) -> dict:
            import yaml
            return yaml.safe_load(self.read_text()) or {}

    yield _ConfigRoot(project_dir)


@pytest.fixture
def sample_jira_issue() -> dict:
    """Return sample Jira issue data for testing."""
    return {
        "key": "PROJ-12345",
        "id": "10001",
        "fields": {
            "summary": "Test Story",
            "description": {"type": "doc", "content": []},
            "status": {"name": "To Do"},
            "issuetype": {"name": "Story"},
            "priority": {"name": "Medium"},
            "customfield_10031": 3,  # Story points
            "customfield_10020": [  # Sprint
                {"id": 276, "name": "TO Sprint 2604", "state": "active"}
            ],
        },
    }
