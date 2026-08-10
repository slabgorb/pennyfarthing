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
    _lookup_merged_pr_by_branch,
    aggregate_results,
    check_jira_status,
    check_lint,
    check_pr_status,
    run_finish_preflight,
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


# =============================================================================
# 164-2 AC1 — LintResult skipped-invariant enforcement (mutation-resistant)
# =============================================================================


class TestLintResultSkippedInvariant:
    """LintResult must reject contradictory skipped=True states via __post_init__."""

    def test_lintresult_rejects_skipped_true_with_error_set(self) -> None:
        """skipped=True + error set is a contradictory state: skipped means no run, not a failed run."""
        with pytest.raises(ValueError, match="skipped"):
            LintResult(skipped=True, error="lint check failed")

    def test_lintresult_rejects_skipped_true_with_clean_false(self) -> None:
        """skipped=True + clean=False is a contradictory state: if skipped, clean must be True."""
        with pytest.raises(ValueError, match="skipped"):
            LintResult(skipped=True, clean=False)

    def test_lintresult_accepts_canonical_skipped_state(self) -> None:
        """skipped=True, clean=True, error=None is the only valid skipped form."""
        result = LintResult(skipped=True, clean=True, error=None)
        assert result.skipped is True
        assert result.clean is True
        assert result.error is None

    def test_lintresult_accepts_normal_failed_lint(self) -> None:
        """skipped=False + clean=False + error set is a valid (non-skipped) failure state."""
        result = LintResult(skipped=False, clean=False, error="lint errors found")
        assert result.skipped is False
        assert result.clean is False
        assert result.error == "lint errors found"


# =============================================================================
# 164-2 AC2 — Lint and Jira skipped to_dict shape unification
# =============================================================================


class TestLintJiraSkippedToDictUnification:
    """Both lint.skipped and jira.skipped must serialize through the same nested convention."""

    def test_jira_skipped_to_dict_has_no_top_level_jira_skipped_key(self) -> None:
        """The asymmetric top-level 'jira_skipped' key must be removed; only nested form allowed."""
        result = aggregate_results(
            "164-2",
            PRStatus(state="MERGED", merged=True),
            LintResult(clean=True, skipped=True),
            JiraStatus(skipped=True),
            AcceptanceCriteria(),
        )
        d = result.to_dict()
        assert "jira_skipped" not in d, (
            "to_dict() emits a top-level 'jira_skipped' key — asymmetric shape "
            "relative to lint skipped (which is nested only). Unify: drop the "
            "top-level key and use only 'jira': {'skipped': True, ...}."
        )

    def test_jira_skipped_nested_shape_mirrors_lint_skipped_shape(self) -> None:
        """jira.skipped and lint.skipped must use the same nested wire shape."""
        result = aggregate_results(
            "164-2",
            PRStatus(state="MERGED", merged=True),
            LintResult(clean=True, skipped=True),
            JiraStatus(skipped=True),
            AcceptanceCriteria(),
        )
        d = result.to_dict()
        assert d.get("lint", {}).get("skipped") is True, (
            f"lint skipped not nested correctly: {d.get('lint')}"
        )
        assert d.get("jira", {}).get("skipped") is True, (
            "jira skipped is absent from the nested 'jira' dict — shape diverges "
            f"from lint. Expected 'jira': {{'skipped': True, ...}}, got: {d.get('jira')}"
        )


# =============================================================================
# 164-2 AC3 — _lookup_merged_pr_by_branch belt-and-suspenders arg guard
# =============================================================================


class TestLookupMergedPrByBranchArgGuard:
    """_lookup_merged_pr_by_branch must guard its own branch arg, independent of callers."""

    @pytest.mark.asyncio
    async def test_lookup_direct_call_rejects_double_dash_option_branch(self) -> None:
        """Direct call with '--foo' must not reach gh as an option-position arg (CWE-88)."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"[]"))
        with _patched(recorder):
            await _lookup_merged_pr_by_branch("--foo", None)

        assert _token_is_neutralized(recorder, "--foo"), (
            "_lookup_merged_pr_by_branch passed '--foo' directly to gh pr list "
            "as a bare positional — argument injection CWE-88. Add an internal "
            "_reject_option_like guard at the function entry (belt-and-suspenders, "
            "independent of check_pr_status's guard)."
        )

    @pytest.mark.asyncio
    async def test_lookup_direct_call_rejects_single_dash_injection(self) -> None:
        """Direct call with '-R' (single-dash short flag) must also be neutralized."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"[]"))
        with _patched(recorder):
            await _lookup_merged_pr_by_branch("-R", None)

        assert _token_is_neutralized(recorder, "-R"), (
            "_lookup_merged_pr_by_branch passed single-dash '-R' to gh pr list "
            f"as a positional flag. argv: {recorder.argvs}"
        )

    @pytest.mark.asyncio
    async def test_lookup_direct_call_allows_legitimate_branch(self) -> None:
        """Over-reach: a legitimate branch must not be blocked by the internal guard."""
        recorder = _Recorder(lambda tokens: _FakeProc(
            returncode=0,
            stdout=b'[{"state":"MERGED","mergedAt":"2026-01-01T00:00:00Z","url":"https://github.com/x/y/pull/1"}]',
        ))
        with _patched(recorder):
            result = await _lookup_merged_pr_by_branch("feat/164-2", None)

        assert recorder.argvs, "guard blocked a legitimate branch — no subprocess ran"
        assert result is not None, "legitimate branch returned None instead of PR data"


# =============================================================================
# 164-2 AC4 — Symmetric over-reach + single-dash injection + skip invariant
# =============================================================================


class TestSymmetricGuardsAndSkipInvariant:
    """AC4: symmetric jira over-reach, single-dash PR injection, skip-clean invariant."""

    @pytest.mark.asyncio
    async def test_jira_status_does_not_block_legitimate_key(self) -> None:
        """Symmetric over-reach: a real Jira key 'PROJ-12345' must still reach jira issue view."""
        recorder = _Recorder(lambda tokens: _FakeProc(
            returncode=0,
            stdout=b'{"fields":{"status":{"name":"In Progress"}}}',
        ))
        with _patched(recorder):
            result = await check_jira_status("PROJ-12345")

        assert result.error is None, (
            f"check_jira_status blocked legitimate key 'PROJ-12345': {result.error!r}"
        )
        assert recorder.argvs, (
            "guard suppressed a legitimate jira key — no subprocess ran"
        )

    @pytest.mark.asyncio
    async def test_pr_status_neutralizes_single_dash_injection(self) -> None:
        """Single-dash '-R owner/repo' is a real short-flag injection vector for gh."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b'{"state":"MERGED"}'))
        with _patched(recorder):
            result = await check_pr_status("-R")

        assert isinstance(result, PRStatus)
        assert _token_is_neutralized(recorder, "-R"), (
            "check_pr_status allowed single-dash '-R' to reach gh as a positional — "
            f"argument injection. argv: {recorder.argvs}"
        )

    @pytest.mark.asyncio
    async def test_check_lint_marks_skipped_with_clean_true_invariant(
        self, tmp_path: Path
    ) -> None:
        """skipped=True must coexist with clean=True — both must hold simultaneously (AC1+AC4c)."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0))
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert result.skipped is True
        assert result.clean is True, (
            "check_lint returned skipped=True but clean is not True — violates "
            "the skipped→clean invariant. 'not checked' must report as clean "
            "to avoid false-blocking finish (SOUL #10)."
        )


# =============================================================================
# 164-2 AC5 — Unmerged-branch-no-PR warning surfaces at preflight entry
# =============================================================================


class TestPreflightEntryUnmergedBranchWarning:
    """When branch is unmerged and no PR exists, a warning must appear at preflight entry."""

    @pytest.mark.asyncio
    async def test_run_finish_preflight_warns_on_unmerged_branch_no_pr(
        self, tmp_path: Path
    ) -> None:
        """Unmerged-branch+no-PR must surface as a warning at preflight, not only as a critical issue."""
        # Minimal session file so acceptance_criteria check does not error out.
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "164-2-session.md").write_text(
            "# Story 164-2\n- [x] AC1 completed\n",
            encoding="utf-8",
        )

        def _dispatch(tokens: list[str]) -> _FakeProc:
            # Both gh pr view and gh pr list (merged fallback) report no PR.
            if "gh" in tokens:
                return _FakeProc(
                    returncode=1,
                    stdout=b"",
                    stderr=b"no pull requests found for branch 'feat/164-2'",
                )
            return _FakeProc(returncode=0, stdout=b"")

        recorder = _Recorder(_dispatch)
        with _patched(recorder):
            result = await run_finish_preflight(
                story_id="164-2",
                branch="feat/164-2",
                jira_key=None,
                project_root=tmp_path,
            )

        # Currently aggregate_results creates a *critical issue* for "no pull requests
        # found", but emits NO warning. The preflight entry must ALSO emit a warning so
        # the user sees the unmerged-branch signal before the ceremony proceeds.
        unmerged_warning = any(
            "unmerged" in w.lower() or "no pr" in w.lower() or "no pull request" in w.lower()
            for w in result.warnings
        )
        assert unmerged_warning, (
            "run_finish_preflight returned no warning for the unmerged-branch+no-PR "
            f"condition (warnings={result.warnings!r}). Add an early pre-check in "
            "run_finish_preflight that emits a warning before the parallel ceremony "
            "begins — the abort signal must surface at preflight entry, not only "
            "buried as a blocking issue in the aggregated result."
        )


# =============================================================================
# 164-2 review round-1 fixes
# =============================================================================


class TestCheckLintSkipPathInvariant:
    """check_lint skip path must construct LintResult in one shot (not mutate post-init)."""

    @pytest.mark.asyncio
    async def test_check_lint_skip_path_yields_invariant_valid_result(
        self, tmp_path: Path
    ) -> None:
        """Skip path must return a LintResult that satisfies __post_init__ (one-shot construction)."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0))
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert result.skipped is True
        assert result.clean is True
        assert result.error is None
        # Re-construct from returned fields — must not raise ValueError.
        # This guards against post-construction mutation that bypasses __post_init__.
        LintResult(skipped=result.skipped, clean=result.clean, error=result.error)


class TestEmptyBranchGuard:
    """An empty or whitespace branch value must be rejected before reaching gh."""

    @pytest.mark.asyncio
    async def test_check_pr_status_rejects_empty_branch(self) -> None:
        """Empty branch '' must not reach gh pr list --head '' (matches all merged PRs repo-wide)."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"[]"))
        with _patched(recorder):
            result = await check_pr_status("")

        assert result.error is not None, (
            "check_pr_status must reject an empty branch string — "
            "'gh pr list --head \"\"' matches all merged PRs repo-wide (false-positive merged)."
        )
        assert recorder.argvs == [], (
            f"empty branch reached the subprocess — must be rejected before launch. argvs: {recorder.argvs}"
        )

    @pytest.mark.asyncio
    async def test_lookup_direct_call_rejects_empty_branch(self) -> None:
        """_lookup_merged_pr_by_branch with '' must also be neutralized by the internal guard."""
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"[]"))
        with _patched(recorder):
            result = await _lookup_merged_pr_by_branch("", None)

        assert result is None, "empty branch must return None (guard rejected)"
        assert recorder.argvs == [], (
            f"empty branch reached gh pr list — must be rejected by internal guard. argvs: {recorder.argvs}"
        )
