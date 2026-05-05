"""Tests for jira/ library package.

Story 63-9: Reorganize pf into fan-out CLI pattern.

These tests verify the jira/ package modules work correctly
after reorganization from flat modules.
"""

from typing import Any


class TestJiraClient:
    """Tests for jira/client.py JiraClient class."""

    def test_jira_client_initialization(self) -> None:
        """JiraClient should initialize with default or custom values."""
        from pf.jira.client import JiraClient

        # Default initialization
        client = JiraClient()
        assert client.base_url is not None
        assert client.user is not None

        # Custom initialization
        client = JiraClient(
            base_url="https://custom.atlassian.net",
            user="test@example.com",
            token="test-token",
        )
        assert client.base_url == "https://custom.atlassian.net"
        assert client.user == "test@example.com"
        assert client.token == "test-token"

    def test_get_auth_header_returns_basic_auth(self) -> None:
        """_get_auth_header should return Basic auth header."""
        from pf.jira.client import JiraClient

        client = JiraClient(
            user="user@example.com",
            token="my-token",
        )
        headers = client._get_auth_header()

        assert "Authorization" in headers
        assert headers["Authorization"].startswith("Basic ")

    def test_get_auth_header_empty_without_token(self) -> None:
        """_get_auth_header should return empty dict without token."""
        from pf.jira.client import JiraClient

        client = JiraClient(token="")
        headers = client._get_auth_header()

        assert headers == {}

    def test_get_headers_includes_accept(self) -> None:
        """_get_headers should include Accept header."""
        from pf.jira.client import JiraClient

        client = JiraClient(token="test")
        headers = client._get_headers()

        assert "Accept" in headers
        assert headers["Accept"] == "application/json"

    def test_get_headers_includes_content_type_when_requested(self) -> None:
        """_get_headers should include Content-Type when content_type=True."""
        from pf.jira.client import JiraClient

        client = JiraClient(token="test")
        headers = client._get_headers(content_type=True)

        assert "Content-Type" in headers
        assert headers["Content-Type"] == "application/json"


class TestStatusMappings:
    """Tests for status mapping functions in jira/client.py."""

    def test_map_status_to_jira_known_status(self) -> None:
        """map_status_to_jira should map known statuses correctly."""
        from pf.jira.client import map_status_to_jira

        assert map_status_to_jira("backlog") == "To Do"
        assert map_status_to_jira("in-progress") == "In Progress"
        assert map_status_to_jira("in_progress") == "In Progress"
        assert map_status_to_jira("done") == "Done"
        assert map_status_to_jira("review") == "In Review"

    def test_map_status_to_jira_unknown_defaults_to_todo(self) -> None:
        """map_status_to_jira should default to 'To Do' for unknown."""
        from pf.jira.client import map_status_to_jira

        assert map_status_to_jira("unknown_status") == "To Do"
        assert map_status_to_jira(None) == "To Do"

    def test_map_jira_to_status_known_status(self) -> None:
        """map_jira_to_status should map known Jira statuses correctly."""
        from pf.jira.client import map_jira_to_status

        assert map_jira_to_status("To Do") == "backlog"
        assert map_jira_to_status("In Progress") == "in_progress"
        assert map_jira_to_status("Done") == "done"
        assert map_jira_to_status("In Review") == "in_review"

    def test_map_jira_to_status_unknown_defaults_to_backlog(self) -> None:
        """map_jira_to_status should default to 'backlog' for unknown."""
        from pf.jira.client import map_jira_to_status

        assert map_jira_to_status("Unknown Status") == "backlog"
        assert map_jira_to_status(None) == "backlog"


class TestExtractJiraKey:
    """Tests for extract_jira_key function."""

    def test_extract_jira_key_from_key(self) -> None:
        """extract_jira_key should return key as-is if already a key."""
        from pf.jira.client import extract_jira_key

        assert extract_jira_key("PROJ-12345") == "PROJ-12345"

    def test_extract_jira_key_from_url(self) -> None:
        """extract_jira_key should extract key from URL."""
        from pf.jira.client import extract_jira_key

        url = "https://your-org.atlassian.net/browse/PROJ-12345"
        assert extract_jira_key(url) == "PROJ-12345"

    def test_extract_jira_key_returns_none_for_none(self) -> None:
        """extract_jira_key should return None for None input."""
        from pf.jira.client import extract_jira_key

        assert extract_jira_key(None) is None


class TestGetJiraField:
    """Tests for get_jira_field helper function."""

    def test_get_jira_field_simple_path(self) -> None:
        """get_jira_field should extract simple field paths."""
        from pf.jira.client import get_jira_field

        issue = {"key": "PROJ-123", "id": "10001"}
        assert get_jira_field(issue, "key") == "PROJ-123"

    def test_get_jira_field_nested_path(self) -> None:
        """get_jira_field should extract nested field paths."""
        from pf.jira.client import get_jira_field

        issue = {
            "fields": {
                "status": {"name": "In Progress"},
                "customfield_10031": 5,
            }
        }
        assert get_jira_field(issue, "fields.status.name") == "In Progress"
        assert get_jira_field(issue, "fields.customfield_10031") == 5

    def test_get_jira_field_returns_default_if_missing(self) -> None:
        """get_jira_field should return default for missing paths."""
        from pf.jira.client import get_jira_field

        issue = {"key": "PROJ-123"}
        assert get_jira_field(issue, "fields.missing", "default") == "default"
        assert get_jira_field(issue, "nonexistent") is None

    def test_get_jira_field_handles_none_input(self) -> None:
        """get_jira_field should handle None issue input."""
        from pf.jira.client import get_jira_field

        assert get_jira_field(None, "key", "default") == "default"


class TestJiraSyncModule:
    """Tests for jira/sync.py module."""

    def test_sync_result_dataclass(self) -> None:
        """SyncResult should be a valid dataclass."""
        from pf.jira.sync import SyncResult

        result = SyncResult(
            story_id="63-1",
            success=True,
            skipped=False,
            error=None,
            actions=["transitioned"],
            dry_run=False,
        )
        assert result.story_id == "63-1"
        assert result.success is True
        assert "transitioned" in result.actions

    def test_format_story_line(self) -> None:
        """format_story_line should format story for display."""
        from pf.jira.sync import format_story_line

        story = {"id": "63-1", "title": "Test Story", "status": "in_progress"}
        result = format_story_line(story)

        assert "63-1" in result
        assert "Test Story" in result
        assert "in_progress" in result

    def test_format_summary(self) -> None:
        """format_summary should format sync summary."""
        from pf.jira.sync import format_summary

        result = format_summary(synced=5, skipped=2, errors=1)

        assert "5" in result
        assert "2" in result
        assert "1" in result


class TestJiraBidirectionalModule:
    """Tests for jira/bidirectional.py module."""

    def test_sync_change_dataclass(self) -> None:
        """SyncChange should be a valid dataclass."""
        from pf.jira.bidirectional import SyncChange

        change = SyncChange(
            key="PROJ-12345",
            field="status",
            action="update-jira",
            yaml_value="in_progress",
            jira_value="To Do",
            target_value="In Progress",
        )
        assert change.key == "PROJ-12345"
        assert change.action == "update-jira"

    def test_sync_plan_dataclass(self) -> None:
        """SyncPlan should be a valid dataclass."""
        from pf.jira.bidirectional import SyncPlan

        plan = SyncPlan()
        assert plan.changes == []
        assert plan.yaml_only == []
        assert plan.jira_only == []
        assert plan.both == []

    def test_generate_sync_plan_empty_inputs(self) -> None:
        """generate_sync_plan should handle empty inputs."""
        from pf.jira.bidirectional import generate_sync_plan

        plan = generate_sync_plan([], [], sync_status=True)

        assert plan.changes == []
        assert plan.yaml_only == []
        assert plan.jira_only == []

    def test_generate_sync_plan_identifies_yaml_only(self) -> None:
        """generate_sync_plan should identify stories only in YAML."""
        from pf.jira.bidirectional import generate_sync_plan

        yaml_stories = [{"id": "63-1", "jira": "PROJ-12345", "status": "in_progress"}]
        jira_stories: list[dict[str, Any]] = []

        plan = generate_sync_plan(yaml_stories, jira_stories, sync_status=True)

        assert "PROJ-12345" in plan.yaml_only

    def test_generate_sync_plan_identifies_jira_only(self) -> None:
        """generate_sync_plan should identify stories only in Jira."""
        from pf.jira.bidirectional import generate_sync_plan

        yaml_stories: list[dict[str, Any]] = []
        jira_stories = [{"key": "PROJ-12345", "fields": {"status": {"name": "To Do"}}}]

        plan = generate_sync_plan(yaml_stories, jira_stories, sync_status=True)

        assert "PROJ-12345" in plan.jira_only

    def test_format_sync_plan(self) -> None:
        """format_sync_plan should return formatted string."""
        from pf.jira.bidirectional import (
            SyncPlan,
            format_sync_plan,
        )

        plan = SyncPlan(
            yaml_only=["PROJ-111"],
            jira_only=["PROJ-222"],
            both=["PROJ-333"],
        )
        result = format_sync_plan(plan)

        assert "PROJ-111" in result
        assert "PROJ-222" in result
        assert "Sync Plan" in result


class TestJiraEpicModule:
    """Tests for jira/epic.py module."""

    def test_build_epic_payload(self, monkeypatch) -> None:
        """build_epic_payload should create valid Jira API payload."""
        from pf.jira import epic as epic_module
        from pf.jira.epic import build_epic_payload

        monkeypatch.setattr(epic_module, "JIRA_PROJECT", "PROJ")

        epic_data = {"title": "Test Epic", "description": "Epic description"}
        payload = build_epic_payload(epic_data)

        assert "fields" in payload
        assert payload["fields"]["summary"] == "Test Epic"
        assert payload["fields"]["issuetype"]["name"] == "Epic"
        assert "description" in payload["fields"]
        assert payload["fields"]["project"]["key"] == "PROJ"

    def test_create_epic_dry_run(self, monkeypatch) -> None:
        """create_epic with dry_run should not call API."""
        from pf.jira import epic as epic_module
        from pf.jira.epic import create_epic

        monkeypatch.setattr(epic_module, "JIRA_PROJECT", "PROJ")

        result = create_epic("Test Epic", "Description", dry_run=True)

        assert result["success"] is True
        assert result["dry_run"] is True
        assert "payload" in result


class TestJiraStoryModule:
    """Tests for jira/story.py module."""

    def test_sync_story_missing_story(self) -> None:
        """sync_story should return error for missing story."""
        from pf.jira.story import sync_story

        result = sync_story("nonexistent-99", do_transition=False, dry_run=True)

        assert result["success"] is False
        assert "not found" in result.get("error", "").lower()
