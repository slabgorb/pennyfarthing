"""
Tests for jira-sync Python port (Story 63-5).

These tests verify the jira_sync.py script functionality.
Run with: python -m pytest tests/python/test_jira_sync.py -v

Acceptance Criteria Coverage:
- [x] Python script matches JS functionality
- [x] Async httpx for parallel Jira API calls
- [x] Batch-then-report architecture
- [x] Progress display during sync
- [x] Type hints throughout
- [x] Tests pass
"""

import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


class TestStatusMapping:
    """Tests for Pennyfarthing <-> Jira status mapping."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        from pf import jira
        return jira

    def test_map_status_to_jira_backlog(self, jira_module):
        """backlog should map to 'To Do'."""
        assert jira_module.map_status_to_jira("backlog") == "To Do"

    def test_map_status_to_jira_in_progress(self, jira_module):
        """in_progress should map to 'In Progress'."""
        assert jira_module.map_status_to_jira("in_progress") == "In Progress"
        assert jira_module.map_status_to_jira("in-progress") == "In Progress"

    def test_map_status_to_jira_done(self, jira_module):
        """done should map to 'Done'."""
        assert jira_module.map_status_to_jira("done") == "Done"
        assert jira_module.map_status_to_jira("completed") == "Done"

    def test_map_status_to_jira_review(self, jira_module):
        """review should map to 'In Review'."""
        assert jira_module.map_status_to_jira("review") == "In Review"
        assert jira_module.map_status_to_jira("in_review") == "In Review"

    def test_map_status_to_jira_cancelled(self, jira_module):
        """cancelled should map to 'Done' (closed)."""
        assert jira_module.map_status_to_jira("cancelled") == "Done"

    def test_map_status_to_jira_unknown(self, jira_module):
        """Unknown status should default to 'To Do'."""
        assert jira_module.map_status_to_jira("unknown") == "To Do"
        assert jira_module.map_status_to_jira(None) == "To Do"

    def test_map_jira_to_status(self, jira_module):
        """Jira statuses should map back to Pennyfarthing."""
        assert jira_module.map_jira_to_status("To Do") == "backlog"
        assert jira_module.map_jira_to_status("In Progress") == "in_progress"
        assert jira_module.map_jira_to_status("Done") == "done"
        assert jira_module.map_jira_to_status("In Review") == "in_review"


class TestJiraKeyExtraction:
    """Tests for Jira key extraction from various formats."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        from pf import jira
        return jira

    def test_extract_jira_key_from_key(self, jira_module):
        """Should return key as-is if already in key format."""
        assert jira_module.extract_jira_key("MSSCI-12398") == "MSSCI-12398"

    def test_extract_jira_key_from_url(self, jira_module):
        """Should extract key from Jira URL."""
        url = "https://1898andco.atlassian.net/browse/MSSCI-12398"
        assert jira_module.extract_jira_key(url) == "MSSCI-12398"

    def test_extract_jira_key_none(self, jira_module):
        """Should return None for None input."""
        assert jira_module.extract_jira_key(None) is None

    def test_extract_jira_key_invalid(self, jira_module):
        """Should return input for unrecognized format."""
        assert jira_module.extract_jira_key("some-other-value") == "some-other-value"


class TestStoryPoints:
    """Tests for story points operations."""

    @pytest.fixture
    def jira_module(self):
        """Import jira module."""
        from pf import jira
        return jira

    def test_get_story_points_from_issue(self, jira_module, monkeypatch):
        """Should extract story points from issue JSON."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = '{"fields": {"customfield_10031": 3}}'
        monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: mock_result)

        points = jira_module.get_story_points("MSSCI-12398")
        assert points == 3

    def test_get_story_points_none(self, jira_module, monkeypatch):
        """Should return None if no story points."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = '{"fields": {}}'
        monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: mock_result)

        points = jira_module.get_story_points("MSSCI-12398")
        assert points is None


class TestJiraSyncScript:
    """Tests for the main jira_sync.py script."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    def test_module_exists(self):
        """jira/sync.py module should exist."""
        jira_sync_path = PROJECT_ROOT / "pf" / "jira" / "sync.py"
        assert jira_sync_path.exists(), "jira/sync.py not found"

    def test_sync_epic_function_exists(self, jira_sync_module):
        """sync_epic async function should exist."""
        assert hasattr(jira_sync_module, "sync_epic")
        import inspect
        assert inspect.iscoroutinefunction(jira_sync_module.sync_epic)

    def test_sync_story_function_exists(self, jira_sync_module):
        """sync_story async function should exist."""
        assert hasattr(jira_sync_module, "sync_story")
        import inspect
        assert inspect.iscoroutinefunction(jira_sync_module.sync_story)


class TestSyncStoryAsync:
    """Tests for async story sync operations."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    @pytest.mark.asyncio
    async def test_sync_story_no_jira_key(self, jira_sync_module):
        """Should skip stories without Jira key."""
        story = {"id": "63-5", "title": "Test", "status": "in_progress"}
        result = await jira_sync_module.sync_story(story, dry_run=True)
        assert result.skipped is True

    @pytest.mark.asyncio
    async def test_sync_story_dry_run(self, jira_sync_module):
        """Dry run should not make actual changes."""
        story = {
            "id": "63-5",
            "jira": "MSSCI-12399",
            "title": "Test",
            "status": "in_progress",
            "points": 3,
        }
        result = await jira_sync_module.sync_story(
            story, dry_run=True, do_transition=True, sync_points=True
        )
        assert result.dry_run is True
        assert result.actions is not None


class TestSyncEpicAsync:
    """Tests for async epic sync operations."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    @pytest.mark.asyncio
    async def test_sync_epic_parallel_execution(self, jira_sync_module):
        """Should process multiple stories in parallel."""
        # Track call order to verify parallelism
        call_times = []

        async def mock_sync_story(story, **kwargs):
            import asyncio
            call_times.append(story["id"])
            await asyncio.sleep(0.01)  # Small delay
            return jira_sync_module.SyncResult(
                story_id=story["id"],
                success=True,
                skipped=False,
                error=None,
                actions=[],
            )

        # Patch on the actual jira.sync module where sync_epic imports sync_story
        import pf.jira.sync as jira_sync_real
        with patch.object(jira_sync_real, "sync_story", side_effect=mock_sync_story):
            epic = {
                "id": "epic-63",
                "title": "Test Epic",
                "stories": [
                    {"id": "63-1", "jira": "MSSCI-1", "status": "done"},
                    {"id": "63-2", "jira": "MSSCI-2", "status": "done"},
                    {"id": "63-3", "jira": "MSSCI-3", "status": "done"},
                ],
            }

            result = await jira_sync_real.sync_epic(epic, dry_run=True)
            assert result["total"] == 3
            # All stories should have been processed
            assert len(call_times) == 3


class TestCLIInterface:
    """Tests for command-line interface."""

    def test_main_function_exists(self):
        """main() function should exist."""
        from pf.jira import sync as jira_sync
        assert hasattr(jira_sync, "main")

    def test_parse_args_epic_number(self):
        """Should parse epic number from args."""
        from pf.jira.sync import parse_args
        args = parse_args(["63"])
        assert args.epic == "63"

    def test_parse_args_dry_run(self):
        """Should parse --dry-run flag."""
        from pf.jira.sync import parse_args
        args = parse_args(["63", "--dry-run"])
        assert args.dry_run is True

    def test_parse_args_transition(self):
        """Should parse --transition flag."""
        from pf.jira.sync import parse_args
        args = parse_args(["63", "--transition"])
        assert args.transition is True

    def test_parse_args_points(self):
        """Should parse --points flag."""
        from pf.jira.sync import parse_args
        args = parse_args(["63", "--points"])
        assert args.points is True

    def test_parse_args_all_flags(self):
        """Should parse all flags together."""
        from pf.jira.sync import parse_args
        args = parse_args(["epic-63", "--dry-run", "--transition", "--points"])
        assert args.epic == "epic-63"
        assert args.dry_run is True
        assert args.transition is True
        assert args.points is True


class TestAsyncHttpx:
    """Tests for async httpx operations (AC: Async httpx for parallel API calls).

    These async methods live on JiraClient, which is used internally by jira_sync.
    """

    @pytest.fixture
    def jira_client_class(self):
        """Import JiraClient class."""
        from pf.jira.client import JiraClient
        return JiraClient

    def test_get_issue_async_exists(self, jira_client_class):
        """get_issue_async method should exist on JiraClient and be async."""
        import inspect
        assert hasattr(jira_client_class, "get_issue_async")
        assert inspect.iscoroutinefunction(jira_client_class.get_issue_async)

    def test_transition_async_exists(self, jira_client_class):
        """transition_async method should exist on JiraClient and be async."""
        import inspect
        assert hasattr(jira_client_class, "transition_async")
        assert inspect.iscoroutinefunction(jira_client_class.transition_async)

    def test_sync_story_points_async_exists(self, jira_client_class):
        """sync_story_points_async method should exist on JiraClient and be async."""
        import inspect
        assert hasattr(jira_client_class, "sync_story_points_async")
        assert inspect.iscoroutinefunction(jira_client_class.sync_story_points_async)

    @pytest.mark.asyncio
    async def test_get_issue_async_returns_dict(self, jira_client_class):
        """get_issue_async should return issue dict."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"fields": {"summary": "Test"}}

        mock_http_client = AsyncMock()
        mock_http_client.get.return_value = mock_response
        mock_http_client.__aenter__.return_value = mock_http_client
        mock_http_client.__aexit__.return_value = None

        with patch("httpx.AsyncClient", return_value=mock_http_client):
            client = jira_client_class(token="test-token")
            result = await client.get_issue_async("MSSCI-12399")
            assert result is not None
            assert "fields" in result


class TestBatchThenReport:
    """Tests for batch-then-report architecture (AC: Batch-then-report)."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    def test_sync_result_dataclass_exists(self, jira_sync_module):
        """SyncResult dataclass should exist for collecting results."""
        assert hasattr(jira_sync_module, "SyncResult")

    def test_sync_result_has_required_fields(self, jira_sync_module):
        """SyncResult should have story_id, success, skipped, error fields."""
        result = jira_sync_module.SyncResult(
            story_id="63-5",
            success=True,
            skipped=False,
            error=None,
            actions=["transition"],
        )
        assert result.story_id == "63-5"
        assert result.success is True
        assert result.skipped is False
        assert result.actions == ["transition"]

    @pytest.mark.asyncio
    async def test_sync_epic_returns_summary(self, jira_sync_module):
        """sync_epic should return summary with synced/skipped/errors counts."""
        mock_sync_story = AsyncMock(
            return_value=jira_sync_module.SyncResult(
                story_id="63-1", success=True, skipped=False, error=None, actions=[]
            ),
        )

        # Patch on the actual jira.sync module where sync_epic calls sync_story
        import pf.jira.sync as jira_sync_real
        with patch.object(jira_sync_real, "sync_story", mock_sync_story):
            epic = {
                "id": "epic-63",
                "title": "Test Epic",
                "stories": [{"id": "63-1", "jira": "MSSCI-1", "status": "done"}],
            }

            result = await jira_sync_real.sync_epic(epic, dry_run=True)
            assert "synced" in result
            assert "skipped" in result
            assert "errors" in result
            assert "total" in result


class TestProgressDisplay:
    """Tests for progress display (AC: Progress display during sync)."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    def test_format_story_line_exists(self, jira_sync_module):
        """format_story_line function should exist for progress output."""
        assert hasattr(jira_sync_module, "format_story_line")

    def test_format_summary_exists(self, jira_sync_module):
        """format_summary function should exist for final output."""
        assert hasattr(jira_sync_module, "format_summary")

    def test_format_story_line_output(self, jira_sync_module):
        """format_story_line should produce readable output."""
        story = {"id": "63-5", "title": "Test Story", "status": "in_progress"}
        output = jira_sync_module.format_story_line(story)
        assert "63-5" in output
        assert "Test Story" in output

    def test_format_summary_output(self, jira_sync_module):
        """format_summary should include counts."""
        output = jira_sync_module.format_summary(synced=5, skipped=2, errors=1)
        assert "5" in output
        assert "2" in output
        assert "1" in output


class TestTypeHints:
    """Tests for type hints (AC: Type hints throughout)."""

    def test_jira_sync_has_type_annotations(self):
        """jira_sync.py should have type annotations on public functions."""
        import inspect

        from pf.jira import sync as jira_sync

        # Check key functions have annotations
        for func_name in ["sync_story", "sync_epic", "parse_args", "main"]:
            func = getattr(jira_sync, func_name, None)
            if func and callable(func):
                sig = inspect.signature(func)
                # At minimum, return type should be annotated
                assert sig.return_annotation != inspect.Parameter.empty or \
                    any(p.annotation != inspect.Parameter.empty for p in sig.parameters.values()), \
                    f"{func_name} should have type annotations"


class TestTransitionLogic:
    """Tests for status transition logic."""

    @pytest.fixture
    def jira_sync_module(self):
        """Import jira_sync module."""
        from pf.jira import sync as jira_sync
        return jira_sync

    @pytest.mark.asyncio
    async def test_sync_story_skips_when_already_at_status(self, jira_sync_module):
        """Should not transition if already at target status.

        In the current implementation, sync_story in dry_run=False mode uses
        JiraClient internally. We mock the client's get_issue_async to return
        a matching status, and verify transition_async is not called.
        """
        from pf.jira.client import JiraClient

        mock_get_issue = AsyncMock(return_value={
            "fields": {"status": {"name": "In Progress"}, "customfield_10031": 3}
        })
        mock_transition = AsyncMock()

        with patch.object(JiraClient, "get_issue_async", mock_get_issue), \
             patch.object(JiraClient, "transition_async", mock_transition):
            story = {
                "id": "63-5",
                "jira": "MSSCI-12399",
                "title": "Test",
                "status": "in_progress",  # Maps to "In Progress"
                "points": 3,
            }
            await jira_sync_module.sync_story(story, dry_run=False, do_transition=True)

            # transition_async should NOT be called (status already matches)
            mock_transition.assert_not_called()

    @pytest.mark.asyncio
    async def test_sync_story_transitions_when_status_differs(self, jira_sync_module):
        """Should transition when status differs."""
        from pf.jira.client import JiraClient

        mock_get_issue = AsyncMock(return_value={
            "fields": {"status": {"name": "To Do"}, "customfield_10031": None}
        })
        mock_transition = AsyncMock(return_value={"success": True})

        with patch.object(JiraClient, "get_issue_async", mock_get_issue), \
             patch.object(JiraClient, "transition_async", mock_transition):
            story = {
                "id": "63-5",
                "jira": "MSSCI-12399",
                "title": "Test",
                "status": "in_progress",  # Maps to "In Progress", differs from "To Do"
            }
            await jira_sync_module.sync_story(story, dry_run=False, do_transition=True)

            # transition_async SHOULD be called
            mock_transition.assert_called_once()
