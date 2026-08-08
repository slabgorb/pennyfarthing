"""Tests for story 162-48: the four 162-25 follow-ups.

Story 162-4 and 162-25 hardened every *read-only* ref probe in
``story_finish``: full ref paths so git cannot flag-parse or DWIM a branch
value, and ``check-ref-format`` validation so a ``gitrevisions(7)`` operator
cannot be classified. Step 6 — ``_git_cleanup`` — was never swept. It is the
one place in the file that *mutates* a working tree, and it does so from the
same operator-edited string, with a bare argv.

Four items, each with its own AC block below. All four were named in the
story title; the acceptance criteria here are TEA's (the 155-13 precedent:
the test docstring is the AC record, because the sprint YAML carries only the
title).

Ground truth for every claim below was probed against the real git binary
(2.54.0) while writing these tests; the probes are re-asserted in-test as
fixture premises so a future git that changes its grammar fails loudly here
instead of making a test pass for the wrong reason.

-----------------------------------------------------------------------------
Item 1 — the bare base argv in ``_git_cleanup`` (story_finish.py:815-816)
-----------------------------------------------------------------------------
``base = repo_config.default_branch`` — a hand-edited ``.pennyfarthing/
repos.yaml`` value — reaches git as::

    ["git", "checkout", base]              # argv position 2, no `--`
    ["git", "pull", "origin", base]        # argv position 3, bare ref

The ``git branch -d -- <branch>`` line right below it already carries ``--``.
These two do not. Three distinct consequences, all verified against real git:

- **Flag position.** ``default_branch: -f`` makes the first command
  ``git checkout -f``, which *silently discards every uncommitted
  modification in the story's repo* (verified: a modified tracked file was
  reverted, rc=0, no output). ``refs/heads/-f`` is a legal refname, so
  162-25's validator would accept it even if cleanup called it — which it
  does not.
- **Pathspec DWIM.** ``git checkout <name>`` with no ``--`` falls back to
  pathspec mode when no such branch exists. Verified: with a tracked,
  locally-modified ``a.txt`` and no branch of that name,
  ``git checkout a.txt`` answered rc=0 "Updated 1 path from the index" and
  **discarded the edit**. ``git checkout <name> --`` closes this and still
  switches branches (verified).
- **The chain never stops on failure.** The loop breaks only on
  ``_timed_out``. A checkout that fails outright (rc=1, "pathspec did not
  match") is not recorded at all, and ``git pull`` + ``git branch -d`` run on
  regardless — against whatever branch is still checked out. The returned
  entry carries no ``warning``, so the finish report says cleanup ran clean.

- AC-1a: an unusable ``base`` emits **zero** git subprocesses from cleanup,
  and the returned entry carries a ``warning`` that quotes the value and says
  it is not usable. "Unusable" is the union of 162-25's grammar (refname-
  illegal values) with the values git itself will not accept as a branch
  (item 4's family) and with dash-leading values — a dash-leading name is a
  legal *ref* that 162-4 deliberately keeps classifiable, but there is no
  ``git checkout`` argv that reaches it safely, so cleanup must refuse it
  rather than run it.
- AC-1b: cleanup never discards uncommitted work. A ``base`` that names a
  tracked path leaves the working tree untouched.
- AC-1c: for a good ``base``, the checkout argv closes pathspec DWIM (a
  ``--`` separator) and the pull argv does not pass the base as a bare
  DWIM-able rev.
- AC-1d: a ``base`` that is a legal branch name but does not exist in the
  repo stops the chain: no pull, no branch delete, and a ``warning`` naming
  the base. Reporting "cleanup ran" for three commands that could not have
  worked is the same untruth this epic exists to kill.

-----------------------------------------------------------------------------
Item 2 — the hardcoded ``origin`` remote (third deferral)
-----------------------------------------------------------------------------
Deferred from 162-4 and again from 162-25 ("Note probe candidates hardcode
the origin remote — decide whether to honor configured remote names in the
same pass"). Two call sites: ``_branch_merge_state``'s remote-tracking
candidates (``refs/remotes/origin/<name>``, for both branch and base) and
``_git_cleanup``'s ``git pull origin <base>``.

The consequence is not cosmetic. In a repo whose remote is named anything
else, ``refs/remotes/origin/<base>`` does not exist, so the base arm falls
back to the possibly-stale ``refs/heads/<base>`` — and a branch whose work
landed upstream reads ``unmerged``. The no-PR gate's ``unknown``/``unmerged``
arm aborts loudly, so this is a false ABORT rather than a false done; it is
still finish lying about verified state, and ``git pull origin <base>`` fails
outright.

``RepoConfig`` already has a ``remote`` field, but it holds the *clone URL*
(``git@github.com:org/repo.git``), not a remote NAME — so this needs its own
field rather than a reinterpretation of that one.

- AC-2a: ``RepoConfig`` carries a remote NAME, defaulting to ``origin``,
  parsed from ``repos.yaml``; ``upstream_ref`` honors it.
- AC-2b: ``_git_cleanup`` pulls from the configured remote.
- AC-2c: ``_branch_merge_state`` probes the configured remote, and a branch
  merged only on a non-``origin`` remote reads ``merged``.
- AC-2d: the finish path passes the story repo's configured remote through
  (the same wiring ``base`` got in 162-6 — a de-hardcoded helper nobody calls
  with the value is still hardcoded in practice).
- AC-2e: an operator-configured remote name is a NEW argv position, so it is
  validated like every other one: a flag-shaped or refname-illegal remote
  name emits no git at all. An empty/unset remote name means ``origin``.

-----------------------------------------------------------------------------
Item 3 — the timeout-arm test was a shallow mock
-----------------------------------------------------------------------------
``test_162_25_revision_operator_branch_values.py::
TestTimedOutValidationIsNotMerged`` patched ``story_finish._run`` to return a
hand-built ``_TimedOutProcess`` and accepted ``state in {"timeout",
"unknown"}``. That mock *is* the thing under test: it asserts nothing about
``_run``'s real ``TimeoutExpired`` -> ``_TimedOutProcess`` conversion, and the
``or unknown`` escape hatch means a timeout misrouted into the permissive
unknown arm passes.

Hardened here by patching at the ``subprocess.run`` boundary — a real
``TimeoutExpired`` raised by the real syscall wrapper — and asserting the
state is ``timeout`` exactly. The ``_branch_merge_state`` half is a
green-on-arrival regression pin (the behavior is already right; the test was
not). The ``_git_cleanup`` half is RED: cleanup has no validation probe to
time out, so a hung cleanup is discovered by *attempting the mutating
checkout first*.

- AC-3a: with ``subprocess.run`` raising ``TimeoutExpired``,
  ``_branch_merge_state`` returns exactly ``state == "timeout"``, with a
  reason and no ``count``.
- AC-3b: with ``subprocess.run`` raising ``TimeoutExpired``, ``_git_cleanup``
  attempts **no** mutating command (checkout / pull / branch -d) and reports
  the timeout.

-----------------------------------------------------------------------------
Item 4 — refname-legal values that are not branches
-----------------------------------------------------------------------------
162-25 validates with ``git check-ref-format refs/heads/<value>`` (refname
mode, deliberately not ``--branch``: ``--branch`` refuses the dash-leading
names 162-4 wants classified, and it DWIM-expands ``@{-N}``). Refname mode
accepts three families that are not branch names. Probed:

    git check-ref-format refs/heads/HEAD                    -> rc=0
    git check-ref-format --branch HEAD                      -> rc=128
        ("fatal: 'HEAD' is not a valid branch name"; `git branch HEAD` refuses)
    git check-ref-format refs/heads/@                        -> rc=0
        (`@` is gitrevisions' alias for HEAD)
    git check-ref-format refs/heads/refs/heads/feat          -> rc=0
    git check-ref-format refs/heads/refs/remotes/origin/feat -> rc=0

None of the three resolves once prefixed (``rev-parse --verify --quiet
refs/heads/HEAD`` -> rc=1), so today each one falls all the way through to
``"reason": "branch not found locally or on origin"`` — the exact wrong
diagnosis 162-25's AC-2 exists to prevent. It sends the operator hunting a
deleted branch when the fix is a malformed field (``HEAD``/``@`` written into
the session's branch field) or a field that carries its own ``refs/`` prefix.

In cleanup the same values are worse than imprecise: ``git checkout HEAD``
and ``git checkout @`` succeed as no-ops without leaving the feature branch,
so ``git pull <remote> HEAD`` then pulls the remote's default branch **onto
the feature branch**, and the report says cleanup ran.

- AC-4a: ``HEAD``, ``@`` and self-prefixed (``refs/...``) values are refused
  by ``_branch_merge_state`` with 162-25's refusal contract: ``unknown``, no
  ``count``, a reason quoting the value and naming it invalid — and NOT the
  branch-not-found prose.
- AC-4b: the diagnosis is *precise*, not merely non-generic: the three
  families do not share one reason string. An operator must be able to tell
  "you wrote HEAD" from "you pasted a full ref path".
- AC-4c: no ``rev-parse``/``rev-list`` probe is emitted for them (162-25's
  AC-3, extended to the newly refused family).
- AC-4d: a well-formed name that simply does not exist keeps the
  branch-not-found diagnosis. The new refusal must not swallow it.

-----------------------------------------------------------------------------
Designed interface for Dev (behavior; mechanism is Dev's call)
-----------------------------------------------------------------------------
1. ``pf.git.repos.RepoConfig`` gains ``remote_name: str = "origin"``, parsed
   from the ``remote_name`` key in ``repos.yaml``. The existing ``remote``
   field keeps its meaning (clone URL). ``upstream_ref`` becomes
   ``f"{self.remote_name or 'origin'}/{self.default_branch}"``.

2. ``_branch_merge_state(repo_path, branch, base=None, *, remote=None)`` —
   new keyword-only ``remote``. ``None``/empty means ``"origin"``. Every
   remote-tracking candidate becomes ``refs/remotes/{remote}/{name}``. The
   return contract is unchanged.

3. The finish path's call site passes ``remote=repo_config.remote_name if
   repo_config else None``, exactly as it already passes ``base``.

4. One shared validator, used by both functions, refuses:
     - anything ``git check-ref-format refs/heads/<value>`` rejects (today's
       rule, unchanged);
     - ``HEAD`` and ``@`` (git's own non-branch values);
     - any value whose first path component is ``refs``.
   ``_git_cleanup`` additionally refuses a dash-leading ``base`` and validates
   the remote name the same way. The refusal reason quotes the value verbatim
   (never an internally prefixed form), says it is not a valid branch name,
   and distinguishes the family it belongs to.

5. ``_git_cleanup``, on any refusal or validation timeout, emits **no** git
   subprocess and returns a single entry::

       {"step": 6, "action": "git_cleanup", "branch": branch,
        "warning": "<reason quoting the offending value>"}

   For an accepted base it additionally confirms the base branch exists
   before checking it out, and stops the chain (no pull, no delete) with a
   ``warning`` when it does not. The checkout argv carries ``--``; the pull
   argv carries the base as a fully-qualified ``refs/heads/<base>`` (or after
   a ``--``), never a bare rev.

-----------------------------------------------------------------------------
RED on this branch
-----------------------------------------------------------------------------
Green-on-arrival by design (regression pins, all non-vacuous):
  - ``TestTimeoutIsPinnedAtTheSubprocessBoundary::
    test_branch_merge_state_reports_timeout_exactly`` (item 3's hardened
    replacement — the behavior is already correct)
  - ``TestOrdinaryValuesAreUnaffected`` (the AC-4d / AC-1c controls)
Everything else fails on an assertion, not an import or a stray exception.
"""

import dataclasses
import inspect
import re
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.git.repos import RepoConfig, _parse_repo_entry, load_repos_config
from pf.sprint import story_finish
from pf.sprint.story_finish import _branch_merge_state, _git_cleanup, finish_story

BASE = "develop"
#: Three commits ahead of the base, never merged.
AHEAD = "feat/162-48-ahead"
#: Merged into the base and pushed.
LANDED = "feat/162-48-landed"
#: A tracked file whose NAME is used as a ``default_branch`` — the pathspec
#: DWIM vector. Committed on the base branch so `git checkout notes.txt` has
#: something in the index to overwrite the working copy with.
TRACKED_PATH = "notes.txt"

REPOS_YAML_ORIGIN = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""


# =============================================================================
# Fixtures — real git repos. Every claim in this file is about git's own argv
# and rev grammar; a mock that answers rc=0 to whatever it is handed would
# prove nothing about either.
# =============================================================================


def _git(root: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True)
    assert result.returncode == 0, (
        f"fixture git {' '.join(args)} failed rc={result.returncode}: {result.stderr}"
    )
    return result.stdout


def _commit(root: Path, name: str) -> None:
    (root / f"{name.replace('/', '_')}.txt").write_text(f"{name}\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", name)


def _init_identity(root: Path) -> None:
    _git(root, "config", "user.email", "tea@162-48.test")
    _git(root, "config", "user.name", "TEA fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "config", "core.hooksPath", str(root / ".git" / "hooks"))


def _bare(tmp_path: Path, name: str) -> Path:
    path = tmp_path / f"{name}.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(path)], capture_output=True, text=True, check=True
    )
    return path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """A gitflow repo on ``develop`` with a remote named ``origin``.

    Contents: ``develop`` (two commits plus a tracked ``notes.txt``, then a
    no-ff merge of *LANDED*, pushed); *AHEAD* three commits ahead, never
    merged; *LANDED* merged.
    """
    root = tmp_path / "proj"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    (root / ".pennyfarthing" / "repos.yaml").write_text(REPOS_YAML_ORIGIN, encoding="utf-8")

    _git(root, "init", "-q", "-b", BASE)
    _init_identity(root)
    _commit(root, "d1")
    (root / TRACKED_PATH).write_text("committed notes\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "add notes")

    origin = _bare(tmp_path, "origin")
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", BASE)

    _git(root, "checkout", "-q", "-b", AHEAD)
    for i in (1, 2, 3):
        _commit(root, f"{AHEAD}-c{i}")
    _git(root, "checkout", "-q", BASE)

    _git(root, "checkout", "-q", "-b", LANDED)
    _commit(root, LANDED)
    _git(root, "checkout", "-q", BASE)
    _git(root, "merge", "-q", "--no-ff", "-m", f"merge {LANDED}", LANDED)
    _git(root, "push", "-q", "origin", BASE)
    return root


@pytest.fixture
def upstream_project(tmp_path: Path) -> Path:
    """A repo whose ONLY remote is named ``upstream``, where *LANDED*'s work
    exists on ``upstream/develop`` but not yet on the local ``develop``.

    This is the shape that makes the hardcoded ``origin`` load-bearing:
    ``refs/remotes/origin/develop`` does not exist here at all, so the base
    arm falls back to the stale local ``refs/heads/develop`` and a landed
    branch reads ``unmerged``.
    """
    root = tmp_path / "upstream-proj"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    (root / ".pennyfarthing" / "repos.yaml").write_text(
        REPOS_YAML_ORIGIN.replace(
            "    branch_strategy: gitflow\n",
            "    branch_strategy: gitflow\n    remote_name: upstream\n",
        ),
        encoding="utf-8",
    )

    _git(root, "init", "-q", "-b", BASE)
    _init_identity(root)
    _commit(root, "u1")

    remote = _bare(tmp_path, "upstream")
    _git(root, "remote", "add", "upstream", str(remote))
    _git(root, "push", "-q", "upstream", BASE)
    stale = _git(root, "rev-parse", "HEAD").strip()

    _git(root, "checkout", "-q", "-b", LANDED)
    _commit(root, LANDED)
    _git(root, "checkout", "-q", BASE)
    _git(root, "merge", "-q", "--no-ff", "-m", f"merge {LANDED}", LANDED)
    _git(root, "push", "-q", "upstream", BASE)
    # Rewind the LOCAL base so only the remote-tracking ref knows about the
    # merge — the "landed upstream, stale locally" world.
    _git(root, "reset", "-q", "--hard", stale)
    _git(root, "fetch", "-q", "upstream")
    return root


def _cfg(
    *,
    default_branch: str = BASE,
    strategy: str = "gitflow",
    remote_name: str | None = None,
) -> RepoConfig:
    """A minimal gitflow ``RepoConfig``.

    ``remote_name`` is passed only when requested, so the tests that do not
    care about item 2 keep working before Dev adds the field. When it IS
    requested and the field does not exist yet, fail with the interface
    requirement rather than a bare ``TypeError`` — the RED must name the
    missing behavior, not the plumbing accident.
    """
    kwargs: dict[str, Any] = {
        "name": "proj",
        "path": ".",
        "repo_type": "framework",
        "default_branch": default_branch,
        "branch_strategy": strategy,
    }
    if remote_name is not None:
        _require_remote_name_field()
        kwargs["remote_name"] = remote_name
    return RepoConfig(**kwargs)


def _require_remote_name_field() -> None:
    names = {f.name for f in dataclasses.fields(RepoConfig)}
    if "remote_name" not in names:
        pytest.fail(
            "RepoConfig needs a `remote_name` field (default 'origin', parsed "
            "from the repos.yaml `remote_name` key) so the finish path can stop "
            f"hardcoding the origin remote. Present fields: {sorted(names)}"
        )


def _require_remote_keyword() -> None:
    params = inspect.signature(_branch_merge_state).parameters
    if "remote" not in params:
        pytest.fail(
            "_branch_merge_state needs a keyword-only `remote` parameter "
            "(None/empty meaning 'origin') so its remote-tracking candidates "
            "stop being hardcoded to refs/remotes/origin/. Present parameters: "
            f"{list(params)}"
        )


def _spy():
    """A ``_run`` spy that records argv and DELEGATES to the real helper.

    Recording only — the real git, the real fixture repo, the real semantics.
    A fake here would make every argv assertion below a tautology.
    """
    calls: list[list[str]] = []
    real_run = story_finish._run

    def spy(cmd: list[Any], **kwargs: Any) -> Any:
        calls.append([str(c) for c in cmd])
        return real_run(cmd, **kwargs)

    return spy, calls


def _crf_accepts_refname(root: Path, value: str) -> bool:
    """Does today's validator (``check-ref-format`` in REFNAME mode) accept it?

    The premise for items 1 and 4: these values sail through the 162-25 guard.
    """
    return (
        subprocess.run(
            ["git", "check-ref-format", f"refs/heads/{value}"],
            cwd=str(root),
            capture_output=True,
            text=True,
        ).returncode
        == 0
    )


def _ref_exists(root: Path, ref: str) -> bool:
    return (
        subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", ref],
            cwd=str(root),
            capture_output=True,
            text=True,
        ).returncode
        == 0
    )


def _mutating(calls: list[list[str]]) -> list[list[str]]:
    """Cleanup's three working-tree/ref mutations, however Dev spells them."""
    return [
        argv
        for argv in calls
        if argv[:2] in (["git", "checkout"], ["git", "pull"], ["git", "switch"])
        or (argv[:2] == ["git", "branch"] and ("-d" in argv or "-D" in argv))
    ]


def _assert_refusal_warning(entry: dict[str, Any], value: str) -> None:
    """The designed contract for a cleanup refusal (AC-1a)."""
    assert entry["step"] == 6 and entry["action"] == "git_cleanup", entry
    warning = entry.get("warning") or entry.get("error") or ""
    assert warning, (
        f"cleanup refused to run for {value!r} but said nothing: {entry!r}. A "
        f"silent skip is exactly the failure this epic kills — the finish "
        f"report must show that step 6 did not happen and why."
    )
    assert value in warning, (
        f"the warning must quote the offending value {value!r} so the operator "
        f"can find and fix repos.yaml's default_branch. Got {warning!r}"
    )
    assert re.search(r"not a valid|invalid|not usable|refus", warning, re.IGNORECASE), (
        f"the warning must say the value is unusable as a branch, not merely "
        f"mention it. Got {warning!r}"
    )


# =============================================================================
# Item 1 / AC-1a — an unusable base emits no git at all
# =============================================================================

#: Every shape that must never reach a cleanup argv.
#:
#: The first four are refname-LEGAL (probed: ``check-ref-format
#: refs/heads/<v>`` rc=0) and so pass 162-25's validator untouched — they are
#: item 4's family seen from step 6, where they are not merely misdiagnosed
#: but actively wrong: ``git checkout HEAD`` and ``git checkout @`` succeed
#: without leaving the feature branch, and the pull that follows lands the
#: remote's default branch on top of it.
#:
#: The two dash-leading values are the destructive half. ``git checkout -f``
#: discards every uncommitted modification in the repo (verified against real
#: git: rc=0, no output, working tree reverted). 162-4 keeps dash-leading
#: names CLASSIFIABLE on purpose — a read-only probe can prefix them into
#: ``refs/heads/-f`` — but there is no ``git checkout`` argv that reaches one
#: safely, so cleanup must refuse rather than run.
#:
#: The last two are refname-ILLEGAL and would be caught by reusing 162-25's
#: validator; they are here because cleanup calls no validator at all.
UNUSABLE_BASES = [
    "HEAD",
    "@",
    f"refs/heads/{BASE}",
    f"refs/remotes/origin/{BASE}",
    "-f",
    "--orphan",
    f"{BASE}~1",
    f"{BASE}\x01x",
]


class TestCleanupRefusesAnUnusableBase:
    @pytest.mark.parametrize("bad_base", UNUSABLE_BASES)
    def test_no_git_subprocess_is_emitted(self, project: Path, bad_base: str) -> None:
        """RED (AC-1a): today all three commands run with the value inline.

        The assertion is on the argv list rather than on an outcome because the
        outcomes differ per value — a no-op checkout, a discarded working tree,
        a git usage error — and the invariant that covers all of them is that
        an unusable base must not reach git in the first place. That is the
        same ordering rule 162-25's AC-3 established for the read path.
        """
        spy, calls = _spy()
        cfg = _cfg(default_branch=bad_base)

        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(project, branch=AHEAD, repo_config=cfg)

        assert _mutating(calls) == [], (
            f"cleanup ran {_mutating(calls)} for default_branch={bad_base!r}. "
            f"That value is not a usable branch name: validate it before any "
            f"git runs, the way 162-25 validates the read path."
        )
        assert len(entries) == 1, entries
        _assert_refusal_warning(entries[0], bad_base)

    @pytest.mark.parametrize("bad_base", ["HEAD", "@", f"refs/heads/{BASE}"])
    def test_refname_legal_bases_are_the_ones_that_slip_through(
        self, project: Path, bad_base: str
    ) -> None:
        """Premise for the four refname-legal entries above: 162-25's existing
        validator would NOT catch them, so item 1 cannot be closed by simply
        calling it. Asserted from raw git so a git-version change is loud.
        """
        assert _crf_accepts_refname(project, bad_base), (
            f"fixture premise broken: check-ref-format now rejects "
            f"refs/heads/{bad_base} — re-derive item 4's threat model"
        )
        assert not _ref_exists(project, f"refs/heads/{bad_base}"), (
            f"fixture premise broken: refs/heads/{bad_base} exists in this "
            f"fixture, so it is a real branch here"
        )


# =============================================================================
# Item 1 / AC-1b — cleanup must never discard uncommitted work
# =============================================================================


class TestCleanupNeverTouchesTheWorkingTree:
    def test_base_naming_a_tracked_path_does_not_discard_local_edits(
        self, project: Path
    ) -> None:
        """RED (AC-1b): the pathspec-DWIM half, at full strength.

        No mock anywhere: real ``_run``, real git, real working tree. With no
        branch named ``notes.txt``, ``git checkout notes.txt`` is not an
        invalid ref — it is a *pathspec*, and git cheerfully restores the
        indexed copy over the operator's uncommitted edit and answers rc=0.
        Step 6 runs after the merge has landed, so the edits at risk are real
        (sidecars, notes, a half-finished follow-up).
        """
        assert _crf_accepts_refname(project, TRACKED_PATH), (
            "fixture premise broken: a dotted name is a legal refname"
        )
        assert not _ref_exists(project, f"refs/heads/{TRACKED_PATH}"), (
            "fixture premise broken: a branch named notes.txt exists"
        )
        edit = "LOCAL UNCOMMITTED EDIT\n"
        (project / TRACKED_PATH).write_text(edit, encoding="utf-8")

        entries = _git_cleanup(
            project, branch=AHEAD, repo_config=_cfg(default_branch=TRACKED_PATH)
        )

        assert (project / TRACKED_PATH).read_text(encoding="utf-8") == edit, (
            f"cleanup DISCARDED an uncommitted edit: default_branch="
            f"{TRACKED_PATH!r} was pathspec-DWIM'd by `git checkout` because "
            f"the argv carries no `--`. Step 6 is bookkeeping; it has no "
            f"licence to touch the working tree."
        )
        _assert_refusal_warning(entries[0], TRACKED_PATH)


# =============================================================================
# Item 1 / AC-1c — the argv shape for a base that IS good
# =============================================================================


class TestCleanupArgvIsGuardedForAGoodBase:
    def test_checkout_argv_closes_pathspec_dwim(self, project: Path) -> None:
        """RED (AC-1c): ``git checkout <base> --`` switches branches exactly as
        the bare form does (verified against real git) and removes the pathspec
        fallback entirely, so a future ``default_branch`` that happens to match
        a path cannot resurrect AC-1b's data loss. The ``git branch -d --``
        line three lines below already does this.
        """
        spy, calls = _spy()
        with patch.object(story_finish, "_run", side_effect=spy):
            _git_cleanup(project, branch=LANDED, repo_config=_cfg())

        switches = [a for a in calls if a[:2] in (["git", "checkout"], ["git", "switch"])]
        assert switches, f"cleanup never returned to the base branch: {calls}"
        assert all("--" in argv for argv in switches), (
            f"the base is handed to git with no `--` separator: {switches}. "
            f"Without it git falls back to pathspec mode and overwrites the "
            f"working tree from the index."
        )

    def test_pull_does_not_pass_the_base_as_a_bare_rev(self, project: Path) -> None:
        """RED (AC-1c): the refspec position. 162-4's rule for the read path
        was "every candidate is a FULL ref path, never a bare name"; the same
        argument applies to a fetch refspec, which git resolves on the remote
        side with the same DWIM (a tag or an ``origin/x``-shaped branch can
        shadow the intended base).
        """
        spy, calls = _spy()
        with patch.object(story_finish, "_run", side_effect=spy):
            _git_cleanup(project, branch=LANDED, repo_config=_cfg())

        pulls = [a for a in calls if a[:2] in (["git", "pull"], ["git", "fetch"])]
        assert pulls, f"cleanup never pulled the base: {calls}"
        for argv in pulls:
            if BASE not in argv:
                continue
            assert "--" in argv[: argv.index(BASE)], (
                f"the base reaches git as a bare rev in {argv}. Qualify it "
                f"(refs/heads/{BASE}) or separate it with `--`."
            )


# =============================================================================
# Item 1 / AC-1d — a legal base that does not exist stops the chain
# =============================================================================


class TestCleanupStopsWhenTheBaseBranchIsMissing:
    def test_missing_base_skips_the_pull_and_the_delete_and_says_so(
        self, project: Path
    ) -> None:
        """RED (AC-1d): a repos.yaml typo (``default_branch: develp``) is a
        perfectly legal refname, so no validator catches it. The checkout
        fails, and because the loop breaks only on ``_timed_out`` the pull and
        the branch delete run anyway — against the branch cleanup was supposed
        to leave. The returned entry has no ``warning``, so the finish report
        shows step 6 as having run.
        """
        missing = "develp"
        assert _crf_accepts_refname(project, missing), "premise: legal refname"
        assert not _ref_exists(project, f"refs/heads/{missing}"), "premise: no such branch"
        spy, calls = _spy()

        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(
                project, branch=LANDED, repo_config=_cfg(default_branch=missing)
            )

        assert not any(a[:2] in (["git", "pull"], ["git", "fetch"]) for a in calls), (
            f"cleanup pulled after a checkout that could not have worked: {calls}"
        )
        assert not any(
            a[:2] == ["git", "branch"] and ("-d" in a or "-D" in a) for a in calls
        ), f"cleanup tried to delete the feature branch it never left: {calls}"
        warning = entries[0].get("warning") or entries[0].get("error") or ""
        assert missing in warning, (
            f"step 6 could not return to {missing!r} and reported nothing: "
            f"{entries[0]!r}. Finish must not describe a cleanup that did not "
            f"happen."
        )


# =============================================================================
# Item 2 / AC-2a — RepoConfig carries a remote NAME
# =============================================================================


class TestRepoConfigCarriesARemoteName:
    def test_remote_name_field_exists_and_defaults_to_origin(self) -> None:
        """RED (AC-2a): the existing ``remote`` field holds a clone URL, so a
        remote NAME needs its own field rather than a reinterpretation.
        """
        names = {f.name for f in dataclasses.fields(RepoConfig)}
        assert "remote_name" in names, (
            f"RepoConfig has no remote-name field (fields: {sorted(names)}). "
            f"`remote` holds the clone URL (git@github.com:org/repo.git) and "
            f"cannot double as a remote name."
        )
        assert _cfg().remote_name == "origin", (
            "an unset remote name must keep today's behavior exactly: origin"
        )

    def test_remote_name_parses_from_repos_yaml(self, upstream_project: Path) -> None:
        """RED (AC-2a): the value has to be reachable from configuration, not
        just constructible in Python.
        """
        cfg = load_repos_config(upstream_project)["proj"]
        assert cfg.remote_name == "upstream", (
            f"repos.yaml declares `remote_name: upstream`; the parsed config "
            f"says {getattr(cfg, 'remote_name', '<missing>')!r}"
        )

    def test_upstream_ref_honors_the_configured_remote(self) -> None:
        """RED (AC-2a): ``upstream_ref`` is the other hardcoded ``origin/`` in
        the same dataclass. De-hardcoding one and leaving the other means two
        answers to "which remote?" in one object.
        """
        assert _cfg(remote_name="upstream").upstream_ref == f"upstream/{BASE}"
        assert _cfg().upstream_ref == f"origin/{BASE}", "the default must not move"


# =============================================================================
# Item 2 / AC-2b — cleanup pulls from the configured remote
# =============================================================================


class TestCleanupPullsFromTheConfiguredRemote:
    def test_pull_names_the_configured_remote(self, project: Path) -> None:
        """RED (AC-2b): ``git pull origin <base>`` in a repo with no ``origin``
        fails outright, and step 6 does not check the return code — so the
        base is silently left un-updated.
        """
        spy, calls = _spy()
        cfg = _cfg(remote_name="upstream")

        with patch.object(story_finish, "_run", side_effect=spy):
            _git_cleanup(project, branch=LANDED, repo_config=cfg)

        pulls = [a for a in calls if a[:2] in (["git", "pull"], ["git", "fetch"])]
        assert pulls, f"cleanup never pulled: {calls}"
        assert any("upstream" in argv for argv in pulls), (
            f"cleanup pulled from a hardcoded remote instead of the configured "
            f"`upstream`: {pulls}"
        )
        assert not any("origin" in argv for argv in pulls), (
            f"`origin` is still in the pull argv even though the repo's remote "
            f"is `upstream`: {pulls}"
        )


# =============================================================================
# Item 2 / AC-2e — the remote name is an argv position too
# =============================================================================


class TestRemoteNameIsValidated:
    @pytest.mark.parametrize(
        "bad_remote",
        ["-f", "--upload-pack=/bin/sh", "up stream", "origin\x01", "refs/heads/x"],
    )
    def test_an_unusable_remote_name_emits_no_git(
        self, project: Path, bad_remote: str
    ) -> None:
        """RED (AC-2e): making the remote configurable opens a NEW argv
        position, in the same file that spent 162-4 and 162-25 closing the
        others. ``git pull --upload-pack=<cmd> <ref>`` runs an arbitrary
        program; ``git pull -f`` is a flag. Validate the name for the same
        reason the branch value is validated, and refuse before any git runs.
        """
        spy, calls = _spy()
        cfg = _cfg(remote_name=bad_remote)

        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(project, branch=LANDED, repo_config=cfg)

        assert _mutating(calls) == [], (
            f"cleanup ran {_mutating(calls)} with remote_name={bad_remote!r}"
        )
        _assert_refusal_warning(entries[0], bad_remote)

    def test_an_empty_remote_name_means_origin(self, project: Path) -> None:
        """AC-2e, other side: an unset key must not become a refusal. Every
        existing repos.yaml omits ``remote_name``, so a validator that rejects
        the empty string would break every finish in the wild.
        """
        spy, calls = _spy()
        with patch.object(story_finish, "_run", side_effect=spy):
            _git_cleanup(project, branch=LANDED, repo_config=_cfg(remote_name=""))

        pulls = [a for a in calls if a[:2] in (["git", "pull"], ["git", "fetch"])]
        assert pulls, f"an unset remote name must fall back to origin, not refuse: {calls}"
        assert any("origin" in argv for argv in pulls), pulls


# =============================================================================
# Item 2 / AC-2c — the read path probes the configured remote
# =============================================================================


class TestMergeStateProbesTheConfiguredRemote:
    def test_branch_landed_on_a_non_origin_remote_reads_merged(
        self, upstream_project: Path
    ) -> None:
        """RED (AC-2c): the false ABORT, end to end on a real repo.

        Premises from raw git first: there is no ``origin`` here, the merge
        exists only on ``refs/remotes/upstream/develop``, and the local
        ``refs/heads/develop`` is one commit short. So today's candidate list
        (``refs/remotes/origin/develop`` then ``refs/heads/develop``) can only
        find the stale local base, counts 1 commit ahead, and reports
        ``unmerged`` for work that landed — which the no-PR gate turns into a
        loud abort on a story that is genuinely done.
        """
        _require_remote_keyword()
        root = upstream_project
        assert not _ref_exists(root, f"refs/remotes/origin/{BASE}"), (
            "fixture premise broken: an origin remote-tracking ref exists"
        )
        assert _ref_exists(root, f"refs/remotes/upstream/{BASE}"), (
            "fixture premise broken: upstream/develop is missing"
        )
        assert (
            subprocess.run(
                ["git", "merge-base", "--is-ancestor", f"refs/heads/{LANDED}", f"refs/heads/{BASE}"],
                cwd=str(root),
                capture_output=True,
                text=True,
            ).returncode
            != 0
        ), "fixture premise broken: the local base already contains the merge"

        state = _branch_merge_state(root, LANDED, base=BASE, remote="upstream")

        assert state["state"] == "merged", (
            f"a branch merged on the repo's configured remote reads {state!r}. "
            f"The remote-tracking candidates are hardcoded to `origin`, so the "
            f"probe falls back to the stale local base and finish aborts a "
            f"story whose work landed."
        )
        assert state["count"] == 0, state

    def test_remote_keyword_does_not_change_the_origin_default(
        self, project: Path
    ) -> None:
        """AC-2c control: omitting ``remote`` must behave exactly as today.

        Green-on-arrival once the keyword exists; it is the guard against a
        de-hardcoding that quietly changes the default for every existing repo.
        """
        _require_remote_keyword()
        assert _branch_merge_state(project, LANDED, base=BASE)["state"] == "merged"
        assert _branch_merge_state(project, LANDED, base=BASE, remote="origin") == (
            _branch_merge_state(project, LANDED, base=BASE)
        )


# =============================================================================
# Item 2 / AC-2d — the finish path actually passes it through
# =============================================================================

FINISH_STORY_ID = "162-48"

FINISH_SESSION = f"""\
---
story_id: "{FINISH_STORY_ID}"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story {FINISH_STORY_ID}: remote wiring

## Story Details
- **ID:** {FINISH_STORY_ID}
- **Workflow:** tdd
- **Branch:** {LANDED}
"""

FINISH_INDEX_YAML = """\
sprint:
  name: "Test16248"
  jira_sprint_id: 999
  jira_sprint_name: "Test16248"
  goal: remote wiring
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

FINISH_SHARD_YAML = f"""\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: in_progress
stories:
  - id: {FINISH_STORY_ID}
    title: remote wiring
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
    repos: proj
"""


class TestFinishPassesTheConfiguredRemoteThrough:
    def test_no_pr_gate_forwards_the_repo_remote_to_the_probe(
        self, upstream_project: Path
    ) -> None:
        """RED (AC-2d): the 162-6 lesson, restated for the remote.

        162-6 found that a correctly-parameterised helper is worthless if the
        call site keeps passing the root's answer; ``base`` is threaded from
        the story repo's own config for exactly that reason. A ``remote``
        keyword nobody supplies is hardcoded ``origin`` with extra steps, and
        the sub-repo topology (repos.yaml at the orchestrator root, code in a
        child dir) cannot be fixed by resolving inside the helper.

        Asserted at the seam rather than on the outcome: the probe is replaced
        by a recorder, so this test says only "the call site supplies the
        repo's configured remote" and stays true whatever probe shape Dev
        writes.
        """
        root = upstream_project
        (root / "sprint").mkdir()
        (root / "sprint" / "current-sprint.yaml").write_text(
            FINISH_INDEX_YAML, encoding="utf-8"
        )
        (root / "sprint" / "epic-162.yaml").write_text(FINISH_SHARD_YAML, encoding="utf-8")
        (root / "sprint" / "archive").mkdir()
        (root / ".session").mkdir()
        (root / ".session" / f"{FINISH_STORY_ID}-session.md").write_text(
            FINISH_SESSION, encoding="utf-8"
        )

        seen: list[dict[str, Any]] = []

        def probe(repo_path: Any, branch: str, *args: Any, **kwargs: Any) -> dict[str, Any]:
            seen.append({"branch": branch, "args": args, "kwargs": kwargs})
            return {"state": "merged", "count": 0, "base": f"refs/remotes/upstream/{BASE}"}

        def fake_run(cmd: list[Any], **kwargs: Any) -> Any:
            argv = [str(c) for c in cmd]
            # git passes through to the real fixture repo; everything else (the
            # gh probes — there is no PR here — and the step-5 re-entrant pf.cli
            # invocation) is canned. Never run the real CLI from a test.
            if argv and argv[0] == "git":
                return subprocess.run(cmd, capture_output=True, text=True, **kwargs)
            return MagicMock(returncode=0, stdout="", stderr="")

        with (
            patch.object(story_finish, "_branch_merge_state", side_effect=probe),
            patch.object(story_finish, "_run", side_effect=fake_run),
            patch.object(story_finish, "transition_story") as mock_transition,
            patch.object(story_finish, "_add_story_to_completed") as mock_completed,
        ):
            mock_transition.return_value = {"success": True, "to_status": "done"}
            mock_completed.return_value = {"success": True, "epic": "162"}
            finish_story(root, FINISH_STORY_ID)

        assert seen, (
            "the no-PR verification gate never called the merge-state probe — "
            "this test's premise is broken, not the wiring"
        )
        remotes = [
            call["kwargs"].get("remote") for call in seen if "remote" in call["kwargs"]
        ]
        assert remotes, (
            f"the finish call site never passed a `remote` to the probe: "
            f"{seen!r}. The helper's new keyword has to be supplied from the "
            f"story repo's config, exactly as `base` is (162-6)."
        )
        assert all(r == "upstream" for r in remotes), (
            f"the call site passed {remotes!r} for a repo configured with "
            f"`remote_name: upstream`"
        )


# =============================================================================
# Item 3 — the timeout arm, pinned at the subprocess boundary
# =============================================================================


class TestTimeoutIsPinnedAtTheSubprocessBoundary:
    @staticmethod
    def _timeout_raiser(cmd: Any = None, **kwargs: Any) -> Any:
        raise subprocess.TimeoutExpired(cmd=["git", "check-ref-format"], timeout=30.0)

    def test_branch_merge_state_reports_timeout_exactly(self, project: Path) -> None:
        """AC-3a — item 3's hardened replacement, green on arrival.

        The 162-25 version patched ``story_finish._run`` and accepted ``state
        in {"timeout", "unknown"}``. That mock stood in for the very code under
        test: ``_run``'s ``TimeoutExpired`` -> ``_TimedOutProcess`` conversion
        was never exercised, and the ``or unknown`` escape hatch would have
        passed a timeout misrouted into the permissive arm — the one thing
        162-9 says must not happen, since ``unknown`` and ``timeout`` say
        different things to the operator.

        Patching ``subprocess.run`` instead means the real helper catches a
        real ``TimeoutExpired``, and the assertion is the exact state.
        """
        with patch.object(subprocess, "run", side_effect=self._timeout_raiser):
            state = _branch_merge_state(project, AHEAD, base=BASE)

        assert state["state"] == "timeout", (
            f"every git call timed out, so nothing was verified. The state must "
            f"be `timeout` — not `unknown`, which claims a fact about this "
            f"repo's refs (162-9). Got {state!r}"
        )
        assert "count" not in state, (
            f"a timed-out probe verified nothing and cannot carry a count: {state!r}"
        )
        reason = state.get("reason") or ""
        assert "timed out" in reason.lower() or "timeout" in reason.lower(), (
            f"the reason must carry the real TimeoutExpired text so the "
            f"operator sees which command and which bound expired. Got {reason!r}"
        )

    def test_cleanup_attempts_no_mutation_when_validation_times_out(
        self, project: Path
    ) -> None:
        """RED (AC-3b): cleanup's *first* subprocess must be read-only.

        Today step 6 discovers a hung git by running ``git checkout`` — the
        mutating command — and only then records a warning. Once a validation
        or existence probe precedes it (items 1 and 4), a timeout on that probe
        means the base was never established, and nothing may be attempted:
        the warning is the whole output.
        """
        calls: list[list[str]] = []

        def raiser(cmd: Any, **kwargs: Any) -> Any:
            calls.append([str(c) for c in cmd])
            raise subprocess.TimeoutExpired(cmd=[str(c) for c in cmd], timeout=30.0)

        with patch.object(subprocess, "run", side_effect=raiser):
            entries = _git_cleanup(project, branch=LANDED, repo_config=_cfg())

        assert _mutating(calls) == [], (
            f"cleanup attempted {_mutating(calls)} before it had established "
            f"that the base branch was usable. A hung git must be discovered "
            f"by a read-only probe, not by the checkout."
        )
        warning = entries[0].get("warning") or entries[0].get("error") or ""
        assert "timed out" in warning.lower() or "timeout" in warning.lower(), (
            f"a cleanup that stopped on a timeout must say so: {entries[0]!r}"
        )


# =============================================================================
# Item 4 — precise diagnosis for refname-legal non-branches
# =============================================================================

#: The three families, all refname-legal (probed rc=0), none of them a branch.
NON_BRANCH_VALUES = [
    "HEAD",
    "@",
    f"refs/heads/{AHEAD}",
    f"refs/remotes/origin/{AHEAD}",
    "refs/tags/v1.0",
]


class TestRefnameLegalNonBranchesAreRefusedPrecisely:
    @pytest.mark.parametrize("value", NON_BRANCH_VALUES)
    def test_refused_with_162_25_s_contract(self, project: Path, value: str) -> None:
        """RED (AC-4a): today each of these reaches ``"branch not found locally
        or on origin"`` — 162-25's AC-2 failure mode verbatim, on the family
        its own validator does not cover.

        Premises from raw git: the value is a legal refname (so the existing
        guard waves it through) and ``refs/heads/<value>`` does not resolve (so
        both ref probes miss and the generic not-found reason is what comes
        out).
        """
        assert _crf_accepts_refname(project, value), (
            f"fixture premise broken: check-ref-format now rejects "
            f"refs/heads/{value} — the existing validator would already cover it"
        )
        assert not _ref_exists(project, f"refs/heads/{value}"), (
            f"fixture premise broken: refs/heads/{value} resolves here"
        )

        state = _branch_merge_state(project, value, base=BASE)

        assert state["state"] == "unknown", state
        assert "count" not in state, (
            f"{value!r} is not a branch, so there is no merged/unmerged claim "
            f"to quantify: {state!r}"
        )
        reason = state.get("reason") or ""
        assert value in reason, (
            f"the reason must quote the declared value {value!r}: {reason!r}"
        )
        assert re.search(r"not a valid|invalid|not a branch", reason, re.IGNORECASE), (
            f"the reason must name the value as unusable, not merely absent: "
            f"{reason!r}"
        )
        assert "not found locally or on origin" not in reason, (
            f"{value!r} is not a missing branch — it is not a branch name at "
            f"all. Reusing the not-found prose sends the operator hunting a "
            f"deleted branch instead of fixing the field. Got {reason!r}"
        )

    def test_base_arm_refuses_them_too(self, project: Path) -> None:
        """RED (AC-4a, base side): ``base`` comes from repos.yaml, where
        ``default_branch: HEAD`` is exactly the kind of value that gets pasted
        in. 162-25 validates both arms; the new family must be refused in both
        as well.
        """
        state = _branch_merge_state(project, LANDED, base="HEAD")
        assert state["state"] == "unknown", state
        reason = state.get("reason") or ""
        assert "HEAD" in reason and re.search(
            r"not a valid|invalid|not a branch", reason, re.IGNORECASE
        ), reason

    def test_the_families_do_not_share_one_reason(self, project: Path) -> None:
        """RED (AC-4b): *precise*, not merely non-generic.

        Comparing the prose with the quoted value stripped out, so this pins
        that the diagnoses genuinely differ rather than being one template
        with a different value in it. "You wrote HEAD, which names the current
        checkout" and "this field must hold a bare branch name, not a full ref
        path" are different fixes; one reason string cannot say both.
        """
        prose: dict[str, str] = {}
        for family, value in (
            ("head-alias", "HEAD"),
            ("self-prefixed", f"refs/heads/{AHEAD}"),
        ):
            reason = _branch_merge_state(project, value, base=BASE).get("reason") or ""
            prose[family] = reason.replace(value, "<value>")

        assert prose["head-alias"] != prose["self-prefixed"], (
            f"both families get the same diagnosis ({prose['head-alias']!r}), "
            f"so it cannot be telling the operator which mistake they made. "
            f"`HEAD` is a value git refuses as a branch name; a `refs/...` "
            f"value is a field that carries its own prefix."
        )

    def test_no_ref_probe_is_emitted_for_them(self, project: Path) -> None:
        """RED (AC-4c): 162-25's ordering rule, extended. A value that is not a
        branch name must be refused before git resolves anything, so there is
        never an rc=0 to second-guess and never a rev-list range built from it.
        """
        value = "HEAD"
        spy, calls = _spy()

        with patch.object(story_finish, "_run", side_effect=spy):
            _branch_merge_state(project, value, base=BASE)

        offenders = [
            argv
            for argv in calls
            if ("rev-parse" in argv or "rev-list" in argv)
            and any(value in token for token in argv)
        ]
        assert offenders == [], (
            f"{value!r} reached a ref-resolving git call: {offenders}. Refuse "
            f"it before probing."
        )


# =============================================================================
# Controls — the guards must not break what already works
# =============================================================================


class TestOrdinaryValuesAreUnaffected:
    def test_a_good_base_still_runs_all_three_cleanup_commands(
        self, project: Path
    ) -> None:
        """Regression pin: the point of step 6 survives. A validator that
        refuses too much turns every gitflow finish into a warning.
        """
        spy, calls = _spy()
        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(project, branch=LANDED, repo_config=_cfg())

        assert any(a[:2] in (["git", "checkout"], ["git", "switch"]) for a in calls), calls
        assert any(a[:2] in (["git", "pull"], ["git", "fetch"]) for a in calls), calls
        assert any(
            a[:2] == ["git", "branch"] and "-d" in a and LANDED in a for a in calls
        ), calls
        assert "warning" not in entries[0], (
            f"a clean cleanup must not warn: {entries[0]!r}"
        )

    def test_trunk_based_still_skips_without_probing(self, project: Path) -> None:
        """Regression pin (153-2): a trunk-based repo has no feature-branch
        workflow, and the new validation must not start emitting probes for one.
        """
        spy, calls = _spy()
        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(
                project, branch=LANDED, repo_config=_cfg(strategy="trunk-based")
            )

        assert calls == [], f"a skipped cleanup must run no git at all: {calls}"
        assert entries[0]["skipped"] == "trunk-based", entries[0]

    def test_a_legal_but_absent_branch_keeps_the_not_found_diagnosis(
        self, project: Path
    ) -> None:
        """Regression pin (AC-4d): the other side of AC-4a. ``feat/162-48-gone``
        is a perfectly good branch name that simply is not here; the new
        refusal must not relabel a deleted branch as a malformed field.
        """
        state = _branch_merge_state(project, "feat/162-48-gone", base=BASE)
        assert state["state"] == "unknown", state
        assert "not found" in (state.get("reason") or ""), state

    def test_unmerged_and_merged_branches_still_classify(self, project: Path) -> None:
        """Regression pin: the classifier's whole job."""
        ahead = _branch_merge_state(project, AHEAD, base=BASE)
        assert ahead["state"] == "unmerged" and ahead["count"] == 3, ahead
        landed = _branch_merge_state(project, LANDED, base=BASE)
        assert landed["state"] == "merged" and landed["count"] == 0, landed

    def test_dash_leading_names_are_still_classified_by_the_read_path(
        self, project: Path
    ) -> None:
        """Regression pin (162-4): cleanup refuses a dash-leading base because
        no ``git checkout`` argv reaches one safely, but the READ path must
        keep classifying them — 162-4 pinned that ``refs/heads/-evil`` is a
        legal ref plumbing really does create and must be answered about, not
        reported missing. Asymmetry by design, so it gets its own guard.

        Created with ``update-ref``, not ``git branch``: the porcelain refuses
        a dash-leading name ("fatal: '-evil' is not a valid branch name",
        verified on git 2.54.0) while the plumbing writes the ref happily —
        which is precisely 162-4's point about who creates these refs.
        """
        _git(project, "update-ref", "refs/heads/-evil", f"refs/heads/{BASE}")
        assert _ref_exists(project, "refs/heads/-evil"), "fixture premise broken"
        state = _branch_merge_state(project, "-evil", base=BASE)
        assert state["state"] == "merged", (
            f"a dash-leading branch name must still be classified by the read "
            f"path (162-4); cleanup's stricter rule must not leak into it. "
            f"Got {state!r}"
        )


# =============================================================================
# Reviewer fold (162-48 review, F1 + F2) — pins for the pre-merge hardening
# =============================================================================
#
# F1 — a non-string YAML scalar in a name field (``remote_name: yes`` parses to
# Python ``True``; ``default_branch: 2`` to ``int``) survived
# ``data.get(...) or "origin"`` unchanged and reached ``.strip()`` / the new
# ``.split("/", 1)`` in ``_classify_branch_name``, raising ``AttributeError``
# out of a module whose contract is to RETURN, never throw (SOUL #10). The
# ``.split()`` crash was newly introduced by this diff's validator, so the fold
# coerces at the one ingestion point (``_parse_repo_entry``) rather than at
# every consumer.
#
# F2 — a slash-bearing ``remote_name`` (``subdir/evil``) is a legal refname, so
# the shared branch-name validator accepted it, but ``git pull subdir/evil ...``
# reads it as a LOCAL PATH and fetches from ``./subdir/evil`` if it is a repo,
# running that repo's client-side hooks. Refused before the shared grammar via
# a thin remote-only wrapper.


class TestNonStringConfigValuesKeepTheNoThrowContract:
    """F1: YAML bool/int name fields must not crash the finish path."""

    @pytest.mark.parametrize("bad", [True, False, 123, 2.0])
    def test_remote_name_is_coerced_to_str_at_parse(self, bad: Any) -> None:
        cfg = _parse_repo_entry("proj", {"branch_strategy": "gitflow", "remote_name": bad})
        assert isinstance(cfg.remote_name, str), (
            f"remote_name={bad!r} ({type(bad).__name__}) survived parsing as a "
            f"non-str; it later reaches .strip()/.split() and raises "
            f"AttributeError out of the no-throw finish path. Coerce at parse."
        )

    @pytest.mark.parametrize("bad", [123, True])
    def test_default_branch_is_coerced_to_str_at_parse(self, bad: Any) -> None:
        cfg = _parse_repo_entry("proj", {"branch_strategy": "gitflow", "default_branch": bad})
        assert isinstance(cfg.default_branch, str), (
            f"default_branch={bad!r} ({type(bad).__name__}) survived parsing as "
            f"a non-str; the new _classify_branch_name does value.split('/') and "
            f"raises AttributeError. Coerce at parse."
        )

    def test_git_cleanup_does_not_raise_on_bool_remote_name(self, project: Path) -> None:
        """RED (F1): pre-fix this raises ``'bool' object has no attribute 'strip'``."""
        cfg = _parse_repo_entry(
            "proj",
            {"branch_strategy": "gitflow", "remote_name": True, "default_branch": BASE},
        )
        entries = _git_cleanup(project, branch=AHEAD, repo_config=cfg)
        assert isinstance(entries, list) and entries and entries[0]["step"] == 6, entries

    def test_branch_merge_state_does_not_raise_on_int_default_branch(
        self, project: Path
    ) -> None:
        """RED (F1): pre-fix this raises ``'int' object has no attribute 'split'``."""
        cfg = _parse_repo_entry(
            "proj", {"branch_strategy": "gitflow", "default_branch": 2}
        )
        state = _branch_merge_state(project, AHEAD, base=cfg.default_branch)
        assert isinstance(state, dict) and "state" in state, state


class TestSlashBearingRemoteNameIsRefused:
    """F2: a slash-bearing remote name is a local path to git, not a remote."""

    def test_subdir_style_remote_is_refused_with_zero_mutations(
        self, project: Path
    ) -> None:
        """RED (F2): ``subdir/evil`` is a legal refname, so the branch-name
        validator accepts it and ``git pull subdir/evil ...`` fetches from a
        local path — an adversarial repo's client-side hooks then run. Cleanup
        must refuse it, emitting zero mutating git commands.
        """
        spy, calls = _spy()
        cfg = _cfg(remote_name="subdir/evil")

        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(project, branch=AHEAD, repo_config=cfg)

        assert _mutating(calls) == [], (
            f"cleanup ran {_mutating(calls)} for a slash-bearing remote name. "
            f"git reads 'subdir/evil' as a local path, not a remote — refuse it "
            f"before any mutation."
        )
        _assert_refusal_warning(entries[0], "subdir/evil")

    def test_ordinary_remote_names_are_still_accepted(self, project: Path) -> None:
        """Control: the wrapper must not over-refuse a plain single-token name."""
        spy, calls = _spy()
        cfg = _cfg(remote_name="upstream")

        with patch.object(story_finish, "_run", side_effect=spy):
            _git_cleanup(project, branch=LANDED, repo_config=cfg)

        assert any(argv[:2] == ["git", "pull"] for argv in calls), (
            "a plain remote name must still reach the pull; the slash guard "
            f"must not block it. Calls: {calls}"
        )
