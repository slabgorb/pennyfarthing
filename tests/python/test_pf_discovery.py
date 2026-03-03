"""
Tests for pf binary discovery — story 136-1.

Validates resolve_pf_binary() across all install methods (pip, pipx, uv,
monorepo) and edge cases (missing, non-executable, env override).

Run with: python -m pytest tests/python/test_pf_discovery.py -v
"""

import os
import stat
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "pennyfarthing-dist" / "src"))

from pf.common.discovery import resolve_pf_binary  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def fake_home(tmp_path):
    """Create a fake HOME with standard install locations."""
    home = tmp_path / "fakehome"
    home.mkdir()
    (home / ".local" / "bin").mkdir(parents=True)
    (home / ".local" / "share" / "uv" / "tools").mkdir(parents=True)
    return home


@pytest.fixture()
def fake_pf_pip(fake_home):
    """Create a fake pf binary at ~/.local/bin/pf (pip user install)."""
    pf = fake_home / ".local" / "bin" / "pf"
    pf.write_text("#!/usr/bin/env python3\nprint('pf')\n")
    pf.chmod(pf.stat().st_mode | stat.S_IEXEC)
    return pf


@pytest.fixture()
def fake_pf_pipx(fake_home):
    """Create a fake pf as a pipx symlink at ~/.local/bin/pf."""
    # pipx creates the real binary inside its venv
    venv_dir = fake_home / ".local" / "pipx" / "venvs" / "pennyfarthing-scripts" / "bin"
    venv_dir.mkdir(parents=True)
    real_pf = venv_dir / "pf"
    real_pf.write_text("#!/usr/bin/env python3\nprint('pf')\n")
    real_pf.chmod(real_pf.stat().st_mode | stat.S_IEXEC)
    # Symlink from ~/.local/bin/pf -> venv binary
    pf_link = fake_home / ".local" / "bin" / "pf"
    pf_link.symlink_to(real_pf)
    return pf_link


@pytest.fixture()
def fake_pf_uv(fake_home):
    """Create a fake pf binary in uv tools dir."""
    uv_dir = fake_home / ".local" / "share" / "uv" / "tools" / "pennyfarthing-scripts" / "bin"
    uv_dir.mkdir(parents=True)
    pf = uv_dir / "pf"
    pf.write_text("#!/usr/bin/env python3\nprint('pf')\n")
    pf.chmod(pf.stat().st_mode | stat.S_IEXEC)
    return pf


@pytest.fixture()
def monorepo_project(tmp_path):
    """Create a fake monorepo layout with pf_launcher.py."""
    project = tmp_path / "myproject"
    project.mkdir()
    dist_src = project / "pennyfarthing-dist" / "src"
    dist_src.mkdir(parents=True)
    # pf_launcher.py at dist root
    dist_src.parent / "src" / "pf_launcher.py"
    # Actually put it where it should be
    launcher_file = project / "pennyfarthing-dist" / "src" / "pf_launcher.py"
    launcher_file.write_text("# launcher stub\n")
    # pf/cli.py must exist for detection
    pf_dir = dist_src / "pf"
    pf_dir.mkdir()
    (pf_dir / "cli.py").write_text("# cli stub\n")
    return project


@pytest.fixture()
def orchestrator_project(tmp_path):
    """Create a fake orchestrator layout (pennyfarthing/ subdir)."""
    project = tmp_path / "orchestrator"
    project.mkdir()
    (project / ".pennyfarthing").mkdir()
    dist_src = project / "pennyfarthing" / "pennyfarthing-dist" / "src"
    dist_src.mkdir(parents=True)
    launcher = project / "pennyfarthing" / "pennyfarthing-dist" / "src" / "pf_launcher.py"
    launcher.write_text("# launcher stub\n")
    pf_dir = dist_src / "pf"
    pf_dir.mkdir()
    (pf_dir / "cli.py").write_text("# cli stub\n")
    return project


# =============================================================================
# AC1: Discovery resolves pf for pip user install
# =============================================================================


class TestDiscoveryPipInstall:
    """AC1: ~/.local/bin/pf exists as a direct binary (not symlink)."""

    def test_finds_pip_binary(self, fake_home, fake_pf_pip):
        """Resolves pf at ~/.local/bin/pf with install_method=pip."""
        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            # Remove PF_BINARY if set
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["path"] == str(fake_pf_pip)
        assert result["data"]["install_method"] in ("pip", "pipx")

    def test_skips_nonexistent_local_bin(self, fake_home):
        """Falls through when ~/.local/bin/pf doesn't exist."""
        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            # No pf binary created — should fall through
            result = resolve_pf_binary()

        # Should fail (no pf anywhere) or find via which() fallback
        # Either way, should NOT return pip as install_method
        if result["success"]:
            assert result["data"]["install_method"] != "pip"

    def test_skips_non_executable(self, fake_home):
        """Falls through when ~/.local/bin/pf exists but is not executable."""
        pf = fake_home / ".local" / "bin" / "pf"
        pf.write_text("#!/usr/bin/env python3\n")
        pf.chmod(stat.S_IRUSR | stat.S_IWUSR)  # rw- only, no execute

        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        # Should not return this non-executable as a valid result
        if result["success"]:
            assert result["data"]["path"] != str(pf)


# =============================================================================
# AC2: Discovery resolves pf for pipx install
# =============================================================================


class TestDiscoveryPipxInstall:
    """AC2: ~/.local/bin/pf is a symlink into a pipx venv."""

    def test_finds_pipx_symlink(self, fake_home, fake_pf_pipx):
        """Resolves pf via pipx symlink with install_method=pipx."""
        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["path"] == str(fake_pf_pipx)
        assert result["data"]["install_method"] == "pipx"

    def test_detects_stale_pipx_symlink(self, fake_home):
        """Detects stale symlink where target venv is deleted."""
        # Create symlink pointing to nonexistent target
        pf_link = fake_home / ".local" / "bin" / "pf"
        pf_link.symlink_to("/nonexistent/venv/bin/pf")

        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        # Should skip this broken symlink and fall through
        if result["success"]:
            assert result["data"]["path"] != str(pf_link)


# =============================================================================
# AC3: Discovery resolves pf for uv tool install
# =============================================================================


class TestDiscoveryUvInstall:
    """AC3: pf in ~/.local/share/uv/tools/*/bin/pf."""

    def test_finds_uv_binary(self, fake_home, fake_pf_uv):
        """Resolves pf in uv tools dir with install_method=uv."""
        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            # Remove ~/.local/bin/pf so we don't match pip/pipx first
            result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["path"] == str(fake_pf_uv)
        assert result["data"]["install_method"] == "uv"

    def test_matches_pennyfarthing_pf_package_name(self, fake_home):
        """Glob matches both pennyfarthing-pf and pennyfarthing-scripts dirs."""
        uv_dir = fake_home / ".local" / "share" / "uv" / "tools" / "pennyfarthing-pf" / "bin"
        uv_dir.mkdir(parents=True)
        pf = uv_dir / "pf"
        pf.write_text("#!/usr/bin/env python3\n")
        pf.chmod(pf.stat().st_mode | stat.S_IEXEC)

        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["install_method"] == "uv"

    def test_skips_when_uv_tools_dir_missing(self, fake_home):
        """Falls through when ~/.local/share/uv/tools/ doesn't exist."""
        # Remove the uv tools dir
        import shutil
        uv_dir = fake_home / ".local" / "share" / "uv" / "tools"
        if uv_dir.exists():
            shutil.rmtree(uv_dir)

        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        # Should not crash, should fall through
        if result["success"]:
            assert result["data"]["install_method"] != "uv"


# =============================================================================
# AC4: Discovery resolves pf in monorepo development layout
# =============================================================================


class TestDiscoveryMonorepo:
    """AC4: pf_launcher.py found via CWD walk-up."""

    def test_finds_monorepo_launcher(self, monorepo_project):
        """Resolves pf_launcher.py in framework repo layout."""
        with patch.dict(os.environ, {}, clear=False), \
             patch("os.getcwd", return_value=str(monorepo_project)):
            os.environ.pop("PF_BINARY", None)
            # Patch HOME to a dir with no pf installed
            with patch.dict(os.environ, {"HOME": str(monorepo_project / "nohome")}):
                (monorepo_project / "nohome").mkdir(exist_ok=True)
                result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["install_method"] == "monorepo"
        assert "pf_launcher.py" in result["data"]["path"]

    def test_finds_orchestrator_layout(self, orchestrator_project):
        """Resolves pf in orchestrator/pennyfarthing/ layout."""
        with patch.dict(os.environ, {}, clear=False), \
             patch("os.getcwd", return_value=str(orchestrator_project)):
            os.environ.pop("PF_BINARY", None)
            with patch.dict(os.environ, {"HOME": str(orchestrator_project / "nohome")}):
                (orchestrator_project / "nohome").mkdir(exist_ok=True)
                result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["install_method"] == "monorepo"


# =============================================================================
# AC5: PF_BINARY environment override
# =============================================================================


class TestDiscoveryEnvOverride:
    """AC5: PF_BINARY env var takes precedence over all probes."""

    def test_env_override_takes_precedence(self, tmp_path):
        """PF_BINARY is used directly when set to a valid file."""
        custom_pf = tmp_path / "custom" / "pf"
        custom_pf.parent.mkdir(parents=True)
        custom_pf.write_text("#!/usr/bin/env python3\n")
        custom_pf.chmod(custom_pf.stat().st_mode | stat.S_IEXEC)

        with patch.dict(os.environ, {"PF_BINARY": str(custom_pf)}):
            result = resolve_pf_binary()

        assert result["success"] is True
        assert result["data"]["path"] == str(custom_pf)
        assert result["data"]["install_method"] == "env_override"

    def test_env_override_nonexistent_file(self, tmp_path):
        """PF_BINARY pointing to nonexistent file returns error."""
        fake_path = str(tmp_path / "nonexistent" / "pf")

        with patch.dict(os.environ, {"PF_BINARY": fake_path}):
            result = resolve_pf_binary()

        assert result["success"] is False
        assert "PF_BINARY" in result["error"]
        assert fake_path in result["error"]

    def test_env_override_points_to_directory(self, tmp_path):
        """PF_BINARY pointing to a directory returns error."""
        dir_path = tmp_path / "somedir"
        dir_path.mkdir()

        with patch.dict(os.environ, {"PF_BINARY": str(dir_path)}):
            result = resolve_pf_binary()

        assert result["success"] is False
        assert "PF_BINARY" in result["error"]

    def test_env_override_skips_further_probing(self, fake_home, fake_pf_pip):
        """No further probing when PF_BINARY is set (even if pip binary exists)."""
        custom_pf = fake_home / "custom_pf"
        custom_pf.write_text("#!/usr/bin/env python3\n")
        custom_pf.chmod(custom_pf.stat().st_mode | stat.S_IEXEC)

        with patch.dict(os.environ, {
            "PF_BINARY": str(custom_pf),
            "HOME": str(fake_home),
        }):
            result = resolve_pf_binary()

        assert result["success"] is True
        # Should return the override, NOT the pip binary
        assert result["data"]["path"] == str(custom_pf)
        assert result["data"]["install_method"] == "env_override"


# =============================================================================
# AC6: Discovery failure with actionable error
# =============================================================================


class TestDiscoveryFailure:
    """AC6: Clear error when pf cannot be found anywhere."""

    def test_returns_error_with_install_hint(self, tmp_path):
        """Failure includes install_hint when pf is not found."""
        empty_home = tmp_path / "empty_home"
        empty_home.mkdir()

        with patch.dict(os.environ, {"HOME": str(empty_home)}, clear=False), \
             patch("shutil.which", return_value=None), \
             patch("os.getcwd", return_value=str(tmp_path)):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is False
        assert "install_hint" in result
        assert "pipx install" in result["install_hint"] or "pip install" in result["install_hint"]

    def test_error_includes_probed_locations(self, tmp_path):
        """Failure lists all locations that were probed."""
        empty_home = tmp_path / "empty_home"
        empty_home.mkdir()

        with patch.dict(os.environ, {"HOME": str(empty_home)}, clear=False), \
             patch("shutil.which", return_value=None), \
             patch("os.getcwd", return_value=str(tmp_path)):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is False
        assert "probed_locations" in result
        assert len(result["probed_locations"]) > 0


# =============================================================================
# AC9: pf_launcher exports PF_BINARY for child processes
# =============================================================================


class TestLauncherPfBinaryExport:
    """AC9: pf_launcher.py sets PF_BINARY in os.environ."""

    def test_launcher_sets_pf_binary_env(self):
        """After launcher runs, PF_BINARY is set in os.environ."""
        # We test this by importing and calling the modified launcher logic
        # The actual launcher wraps main() — we test the export side-effect

        # Save original PF_BINARY value
        original = os.environ.get("PF_BINARY")

        try:
            os.environ.pop("PF_BINARY", None)
            # launcher_main should set PF_BINARY before invoking CLI
            # We can't fully test this without running the CLI, so we check
            # that the module-level code in pf_launcher exports it
            # This test will fail until pf_launcher is modified to export PF_BINARY
            import importlib

            import pf_launcher
            importlib.reload(pf_launcher)

            # After import/reload, check if PF_BINARY was exported
            # The implementation should export this on import or in main()
            # For now, this is a placeholder that will fail
            assert "PF_BINARY" in os.environ or hasattr(pf_launcher, "_pf_binary_path")
        finally:
            if original:
                os.environ["PF_BINARY"] = original
            else:
                os.environ.pop("PF_BINARY", None)


# =============================================================================
# Priority / precedence tests
# =============================================================================


class TestDiscoveryPrecedence:
    """Verify the probe chain priority order."""

    def test_env_override_beats_pip(self, fake_home, fake_pf_pip):
        """PF_BINARY override wins over ~/.local/bin/pf."""
        custom_pf = fake_home / "override_pf"
        custom_pf.write_text("#!/usr/bin/env python3\n")
        custom_pf.chmod(custom_pf.stat().st_mode | stat.S_IEXEC)

        with patch.dict(os.environ, {
            "PF_BINARY": str(custom_pf),
            "HOME": str(fake_home),
        }):
            result = resolve_pf_binary()

        assert result["data"]["install_method"] == "env_override"

    def test_pip_beats_uv(self, fake_home, fake_pf_pip, fake_pf_uv):
        """~/.local/bin/pf (pip/pipx) is checked before uv tools dir."""
        with patch.dict(os.environ, {"HOME": str(fake_home)}, clear=False):
            os.environ.pop("PF_BINARY", None)
            result = resolve_pf_binary()

        assert result["success"] is True
        # pip/pipx should win over uv because it's checked first
        assert result["data"]["path"] == str(fake_pf_pip)
        assert result["data"]["install_method"] in ("pip", "pipx")
