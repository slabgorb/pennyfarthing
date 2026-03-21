"""Tests for wrapper chain removal (story 126-4, PROJ-15492).

Verifies that the uv/pf.sh wrapper chain has been fully removed:
1. run-pf.sh deleted
2. pf.sh wrapper deleted
3. All hook shims call pf directly (no wrapper sourcing)
4. No uv references in runtime scripts
5. All agent activation commands updated (no wrapper paths)
"""

import re
from pathlib import Path

# pennyfarthing-dist root (src/pf/tests -> src/pf -> src -> pennyfarthing-dist)
_DIST = Path(__file__).resolve().parents[3]
_SCRIPTS = _DIST / "scripts"
_AGENTS = _DIST / "agents"
_GUIDES = _DIST / "guides"

# Patterns that indicate wrapper chain usage
_WRAPPER_SOURCE_RE = re.compile(r"source.*run-pf\.sh")
_EXEC_PF_RE = re.compile(r"\bexec_pf\b")
_RUN_PF_FUNC_RE = re.compile(r"\brun_pf\b")
_UV_RUN_RE = re.compile(r"\buv\s+run\b")
_PF_SH_PATH_RE = re.compile(r"scripts/core/pf\.sh")


def _read_text(path: Path) -> str:
    """Read file as text, returning empty string if missing."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


# ---------------------------------------------------------------------------
# AC 1: run-pf.sh removed
# ---------------------------------------------------------------------------


class TestRunPfShRemoved:
    """AC 1: run-pf.sh must not exist."""

    def test_run_pf_sh_deleted(self) -> None:
        """scripts/lib/run-pf.sh should be deleted."""
        assert not (_SCRIPTS / "lib" / "run-pf.sh").exists(), (
            "run-pf.sh still exists — it should be deleted"
        )


# ---------------------------------------------------------------------------
# AC 2: pf.sh wrapper removed
# ---------------------------------------------------------------------------


class TestPfShWrapperRemoved:
    """AC 2: scripts/core/pf.sh wrapper must not exist."""

    def test_pf_sh_wrapper_deleted(self) -> None:
        """scripts/core/pf.sh should be deleted."""
        assert not (_SCRIPTS / "core" / "pf.sh").exists(), (
            "pf.sh wrapper still exists — it should be deleted"
        )


# ---------------------------------------------------------------------------
# AC 3: All hook commands reference bare pf (not wrapper)
# ---------------------------------------------------------------------------


class TestHookShimsClean:
    """AC 3: Hook shims must not source run-pf.sh or call exec_pf."""

    HOOK_DIR = _SCRIPTS / "hooks"

    HOOK_SHIMS = [
        "session-start.sh",
        "session-stop.sh",
        "sprint-yaml-validation.sh",
        "welcome-hook.sh",
        "bell-mode-hook.sh",
        "context-circuit-breaker.sh",
        "context-warning.sh",
        "pre-edit-check.sh",
        "question-reflector-check.sh",
        "pretooluse-forward-hook.sh",
        "schema-validation.sh",
    ]

    def test_hook_shims_no_run_pf_source(self) -> None:
        """No hook shim should source run-pf.sh."""
        violations = []
        for name in self.HOOK_SHIMS:
            content = _read_text(self.HOOK_DIR / name)
            if _WRAPPER_SOURCE_RE.search(content):
                violations.append(name)
        assert not violations, f"Hook shims still source run-pf.sh: {violations}"

    def test_hook_shims_no_exec_pf(self) -> None:
        """No hook shim should call exec_pf."""
        violations = []
        for name in self.HOOK_SHIMS:
            content = _read_text(self.HOOK_DIR / name)
            if _EXEC_PF_RE.search(content):
                violations.append(name)
        assert not violations, f"Hook shims still call exec_pf: {violations}"

    def test_hook_shims_no_uv_run(self) -> None:
        """No hook shim should reference uv run."""
        violations = []
        for name in self.HOOK_SHIMS:
            content = _read_text(self.HOOK_DIR / name)
            if _UV_RUN_RE.search(content):
                violations.append(name)
        assert not violations, f"Hook shims still reference uv run: {violations}"


# ---------------------------------------------------------------------------
# AC 4: No uv references remain in runtime code
# ---------------------------------------------------------------------------


class TestNoUvReferencesInRuntime:
    """AC 4: No uv run references in runtime shell scripts."""

    # Scripts that are currently wrappers delegating through run-pf.sh
    RUNTIME_SCRIPTS = [
        _SCRIPTS / "core" / "agent-session.sh",
        _SCRIPTS / "core" / "prime.sh",
        _SCRIPTS / "core" / "phase-check-start.sh",
        _SCRIPTS / "misc" / "statusline.sh",
        _SCRIPTS / "theme" / "list-themes.sh",
    ]

    def test_no_run_pf_source_in_scripts(self) -> None:
        """No runtime script should source run-pf.sh."""
        violations = []
        for path in self.RUNTIME_SCRIPTS:
            content = _read_text(path)
            if _WRAPPER_SOURCE_RE.search(content):
                violations.append(str(path.relative_to(_DIST)))
        assert not violations, f"Runtime scripts still source run-pf.sh: {violations}"

    def test_no_exec_pf_in_scripts(self) -> None:
        """No runtime script should call exec_pf."""
        violations = []
        for path in self.RUNTIME_SCRIPTS:
            content = _read_text(path)
            if _EXEC_PF_RE.search(content):
                violations.append(str(path.relative_to(_DIST)))
        assert not violations, f"Runtime scripts still call exec_pf: {violations}"

    def test_no_run_pf_func_in_scripts(self) -> None:
        """No runtime script should call run_pf function."""
        violations = []
        for path in self.RUNTIME_SCRIPTS:
            content = _read_text(path)
            if _RUN_PF_FUNC_RE.search(content):
                violations.append(str(path.relative_to(_DIST)))
        assert not violations, f"Runtime scripts still call run_pf: {violations}"

    def test_no_uv_run_in_any_script(self) -> None:
        """No shell script under scripts/ should contain uv run."""
        violations = []
        for sh_file in _SCRIPTS.rglob("*.sh"):
            content = _read_text(sh_file)
            if _UV_RUN_RE.search(content):
                violations.append(str(sh_file.relative_to(_DIST)))
        assert not violations, f"Shell scripts still reference uv run: {violations}"


# ---------------------------------------------------------------------------
# AC 5: All agent activation commands updated
# ---------------------------------------------------------------------------


class TestAgentDefinitionsClean:
    """AC 5: Agent definitions must not reference the pf.sh wrapper path."""

    AGENT_FILES = [
        "sm.md",
        "sm-setup.md",
        "tea.md",
        "dev.md",
        "reviewer.md",
    ]

    def test_agent_defs_no_pf_sh_path(self) -> None:
        """Agent definitions should not reference scripts/core/pf.sh."""
        violations = []
        for name in self.AGENT_FILES:
            content = _read_text(_AGENTS / name)
            if _PF_SH_PATH_RE.search(content):
                violations.append(name)
        assert not violations, f"Agent definitions still reference pf.sh wrapper: {violations}"

    def test_agent_behavior_guide_no_pf_sh_path(self) -> None:
        """agent-behavior.md should not reference scripts/core/pf.sh."""
        content = _read_text(_GUIDES / "agent-behavior.md")
        assert not _PF_SH_PATH_RE.search(content), (
            "agent-behavior.md still references pf.sh wrapper path"
        )


# ---------------------------------------------------------------------------
# Deprecated wrapper scripts — should also be cleaned up
# ---------------------------------------------------------------------------


class TestDeprecatedWrappersClean:
    """Deprecated scripts that currently delegate through run-pf.sh."""

    DEPRECATED_WRAPPERS = [
        _SCRIPTS / "workflow" / "start-workflow.sh",
        _SCRIPTS / "workflow" / "finish-story.sh",
        _SCRIPTS / "workflow" / "resume-workflow.sh",
        _SCRIPTS / "workflow" / "show-workflow.sh",
        _SCRIPTS / "workflow" / "workflow-status.sh",
        _SCRIPTS / "workflow" / "fix-session-phase.sh",
        _SCRIPTS / "workflow" / "phase-owner.sh",
        _SCRIPTS / "workflow" / "get-workflow-type.sh",
        _SCRIPTS / "git" / "install-git-hooks.sh",
        _SCRIPTS / "git" / "git-status-all.sh",
        _SCRIPTS / "git" / "create-feature-branches.sh",
        _SCRIPTS / "git" / "worktree-manager.sh",
    ]

    def test_deprecated_wrappers_no_run_pf(self) -> None:
        """Deprecated wrappers must not source run-pf.sh."""
        violations = []
        for path in self.DEPRECATED_WRAPPERS:
            content = _read_text(path)
            if _WRAPPER_SOURCE_RE.search(content):
                violations.append(str(path.relative_to(_DIST)))
        assert not violations, f"Deprecated wrappers still source run-pf.sh: {violations}"


# ---------------------------------------------------------------------------
# AC 6: pf init verifies pf CLI availability before writing hooks
# ---------------------------------------------------------------------------


class TestPfCliVerification:
    """AC 6: init_project must verify pf CLI is available before writing hooks.

    With the wrapper chain removed, every hook calls bare `pf`. If pf
    isn't installed globally (pipx/pip), hooks will silently fail and
    brick the entire Claude Code session. init_project must catch this
    early with a clear error.
    """

    def test_verify_pf_cli_exists(self) -> None:
        """verify_pf_cli function should be importable from init.core."""
        from pf.init.core import verify_pf_cli

        assert callable(verify_pf_cli)

    def test_verify_pf_cli_returns_result_dict(self) -> None:
        """verify_pf_cli should return {success, ...} result dict."""
        from pf.init.core import verify_pf_cli

        result = verify_pf_cli()
        assert "success" in result

    def test_verify_pf_cli_succeeds_when_pf_available(self) -> None:
        """verify_pf_cli should succeed in this test environment (pf is installed)."""
        from pf.init.core import verify_pf_cli

        result = verify_pf_cli()
        assert result["success"] is True

    def test_verify_pf_cli_reports_version(self) -> None:
        """verify_pf_cli should report the detected pf version."""
        from pf.init.core import verify_pf_cli

        result = verify_pf_cli()
        assert "version" in result

    def test_verify_pf_cli_reports_install_method(self) -> None:
        """verify_pf_cli should report how pf is installed (pipx, pip, etc)."""
        from pf.init.core import verify_pf_cli

        result = verify_pf_cli()
        assert "install_method" in result

    def test_init_project_calls_verify(self, tmp_path: Path) -> None:
        """init_project should call verify_pf_cli before writing hooks."""
        from unittest.mock import patch

        from pf.init.core import init_project

        target = tmp_path / "project"
        target.mkdir()

        # Create minimal dist
        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "commands").mkdir()
        (dist / "skills").mkdir()

        with patch("pf.init.core.verify_pf_cli") as mock_verify:
            mock_verify.return_value = {
                "success": True,
                "version": "11.5.0",
                "install_method": "pipx",
            }
            init_project(target_dir=target, dist_root=dist)
            mock_verify.assert_called_once()

    def test_init_project_fails_if_pf_not_available(self, tmp_path: Path) -> None:
        """init_project should fail early if verify_pf_cli reports failure."""
        from unittest.mock import patch

        from pf.init.core import init_project

        target = tmp_path / "project"
        target.mkdir()

        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "commands").mkdir()
        (dist / "skills").mkdir()

        with patch("pf.init.core.verify_pf_cli") as mock_verify:
            mock_verify.return_value = {
                "success": False,
                "error": "pf CLI not found on PATH",
            }
            result = init_project(target_dir=target, dist_root=dist)

        assert result["success"] is False
        assert "pf" in result["error"].lower()
        # Should NOT have created hooks/settings
        assert not (target / ".claude" / "settings.local.json").exists()

    def test_init_project_warns_on_stale_shim(self, tmp_path: Path) -> None:
        """init_project should include a warning if pf shim points to dead venv."""
        from unittest.mock import patch

        from pf.init.core import init_project

        target = tmp_path / "project"
        target.mkdir()

        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "commands").mkdir()
        (dist / "skills").mkdir()

        with patch("pf.init.core.verify_pf_cli") as mock_verify:
            mock_verify.return_value = {
                "success": False,
                "error": "pf found but broken — stale shim at $HOME/.local/bin/pf",
                "install_hint": "pipx install -e pennyfarthing-dist/",
            }
            result = init_project(target_dir=target, dist_root=dist)

        assert result["success"] is False
        assert "pipx install" in result.get("error", "")
