"""Tests for pf release verify command — package contents verification.

Verifies that verify_contents correctly:
- Loads a known-good manifest (package-manifest.json)
- Runs npm pack --dry-run --json to get tarball file list
- Validates all required root files, directories, subdirectories, and critical files
- Detects unexpected top-level entries
- Detects empty required directories
- Returns result objects per ADR-0008 with step-level diagnostics
- Integrates as a CLI command (pf release verify)

Run with: python -m pytest tests/python/test_release_verify_contents.py -v
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pf.release.verify_contents import verify_contents


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_MANIFEST = {
    "required_root_files": ["package.json", "README.md", "LICENSE"],
    "required_top_level_dirs": ["packages", "pennyfarthing-dist"],
    "allowed_top_level_entries": [
        "package.json",
        "README.md",
        "LICENSE",
        "packages",
        "pennyfarthing-dist",
    ],
    "required_pennyfarthing_dist_subdirs": [
        "agents",
        "commands",
        "guides",
        "skills",
        "workflows",
    ],
    "required_packages_subdirs": ["core"],
    "critical_files": [
        "packages/core/dist/index.js",
        "pennyfarthing-dist/pyproject.toml",
    ],
    "required_pennyfarthing_dist_scripts": [
        "pennyfarthing-dist/scripts/lib/find-root.sh",
    ],
}


def _make_pack_output(files: list[str]) -> str:
    """Build fake npm pack --dry-run --json output."""
    return json.dumps([{
        "id": "pennyfarthing@12.0.0",
        "name": "pennyfarthing",
        "version": "12.0.0",
        "size": 100000,
        "unpackedSize": 500000,
        "shasum": "abc123",
        "integrity": "sha512-abc",
        "filename": "pennyfarthing-12.0.0.tgz",
        "files": [{"path": f, "size": 100} for f in files],
        "entryCount": len(files),
    }])


def _all_good_files() -> list[str]:
    """Return a file list that satisfies all manifest requirements."""
    return [
        # Root files
        "package.json",
        "README.md",
        "LICENSE",
        # packages/core
        "packages/core/dist/index.js",
        "packages/core/dist/index.d.ts",
        "packages/core/package.json",
        # pennyfarthing-dist subdirs (at least one file each)
        "pennyfarthing-dist/agents/sm.md",
        "pennyfarthing-dist/commands/help.md",
        "pennyfarthing-dist/guides/bikelane.md",
        "pennyfarthing-dist/skills/testing.md",
        "pennyfarthing-dist/workflows/tdd.yaml",
        "pennyfarthing-dist/pyproject.toml",
        # Scripts
        "pennyfarthing-dist/scripts/lib/find-root.sh",
    ]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_root(tmp_path):
    """Create minimal project root with package.json and manifest."""
    (tmp_path / "package.json").write_text(json.dumps({
        "name": "pennyfarthing",
        "version": "12.0.0",
    }))
    # Write manifest
    fixtures_dir = tmp_path / "tests" / "fixtures"
    fixtures_dir.mkdir(parents=True)
    (fixtures_dir / "package-manifest.json").write_text(
        json.dumps(SAMPLE_MANIFEST, indent=2)
    )
    return tmp_path


@pytest.fixture
def custom_manifest(tmp_path):
    """Create a custom manifest at a non-default path."""
    manifest_path = tmp_path / "custom-manifest.json"
    manifest_path.write_text(json.dumps(SAMPLE_MANIFEST, indent=2))
    return manifest_path


# ---------------------------------------------------------------------------
# CLI Registration
# ---------------------------------------------------------------------------


class TestCliRegistration:
    """Test that pf release verify is properly registered."""

    def test_verify_command_in_release_group(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["--help"])
        assert result.exit_code == 0
        assert "verify" in result.output

    def test_verify_command_help(self):
        from click.testing import CliRunner
        from pf.release.cli import release

        runner = CliRunner()
        result = runner.invoke(release, ["verify", "--help"])
        assert result.exit_code == 0
        assert "--manifest" in result.output

    def test_verify_accessible_from_main_cli(self):
        from click.testing import CliRunner
        from pf.cli import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["release", "verify", "--help"])
        assert result.exit_code == 0


# ---------------------------------------------------------------------------
# Core Logic — Happy Path (all files present)
# ---------------------------------------------------------------------------


class TestVerifyHappyPath:
    """Test successful verification when all expected files are present."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_returns_success(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is True

    @patch("pf.release.verify_contents.subprocess.run")
    def test_returns_steps(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        assert "steps" in result
        assert len(result["steps"]) >= 1

    @patch("pf.release.verify_contents.subprocess.run")
    def test_returns_data_with_file_count(self, mock_run, project_root):
        files = _all_good_files()
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert "data" in result
        assert result["data"]["total_files"] == len(files)

    @patch("pf.release.verify_contents.subprocess.run")
    def test_all_steps_pass(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        for step in result["steps"]:
            assert step["success"] is True, f"Step failed: {step}"


# ---------------------------------------------------------------------------
# Missing Root Files
# ---------------------------------------------------------------------------


class TestMissingRootFiles:
    """Test detection of missing required root files."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_readme_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "README.md"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        # Must have steps with specific diagnostics (not just a generic error)
        assert "steps" in result
        root_step = next(
            s for s in result["steps"] if s["action"] == "root_files"
        )
        assert root_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_license_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "LICENSE"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        root_step = next(
            s for s in result["steps"] if s["action"] == "root_files"
        )
        assert root_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_which_files_missing(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "README.md"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        root_step = next(
            s for s in result["steps"] if s["action"] == "root_files"
        )
        assert root_step["success"] is False
        assert "README.md" in root_step["detail"]


# ---------------------------------------------------------------------------
# Missing Top-Level Directories
# ---------------------------------------------------------------------------


class TestMissingTopLevelDirs:
    """Test detection of missing required top-level directories."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_packages_dir_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if not f.startswith("packages/")]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        dir_step = next(
            s for s in result["steps"] if s["action"] == "top_level_dirs"
        )
        assert dir_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_pennyfarthing_dist_dir_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if not f.startswith("pennyfarthing-dist/")]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        dir_step = next(
            s for s in result["steps"] if s["action"] == "top_level_dirs"
        )
        assert dir_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_which_dirs_missing(self, mock_run, project_root):
        files = [f for f in _all_good_files() if not f.startswith("packages/")]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        dir_step = next(
            s for s in result["steps"] if s["action"] == "top_level_dirs"
        )
        assert dir_step["success"] is False
        assert "packages" in dir_step["detail"]


# ---------------------------------------------------------------------------
# Unexpected Top-Level Entries
# ---------------------------------------------------------------------------


class TestUnexpectedEntries:
    """Test detection of unexpected top-level entries in tarball."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_unexpected_entry_detected(self, mock_run, project_root):
        files = _all_good_files() + ["node_modules/.pnpm/something"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        unexpected_step = next(
            s for s in result["steps"] if s["action"] == "unexpected_entries"
        )
        assert unexpected_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_unexpected_entries(self, mock_run, project_root):
        files = _all_good_files() + ["build/output.js", ".env"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        unexpected_step = next(
            s for s in result["steps"] if s["action"] == "unexpected_entries"
        )
        assert unexpected_step["success"] is False


# ---------------------------------------------------------------------------
# Missing Critical Files
# ---------------------------------------------------------------------------


class TestMissingCriticalFiles:
    """Test detection of missing critical files."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_core_index_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "packages/core/dist/index.js"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        critical_step = next(
            s for s in result["steps"] if s["action"] == "critical_files"
        )
        assert critical_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_pyproject_toml_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "pennyfarthing-dist/pyproject.toml"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        critical_step = next(
            s for s in result["steps"] if s["action"] == "critical_files"
        )
        assert critical_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_which_critical_files_missing(self, mock_run, project_root):
        files = [f for f in _all_good_files() if f != "packages/core/dist/index.js"]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        critical_step = next(
            s for s in result["steps"] if s["action"] == "critical_files"
        )
        assert critical_step["success"] is False
        assert "packages/core/dist/index.js" in critical_step["detail"]


# ---------------------------------------------------------------------------
# Missing pennyfarthing-dist Subdirectories
# ---------------------------------------------------------------------------


class TestMissingDistSubdirs:
    """Test detection of missing pennyfarthing-dist subdirectories."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_agents_subdir_fails(self, mock_run, project_root):
        files = [f for f in _all_good_files() if "agents/" not in f]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        subdir_step = next(
            s for s in result["steps"] if s["action"] == "dist_subdirs"
        )
        assert subdir_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_which_subdirs_missing(self, mock_run, project_root):
        files = [f for f in _all_good_files() if "agents/" not in f]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        subdir_step = next(
            s for s in result["steps"] if s["action"] == "dist_subdirs"
        )
        assert subdir_step["success"] is False
        assert "agents" in subdir_step["detail"]


# ---------------------------------------------------------------------------
# Missing Required Scripts
# ---------------------------------------------------------------------------


class TestMissingScripts:
    """Test detection of missing required scripts."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_missing_find_root_fails(self, mock_run, project_root):
        files = [
            f for f in _all_good_files()
            if f != "pennyfarthing-dist/scripts/lib/find-root.sh"
        ]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "steps" in result
        script_step = next(
            s for s in result["steps"] if s["action"] == "required_scripts"
        )
        assert script_step["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_reports_which_scripts_missing(self, mock_run, project_root):
        files = [
            f for f in _all_good_files()
            if f != "pennyfarthing-dist/scripts/lib/find-root.sh"
        ]
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(files),
            stderr="",
        )
        result = verify_contents(project_root)
        script_step = next(
            s for s in result["steps"] if s["action"] == "required_scripts"
        )
        assert script_step["success"] is False
        assert "find-root.sh" in script_step["detail"]


# ---------------------------------------------------------------------------
# Custom Manifest Path
# ---------------------------------------------------------------------------


class TestCustomManifest:
    """Test using a custom manifest path."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_accepts_custom_manifest(self, mock_run, project_root, custom_manifest):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root, manifest_path=custom_manifest)
        assert result["success"] is True


# ---------------------------------------------------------------------------
# Error Handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Test error cases."""

    def test_missing_manifest_fails(self, tmp_path):
        (tmp_path / "package.json").write_text('{"name":"x","version":"1.0.0"}')
        result = verify_contents(tmp_path)
        assert result["success"] is False
        assert "manifest" in result["error"].lower()

    @patch("pf.release.verify_contents.subprocess.run")
    def test_npm_pack_failure(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="npm ERR! Invalid package",
        )
        result = verify_contents(project_root)
        assert result["success"] is False
        assert "pack" in result["error"].lower() or "npm" in result["error"].lower()

    @patch("pf.release.verify_contents.subprocess.run")
    def test_empty_pack_output(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False

    @patch("pf.release.verify_contents.subprocess.run")
    def test_malformed_pack_json(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="not json at all",
            stderr="",
        )
        result = verify_contents(project_root)
        assert result["success"] is False


# ---------------------------------------------------------------------------
# Result Object Format (ADR-0008)
# ---------------------------------------------------------------------------


class TestResultFormat:
    """Verify result object follows ADR-0008 pattern."""

    @patch("pf.release.verify_contents.subprocess.run")
    def test_has_success_field(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        assert "success" in result
        assert isinstance(result["success"], bool)

    @patch("pf.release.verify_contents.subprocess.run")
    def test_has_data_field(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        assert "data" in result

    @patch("pf.release.verify_contents.subprocess.run")
    def test_has_steps_field(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        assert "steps" in result
        assert isinstance(result["steps"], list)

    @patch("pf.release.verify_contents.subprocess.run")
    def test_each_step_has_required_fields(self, mock_run, project_root):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=_make_pack_output(_all_good_files()),
            stderr="",
        )
        result = verify_contents(project_root)
        for step in result["steps"]:
            assert "action" in step, f"Step missing 'action': {step}"
            assert "detail" in step, f"Step missing 'detail': {step}"
            assert "success" in step, f"Step missing 'success': {step}"

    def test_error_result_has_error_field(self, tmp_path):
        (tmp_path / "package.json").write_text('{"name":"x","version":"1.0.0"}')
        result = verify_contents(tmp_path)
        assert "error" in result
        assert isinstance(result["error"], str)


# ---------------------------------------------------------------------------
# CLI Integration
# ---------------------------------------------------------------------------


class TestVerifyCliIntegration:
    """Test CLI invocation end-to-end."""

    @patch("pf.release.verify_contents.verify_contents")
    def test_cli_success_output(self, mock_verify):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_verify.return_value = {
            "success": True,
            "data": {"total_files": 42, "passed": 6, "failed": 0},
            "steps": [
                {"action": "root_files", "detail": "All present", "success": True},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["verify"])
        assert result.exit_code == 0

    @patch("pf.release.verify_contents.verify_contents")
    def test_cli_failure_output(self, mock_verify):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_verify.return_value = {
            "success": False,
            "error": "2 verification checks failed",
            "data": {"total_files": 40, "passed": 4, "failed": 2},
            "steps": [
                {"action": "root_files", "detail": "Missing: README.md", "success": False},
            ],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["verify"])
        assert result.exit_code != 0

    @patch("pf.release.verify_contents.verify_contents")
    def test_cli_manifest_flag(self, mock_verify):
        from click.testing import CliRunner
        from pf.release.cli import release

        mock_verify.return_value = {
            "success": True,
            "data": {"total_files": 42, "passed": 6, "failed": 0},
            "steps": [],
        }
        runner = CliRunner()
        result = runner.invoke(release, ["verify", "--manifest=/tmp/custom.json"])
        assert result.exit_code == 0
        mock_verify.assert_called_once()
        call_kwargs = mock_verify.call_args
        assert "/tmp/custom.json" in str(call_kwargs)
