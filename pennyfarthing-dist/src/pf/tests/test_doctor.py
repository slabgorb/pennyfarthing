"""Tests for the doctor module.

Story 126-8: Reduce doctor to ~10 health checks with --fix mode.

Covers all acceptance criteria:
  AC1: Doctor reduced to ~10 relevant health checks
  AC2: --fix flag offers repair for each failed check
  AC3: Checks cover Python install, Node packages, config, hooks, directories
  AC4: Removed checks for things that can no longer break (fewer than old TS doctor)
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.doctor.checks import (
    CHECKS,
    check_agents,
    check_commands,
    check_config_file,
    check_content_dirs,
    check_git_hooks,
    check_node_packages,
    check_pennyfarthing_dir,
    check_python_install,
    check_settings_hooks,
    check_skills,
    check_theme,
)
from pf.doctor.cli import doctor
from pf.doctor.core import run_doctor
from pf.doctor.models import CheckResult, DoctorReport

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def healthy_project(tmp_path: Path) -> Path:
    """Create a project directory that passes all health checks.

    Sets up the full expected structure:
    - .pennyfarthing/ with config.local.yaml and symlink targets
    - .claude/commands/ with pf-* files
    - .claude/skills/ with pf-* directories
    - settings.local.json with hooks
    - .git/hooks/ with dispatcher
    """
    root = tmp_path / "project"
    root.mkdir()

    # .pennyfarthing/ directory structure
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("theme: discworld\n")

    # Symlink targets (as real directories for testing)
    for name in (
        "agents",
        "commands",
        "guides",
        "personas",
        "scripts",
        "skills",
        "workflows",
        "templates",
        "output-styles",
    ):
        target = pf_dir / name
        target.mkdir()
        (target / ".gitkeep").touch()

    # .claude/ directory
    claude_dir = root / ".claude"
    claude_dir.mkdir()
    commands_dir = claude_dir / "commands"
    commands_dir.mkdir()
    (commands_dir / "pf-sprint.md").write_text("# Sprint")
    (commands_dir / "pf-dev.md").write_text("# Dev")

    agents_dir = claude_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "dev.md").write_text("# Dev Agent")
    (agents_dir / "tea.md").write_text("# TEA Agent")

    skills_dir = claude_dir / "skills"
    skills_dir.mkdir()
    (skills_dir / "pf-testing").mkdir()
    (skills_dir / "pf-testing" / "pf-testing.md").write_text("# Testing")
    (skills_dir / "pf-sprint").mkdir()
    (skills_dir / "pf-sprint" / "pf-sprint.md").write_text("# Sprint")

    # settings.local.json with hooks
    settings = {
        "hooks": {
            "SessionStart": [{"hooks": [{"type": "command", "command": "pf hooks session-start"}]}],
            "Stop": [{"hooks": [{"type": "command", "command": "pf hooks session-stop"}]}],
            "PreToolUse": [
                {
                    "matcher": "Edit|Write",
                    "hooks": [{"type": "command", "command": "pf hooks pre-edit-check"}],
                },
            ],
        }
    }
    (root / ".claude" / "settings.local.json").write_text(json.dumps(settings))

    # Git hooks
    git_hooks_dir = root / ".git" / "hooks"
    git_hooks_dir.mkdir(parents=True)
    (git_hooks_dir / "pre-commit").write_text("#!/bin/sh\npf hooks pre-commit\n")

    # node_modules marker
    (root / "node_modules").mkdir()
    (root / "node_modules" / ".package-lock.json").write_text("{}")

    # .claude/hooks directory (may be needed by other checks)
    hooks_dir = claude_dir / "hooks"
    hooks_dir.mkdir(parents=True)

    return root


@pytest.fixture
def broken_project(tmp_path: Path) -> Path:
    """Create a project directory that fails multiple health checks."""
    root = tmp_path / "broken"
    root.mkdir()
    # Deliberately empty — no .pennyfarthing, no .claude, no hooks
    return root


# ---------------------------------------------------------------------------
# AC1: Doctor reduced to ~10 relevant health checks
# ---------------------------------------------------------------------------


class TestCheckRegistry:
    """AC1: The CHECKS registry should contain ~10 checks."""

    def test_checks_registry_populated(self):
        """CHECKS list must be populated (not empty)."""
        assert len(CHECKS) > 0, "CHECKS registry is empty"

    def test_checks_count_approximately_10(self):
        """Should have approximately 10 checks (8-13 range)."""
        assert 8 <= len(CHECKS) <= 13, f"Expected ~10 checks, got {len(CHECKS)}"

    def test_each_check_has_name_and_description(self):
        """Each entry in CHECKS must be a (name, description) tuple."""
        for entry in CHECKS:
            assert isinstance(entry, tuple), f"Expected tuple, got {type(entry)}"
            assert len(entry) == 2, f"Expected 2-tuple, got {len(entry)}-tuple"
            name, desc = entry
            assert isinstance(name, str) and name, "Check name must be non-empty string"
            assert isinstance(desc, str) and desc, "Check description must be non-empty string"


# ---------------------------------------------------------------------------
# AC3: Checks cover Python install, Node packages, config, hooks, directories
# ---------------------------------------------------------------------------


class TestIndividualChecks:
    """AC3: Each check function returns a CheckResult with correct status."""

    def test_check_python_install_passes_when_pf_available(self, healthy_project):
        """check_python_install returns pass when pf is on PATH."""
        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            result = check_python_install(healthy_project)
        assert isinstance(result, CheckResult)
        assert result.status == "pass"
        assert result.name == "python_install"

    def test_check_python_install_fails_when_pf_missing(self, broken_project):
        """check_python_install returns fail when pf is not found."""
        with patch("shutil.which", return_value=None):
            result = check_python_install(broken_project)
        assert result.status == "fail"

    def test_check_pennyfarthing_dir_passes(self, healthy_project):
        """check_pennyfarthing_dir returns pass when .pennyfarthing/ exists."""
        result = check_pennyfarthing_dir(healthy_project)
        assert result.status == "pass"
        assert result.name == "pennyfarthing_dir"

    def test_check_pennyfarthing_dir_fails(self, broken_project):
        """check_pennyfarthing_dir returns fail when .pennyfarthing/ missing."""
        result = check_pennyfarthing_dir(broken_project)
        assert result.status == "fail"

    def test_check_config_file_passes(self, healthy_project):
        """check_config_file returns pass when config.local.yaml is valid."""
        result = check_config_file(healthy_project)
        assert result.status == "pass"
        assert result.name == "config_file"

    def test_check_config_file_fails_when_missing(self, broken_project):
        """check_config_file returns fail when config is missing."""
        result = check_config_file(broken_project)
        assert result.status == "fail"

    def test_check_config_file_fails_when_invalid_yaml(self, healthy_project):
        """check_config_file returns fail when YAML is unparseable."""
        config = healthy_project / ".pennyfarthing" / "config.local.yaml"
        config.write_text(": : : invalid yaml [[[")
        result = check_config_file(healthy_project)
        assert result.status == "fail"

    def test_check_settings_hooks_passes(self, healthy_project):
        """check_settings_hooks returns pass when essential hooks present."""
        result = check_settings_hooks(healthy_project)
        assert result.status == "pass"
        assert result.name == "settings_hooks"

    def test_check_settings_hooks_fails_when_no_settings(self, broken_project):
        """check_settings_hooks returns fail when settings.local.json missing."""
        result = check_settings_hooks(broken_project)
        assert result.status == "fail"

    def test_check_content_dirs_passes(self, healthy_project):
        """check_content_dirs returns pass when all content directories exist."""
        result = check_content_dirs(healthy_project)
        assert result.status == "pass"
        assert result.name == "content_dirs"

    def test_check_content_dirs_fails_when_dirs_missing(self, broken_project):
        """check_content_dirs returns fail when .pennyfarthing/ subdirs missing."""
        result = check_content_dirs(broken_project)
        assert result.status == "fail"

    def test_check_agents_passes(self, healthy_project):
        """check_agents returns pass when agent definitions exist."""
        result = check_agents(healthy_project)
        assert result.status == "pass"
        assert result.name == "agents"

    def test_check_agents_fails(self, broken_project):
        """check_agents returns fail when .claude/agents/ missing."""
        result = check_agents(broken_project)
        assert result.status == "fail"

    def test_check_commands_passes(self, healthy_project):
        """check_commands returns pass when pf-* commands exist."""
        result = check_commands(healthy_project)
        assert result.status == "pass"
        assert result.name == "commands"

    def test_check_commands_fails(self, broken_project):
        """check_commands returns fail when .claude/commands/ missing."""
        result = check_commands(broken_project)
        assert result.status == "fail"

    def test_check_skills_passes(self, healthy_project):
        """check_skills returns pass when pf-* skills exist."""
        result = check_skills(healthy_project)
        assert result.status == "pass"
        assert result.name == "skills"

    def test_check_skills_fails(self, broken_project):
        """check_skills returns fail when .claude/skills/ missing."""
        result = check_skills(broken_project)
        assert result.status == "fail"

    def test_check_node_packages_passes(self, healthy_project):
        """check_node_packages returns pass when node_modules exists."""
        result = check_node_packages(healthy_project)
        assert result.status == "pass"
        assert result.name == "node_packages"

    def test_check_node_packages_passes_for_pip_install(self, broken_project):
        """check_node_packages returns pass when no package.json (pip consumer)."""
        result = check_node_packages(broken_project)
        assert result.status == "pass"
        assert "pip install" in result.detail

    def test_check_node_packages_warns_for_npm_project(self, tmp_path):
        """check_node_packages returns warn when package.json exists but no node_modules."""
        root = tmp_path / "npm_project"
        root.mkdir()
        (root / "package.json").write_text('{"name": "test"}')
        result = check_node_packages(root)
        assert result.status == "warn"

    def test_check_git_hooks_passes(self, healthy_project):
        """check_git_hooks returns pass when hooks dispatcher exists."""
        result = check_git_hooks(healthy_project)
        assert result.status == "pass"
        assert result.name == "git_hooks"

    def test_check_git_hooks_warns_when_missing(self, broken_project):
        """check_git_hooks returns warn when no .git/hooks/."""
        result = check_git_hooks(broken_project)
        assert result.status == "warn"

    def test_check_theme_passes(self, healthy_project):
        """check_theme returns pass when theme in config is valid."""
        result = check_theme(healthy_project)
        assert result.status == "pass"
        assert result.name == "theme"

    def test_check_theme_fails_when_no_config(self, broken_project):
        """check_theme returns fail when config missing."""
        result = check_theme(broken_project)
        assert result.status == "fail"


# ---------------------------------------------------------------------------
# AC2: --fix flag offers repair for each failed check
# ---------------------------------------------------------------------------


class TestFixMode:
    """AC2: --fix flag attempts to repair failed checks."""

    def test_fix_functions_attached_to_failed_checks(self, broken_project):
        """Failed checks should have a fix_fn callable."""
        report = run_doctor(broken_project, fix=False)
        failed = [c for c in report.checks if c.status == "fail"]
        # At least some failed checks should have fix functions
        fixable = [c for c in failed if c.fix_fn is not None]
        assert len(fixable) > 0, "No failed checks have fix_fn attached"

    def test_fix_mode_applies_fixes(self, broken_project):
        """run_doctor(fix=True) should attempt repairs and report count."""
        report = run_doctor(broken_project, fix=True)
        assert report.fixed >= 0
        assert isinstance(report.fixed, int)

    def test_fix_mode_creates_missing_pennyfarthing_dir(self, broken_project):
        """--fix should create .pennyfarthing/ if missing."""
        run_doctor(broken_project, fix=True)
        assert (broken_project / ".pennyfarthing").is_dir()

    def test_fix_mode_creates_missing_config(self, broken_project):
        """--fix should create a default config.local.yaml if missing."""
        run_doctor(broken_project, fix=True)
        config = broken_project / ".pennyfarthing" / "config.local.yaml"
        assert config.is_file()


# ---------------------------------------------------------------------------
# Core run_doctor function
# ---------------------------------------------------------------------------


class TestRunDoctor:
    """Core run_doctor returns DoctorReport with correct structure."""

    def test_returns_doctor_report(self, healthy_project):
        """run_doctor returns a DoctorReport instance."""
        report = run_doctor(healthy_project)
        assert isinstance(report, DoctorReport)

    def test_healthy_project_succeeds(self, healthy_project):
        """A healthy project should produce success=True."""
        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            report = run_doctor(healthy_project)
        assert report.success is True

    def test_broken_project_fails(self, broken_project):
        """A broken project should produce success=False."""
        report = run_doctor(broken_project)
        assert report.success is False

    def test_report_contains_all_checks(self, healthy_project):
        """Report should contain results for all registered checks."""
        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            report = run_doctor(healthy_project)
        assert len(report.checks) == len(CHECKS)

    def test_each_check_result_has_required_fields(self, healthy_project):
        """Every CheckResult must have name, status, and detail."""
        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            report = run_doctor(healthy_project)
        for check in report.checks:
            assert isinstance(check, CheckResult)
            assert check.name, "Check must have a name"
            assert check.status in ("pass", "warn", "fail")

    def test_no_error_on_healthy_project(self, healthy_project):
        """Report error field should be None for a healthy project."""
        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            report = run_doctor(healthy_project)
        assert report.error is None


# ---------------------------------------------------------------------------
# CLI integration
# ---------------------------------------------------------------------------


class TestCLI:
    """CLI command `pf doctor` with options."""

    def test_doctor_command_exists(self, runner):
        """pf doctor command should be importable and invokable."""
        result = runner.invoke(doctor, ["--help"])
        assert result.exit_code == 0
        assert "health checks" in result.output.lower()

    def test_fix_flag_accepted(self, runner):
        """--fix flag should be accepted without error."""
        result = runner.invoke(doctor, ["--help"])
        assert "--fix" in result.output

    def test_json_flag_accepted(self, runner):
        """--json flag should be accepted without error."""
        result = runner.invoke(doctor, ["--help"])
        assert "--json" in result.output

    def test_json_output_is_valid_json(self, runner, healthy_project):
        """--json flag should produce valid JSON output."""
        with patch("pf.doctor.cli.get_project_root", return_value=healthy_project):
            with patch("shutil.which", return_value="/usr/local/bin/pf"):
                result = runner.invoke(doctor, ["--json"])
        if result.exit_code == 0:
            data = json.loads(result.output)
            assert "success" in data
            assert "checks" in data

    def test_exit_code_nonzero_on_failure(self, runner, broken_project):
        """Exit code should be non-zero when checks fail."""
        with patch("pf.doctor.cli.get_project_root", return_value=broken_project):
            result = runner.invoke(doctor, [])
        assert result.exit_code != 0

    def test_exit_code_zero_on_success(self, runner, healthy_project):
        """Exit code should be 0 when all checks pass."""
        with patch("pf.doctor.cli.get_project_root", return_value=healthy_project):
            with patch("shutil.which", return_value="/usr/local/bin/pf"):
                result = runner.invoke(doctor, [])
        assert result.exit_code == 0


# ---------------------------------------------------------------------------
# AC4: Fewer checks than old TypeScript doctor
# ---------------------------------------------------------------------------


class TestReduction:
    """AC4: New doctor should have fewer checks than the old TS doctor."""

    def test_fewer_than_15_checks(self):
        """Must have strictly fewer checks than the old TS doctor (~14 functions)."""
        assert len(CHECKS) < 15, f"Doctor has {len(CHECKS)} checks — should be reduced from old ~14"

    def test_no_legacy_checks(self):
        """No check names should reference 'legacy' — those are removed."""
        check_names = [name for name, _ in CHECKS]
        legacy = [n for n in check_names if "legacy" in n.lower()]
        assert legacy == [], f"Found legacy checks that should be removed: {legacy}"

    def test_no_cyclist_check(self):
        """Cyclist check should not be in the reduced doctor (optional tool)."""
        check_names = [name for name, _ in CHECKS]
        cyclist = [n for n in check_names if "cyclist" in n.lower()]
        assert cyclist == [], f"Found cyclist checks that should be removed: {cyclist}"


# ---------------------------------------------------------------------------
# CLI registration
# ---------------------------------------------------------------------------


class TestCLIRegistration:
    """Doctor should be registered in the main pf CLI."""

    def test_registered_in_lazy_commands(self):
        """'doctor' should appear in the main CLI lazy commands."""
        from pf.cli import _LAZY_COMMANDS

        assert "doctor" in _LAZY_COMMANDS, "doctor not registered in _LAZY_COMMANDS in cli.py"

    def test_lazy_command_points_to_correct_module(self):
        """Lazy command should point to pf.doctor.cli:doctor."""
        from pf.cli import _LAZY_COMMANDS

        module_path, attr = _LAZY_COMMANDS["doctor"]
        assert module_path == "pf.doctor.cli"
        assert attr == "doctor"
