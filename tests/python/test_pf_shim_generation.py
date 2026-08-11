"""
Tests for pf shim generation and hook command rewriting — story 136-1.

Validates that `pf init` generates the .pennyfarthing/bin/pf shim and
rewrites hook commands to use the shim path instead of bare `pf`.

Run with: python -m pytest tests/python/test_pf_shim_generation.py -v
"""

import json
import os
import stat
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "pennyfarthing-dist" / "src"))

from pf.common.discovery import generate_shim_content, write_shim  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def project_dir(tmp_path):
    """Create a project directory with .pennyfarthing/ structure."""
    project = tmp_path / "project"
    project.mkdir()
    (project / ".pennyfarthing").mkdir()
    (project / ".claude").mkdir()
    return project


@pytest.fixture()
def pip_discovery_result():
    """Discovery result for pip install."""
    return {
        "success": True,
        "data": {
            "path": "/home/user/.local/bin/pf",
            "install_method": "pip",
        },
    }


@pytest.fixture()
def pipx_discovery_result():
    """Discovery result for pipx install."""
    return {
        "success": True,
        "data": {
            "path": "/home/user/.local/bin/pf",
            "install_method": "pipx",
        },
    }


@pytest.fixture()
def uv_discovery_result():
    """Discovery result for uv tool install."""
    return {
        "success": True,
        "data": {
            "path": "/home/user/.local/share/uv/tools/pennyfarthing-scripts/bin/pf",
            "install_method": "uv",
        },
    }


@pytest.fixture()
def monorepo_discovery_result():
    """Discovery result for monorepo dev layout."""
    return {
        "success": True,
        "data": {
            "path": "/projects/myrepo/pennyfarthing-dist/src/pf_launcher.py",
            "install_method": "monorepo",
        },
    }


# =============================================================================
# AC7 / AC8: Shim content generation
# =============================================================================


class TestShimContentGeneration:
    """generate_shim_content() produces correct shim scripts."""

    def test_installed_shim_uses_absolute_path(self, pip_discovery_result):
        """Installed (pip/pipx/uv) shim execs the absolute binary path."""
        content = generate_shim_content(pip_discovery_result)

        assert content.startswith("#!/usr/bin/env bash\n")
        assert 'exec "/home/user/.local/bin/pf" "$@"' in content

    def test_pipx_shim_uses_absolute_path(self, pipx_discovery_result):
        """pipx shim execs the absolute binary path."""
        content = generate_shim_content(pipx_discovery_result)

        assert 'exec "/home/user/.local/bin/pf" "$@"' in content

    def test_uv_shim_uses_absolute_path(self, uv_discovery_result):
        """uv shim execs the absolute binary path."""
        content = generate_shim_content(uv_discovery_result)

        assert 'exec "/home/user/.local/share/uv/tools/pennyfarthing-scripts/bin/pf" "$@"' in content

    def test_monorepo_shim_uses_python3_and_launcher(self, monorepo_discovery_result):
        """Monorepo shim uses system python3 + pf_launcher.py."""
        content = generate_shim_content(
            monorepo_discovery_result,
            project_root="/projects/myrepo",
        )

        assert content.startswith("#!/usr/bin/env bash\n")
        assert "python3" in content
        assert "pf_launcher.py" in content
        assert '"$@"' in content

    def test_shim_ends_with_newline(self, pip_discovery_result):
        """Shim content ends with a newline."""
        content = generate_shim_content(pip_discovery_result)
        assert content.endswith("\n")

    def test_shim_has_exec(self, pip_discovery_result):
        """Shim uses exec to replace the shell process."""
        content = generate_shim_content(pip_discovery_result)
        assert "exec " in content


# =============================================================================
# AC7: write_shim creates executable file
# =============================================================================


class TestShimWriting:
    """write_shim() creates .pennyfarthing/bin/pf correctly."""

    def test_creates_shim_file(self, project_dir, pip_discovery_result):
        """Shim file is created at .pennyfarthing/bin/pf."""
        result = write_shim(str(project_dir), pip_discovery_result)

        assert result["success"] is True
        shim_path = project_dir / ".pennyfarthing" / "bin" / "pf"
        assert shim_path.exists()

    def test_shim_is_executable(self, project_dir, pip_discovery_result):
        """Shim has executable permissions."""
        write_shim(str(project_dir), pip_discovery_result)

        shim_path = project_dir / ".pennyfarthing" / "bin" / "pf"
        mode = shim_path.stat().st_mode
        assert mode & stat.S_IXUSR  # Owner execute
        assert mode & stat.S_IXGRP  # Group execute
        assert mode & stat.S_IXOTH  # Other execute

    def test_creates_bin_directory(self, project_dir, pip_discovery_result):
        """Creates .pennyfarthing/bin/ if it doesn't exist."""
        result = write_shim(str(project_dir), pip_discovery_result)

        assert result["success"] is True
        assert (project_dir / ".pennyfarthing" / "bin").is_dir()

    def test_overwrites_existing_shim(self, project_dir, pip_discovery_result, uv_discovery_result):
        """Re-running write_shim overwrites the previous shim."""
        write_shim(str(project_dir), pip_discovery_result)
        write_shim(str(project_dir), uv_discovery_result)

        shim_path = project_dir / ".pennyfarthing" / "bin" / "pf"
        content = shim_path.read_text()
        # Should have uv path, not pip path
        assert "uv/tools" in content

    def test_returns_shim_path_in_result(self, project_dir, pip_discovery_result):
        """Result data includes the shim path."""
        result = write_shim(str(project_dir), pip_discovery_result)

        assert result["success"] is True
        assert "shim_path" in result["data"]
        assert ".pennyfarthing/bin/pf" in result["data"]["shim_path"]

    def test_fails_without_pennyfarthing_dir(self, tmp_path, pip_discovery_result):
        """Fails gracefully when .pennyfarthing/ doesn't exist."""
        bare_dir = tmp_path / "bare"
        bare_dir.mkdir()

        result = write_shim(str(bare_dir), pip_discovery_result)

        # Should create the directory or return an error
        shim_path = bare_dir / ".pennyfarthing" / "bin" / "pf"
        if result["success"]:
            assert shim_path.exists()
        else:
            assert "error" in result


# =============================================================================
# AC7: Hook commands reference the shim
# =============================================================================


class TestHookCommandRewriting:
    """Hook commands use .pennyfarthing/bin/pf instead of bare pf."""

    def test_infrastructure_hooks_use_shim_path(self):
        """INFRASTRUCTURE_HOOKS commands reference the shim, not bare pf."""
        # After the implementation, importing hooks should use discovered paths
        # For now, we test the hook generation function
        from pf.common.hooks import INFRASTRUCTURE_HOOKS

        for hook_type, entries in INFRASTRUCTURE_HOOKS.items():
            for entry in entries:
                for hook in entry.get("hooks", []):
                    cmd = hook.get("command", "")
                    if "pf hooks" in cmd:
                        # After implementation: should use .pennyfarthing/bin/pf
                        # or the shim path, NOT bare "pf hooks"
                        assert not cmd.startswith("pf hooks"), (
                            f"Hook {hook_type} still uses bare 'pf hooks': {cmd}. "
                            f"Should use .pennyfarthing/bin/pf or absolute path."
                        )


# =============================================================================
# AC11: Backward compatibility with existing settings.local.json
# =============================================================================


class TestBackwardCompatibility:
    """AC11: Upgrading bare pf commands to shim-based commands."""

    def test_upgrade_bare_pf_to_shim(self, project_dir):
        """Bare 'pf hooks X' commands are upgraded to shim path."""
        settings_path = project_dir / ".claude" / "settings.local.json"
        settings = {
            "hooks": {
                "SessionStart": [
                    {"hooks": [{"type": "command", "command": "pf hooks session-start"}]}
                ],
                "Stop": [
                    {"hooks": [{"type": "command", "command": "pf hooks session-stop"}]}
                ],
            }
        }
        settings_path.write_text(json.dumps(settings))

        from pf.init.core import _upgrade_hooks
        _upgrade_hooks(settings_path)

        data = json.loads(settings_path.read_text())
        for _hook_type, entries in data["hooks"].items():
            for entry in entries:
                for hook in entry.get("hooks", []):
                    cmd = hook.get("command", "")
                    if "hooks session-start" in cmd or "hooks session-stop" in cmd:
                        assert not cmd.startswith("pf hooks"), (
                            f"Hook not upgraded: {cmd}"
                        )

    def test_preserves_custom_hooks(self, project_dir):
        """User-added hooks that don't match pf pattern are preserved."""
        settings_path = project_dir / ".claude" / "settings.local.json"
        custom_cmd = "my-custom-script.sh --check"
        settings = {
            "hooks": {
                "PreToolUse": [
                    {"hooks": [{"type": "command", "command": "pf hooks pre-edit-check"}]},
                    {"hooks": [{"type": "command", "command": custom_cmd}]},
                ]
            }
        }
        settings_path.write_text(json.dumps(settings))

        from pf.init.core import _upgrade_hooks
        _upgrade_hooks(settings_path)

        data = json.loads(settings_path.read_text())
        # Custom hook should be preserved
        commands = [
            h["command"]
            for entry in data["hooks"]["PreToolUse"]
            for h in entry.get("hooks", [])
        ]
        assert custom_cmd in commands

    def test_handles_mixed_state(self, project_dir):
        """Handles mix of bare pf and already-upgraded commands."""
        settings_path = project_dir / ".claude" / "settings.local.json"
        settings = {
            "hooks": {
                "SessionStart": [
                    {"hooks": [{"type": "command", "command": "pf hooks session-start"}]},
                ],
                "Stop": [
                    {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks session-stop"}]},
                ],
            }
        }
        settings_path.write_text(json.dumps(settings))

        from pf.init.core import _upgrade_hooks
        _upgrade_hooks(settings_path)

        data = json.loads(settings_path.read_text())

        # 162-30: this used to look for a surviving `session-stop` command. That
        # is no longer how the upgrade works — `_upgrade_hooks` consolidates every
        # per-hook entry into ONE `pf hooks dispatch <Event>` entry per event
        # (same dispatcher migration that `test_stale_hooks_detection` covers), so
        # `session-start` / `session-stop` commands are replaced, not preserved.
        # The invariant the test name promises — "not double-upgraded" — is
        # asserted directly below, for both the bare and the already-prefixed leg.
        for event in ("SessionStart", "Stop"):
            cmds = [
                h["command"]
                for entry in data["hooks"][event]
                for h in entry.get("hooks", [])
            ]
            dispatchers = [c for c in cmds if f"hooks dispatch {event}" in c]
            assert len(dispatchers) == 1, (
                f"{event} should hold exactly one dispatcher entry, got {cmds}"
            )
            leftovers = [c for c in cmds if "hooks session-" in c]
            assert leftovers == [], (
                f"{event} still carries old-style per-hook commands: {leftovers}"
            )

    def test_upgrades_statusline(self, project_dir):
        """statusLine command is also upgraded from bare pf."""
        settings_path = project_dir / ".claude" / "settings.local.json"
        settings = {
            "hooks": {},
            "statusLine": {
                "type": "command",
                "command": "pf hooks statusline",
            },
        }
        settings_path.write_text(json.dumps(settings))

        from pf.init.core import _upgrade_hooks
        _upgrade_hooks(settings_path)

        data = json.loads(settings_path.read_text())
        status_cmd = data["statusLine"]["command"]
        assert not status_cmd.startswith("pf hooks"), (
            f"statusLine not upgraded: {status_cmd}"
        )


# =============================================================================
# Integration: Shim works in stripped environment
# =============================================================================


class TestShimIntegration:
    """Verify the shim actually works in a Claude-like stripped env."""

    def test_shim_executable_in_stripped_env(self, project_dir, pip_discovery_result):
        """Shim runs successfully in env -i (no PATH, no shell init)."""
        import subprocess

        # Create a real executable that the shim can call
        real_pf = project_dir / "real_pf"
        real_pf.write_text("#!/bin/bash\necho 'pf, version test'\nexit 0\n")
        real_pf.chmod(real_pf.stat().st_mode | stat.S_IEXEC)

        # Update discovery result to point to our real executable
        discovery = {
            "success": True,
            "data": {"path": str(real_pf), "install_method": "pip"},
        }
        write_shim(str(project_dir), discovery)

        shim_path = project_dir / ".pennyfarthing" / "bin" / "pf"

        # Run in stripped environment (like Claude Code hooks)
        result = subprocess.run(
            [str(shim_path), "--version"],
            capture_output=True,
            text=True,
            env={"HOME": os.environ["HOME"], "PATH": "/usr/bin:/bin"},
            cwd=str(project_dir),
        )

        assert result.returncode == 0
        assert "pf, version test" in result.stdout
