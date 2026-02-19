"""Pytest configuration for pf tests.

Story 63-9: Reorganize pf into fan-out CLI pattern.
"""

import sys
from collections.abc import Generator
from pathlib import Path

import pytest

# Ensure the package is importable
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


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
        "key": "MSSCI-12345",
        "fields": {
            "summary": "Test Issue",
            "status": {"name": "To Do"},
            "customfield_10031": 3,
        },
    }
    mock_client.get_issue_async.return_value = mock_client.get_issue_sync.return_value
    mock_client.create_issue_sync.return_value = {"key": "MSSCI-12346", "id": "10001"}

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
                "jira": "MSSCI-12000",
                "stories": [
                    {
                        "id": "63-1",
                        "title": "First Story",
                        "status": "backlog",
                        "points": 3,
                        "jira": "MSSCI-12001",
                    },
                    {
                        "id": "63-2",
                        "title": "Second Story",
                        "status": "in_progress",
                        "points": 5,
                        "jira": "MSSCI-12002",
                    },
                ],
            },
        ],
    }


@pytest.fixture
def sample_jira_issue() -> dict:
    """Return sample Jira issue data for testing."""
    return {
        "key": "MSSCI-12345",
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
