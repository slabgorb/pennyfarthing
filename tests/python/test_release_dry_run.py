"""Tests for pf release dry-run command.

Verifies that dry_run_release correctly:
- Reads current version from package.json / VERSION
- Simulates version bump, changelog, build, and pack steps
- Returns result objects per ADR-0008 with step details
- Does NOT modify any files, commit, tag, or publish
- Supports explicit --version override and --bump type
- Handles missing files and invalid inputs gracefully

Run with: python -m pytest tests/python/test_release_dry_run.py -v
"""

import json
import textwrap
from unittest.mock import MagicMock, patch

import pytest
from pf.release.dry_run import dry_run_release


def _cmd_contains(call_obj, token: str) -> bool:
    """Check if a mock call's command list contains a token (ignoring cwd/kwargs)."""
    args = call_obj.args[0] if call_obj.args else call_obj.kwargs.get("args", [])
    return any(token in arg for arg in args) if isinstance(args, list) else False


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_tree(tmp_path):
    """Create a minimal project tree with package.json, VERSION, CHANGELOG.md."""
    (tmp_path / "VERSION").write_text("11.4.0\n")
    (tmp_path / "package.json").write_text(json.dumps({
        "name": "pennyfarthing",
        "version": "11.4.0",
    }))
    changelog = textwrap.dedent("""\
        # Changelog

        All notable changes to Pennyfarthing are documented in this file.

        ## [Unreleased]

        *No unreleased changes*

        ---

        ## [11.4.0] - 2026-02-20

        ### Added

        - **New feature** — something cool

        ---

        ## [11.3.8] - 2026-02-19

        ### Fixed

        - **Release workflow** — use pnpm publish
    """)
    (tmp_path / "CHANGELOG.md").write_text(changelog)

    # Minimal pnpm-workspace.yaml
    (tmp_path / "pnpm-workspace.yaml").write_text("packages:\n  - packages/*\n")

    # Create packages/core with package.json
    core_dir = tmp_path / "packages" / "core"
    core_dir.mkdir(parents=True)
    (core_dir / "package.json").write_text(json.dumps({
        "name": "@pennyfarthing/core",
        "version": "11.4.0",
    }))

    return tmp_path


@pytest.fixture
def project_tree_prerelease(tmp_path):
    """Create a project tree with prerelease version."""
    (tmp_path / "VERSION").write_text("12.0.0-alpha.2\n")
    (tmp_path / "package.json").write_text(json.dumps({
        "name": "pennyfarthing",
        "version": "12.0.0-alpha.2",
    }))
    (tmp_path / "CHANGELOG.md").write_text("# Changelog\n\n## [Unreleased]\n")
    return tmp_path


# ---------------------------------------------------------------------------
# CLI Registration
# ---------------------------------------------------------------------------


class TestCliRegistration:
    """Test that pf release dry-run is properly registered."""

    def test_dry_run_command_in_release_group(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["--help"])
        assert result.exit_code == 0
        assert "dry-run" in result.output

    def test_dry_run_command_help(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--help"])
        assert result.exit_code == 0
        assert "--version" in result.output
        assert "--bump" in result.output

    def test_dry_run_accessible_from_main_cli(self):
        from click.testing import CliRunner
        from pf.cli import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["release", "dry-run", "--help"])
        assert result.exit_code == 0
        assert "--version" in result.output


# ---------------------------------------------------------------------------
# Core Logic — Happy Path
# ---------------------------------------------------------------------------


class TestDryRunHappyPath:
    """Test successful dry-run simulation."""

    def test_returns_success(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result["success"] is True

    def test_returns_dry_run_flag(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result.get("dry_run") is True

    def test_returns_steps(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert "steps" in result
        assert len(result["steps"]) >= 4

    def test_step_actions_cover_pipeline(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        actions = [s["action"] for s in result["steps"]]
        assert "version_bump" in actions
        assert "changelog_update" in actions
        assert "build" in actions
        assert "pack" in actions

    def test_each_step_has_detail(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        for step in result["steps"]:
            assert "action" in step
            assert "detail" in step

    def test_returns_current_version(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result.get("data", {}).get("current_version") == "11.4.0"

    def test_returns_target_version(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result.get("data", {}).get("target_version") == "11.4.1"


# ---------------------------------------------------------------------------
# Version Resolution
# ---------------------------------------------------------------------------


class TestVersionResolution:
    """Test version reading and bump computation."""

    def test_reads_version_from_package_json(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result["data"]["current_version"] == "11.4.0"

    def test_patch_bump(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        assert result["data"]["target_version"] == "11.4.1"

    def test_minor_bump(self, project_tree):
        result = dry_run_release(project_tree, bump="minor")
        assert result["data"]["target_version"] == "11.5.0"

    def test_major_bump(self, project_tree):
        result = dry_run_release(project_tree, bump="major")
        assert result["data"]["target_version"] == "12.0.0"

    def test_explicit_version_overrides_bump(self, project_tree):
        result = dry_run_release(project_tree, version="99.0.0")
        assert result["data"]["target_version"] == "99.0.0"

    def test_default_version_is_current(self, project_tree):
        """With no bump and no explicit version, target == current."""
        result = dry_run_release(project_tree)
        assert result["data"]["target_version"] == "11.4.0"

    def test_prerelease_version_detected(self, project_tree_prerelease):
        result = dry_run_release(project_tree_prerelease)
        assert result["data"]["current_version"] == "12.0.0-alpha.2"


# ---------------------------------------------------------------------------
# Step Details — Version Bump
# ---------------------------------------------------------------------------


class TestVersionBumpStep:
    """Test version_bump step details."""

    def test_lists_files_that_would_change(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        bump_step = next(s for s in result["steps"] if s["action"] == "version_bump")
        detail = bump_step["detail"]
        # Should mention what files would be updated
        assert "VERSION" in detail or "package.json" in detail

    def test_shows_version_transition(self, project_tree):
        result = dry_run_release(project_tree, bump="minor")
        bump_step = next(s for s in result["steps"] if s["action"] == "version_bump")
        # Should show old → new version
        assert "11.4.0" in bump_step["detail"]
        assert "11.5.0" in bump_step["detail"]


# ---------------------------------------------------------------------------
# Step Details — Changelog
# ---------------------------------------------------------------------------


class TestChangelogStep:
    """Test changelog_update step details."""

    def test_detects_changelog_exists(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        cl_step = next(s for s in result["steps"] if s["action"] == "changelog_update")
        assert cl_step.get("success", True) is True

    def test_detects_unreleased_section(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        cl_step = next(s for s in result["steps"] if s["action"] == "changelog_update")
        # Should note whether there are unreleased changes
        assert "detail" in cl_step


# ---------------------------------------------------------------------------
# Step Details — Build
# ---------------------------------------------------------------------------


class TestBuildStep:
    """Test build step validation."""

    def test_build_step_present(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        build_step = next(s for s in result["steps"] if s["action"] == "build")
        assert "detail" in build_step

    @patch("pf.release.dry_run.subprocess.run")
    def test_build_check_runs_tsc(self, mock_run, project_tree):
        """Build step should check TypeScript compilation (--noEmit)."""
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        dry_run_release(project_tree, bump="patch")

        tsc_calls = [
            c for c in mock_run.call_args_list
            if "tsc" in str(c) or "build" in str(c)
        ]
        # Should attempt some build validation
        assert len(tsc_calls) >= 1 or len(mock_run.call_args_list) >= 1

    @patch("pf.release.dry_run.subprocess.run")
    def test_build_failure_reported(self, mock_run, project_tree):
        """If build check fails, step should report failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="error TS2322: Type 'string' is not assignable",
        )
        result = dry_run_release(project_tree, bump="patch")
        build_step = next(s for s in result["steps"] if s["action"] == "build")
        assert build_step.get("success") is False


# ---------------------------------------------------------------------------
# Step Details — Pack
# ---------------------------------------------------------------------------


class TestPackStep:
    """Test pack step validation."""

    def test_pack_step_present(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        pack_step = next(s for s in result["steps"] if s["action"] == "pack")
        assert "detail" in pack_step

    @patch("pf.release.dry_run.subprocess.run")
    def test_pack_runs_npm_pack_dry_run(self, mock_run, project_tree):
        """Pack step should use npm pack --dry-run."""
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        dry_run_release(project_tree, bump="patch")

        pack_calls = [
            c for c in mock_run.call_args_list
            if "pack" in str(c)
        ]
        assert len(pack_calls) >= 1, (
            f"Expected npm pack call, got: {mock_run.call_args_list}"
        )

    @patch("pf.release.dry_run.subprocess.run")
    def test_pack_failure_reported(self, mock_run, project_tree):
        """If pack check fails, step should report failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="npm ERR! Invalid package",
        )
        result = dry_run_release(project_tree, bump="patch")
        pack_step = next(s for s in result["steps"] if s["action"] == "pack")
        assert pack_step.get("success") is False


# ---------------------------------------------------------------------------
# No Side Effects
# ---------------------------------------------------------------------------


class TestNoSideEffects:
    """Verify dry-run does NOT modify anything."""

    def test_version_file_unchanged(self, project_tree):
        original = (project_tree / "VERSION").read_text()
        dry_run_release(project_tree, bump="major")
        assert (project_tree / "VERSION").read_text() == original

    def test_package_json_unchanged(self, project_tree):
        original = (project_tree / "package.json").read_text()
        dry_run_release(project_tree, bump="major")
        assert (project_tree / "package.json").read_text() == original

    def test_changelog_unchanged(self, project_tree):
        original = (project_tree / "CHANGELOG.md").read_text()
        dry_run_release(project_tree, bump="major")
        assert (project_tree / "CHANGELOG.md").read_text() == original

    def test_workspace_packages_unchanged(self, project_tree):
        core_pkg = project_tree / "packages" / "core" / "package.json"
        original = core_pkg.read_text()
        dry_run_release(project_tree, bump="major")
        assert core_pkg.read_text() == original

    @patch("pf.release.dry_run.subprocess.run")
    def test_no_git_commit(self, mock_run, project_tree):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        dry_run_release(project_tree, bump="patch")

        git_commit_calls = [
            c for c in mock_run.call_args_list
            if _cmd_contains(c, "git") and _cmd_contains(c, "commit")
        ]
        assert len(git_commit_calls) == 0, "Dry run must not git commit"

    @patch("pf.release.dry_run.subprocess.run")
    def test_no_git_tag(self, mock_run, project_tree):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        dry_run_release(project_tree, bump="patch")

        git_tag_calls = [
            c for c in mock_run.call_args_list
            if _cmd_contains(c, "git") and _cmd_contains(c, "tag")
        ]
        assert len(git_tag_calls) == 0, "Dry run must not git tag"

    @patch("pf.release.dry_run.subprocess.run")
    def test_no_npm_publish(self, mock_run, project_tree):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        dry_run_release(project_tree, bump="patch")

        npm_publish_calls = [
            c for c in mock_run.call_args_list
            if _cmd_contains(c, "npm") and _cmd_contains(c, "publish")
        ]
        assert len(npm_publish_calls) == 0, "Dry run must not npm publish"


# ---------------------------------------------------------------------------
# Error Handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Test error cases."""

    def test_missing_package_json(self, tmp_path):
        (tmp_path / "VERSION").write_text("1.0.0\n")
        (tmp_path / "CHANGELOG.md").write_text("# Changelog\n")
        result = dry_run_release(tmp_path, bump="patch")
        assert result["success"] is False
        assert "package.json" in result["error"].lower()

    def test_missing_version_file(self, tmp_path):
        """Should fall back to package.json version if VERSION missing."""
        (tmp_path / "package.json").write_text(json.dumps({
            "name": "pennyfarthing",
            "version": "1.0.0",
        }))
        (tmp_path / "CHANGELOG.md").write_text("# Changelog\n")
        result = dry_run_release(tmp_path, bump="patch")
        # Should still work — VERSION is optional, package.json is primary
        assert result["success"] is True
        assert result["data"]["current_version"] == "1.0.0"

    def test_missing_changelog(self, tmp_path):
        (tmp_path / "VERSION").write_text("1.0.0\n")
        (tmp_path / "package.json").write_text(json.dumps({
            "name": "pennyfarthing",
            "version": "1.0.0",
        }))
        result = dry_run_release(tmp_path, bump="patch")
        # Should report changelog issue in step, not hard fail
        cl_step = next(
            (s for s in result.get("steps", []) if s["action"] == "changelog_update"),
            None,
        )
        if cl_step:
            assert cl_step.get("success") is False

    def test_invalid_bump_type(self, project_tree):
        result = dry_run_release(project_tree, bump="supermajor")
        assert result["success"] is False
        assert "bump" in result["error"].lower() or "invalid" in result["error"].lower()

    def test_invalid_explicit_version(self, project_tree):
        result = dry_run_release(project_tree, version="not.a.version")
        assert result["success"] is False

    def test_malformed_package_json(self, tmp_path):
        (tmp_path / "package.json").write_text("{ invalid json")
        (tmp_path / "CHANGELOG.md").write_text("# Changelog\n")
        result = dry_run_release(tmp_path, bump="patch")
        assert result["success"] is False


# ---------------------------------------------------------------------------
# Workspace Package Detection
# ---------------------------------------------------------------------------


class TestWorkspaceDetection:
    """Test that workspace packages are discovered and reported."""

    def test_lists_workspace_packages(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        packages = result.get("data", {}).get("packages", [])
        # Should find at least the root package
        assert len(packages) >= 1

    def test_includes_package_names(self, project_tree):
        result = dry_run_release(project_tree, bump="patch")
        packages = result.get("data", {}).get("packages", [])
        names = [p.get("name") for p in packages]
        assert "pennyfarthing" in names or "@pennyfarthing/core" in names


# ---------------------------------------------------------------------------
# CLI Integration
# ---------------------------------------------------------------------------


class TestDryRunCliIntegration:
    """Test CLI invocation end-to-end."""

    @patch("pf.release.dry_run.dry_run_release")
    def test_cli_success_output(self, mock_dry_run):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_dry_run.return_value = {
            "success": True,
            "dry_run": True,
            "data": {
                "current_version": "11.4.0",
                "target_version": "11.4.1",
                "packages": [{"name": "pennyfarthing", "version": "11.4.0"}],
            },
            "steps": [
                {"action": "version_bump", "detail": "11.4.0 -> 11.4.1", "success": True},
                {"action": "changelog_update", "detail": "Would update CHANGELOG.md", "success": True},
                {"action": "build", "detail": "TypeScript compilation check", "success": True},
                {"action": "pack", "detail": "npm pack --dry-run", "success": True},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--bump=patch"])
        assert result.exit_code == 0
        assert "DRY RUN" in result.output or "dry" in result.output.lower()

    @patch("pf.release.dry_run.dry_run_release")
    def test_cli_shows_steps(self, mock_dry_run):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_dry_run.return_value = {
            "success": True,
            "dry_run": True,
            "data": {
                "current_version": "11.4.0",
                "target_version": "11.4.1",
                "packages": [],
            },
            "steps": [
                {"action": "version_bump", "detail": "11.4.0 -> 11.4.1", "success": True},
                {"action": "changelog_update", "detail": "CHANGELOG.md", "success": True},
                {"action": "build", "detail": "TypeScript check", "success": True},
                {"action": "pack", "detail": "npm pack", "success": True},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--bump=patch"])
        assert "version_bump" in result.output
        assert "changelog_update" in result.output
        assert "build" in result.output
        assert "pack" in result.output

    @patch("pf.release.dry_run.dry_run_release")
    def test_cli_error_output(self, mock_dry_run):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_dry_run.return_value = {
            "success": False,
            "error": "package.json not found",
        }
        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--bump=patch"])
        assert result.exit_code != 0
        assert "package.json" in result.output.lower() or "Error" in result.output

    @patch("pf.release.dry_run.dry_run_release")
    def test_cli_version_flag(self, mock_dry_run):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_dry_run.return_value = {
            "success": True,
            "dry_run": True,
            "data": {"current_version": "11.4.0", "target_version": "99.0.0", "packages": []},
            "steps": [],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--version=99.0.0"])
        assert result.exit_code == 0
        # Verify the function was called with the explicit version
        mock_dry_run.assert_called_once()
        call_kwargs = mock_dry_run.call_args
        # Either positional or keyword arg for version
        assert "99.0.0" in str(call_kwargs)

    @patch("pf.release.dry_run.dry_run_release")
    def test_cli_bump_flag(self, mock_dry_run):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_dry_run.return_value = {
            "success": True,
            "dry_run": True,
            "data": {"current_version": "11.4.0", "target_version": "12.0.0", "packages": []},
            "steps": [],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--bump=major"])
        assert result.exit_code == 0
        mock_dry_run.assert_called_once()
        assert "major" in str(mock_dry_run.call_args)
