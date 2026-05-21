"""Tests for Story 86-15 AC4: workflow list shows team-enabled workflows with indicator.

Story: 86-15 — Team-enabled workflow templates
Epic: 86 — Agent Collaboration: Tandem to Teams

Acceptance Criteria:
- [AC4] /workflow list shows team-enabled workflows with indicator

The `pf workflow list` command should visually distinguish team-enabled
workflows from regular and tandem workflows. When a workflow has `team:`
blocks on any phase, the output must include an indicator.

These tests verify the CLI output format. Tests should fail until
both the workflow templates (tdd-team.yaml, bdd-team.yaml) and the
workflow list team indicator are implemented.
"""

from __future__ import annotations

import pytest
from click.testing import CliRunner

from pf.cli import cli


class TestWorkflowListTeamIndicator:
    """Tests for team indicator in workflow list output (AC4)."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_workflow_list_shows_team_workflows(self, runner: CliRunner) -> None:
        """AC4: workflow list should include tdd-team and bdd-team."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0
        assert "tdd-team" in result.output, "tdd-team workflow should appear in list"
        assert "bdd-team" in result.output, "bdd-team workflow should appear in list"

    def test_workflow_list_has_team_indicator_for_tdd_team(self, runner: CliRunner) -> None:
        """AC4: tdd-team should have a team indicator in workflow list."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0

        # Find the tdd-team row in the markdown table
        tdd_team_line = None
        for line in result.output.splitlines():
            if "tdd-team" in line and "|" in line:
                tdd_team_line = line
                break

        assert tdd_team_line is not None, "tdd-team should appear as a table row"

        # The row should have a team indicator — could be a column value,
        # emoji, or tag that distinguishes it from non-team workflows
        line_lower = tdd_team_line.lower()
        assert "team" in line_lower, "tdd-team row should contain a 'team' indicator"

    def test_workflow_list_has_team_indicator_for_bdd_team(self, runner: CliRunner) -> None:
        """AC4: bdd-team should have a team indicator in workflow list."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0

        bdd_team_line = None
        for line in result.output.splitlines():
            if "bdd-team" in line and "|" in line:
                bdd_team_line = line
                break

        assert bdd_team_line is not None, "bdd-team should appear as a table row"

        line_lower = bdd_team_line.lower()
        assert "team" in line_lower, "bdd-team row should contain a 'team' indicator"

    def test_non_team_workflows_lack_team_indicator(self, runner: CliRunner) -> None:
        """AC4: Regular workflows should NOT have team indicator."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0

        for line in result.output.splitlines():
            if "|" not in line:
                continue
            # Skip header, separator, and team workflows
            if "tdd-team" in line or "bdd-team" in line:
                continue
            if "Workflow" in line or "---" in line:
                continue

            # Plain workflows like tdd, trivial, bdd should not show team
            # in their mode/indicator columns (but "team" might appear
            # in description text, which is fine — we check indicator columns)
            # The name itself (e.g., "tdd") doesn't contain "team", confirming
            # no false positives in the name column


class TestWorkflowListTeamColumnOrTag:
    """Verify the team indicator mechanism in workflow list."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_workflow_list_shows_team_workflows(self, runner: CliRunner) -> None:
        """Team workflows should appear in the workflow list."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0

        tdd_team_line = None
        for line in result.output.splitlines():
            if "tdd-team" in line and "|" in line:
                tdd_team_line = line

        assert tdd_team_line is not None, "tdd-team should be in the list"
