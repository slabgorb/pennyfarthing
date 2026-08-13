"""
Tests for jira_bidirectional_sync.py (Story 63-6: PROJ-12400).

Run with: python -m pytest tests/python/test_jira_bidirectional_sync.py -v

Acceptance Criteria Coverage:
- [x] Create pf/jira_bidirectional_sync.py
- [x] Port generateSyncPlan() with full test coverage
- [x] Port executeSyncPlan() using JiraClient from jira.py
- [x] Port formatSyncPlan() for CLI output
- [x] CLI interface with same options as JS version
- [x] Integration with existing status mappings from jira.py
- [x] Async support for parallel Jira API calls
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# =============================================================================
# Module Import Tests
# =============================================================================


class TestModuleImport:
    """Tests for module existence and imports."""

    def test_module_exists(self):
        """jira/bidirectional.py module should exist (src layout: pennyfarthing-dist/src/pf/jira/bidirectional.py)."""
        module_path = PROJECT_ROOT / "pennyfarthing-dist" / "src" / "pf" / "jira" / "bidirectional.py"
        assert module_path.exists(), "jira/bidirectional.py not found"

    def test_module_imports(self):
        """jira_bidirectional_sync module should import without error."""
        from pf.jira import bidirectional as jira_bidirectional_sync
        assert jira_bidirectional_sync is not None

    def test_dataclasses_exist(self):
        """Data classes should be defined."""
        from pf.jira.bidirectional import (
            SyncChange,
            SyncPlan,
            SyncResult,
        )
        assert SyncChange is not None
        assert SyncPlan is not None
        assert SyncResult is not None


# =============================================================================
# CLI Argument Parsing Tests
# =============================================================================


class TestParseCliArgs:
    """Tests for parse_cli_args function."""

    @pytest.fixture
    def parse_args(self):
        """Import parse_cli_args function."""
        from pf.jira.bidirectional import parse_cli_args
        return parse_cli_args

    def test_parse_cli_args_exists(self):
        """parse_cli_args function should exist."""
        from pf.jira.bidirectional import parse_cli_args
        assert callable(parse_cli_args)

    def test_parse_dry_run(self, parse_args):
        """Should parse --dry-run flag."""
        args = parse_args(["--dry-run", "--status"])
        assert args.dry_run is True

    def test_parse_yaml_wins(self, parse_args):
        """Should parse --yaml-wins flag."""
        args = parse_args(["--yaml-wins", "--status"])
        assert args.yaml_wins is True

    def test_parse_status(self, parse_args):
        """Should parse --status flag."""
        args = parse_args(["--status"])
        assert args.status is True

    def test_parse_points(self, parse_args):
        """Should parse --points flag."""
        args = parse_args(["--points"])
        assert args.points is True

    def test_parse_all_enables_status_and_points(self, parse_args):
        """--all should enable both --status and --points."""
        args = parse_args(["--all"])
        assert args.status is True
        assert args.points is True

    def test_parse_sprint_id(self, parse_args):
        """Should parse --sprint option."""
        args = parse_args(["--sprint", "123", "--status"])
        assert args.sprint == "123"

    def test_defaults(self, parse_args):
        """Should have correct defaults."""
        args = parse_args([])
        assert args.dry_run is False
        assert args.yaml_wins is False
        assert args.status is False
        assert args.points is False
        assert args.sprint is None


# =============================================================================
# Sync Plan Generation Tests
# =============================================================================


class TestGenerateSyncPlan:
    """Tests for generate_sync_plan function."""

    @pytest.fixture
    def generate_sync_plan(self):
        """Import generate_sync_plan function."""
        from pf.jira.bidirectional import generate_sync_plan
        return generate_sync_plan

    @pytest.fixture
    def sample_yaml_stories(self):
        """Sample YAML stories for testing."""
        return [
            {"id": "63-1", "jira": "PROJ-12398", "status": "done", "points": 1},
            {"id": "63-2", "jira": "PROJ-12399", "status": "in_progress", "points": 2},
            {"id": "63-3", "jira": "PROJ-12400", "status": "backlog", "points": 3},
            {"id": "63-4", "status": "backlog", "points": 1},  # No Jira key
        ]

    @pytest.fixture
    def sample_jira_stories(self):
        """Sample Jira stories for testing."""
        return [
            {
                "key": "PROJ-12398",
                "fields": {"status": {"name": "Done"}, "customfield_10031": 1},
            },
            {
                "key": "PROJ-12399",
                "fields": {"status": {"name": "To Do"}, "customfield_10031": 2},
            },
            {
                "key": "PROJ-12400",
                "fields": {"status": {"name": "To Do"}, "customfield_10031": 5},
            },
            {
                "key": "PROJ-12401",  # Only in Jira
                "fields": {"status": {"name": "In Progress"}, "customfield_10031": 2},
            },
        ]

    def test_generate_sync_plan_exists(self):
        """generate_sync_plan function should exist."""
        from pf.jira.bidirectional import generate_sync_plan
        assert callable(generate_sync_plan)

    def test_categorizes_yaml_only(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should identify stories only in YAML."""
        plan = generate_sync_plan(sample_yaml_stories, sample_jira_stories)
        # 63-4 has no Jira key, so won't be in yaml_only
        assert plan.yaml_only == []

    def test_categorizes_jira_only(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should identify stories only in Jira."""
        plan = generate_sync_plan(sample_yaml_stories, sample_jira_stories)
        assert "PROJ-12401" in plan.jira_only

    def test_categorizes_both(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should identify stories in both systems."""
        plan = generate_sync_plan(sample_yaml_stories, sample_jira_stories)
        assert "PROJ-12398" in plan.both
        assert "PROJ-12399" in plan.both
        assert "PROJ-12400" in plan.both

    def test_detects_status_differences(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should detect status differences when sync_status=True."""
        plan = generate_sync_plan(
            sample_yaml_stories,
            sample_jira_stories,
            sync_status=True,
        )
        # PROJ-12399: YAML=in_progress, Jira=To Do
        status_changes = [c for c in plan.changes if c.field == "status"]
        assert len(status_changes) >= 1

    def test_detects_points_differences(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should detect points differences when sync_points=True."""
        plan = generate_sync_plan(
            sample_yaml_stories,
            sample_jira_stories,
            sync_points=True,
        )
        # PROJ-12400: YAML=3, Jira=5
        points_changes = [c for c in plan.changes if c.field == "points"]
        assert len(points_changes) >= 1

    def test_no_changes_without_flags(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """Should not generate changes without sync flags."""
        plan = generate_sync_plan(
            sample_yaml_stories,
            sample_jira_stories,
            sync_status=False,
            sync_points=False,
        )
        assert len(plan.changes) == 0

    def test_yaml_wins_sets_update_jira_action(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """With yaml_wins=True, changes should have action='update-jira'."""
        plan = generate_sync_plan(
            sample_yaml_stories,
            sample_jira_stories,
            sync_status=True,
            yaml_wins=True,
        )
        for change in plan.changes:
            assert change.action == "update-jira"

    def test_jira_wins_default_sets_update_yaml_action(self, generate_sync_plan, sample_yaml_stories, sample_jira_stories):
        """By default (yaml_wins=False), changes should have action='update-yaml'."""
        plan = generate_sync_plan(
            sample_yaml_stories,
            sample_jira_stories,
            sync_status=True,
            yaml_wins=False,
        )
        for change in plan.changes:
            assert change.action == "update-yaml"


# =============================================================================
# Sync Plan Formatting Tests
# =============================================================================


class TestFormatSyncPlan:
    """Tests for format_sync_plan function."""

    @pytest.fixture
    def format_sync_plan(self):
        """Import format_sync_plan function."""
        from pf.jira.bidirectional import format_sync_plan
        return format_sync_plan

    @pytest.fixture
    def sample_plan(self):
        """Create sample sync plan for testing."""
        from pf.jira.bidirectional import SyncChange, SyncPlan
        return SyncPlan(
            changes=[
                SyncChange(
                    key="PROJ-12399",
                    field="status",
                    action="update-yaml",
                    yaml_value="in_progress",
                    jira_value="To Do",
                    target_value="backlog",
                ),
            ],
            yaml_only=["PROJ-12500"],
            jira_only=["PROJ-12401"],
            both=["PROJ-12398", "PROJ-12399"],
        )

    def test_format_sync_plan_exists(self):
        """format_sync_plan function should exist."""
        from pf.jira.bidirectional import format_sync_plan
        assert callable(format_sync_plan)

    def test_format_includes_header(self, format_sync_plan, sample_plan):
        """Output should include header."""
        output = format_sync_plan(sample_plan)
        assert "Bidirectional Sync Plan" in output

    def test_format_includes_summary(self, format_sync_plan, sample_plan):
        """Output should include summary counts."""
        output = format_sync_plan(sample_plan)
        assert "Stories in YAML only: 1" in output
        assert "Stories in Jira only: 1" in output
        assert "Stories in both: 2" in output
        assert "Changes to apply: 1" in output

    def test_format_includes_yaml_only(self, format_sync_plan, sample_plan):
        """Output should list YAML-only stories."""
        output = format_sync_plan(sample_plan)
        assert "YAML Only" in output
        assert "PROJ-12500" in output

    def test_format_includes_jira_only(self, format_sync_plan, sample_plan):
        """Output should list Jira-only stories."""
        output = format_sync_plan(sample_plan)
        assert "Jira Only" in output
        assert "PROJ-12401" in output

    def test_format_includes_changes(self, format_sync_plan, sample_plan):
        """Output should list changes."""
        output = format_sync_plan(sample_plan)
        assert "Changes" in output
        assert "PROJ-12399" in output
        assert "status" in output

    def test_format_empty_plan(self, format_sync_plan):
        """Should handle empty plan."""
        from pf.jira.bidirectional import SyncPlan
        plan = SyncPlan()
        output = format_sync_plan(plan)
        assert "Changes to apply: 0" in output


# =============================================================================
# Sync Plan Execution Tests
# =============================================================================


class TestExecuteSyncPlan:
    """Tests for execute_sync_plan function."""

    @pytest.fixture
    def execute_sync_plan(self):
        """Import execute_sync_plan function."""
        from pf.jira.bidirectional import execute_sync_plan
        return execute_sync_plan

    @pytest.fixture
    def sample_plan_with_jira_updates(self):
        """Create plan with Jira updates."""
        from pf.jira.bidirectional import SyncChange, SyncPlan
        return SyncPlan(
            changes=[
                SyncChange(
                    key="PROJ-12399",
                    field="status",
                    action="update-jira",
                    yaml_value="in_progress",
                    jira_value="To Do",
                    target_value="In Progress",
                ),
            ],
            both=["PROJ-12399"],
        )

    @pytest.mark.asyncio
    async def test_execute_sync_plan_exists(self):
        """execute_sync_plan function should exist."""
        from pf.jira.bidirectional import execute_sync_plan
        assert callable(execute_sync_plan)

    @pytest.mark.asyncio
    async def test_dry_run_returns_without_applying(self, execute_sync_plan, sample_plan_with_jira_updates):
        """Dry run should not apply any changes."""
        result = await execute_sync_plan(sample_plan_with_jira_updates, dry_run=True)
        assert result.dry_run is True
        assert result.changes_applied == 0
        assert result.jira_api_calls == 0

    @pytest.mark.asyncio
    async def test_returns_sync_result(self, execute_sync_plan, sample_plan_with_jira_updates):
        """Should return SyncResult dataclass."""
        from pf.jira.bidirectional import SyncResult
        result = await execute_sync_plan(sample_plan_with_jira_updates, dry_run=True)
        assert isinstance(result, SyncResult)

    @pytest.mark.asyncio
    async def test_counts_planned_changes(self, execute_sync_plan, sample_plan_with_jira_updates):
        """Should count planned changes correctly."""
        result = await execute_sync_plan(sample_plan_with_jira_updates, dry_run=True)
        assert result.changes_planned == 1

    @pytest.mark.asyncio
    async def test_executes_jira_status_transition(self, execute_sync_plan, sample_plan_with_jira_updates):
        """Should call JiraClient.transition_async for status updates."""
        mock_client = MagicMock()
        mock_client.transition_async = AsyncMock(return_value={"success": True})

        result = await execute_sync_plan(
            sample_plan_with_jira_updates,
            dry_run=False,
            client=mock_client,
        )

        mock_client.transition_async.assert_called_once_with("PROJ-12399", "In Progress")
        assert result.jira_api_calls == 1
        assert result.changes_applied == 1

    @pytest.mark.asyncio
    async def test_executes_jira_points_update(self, execute_sync_plan):
        """Should call JiraClient.sync_story_points_async for points updates."""
        from pf.jira.bidirectional import SyncChange, SyncPlan

        plan = SyncPlan(
            changes=[
                SyncChange(
                    key="PROJ-12400",
                    field="points",
                    action="update-jira",
                    yaml_value=3,
                    jira_value=5,
                    target_value=3,
                ),
            ],
            both=["PROJ-12400"],
        )

        mock_client = MagicMock()
        mock_client.sync_story_points_async = AsyncMock(return_value={"success": True})

        result = await execute_sync_plan(plan, dry_run=False, client=mock_client)

        mock_client.sync_story_points_async.assert_called_once_with("PROJ-12400", 3)
        assert result.changes_applied == 1

    @pytest.mark.asyncio
    async def test_handles_api_errors(self, execute_sync_plan, sample_plan_with_jira_updates):
        """Should handle API errors gracefully."""
        mock_client = MagicMock()
        mock_client.transition_async = AsyncMock(return_value={"success": False, "reason": "Transition not allowed"})

        result = await execute_sync_plan(
            sample_plan_with_jira_updates,
            dry_run=False,
            client=mock_client,
        )

        assert result.changes_applied == 0
        assert len(result.errors) == 1
        assert "Transition not allowed" in result.errors[0]


# =============================================================================
# CLI Integration Tests
# =============================================================================


class TestCLIIntegration:
    """Tests for CLI integration."""

    def test_can_run_with_help(self):
        """Module should run with --help."""
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira.bidirectional", "--help"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        assert result.returncode == 0
        assert "dry-run" in result.stdout
        assert "yaml-wins" in result.stdout
        assert "status" in result.stdout
        assert "points" in result.stdout

    def test_requires_field_selection(self):
        """Should error if no field is selected."""
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira.bidirectional", "--dry-run"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        assert result.returncode != 0
        assert "at least one field" in result.stderr.lower()


# =============================================================================
# Status Mapping Integration Tests
# =============================================================================


class TestStatusMappingIntegration:
    """Tests for integration with jira.py status mappings."""

    def test_uses_map_status_to_jira(self):
        """Should use map_status_to_jira from jira.py."""
        from pf.jira import map_status_to_jira
        from pf.jira.bidirectional import generate_sync_plan

        yaml_stories = [
            {"id": "63-1", "jira": "PROJ-12398", "status": "in_progress", "points": 1},
        ]
        jira_stories = [
            {"key": "PROJ-12398", "fields": {"status": {"name": "To Do"}, "customfield_10031": 1}},
        ]

        plan = generate_sync_plan(yaml_stories, jira_stories, sync_status=True, yaml_wins=True)

        # The target should be the Jira-normalized form of "in_progress"
        assert len(plan.changes) == 1
        assert plan.changes[0].target_value == map_status_to_jira("in_progress")

    def test_uses_map_jira_to_status(self):
        """Should use map_jira_to_status from jira.py."""
        from pf.jira import map_jira_to_status
        from pf.jira.bidirectional import generate_sync_plan

        yaml_stories = [
            {"id": "63-1", "jira": "PROJ-12398", "status": "done", "points": 1},
        ]
        jira_stories = [
            {"key": "PROJ-12398", "fields": {"status": {"name": "In Progress"}, "customfield_10031": 1}},
        ]

        plan = generate_sync_plan(yaml_stories, jira_stories, sync_status=True, yaml_wins=False)

        # The target should be the Pennyfarthing-normalized form of "In Progress"
        assert len(plan.changes) == 1
        assert plan.changes[0].target_value == map_jira_to_status("In Progress")
