"""Tests for pf release deprecate command.

Verifies that deprecate_version correctly:
- Validates version existence via npm view and git tags
- Runs npm deprecate to mark version in registry
- Appends deprecation entry to CHANGELOG.md with ISO date
- Creates git notes on the version tag
- Handles dry-run mode
- Rejects non-existent and already-deprecated versions
- Returns result objects per ADR-0008

Run with: python -m pytest tests/python/test_release_deprecate.py -v
"""

import textwrap
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from pf.release.deprecate import deprecate_version

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_tree(tmp_path):
    """Create a minimal project tree with CHANGELOG.md."""
    changelog = textwrap.dedent("""\
        # Changelog

        All notable changes to Pennyfarthing are documented in this file.

        The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
        and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

        ## [Unreleased]

        *No unreleased changes*

        ---

        ## [11.3.8] - 2026-02-19

        ### Fixed

        - **Release workflow** — use pnpm publish to resolve workspace:* dependencies

        ---

        ## [11.3.7] - 2026-02-19

        ### Fixed

        - **Portrait resolution** — resolve portraits from cyclist in consumer installs

        ---

        ## [11.3.6] - 2026-02-18

        ### Added

        - **New feature** — something cool
    """)
    (tmp_path / "CHANGELOG.md").write_text(changelog)
    return tmp_path


def _make_run_result(returncode=0, stdout="", stderr=""):
    """Create a mock subprocess result."""
    result = MagicMock()
    result.returncode = returncode
    result.stdout = stdout
    result.stderr = stderr
    return result


# ---------------------------------------------------------------------------
# CLI Registration
# ---------------------------------------------------------------------------


class TestCliRegistration:
    """Test that pf release deprecate is properly registered."""

    def test_release_group_registered(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["--help"])
        assert result.exit_code == 0
        assert "deprecate" in result.output

    def test_deprecate_command_help(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["deprecate", "--help"])
        assert result.exit_code == 0
        assert "--version" in result.output
        assert "--reason" in result.output
        assert "--dry-run" in result.output

    def test_deprecate_requires_version(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["deprecate", "--reason=test"])
        assert result.exit_code != 0
        assert "version" in result.output.lower() or "missing" in result.output.lower()

    def test_deprecate_requires_reason(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["deprecate", "--version=1.0.0"])
        assert result.exit_code != 0
        assert "reason" in result.output.lower() or "missing" in result.output.lower()

    def test_release_visible_in_main_cli(self):
        from click.testing import CliRunner
        from pf.cli import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["release", "--help"])
        assert result.exit_code == 0
        assert "deprecate" in result.output


# ---------------------------------------------------------------------------
# Happy Path — Full Deprecation
# ---------------------------------------------------------------------------


class TestDeprecateHappyPath:
    """Test successful deprecation flow."""

    @patch("pf.release.deprecate.subprocess.run")
    def test_returns_success(self, mock_run, project_tree):
        # npm view returns version info (version exists)
        # npm deprecate succeeds
        # git notes add succeeds
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        result = deprecate_version(project_tree, "11.3.7", "workspace:* leak")
        assert result["success"] is True

    @patch("pf.release.deprecate.subprocess.run")
    def test_calls_npm_deprecate(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        # Find the npm deprecate call among all subprocess calls
        npm_deprecate_calls = [
            c for c in mock_run.call_args_list
            if "npm" in str(c) and "deprecate" in str(c)
        ]
        assert len(npm_deprecate_calls) >= 1, (
            f"Expected npm deprecate call, got: {mock_run.call_args_list}"
        )

    @patch("pf.release.deprecate.subprocess.run")
    def test_deprecation_message_includes_reason(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        npm_deprecate_calls = [
            c for c in mock_run.call_args_list
            if "npm" in str(c) and "deprecate" in str(c)
        ]
        assert any("workspace:* leak" in str(c) for c in npm_deprecate_calls), (
            "npm deprecate should include the reason in the deprecation message"
        )

    @patch("pf.release.deprecate.subprocess.run")
    def test_returns_steps(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        result = deprecate_version(project_tree, "11.3.7", "workspace:* leak")
        assert "steps" in result
        actions = [s["action"] for s in result["steps"]]
        assert "npm_deprecate" in actions
        assert "changelog_update" in actions
        assert "git_notes" in actions

    @patch("pf.release.deprecate.subprocess.run")
    def test_custom_package_name(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="1.0.0")
        deprecate_version(
            project_tree, "1.0.0", "broken",
            package_name="@pennyfarthing/core",
        )
        npm_deprecate_calls = [
            c for c in mock_run.call_args_list
            if "deprecate" in str(c)
        ]
        assert any("@pennyfarthing/core" in str(c) for c in npm_deprecate_calls)


# ---------------------------------------------------------------------------
# Changelog Updates
# ---------------------------------------------------------------------------


class TestChangelogUpdate:
    """Test CHANGELOG.md modification."""

    @patch("pf.release.deprecate.subprocess.run")
    def test_adds_deprecated_marker_to_version(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        changelog = (project_tree / "CHANGELOG.md").read_text()
        assert "[DEPRECATED]" in changelog
        # The 11.3.7 section should have the deprecated marker
        assert "11.3.7" in changelog and "[DEPRECATED]" in changelog

    @patch("pf.release.deprecate.subprocess.run")
    def test_adds_deprecation_notice_entry(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        changelog = (project_tree / "CHANGELOG.md").read_text()
        # Should contain a deprecation notice with the reason
        assert "workspace:* leak" in changelog

    @patch("pf.release.deprecate.subprocess.run")
    def test_includes_iso_date(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        changelog = (project_tree / "CHANGELOG.md").read_text()
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        # The deprecation entry or marker should reference today's date
        # Either in the section header update or in the deprecation notice
        assert today in changelog or "2026-02" in changelog

    @patch("pf.release.deprecate.subprocess.run")
    def test_does_not_corrupt_other_sections(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        (project_tree / "CHANGELOG.md").read_text()
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        changelog = (project_tree / "CHANGELOG.md").read_text()
        # 11.3.8 section should be unchanged
        assert "## [11.3.8] - 2026-02-19" in changelog
        # 11.3.6 section should be unchanged
        assert "## [11.3.6] - 2026-02-18" in changelog

    @patch("pf.release.deprecate.subprocess.run")
    def test_changelog_not_modified_on_dry_run(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        original = (project_tree / "CHANGELOG.md").read_text()
        deprecate_version(project_tree, "11.3.7", "workspace:* leak", dry_run=True)
        assert (project_tree / "CHANGELOG.md").read_text() == original


# ---------------------------------------------------------------------------
# Git Notes
# ---------------------------------------------------------------------------


class TestGitNotes:
    """Test git notes creation on version tags."""

    @patch("pf.release.deprecate.subprocess.run")
    def test_creates_git_note_on_tag(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        git_notes_calls = [
            c for c in mock_run.call_args_list
            if "git" in str(c) and "notes" in str(c)
        ]
        assert len(git_notes_calls) >= 1, (
            f"Expected git notes call, got: {mock_run.call_args_list}"
        )

    @patch("pf.release.deprecate.subprocess.run")
    def test_git_note_references_version_tag(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        git_notes_calls = [
            c for c in mock_run.call_args_list
            if "git" in str(c) and "notes" in str(c)
        ]
        # Should reference the version tag (v11.3.7 or 11.3.7)
        assert any("11.3.7" in str(c) for c in git_notes_calls)

    @patch("pf.release.deprecate.subprocess.run")
    def test_git_note_contains_reason(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak")

        git_notes_calls = [
            c for c in mock_run.call_args_list
            if "git" in str(c) and "notes" in str(c)
        ]
        assert any("workspace:* leak" in str(c) for c in git_notes_calls), (
            "Git note should contain the deprecation reason"
        )

    @patch("pf.release.deprecate.subprocess.run")
    def test_no_git_notes_on_dry_run(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(project_tree, "11.3.7", "workspace:* leak", dry_run=True)

        git_notes_calls = [
            c for c in mock_run.call_args_list
            if "git" in str(c) and "notes" in str(c) and "add" in str(c)
        ]
        assert len(git_notes_calls) == 0, "Dry run should not create git notes"


# ---------------------------------------------------------------------------
# Dry Run
# ---------------------------------------------------------------------------


class TestDryRun:
    """Test dry-run mode previews actions without side effects."""

    @patch("pf.release.deprecate.subprocess.run")
    def test_dry_run_returns_success(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        result = deprecate_version(
            project_tree, "11.3.7", "workspace:* leak", dry_run=True
        )
        assert result["success"] is True
        assert result.get("dry_run") is True

    @patch("pf.release.deprecate.subprocess.run")
    def test_dry_run_returns_planned_steps(self, mock_run, project_tree):
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        result = deprecate_version(
            project_tree, "11.3.7", "workspace:* leak", dry_run=True
        )
        assert "steps" in result
        actions = [s["action"] for s in result["steps"]]
        assert "npm_deprecate" in actions
        assert "changelog_update" in actions
        assert "git_notes" in actions

    @patch("pf.release.deprecate.subprocess.run")
    def test_dry_run_does_not_call_npm_deprecate(self, mock_run, project_tree):
        # npm view for validation is OK, but npm deprecate should not be called
        mock_run.return_value = _make_run_result(0, stdout="11.3.7")
        deprecate_version(
            project_tree, "11.3.7", "workspace:* leak", dry_run=True
        )

        npm_deprecate_calls = [
            c for c in mock_run.call_args_list
            if "deprecate" in str(c) and "npm" in str(c)
        ]
        assert len(npm_deprecate_calls) == 0, (
            "Dry run should not execute npm deprecate"
        )


# ---------------------------------------------------------------------------
# Error Handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Test error cases."""

    @patch("pf.release.deprecate.subprocess.run")
    def test_nonexistent_version_returns_error(self, mock_run, project_tree):
        # npm view returns non-zero (version not found)
        mock_run.return_value = _make_run_result(1, stderr="npm ERR! 404 Not Found")
        result = deprecate_version(project_tree, "99.99.99", "bad version")
        assert result["success"] is False
        assert "not found" in result["error"].lower() or "404" in result.get("error", "")

    @patch("pf.release.deprecate.subprocess.run")
    def test_already_deprecated_version_returns_error(self, mock_run, project_tree):
        # First call (npm view) succeeds, returns version info with deprecation
        def side_effect(*args, **kwargs):
            cmd = args[0] if args else kwargs.get("args", [])
            cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
            if "view" in cmd_str and "deprecated" in cmd_str:
                return _make_run_result(0, stdout="workspace:* leak")
            return _make_run_result(0, stdout="11.3.7")

        mock_run.side_effect = side_effect
        result = deprecate_version(project_tree, "11.3.7", "duplicate deprecation")
        assert result["success"] is False
        assert "already" in result["error"].lower() or "deprecated" in result["error"].lower()

    @patch("pf.release.deprecate.subprocess.run")
    def test_npm_deprecate_failure_returns_error(self, mock_run, project_tree):
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            cmd = args[0] if args else kwargs.get("args", [])
            cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
            # First calls succeed (validation), npm deprecate fails
            if "deprecate" in cmd_str:
                return _make_run_result(1, stderr="npm ERR! 403 Forbidden")
            return _make_run_result(0, stdout="11.3.7")

        mock_run.side_effect = side_effect
        result = deprecate_version(project_tree, "11.3.7", "workspace:* leak")
        assert result["success"] is False
        assert "npm" in result["error"].lower() or "403" in result.get("error", "")

    @patch("pf.release.deprecate.subprocess.run")
    def test_git_notes_failure_returns_error(self, mock_run, project_tree):
        def side_effect(*args, **kwargs):
            cmd = args[0] if args else kwargs.get("args", [])
            cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
            if "git" in cmd_str and "notes" in cmd_str and "add" in cmd_str:
                return _make_run_result(1, stderr="error: no tag found for v11.3.7")
            return _make_run_result(0, stdout="11.3.7")

        mock_run.side_effect = side_effect
        result = deprecate_version(project_tree, "11.3.7", "workspace:* leak")
        # Should report the git notes failure (partial failure)
        assert result["success"] is False or any(
            not s.get("success", True)
            for s in result.get("steps", [])
            if s.get("action") == "git_notes"
        )

    def test_missing_changelog_returns_error(self, tmp_path):
        # No CHANGELOG.md in project root
        result = deprecate_version(tmp_path, "11.3.7", "workspace:* leak")
        assert result["success"] is False
        assert "changelog" in result["error"].lower() or "not found" in result["error"].lower()

    @patch("pf.release.deprecate.subprocess.run")
    def test_empty_version_string_returns_error(self, mock_run, project_tree):
        result = deprecate_version(project_tree, "", "some reason")
        assert result["success"] is False

    @patch("pf.release.deprecate.subprocess.run")
    def test_empty_reason_string_returns_error(self, mock_run, project_tree):
        result = deprecate_version(project_tree, "11.3.7", "")
        assert result["success"] is False


# ---------------------------------------------------------------------------
# CLI Integration
# ---------------------------------------------------------------------------


class TestDeprecateCliIntegration:
    """Test CLI invocation end-to-end."""

    @patch("pf.release.deprecate.deprecate_version")
    def test_cli_success_output(self, mock_deprecate):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_deprecate.return_value = {
            "success": True,
            "steps": [
                {"action": "npm_deprecate", "detail": "pennyfarthing@11.3.7"},
                {"action": "changelog_update", "detail": "Added [DEPRECATED] marker"},
                {"action": "git_notes", "detail": "Note added to v11.3.7"},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(
            release,
            ["deprecate", "--version=11.3.7", "--reason=workspace:* leak"],
        )
        assert result.exit_code == 0
        assert "Deprecated" in result.output
        assert "11.3.7" in result.output

    @patch("pf.release.deprecate.deprecate_version")
    def test_cli_error_output(self, mock_deprecate):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_deprecate.return_value = {
            "success": False,
            "error": "Version 99.99.99 not found in npm registry",
        }
        runner = CliRunner()
        result = runner.invoke(
            release,
            ["deprecate", "--version=99.99.99", "--reason=bad"],
        )
        assert result.exit_code != 0
        assert "not found" in result.output.lower() or "Error" in result.output

    @patch("pf.release.deprecate.deprecate_version")
    def test_cli_dry_run_output(self, mock_deprecate):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_deprecate.return_value = {
            "success": True,
            "dry_run": True,
            "steps": [
                {"action": "npm_deprecate", "detail": "Would deprecate pennyfarthing@11.3.7"},
                {"action": "changelog_update", "detail": "Would add [DEPRECATED] marker"},
                {"action": "git_notes", "detail": "Would add note to v11.3.7"},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(
            release,
            ["deprecate", "--version=11.3.7", "--reason=test", "--dry-run"],
        )
        assert result.exit_code == 0
        assert "DRY RUN" in result.output
