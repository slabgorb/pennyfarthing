"""Tests for story 162-69: 162-48 polish tail — checkout-conflict arm + ordering.

The 162-48 mutation battery (AC-3b) proved that cleanup emits no mutations when
the FIRST subprocess times out. But it left two behaviors mutually masking:

  M1 — the existence probe (``git rev-parse --verify``) runs BEFORE any
       mutation. The timeout test proves this indirectly: a timed-out checkout
       would appear in the mutating-calls list and fail AC-3b. But it does not
       prove the ordering independently of the timeout behavior.

  M2 — the checkout-conflict arm: when the BASE EXISTS (existence probe passes)
       but ``git checkout`` returns rc≠0 (e.g. dirty working tree), the chain
       stops. Today's AC-3b uses timeout, not rc≠0, so a bug in the rc≠0 arm
       would be invisible to it.

Both are direct pins of behavior already implemented in 162-48. They are
separated so a regression in either one is caught independently of the other.

TDD note: both tests are GREEN-on-arrival — the 162-48 implementation is correct;
these are regression pins, not new implementation gates (same policy as the
162-48 green-on-arrival pins).
"""

import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from pf.sprint import story_finish
from pf.sprint.story_finish import _git_cleanup

BASE = "develop"
AHEAD = "feat/162-69-ahead"


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
    _git(root, "config", "user.email", "tea@162-69.test")
    _git(root, "config", "user.name", "TEA 162-69")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "config", "core.hooksPath", str(root / ".git" / "hooks"))


def _bare(tmp_path: Path, name: str) -> Path:
    path = tmp_path / f"{name}.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(path)], capture_output=True, text=True, check=True
    )
    return path


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Minimal gitflow repo on ``develop`` with a remote named ``origin``.

    Contains:
    - ``develop``: two commits + ``shared.txt`` (committed so checkout of
      another branch can conflict with a dirty modification of it)
    - AHEAD: three commits ahead of develop, never merged
    """
    root = tmp_path / "repo"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    (root / ".pennyfarthing" / "repos.yaml").write_text(
        "repos:\n  proj:\n    path: \".\"\n    type: framework\n"
        "    default_branch: develop\n    branch_strategy: gitflow\n",
        encoding="utf-8",
    )

    _git(root, "init", "-q", "-b", BASE)
    _init_identity(root)
    _commit(root, "d1")

    # shared.txt is committed on develop; it's also present on AHEAD (branched
    # after), so modifying it on AHEAD creates a would-be-overwritten conflict
    # when git checkout develop is attempted.
    (root / "shared.txt").write_text("on-develop\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "add shared.txt")

    origin = _bare(tmp_path, "origin")
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", BASE)

    _git(root, "checkout", "-q", "-b", AHEAD)
    for i in (1, 2, 3):
        _commit(root, f"ahead-c{i}")
    # Give shared.txt a different content on AHEAD so a dirty modification of
    # it while on AHEAD conflicts with checking out develop.
    (root / "shared.txt").write_text("on-ahead\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "modify shared.txt on AHEAD")

    _git(root, "checkout", "-q", BASE)
    return root


def _cfg(root: Path) -> Any:
    """Minimal gitflow RepoConfig loaded from the fixture repo's repos.yaml."""
    from pf.git.repos import load_repos_config

    return load_repos_config(root)["proj"]


def _mutating(calls: list[list[str]]) -> list[list[str]]:
    return [
        argv
        for argv in calls
        if argv[:2] in (["git", "checkout"], ["git", "pull"], ["git", "switch"])
        or (argv[:2] == ["git", "branch"] and ("-d" in argv or "-D" in argv))
    ]


# =============================================================================
# M2 — the checkout-conflict arm (base EXISTS, checkout FAILS, chain stops)
# =============================================================================


class TestCheckoutConflictArmStopsChain:
    """M2: pin the checkout-failure arm directly.

    The 162-48 timeout test (AC-3b) proves that a HUNG checkout stops the
    chain, but a timed-out command follows a completely different code path
    (``_TimedOutProcess`` → ``stopped``). This class exercises the OTHER arm:
    rc≠0 on ``git checkout`` (lines 1004-1008 of story_finish.py) that fires
    when the working tree is dirty and the checkout would overwrite local
    modifications. Uses a selective ``_run`` mock so the existence probe passes
    (returning rc=0) but the checkout returns rc=1, isolating this arm from
    every other failure mode.
    """

    def test_checkout_failure_stops_the_chain_and_reports_warning(
        self, repo: Path
    ) -> None:
        """Direct pin of the ``if cmd[:2] == ["git", "checkout"] and
        result.returncode != 0: return stopped(...)`` arm.

        The existence probe must pass (base branch exists), then checkout fails,
        and neither pull nor branch-delete must run. The returned entry must
        carry a ``warning`` so the operator knows step 6 did not complete.

        Green-on-arrival — 162-48 implemented this arm. The test pins it so a
        regression (e.g. removing the early-return or the rc-check) fails
        loudly here instead of being invisible behind the timeout test.
        """
        real_run = story_finish._run

        def selective_run(cmd: list[Any], **kwargs: Any) -> Any:
            if [str(c) for c in cmd][:2] == ["git", "checkout"]:
                # Simulate a dirty-tree conflict: git refuses the checkout.
                return subprocess.CompletedProcess(
                    list(cmd),
                    1,
                    "",
                    "error: Your local changes to the following files would be "
                    "overwritten by checkout:\n\tshared.txt\n"
                    "Please commit your changes or stash them before you switch branches.",
                )
            return real_run(cmd, **kwargs)

        spy_calls: list[list[str]] = []
        real_spy = selective_run

        def recording_run(cmd: list[Any], **kwargs: Any) -> Any:
            spy_calls.append([str(c) for c in cmd])
            return real_spy(cmd, **kwargs)

        with patch.object(story_finish, "_run", side_effect=recording_run):
            entries = _git_cleanup(repo, branch=AHEAD, repo_config=_cfg(repo))

        assert len(entries) == 1, f"expected one entry from stopped cleanup: {entries}"

        # Pull must not have run — it would land base commits on the feature branch.
        assert not any(a[:2] == ["git", "pull"] for a in spy_calls), (
            f"cleanup issued a pull after a failed checkout: {spy_calls}. A failed "
            f"checkout leaves the feature branch checked out; pulling the base onto "
            f"it would corrupt the working tree."
        )
        # Branch delete must not have run — we never left the feature branch.
        assert not any(
            a[:2] == ["git", "branch"] and ("-d" in a or "-D" in a) for a in spy_calls
        ), (
            f"cleanup tried to delete the feature branch after failing to leave it: "
            f"{spy_calls}."
        )
        # The entry must warn — a silent skip is the failure this epic kills.
        warning = entries[0].get("warning") or entries[0].get("error") or ""
        assert warning, (
            f"checkout failed but the step 6 entry carries no warning: {entries[0]!r}. "
            f"The finish report would show cleanup ran clean, which is false."
        )

    def test_real_dirty_tree_makes_checkout_fail(self, repo: Path) -> None:
        """End-to-end variant with no ``_run`` mock: a real dirty working tree
        on AHEAD triggers a real git checkout failure and the chain stops.

        This is the full integration path — filesystem state → git's actual
        refusal → our arm. The selective-mock test above directly pins the arm
        in isolation; this test confirms the arm is reachable from a real
        working-tree conflict, not just a mocked one.

        Green-on-arrival — same behavior as the mock test, but through real git.
        """
        # Switch to AHEAD and dirty shared.txt in a way that conflicts with
        # develop's version of the file.
        _git(repo, "checkout", "-q", AHEAD)
        # shared.txt on AHEAD = "on-ahead\n"; develop has "on-develop\n".
        # Modifying it without committing creates the would-be-overwritten
        # conflict that makes `git checkout develop --` refuse.
        (repo / "shared.txt").write_text("local-dirty-edit\n", encoding="utf-8")

        entries = _git_cleanup(repo, branch=AHEAD, repo_config=_cfg(repo))

        # The chain must have stopped — develop is NOT the current branch.
        current = _git(repo, "rev-parse", "--abbrev-ref", "HEAD").strip()
        assert current == AHEAD, (
            f"cleanup switched branches despite the dirty-tree conflict: now on "
            f"{current!r}. The checkout failure arm must stop the chain."
        )

        warning = entries[0].get("warning") or entries[0].get("error") or ""
        assert warning, (
            f"dirty-tree checkout failed but the step 6 entry says nothing: "
            f"{entries[0]!r}."
        )

        # Restore so the fixture is clean for any subsequent use.
        _git(repo, "checkout", "--", "shared.txt")
        _git(repo, "checkout", "-q", BASE)


# =============================================================================
# M1 — the existence probe runs BEFORE any mutation (ordering)
# =============================================================================


class TestExistenceProbeRunsBeforeMutation:
    """M1: pin the ordering contract directly, independent of timeout behavior.

    The 162-48 AC-3b timeout test proves ordering indirectly: if checkout ran
    FIRST and timed out, it would appear in the mutating-calls list and the
    test would fail. But the ordering guarantee should also be testable on its
    own — without relying on the timeout conversion path — so a future refactor
    that changes the timeout handling cannot accidentally obscure an ordering
    regression.

    A spy records the ``_run`` call order; the existence probe (``git rev-parse
    --verify --quiet refs/heads/{base}``) must appear in the log BEFORE any
    of the three mutation commands.

    Green-on-arrival — 162-48 implemented this ordering. The test pins it.
    """

    def test_existence_probe_precedes_first_mutation(self, repo: Path) -> None:
        """The ``git rev-parse --verify --quiet refs/heads/<base>`` call that
        confirms the base branch exists must appear in ``_run``'s call log
        before the first ``git checkout``, ``git pull``, or ``git branch -d``.

        If a future change moved the mutation loop above the existence probe,
        this test would fail on the index comparison alone — without depending
        on any timeout semantics.
        """
        spy_calls: list[list[str]] = []
        real_run = story_finish._run

        def spy(cmd: list[Any], **kwargs: Any) -> Any:
            spy_calls.append([str(c) for c in cmd])
            return real_run(cmd, **kwargs)

        with patch.object(story_finish, "_run", side_effect=spy):
            entries = _git_cleanup(repo, branch=AHEAD, repo_config=_cfg(repo))

        # Locate the existence probe in the call log.
        existence_idx = next(
            (
                i
                for i, argv in enumerate(spy_calls)
                if argv[:3] == ["git", "rev-parse", "--verify"]
                and any(f"refs/heads/{BASE}" in tok for tok in argv)
            ),
            None,
        )
        assert existence_idx is not None, (
            f"the existence probe (git rev-parse --verify refs/heads/{BASE}) "
            f"never ran. cleanup must confirm the base branch exists before "
            f"attempting checkout. Full call log: {spy_calls}"
        )

        # Locate the first mutation.
        first_mutation_idx = next(
            (i for i, argv in enumerate(spy_calls) if _mutating([argv])),
            None,
        )
        assert first_mutation_idx is not None, (
            f"no mutation ran — the control path never reached the cleanup loop. "
            f"Check that the fixture's base branch exists and is valid. "
            f"Entries: {entries}, calls: {spy_calls}"
        )

        assert existence_idx < first_mutation_idx, (
            f"existence probe ran at call #{existence_idx} but the first mutation "
            f"ran at call #{first_mutation_idx}: {spy_calls}. The probe must "
            f"precede all mutations — a checkout aimed at a non-existent base "
            f"silently falls back to pathspec mode and may corrupt the working tree."
        )
