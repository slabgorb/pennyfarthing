"""Tests for PEP 517 packaging and PyPI distribution.

Story 126-1: Publish pf package to private PyPI with CI pipeline.

These tests verify:
1. src/ layout produces valid package structure
2. pyproject.toml is configured for src-layout with dynamic version
3. MANIFEST.in excludes non-package artifacts
4. Built wheel contains all required subpackages
5. Built wheel excludes agent definitions, templates, guides
6. Entry point resolves correctly after install
7. Version is aligned with Pennyfarthing framework version
"""

import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

# pennyfarthing-dist/ root (where pyproject.toml lives)
# src/pf/tests -> src/pf -> src -> pennyfarthing-dist
DIST_DIR = Path(__file__).resolve().parents[3]
SRC_DIR = DIST_DIR / "src"
PF_PKG = SRC_DIR / "pf"

# All subpackages that must be present in the wheel
REQUIRED_SUBPACKAGES = [
    "bc",
    "bikerack",
    "bmad",
    "brownfield",
    "codemarkers",
    "common",
    "complexity",
    "consultation",
    "core",
    "deadcode",
    "dependencies",
    "epic",
    "gate",
    "git",
    "git_group",
    "handoff",
    "healthscore",
    "hooks",
    "hotspots",
    "jira",
    "launch",
    "migration",
    "package",
    "preflight",
    "prime",
    "release",
    "session",
    "settings",
    "sprint",
    "story",
    "theme",
    "validate",
    "workflow",
]

# Directories that must NOT appear in the wheel
EXCLUDED_DIRS = [
    "agents/",
    "templates/",
    "guides/",
    "personas/",
    "workflows/",
    "scripts/",
    "skills/",
    "commands/",
    "output-styles/",
]


class TestSrcLayout:
    """Verify src/ layout structure after migration."""

    def test_src_directory_exists(self) -> None:
        """src/ directory must exist at pennyfarthing-dist/ root."""
        assert SRC_DIR.is_dir(), f"src/ directory not found at {SRC_DIR}"

    def test_pf_package_in_src(self) -> None:
        """pf/ package must live inside src/."""
        assert PF_PKG.is_dir(), f"pf/ package not found at {PF_PKG}"

    def test_pf_init_exists(self) -> None:
        """src/pf/__init__.py must exist."""
        assert (PF_PKG / "__init__.py").is_file()

    def test_pf_cli_exists(self) -> None:
        """src/pf/cli.py must exist (entry point target)."""
        assert (PF_PKG / "cli.py").is_file()

    @pytest.mark.parametrize("subpackage", REQUIRED_SUBPACKAGES)
    def test_subpackage_exists(self, subpackage: str) -> None:
        """Each subpackage must exist in src/pf/ with __init__.py."""
        pkg_dir = PF_PKG / subpackage
        assert pkg_dir.is_dir(), f"Subpackage {subpackage} not found at {pkg_dir}"
        assert (pkg_dir / "__init__.py").is_file(), f"Missing __init__.py in {subpackage}"

    def test_no_pf_at_old_location(self) -> None:
        """pf/ should NOT exist at pennyfarthing-dist/pf/ (old flat layout)."""
        old_pf = DIST_DIR / "pf"
        assert not old_pf.is_dir(), (
            f"Old pf/ location still exists at {old_pf}. "
            "Migration to src/ layout is incomplete."
        )


class TestPyprojectToml:
    """Verify pyproject.toml is configured for src-layout publishing."""

    @pytest.fixture()
    def pyproject(self) -> dict:
        """Load and parse pyproject.toml."""
        import tomllib

        with open(DIST_DIR / "pyproject.toml", "rb") as f:
            return tomllib.load(f)

    def test_pyproject_exists(self) -> None:
        """pyproject.toml must exist."""
        assert (DIST_DIR / "pyproject.toml").is_file()

    def test_build_backend(self, pyproject: dict) -> None:
        """Build system must use setuptools.build_meta."""
        assert pyproject["build-system"]["build-backend"] == "setuptools.build_meta"

    def test_src_layout_configured(self, pyproject: dict) -> None:
        """Package discovery must point to src/ directory."""
        find = (
            pyproject.get("tool", {})
            .get("setuptools", {})
            .get("packages", {})
            .get("find", {})
        )
        assert find.get("where") == ["src"], (
            "pyproject.toml must set [tool.setuptools.packages.find] where = ['src']"
        )

    def test_dynamic_version(self, pyproject: dict) -> None:
        """Version must be dynamic (read from pf/__init__.py)."""
        project = pyproject.get("project", {})
        dynamic = project.get("dynamic", [])
        assert "version" in dynamic, "version must be in [project.dynamic]"
        assert "version" not in project, (
            "Static version in [project] conflicts with dynamic declaration"
        )

    def test_version_attr_configured(self, pyproject: dict) -> None:
        """setuptools must know where to find the version attribute."""
        version_cfg = (
            pyproject.get("tool", {})
            .get("setuptools", {})
            .get("dynamic", {})
            .get("version", {})
        )
        attr = version_cfg.get("attr", "")
        assert attr == "pf.__version__", (
            f"Expected version attr 'pf.__version__', got '{attr}'"
        )

    def test_entry_point(self, pyproject: dict) -> None:
        """pf entry point must map to pf.cli:main."""
        scripts = pyproject.get("project", {}).get("scripts", {})
        assert scripts.get("pf") == "pf.cli:main"

    def test_package_name(self, pyproject: dict) -> None:
        """Package name must be pennyfarthing-scripts."""
        assert pyproject["project"]["name"] == "pennyfarthing-scripts"

    def test_python_requires(self, pyproject: dict) -> None:
        """Must require Python 3.11+."""
        requires = pyproject["project"].get("requires-python", "")
        assert "3.11" in requires


class TestVersionAlignment:
    """Verify pf version is aligned with framework version."""

    def test_version_matches_framework(self) -> None:
        """pf __version__ must match package.json version."""
        framework_pkg = DIST_DIR.parent / "package.json"
        assert framework_pkg.exists(), "Framework package.json not found"

        with open(framework_pkg) as f:
            framework_version = json.load(f)["version"]

        # Read version directly from source file to avoid import path issues
        init_file = PF_PKG / "__init__.py"
        assert init_file.exists(), "pf/__init__.py not found in src/"
        content = init_file.read_text()
        # Extract __version__ = "X.Y.Z" from source
        for line in content.splitlines():
            if line.startswith("__version__"):
                pf_version = line.split("=")[1].strip().strip('"').strip("'")
                break
        else:
            pytest.fail("__version__ not found in pf/__init__.py")

        assert pf_version == framework_version, (
            f"pf version '{pf_version}' != framework version '{framework_version}'"
        )


class TestManifest:
    """Verify MANIFEST.in exists with correct exclusion rules."""

    def test_manifest_exists(self) -> None:
        """MANIFEST.in must exist at pennyfarthing-dist/ root."""
        assert (DIST_DIR / "MANIFEST.in").is_file()

    def test_manifest_excludes_non_package_dirs(self) -> None:
        """MANIFEST.in must prune non-package directories."""
        content = (DIST_DIR / "MANIFEST.in").read_text().lower()
        for dirname in ["agents", "templates", "guides", "personas", "workflows"]:
            assert dirname in content, (
                f"MANIFEST.in should reference '{dirname}' for exclusion"
            )


class TestWheelBuild:
    """Verify the package builds into a correct wheel."""

    @pytest.fixture()
    def built_wheel(self, tmp_path: Path) -> Path:
        """Build wheel and return path to .whl file."""
        result = subprocess.run(
            [sys.executable, "-m", "build", "--wheel", "--outdir", str(tmp_path)],
            capture_output=True,
            text=True,
            cwd=str(DIST_DIR),
            timeout=120,
        )
        assert result.returncode == 0, f"Build failed:\n{result.stderr}"
        wheels = list(tmp_path.glob("*.whl"))
        assert len(wheels) == 1, f"Expected 1 wheel, found {len(wheels)}"
        return wheels[0]

    @pytest.mark.slow
    def test_build_succeeds(self, built_wheel: Path) -> None:
        """python -m build --wheel must succeed."""
        assert built_wheel.exists()
        assert built_wheel.suffix == ".whl"

    @pytest.mark.slow
    def test_wheel_contains_all_subpackages(self, built_wheel: Path) -> None:
        """Wheel must include all pf subpackages."""
        with zipfile.ZipFile(built_wheel) as zf:
            names = zf.namelist()
            for subpkg in REQUIRED_SUBPACKAGES:
                matching = [n for n in names if n.startswith(f"pf/{subpkg}/")]
                assert matching, f"Wheel missing subpackage pf/{subpkg}/"

    @pytest.mark.slow
    def test_wheel_contains_entry_point_module(self, built_wheel: Path) -> None:
        """Wheel must contain pf/cli.py (entry point target)."""
        with zipfile.ZipFile(built_wheel) as zf:
            names = zf.namelist()
            assert any("pf/cli.py" in n for n in names), "Wheel missing pf/cli.py"

    @pytest.mark.slow
    def test_wheel_excludes_non_package_dirs(self, built_wheel: Path) -> None:
        """Wheel must NOT contain agents, templates, guides, etc."""
        with zipfile.ZipFile(built_wheel) as zf:
            names = zf.namelist()
            for name in names:
                for excluded in EXCLUDED_DIRS:
                    assert excluded not in name, (
                        f"Wheel should not contain '{excluded}': found {name}"
                    )


class TestSmokeInstall:
    """Verify the package installs and runs correctly."""

    @pytest.mark.slow
    def test_pf_version_from_installed_wheel(self, tmp_path: Path) -> None:
        """Install wheel into venv, verify pf --version works."""
        # Build wheel
        wheel_dir = tmp_path / "wheels"
        wheel_dir.mkdir()
        build_result = subprocess.run(
            [sys.executable, "-m", "build", "--wheel", "--outdir", str(wheel_dir)],
            capture_output=True,
            text=True,
            cwd=str(DIST_DIR),
            timeout=120,
        )
        assert build_result.returncode == 0, f"Build failed:\n{build_result.stderr}"
        wheel = next(wheel_dir.glob("*.whl"))

        # Create venv
        venv_dir = tmp_path / "venv"
        subprocess.run(
            [sys.executable, "-m", "venv", str(venv_dir)],
            check=True,
            timeout=30,
        )

        # Install wheel
        pip_bin = venv_dir / "bin" / "pip"
        install_result = subprocess.run(
            [str(pip_bin), "install", str(wheel)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert install_result.returncode == 0, (
            f"pip install failed:\n{install_result.stderr}"
        )

        # Run pf --version
        pf_bin = venv_dir / "bin" / "pf"
        version_result = subprocess.run(
            [str(pf_bin), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert version_result.returncode == 0, (
            f"pf --version failed:\n{version_result.stderr}"
        )
        assert "pf" in version_result.stdout.lower()
