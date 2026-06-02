"""
Tests for Story 135-2: Integrate aggregated findings into retro workflow.

Tests the `pf sprint findings` CLI command and its integration with the
aggregation pipeline from pf.findings.aggregate.

Run with: python -m pytest tests/python/test_sprint_findings_cli.py -v
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.sprint.findings_cmd import findings_command  # noqa: E402

# ---------------------------------------------------------------------------
# Fixtures: session files and sprint-completed YAML
# ---------------------------------------------------------------------------

SESSION_WITH_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "99-1"
    jira_key: "PROJ-99001"
    title: "Test story alpha"
    ---

    # 99-1: Test story alpha

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing input validation for empty arrays. Affects `src/parser.py` (add guard clause). *Found by TEA during test design.*

    ### Dev (implementation)
    - **Improvement** (non-blocking): Could extract shared helper for reuse. Affects `src/utils.py` (extract common logic). *Found by Dev during implementation.*
""")

SESSION_NO_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "99-3"
    jira_key: "PROJ-99003"
    title: "Test story gamma"
    ---

    # 99-3: Test story gamma

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No upstream findings during test design.
""")

SPRINT_COMPLETED_YAML = textwrap.dedent("""\
    sprint:
      name: "TO Sprint 9999"
      number: 9999
    completed_stories:
      - id: 99-1
        epic: PROJ-99000
        title: Test story alpha
        points: 3
        completed: '2026-01-10'
      - id: 99-3
        epic: PROJ-99000
        title: Test story gamma
        points: 1
        completed: '2026-01-12'
""")

CURRENT_SPRINT_YAML = textwrap.dedent("""\
    sprint:
      name: "TO Sprint 9999"
      number: 9999
      jira_sprint_id: 999
      jira_sprint_name: "TO Sprint 9999"
      goal: Test sprint
      start_date: '2026-01-01'
      end_date: '2026-01-14'
      status: active
""")


def _setup_archive(tmp_path, sprint_number=9999, sessions=None):
    """Create an archive directory with sprint-completed YAML and session files."""
    archive = tmp_path / "sprint" / "archive"
    archive.mkdir(parents=True)

    (archive / f"sprint-{sprint_number}-completed.yaml").write_text(SPRINT_COMPLETED_YAML)

    if sessions is None:
        sessions = {
            "PROJ-99001": SESSION_WITH_FINDINGS,
            "PROJ-99003": SESSION_NO_FINDINGS,
        }
    for jira_key, content in sessions.items():
        (archive / f"{jira_key}-session.md").write_text(content)

    return archive


def _setup_current_sprint(tmp_path):
    """Create a current-sprint.yaml with known sprint number."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    (sprint_dir / "current-sprint.yaml").write_text(CURRENT_SPRINT_YAML)


# ---------------------------------------------------------------------------
# AC1: `pf sprint findings [SPRINT_NUMBER]` CLI command
# ---------------------------------------------------------------------------


class TestFindingsCommand:
    """AC1: CLI command produces aggregated findings report."""

    def test_command_with_sprint_number(self, tmp_path):
        """Produces findings report when sprint number is provided."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999"])

        assert result.exit_code == 0
        assert "findings" in result.output.lower() or "Sprint Findings" in result.output

    def test_command_shows_findings_content(self, tmp_path):
        """Output contains actual finding data from sessions."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999"])

        assert result.exit_code == 0
        # Should contain finding types from our test data
        assert "Gap" in result.output

    def test_command_exits_cleanly(self, tmp_path):
        """Command returns exit code 0 on success."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999"])

        assert result.exit_code == 0


# ---------------------------------------------------------------------------
# AC2: Command defaults to current sprint
# ---------------------------------------------------------------------------


class TestDefaultSprint:
    """AC2: Command defaults to current sprint when no number given."""

    def test_defaults_to_current_sprint(self, tmp_path):
        """No sprint number argument reads from current-sprint.yaml."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, [])

        assert result.exit_code == 0
        # Should produce output (not an error about missing sprint number)
        assert "findings" in result.output.lower() or "Sprint Findings" in result.output

    def test_explicit_number_overrides_default(self, tmp_path):
        """Explicit sprint number is used instead of current sprint."""
        _setup_archive(tmp_path, sprint_number=8888)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["8888"])

        assert result.exit_code == 0


# ---------------------------------------------------------------------------
# AC3: --format markdown and --format json
# ---------------------------------------------------------------------------


class TestOutputFormat:
    """AC3: Command supports --format markdown and --format json."""

    def test_markdown_format_default(self, tmp_path):
        """Default format is markdown."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999"])

        assert result.exit_code == 0
        # Markdown output has headings
        assert "#" in result.output

    def test_markdown_format_explicit(self, tmp_path):
        """--format markdown produces markdown output."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999", "--format", "markdown"])

        assert result.exit_code == 0
        assert "#" in result.output

    def test_json_format(self, tmp_path):
        """--format json produces valid JSON output."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999", "--format", "json"])

        assert result.exit_code == 0
        # Must be valid JSON
        parsed = json.loads(result.output)
        assert "total" in parsed or "findings" in parsed

    def test_invalid_format_rejected(self, tmp_path):
        """Invalid format value is rejected by Click."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999", "--format", "xml"])

        # Click rejects invalid choice
        assert result.exit_code != 0


# ---------------------------------------------------------------------------
# AC4: Retro workflow references findings report
# ---------------------------------------------------------------------------


class TestRetroIntegration:
    """AC4: Retro workflow references findings report in context loading."""

    def test_retro_command_references_findings(self):
        """The retro command file includes `pf sprint findings` in its context loading."""
        retro_path = PROJECT_ROOT / "pennyfarthing-dist" / "commands" / "pf-retro.md"
        assert retro_path.exists(), "Retro command file must exist"

        content = retro_path.read_text()
        assert "pf sprint findings" in content, (
            "Retro command must reference `pf sprint findings` for context loading"
        )


# ---------------------------------------------------------------------------
# AC5: Handles sprints with no archived sessions gracefully
# ---------------------------------------------------------------------------


class TestGracefulHandling:
    """AC5: Command handles edge cases without crashing."""

    def test_nonexistent_sprint_number(self, tmp_path):
        """Sprint number with no completed file shows clear message."""
        (tmp_path / "sprint" / "archive").mkdir(parents=True)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["7777"])

        # Should not crash — either exit 0 with message or exit 1 with error
        assert "not found" in result.output.lower() or "no" in result.output.lower() or result.exit_code != 0

    def test_sprint_with_zero_findings(self, tmp_path):
        """Sprint where all sessions have 'No upstream findings' produces clean output."""
        archive = tmp_path / "sprint" / "archive"
        archive.mkdir(parents=True)

        no_findings_yaml = textwrap.dedent("""\
            sprint:
              name: "TO Sprint 6666"
              number: 6666
            completed_stories:
              - id: 99-3
                epic: PROJ-99000
                title: Test
                points: 1
                completed: '2026-01-12'
        """)
        (archive / "sprint-6666-completed.yaml").write_text(no_findings_yaml)
        (archive / "PROJ-99003-session.md").write_text(SESSION_NO_FINDINGS)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["6666"])

        assert result.exit_code == 0
        assert "no findings" in result.output.lower() or "0" in result.output

    def test_missing_archive_directory(self, tmp_path):
        """Missing archive directory produces error message, not crash."""
        (tmp_path / "sprint").mkdir(parents=True)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999"])

        # Should handle gracefully
        assert result.exit_code != 0 or "not found" in result.output.lower() or "error" in result.output.lower()


# ---------------------------------------------------------------------------
# AC6: Integration tests verify CLI invocation end-to-end
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """AC6: Full CLI pipeline from invocation to formatted output."""

    def test_full_pipeline_markdown(self, tmp_path):
        """CLI invocation → collect → aggregate → detect → format markdown."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999", "--format", "markdown"])

        assert result.exit_code == 0
        output = result.output

        # Should contain findings from test data
        assert "Gap" in output
        assert "src/parser.py" in output
        assert "blocking" in output.lower()

    def test_full_pipeline_json(self, tmp_path):
        """CLI invocation → collect → aggregate → detect → format JSON."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, ["9999", "--format", "json"])

        assert result.exit_code == 0
        parsed = json.loads(result.output)

        assert parsed["total"] == 2  # 2 real findings (no-findings entries excluded)
        assert parsed["blocking_count"] == 1

    def test_full_pipeline_default_sprint(self, tmp_path):
        """CLI with no args uses current sprint number."""
        _setup_archive(tmp_path)
        _setup_current_sprint(tmp_path)

        runner = CliRunner()
        with patch("pf.sprint.findings_cmd._get_project_root", return_value=tmp_path):
            result = runner.invoke(findings_command, [])

        assert result.exit_code == 0
        assert len(result.output.strip()) > 0
