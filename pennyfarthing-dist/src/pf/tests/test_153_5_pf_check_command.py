"""Tests for the `pf check` CLI command.

Story: 153-5 — TEA/SM workflow references missing CLI surface.

The TEA agent's verify-workflow step (pennyfarthing-dist/agents/tea.md ~line 316)
invokes `pf check` to run project-agnostic quality checks (lint, typecheck, tests).
The command does not exist in the CLI — running it yields:
    Error: No such command 'check'.

These tests pin the behavior that AC2 and AC4 require:
- AC2: TEA can run project-agnostic quality checks via `pf check` OR an
  alternative — these tests use `pf check`.
- AC4: TEA/SM workflows must execute without "command not found" errors.

The implementation must wire a Click subcommand that delegates to
`pennyfarthing-dist/scripts/workflow/check.py` (existing) or its Python
equivalent — the auto-detection logic is already implemented there.

Note on Click capture: Click 8.3 changed CliRunner stderr capture —
messages emitted via click.echo(..., err=True) (and Click's own usage
errors) no longer land in `result.output`. We therefore use
`result.exit_code` for in-process assertions and reserve content
assertions for real subprocess invocations.

Phase status: GREEN — `pf check` is registered via _LAZY_COMMANDS and
delegates to scripts/workflow/check.py. All tests here pin its behavior.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import click
import pytest
from click.testing import CliRunner

from pf.cli import cli as pf_cli


def _check_registered() -> bool:
    """Return True if `check` is discoverable on the root CLI.

    The root CLI uses LazyGroup, so commands may not appear in `.commands`
    until resolved. Use the same dispatch path Click uses at invocation.
    """
    with click.Context(pf_cli) as ctx:
        return pf_cli.get_command(ctx, "check") is not None


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def runner() -> CliRunner:
    """Click test runner for in-process CLI invocation."""
    return CliRunner()


@pytest.fixture
def tea_agent_md() -> Path:
    """Path to the TEA agent definition (source of truth for `pf check` refs)."""
    here = Path(__file__).resolve()
    # tests/ -> pf/ -> src/ -> pennyfarthing-dist/ -> agents/tea.md
    return here.parents[3] / "agents" / "tea.md"


# =============================================================================
# AC4: No "command not found" — the subcommand must exist
# =============================================================================


class TestCheckCommandRegistered:
    """`pf check` must be a registered Click subcommand."""

    def test_check_is_registered_subcommand_of_root_cli(self) -> None:
        """`check` must be resolvable via the root CLI's dispatch path."""
        assert _check_registered(), (
            "Expected `check` to be resolvable from the pf root CLI "
            "(via get_command or list_commands). It is not registered."
        )

    def test_check_help_exits_zero(self, runner: CliRunner) -> None:
        """`pf check --help` must exit 0 (a registered command's --help always does).

        When the command is missing, Click raises UsageError ("No such command
        'check'") and exits with code 2. Exit code 0 is therefore proof the
        command is registered and `--help` rendered cleanly.
        """
        result = runner.invoke(pf_cli, ["check", "--help"])
        assert result.exit_code == 0, (
            f"`pf check --help` exited {result.exit_code} — expected 0. "
            f"output={(result.output or '')!r}"
        )


# =============================================================================
# AC2 / AC4: Real subprocess invocation captures the user-facing error
# =============================================================================


class TestCheckCommandSubprocess:
    """End-to-end: `pf check --help` via real subprocess.

    Subprocess gives reliable stdout+stderr capture, so we can assert on
    the literal "No such command" bug signature.
    """

    def test_subprocess_check_help_does_not_report_no_such_command(self) -> None:
        """`pf check --help` via subprocess must not report 'No such command'.

        This is a smoke-test of AC4: the workflow YAML that calls `pf check`
        must not crash at the entry point. After implementation, --help is
        the safest invocation (no side effects) that proves dispatch works.
        """
        result = subprocess.run(
            ["pf", "check", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        combined = (result.stdout or "") + (result.stderr or "")
        assert "No such command" not in combined, (
            f"`pf check --help` reported 'No such command'. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )
        assert result.returncode == 0, (
            f"`pf check --help` returned non-zero ({result.returncode}). "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )

    def test_subprocess_check_help_documents_purpose(self) -> None:
        """Help text must reference at least one quality-check keyword.

        AC2 says the command runs project-agnostic quality checks. The
        help must describe what it does — not be an empty placeholder.

        We intentionally exclude "check" from the keyword set because
        Click's "No such command 'check'" error contains that word and
        would let this test pass vacuously when the command is missing.
        """
        result = subprocess.run(
            ["pf", "check", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # The command must exist (exit 0) before its help text can be inspected.
        assert result.returncode == 0, (
            f"`pf check --help` exited {result.returncode}; cannot inspect help. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )

        combined = ((result.stdout or "") + (result.stderr or "")).lower()
        assert any(
            kw in combined for kw in ("lint", "test", "typecheck", "quality")
        ), (
            f"`pf check --help` lacks any quality-check keyword "
            f"(lint/test/typecheck/quality). "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )


# =============================================================================
# AC3: Agent definitions match actual CLI surface
# =============================================================================


class TestNoBrokenAgentReferences:
    """If TEA agent references `pf check`, the command MUST exist."""

    def test_tea_agent_pf_check_references_resolve(self, tea_agent_md: Path) -> None:
        """Any `pf check` reference in tea.md must point at a working command.

        Allows both resolutions:
        - Option A (implement): `pf check` is registered → command exists.
        - Option B (remove refs): tea.md no longer mentions `pf check` → no
          refs to satisfy → passes vacuously.

        Fails ONLY in the current broken state: refs present, command missing.
        """
        assert tea_agent_md.exists(), f"TEA agent file missing: {tea_agent_md}"
        content = tea_agent_md.read_text()

        # Match `pf check` as a CLI invocation: word boundary on both sides,
        # not `pf checkout` or `pf check-something-else`.
        refs = re.findall(r"\bpf check\b(?!-)", content)

        if not refs:
            return  # Option B: references removed, nothing to verify.

        # Option A: references present → command must be registered.
        assert _check_registered(), (
            f"tea.md contains {len(refs)} `pf check` reference(s) but the "
            f"command is not registered in the pf CLI. Either implement "
            f"`pf check` or remove the references from tea.md."
        )
