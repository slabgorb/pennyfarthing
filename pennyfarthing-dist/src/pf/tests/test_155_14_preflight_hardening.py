"""Tests for story 155-14: preflight hardening.

Story: 155-14 — "Preflight hardening: gh arg-injection guard, LintResult.skipped
truthful reporting, async stat, skip-branch test coverage."

TDD RED phase: these tests describe the *correct* hardened behavior and fail
against the current ``pf.preflight.finish``. Four independent deliverables, each
an acceptance criterion:

1. **gh arg-injection guard (CWE-88 / lang-review #8, #11).**
   ``check_pr_status`` runs ``gh pr view <branch> ...`` and ``check_jira_status``
   runs ``jira issue view <jira_key> ...`` with ``branch``/``jira_key``/``repo``
   as *bare positionals*. An option-shaped value (``--web``, ``-R owner/repo``)
   is parsed by ``gh`` as a **flag**, not an operand — argument injection. A
   git branch, PR ref, or Jira key never legitimately starts with ``-``, so an
   option-like value must never reach the subprocess as an option-position
   argument. Two safe implementations satisfy this: reject the value before
   launching (return-don't-throw, SOUL #10), or terminate option parsing with a
   ``--`` end-of-options marker before the positional. The tests accept either.

2. **LintResult.skipped truthful reporting (SOUL #10).**
   ``LintResult`` has no ``skipped`` field. When no lintable project is detected
   (``_detect_lint_command`` → ``None``), ``check_lint`` sets ``clean = True`` —
   indistinguishable from a linter that ran and passed. "We didn't check" must
   not read as "we checked and it's clean." ``LintResult`` must carry a
   ``skipped`` flag, and ``to_dict()`` must surface it (mirroring ``jira_skipped``).

3. **async stat (lang-review #9).**
   ``_detect_lint_command`` calls ``Path.exists()`` (a blocking ``stat``) directly
   on the event-loop thread inside async ``check_lint``. Blocking I/O in async
   code stalls the loop — the stat must be offloaded (``asyncio.to_thread``),
   i.e. run off the event-loop thread.

4. **skip-branch test coverage.**
   The ``lint_cmd is None`` early-return branch (no lintable project) had no
   dedicated test. Cover it: no linter subprocess runs, and the result reports
   ``skipped`` truthfully.

Over-reach guards: a *normal* branch/key must still be passed to the subprocess
(the guard must not break legitimate finishes), and a linter that genuinely
*ran and passed* must report ``skipped is False`` (distinct from a skip).

Async subprocess is faked by patching ``asyncio.create_subprocess_exec`` /
``asyncio.create_subprocess_shell``; ``asyncio_mode = "auto"`` runs the
``async def`` tests directly (``@pytest.mark.asyncio`` kept for parity with the
sibling 155-5 suite).
"""

import threading
from pathlib import Path
from unittest.mock import patch

import pytest

from pf.preflight.finish import (
    AcceptanceCriteria,
    JiraStatus,
    LintResult,
    PRStatus,
    aggregate_results,
    check_jira_status,
    check_lint,
    check_pr_status,
)

# =============================================================================
# Async subprocess fake (mirrors the 155-5 suite)
# =============================================================================


class _FakeProc:
    """Stand-in for an asyncio subprocess with a canned result."""

    def __init__(self, returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr


class _Recorder:
    """Dispatch fake for create_subprocess_exec / create_subprocess_shell.

    ``dispatch(tokens)`` receives the command as a list of string tokens and
    returns a ``_FakeProc``. Every invocation's argv is recorded as a token
    list on ``argvs`` (and joined on ``cmdlines``) for assertions.
    """

    def __init__(self, dispatch):
        self._dispatch = dispatch
        self.argvs: list[list[str]] = []
        self.cmdlines: list[str] = []

    async def exec(self, *cmd, **kwargs):
        tokens = [str(c) for c in cmd]
        self.argvs.append(tokens)
        self.cmdlines.append(" ".join(tokens))
        return self._dispatch(tokens)

    async def shell(self, cmd, **kwargs):
        text = str(cmd)
        tokens = text.split()
        self.argvs.append(tokens)
        self.cmdlines.append(text)
        return self._dispatch(tokens)


def _patched(recorder: _Recorder):
    """Patch both exec and shell subprocess launchers with the recorder."""
    return patch.multiple(
        "asyncio",
        create_subprocess_exec=recorder.exec,
        create_subprocess_shell=recorder.shell,
    )


def _token_is_neutralized(recorder: _Recorder, token: str) -> bool:
    """True if ``token`` never reaches a subprocess as an *option-position* arg.

    Satisfied when either:
    - the guard refused the call, so ``token`` was never passed at all, or
    - every argv containing ``token`` places a bare ``--`` end-of-options marker
      before it, so the subprocess treats it strictly as an operand.

    Note: ``--json``/``--head``/``--repo`` are distinct tokens from the bare
    ``--`` separator, so option flags do not accidentally count as the marker.
    """
    for parts in recorder.argvs:
        if token not in parts:
            continue
        if "--" not in parts:
            return False
        sep = parts.index("--")
        if any(i < sep for i, p in enumerate(parts) if p == token):
            return False
    return True


# =============================================================================
# AC1 — gh / jira argument-injection guard
# =============================================================================


class TestArgInjectionGuard:
    """Option-shaped branch/key/repo values must never reach the subprocess as flags."""

    @pytest.mark.asyncio
    async def test_pr_status_neutralizes_option_shaped_branch(self, tmp_path: Path) -> None:
        recorder = _Recorder(
            lambda tokens: _FakeProc(returncode=0, stdout=b'{"state":"MERGED","mergedAt":"x"}')
        )
        with _patched(recorder):
            result = await check_pr_status("--evil-flag")

        # Must not crash — return-don't-throw contract.
        assert isinstance(result, PRStatus)
        assert _token_is_neutralized(recorder, "--evil-flag"), (
            "an option-shaped branch reached `gh pr view` as a bare positional — "
            f"argument injection (CWE-88). argv: {recorder.argvs}. Reject it or "
            "insert a `--` end-of-options marker before the branch."
        )

    # Note: ``repo`` is passed as the *value* to ``--repo`` (``cmd.extend(["--repo", repo])``),
    # so gh consumes it as an operand regardless of leading dashes — it is NOT an
    # option-position argument and therefore not an injection vector. The real vectors
    # are the bare *positionals* (branch, jira_key), covered above and below.

    @pytest.mark.asyncio
    async def test_jira_status_neutralizes_option_shaped_key(self, tmp_path: Path) -> None:
        recorder = _Recorder(
            lambda tokens: _FakeProc(returncode=0, stdout=b'{"fields":{"status":{"name":"Done"}}}')
        )
        with _patched(recorder):
            result = await check_jira_status("--evil-key")

        assert isinstance(result, JiraStatus)
        assert _token_is_neutralized(recorder, "--evil-key"), (
            "an option-shaped jira key reached `jira issue view` as a bare "
            f"positional — argument injection. argv: {recorder.argvs}."
        )

    @pytest.mark.asyncio
    async def test_guard_does_not_break_legitimate_branch(self, tmp_path: Path) -> None:
        """Over-reach guard: a normal branch must still be sent to gh and parsed."""
        recorder = _Recorder(
            lambda tokens: _FakeProc(
                returncode=0, stdout=b'{"state":"MERGED","mergedAt":"2026-01-01T00:00:00Z"}'
            )
        )
        with _patched(recorder):
            result = await check_pr_status("feat/155-14")

        assert recorder.argvs, "guard suppressed a legitimate branch — no gh subprocess ran"
        assert result.error is None, f"legitimate branch produced an error: {result.error!r}"
        assert result.merged is True, "legitimate merged PR was not recognized after guarding"


# =============================================================================
# AC2 — LintResult.skipped truthful reporting
# =============================================================================


class TestLintSkippedTruthfulReporting:
    """A skipped lint must be distinguishable from a linter that ran and passed."""

    def test_lintresult_has_skipped_field_defaulting_false(self) -> None:
        assert LintResult().skipped is False, (
            "LintResult needs a `skipped` bool (default False) so a skipped lint "
            "is not silently reported as a genuine pass (SOUL #10)."
        )

    @pytest.mark.asyncio
    async def test_check_lint_marks_skipped_when_no_lintable_project(self, tmp_path: Path) -> None:
        # Bare dir: no package.json, no pyproject.toml → nothing to lint.
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0))
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert result.skipped is True, (
            "check_lint found no lintable project but did not mark the result "
            "skipped — it reads as a genuine clean pass (SOUL #10)."
        )

    @pytest.mark.asyncio
    async def test_check_lint_not_skipped_when_linter_actually_runs(self, tmp_path: Path) -> None:
        """Over-reach guard: a real ruff run reports skipped=False, distinct from a skip."""
        (tmp_path / "pyproject.toml").write_text("[project]\nname='demo'\nversion='0'\n")
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"All checks passed!"))
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert result.skipped is False, (
            "a linter that genuinely ran must report skipped=False — otherwise "
            "'checked' and 'not checked' collapse into one state."
        )
        assert result.clean is True

    def test_to_dict_surfaces_lint_skipped_true(self) -> None:
        result = aggregate_results(
            "155-14",
            PRStatus(state="MERGED", merged=True),
            LintResult(clean=True, skipped=True),
            JiraStatus(skipped=True),
            AcceptanceCriteria(),
        )
        assert result.to_dict()["lint"].get("skipped") is True, (
            "PreflightResult.to_dict() must surface lint skipped truthfully "
            "(mirroring jira_skipped) so a skip is visible to the reviewer."
        )

    def test_to_dict_reports_lint_skipped_false_when_lint_ran(self) -> None:
        result = aggregate_results(
            "155-14",
            PRStatus(state="MERGED", merged=True),
            LintResult(clean=True, skipped=False, command="ruff check ."),
            JiraStatus(skipped=True),
            AcceptanceCriteria(),
        )
        assert result.to_dict()["lint"].get("skipped") is False, (
            "to_dict() must report skipped=False when the linter actually ran, so "
            "a genuine pass is not confusable with a skip."
        )


# =============================================================================
# AC3 — async stat (blocking Path.exists offloaded from the event loop)
# =============================================================================


class TestLintDetectionStatIsAsync:
    """The lint-detection ``stat`` must not block the event loop (lang-review #9)."""

    @pytest.mark.asyncio
    async def test_detection_stat_runs_off_event_loop_thread(self, tmp_path: Path) -> None:
        loop_thread = threading.current_thread()
        seen_threads: list[threading.Thread] = []

        def spy_exists(self) -> bool:
            seen_threads.append(threading.current_thread())
            return False  # → no lintable project → skip (no subprocess)

        with patch.object(Path, "exists", spy_exists):
            await check_lint(tmp_path)

        assert seen_threads, "check_lint never stat'd for a lint-project marker"
        assert all(t is not loop_thread for t in seen_threads), (
            "package.json/pyproject.toml existence stat ran on the event-loop "
            "thread — blocking I/O in async code (lang-review #9). Offload the "
            "stat via asyncio.to_thread so the loop is not stalled."
        )


# =============================================================================
# AC4 — skip-branch coverage (lint_cmd is None early return)
# =============================================================================


class TestLintSkipBranchCoverage:
    """Explicitly exercise the 'no lintable project' skip branch of check_lint."""

    @pytest.mark.asyncio
    async def test_skip_branch_runs_no_subprocess_and_reports_skipped(
        self, tmp_path: Path
    ) -> None:
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"should not run"))
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert recorder.argvs == [], (
            f"the skip branch must not launch any linter subprocess, got: {recorder.argvs}"
        )
        assert result.skipped is True
        assert result.command == "", (
            "a skipped lint must not claim a linter command ran — that would be an "
            f"untruthful remediation hint, got command={result.command!r}"
        )
