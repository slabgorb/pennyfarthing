"""Tests for story 162-41: the tail of 162-9's timeout hardening.

Five defects, all in ``pf.sprint.story_finish`` (plus one extraction):

1. **The timeout signal is tested for TRUTHINESS, not for ``is not None``.**
   ``_pr_view_probe`` returns ``(view, timeout_message)`` where the second
   element is the *presence of a timeout*, carried as a string. Every caller
   asks ``if gate_timeout:`` / ``if verify_timeout:``. An EMPTY message is a
   timeout that reads as "no timeout": the hung probe collapses into the
   PERMISSIVE arm (``_classify_pr(None)`` → UNREADABLE → fall through), which
   is precisely the arm 162-9 exists to keep a hung probe out of. At the
   pre-merge gate that means attempting the IRREVERSIBLE merge with no idea
   whether the PR conflicts or already landed; at the post-merge verification
   it means printing "PR is not MERGED" about a merge that landed.

   The message is empty whenever ``str(TimeoutExpired)`` is empty or
   whitespace — ``(result.stderr or "").strip()`` erases it. Unreachable with
   today's CPython prose, which is exactly why it is worth a test: the
   correctness of an irreversible-merge gate must not rest on a stdlib
   exception's ``__str__`` staying non-empty. Presence is a different question
   from content, and only ``is not None`` asks it.

2. **Steps 5 and 6 discard a non-timeout non-zero exit.** Step 5 checks
   ``_timed_out(archive_result)`` and, on the ``else``, records
   ``{"ran": True}`` — a rc=1 epic archive is reported as having RUN CLEANLY.
   That is the silent skip epic 162 exists to kill, one branch away from the
   timeout arm that was just hardened. Step 6 reads every rc (162-32) and is
   pinned here so the pair cannot drift apart again.

3. **``_run`` does not catch ``OSError``.** It converts ``TimeoutExpired`` into
   a result object, but a missing binary or an exec failure (``gh`` not on
   PATH, ENOMEM, EMFILE) raises ``OSError`` straight through ``finish_story``
   to the CLI boundary — the same no-throw violation (SOUL #10 / rule 6) the
   timeout catch was added to remove, and after the merge it strands the story
   with a traceback instead of a report.

4. **The bounded-run machinery is private to story_finish.** ``_run`` +
   ``_TimedOutProcess`` + ``_timed_out`` are the only place in the codebase
   where "every subprocess is bounded and a hang becomes a result object" is
   true; ``pf.patch_mode`` and ``pf.benchmark.pipeline_replay`` call
   ``subprocess.run`` unbounded. Extracting the trio into a shared helper is
   what lets the next module inherit the property instead of re-deriving it.

   The extraction has one hard constraint: **the whole finish test suite fakes
   ``story_finish.subprocess``**. A helper that reaches ``subprocess.run``
   through its OWN module global would make every one of those fakes a no-op
   and let real ``gh``/``git`` run under test. So the helper takes an injected
   ``runner`` and story_finish passes its own (patchable) ``subprocess.run``.

5. **The 162-9 gate-timeout test cannot see a fell-through gate.** Its
   predicate hangs EVERY ``gh pr view``, so if the gate fell through, the merge
   ran and the POST-MERGE view hung instead — which lands on an abort that
   satisfies every one of that test's assertions. The missing assertion (zero
   ``gh pr merge`` calls) is added to the 162-9 test itself; it is also the
   load-bearing assertion of the empty-message gate test below.

Test inventory
--------------
- TestEmptyTimeoutMessageIsStillATimeout: 2  (defect 1 — gate, verification)
- TestNonTimeoutFailuresAreNotReportedAsSuccess: 2  (defect 2 — steps 5, 6)
- TestRunReturnsAResultOnOSError: 2  (defect 3 — unit + finish-level)
- TestBoundedRunSharedHelper: 6  (defect 4 — contract, interop, seam, hygiene)

Harness: 162-9's real-git-repo fixture and cwd-keyed gh fake, reused verbatim
(one gitflow repo at the project root, so steps 5 and 6 actually run), with a
thin wrapper that can inject a hang, a non-zero exit or an ``OSError`` at a
chosen call site while keeping the ledger truthful.
"""

from __future__ import annotations

import ast
import importlib
import json
import re
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import pf.sprint.story_finish as story_finish_module
from pf.sprint.story_finish import finish_story
from pf.tests.test_162_9_finish_subprocess_timeouts import (
    SESSION_WITH_PR,
    STORY_ID,
    Ledger,
    PrWorld,
    TimeoutPredicate,
    _assert_abort_invariants,
    _assert_no_escape,
    _failure_text,
    _install_fake,
    _is_bounded,
    _make_project,
    _on,
    _on_post_merge_view,
    _report_text,
    _requested_done,
)

#: The dotted path the extracted helper must live at. Named here so the one
#: place a rename has to be made is this constant.
HELPER_MODULE = "pf.common.bounded_run"


class _SilentTimeout(subprocess.TimeoutExpired):
    """A ``TimeoutExpired`` whose ``str()`` is empty.

    The defect under test is that the *presence* of a timeout is inferred from
    the *content* of its message. Reproducing it needs a timeout whose message
    is empty — so the exception's text is what varies, and nothing else. A
    subclass keeps it a genuine ``subprocess.TimeoutExpired`` (``_run``'s
    ``except`` clause must still catch it) while making the string empty, which
    is what ``(stderr or "").strip()`` produces from whitespace-only prose too.
    """

    def __str__(self) -> str:
        return ""


def _finish_with_injection(
    project_root: Path,
    world: PrWorld,
    *,
    hang_silently_on: TimeoutPredicate | None = None,
    fail_on: TimeoutPredicate | None = None,
    fail_stderr: str = "",
    oserror_on: TimeoutPredicate | None = None,
) -> tuple[dict[str, Any] | None, Ledger, BaseException | None]:
    """Run ``finish_story`` under 162-9's fake, with one failure injected.

    Exactly one of the three predicates is expected per call. Injected calls are
    recorded in the ledger BEFORE the failure, so an assertion about "did this
    call site run" still sees the argv (and its timeout kwarg) that failed.
    """
    fake_module, ledger = _install_fake(project_root, world)
    passthrough = fake_module.run

    def run(cmd: Any, **kwargs: Any) -> Any:
        argv = [str(c) for c in cmd]
        if hang_silently_on is not None and hang_silently_on(argv, ledger):
            ledger.calls.append((argv, dict(kwargs)))
            raise _SilentTimeout(cmd=argv, timeout=float(kwargs.get("timeout") or 1))
        if oserror_on is not None and oserror_on(argv, ledger):
            ledger.calls.append((argv, dict(kwargs)))
            raise OSError(2, "No such file or directory", argv[0])
        if fail_on is not None and fail_on(argv, ledger):
            ledger.calls.append((argv, dict(kwargs)))
            return MagicMock(returncode=1, stdout="", stderr=fail_stderr)
        return passthrough(cmd, **kwargs)

    fake_module.run = run
    result: dict[str, Any] | None = None
    escaped: BaseException | None = None
    with patch.object(story_finish_module, "subprocess", fake_module):
        try:
            result = finish_story(project_root, STORY_ID)
        except BaseException as exc:  # noqa: BLE001 — the no-throw contract is under test
            escaped = exc
    return result, ledger, escaped


def _steps(result: dict[str, Any] | None, step: str) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    return [s for s in result.get("steps", []) if str(s.get("step")) == step]


# =============================================================================
# Defect 1 — an empty timeout message is still a timeout
# =============================================================================


class TestEmptyTimeoutMessageIsStillATimeout:
    """``if gate_timeout:`` asks the wrong question.

    The probe's second element answers "did this call hang?" — a presence, not
    a string. Reading it for truthiness makes an empty message indistinguishable
    from "the call came back fine", and routes the hung probe into the
    permissive arm. The fix is ``is not None`` at every consumer; these two
    tests pin the two consumers on the IRREVERSIBLE path.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_gate_probe_with_empty_message_never_reaches_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: ``gate_timeout`` is ``""``, so the gate falls through to
        ``_classify_pr(None)`` → UNREADABLE → the merge is attempted anyway.

        ``gh pr merge`` is irreversible. "We could not read the PR's state" must
        never be a reason to try it, and the reason a state read failed cannot
        be allowed to depend on how chatty the failure was.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_injection(
            project, PrWorld(), hang_silently_on=_on("gh", "view")
        )

        _assert_no_escape(escaped, "the gate probe (empty timeout message)")
        assert ledger.matching("gh", "view"), (
            "precondition: the gate probe never ran, so this test proves "
            f"nothing: {[a for a, _ in ledger.calls]}"
        )
        assert ledger.matching("gh", "merge") == [], (
            "the gate probe HUNG — its timeout just carried an empty message — "
            "and finish attempted the irreversible merge anyway. A hung gate is "
            "not the permissive 'unknown' a gh ERROR degrades to (162-9): the "
            "presence of a timeout is what routes this branch, and presence "
            "must be tested with 'is not None', never for truthiness. Merge "
            f"calls made: {[a for a, _ in ledger.matching('gh', 'merge')]}"
        )
        _assert_abort_invariants(result, project, mock_transition)
        assert re.search(r"(?i)tim(?:e|ed)\s?out|timeout", _failure_text(result)), (
            "the abort does not tell the operator a probe timed out, so a "
            f"re-run looks pointless: {_failure_text(result)}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_verification_with_empty_message_does_not_deny_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: ``verify_timeout`` is ``""``, so the post-merge arm skips the
        "could not verify" abort and lands on the one that flatly states the PR
        is not MERGED. It IS merged. That message sends an operator to re-merge
        or revert a PR that landed cleanly — the exact lie 162-9 removed,
        reachable again through an empty message.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_injection(
            project, PrWorld(), hang_silently_on=_on_post_merge_view
        )

        _assert_no_escape(escaped, "the post-merge verification (empty message)")
        assert ledger.matching("gh", "merge"), (
            "precondition: the merge must have run before the verification hung"
        )
        _assert_abort_invariants(result, project, mock_transition)
        text = _report_text(result)
        assert not re.search(r"(?i)is\s+not\s+(?:in\s+)?MERGED", text), (
            "the report claims the PR is not MERGED. It IS merged — the "
            "VERIFICATION hung, with an empty timeout message. 'Could not "
            "verify' and 'did not land' are different facts and only the "
            f"presence of the timeout distinguishes them: {text}"
        )
        assert not re.search(r"(?i)unmerged code", text), (
            "the report blames unmerged code for a timed-out verification of a "
            f"merge that landed: {text}"
        )
        assert re.search(r"(?i)tim(?:e|ed)\s?out|timeout|could not (?:be )?confirm", text), (
            f"the report does not say the verification is what failed: {text}"
        )


# =============================================================================
# Defect 2 — steps 5 and 6 must not report a failed command as having run
# =============================================================================


class TestNonTimeoutFailuresAreNotReportedAsSuccess:
    """Post-done bookkeeping is allowed to FAIL. It is not allowed to LIE.

    Both steps run after the story is ``done``, so neither may un-report a story
    that shipped — the report stays ``success: True``. But a rc=1 command must
    leave a visible reason in the step entry, never the clean-run shape.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step_five_epic_archive_nonzero_exit_is_not_reported_as_ran(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: the only thing step 5 asks is ``_timed_out(archive_result)``.
        A rc=1 epic archive takes the ``else`` and records
        ``{"ran": True}`` — finish reports a completed epic archive that never
        happened, and the operator never learns the epics are still open.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)
        stderr = "epic archive refused: sprint/archive is not writable"

        result, ledger, escaped = _finish_with_injection(
            project,
            PrWorld(),
            fail_on=_on("epic", "archive"),
            fail_stderr=stderr,
        )

        _assert_no_escape(escaped, "step 5 (epic archive rc=1)")
        assert ledger.matching("epic", "archive"), (
            f"precondition: step 5 never ran: {[a for a, _ in ledger.calls]}"
        )
        assert isinstance(result, dict) and result.get("success") is True, (
            "the merge was verified and the story went done — a failed epic "
            f"archive is bookkeeping, it must not un-report the story: {result}"
        )
        assert _requested_done(mock_transition), "precondition: the story went done"
        step_five = _steps(result, "5")
        assert step_five, f"step 5 left no record at all: {result.get('steps')}"
        assert not any(s.get("ran") is True for s in step_five), (
            "step 5 exited NON-ZERO and the report says it ran: "
            f"{json.dumps(step_five, default=str)}. A non-timeout failure is "
            "still a failure — the timeout arm is not the only way this command "
            "can not-happen."
        )
        assert stderr in _failure_text(result), (
            "step 5's own stderr is the only thing that tells the operator WHY "
            "the epic archive did not happen, and it was discarded: "
            f"{_failure_text(result)}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step_six_cleanup_nonzero_exit_warns_and_names_the_reason(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Step 6's half of the pair (162-32 landed this; pinned so the two
        cannot drift apart again while step 5 is fixed). A rc=1 ``git pull``
        must surface as a warning naming git's reason — not as a bare, clean
        ``git_cleanup`` entry.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)
        stderr = "fatal: couldn't find remote ref refs/heads/develop"

        result, ledger, escaped = _finish_with_injection(
            project, PrWorld(), fail_on=_on("git", "pull"), fail_stderr=stderr
        )

        _assert_no_escape(escaped, "step 6 (git pull rc=1)")
        assert ledger.matching("git", "pull"), (
            f"precondition: step 6's pull never ran: {[a for a, _ in ledger.calls]}"
        )
        assert isinstance(result, dict) and result.get("success") is True, (
            f"a failed cleanup must not un-report a story that shipped: {result}"
        )
        step_six = _steps(result, "6")
        assert step_six, f"step 6 left no record at all: {result.get('steps')}"
        assert any(s.get("warning") for s in step_six), (
            "the pull exited NON-ZERO and step 6 reads like a clean cleanup: "
            f"{json.dumps(step_six, default=str)}"
        )
        assert stderr in _failure_text(result), (
            f"step 6 discarded git's own reason for the failure: {_failure_text(result)}"
        )


# =============================================================================
# Defect 3 — _run must return a result when the child cannot be spawned
# =============================================================================


class TestRunReturnsAResultOnOSError:
    """``_run`` promises a result object for every outcome. It keeps that
    promise for ``TimeoutExpired`` only.

    ``subprocess.run`` raises ``OSError`` when the child cannot be spawned at
    all: ``gh`` absent from PATH (ENOENT), a fork that cannot allocate
    (ENOMEM), an exhausted fd table (EMFILE). That is a MORE likely failure than
    the timeout already handled, and it escapes ``finish_story`` as a traceback
    — the same no-throw violation, with the same consequence after the merge.
    """

    def test_run_converts_a_spawn_failure_into_a_failed_result(self) -> None:
        """RED: nothing catches ``OSError``, so it propagates out of ``_run``."""

        def boom(cmd: Any, **kwargs: Any) -> Any:
            raise OSError(2, "No such file or directory", "gh")

        stub = type(
            "SubprocessStub",
            (),
            {
                "run": staticmethod(boom),
                "TimeoutExpired": subprocess.TimeoutExpired,
                "CompletedProcess": subprocess.CompletedProcess,
            },
        )()
        with patch.object(story_finish_module, "subprocess", stub):
            try:
                result = story_finish_module._run(["gh", "pr", "view", "1"])
            except OSError as exc:  # pragma: no cover - the defect itself
                pytest.fail(
                    "_run let an OSError escape: "
                    f"{exc!r}. Every finish subprocess goes through this seam, "
                    "and a raw exception here reaches the CLI as a traceback — "
                    "the no-throw contract (SOUL #10 / rule 6) makes no "
                    "exception for a child that could not be spawned"
                )
        assert isinstance(result, subprocess.CompletedProcess), (
            f"_run must return a CompletedProcess-shaped result, got {result!r}"
        )
        assert result.returncode != 0, (
            "a spawn failure that reports rc=0 is worse than the exception it "
            f"replaced — every caller reads it as success: {result!r}"
        )
        assert not story_finish_module._timed_out(result), (
            "a child that never started is not a child that hung. Routing a "
            "spawn failure into the timeout arm tells the operator to expect "
            "the next call to hang too, and hides a missing binary"
        )
        assert "No such file or directory" in (result.stderr or ""), (
            "the result drops the OS error's own text, so the report cannot "
            f"tell a missing gh from any other failure: {result.stderr!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_spawn_failure_mid_ceremony_returns_a_report_not_a_traceback(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: an ``OSError`` on the gate probe escapes ``finish_story``.

        Only the no-throw contract is asserted here, deliberately: a gh ERROR
        (as opposed to a hang) is permissively indeterminate by design (162-9),
        so this test does not claim the merge must be skipped — it claims the
        operator gets a REPORT.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_injection(
            project, PrWorld(), oserror_on=_on("gh", "view")
        )

        _assert_no_escape(escaped, "a gh spawn failure at the gate")
        assert ledger.matching("gh", "view"), (
            f"precondition: the gate probe never ran: {[a for a, _ in ledger.calls]}"
        )
        assert isinstance(result, dict), f"finish must return a result dict: {result!r}"
        assert result.get("success") is False, (
            "the PR's state was never established and the merge could not be "
            f"confirmed — finish must not report success: {result}"
        )


# =============================================================================
# Defect 4 — the bounded-run trio belongs in a shared helper
# =============================================================================


def _load_helper() -> ModuleType:
    """Import the shared helper, failing the test (not collection) if absent."""
    try:
        return importlib.import_module(HELPER_MODULE)
    except ImportError as exc:
        pytest.fail(
            f"{HELPER_MODULE} does not import ({exc}). The bounded-run trio "
            "(_run + _TimedOutProcess + _timed_out) is the only place in this "
            "codebase where 'every subprocess is bounded and a hang becomes a "
            "result object' holds, and it is private to story_finish — "
            "pf.patch_mode and pf.benchmark.pipeline_replay each call "
            "subprocess.run unbounded. Extract it so the property is inherited, "
            "not re-derived"
        )


class TestBoundedRunSharedHelper:
    """The extraction's contract, and the seam it must not break.

    story_finish keeps its ``_run`` (the call sites and their timeout tiering
    are unchanged); what moves is the machinery. Two properties make the move
    safe rather than cosmetic: a helper-produced timeout must read as timed out
    inside story_finish, and patching ``story_finish.subprocess`` must still
    divert every call — the whole finish suite is built on that fake, and a
    helper that closed over its own ``subprocess`` would silently let real
    ``gh`` and ``git`` run under test.
    """

    def test_helper_exposes_the_bounded_run_trio(self) -> None:
        """RED: the module does not exist yet."""
        helper = _load_helper()
        missing = [
            name
            for name in ("run", "TimedOutProcess", "timed_out", "DEFAULT_TIMEOUT_S")
            if not hasattr(helper, name)
        ]
        assert missing == [], (
            f"{HELPER_MODULE} must expose the whole trio plus its default bound "
            f"so a caller needs nothing else; missing: {missing}"
        )
        assert issubclass(helper.TimedOutProcess, subprocess.CompletedProcess), (
            "TimedOutProcess must BE a CompletedProcess — callers read "
            "returncode/stdout/stderr off it without knowing it is the timeout "
            f"shape: {helper.TimedOutProcess.__mro__}"
        )
        assert _is_bounded({"timeout": helper.DEFAULT_TIMEOUT_S}), (
            "the helper's default must be a positive finite number of seconds, "
            f"or 'bounded by default' is not true: {helper.DEFAULT_TIMEOUT_S!r}"
        )

    def test_helper_bounds_the_call_and_honors_an_explicit_timeout(self) -> None:
        """RED: no helper. The default bound is the whole point of the
        extraction — a caller that opts into nothing must still be bounded — and
        an explicit value must reach the runner unchanged, because that is how
        per-call tiering is expressed.
        """
        helper = _load_helper()
        seen: list[dict[str, Any]] = []

        def runner(cmd: Any, **kwargs: Any) -> Any:
            seen.append(dict(kwargs))
            return subprocess.CompletedProcess(cmd, 0, "", "")

        helper.run(["git", "status", "--porcelain"], runner=runner)
        helper.run(["git", "status", "--porcelain"], timeout=7, runner=runner)

        assert len(seen) == 2, f"the runner saw {len(seen)} calls, expected 2: {seen}"
        assert _is_bounded(seen[0]), (
            "the helper reached the runner with no usable timeout, so every "
            f"caller that does not opt in can hang forever: {seen[0]}"
        )
        assert seen[1].get("timeout") == 7, (
            f"an explicit timeout must reach the runner unchanged: {seen[1]}"
        )
        assert seen[0].get("capture_output") is True and seen[0].get("text") is True, (
            "the helper must keep _run's captured-text defaults, or every "
            f"caller's stderr-reading breaks: {seen[0]}"
        )

    def test_helper_turns_a_blown_timeout_into_a_timed_out_process(self) -> None:
        """RED: no helper. A hang must come back as a result carrying the
        exception's own text, never as a raised ``TimeoutExpired``.
        """
        helper = _load_helper()

        def runner(cmd: Any, **kwargs: Any) -> Any:
            raise subprocess.TimeoutExpired(cmd=cmd, timeout=kwargs.get("timeout") or 1)

        result = helper.run(["gh", "pr", "view", "9"], timeout=11, runner=runner)

        assert isinstance(result, helper.TimedOutProcess), (
            "a blown timeout must come back as the TimedOutProcess shape — a "
            "distinct TYPE, so timed_out() answers False for every other "
            f"result (including the MagicMocks the finish suites hand back): {result!r}"
        )
        assert result.returncode == story_finish_module._TIMEOUT_RETURNCODE, (
            "the timeout result must keep timeout(1)'s conventional exit status "
            "so it reads as a failure to every 'returncode != 0' check, got "
            f"{result.returncode!r}"
        )
        assert "timed out" in (result.stderr or "").lower() or "11" in (result.stderr or ""), (
            "the timeout result drops the exception's text, which is the only "
            f"thing naming the command and the bound that expired: {result.stderr!r}"
        )
        assert helper.timed_out(result) is True, "timed_out must recognise its own shape"
        assert helper.timed_out(subprocess.CompletedProcess([], 124, "", "")) is False, (
            "timed_out must answer False for a plain result that merely carries "
            "rc=124 — a real command is allowed to exit 124"
        )
        assert helper.timed_out(MagicMock()) is False, (
            "timed_out must answer False for a MagicMock: a getattr/duck probe "
            "invents a truthy attribute and would read every faked call in the "
            "finish suites as timed out"
        )

    def test_helper_also_converts_a_spawn_failure(self) -> None:
        """RED: no helper. Defect 3's fix belongs IN the helper, so every future
        caller inherits it instead of re-learning that ``subprocess.run`` raises
        for a missing binary.
        """
        helper = _load_helper()

        def runner(cmd: Any, **kwargs: Any) -> Any:
            raise OSError(2, "No such file or directory", "gh")

        result = helper.run(["gh", "pr", "view", "9"], runner=runner)

        assert isinstance(result, subprocess.CompletedProcess), (
            f"a spawn failure must come back as a result, got {result!r}"
        )
        assert result.returncode != 0, f"a spawn failure must not read as rc=0: {result!r}"
        assert not helper.timed_out(result), (
            "a child that never started did not hang — keep the two distinct"
        )
        assert "No such file or directory" in (result.stderr or ""), (
            f"the OS error's text is the diagnosis; it was dropped: {result.stderr!r}"
        )

    def test_story_finish_delegates_and_keeps_its_patchable_seam(self) -> None:
        """RED: no helper, so nothing is delegated yet.

        The two properties that make the extraction safe:

        1. ``story_finish._timed_out`` recognises a helper-produced timeout (and
           ``helper.timed_out`` recognises story_finish's). Two parallel
           ``_TimedOutProcess`` classes would make every timeout arm in
           story_finish unreachable through the helper — a silent regression of
           all of 162-9.
        2. ``_run`` still reaches ``subprocess.run`` through story_finish's OWN
           module global. Every finish test suite patches
           ``story_finish.subprocess``; if the helper used its own import, those
           fakes would become no-ops and real gh/git would run under test.
        """
        helper = _load_helper()

        timed_out_from_helper = helper.TimedOutProcess(
            ["gh", "pr", "view", "9"], story_finish_module._TIMEOUT_RETURNCODE, "", "hung"
        )
        assert story_finish_module._timed_out(timed_out_from_helper), (
            "story_finish does not recognise the helper's timeout shape, so "
            "every timeout arm 162-9 added is dead code once _run delegates. "
            "The class must be shared, not duplicated"
        )

        calls: list[tuple[list[str], dict[str, Any]]] = []

        def spy(cmd: Any, **kwargs: Any) -> Any:
            calls.append(([str(c) for c in cmd], dict(kwargs)))
            return subprocess.CompletedProcess(cmd, 0, "", "")

        stub = type(
            "SubprocessStub",
            (),
            {
                "run": staticmethod(spy),
                "TimeoutExpired": subprocess.TimeoutExpired,
                "CompletedProcess": subprocess.CompletedProcess,
            },
        )()
        with patch.object(story_finish_module, "subprocess", stub):
            story_finish_module._run(["git", "status", "--porcelain"])

        assert len(calls) == 1, (
            "patching story_finish.subprocess no longer intercepts _run — the "
            "extraction moved the seam out from under every finish test suite, "
            f"and real gh/git would now run under test: {calls}"
        )
        assert _is_bounded(calls[0][1]), f"the delegated _run lost its default bound: {calls[0][1]}"

    def test_helper_module_imports_nothing_from_pf(self) -> None:
        """RED: no helper. A leaf utility every module may call must not import
        any ``pf`` package: story_finish already sits under a jira/sprint import
        graph that produced a cycle in 162-30, and the point of the helper is to
        be importable from anywhere (hooks, patch_mode, benchmark) cheaply.
        """
        helper = _load_helper()
        source_path = Path(helper.__file__ or "")
        assert source_path.is_file(), f"cannot locate the helper's source: {helper.__file__!r}"
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
        imported: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                imported.append(node.module)
        offenders = [
            name
            for name in imported
            if name == "pf"
            or name.startswith("pf.")
            or name.split(".")[0] not in sys.stdlib_module_names
        ]
        assert offenders == [], (
            f"the shared bounded-run helper imports {offenders}. It must be a "
            "stdlib-only leaf: anything else makes it a cycle risk (162-30) and "
            "an import cost for every caller"
        )
