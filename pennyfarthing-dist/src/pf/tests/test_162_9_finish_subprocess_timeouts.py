"""Tests for story 162-9: every gh/git subprocess in the finish path must carry
a BOUNDED timeout, a TimeoutExpired must surface as a truthful result object
naming the command, and the post-merge status-read fallback must be LOUD.

The bug
-------
``story_finish._run`` is the single subprocess seam for the whole finish
ceremony::

    def _run(cmd, **kwargs):
        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

No ``timeout``. Every one of its ten call sites therefore blocks forever on a
hung child:

  - ``gh pr list --head`` (branch to PR resolution)
  - ``gh pr view`` (the pre-merge conflict / already-merged gate)
  - ``gh pr merge --squash --delete-branch`` (the irreversible step)
  - ``gh pr view`` again (the post-merge landed-or-not verification)
  - ``git rev-parse --verify`` x2 and ``git rev-list --count`` (the no-PR gate)
  - ``python -m pf.cli sprint epic archive`` (step 5)
  - ``git checkout`` / ``git pull`` / ``git branch -d`` (step 6 cleanup)

``gh`` hangs for entirely ordinary reasons: a stalled TLS handshake, a
credential helper prompting on a non-tty, the release-check HTTP call, a proxy
that blackholes instead of resetting. ``git pull`` hangs on an ssh host-key
prompt. The finish ceremony is not a read-only report — it wedges MID-SEQUENCE,
and where it wedges decides how much damage a Ctrl-C does:

  - wedged on ``gh pr merge``: the operator cannot tell whether the merge
    landed server-side. Killing it and re-running is the 155-29 retry the
    already-merged short-circuit exists for, but the wedge itself is silent —
    finish just sits there.
  - wedged on the POST-MERGE verification: the merge HAS landed. A Ctrl-C here
    leaves a merged PR, a deleted branch, an un-archived session and a story
    stuck ``in_review`` — and no record anywhere of why.
  - wedged on step 5/6, after the story is already ``done``: bookkeeping and
    branch cleanup, but the process never exits and step 7 never removes the
    session.

Whatever the timeout does, it must not merely convert a hang into a traceback:
``TimeoutExpired`` escaping ``finish_story`` violates the no-throw contract
(SOUL #10 / rule 6) exactly as badly as the hang, and after the merge it
strands the story with a raw stack trace instead of a report.

Folded AC — the post-merge silent degradation
---------------------------------------------
The status-transition read (near line 1066 on the branch point; locate by
pattern, this file drifted through 162-1/3/4/6) ends::

    except (FileNotFoundError, ValueError) as exc:
        return {...loud failure...}
    except Exception:
        current_status = "in_progress"

155-16 added the narrow loud arm and deliberately kept the broad fallback so an
exotic exception could not escape after the irreversible merge. But the
fallback is UNLOGGED: a PermissionError, an OSError, a ruamel internal, a
recursion error — any of them silently rewrites the story's real status to an
assumed ``in_progress``, which then drives two bridge transitions
(``in_progress`` then ``in_review``) against a sprint index we have just proven
unreadable. The operator sees a clean finish. Nothing anywhere names the error.

Acceptance criteria
-------------------
- AC1 (story YAML, verbatim): narrow or log the bare ``except Exception`` in
  the post-merge status-transition arm that degrades to ``in_progress``
  unlogged. The degradation must be LOUD — an operator-visible message that
  NAMES the caught error. (``TestPostMergeStatusFallbackIsLoud``)
- AC2 (SM technical approach): every ``_run`` subprocess call in the finish
  path carries a bounded timeout. Tiering is fine (longer for gh network calls,
  shorter for local git); unbounded is not.
  (``TestEverySubprocessCallIsBounded``, ``TestRunHelperDefaultsToBounded``)
- AC3 (SM technical approach): a ``TimeoutExpired`` surfaces as a result-object
  failure NAMING the command that timed out — never an unhandled exception,
  never a wedge. (``TestTimeoutBeforeDoneAbortsLoudly``)
- AC4 (SM technical approach, the truthfulness half): a timeout AFTER the merge
  landed must not report the merge un-happened. The step record stays truthful
  — "could not verify" is not "did not merge".
  (``TestPostMergeVerificationTimeoutStaysTruthful``)
- AC5 (TEA, no-regression): a timeout in the POST-done bookkeeping steps
  (step 5 epic archive, step 6 cleanup) is recorded, not fatal — the story is
  already ``done`` and un-reporting that would be the same lie in reverse.
  (``TestTimeoutAfterDoneIsRecordedNotFatal``)
- AC6 (TEA, over-reach guard): the timeouts must be big enough that a merely
  slow-but-working gh is not killed mid-merge, and a clean finish must still
  succeed unchanged. (``TestTimeoutValuesAreSane``,
  ``TestCleanFinishUnchanged``)

Designed interface for Dev (tests bind to behavior, not mechanism)
-----------------------------------------------------------------
Suggested shape — anything satisfying the assertions is fine:

1. Module constants, so the tiering is reviewable in one place::

       GH_TIMEOUT_S = 120.0        # network-facing gh calls
       GIT_LOCAL_TIMEOUT_S = 30.0  # rev-parse / rev-list / branch -d
       GIT_NETWORK_TIMEOUT_S = 120.0  # git pull
       SUBCOMMAND_TIMEOUT_S = 120.0   # the step-5 pf.cli invocation

2. Give ``_run`` a DEFAULT bounded timeout rather than adding a kwarg at ten
   call sites — a default makes "every call bounded" true by construction, and
   makes the eleventh call site added next sprint bounded too::

       def _run(cmd, *, timeout=DEFAULT_TIMEOUT_S, **kwargs):
           return subprocess.run(cmd, capture_output=True, text=True,
                                 timeout=timeout, **kwargs)

   An explicitly passed ``timeout`` must win (that is how the tiering is
   expressed at the call sites that want a different bound).

3. Convert the timeout into a result, not an exception. Either wrap each arm,
   or have ``_run`` return a synthetic non-zero ``CompletedProcess`` whose
   stderr names the command — note the second shape must still make the
   PRE-merge arms ABORT (a timed-out probe is not a permissive "unknown": the
   process that is hanging now will hang on the next call too), and must keep
   the post-merge verification distinguishable from "the PR is not MERGED".

4. The status-fallback: either narrow it (155-16's
   ``test_status_read_other_exception_must_not_escape`` still forbids letting
   anything escape, so a narrowed version needs a loud catch-all that RETURNS)
   or keep the degradation and make it loud — print/log the exception and
   record a step entry. Both pass here.

Poison-token discipline: this docstring names commands in prose, never in
backticked shell form that a downstream reader might execute.

RED on the branch point — 17 failing:
  - TestEverySubprocessCallIsBounded: 2
  - TestRunHelperDefaultsToBounded: 1
  - TestTimeoutValuesAreSane: 1
  - TestTimeoutBeforeDoneAbortsLoudly: 5 (parametrized call sites)
  - TestPostMergeVerificationTimeoutStaysTruthful: 2
  - TestTimeoutAfterDoneIsRecordedNotFatal: 4 (parametrized call sites)
  - TestPostMergeStatusFallbackIsLoud: 2
Green-on-arrival guard (must stay green), 1:
  - TestCleanFinishUnchanged::test_clean_pr_finish_still_succeeds

Harness reuses 162-6's stateful gh fake keyed by the cwd the call arrives with
(so the routing that story landed keeps being exercised) and its real-git-repo
fixtures, plus 162-1's ledger idea — but the fake is installed one layer LOWER,
at the subprocess module ``run`` inside story_finish, because ``timeout`` is a
kwarg of that call and a fake at the ``_run`` seam cannot see it.
"""

from __future__ import annotations

import ast
import inspect
import json
import re
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import pf.sprint.story_finish as story_finish_module
from pf.sprint.story_finish import finish_story
from pf.sprint.yaml_io import read_sprint as real_read_sprint

STORY_ID = "162-9"
STORY_BRANCH = "feat/162-9-finish-subprocess-timeouts"
PR_NUMBER = "501"

#: The real function, captured before any patching, so the fake can pass
#: non-gh commands through to genuine git in the fixture repos.
_REAL_SUBPROCESS_RUN = subprocess.run

#: A "bounded" timeout has to be a positive real number of seconds. It also has
#: to be short enough to be a bound at all: an hour-long ceiling on a gh probe
#: is a hang with extra steps.
MIN_SANE_TIMEOUT_S = 10.0
MAX_SANE_TIMEOUT_S = 3600.0
#: gh reaches the network and ``gh pr merge`` is the irreversible step — a
#: too-eager bound there converts "slow CI" into "killed mid-merge", which is
#: strictly worse than the hang this story fixes.
MIN_GH_TIMEOUT_S = 30.0


# =============================================================================
# Fixtures — a real git repo, so a git probe gets a real answer
# =============================================================================

FRONTMATTER = """\
---
story_id: "162-9"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-9: bounded timeouts on every finish subprocess
"""

SESSION_WITH_PR = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 162-9
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
- **PR:** #{PR_NUMBER} - finish subprocess timeouts
"""
)

SESSION_BRANCH_ONLY = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 162-9
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
"""
)

INDEX_YAML = """\
sprint:
  name: "Test1629"
  jira_sprint_id: 999
  jira_sprint_name: "Test1629"
  goal: every finish subprocess is bounded
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: in_progress
stories:
  - id: 162-9
    title: bounded timeouts on every finish subprocess
    points: 2
    priority: p2
    status: in_review
    workflow: tdd
    repos: proj
"""

#: One gitflow repo AT the project root, so step 6 cleanup actually runs its
#: three git commands (a trunk-based root would skip them and leave those call
#: sites unexercised).
REPOS_YAML = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""


def _git(root: Path, *args: str) -> None:
    result = _REAL_SUBPROCESS_RUN(
        ["git", *args], cwd=str(root), capture_output=True, text=True
    )
    assert result.returncode == 0, f"fixture git {' '.join(args)} failed: {result.stderr}"


def _make_project(tmp_path: Path, *, session_body: str, world: str = "merged") -> Path:
    """A project root that is also a real gitflow git repo with a bare origin.

    ``world`` describes the story branch's relationship to ``develop``:
    ``merged`` (fully landed, so the no-PR gate's accepted world) or
    ``unmerged`` (commits develop lacks).
    """
    root = tmp_path / "proj"
    sprint_dir = root / "sprint"
    sprint_dir.mkdir(parents=True)
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = root / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(session_body, encoding="utf-8")
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(REPOS_YAML, encoding="utf-8")

    (root / "README.md").write_text("# proj\n", encoding="utf-8")
    _git(root, "init", "-q", "-b", "develop")
    _git(root, "config", "user.email", "tea@162-9.test")
    _git(root, "config", "user.name", "TEA fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "init develop")

    origin = tmp_path / "origin.git"
    _REAL_SUBPROCESS_RUN(
        ["git", "init", "-q", "--bare", str(origin)],
        capture_output=True,
        text=True,
        check=True,
    )
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", "develop")

    _git(root, "checkout", "-q", "-b", STORY_BRANCH)
    (root / "work.txt").write_text("story work\n", encoding="utf-8")
    _git(root, "add", "work.txt")
    _git(root, "commit", "-q", "-m", "story work commit")
    _git(root, "push", "-q", "origin", STORY_BRANCH)
    _git(root, "checkout", "-q", "develop")
    if world == "merged":
        _git(root, "merge", "-q", "--no-ff", STORY_BRANCH, "-m", "land story work")
        _git(root, "push", "-q", "origin", "develop")
    return root


# =============================================================================
# The fake — installed at the subprocess module INSIDE story_finish, so the
# ``timeout`` kwarg of the real call is observable (162-6's gh fake, one layer
# lower).
# =============================================================================


@dataclass
class PrWorld:
    """The PR world visible from the repo."""

    pr: str | None = PR_NUMBER
    state: str = "OPEN"
    merge_lands: bool = True
    mergeable: str = "MERGEABLE"
    merge_state_status: str = "CLEAN"


@dataclass
class Ledger:
    """Every subprocess invocation story_finish made, argv plus kwargs."""

    calls: list[tuple[list[str], dict[str, Any]]] = field(default_factory=list)

    def matching(self, *needles: str) -> list[tuple[list[str], dict[str, Any]]]:
        return [
            (argv, kwargs)
            for argv, kwargs in self.calls
            if all(n in argv for n in needles)
        ]

    def gh_calls(self) -> list[tuple[list[str], dict[str, Any]]]:
        return [(a, k) for a, k in self.calls if a and a[0] == "gh"]

    def unbounded(self) -> list[list[str]]:
        return [argv for argv, kwargs in self.calls if not _is_bounded(kwargs)]


def _is_bounded(kwargs: dict[str, Any]) -> bool:
    """True when the call carries a usable positive, finite timeout."""
    timeout = kwargs.get("timeout")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        return False
    return timeout > 0 and timeout == timeout and timeout != float("inf")


#: A predicate over ``(argv, ledger)`` deciding whether THIS call should raise
#: TimeoutExpired. Takes the ledger so a predicate can depend on history (the
#: post-merge verification is "a view that happens after a merge").
TimeoutPredicate = Callable[[list[str], Ledger], bool]


def _on(*needles: str) -> TimeoutPredicate:
    return lambda argv, _ledger: all(n in argv for n in needles)


def _on_post_merge_view(argv: list[str], ledger: Ledger) -> bool:
    """Only the verification view — the one taken AFTER the merge landed."""
    if argv[:3] != ["gh", "pr", "view"]:
        return False
    return any(a[:3] == ["gh", "pr", "merge"] for a, _k in ledger.calls)


def _install_fake(
    project_root: Path,
    world: PrWorld,
    *,
    timeout_on: TimeoutPredicate | None = None,
) -> tuple[SimpleNamespace, Ledger]:
    """Build a stand-in subprocess module for story_finish.

    - gh answers come from ``world``, keyed on the cwd the call arrives with
      (162-6's contract: a call outside the story's repo sees no such PR).
    - git passes through to the real subprocess so the fixture repo's true
      state answers whatever probe shape Dev writes.
    - the step-5 pf.cli invocation is canned; the real CLI never runs.
    - ``timeout_on`` raises TimeoutExpired *after* recording the call, so the
      ledger still shows the argv (and its timeout kwarg) that hung.
    """
    root = project_root.resolve()
    live = {"state": world.state}
    ledger = Ledger()

    def fake_run(cmd: Any, **kwargs: Any) -> Any:
        argv = [str(c) for c in cmd]
        ledger.calls.append((argv, dict(kwargs)))
        if timeout_on is not None and timeout_on(argv, ledger):
            raise subprocess.TimeoutExpired(
                cmd=argv, timeout=float(kwargs.get("timeout") or 1)
            )

        cwd = kwargs.get("cwd")
        here = root if cwd in (None, "") else Path(str(cwd)).resolve()

        if argv and argv[0] == "gh":
            if here != root or world.pr is None:
                return MagicMock(
                    returncode=1,
                    stdout="",
                    stderr=f"could not resolve to a PullRequest with the number of {PR_NUMBER}",
                )
            if "list" in argv:
                return MagicMock(returncode=0, stdout=world.pr + "\n", stderr="")
            if "view" in argv:
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "state": live["state"],
                            "mergeable": world.mergeable,
                            "mergeStateStatus": world.merge_state_status,
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            if "merge" in argv:
                if world.merge_lands:
                    live["state"] = "MERGED"
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        if argv and argv[0] == sys.executable:
            return MagicMock(returncode=0, stdout="", stderr="")

        return _REAL_SUBPROCESS_RUN(cmd, **kwargs)

    fake_module = SimpleNamespace(
        **{name: getattr(subprocess, name) for name in dir(subprocess) if not name.startswith("_")}
    )
    fake_module.run = fake_run
    return fake_module, ledger


def _finish_with_fake(
    project_root: Path,
    world: PrWorld,
    *,
    timeout_on: TimeoutPredicate | None = None,
) -> tuple[dict[str, Any] | None, Ledger, BaseException | None]:
    """Run finish under the fake. Returns ``(result, ledger, escaped)``; a raw
    exception escaping ``finish_story`` is captured rather than re-raised so the
    caller can report it as the no-throw-contract violation it is."""
    fake_module, ledger = _install_fake(project_root, world, timeout_on=timeout_on)
    result: dict[str, Any] | None = None
    escaped: BaseException | None = None
    with patch.object(story_finish_module, "subprocess", fake_module):
        try:
            result = finish_story(project_root, STORY_ID)
        except BaseException as exc:  # noqa: BLE001 — the contract under test
            escaped = exc
    return result, ledger, escaped


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and str(call.args[2]) == "done":
            return True
        if str(call.kwargs.get("to_status")) == "done":
            return True
    return False


def _yaml_status(project_root: Path) -> str:
    text = (project_root / "sprint" / "epic-162.yaml").read_text(encoding="utf-8")
    match = re.search(r"status:\s*(\w+)", text.split("id: 162-9", 1)[1])
    return match.group(1) if match else ""


#: This story's own branch name contains the word "timeouts", and the branch is
#: echoed verbatim into step records. Strip it before any timeout-wording search
#: or the report of a perfectly healthy finish "mentions a timeout".
_BRANCH_NOISE = re.compile(re.escape(STORY_BRANCH))


def _report_text(result: dict[str, Any] | None) -> str:
    """Everything the operator would read out of the finish report, minus the
    branch-name noise (see ``_BRANCH_NOISE``)."""
    return _BRANCH_NOISE.sub("<branch>", json.dumps(result, default=str))


def _assert_no_escape(escaped: BaseException | None, where: str) -> None:
    assert escaped is None, (
        f"a subprocess timeout at {where} escaped finish_story as a raw "
        f"{type(escaped).__name__} ({escaped!r}) — finish must return a result "
        "object, never raise (SOUL #10 / rule 6). Converting a hang into a "
        "traceback is not a fix"
    )


def _assert_abort_invariants(
    result: dict[str, Any] | None,
    project_root: Path,
    mock_transition: MagicMock,
) -> None:
    """The loud-abort contract: nothing irreversible ran, nothing lies."""
    assert isinstance(result, dict), f"finish must return a result dict, got {result!r}"
    assert result.get("success") is False, (
        f"finish reported success after a subprocess timed out mid-ceremony: {result}"
    )
    assert (project_root / ".session" / f"{STORY_ID}-session.md").exists(), (
        "an aborted finish must keep the session so it can be retried"
    )
    assert list((project_root / "sprint" / "archive").iterdir()) == [], (
        "an aborted finish must leave no stray archive copy (155-15)"
    )
    assert not _requested_done(mock_transition), (
        "an aborted finish must never request the done transition"
    )
    assert _yaml_status(project_root) == "in_review", (
        f"an aborted finish must leave the story in_review, got {_yaml_status(project_root)!r}"
    )


#: Keys whose VALUES are the operator-facing prose of a finish report. The
#: token checks below read only these, never whole step dicts: a step entry
#: already contains words like "git_cleanup"/"archive_epics"/"branch", so
#: matching against the serialized step would let an unchanged report satisfy
#: "names the command that timed out" without saying anything.
_LOUD_KEY_RE = re.compile(r"(?i)error|warn|message|reason|timeout|timed")


def _failure_text(result: dict[str, Any] | None) -> str:
    """Only the human-readable failure/warning prose the report carries."""
    if not isinstance(result, dict):
        return ""
    chunks: list[str] = []

    def harvest(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if _LOUD_KEY_RE.search(str(key)) and not isinstance(value, (dict, list)):
                    chunks.append(str(value))
                else:
                    harvest(value)
        elif isinstance(node, list):
            for item in node:
                harvest(item)

    harvest(result)
    return _BRANCH_NOISE.sub("<branch>", "\n".join(chunks))


def _assert_names_timeout_and_command(
    result: dict[str, Any] | None, tokens: tuple[str, ...], where: str
) -> None:
    """The report's own prose must say a timeout happened AND name the command."""
    text = _failure_text(result)
    assert re.search(r"(?i)tim(?:e|ed)\s?out|timeout|timed-out", text), (
        f"the {where} timeout is not described as a timeout anywhere in the "
        f"report — an operator cannot tell a hung subprocess from any other "
        f"failure: {text}"
    )
    missing = [t for t in tokens if t not in text]
    assert not missing, (
        f"the {where} timeout report does not name the command that timed out "
        f"(missing {missing}) — 'something timed out' is not actionable: {text}"
    )


# =============================================================================
# AC2 — every subprocess call in the finish path is bounded
# =============================================================================


class TestEverySubprocessCallIsBounded:
    """The sweep. Two worlds between them exercise all ten call sites; not one
    may reach the OS without a timeout. This is the whole point of the story:
    an unbounded call is a wedge waiting for a bad network day, and the eleventh
    call site added next sprint must inherit the bound.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_pr_merge_world_bounds_every_call(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: the PR arm — pre-merge view, the merge itself, the post-merge
        verification view, the step-5 epic archive and step 6's three cleanup
        commands. On the branch point every one of them goes out with no
        ``timeout`` kwarg at all.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_fake(project, PrWorld())

        _assert_no_escape(escaped, "the PR merge path")
        assert result is not None and result.get("success") is True, (
            f"precondition: the clean PR world must finish, got {result}"
        )
        assert ledger.matching("gh", "merge"), "precondition: the merge ran"
        assert ledger.matching("git", "checkout"), "precondition: step 6 cleanup ran"
        assert len(ledger.calls) >= 6, (
            f"precondition: the PR arm should exercise several call sites, saw "
            f"{[a for a, _ in ledger.calls]}"
        )
        assert ledger.unbounded() == [], (
            "these finish subprocesses ran with NO timeout — each one can wedge "
            f"the ceremony indefinitely: {ledger.unbounded()}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_branch_verification_world_bounds_every_call(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: the no-PR arm — the branch-to-PR resolution probe plus the two
        ref-existence probes and the commit count of the 155-34/162-4 gate.
        Local git is not exempt: a git probe blocks on a stale index.lock or an
        ssh prompt just as happily as gh blocks on the network.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_BRANCH_ONLY)

        result, ledger, escaped = _finish_with_fake(project, PrWorld(pr=None))

        _assert_no_escape(escaped, "the no-PR verification path")
        assert result is not None and result.get("success") is True, (
            f"precondition: a verifiably-merged branch with no PR must finish: {result}"
        )
        assert ledger.matching("git", "rev-list"), (
            "precondition: the no-PR merge-state gate ran its commit count"
        )
        assert ledger.unbounded() == [], (
            "these finish subprocesses ran with NO timeout: "
            f"{ledger.unbounded()}"
        )


class TestRunHelperDefaultsToBounded:
    """The seam itself. A default on the helper is what makes "every call
    bounded" a property rather than a ten-site audit — and an explicitly passed
    timeout must still win, because that is how per-call tiering is expressed.
    """

    def test_run_supplies_a_bounded_timeout_and_honors_an_explicit_one(self) -> None:
        """RED: the helper passes no timeout, so this reads ``None``."""
        seen: list[dict[str, Any]] = []

        def spy(cmd: Any, **kwargs: Any) -> Any:
            seen.append(dict(kwargs))
            return MagicMock(returncode=0, stdout="", stderr="")

        fake_module = SimpleNamespace(
            **{n: getattr(subprocess, n) for n in dir(subprocess) if not n.startswith("_")}
        )
        fake_module.run = spy
        with patch.object(story_finish_module, "subprocess", fake_module):
            story_finish_module._run(["git", "status", "--porcelain"])
            story_finish_module._run(["git", "status", "--porcelain"], timeout=7)

        assert len(seen) == 2, f"the spy saw {len(seen)} calls, expected 2"
        assert _is_bounded(seen[0]), (
            "the default _run has no bounded timeout, so every call site that "
            f"does not opt in can hang forever: {seen[0]}"
        )
        assert seen[1].get("timeout") == 7, (
            "an explicitly passed timeout must reach subprocess unchanged — "
            f"per-call tiering depends on it: {seen[1]}"
        )


class TestTimeoutValuesAreSane:
    """Over-reach guard on the values themselves. A one-second bound on the
    irreversible merge trades a rare hang for a routine mid-merge kill; an
    hour-long bound is not a bound. Tiering between call sites is welcome —
    this only pins the envelope.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_bounds_are_neither_trigger_happy_nor_useless(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (no timeouts exist yet, so the bounded-call precondition fails)."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        _result, ledger, escaped = _finish_with_fake(project, PrWorld())

        _assert_no_escape(escaped, "the PR merge path")
        bounded = [(argv, kw) for argv, kw in ledger.calls if _is_bounded(kw)]
        assert len(bounded) == len(ledger.calls) and bounded, (
            f"precondition: every call must be bounded first: {ledger.unbounded()}"
        )
        too_tight = [
            (argv, kw["timeout"]) for argv, kw in bounded if kw["timeout"] < MIN_SANE_TIMEOUT_S
        ]
        assert too_tight == [], (
            f"these bounds are tight enough to kill a working-but-slow command "
            f"(< {MIN_SANE_TIMEOUT_S}s): {too_tight}"
        )
        too_loose = [
            (argv, kw["timeout"]) for argv, kw in bounded if kw["timeout"] > MAX_SANE_TIMEOUT_S
        ]
        assert too_loose == [], (
            f"these bounds are so large they are not bounds (> {MAX_SANE_TIMEOUT_S}s): "
            f"{too_loose}"
        )
        gh_too_tight = [
            (argv, kw["timeout"])
            for argv, kw in bounded
            if argv and argv[0] == "gh" and kw["timeout"] < MIN_GH_TIMEOUT_S
        ]
        assert gh_too_tight == [], (
            f"gh reaches the network and one of these calls is the irreversible "
            f"merge — a bound under {MIN_GH_TIMEOUT_S}s converts slow CI into a "
            f"killed merge: {gh_too_tight}"
        )


# =============================================================================
# AC3 — a timeout BEFORE the story goes done aborts loudly, naming the command
# =============================================================================


class TestTimeoutBeforeDoneAbortsLoudly:
    """Every pre-done call site, one at a time. A timed-out probe is NOT the
    permissive "unknown" the gh probes degrade to: the process that just hung
    will hang again, and degrading a hung probe into the no-PR arm (or into a
    merge attempt) is how a wedge becomes a silent wrong answer.
    """

    CASES: list[tuple[str, str, TimeoutPredicate, tuple[str, ...]]] = [
        # (id, session shape, which call hangs, tokens the report must name)
        ("gh-pr-list", "branch-only", _on("gh", "list"), ("gh", "list")),
        ("gh-pr-view-gate", "with-pr", _on("gh", "view"), ("gh", "view")),
        ("gh-pr-merge", "with-pr", _on("gh", "merge"), ("gh", "merge")),
        ("git-rev-parse", "no-pr", _on("git", "rev-parse"), ("git", "rev-parse")),
        ("git-rev-list", "no-pr", _on("git", "rev-list"), ("git", "rev-list")),
    ]

    @pytest.mark.parametrize(
        "case_id,shape,predicate,tokens",
        CASES,
        ids=[c[0] for c in CASES],
    )
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_pre_done_timeout_returns_truthful_failure(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
        case_id: str,
        shape: str,
        predicate: TimeoutPredicate,
        tokens: tuple[str, ...],
    ) -> None:
        """RED on all five: TimeoutExpired propagates straight out of
        ``finish_story`` today (nothing catches it anywhere in the module), so
        the CLI boundary gets a raw traceback instead of a report — and for the
        merge case, a traceback whose reader cannot tell whether the merge
        landed.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        session_body = SESSION_WITH_PR if shape == "with-pr" else SESSION_BRANCH_ONLY
        world = PrWorld(pr=None) if shape == "no-pr" else PrWorld()
        project = _make_project(tmp_path, session_body=session_body)

        result, ledger, escaped = _finish_with_fake(project, world, timeout_on=predicate)

        _assert_no_escape(escaped, case_id)
        assert ledger.matching(*tokens), (
            f"precondition: the {case_id} call site was never reached, so this "
            f"test proves nothing: {[a for a, _ in ledger.calls]}"
        )
        _assert_abort_invariants(result, project, mock_transition)
        _assert_names_timeout_and_command(result, tokens, case_id)


# =============================================================================
# AC4 — a timeout AFTER the merge landed must not un-report the merge
# =============================================================================


class TestPostMergeVerificationTimeoutStaysTruthful:
    """The merge has landed. The verification view then hangs. Finish must
    refuse to mark the story done (it genuinely cannot confirm), but the report
    must say "could not verify" — not "the PR is not MERGED", which is a
    statement about the world that finish has no evidence for and which is in
    fact false. This is the 155/162 truthfulness contract at its sharpest: the
    operator reads this report to decide whether to re-run, revert, or merge by
    hand.
    """

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        return _make_project(tmp_path, session_body=SESSION_WITH_PR)

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_verification_timeout_aborts_without_denying_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED: today the TimeoutExpired escapes. The naive fix — treat a timed
        out verification as ``_pr_view`` already treats an error, i.e. return
        None — reaches the existing abort whose message flatly asserts the PR
        is not in the MERGED state. It is. That message would send an operator
        to re-merge (or worse, to revert) a PR that landed cleanly.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}

        result, ledger, escaped = _finish_with_fake(
            project, PrWorld(), timeout_on=_on_post_merge_view
        )

        _assert_no_escape(escaped, "the post-merge verification")
        assert ledger.matching("gh", "merge"), (
            "precondition: the merge must have run before the verification hung"
        )
        _assert_abort_invariants(result, project, mock_transition)
        _assert_names_timeout_and_command(
            result, ("gh", "view"), "post-merge verification"
        )
        text = _report_text(result)
        assert not re.search(r"(?i)is\s+not\s+(?:in\s+)?MERGED", text), (
            "the report claims the PR is not MERGED. It IS merged — the "
            "verification timed out. Asserting the un-observed state as fact is "
            f"exactly the lie epic 162 exists to remove: {text}"
        )
        assert not re.search(r"(?i)unmerged code", text), (
            "the report blames unmerged code for a failure that was a timed-out "
            f"verification of a merge that landed: {text}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step_two_record_still_reports_the_merge_ran(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED: the step ledger is the artifact a retry (and 155-29's
        already-merged short-circuit) is reasoned about from. A step-2 entry
        that records only a failure, with no trace that the merge command itself
        completed, tells the next operator the merge never happened.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}

        result, _ledger, escaped = _finish_with_fake(
            project, PrWorld(), timeout_on=_on_post_merge_view
        )

        _assert_no_escape(escaped, "the post-merge verification")
        assert isinstance(result, dict), result
        step_two = [s for s in result.get("steps", []) if str(s.get("step")) == "2"]
        assert step_two, (
            f"the merge step left no record at all in the report: {result.get('steps')}"
        )
        record = json.dumps(step_two, default=str)
        assert PR_NUMBER in record, (
            f"the step-2 record must name the PR the ceremony acted on: {record}"
        )
        assert re.search(r"(?i)tim(?:e|ed)\s?out|timeout|verif", record), (
            "the step-2 record does not say the verification is what failed, so "
            f"it reads as a failed merge: {record}"
        )
        assert not any(s.get("merged") is False for s in step_two), (
            f"the step record asserts merged=False for a merge that landed: {record}"
        )


# =============================================================================
# AC5 — a timeout AFTER the story is done is recorded, not fatal
# =============================================================================


class TestTimeoutAfterDoneIsRecordedNotFatal:
    """Step 5 (epic archive) and step 6 (branch cleanup) run after the merge is
    verified, the story is ``done`` and the YAML is written. A timeout there is
    bookkeeping: un-reporting a story that genuinely shipped is the same class
    of lie as reporting one that did not. Record it, keep going, still remove
    the session — otherwise every hung ``git pull`` leaves a done story with a
    stale session that the next finish will trip over.
    """

    CASES: list[tuple[str, TimeoutPredicate, tuple[str, ...]]] = [
        ("epic-archive", _on("epic", "archive"), ("epic", "archive")),
        ("git-checkout", _on("git", "checkout"), ("git", "checkout")),
        ("git-pull", _on("git", "pull"), ("git", "pull")),
        ("git-branch-delete", _on("git", "branch"), ("git", "branch")),
    ]

    @pytest.mark.parametrize(
        "case_id,predicate,tokens", CASES, ids=[c[0] for c in CASES]
    )
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_post_done_timeout_is_visible_but_not_fatal(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
        case_id: str,
        predicate: TimeoutPredicate,
        tokens: tuple[str, ...],
    ) -> None:
        """RED on all four: TimeoutExpired escapes finish_story, so a hung
        cleanup command turns a completed story into a traceback with the
        session still on disk.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_fake(
            project, PrWorld(), timeout_on=predicate
        )

        _assert_no_escape(escaped, case_id)
        assert ledger.matching(*tokens), (
            f"precondition: the {case_id} call site was never reached: "
            f"{[a for a, _ in ledger.calls]}"
        )
        assert isinstance(result, dict), result
        assert result.get("success") is True, (
            f"the merge landed, the story was transitioned done and the YAML "
            f"written — a hung {case_id} must not un-report that: {result}"
        )
        assert _requested_done(mock_transition), (
            "precondition: the story reached the done transition"
        )
        _assert_names_timeout_and_command(result, tokens, case_id)
        assert not (project / ".session" / f"{STORY_ID}-session.md").exists(), (
            f"a completed finish must still remove the session after a {case_id} "
            "timeout, or the next run trips over a stale one"
        )


# =============================================================================
# AC1 (folded) — the post-merge status-read fallback must be LOUD
# =============================================================================


def _boom_on_call(n: int, exc: Exception) -> Callable[[Path], Any]:
    """Pass every ``read_sprint`` through except call ``n``, which raises.

    Targeting exactly one call matters: call 1 is the primary validation read
    (must succeed to reach the seam), call 2 is the status-transition read under
    test, and call 3 is the step-4b bookkeeping re-read whose own broad catch
    already records its failure. Booming from call 2 onward would let step 4b's
    existing record satisfy a loudness assertion the status arm never earned.
    """
    state = {"n": 0}

    def fake(path: Path) -> Any:
        state["n"] += 1
        if state["n"] == n:
            raise exc
        return real_read_sprint(path)

    return fake


def _find_status_read_try() -> ast.Try | None:
    """The try whose body assigns ``current_status`` — the status-transition
    read block (same locator as 155-16, which is why it is duplicated rather
    than imported: a shared locator would drift with either file)."""
    tree = ast.parse(inspect.getsource(story_finish_module))
    fn = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "finish_story"
    )
    for node in ast.walk(fn):
        if not isinstance(node, ast.Try):
            continue
        for stmt in node.body:
            if isinstance(stmt, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "current_status" for t in stmt.targets
            ):
                return node
    return None


def _broad_handlers(node: ast.Try) -> list[ast.ExceptHandler]:
    """Handlers that catch everything: bare, or ``Exception``/``BaseException``."""
    out = []
    for handler in node.handlers:
        if handler.type is None:
            out.append(handler)
        elif ast.unparse(handler.type) in ("Exception", "BaseException"):
            out.append(handler)
    return out


class TestPostMergeStatusFallbackIsLoud:
    """AC1, the folded finding. The broad fallback on the status-transition read
    fires AFTER the irreversible merge and silently rewrites the story's status
    to an assumed ``in_progress`` — which then drives two bridge transitions
    against a sprint index just proven unreadable. 155-16 kept the fallback
    deliberately (nothing may escape post-merge) and pinned only that it does
    not raise. Nobody pinned that it says anything.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_degradation_names_the_caught_error_somewhere_operator_visible(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
        capsys: pytest.CaptureFixture[str],
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """RED: a PermissionError at the status read is swallowed whole today —
        no step entry, no log line, no printed warning, and the finish reports a
        clean success. Any loud channel satisfies this (a printed warning, a
        logged one, a recorded step, or a narrowed loud failure result); silence
        does not.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)
        needle = "sprint index unreadable mid-finish"

        fake_module, _ledger = _install_fake(project, PrWorld())
        with (
            patch.object(story_finish_module, "subprocess", fake_module),
            patch(
                "pf.sprint.story_finish.read_sprint",
                new=_boom_on_call(2, PermissionError(needle)),
            ),
        ):
            try:
                result = finish_story(project, STORY_ID)
            except Exception as escaped:  # noqa: BLE001 — 155-16's contract holds
                pytest.fail(
                    f"the status-read fallback let {escaped!r} escape finish_story "
                    "after the irreversible merge — making it loud must not make "
                    "it throw (155-16)"
                )

        captured = capsys.readouterr()
        channels = {
            "result": _report_text(result),
            "stdout": captured.out,
            "stderr": captured.err,
            "log": caplog.text,
        }
        loud = {name: text for name, text in channels.items() if needle in text}
        assert loud, (
            "the status-read fallback degraded the story's status to an assumed "
            f"in_progress and named the caught error ({needle!r}) NOWHERE — not "
            "in the report, not on stdout/stderr, not in the log. The operator "
            f"sees a clean finish over a sprint index we know is broken: {channels}"
        )
        assert re.search(
            r"(?i)permissionerror|could not|unable|fail|warn|error",
            "\n".join(loud.values()),
        ), (
            "the error text appears but nothing marks it as a problem — a bare "
            f"echo of the exception is not a warning: {loud}"
        )

    def test_broad_status_read_handler_does_more_than_assign_a_default(self) -> None:
        """RED structural pin: the broad handler's body is exactly one
        assignment today. Whatever shape Dev chooses — log, print, record a
        step, or return a failure result — the handler must DO something with
        the exception it caught. A handler that only assigns a default is the
        silent swallow this AC names.

        A Dev who narrows the fallback away entirely also passes here (no broad
        handler to check); 155-16's no-escape test remains the guard on that
        route.
        """
        status_try = _find_status_read_try()
        assert status_try is not None, (
            "could not locate the status-transition read try-block in "
            "finish_story (body assigning current_status) — if that block moved, "
            "update this locator"
        )
        for handler in _broad_handlers(status_try):
            source = ast.unparse(ast.Module(body=handler.body, type_ignores=[]))
            assert handler.name is not None, (
                "the broad status-read handler does not even bind the exception, "
                "so it cannot name it: it can only guess a default. Bind it and "
                f"report it: {source}"
            )
            has_effect = any(
                isinstance(node, (ast.Call, ast.Return, ast.Raise))
                for stmt in handler.body
                for node in ast.walk(stmt)
            )
            assert has_effect, (
                "the broad status-read handler only assigns a default — it "
                "swallows the exception whole, after the irreversible merge. It "
                f"must log, record, or return: {source}"
            )


# =============================================================================
# AC6 — over-reach guard: the clean path is unchanged
# =============================================================================


class TestCleanFinishUnchanged:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_pr_finish_still_succeeds(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """GREEN on arrival, and it must stay green: adding timeouts must not
        make a healthy finish fail, and must not report a timeout that did not
        happen. Nothing here hangs.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_WITH_PR)

        result, ledger, escaped = _finish_with_fake(project, PrWorld())

        _assert_no_escape(escaped, "a clean finish")
        assert result is not None and result.get("success") is True, (
            f"a clean PR finish must still succeed: {result}"
        )
        assert _requested_done(mock_transition), "a verified merge must go done"
        assert not re.search(r"(?i)tim(?:e|ed)\s?out|timeout", _failure_text(result)), (
            f"nothing timed out, so nothing may report a timeout: {result}"
        )
        assert not (project / ".session" / f"{STORY_ID}-session.md").exists(), (
            "a clean finish removes the session (step 7)"
        )
        assert (project / "sprint" / "archive" / f"{STORY_ID}-session.md").exists(), (
            "a clean finish archives the session (step 1)"
        )
        assert ledger.matching("gh", "merge"), "the load-bearing merge ran"
