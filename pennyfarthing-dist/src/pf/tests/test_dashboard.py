"""Tests for the dashboard module.

Story 132-11: Build pf status dashboard command.

Covers all acceptance criteria:
  AC1: `pf dashboard` prints formatted status block with live data
  AC2: `pf dashboard --json` outputs JSON
  AC3: Every field degrades gracefully (missing → fallback text)
  AC4: Command registered in _LAZY_COMMANDS, appears in `pf --help`
  AC5: Startup stays under 200ms (lazy imports only)
  AC6: Works from project root in orchestrator and consumer contexts
  AC7: Doctor health field runs same checks as `pf doctor`
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.dashboard.cli import dashboard
from pf.dashboard.collector import (
    collect_all,
    collect_health,
    collect_hooks,
    collect_repos,
    collect_sprint,
    collect_story,
    collect_theme,
    collect_tui,
    collect_workflow,
    format_dashboard,
)

# ---------------------------------------------------------------------------
# Expected dashboard fields — every output must include these
# ---------------------------------------------------------------------------
EXPECTED_FIELDS = [
    "Theme",
    "Workflow",
    "Sprint",
    "Story",
    "Hooks",
    "TUI",
    "Repos",
    "Health",
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def healthy_project(tmp_path: Path) -> Path:
    """Create a project directory with all subsystems present."""
    root = tmp_path / "project"
    root.mkdir()

    # .pennyfarthing/ with config
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("theme: fifth-element\n")

    # repos.yaml
    (pf_dir / "repos.yaml").write_text(
        "repos:\n"
        "  orchestrator:\n"
        "    path: .\n"
        "    branch: main\n"
        "  pennyfarthing:\n"
        "    path: pennyfarthing\n"
        "    branch: develop\n"
    )

    # Sprint data
    sprint_dir = root / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        "sprint:\n"
        "  name: TO Sprint 2608\n"
        "  number: 132\n"
        "  title: Developer Discovery & Onboarding\n"
        "  status: active\n"
        "epics: []\n"
        "stories: []\n"
    )

    # Session file (active story)
    session_dir = root / ".session"
    session_dir.mkdir()
    (session_dir / "132-11-session.md").write_text(
        "# Story 132-11: Build pf status dashboard command\n"
        "- **ID:** 132-11\n"
        "- **Workflow:** tdd\n"
        "- **Phase:** red\n"
    )

    # Claude settings with hooks
    claude_dir = root / ".claude"
    claude_dir.mkdir()
    settings = {
        "hooks": {
            "SessionStart": [
                {"hooks": [{"type": "command", "command": "pf hooks session-start"}]}
            ],
            "Stop": [
                {"hooks": [{"type": "command", "command": "pf hooks session-stop"}]},
                {"hooks": [{"type": "command", "command": "pf hooks reflector-check"}]},
            ],
            "PreToolUse": [
                {
                    "matcher": "Edit|Write",
                    "hooks": [
                        {"type": "command", "command": "pf hooks pre-edit-check"}
                    ],
                },
            ],
            "PostToolUse": [
                {"hooks": [{"type": "command", "command": "pf hooks bell-mode"}]},
            ],
        }
    }
    (claude_dir / "settings.local.json").write_text(json.dumps(settings))

    # Git repo (minimal)
    git_dir = root / ".git"
    git_dir.mkdir()

    return root


@pytest.fixture
def bare_project(tmp_path: Path) -> Path:
    """Project with no subsystems — everything should degrade gracefully."""
    root = tmp_path / "bare"
    root.mkdir()
    return root


# ---------------------------------------------------------------------------
# AC4: Command registered in _LAZY_COMMANDS, appears in `pf --help`
# ---------------------------------------------------------------------------


class TestCLIRegistration:
    """AC4: Dashboard must be registered in the main CLI."""

    def test_registered_in_lazy_commands(self):
        """'dashboard' should appear in the main CLI lazy commands."""
        from pf.cli import _LAZY_COMMANDS

        assert "dashboard" in _LAZY_COMMANDS, (
            "dashboard not registered in _LAZY_COMMANDS in cli.py"
        )

    def test_lazy_command_points_to_correct_module(self):
        """Lazy command should point to pf.dashboard.cli:dashboard."""
        from pf.cli import _LAZY_COMMANDS

        module_path, attr = _LAZY_COMMANDS["dashboard"]
        assert module_path == "pf.dashboard.cli"
        assert attr == "dashboard"


# ---------------------------------------------------------------------------
# AC1: `pf dashboard` prints formatted status block with live data
# ---------------------------------------------------------------------------


class TestDashboardOutput:
    """AC1: Dashboard prints a formatted status block."""

    def test_dashboard_command_exists(self, runner):
        """pf dashboard should be importable and show help."""
        result = runner.invoke(dashboard, ["--help"])
        assert result.exit_code == 0
        assert "status" in result.output.lower()

    def test_output_contains_header(self, runner, healthy_project):
        """Output should start with 'Pennyfarthing Status' header."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, [])
        assert "Pennyfarthing Status" in result.output

    def test_output_contains_all_fields(self, runner, healthy_project):
        """Output should contain all expected field labels."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, [])
        for field in EXPECTED_FIELDS:
            assert f"{field}:" in result.output, (
                f"Missing field '{field}:' in dashboard output"
            )

    def test_output_fields_aligned(self, runner, healthy_project):
        """Field values should be column-aligned (consistent indentation)."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, [])
        lines = [
            line for line in result.output.splitlines()
            if ":" in line and line.strip().split(":")[0].strip() in EXPECTED_FIELDS
        ]
        assert len(lines) >= len(EXPECTED_FIELDS), "Not enough field lines found"
        # All value columns should start at the same position
        value_positions = []
        for line in lines:
            colon_pos = line.index(":")
            # Find first non-space after colon
            rest = line[colon_pos + 1:]
            stripped = rest.lstrip()
            if stripped:
                value_positions.append(colon_pos + 1 + (len(rest) - len(stripped)))
        if value_positions:
            assert len(set(value_positions)) == 1, (
                f"Values not aligned — positions: {value_positions}"
            )


# ---------------------------------------------------------------------------
# AC2: `pf dashboard --json` outputs JSON
# ---------------------------------------------------------------------------


class TestJSONOutput:
    """AC2: Dashboard --json outputs valid, complete JSON."""

    def test_json_flag_accepted(self, runner):
        """--json flag should appear in help."""
        result = runner.invoke(dashboard, ["--help"])
        assert "--json" in result.output

    def test_json_output_is_valid(self, runner, healthy_project):
        """--json should produce parseable JSON."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, ["--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert isinstance(data, dict)

    def test_json_contains_all_fields(self, runner, healthy_project):
        """JSON output should contain all expected field keys."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, ["--json"])
        data = json.loads(result.output)
        for field in EXPECTED_FIELDS:
            key = field.lower()
            assert key in data, f"Missing key '{key}' in JSON output"

    def test_json_theme_has_name_and_tier(self, runner, healthy_project):
        """JSON theme field should include name and tier."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, ["--json"])
        data = json.loads(result.output)
        theme = data.get("theme", {})
        assert "name" in theme, "theme missing 'name'"
        assert "tier" in theme, "theme missing 'tier'"

    def test_json_sprint_has_number_and_title(self, runner, healthy_project):
        """JSON sprint field should include number and title."""
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, ["--json"])
        data = json.loads(result.output)
        sprint = data.get("sprint", {})
        assert "number" in sprint, "sprint missing 'number'"
        assert "title" in sprint, "sprint missing 'title'"


# ---------------------------------------------------------------------------
# AC3: Every field degrades gracefully
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    """AC3: Missing subsystems show fallback text, never crash."""

    def test_bare_project_does_not_crash(self, runner, bare_project):
        """Dashboard should not crash with no pennyfarthing installation."""
        with patch("pf.dashboard.cli.get_project_root", return_value=bare_project):
            result = runner.invoke(dashboard, [])
        assert result.exit_code == 0
        assert result.exception is None

    def test_missing_config_shows_fallback(self, bare_project):
        """collect_theme on bare project returns fallback."""
        result = collect_theme(bare_project)
        assert "display" in result
        assert "not configured" in result["display"].lower()

    def test_missing_sprint_shows_fallback(self, bare_project):
        """collect_sprint on bare project returns fallback."""
        result = collect_sprint(bare_project)
        assert "display" in result
        assert "no sprint" in result["display"].lower()

    def test_missing_session_shows_fallback(self, bare_project):
        """collect_story on bare project returns fallback."""
        result = collect_story(bare_project)
        assert "display" in result
        # Should say "none assigned" or similar
        assert "none" in result["display"].lower()

    def test_missing_hooks_shows_fallback(self, bare_project):
        """collect_hooks on bare project returns fallback."""
        result = collect_hooks(bare_project)
        assert "display" in result

    def test_tui_not_running_shows_fallback(self, bare_project):
        """collect_tui on bare project returns fallback."""
        result = collect_tui(bare_project)
        assert "display" in result
        assert "not running" in result["display"].lower()

    def test_json_bare_project_valid(self, runner, bare_project):
        """--json on bare project should still produce valid JSON."""
        with patch("pf.dashboard.cli.get_project_root", return_value=bare_project):
            result = runner.invoke(dashboard, ["--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC5: Startup stays under 200ms (lazy imports only)
# ---------------------------------------------------------------------------


class TestPerformance:
    """AC5: Dashboard module should import quickly."""

    def test_dashboard_import_under_200ms(self):
        """Importing pf.dashboard.cli should complete in under 200ms."""
        import importlib
        import sys

        # Remove cached module to force reimport
        for mod_name in list(sys.modules):
            if mod_name.startswith("pf.dashboard"):
                del sys.modules[mod_name]

        start = time.monotonic()
        importlib.import_module("pf.dashboard.cli")
        elapsed_ms = (time.monotonic() - start) * 1000

        assert elapsed_ms < 200, (
            f"Dashboard import took {elapsed_ms:.1f}ms — must be under 200ms"
        )

    def test_no_heavy_imports_at_module_level(self):
        """Dashboard cli.py should not import collector at module level.

        Heavy subsystem imports should only happen when the command is invoked.
        """
        import ast
        from pathlib import Path as P

        cli_path = P(__file__).resolve().parents[1] / "dashboard" / "cli.py"
        tree = ast.parse(cli_path.read_text())

        top_level_imports = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.ImportFrom) and node.module:
                    top_level_imports.append(node.module)
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        top_level_imports.append(alias.name)

        # Should not import heavy subsystems at top level
        heavy = {"pf.doctor", "pf.sprint", "pf.git", "pf.bikerack"}
        found = [m for m in top_level_imports if any(m.startswith(h) for h in heavy)]
        assert found == [], (
            f"Heavy imports at module level: {found} — use lazy imports inside the command"
        )


# ---------------------------------------------------------------------------
# AC6: Works from project root in both orchestrator and consumer contexts
# ---------------------------------------------------------------------------


class TestProjectContexts:
    """AC6: Dashboard works from both orchestrator and consumer roots."""

    def test_works_with_orchestrator_layout(self, runner, healthy_project):
        """Should work when pennyfarthing/ is an inlined subrepo."""
        # Create pennyfarthing/ subdir to simulate orchestrator
        (healthy_project / "pennyfarthing").mkdir()
        with patch("pf.dashboard.cli.get_project_root", return_value=healthy_project):
            result = runner.invoke(dashboard, [])
        assert result.exit_code == 0
        assert "Pennyfarthing Status" in result.output

    def test_works_with_consumer_layout(self, runner, tmp_path):
        """Should work in a consumer project (no pennyfarthing/ subdir)."""
        root = tmp_path / "consumer"
        root.mkdir()
        pf_dir = root / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "config.local.yaml").write_text("theme: discworld\n")

        with patch("pf.dashboard.cli.get_project_root", return_value=root):
            result = runner.invoke(dashboard, [])
        assert result.exit_code == 0
        assert "Pennyfarthing Status" in result.output


# ---------------------------------------------------------------------------
# AC7: Doctor health field runs same checks as `pf doctor`
# ---------------------------------------------------------------------------


class TestHealthCollector:
    """AC7: Health field integrates with doctor checks."""

    def test_health_calls_doctor(self, healthy_project):
        """collect_health should delegate to run_doctor."""
        with patch("pf.dashboard.collector.run_doctor", create=True) as mock_doctor:
            from pf.doctor.models import CheckResult, DoctorReport

            mock_doctor.return_value = DoctorReport(
                success=True,
                checks=[
                    CheckResult(name="test", status="pass", detail="ok"),
                ],
                fixed=0,
                error=None,
            )
            result = collect_health(healthy_project)
        mock_doctor.assert_called_once()
        assert "display" in result

    def test_health_summarizes_all_green(self, healthy_project):
        """When all checks pass, health should display 'all green'."""
        with patch("pf.dashboard.collector.run_doctor", create=True) as mock_doctor:
            from pf.doctor.models import CheckResult, DoctorReport

            mock_doctor.return_value = DoctorReport(
                success=True,
                checks=[
                    CheckResult(name="test", status="pass", detail="ok"),
                ],
                fixed=0,
                error=None,
            )
            result = collect_health(healthy_project)
        assert "all green" in result["display"].lower()

    def test_health_summarizes_issues(self, healthy_project):
        """When checks fail, health should show issue count."""
        with patch("pf.dashboard.collector.run_doctor", create=True) as mock_doctor:
            from pf.doctor.models import CheckResult, DoctorReport

            mock_doctor.return_value = DoctorReport(
                success=False,
                checks=[
                    CheckResult(name="a", status="pass", detail="ok"),
                    CheckResult(name="b", status="fail", detail="broken"),
                    CheckResult(name="c", status="warn", detail="meh"),
                ],
                fixed=0,
                error=None,
            )
            result = collect_health(healthy_project)
        display = result["display"].lower()
        # Should mention the failure count
        assert "1" in display or "issue" in display or "fail" in display


# ---------------------------------------------------------------------------
# Collector unit tests
# ---------------------------------------------------------------------------


class TestCollectors:
    """Unit tests for individual collector functions."""

    def test_collect_theme_returns_display_and_data(self, healthy_project):
        """collect_theme should return dict with 'display' and 'data' keys."""
        result = collect_theme(healthy_project)
        assert "display" in result, "collect_theme missing 'display' key"
        assert "data" in result, "collect_theme missing 'data' key"

    def test_collect_theme_includes_name(self, healthy_project):
        """collect_theme data should include the theme name."""
        result = collect_theme(healthy_project)
        assert result["data"].get("name") == "fifth-element"

    def test_collect_workflow_returns_display_and_data(self, healthy_project):
        """collect_workflow should return dict with required keys."""
        result = collect_workflow(healthy_project)
        assert "display" in result
        assert "data" in result

    def test_collect_sprint_returns_display_and_data(self, healthy_project):
        """collect_sprint should return dict with required keys."""
        result = collect_sprint(healthy_project)
        assert "display" in result
        assert "data" in result

    def test_collect_sprint_includes_number(self, healthy_project):
        """collect_sprint data should include the sprint number."""
        result = collect_sprint(healthy_project)
        assert result["data"].get("number") is not None

    def test_collect_story_returns_display_and_data(self, healthy_project):
        """collect_story should return dict with required keys."""
        result = collect_story(healthy_project)
        assert "display" in result
        assert "data" in result

    def test_collect_hooks_returns_count(self, healthy_project):
        """collect_hooks should return a count of active hooks."""
        result = collect_hooks(healthy_project)
        assert "display" in result
        assert "data" in result
        assert isinstance(result["data"].get("count"), int)
        assert result["data"]["count"] > 0

    def test_collect_repos_returns_display_and_data(self, healthy_project):
        """collect_repos should return dict with required keys."""
        result = collect_repos(healthy_project)
        assert "display" in result
        assert "data" in result

    def test_collect_all_returns_all_fields(self, healthy_project):
        """collect_all should return a dict with all field keys."""
        result = collect_all(healthy_project)
        for field in EXPECTED_FIELDS:
            key = field.lower()
            assert key in result, f"collect_all missing '{key}'"


class TestFormatDashboard:
    """Tests for the format_dashboard function."""

    def test_format_includes_header(self):
        """Formatted output should include 'Pennyfarthing Status' header."""
        data = {field.lower(): {"display": "test"} for field in EXPECTED_FIELDS}
        output = format_dashboard(data)
        assert "Pennyfarthing Status" in output

    def test_format_includes_all_labels(self):
        """Formatted output should include all field labels."""
        data = {field.lower(): {"display": "test"} for field in EXPECTED_FIELDS}
        output = format_dashboard(data)
        for field in EXPECTED_FIELDS:
            assert f"{field}:" in output
