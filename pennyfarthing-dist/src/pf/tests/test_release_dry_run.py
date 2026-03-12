"""Tests for pf release dry-run command.

Story 136-29: Implement pf release dry-run command.
TDD RED phase — these tests define the contract for dry_run_release()
and the CLI command `pf release dry-run`.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from pf.release.dry_run import _bump_version, _discover_packages, dry_run_release


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def release_project(tmp_path: Path) -> Path:
    """Create a minimal project structure for release testing."""
    pkg = {
        "name": "pennyfarthing",
        "version": "12.3.0",
    }
    (tmp_path / "package.json").write_text(json.dumps(pkg))
    (tmp_path / "CHANGELOG.md").write_text(
        "# Changelog\n\n## [Unreleased]\n\n- Something new\n\n## [12.2.0]\n"
    )
    return tmp_path


@pytest.fixture
def release_project_no_changelog(tmp_path: Path) -> Path:
    """Project with package.json but no CHANGELOG.md."""
    pkg = {"name": "pennyfarthing", "version": "1.0.0"}
    (tmp_path / "package.json").write_text(json.dumps(pkg))
    return tmp_path


@pytest.fixture
def release_project_with_workspaces(tmp_path: Path) -> Path:
    """Project with workspace packages."""
    pkg = {"name": "pennyfarthing", "version": "12.3.0"}
    (tmp_path / "package.json").write_text(json.dumps(pkg))
    (tmp_path / "CHANGELOG.md").write_text("# Changelog\n\n## [Unreleased]\n")

    packages_dir = tmp_path / "packages"
    for name in ["core", "cyclist", "shared"]:
        pkg_dir = packages_dir / name
        pkg_dir.mkdir(parents=True)
        child = {"name": f"@pennyfarthing/{name}", "version": "12.3.0"}
        (pkg_dir / "package.json").write_text(json.dumps(child))

    return tmp_path


@pytest.fixture
def mock_subprocess_success():
    """Mock subprocess.run to simulate successful tsc and npm pack."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = ""
    mock_result.stderr = ""
    with patch("pf.release.dry_run.subprocess.run", return_value=mock_result) as mock_run:
        yield mock_run


@pytest.fixture
def mock_subprocess_build_fail():
    """Mock subprocess.run where tsc fails."""
    def side_effect(cmd, **kwargs):
        result = MagicMock()
        if "tsc" in cmd:
            result.returncode = 1
            result.stdout = ""
            result.stderr = "error TS2345: Argument of type..."
        else:
            result.returncode = 0
            result.stdout = ""
            result.stderr = ""
        return result

    with patch("pf.release.dry_run.subprocess.run", side_effect=side_effect) as mock_run:
        yield mock_run


@pytest.fixture
def mock_subprocess_pack_fail():
    """Mock subprocess.run where npm pack fails."""
    def side_effect(cmd, **kwargs):
        result = MagicMock()
        if "pack" in cmd:
            result.returncode = 1
            result.stdout = ""
            result.stderr = "npm ERR! could not pack"
        else:
            result.returncode = 0
            result.stdout = ""
            result.stderr = ""
        return result

    with patch("pf.release.dry_run.subprocess.run", side_effect=side_effect) as mock_run:
        yield mock_run


# ===========================================================================
# Unit Tests: dry_run_release()
# ===========================================================================


class TestDryRunReleaseInputValidation:
    """AC6: Error handling — validates inputs and reports failures."""

    def test_invalid_semver_returns_error(self, tmp_path: Path) -> None:
        """Invalid semver string should return success=False."""
        (tmp_path / "package.json").write_text('{"name": "x", "version": "1.0.0"}')
        result = dry_run_release(tmp_path, version="not.a.version")
        assert result["success"] is False
        assert "Invalid version" in result["error"]

    def test_invalid_bump_type_returns_error(self, tmp_path: Path) -> None:
        """Invalid bump type should return success=False."""
        (tmp_path / "package.json").write_text('{"name": "x", "version": "1.0.0"}')
        result = dry_run_release(tmp_path, bump="mega")
        assert result["success"] is False
        assert "Invalid bump type" in result["error"]

    def test_missing_package_json_returns_error(self, tmp_path: Path) -> None:
        """Missing package.json should return success=False."""
        result = dry_run_release(tmp_path)
        assert result["success"] is False
        assert "package.json not found" in result["error"]

    def test_malformed_package_json_returns_error(self, tmp_path: Path) -> None:
        """Malformed package.json should return success=False."""
        (tmp_path / "package.json").write_text("not json at all {{{")
        result = dry_run_release(tmp_path)
        assert result["success"] is False
        assert "Failed to parse" in result["error"]

    def test_empty_version_string_rejected(self, tmp_path: Path) -> None:
        """Empty string version should be rejected."""
        (tmp_path / "package.json").write_text('{"name": "x", "version": "1.0.0"}')
        result = dry_run_release(tmp_path, version="")
        assert result["success"] is False


class TestDryRunReleaseVersionBump:
    """AC2: Version handling — accepts --version and --bump options."""

    def test_explicit_version_sets_target(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """--version=2.0.0 should set target_version."""
        result = dry_run_release(release_project, version="2.0.0")
        assert result["success"] is True
        assert result["data"]["target_version"] == "2.0.0"

    def test_bump_patch(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """--bump=patch on 12.3.0 should produce 12.3.1."""
        result = dry_run_release(release_project, bump="patch")
        assert result["data"]["target_version"] == "12.3.1"

    def test_bump_minor(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """--bump=minor on 12.3.0 should produce 12.4.0."""
        result = dry_run_release(release_project, bump="minor")
        assert result["data"]["target_version"] == "12.4.0"

    def test_bump_major(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """--bump=major on 12.3.0 should produce 13.0.0."""
        result = dry_run_release(release_project, bump="major")
        assert result["data"]["target_version"] == "13.0.0"

    def test_no_version_or_bump_defaults_to_current(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """No version or bump should default to current version."""
        result = dry_run_release(release_project)
        assert result["data"]["target_version"] == "12.3.0"
        assert result["data"]["current_version"] == "12.3.0"

    def test_prerelease_bump_strips_prerelease(
        self, tmp_path: Path, mock_subprocess_success
    ) -> None:
        """Bumping a pre-release version should strip the pre-release suffix."""
        pkg = {"name": "x", "version": "1.2.3-beta.1"}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        (tmp_path / "CHANGELOG.md").write_text("# Changelog\n\n## [Unreleased]\n")
        result = dry_run_release(tmp_path, bump="patch")
        assert result["success"] is True
        # Should bump from base 1.2.3 -> 1.2.4, stripping pre-release
        assert result["data"]["target_version"] == "1.2.4"


class TestDryRunReleaseSteps:
    """AC3 & AC4: Simulation steps and output structure."""

    def test_result_contains_dry_run_flag(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """Result should include dry_run: True."""
        result = dry_run_release(release_project, bump="patch")
        assert result["dry_run"] is True

    def test_result_contains_all_step_types(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """Result should have version_bump, changelog_update, build, pack steps."""
        result = dry_run_release(release_project, bump="patch")
        actions = [s["action"] for s in result["steps"]]
        assert "version_bump" in actions
        assert "changelog_update" in actions
        assert "build" in actions
        assert "pack" in actions

    def test_each_step_has_required_keys(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """Each step must have action, detail, and success keys."""
        result = dry_run_release(release_project, bump="patch")
        for step in result["steps"]:
            assert "action" in step, f"Step missing 'action': {step}"
            assert "detail" in step, f"Step missing 'detail': {step}"
            assert "success" in step, f"Step missing 'success': {step}"

    def test_current_version_from_package_json(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """data.current_version should match package.json version."""
        result = dry_run_release(release_project)
        assert result["data"]["current_version"] == "12.3.0"

    def test_changelog_unreleased_detected(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """Changelog step should detect [Unreleased] section."""
        result = dry_run_release(release_project, bump="patch")
        changelog_step = next(s for s in result["steps"] if s["action"] == "changelog_update")
        assert changelog_step["success"] is True
        assert "unreleased section: yes" in changelog_step["detail"].lower()

    def test_changelog_missing_reported(
        self, release_project_no_changelog: Path, mock_subprocess_success
    ) -> None:
        """Missing CHANGELOG.md should produce a failing step."""
        result = dry_run_release(release_project_no_changelog, bump="patch")
        changelog_step = next(s for s in result["steps"] if s["action"] == "changelog_update")
        assert changelog_step["success"] is False

    def test_version_file_detected(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """VERSION file presence should be noted in version_bump step."""
        (release_project / "VERSION").write_text("12.3.0")
        result = dry_run_release(release_project, bump="patch")
        bump_step = next(s for s in result["steps"] if s["action"] == "version_bump")
        assert "VERSION" in bump_step["detail"]


class TestDryRunReleaseNoMutations:
    """AC5: No mutations — does NOT commit, tag, or publish."""

    def test_package_json_unchanged(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """package.json should not be modified by dry-run."""
        before = (release_project / "package.json").read_text()
        dry_run_release(release_project, bump="major")
        after = (release_project / "package.json").read_text()
        assert before == after

    def test_changelog_unchanged(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """CHANGELOG.md should not be modified by dry-run."""
        before = (release_project / "CHANGELOG.md").read_text()
        dry_run_release(release_project, bump="minor")
        after = (release_project / "CHANGELOG.md").read_text()
        assert before == after

    def test_no_git_commands_called(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """subprocess.run should never be called with git commit/tag/push."""
        dry_run_release(release_project, bump="patch")
        for call in mock_subprocess_success.call_args_list:
            cmd = call[0][0] if call[0] else call[1].get("cmd", [])
            cmd_str = " ".join(str(c) for c in cmd) if isinstance(cmd, list) else str(cmd)
            assert "git commit" not in cmd_str
            assert "git tag" not in cmd_str
            assert "npm publish" not in cmd_str


class TestDryRunReleaseBuildFailures:
    """AC6: Build/pack failure paths."""

    def test_build_failure_produces_failing_step(
        self, release_project: Path, mock_subprocess_build_fail
    ) -> None:
        """tsc failure should produce a build step with success=False."""
        result = dry_run_release(release_project, bump="patch")
        # Overall result should still succeed (dry-run reports, doesn't fail)
        assert result["success"] is True
        build_step = next(s for s in result["steps"] if s["action"] == "build")
        assert build_step["success"] is False
        assert "Build failed" in build_step["detail"] or "error" in build_step["detail"].lower()

    def test_pack_failure_produces_failing_step(
        self, release_project: Path, mock_subprocess_pack_fail
    ) -> None:
        """npm pack failure should produce a pack step with success=False."""
        result = dry_run_release(release_project, bump="patch")
        assert result["success"] is True
        pack_step = next(s for s in result["steps"] if s["action"] == "pack")
        assert pack_step["success"] is False


class TestDryRunReleasePackages:
    """AC4: Package discovery."""

    def test_discovers_root_package(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """Should discover the root package."""
        result = dry_run_release(release_project, bump="patch")
        packages = result["data"]["packages"]
        assert len(packages) >= 1
        assert packages[0]["name"] == "pennyfarthing"

    def test_discovers_workspace_packages(
        self, release_project_with_workspaces: Path, mock_subprocess_success
    ) -> None:
        """Should discover workspace packages under packages/."""
        result = dry_run_release(release_project_with_workspaces, bump="patch")
        packages = result["data"]["packages"]
        names = [p["name"] for p in packages]
        assert "@pennyfarthing/core" in names
        assert "@pennyfarthing/cyclist" in names
        assert "@pennyfarthing/shared" in names


# ===========================================================================
# Unit Tests: _bump_version()
# ===========================================================================


class TestBumpVersion:
    """Direct tests for the version bump helper."""

    def test_patch_bump(self) -> None:
        assert _bump_version("1.2.3", "patch") == "1.2.4"

    def test_minor_bump(self) -> None:
        assert _bump_version("1.2.3", "minor") == "1.3.0"

    def test_major_bump(self) -> None:
        assert _bump_version("1.2.3", "major") == "2.0.0"

    def test_zero_version_patch(self) -> None:
        assert _bump_version("0.0.0", "patch") == "0.0.1"

    def test_prerelease_stripped_on_bump(self) -> None:
        """Pre-release suffix should be stripped before bumping."""
        assert _bump_version("1.2.3-beta.1", "patch") == "1.2.4"

    def test_large_version_numbers(self) -> None:
        assert _bump_version("100.200.300", "patch") == "100.200.301"


# ===========================================================================
# Unit Tests: _discover_packages()
# ===========================================================================


class TestDiscoverPackages:
    """Tests for workspace package discovery."""

    def test_root_only(self, tmp_path: Path) -> None:
        """No packages/ dir should return only root package."""
        pkg = {"name": "root", "version": "1.0.0"}
        packages = _discover_packages(tmp_path, pkg)
        assert len(packages) == 1
        assert packages[0]["name"] == "root"

    def test_with_workspaces(self, release_project_with_workspaces: Path) -> None:
        """Should discover root + 3 workspace packages."""
        pkg = json.loads((release_project_with_workspaces / "package.json").read_text())
        packages = _discover_packages(release_project_with_workspaces, pkg)
        assert len(packages) == 4  # root + core + cyclist + shared

    def test_skips_malformed_workspace_package(self, tmp_path: Path) -> None:
        """Malformed workspace package.json should be skipped."""
        pkg = {"name": "root", "version": "1.0.0"}
        bad_pkg_dir = tmp_path / "packages" / "broken"
        bad_pkg_dir.mkdir(parents=True)
        (bad_pkg_dir / "package.json").write_text("{{{not json")
        packages = _discover_packages(tmp_path, pkg)
        assert len(packages) == 1  # only root


# ===========================================================================
# CLI Integration Tests
# ===========================================================================


class TestDryRunCLI:
    """AC1: Command exists and is callable via CLI."""

    def test_dry_run_help(self) -> None:
        """pf release dry-run --help should exit 0."""
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["dry-run", "--help"])
        assert result.exit_code == 0
        assert "dry-run" in result.output.lower() or "Simulate" in result.output

    def test_dry_run_with_bump_flag(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """pf release dry-run --bump=patch should display simulation."""
        from pf.release.cli import release

        runner = CliRunner()
        with patch("pf.common.config.get_project_root", return_value=release_project):
            result = runner.invoke(release, ["dry-run", "--bump", "patch"])
        assert result.exit_code == 0
        assert "DRY RUN" in result.output
        assert "12.3.0" in result.output  # current version

    def test_dry_run_with_version_flag(
        self, release_project: Path, mock_subprocess_success
    ) -> None:
        """pf release dry-run --version=13.0.0 should display simulation."""
        from pf.release.cli import release

        runner = CliRunner()
        with patch("pf.common.config.get_project_root", return_value=release_project):
            result = runner.invoke(release, ["dry-run", "--version", "13.0.0"])
        assert result.exit_code == 0
        assert "13.0.0" in result.output

    def test_dry_run_error_shows_message(self, tmp_path: Path) -> None:
        """Errors should print to stderr and exit non-zero."""
        from pf.release.cli import release

        runner = CliRunner()
        with patch("pf.common.config.get_project_root", return_value=tmp_path):
            result = runner.invoke(release, ["dry-run"])
        assert result.exit_code != 0

    def test_dry_run_invalid_version_via_cli(
        self, release_project: Path
    ) -> None:
        """Invalid version via CLI should exit non-zero with error."""
        from pf.release.cli import release

        runner = CliRunner()
        with patch("pf.common.config.get_project_root", return_value=release_project):
            result = runner.invoke(release, ["dry-run", "--version", "not-semver"])
        assert result.exit_code != 0
        assert "Invalid version" in result.output or "Error" in result.output
