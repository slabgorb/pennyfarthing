"""Tests for the project-shim doctor check (story 153-11).

Background:
    `pf doctor` only checked the GLOBAL pf binary on PATH (python_install) and
    never the project-local shim at `.pennyfarthing/bin/pf`. That shim is
    gitignored, so a `git clean` or a fresh clone that never ran `pf init`
    leaves it missing — yet doctor reported "All checks passed" while every
    `just pf *` recipe and the Claude statusline hook (which exec the shim)
    were broken.

Designed interface (RED — implement in pf/doctor/checks.py + core.py):
    - check_project_shim(root: Path) -> CheckResult
        name      == "project_shim"
        status    in {"pass", "fail"}
        detail    -> remediation referencing `pf init` on failure
    - Registered in CHECKS registry (pf/doctor/checks.py)
    - Wired into _CHECK_FNS map (pf/doctor/core.py) so run_doctor invokes it

States covered (AC4):
    1. missing                 -> fail (shim absent)
    2. present-but-not-executable -> fail
    3. present-and-working     -> pass (shim execs `pf --version` cleanly)

Plus: a broken/stale shim that execs non-zero -> fail.
"""

from __future__ import annotations

import stat
from pathlib import Path

import pytest

from pf.doctor.checks import CHECKS, check_project_shim
from pf.doctor.core import _CHECK_FNS, run_doctor
from pf.doctor.models import CheckResult

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _write_shim(root: Path, *, body: str, executable: bool) -> Path:
    """Create .pennyfarthing/bin/pf with the given body.

    The body is a shell script. For the "working" case it must exit 0 when
    invoked as `pf --version`; for the "broken/stale" case it exits non-zero.
    """
    bin_dir = root / ".pennyfarthing" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    shim = bin_dir / "pf"
    shim.write_text(body)
    if executable:
        shim.chmod(0o755)
    else:
        # Readable/writable but explicitly NOT executable.
        shim.chmod(0o644)
    return shim


@pytest.fixture
def project_with_working_shim(tmp_path: Path) -> Path:
    """Project whose shim execs `pf --version` and exits 0."""
    root = tmp_path / "working"
    root.mkdir()
    _write_shim(
        root,
        body="#!/bin/sh\n# fake working shim\necho 'pf 13.3.0'\nexit 0\n",
        executable=True,
    )
    return root


@pytest.fixture
def project_with_missing_shim(tmp_path: Path) -> Path:
    """Project with .pennyfarthing/ but NO bin/pf shim (the oq-2 bug)."""
    root = tmp_path / "missing"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    return root


@pytest.fixture
def project_with_nonexecutable_shim(tmp_path: Path) -> Path:
    """Project whose shim exists but lacks the executable bit."""
    root = tmp_path / "nonexec"
    root.mkdir()
    _write_shim(
        root,
        body="#!/bin/sh\necho 'pf 13.3.0'\nexit 0\n",
        executable=False,
    )
    return root


@pytest.fixture
def project_with_broken_shim(tmp_path: Path) -> Path:
    """Project whose shim is executable but execs non-zero (stale/broken)."""
    root = tmp_path / "broken"
    root.mkdir()
    _write_shim(
        root,
        body="#!/bin/sh\necho 'No such file or directory' >&2\nexit 127\n",
        executable=True,
    )
    return root


# ---------------------------------------------------------------------------
# AC1 / AC4 state 3: present-and-working -> pass
# ---------------------------------------------------------------------------


class TestWorkingShim:
    def test_returns_checkresult(self, project_with_working_shim):
        result = check_project_shim(project_with_working_shim)
        assert isinstance(result, CheckResult)

    def test_name_is_project_shim(self, project_with_working_shim):
        result = check_project_shim(project_with_working_shim)
        assert result.name == "project_shim"

    def test_working_shim_passes(self, project_with_working_shim):
        """Shim exists, is executable, and execs `pf --version` cleanly -> pass."""
        result = check_project_shim(project_with_working_shim)
        assert result.status == "pass"

    def test_working_shim_no_init_remediation(self, project_with_working_shim):
        """A passing check should not nag the user to run `pf init`."""
        result = check_project_shim(project_with_working_shim)
        assert "pf init" not in result.detail


# ---------------------------------------------------------------------------
# AC2 / AC4 state 1: missing -> fail
# ---------------------------------------------------------------------------


class TestMissingShim:
    def test_missing_shim_fails(self, project_with_missing_shim):
        result = check_project_shim(project_with_missing_shim)
        assert result.status == "fail"

    def test_missing_shim_remediation_points_at_pf_init(self, project_with_missing_shim):
        """The whole point of this story: tell the confused downstream user to run init."""
        result = check_project_shim(project_with_missing_shim)
        assert "pf init" in result.detail

    def test_missing_shim_when_no_pennyfarthing_dir(self, tmp_path):
        """Even with no .pennyfarthing/ at all, the shim check must fail (not crash)."""
        root = tmp_path / "bare"
        root.mkdir()
        result = check_project_shim(root)
        assert result.status == "fail"
        assert "pf init" in result.detail


# ---------------------------------------------------------------------------
# AC2 / AC4 state 2: present-but-not-executable -> fail
# ---------------------------------------------------------------------------


class TestNonExecutableShim:
    def test_nonexecutable_shim_fails(self, project_with_nonexecutable_shim):
        result = check_project_shim(project_with_nonexecutable_shim)
        assert result.status == "fail"

    def test_nonexecutable_shim_remediation_points_at_pf_init(
        self, project_with_nonexecutable_shim
    ):
        result = check_project_shim(project_with_nonexecutable_shim)
        assert "pf init" in result.detail

    def test_shim_present_but_not_executable_bit_is_the_signal(
        self, project_with_nonexecutable_shim
    ):
        """Sanity: the fixture really does lack the executable bit."""
        shim = project_with_nonexecutable_shim / ".pennyfarthing" / "bin" / "pf"
        mode = shim.stat().st_mode
        assert not (mode & stat.S_IXUSR), "fixture should be non-executable"


# ---------------------------------------------------------------------------
# AC2: broken/stale shim that execs non-zero -> fail
# ---------------------------------------------------------------------------


class TestBrokenShim:
    def test_broken_shim_fails(self, project_with_broken_shim):
        """Executable shim that exits non-zero on `pf --version` -> fail."""
        result = check_project_shim(project_with_broken_shim)
        assert result.status == "fail"

    def test_broken_shim_remediation_points_at_pf_init(self, project_with_broken_shim):
        result = check_project_shim(project_with_broken_shim)
        assert "pf init" in result.detail


# ---------------------------------------------------------------------------
# Registry + run_doctor wiring (AC1, AC3)
# ---------------------------------------------------------------------------


class TestRegistration:
    def test_project_shim_in_checks_registry(self):
        names = [name for name, _ in CHECKS]
        assert "project_shim" in names

    def test_project_shim_registry_entry_is_named_tuple(self):
        entry = next((e for e in CHECKS if e[0] == "project_shim"), None)
        assert entry is not None, "project_shim missing from CHECKS"
        name, desc = entry
        assert isinstance(desc, str) and desc, "project_shim needs a description"

    def test_project_shim_wired_into_check_fns(self):
        assert "project_shim" in _CHECK_FNS
        assert _CHECK_FNS["project_shim"] is check_project_shim


class TestRunDoctorIntegration:
    """AC3: idempotent with existing doctor output — run_doctor includes the check."""

    def test_run_doctor_includes_project_shim_result(self, project_with_working_shim):
        report = run_doctor(project_with_working_shim)
        names = [c.name for c in report.checks]
        assert "project_shim" in names

    def test_run_doctor_fails_overall_when_shim_missing(self, project_with_missing_shim):
        """Doctor must NOT stay green when the shim is gone — the core bug."""
        report = run_doctor(project_with_missing_shim)
        shim_result = next(c for c in report.checks if c.name == "project_shim")
        assert shim_result.status == "fail"
        assert report.success is False

    def test_run_doctor_green_shim_does_not_drag_down_success(
        self, project_with_working_shim
    ):
        """A working shim contributes a pass, not a fail (idempotent with output)."""
        report = run_doctor(project_with_working_shim)
        shim_result = next(c for c in report.checks if c.name == "project_shim")
        assert shim_result.status == "pass"
