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

Phase status:
- Round-1 tests (TestSubcommandRegistration, TestExitCodeContract,
  TestSubprocessInvocation, TestNoBrokenAgentReferences): GREEN — the
  routing fix is committed and these tests pin its behavior.
- Round-2 tests (TestPathTraversalRejection, the whitespace test):
  RED — added in response to Reviewer findings R1/R2 (path traversal)
  and an empty-file coverage gap. Will flip GREEN when Dev sanitizes
  `context_id` and the empty-file guard is exercised.
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


@pytest.fixture
def project_with_empty_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Project marker exists and the context file exists but is whitespace-only.

    Exercises `_validate_single_context`'s "empty / unreadable -> exit 1"
    branch (the `if not content.strip()` guard).
    """
    (tmp_path / ".pennyfarthing").mkdir()
    ctx_dir = tmp_path / "sprint" / "context"
    ctx_dir.mkdir(parents=True)
    (ctx_dir / "context-story-9-9.md").write_text("   \n\t\n  \n")
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def project_with_traversal_target(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Stage the path-traversal attack the Reviewer empirically demonstrated.

    Layout:
        <tmp>/.pennyfarthing/                        (marker)
        <tmp>/sprint/context/context-story-X/        (real subdir — enables `..` to ascend)
        <tmp>/sprint/escape/secret.md                (target outside the context dir)

    With this layout, an unsanitized validator that builds
        sprint/context/context-story-<id>.md
    and calls `path.exists()` / `path.read_text()` against the OS-resolved
    path will read `sprint/escape/secret.md` when invoked with
    `context_id = "X/../../escape/secret"`. The validator MUST reject the
    payload (non-zero exit) instead of returning `[OK] ... present (N bytes)`.
    """
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / "sprint" / "context" / "context-story-X").mkdir(parents=True)
    (tmp_path / "sprint" / "escape").mkdir(parents=True)
    (tmp_path / "sprint" / "escape" / "secret.md").write_text(
        "SECRET-CONTENT-DO-NOT-LEAK-0123456789\n"
    )
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


# =============================================================================
# Round 2 — Reviewer findings R1/R2: path traversal in context_id
# =============================================================================


class TestPathTraversalRejection:
    """`context_id` is user input — it MUST NOT be able to escape sprint/context/.

    The Reviewer empirically reproduced this with:
        # tmp/sprint/context/context-story-X/ (real dir)
        # tmp/sprint/escape/secret.md
        pf validate context-story "X/../../escape/secret"
        # Old behavior: [OK] context-story-X/../../escape/secret: present (37 bytes)
        # Exit: 0
        # File actually opened: tmp/sprint/escape/secret.md

    The validator gave false success for a file outside the context dir.
    The fix is to sanitize `context_id` (reject `/`, `\\`, `..`, leading `.`)
    or to verify the resolved path is contained within sprint/context/.
    """

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_traversal_payload_exits_nonzero(
        self, runner: CliRunner, project_with_traversal_target: Path
    ) -> None:
        """The crafted traversal payload must NOT return exit 0.

        Without the fix, `_validate_single_context` opens the targeted file
        and prints `[OK] ... present (N bytes)` with exit 0. After the fix,
        the payload must be rejected before any filesystem access — the
        specific non-zero code (1 or 2) is implementation choice, but it
        must not be 0.
        """
        from pf.validate.cli import validate as validate_group

        result = runner.invoke(
            validate_group, ["context-story", "X/../../escape/secret"]
        )

        assert result.exit_code != 0, (
            "Validator accepted a path-traversal payload — it returned exit 0 "
            "for `context-story X/../../escape/secret` which resolves to a "
            "file outside sprint/context/. Sanitize context_id or add a "
            "Path containment check before path.exists()."
        )

    def test_traversal_payload_does_not_leak_target_bytes_count(
        self, project_with_traversal_target: Path
    ) -> None:
        """Subprocess check: the validator must not emit `(N bytes)` matching
        the secret file's size when invoked with the traversal payload.

        Uses subprocess (not CliRunner) because Click 8.3 routes `success()`
        output to real stderr, which CliRunner does not capture into
        `result.output`. The bytes count is an information oracle (CWE-209).
        """
        secret = project_with_traversal_target / "sprint" / "escape" / "secret.md"
        secret_size = secret.stat().st_size

        env = os.environ.copy()
        env["PROJECT_ROOT"] = str(project_with_traversal_target)
        result = subprocess.run(
            ["pf", "validate", "context-story", "X/../../escape/secret"],
            cwd=str(project_with_traversal_target),
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )

        combined = (result.stdout or "") + (result.stderr or "")
        assert f"({secret_size} bytes)" not in combined, (
            f"Validator leaked the byte count ({secret_size}) of "
            f"sprint/escape/secret.md — info-oracle for a file outside "
            f"sprint/context/. stdout={result.stdout!r} stderr={result.stderr!r}"
        )

    def test_id_with_path_separator_exits_nonzero(
        self, runner: CliRunner, project_with_story_context: Path
    ) -> None:
        """`/` in context_id is structurally invalid: real story IDs are flat
        tokens (`153-5`), never path-like. The validator must reject them on
        syntactic grounds — not merely because the resulting file path
        doesn't exist.

        We pre-create a file at the constructed path so that an unfixed
        validator would return exit 0 (success). The fixture writes
        `sprint/context/context-story-foo/bar.md`. Without sanitization the
        validator reads it and exits 0; with sanitization, it rejects the
        `/` in the ID before touching the filesystem.
        """
        from pf.validate.cli import validate as validate_group

        # Pre-create the file that the unsanitized validator would happily
        # read. The directory `context-story-foo` is real, so the path
        # `sprint/context/context-story-foo/bar.md` resolves cleanly.
        nested_dir = project_with_story_context / "sprint" / "context" / "context-story-foo"
        nested_dir.mkdir()
        (nested_dir / "bar.md").write_text("Nested content that should not validate\n")

        result = runner.invoke(validate_group, ["context-story", "foo/bar"])

        assert result.exit_code != 0, (
            "Validator accepted `foo/bar` as a story ID despite the `/`. "
            "Story IDs are flat tokens — slashes must be rejected on "
            "syntactic grounds before filesystem access (otherwise an "
            "attacker who can plant a file at sprint/context/context-story-foo/"
            "bar.md gets validation success). "
            f"Output: {(result.output or '')!r}"
        )

    # Note: a `test_id_starting_with_dot_exits_nonzero` test was considered
    # and dropped. context_id="." produces filename "context-story-..md" and
    # context_id=".." produces "context-story-...md" — neither escapes the
    # context dir (they're just oddly-named files inside it). The actual
    # security boundary is "no path-resolution escape" — covered by
    # test_traversal_payload_exits_nonzero + test_id_with_path_separator_exits_nonzero.
    # Rejecting all leading-dot IDs would be defensible defense-in-depth, but
    # it adds an implementation constraint that the AC doesn't require.


# =============================================================================
# Round 2 — Coverage gap: empty / whitespace-only context file
# =============================================================================


class TestEmptyContextFile:
    """`_validate_single_context` exits 1 for an empty file.

    The implementation has the guard (`if not content.strip()`), but no
    test exercised it. A future refactor that removes the guard would not
    fail any existing test — that's a regression risk. This class pins
    the empty-file contract.
    """

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_whitespace_only_file_exits_one(
        self, runner: CliRunner, project_with_empty_context: Path
    ) -> None:
        """A context file that exists but contains only whitespace must
        exit 1, per the contract documented in `_validate_single_context`'s
        docstring (`exit 1 = file exists but is empty / unreadable`)."""
        from pf.validate.cli import validate as validate_group

        result = runner.invoke(validate_group, ["context-story", "9-9"])

        assert result.exit_code == 1, (
            f"Expected exit 1 for a whitespace-only context file. "
            f"Got {result.exit_code}. Output: {(result.output or '')!r}"
        )
