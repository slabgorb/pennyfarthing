"""Tests for `pf validate context-story <ID>` CLI dispatch and behavior.

Story: 153-5 — TEA/SM workflow references missing CLI surface.

The TEA agent's on-activation step (pennyfarthing-dist/agents/tea.md ~line 98)
invokes `pf validate context-story {story_id}` as a gate. Today the command
appears to be "missing" — running it produces:
    [ERROR] Unknown validator(s): context-story, 153-5

But the `context-story` subcommand IS registered on the validate group
(see pf/validate/cli.py). The bug is in the parent group's argument
routing: it uses `nargs=-1` to support `pf validate agent theme` (run
multiple validators), and that greedy capture eats the subcommand name
before Click can dispatch.

These tests pin the behavior AC1, AC3, and AC4 require:
- AC1: TEA's on-activation must be able to validate story context exists.
- AC3: References in agent definitions must match actual CLI surface.
- AC4: Workflows must execute without "command not found" or
  "Unknown validator" errors when the invocation is well-formed.

Note on Click capture: Click 8.3 changed CliRunner stderr capture —
messages emitted via click.echo(..., err=True) no longer land in
`result.output`. We therefore use `result.exit_code` for in-process
assertions (always reliable) and reserve content assertions for real
subprocess invocations.

TDD RED phase: every test in this file should FAIL until the routing
is fixed.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.validate.cli import validate as validate_group


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def runner() -> CliRunner:
    """Click test runner for in-process invocation."""
    return CliRunner()


@pytest.fixture
def tea_agent_md() -> Path:
    """Path to the TEA agent definition (source of truth for refs)."""
    here = Path(__file__).resolve()
    return here.parents[3] / "agents" / "tea.md"


@pytest.fixture
def project_with_story_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Build a minimal project with a valid story context file.

    Layout:
        <tmp>/.pennyfarthing/                       (marker dir)
        <tmp>/sprint/context/context-story-9-9.md   (a valid context file)

    Points `get_project_root()` at <tmp> via PROJECT_ROOT env var so the
    `_validate_single_context` resolver reads from the fixture, not the
    real orchestrator repo.
    """
    (tmp_path / ".pennyfarthing").mkdir()
    ctx_dir = tmp_path / "sprint" / "context"
    ctx_dir.mkdir(parents=True)

    # Use the same markdown shape as real story context files in this repo.
    # The validator must accept this — part of AC1.
    (ctx_dir / "context-story-9-9.md").write_text(
        "# Story 9-9 Context\n\n"
        "## Title\nFixture story for testing\n\n"
        "## Type\nbug (test fixture)\n\n"
        "## Problem\nSome problem description.\n\n"
        "## Acceptance Criteria\n- AC1\n- AC2\n"
    )

    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def project_without_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Project marker exists but the requested context file does NOT."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


# =============================================================================
# Precondition (sanity): subcommand is actually registered on the group
# =============================================================================


class TestSubcommandRegistration:
    """Confirms the bug is "routing", not "subcommand missing"."""

    def test_subcommand_is_registered_on_group(self) -> None:
        """`context-story` must exist as a subcommand of `validate`.

        Precondition for routing tests. If this fails the bug analysis is
        wrong and the story scope expands.
        """
        assert "context-story" in validate_group.commands, (
            "Expected `context-story` registered on validate group. "
            f"Found: {sorted(validate_group.commands)}"
        )


# =============================================================================
# AC1: Valid context file → exit 0; missing → non-zero
# =============================================================================


class TestExitCodeContract:
    """The TEA on-activation gate relies on exit codes — 0 to proceed, non-0 to stop."""

    def test_existing_context_file_exits_zero(
        self, runner: CliRunner, project_with_story_context: Path
    ) -> None:
        """A well-formed story context file must yield exit code 0.

        The TEA agent's on-activation comment specifies:
          - Exit 0: proceed — context is valid

        Currently the call goes through the "Unknown validator(s)" branch
        and returns SystemExit(1), regardless of whether the file exists.
        After the routing fix, this call must reach the subcommand,
        validate the file, and exit 0.
        """
        result = runner.invoke(validate_group, ["context-story", "9-9"])

        assert result.exit_code == 0, (
            f"Expected exit 0 for a valid context file (id 9-9). "
            f"Got {result.exit_code}. "
            f"output={(result.output or '')!r}"
        )

    def test_missing_context_file_exits_nonzero(
        self, runner: CliRunner, project_without_context: Path
    ) -> None:
        """A missing story context file must yield a non-zero exit code.

        TEA agent on-activation: "Exit 1 or 2: STOP — Story context not
        found or invalid." We don't pin the specific value (1 vs 2) —
        only that it is non-zero so the gate fires.

        This is a contract that must hold both before AND after the fix,
        so it is not a behavior-regression detector — it is a guard
        against a future bad implementation that silently returns 0 for
        missing files.
        """
        result = runner.invoke(validate_group, ["context-story", "9-9"])

        assert result.exit_code != 0, (
            f"Expected non-zero exit for missing context file. "
            f"Got 0. output={(result.output or '')!r}"
        )


# =============================================================================
# AC4: Real subprocess invocation captures the actual user-facing error
# =============================================================================


class TestSubprocessInvocation:
    """End-to-end: `pf validate context-story <ID>` via real subprocess.

    Subprocess gives us reliable stdout+stderr capture (CliRunner in
    Click 8.3 no longer routes click.echo(err=True) into result.output).
    """

    def _spawn(
        self, args: list[str], cwd: Path, env_extra: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        if env_extra:
            env.update(env_extra)
        return subprocess.run(
            args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )

    def test_cli_does_not_report_unknown_validator(
        self, project_with_story_context: Path
    ) -> None:
        """The literal bug signature: stderr says "Unknown validator(s)".

        `pf validate context-story 9-9` against a valid fixture must not
        produce that error message. The fix is "make the group dispatch
        to the subcommand"; once that lands, the message goes away.
        """
        result = self._spawn(
            ["pf", "validate", "context-story", "9-9"],
            cwd=project_with_story_context,
            env_extra={"PROJECT_ROOT": str(project_with_story_context)},
        )

        combined = (result.stdout or "") + (result.stderr or "")
        assert "Unknown validator" not in combined, (
            f"CLI reported 'Unknown validator' for a valid invocation. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )

    def test_cli_exits_zero_for_valid_context_file(
        self, project_with_story_context: Path
    ) -> None:
        """End-to-end exit code: subprocess invocation must exit 0.

        Belt-and-suspenders for `test_existing_context_file_exits_zero` —
        this is what the actual TEA on-activation gate runs.
        """
        result = self._spawn(
            ["pf", "validate", "context-story", "9-9"],
            cwd=project_with_story_context,
            env_extra={"PROJECT_ROOT": str(project_with_story_context)},
        )

        assert result.returncode == 0, (
            f"`pf validate context-story 9-9` returned {result.returncode}. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )


# =============================================================================
# AC3: Agent definitions match actual CLI surface
# =============================================================================


class TestNoBrokenAgentReferences:
    """If TEA agent references `pf validate context-story`, it MUST work."""

    def test_tea_agent_context_story_references_resolve(
        self, runner: CliRunner, tea_agent_md: Path, project_with_story_context: Path
    ) -> None:
        """Any `pf validate context-story` ref in tea.md must dispatch successfully.

        Allows both resolutions:
        - Option A (fix routing): invocation exits 0 against a valid fixture.
        - Option B (remove refs): no refs in tea.md → vacuously passes.

        Fails ONLY in the current broken state (refs present, dispatch broken).
        """
        assert tea_agent_md.exists(), f"TEA agent file missing: {tea_agent_md}"
        content = tea_agent_md.read_text()

        refs = re.findall(r"\bpf validate context-story\b", content)
        if not refs:
            return  # Option B: refs removed, nothing to verify.

        # Option A: refs present → invocation must succeed on a valid fixture.
        result = runner.invoke(validate_group, ["context-story", "9-9"])
        assert result.exit_code == 0, (
            f"tea.md contains {len(refs)} `pf validate context-story` "
            f"reference(s) but the invocation exits {result.exit_code} on a "
            f"valid fixture. Fix the group dispatch or remove the references."
        )
