"""Tests for story 162-25: git REVISION OPERATORS in a branch value must be
refused, not classified.

The hole (from the 162-4 review)
-------------------------------
162-4 made every ``_branch_merge_state`` probe candidate a full ref path
(``refs/heads/<name>`` / ``refs/remotes/origin/<name>``). That closed flag
parsing and bare-name DWIM. It did NOT close the other half of git's rev
grammar: ``refs/heads/<name>`` is still parsed as a REVISION, not as a ref
path, so every suffix operator in ``gitrevisions(7)`` survives the prefixing
and is honored inside it. Verified against the real git binary (2.54.0) while
writing these tests, on a branch three commits ahead of the base:

    git rev-parse --verify --quiet refs/heads/feat~3          -> rc=0, base tip
    git rev-parse --verify --quiet refs/heads/feat^^^         -> rc=0, base tip
    git rev-parse --verify --quiet 'refs/heads/feat@{3}'      -> rc=0, base tip
    git rev-parse --verify --quiet 'refs/heads/feat~3^{commit}' -> rc=0, base tip
    git rev-parse --verify --quiet 'refs/heads/feat:'         -> rc=0, root tree

The probe answers rc=0, so the branch arm accepts the value and — per 162-4's
own contract — reuses that same string as the ``rev-list --count
<base>..<branch>`` endpoint. The endpoint is an ANCESTOR of the real tip (or,
for the colon form, a tree), so the count comes back **0** and the classifier
returns ``merged``. That is the 155-34 false-done, reached through a door
155-34's direction prefixing does not cover: three unmerged commits, and
``finish_story``'s no-PR gate records
``skipped: branch-verified-merged`` and marches on into the done ceremony.

Two more things are true and shape the tests below:

- **Pre-existing on bare names.** The pre-162-4 bare probe resolved
  ``feat~3`` identically (rc=0, same ancestor sha). Prefixing neither caused
  nor cured this; it is an independent hole in the same function.
- **A near-miss is still a lie.** ``feat~1`` reads ``unmerged`` with count
  **2** against a branch that is 3 ahead — the abort prose quotes a number
  that is simply wrong. And ``feat@{0}`` / ``feat^0`` / ``feat~0`` /
  ``feat^{}`` all happen to resolve to the true tip TODAY, so they classify
  correctly by luck: the same reflog/peel syntax pointed one entry over
  (``@{1}``) is an ancestor again. A value that is not a branch name must not
  be classified at all, however the sha happens to fall.

The base arm has the same hole. ``base`` comes from repos.yaml's
``default_branch`` — an operator-edited string — and a ``default_branch:
develop~1`` turns a genuinely MERGED branch into ``unmerged`` with count 1
(verified below), while the returned ``base`` (quoted verbatim in
``finish_story``'s abort prose) names ``refs/remotes/origin/develop~1``: a ref
that does not exist. That direction is a loud false-abort rather than a silent
false-done, but it is the same missing validation and the same untruth.

Probed fix direction (carried from the 162-4 review, not re-litigated here)
--------------------------------------------------------------------------
Validate the name with ``git check-ref-format --branch <value>`` and route a
rejection into the EXISTING unknown-aborts path. Probed against real git: rc=128
for every operator form above (``fatal: 'feat~3' is not a valid branch name``),
rc=0 for ordinary branch names including the awkward-but-legal ones
(``release-1.2.3``, ``feat/v1.0``, ``UPPER_case``, ``a/b/c``). ``unknown`` is
the right destination because the no-PR arm's ``unknown`` already aborts
loudly and keeps the session (rule #1: unknown is not merged).

**One trap in that direction, pinned below.** ``check-ref-format --branch``
does not merely validate — for the ``@{-N}`` shorthand it EXPANDS, answering
rc=0 and printing the previously-checked-out branch name (verified:
``check-ref-format --branch @{-1}`` -> rc=0, stdout ``feat``). So the validator
must (a) not treat rc=0 on ``@{-1}`` as license to classify, and (b) never
substitute its stdout for the declared value — swapping in a reflog-DWIM'd name
would verify a DIFFERENT branch than the session declares, which is the
"silently rewritten instead of refused" failure the 162-10 review named.

Acceptance criteria
-------------------
- AC-1: a branch value containing a git revision operator is never classified
  ``merged`` or ``unmerged`` — it returns ``unknown`` (the abort path).
- AC-2: the ``unknown`` reason distinguishes "not a valid branch name" from
  "branch not found locally or on origin"; the operator can tell a typo'd
  session field from a deleted branch.
- AC-3: no rev-parse/rev-list probe is emitted for an invalid name at all —
  validation precedes ref resolution, so git never evaluates the operator.
- AC-4: the base arm validates its own value the same way.
- AC-5: ordinary branch names — including legal names containing ``.``, ``/``,
  ``_`` and uppercase — classify exactly as they do today. The validator must
  not be a narrow allowlist regex.
- AC-6: validation neither DWIMs nor rewrites: ``@{-1}`` stays ``unknown``, and
  no value is replaced by an expanded form.

Designed interface for Dev (behavior, not mechanism)
---------------------------------------------------
``_branch_merge_state(repo_path, branch, base=None)`` keeps its signature and
its return contract. A refused name returns::

    {"state": "unknown", "base": <base prose>, "reason": <names the value,
     says it is not a valid branch name>}

with **no** ``count`` key — a count is a merged/unmerged claim, and there is no
claim to make about a value that is not a branch. The reason assertions accept
any phrasing matching ``not a valid`` / ``invalid`` that also quotes the
offending value; they reject the existing ``not found locally or on origin``
prose, because reusing it would make a typo'd field indistinguishable from a
deleted branch (AC-2).

Mechanism is Dev's call: ``check-ref-format`` through ``_run`` and a pure-Python
validator both satisfy every test here. If it goes through ``_run``, the
timeout guard below pins that a validation probe that never comes back cannot
read as ``merged``.

RED on HEAD — 26 failures, all on assertions (verified against git 2.54.0):
  - TestRevisionOperatorsReadFalseMerged (5): ``~3``, ``^^^``, ``@{3}``,
    ``~3^{commit}``, ``:`` each return ``merged`` count 0 on a branch that is
    3 commits ahead.
  - TestRevisionOperatorsAreClassifiedAtAll (5): ``~1`` classifies ``unmerged``
    count 2 (wrong number); ``@{0}``/``^0``/``~0``/``^{}`` classify by luck.
  - TestInvalidNameReasonIsActionable (13): every rejected form — including the
    three that already answer ``unknown`` by accident (``@{u}``, a doubly
    ref-prefixed value, an embedded control character) — reports the generic
    "branch not found" reason instead of naming the value as invalid.
  - TestNoRefProbeForInvalidNames (1): the operator value reaches real git's
    argv today, and a rev-list range is emitted for it.
  - TestBaseArmValidatesToo (1): ``base='develop~1'`` reports a merged branch
    as unmerged count 1 against a nonexistent ref.
  - TestValidationDoesNotDwimOrRewrite::test_declared_value_is_quoted_verbatim
    (1): there is no reason string at all today, because the value was
    classified instead of refused.
Green-on-arrival guards (regression pins, intentional):
  - TestOrdinaryBranchNamesUnaffected (7): AC-5 controls.
  - TestValidationDoesNotDwimOrRewrite::test_reflog_shorthand (1): AC-6.
  - TestTimedOutValidationIsNotMerged (1).
  - TestThreatModelReachability (11): the extractor passes operator forms
    through unchanged (and must never silently rewrite one).
"""

import re
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from pf.sprint import story_finish
from pf.sprint.story_finish import (
    InvalidBranchValue,
    _branch_merge_state,
    _extract_branch,
)

BASE = "develop"

#: The branch under test: three real commits ahead of the base, never merged.
#: Three is the smallest depth that lets ``~3``/``^^^``/``@{3}`` all land
#: exactly on the base tip, which is what makes the false ``merged`` visible.
AHEAD = "feat/162-25-ahead"
AHEAD_COMMITS = 3

#: A branch whose work really did land — the control for "merged still works",
#: and the victim of the base-arm hole (a bad ``base`` makes it read unmerged).
LANDED = "feat/162-25-landed"

#: Ordinary, awkward-but-legal branch names. ``check-ref-format --branch``
#: accepts all four; a hand-rolled ``^[A-Za-z0-9/_-]+$`` allowlist would reject
#: half of them. They exist as real refs, one commit ahead of the base.
ORDINARY_NAMES = ["release-1.2.3", "feat/v1.0", "UPPER_case", "a/b/c"]

#: Revision-operator forms that resolve to an ANCESTOR of the branch tip (or to
#: a tree), so ``rev-list --count base..<form>`` answers 0 and the classifier
#: says ``merged``. The false-done, directly.
FALSE_MERGED_FORMS = [
    f"{AHEAD}~3",
    f"{AHEAD}^^^",
    f"{AHEAD}@{{3}}",
    f"{AHEAD}~3^{{commit}}",
    f"{AHEAD}:",
]

#: Operator forms that resolve rc=0 but do NOT currently produce a false
#: ``merged``: ``~1`` undercounts (2 against a 3-ahead branch), and the rest
#: land on the true tip by luck. All must still be refused: the classifier has
#: no business answering about a value that is not a branch name.
MISCLASSIFIED_FORMS = [
    f"{AHEAD}~1",
    f"{AHEAD}@{{0}}",
    f"{AHEAD}^0",
    f"{AHEAD}~0",
    f"{AHEAD}^{{}}",
]

#: Values that already answer ``unknown`` today — but for the WRONG reason
#: ("branch not found"), which tells the operator to go looking for a deleted
#: branch instead of fixing a malformed field. ``@{u}`` (no upstream
#: configured), a value that already carries its own ``refs/heads/`` prefix
#: (double-prefixed into a ref that cannot exist), and an embedded control
#: character (the 162-10 review's "control characters pass the validator into
#: argv" item: check-ref-format rejects them, so no such ref can exist and the
#: probe is pure noise).
#:
#: ``@{-1}`` is deliberately NOT here. ``check-ref-format --branch`` ACCEPTS it
#: (rc=0, expanded), so a crf-based fix will let it through to the ref probes
#: and answer the generic "branch not found" — which is a correct-enough abort.
#: Demanding an invalid-name reason for it would force a special case beyond
#: git's own grammar. What it must never do is get classified via its expansion;
#: ``TestValidationDoesNotDwimOrRewrite`` pins that instead.
WRONG_REASON_FORMS = [
    f"{AHEAD}@{{u}}",
    f"refs/heads/{AHEAD}~3",
    f"{AHEAD}\x01x",
]

#: Everything ``_branch_merge_state`` must refuse.
REJECTED_FORMS = FALSE_MERGED_FORMS + MISCLASSIFIED_FORMS + WRONG_REASON_FORMS

REPOS_YAML = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""


# =============================================================================
# Fixture — a REAL git repo. rev-parse's grammar IS the story; a mock that
# answers rc=0 for whatever it is handed would prove nothing about it.
# =============================================================================


def _git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=str(root), capture_output=True, text=True
    )
    assert result.returncode == 0, (
        f"fixture git {' '.join(args)} failed rc={result.returncode}: {result.stderr}"
    )
    return result.stdout


def _commit(root: Path, name: str) -> None:
    (root / f"{name.replace('/', '_')}.txt").write_text(f"{name}\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", name)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """A gitflow project on ``develop`` with a real bare ``origin``.

    Contents:
      - ``develop``: two commits, then a no-ff merge of *LANDED*, pushed.
      - *AHEAD*: three commits, never merged, local only.
      - *LANDED*: merged into develop.
      - *ORDINARY_NAMES*: one commit ahead each.

    gpgsign/hooksPath are pinned locally so the host's git identity cannot leak
    in. No ``_run`` patching anywhere in this fixture's tests: a probe that
    dropped ``cwd=repo_path`` would interrogate the test runner's own repo and
    fail outright (the 155-34 hermetic-seam contract).
    """
    root = tmp_path / "proj"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    (root / ".pennyfarthing" / "repos.yaml").write_text(REPOS_YAML, encoding="utf-8")

    _git(root, "init", "-q", "-b", BASE)
    _git(root, "config", "user.email", "tea@162-25.test")
    _git(root, "config", "user.name", "TEA fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "config", "core.hooksPath", str(root / ".git" / "hooks"))
    _commit(root, "d1")
    _commit(root, "d2")

    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(origin)],
        capture_output=True,
        text=True,
        check=True,
    )
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", BASE)

    _git(root, "checkout", "-q", "-b", AHEAD)
    for i in range(1, AHEAD_COMMITS + 1):
        _commit(root, f"{AHEAD}-c{i}")
    _git(root, "checkout", "-q", BASE)

    _git(root, "checkout", "-q", "-b", LANDED)
    _commit(root, LANDED)
    _git(root, "checkout", "-q", BASE)
    _git(root, "merge", "-q", "--no-ff", "-m", f"merge {LANDED}", LANDED)

    for name in ORDINARY_NAMES:
        _git(root, "checkout", "-q", "-b", name, BASE)
        _commit(root, name)
        _git(root, "checkout", "-q", BASE)

    _git(root, "push", "-q", "origin", BASE)
    return root


# =============================================================================
# Premise helpers — every RED claim below is grounded in observable raw-git
# behavior, not in the classifier's current output. If a future git version
# changes the rev grammar, these fail loudly instead of the test passing for
# the wrong reason.
# =============================================================================


def _resolves(root: Path, rev: str) -> bool:
    return (
        subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", rev],
            cwd=str(root),
            capture_output=True,
            text=True,
        ).returncode
        == 0
    )


def _raw_count(root: Path, base_ref: str, endpoint: str) -> str | None:
    """``git rev-list --count <base_ref>..<endpoint>`` as raw git sees it."""
    result = subprocess.run(
        ["git", "rev-list", "--count", f"{base_ref}..{endpoint}"],
        cwd=str(root),
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def _assert_not_a_branch_name(root: Path, value: str) -> None:
    """Premise for the whole rejected family: git itself says this is not a
    branch name, yet resolves it anyway once prefixed.
    """
    crf = subprocess.run(
        ["git", "check-ref-format", "--branch", value],
        cwd=str(root),
        capture_output=True,
        text=True,
    )
    assert crf.returncode != 0, (
        f"fixture premise broken: git accepts {value!r} as a branch name "
        f"(rc=0, stdout={crf.stdout!r}) — this test's whole claim is that it "
        f"is not one"
    )


def _assert_state_is_refusal(state: dict[str, Any], value: str) -> None:
    """The designed contract for a refused name (AC-1, AC-2)."""
    assert state["state"] == "unknown", (
        f"branch value {value!r} contains a git revision operator — git honors "
        f"it inside refs/heads/, so the probe answers about a DIFFERENT commit "
        f"than the branch tip. It must not be classified; expected state "
        f"'unknown' (the existing loud-abort path), got {state!r}"
    )
    assert "count" not in state, (
        f"a refused value carries no commit count: {value!r} is not a branch "
        f"name, so there is no merged/unmerged claim to quantify. Got {state!r}"
    )
    assert "base" in state, (
        f"the unknown arm's dict must keep its 'base' key — finish_story's "
        f"report shape depends on it. Got {state!r}"
    )
    reason = state.get("reason") or ""
    assert value in reason, (
        f"the abort reason must quote the offending value {value!r} so the "
        f"operator can find and fix the session's Branch field. Got "
        f"{reason!r}"
    )
    assert re.search(r"not a valid|invalid", reason, re.IGNORECASE), (
        f"the reason must say the value is not a valid branch name, so a "
        f"malformed field is distinguishable from a deleted branch (AC-2). "
        f"Got {reason!r}"
    )
    assert "not found locally or on origin" not in reason, (
        f"reusing the branch-not-found prose for a malformed value sends the "
        f"operator looking for a deleted branch instead of fixing the field. "
        f"Got {reason!r}"
    )


# =============================================================================
# AC-1 — the false-done: an operator form reads MERGED on unlanded work
# =============================================================================


class TestRevisionOperatorsReadFalseMerged:
    @pytest.mark.parametrize("value", FALSE_MERGED_FORMS)
    def test_ancestor_selecting_operator_is_not_merged(
        self, project: Path, value: str
    ) -> None:
        """RED (AC-1): the 155-34 false-done, reached through git's rev grammar.

        Premise, asserted from raw git first: the real branch is
        ``AHEAD_COMMITS`` ahead of the base, git rejects *value* as a branch
        name, and yet ``rev-list --count <base>..refs/heads/<value>`` answers
        0. So the classifier's ``merged`` is produced by an endpoint that is an
        ancestor of the tip (or a tree), not by landed work.
        """
        base_ref = f"refs/remotes/origin/{BASE}"
        assert _raw_count(project, base_ref, f"refs/heads/{AHEAD}") == str(
            AHEAD_COMMITS
        ), "fixture premise broken: the branch under test is not unmerged"
        _assert_not_a_branch_name(project, value)
        assert _resolves(project, f"refs/heads/{value}"), (
            f"fixture premise broken: git no longer resolves "
            f"refs/heads/{value!r}, so there is nothing for the probe to "
            f"accept — re-derive this story's threat model"
        )
        assert _raw_count(project, base_ref, f"refs/heads/{value}") == "0", (
            f"fixture premise broken: refs/heads/{value!r} is no longer 0 "
            f"ahead of the base, so it would not read as merged"
        )

        state = _branch_merge_state(project, value, base=BASE)

        assert state["state"] != "merged", (
            f"FALSE DONE: branch value {value!r} reads {state!r} while "
            f"{AHEAD!r} has {AHEAD_COMMITS} unmerged commits. finish_story's "
            f"no-PR gate accepts this as 'branch-verified-merged' and marks "
            f"the story done on unlanded code (155-34)."
        )
        _assert_state_is_refusal(state, value)


# =============================================================================
# AC-1 — the near misses: classified correctly by luck, or with a wrong count
# =============================================================================


class TestRevisionOperatorsAreClassifiedAtAll:
    @pytest.mark.parametrize("value", MISCLASSIFIED_FORMS)
    def test_operator_form_is_refused_even_when_the_sha_falls_right(
        self, project: Path, value: str
    ) -> None:
        """RED (AC-1): ``~1`` reports count 2 for a 3-ahead branch — the abort
        prose quotes a number that is simply wrong. ``@{0}``/``^0``/``~0``/
        ``^{}`` happen to resolve to the true tip today and so classify
        correctly BY LUCK; ``@{1}`` is an ancestor again. Luck is not a
        contract: a value git refuses as a branch name must not be classified,
        whichever commit it lands on.
        """
        _assert_not_a_branch_name(project, value)
        assert _resolves(project, f"refs/heads/{value}"), (
            f"fixture premise broken: refs/heads/{value!r} no longer resolves"
        )

        state = _branch_merge_state(project, value, base=BASE)

        assert state.get("count") != AHEAD_COMMITS - 1, (
            f"branch value {value!r} reports count {state.get('count')} for a "
            f"branch that is {AHEAD_COMMITS} commits ahead — finish's abort "
            f"prose quotes that number to the operator. Got {state!r}"
        )
        _assert_state_is_refusal(state, value)


# =============================================================================
# AC-2 — the reason must name the real problem
# =============================================================================


class TestInvalidNameReasonIsActionable:
    @pytest.mark.parametrize("value", REJECTED_FORMS)
    def test_every_rejected_form_reports_an_invalid_name(
        self, project: Path, value: str
    ) -> None:
        """RED (AC-2), and the widest net in this file: every refused shape,
        including the four that already answer ``unknown`` by accident.

        ``@{u}`` (no upstream configured), a value that already carries its own
        ``refs/heads/`` prefix (prefixed again into a ref that cannot exist),
        the ``@{-1}`` reflog shorthand, and an embedded control character all
        return ``unknown`` today — with the reason "branch not found locally or
        on origin". That reason tells the operator to go hunting for a deleted
        branch when the actual fix is a malformed Branch field. Same
        destination, wrong diagnosis.
        """
        _assert_not_a_branch_name(project, value)
        _assert_state_is_refusal(_branch_merge_state(project, value, base=BASE), value)


# =============================================================================
# AC-3 — git never gets to evaluate the operator
# =============================================================================


class TestNoRefProbeForInvalidNames:
    def test_invalid_value_never_reaches_a_rev_parse_or_rev_list_argv(
        self, project: Path
    ) -> None:
        """RED (AC-3): validation must precede ref resolution.

        The spy DELEGATES to the real ``_run`` (real git, real fixture repo) and
        only records argv, so this test keeps the real semantics while pinning
        the ordering property. Letting the operator form reach ``rev-parse`` at
        all means git resolves it and the code then has an rc=0 it must
        second-guess; a rev-list range built from it is the false count itself.

        A validation call that *does* pass the value to ``check-ref-format`` is
        fine and expected — that command's whole job is to judge the string.
        """
        value = f"{AHEAD}~3"
        calls: list[list[str]] = []
        real_run = story_finish._run

        def spy(cmd: list[Any], **kwargs: Any) -> Any:
            calls.append([str(c) for c in cmd])
            return real_run(cmd, **kwargs)

        with patch.object(story_finish, "_run", side_effect=spy):
            state = _branch_merge_state(project, value, base=BASE)

        _assert_state_is_refusal(state, value)

        offenders = [
            argv
            for argv in calls
            if ("rev-parse" in argv or "rev-list" in argv)
            and any(value in token for token in argv)
        ]
        assert offenders == [], (
            f"the invalid value {value!r} reached a ref-resolving git call: "
            f"{offenders}. Validate the name BEFORE probing, so git never "
            f"evaluates the revision operator and no rc=0 has to be "
            f"second-guessed."
        )
        ranges = [
            token
            for argv in calls
            if "rev-list" in argv
            for token in argv
            if ".." in token
        ]
        assert ranges == [], (
            f"a rev-list range {ranges} was counted for a value that is not a "
            f"branch name — that count IS the false 'merged'"
        )


# =============================================================================
# AC-4 — the base arm has the same hole
# =============================================================================


class TestBaseArmValidatesToo:
    def test_operator_in_base_value_is_refused(self, project: Path) -> None:
        """RED (AC-4): ``base`` comes from repos.yaml's ``default_branch``, an
        operator-edited string, and it is prefixed and probed exactly like the
        branch. A ``default_branch: develop~1`` makes the genuinely MERGED
        branch read ``unmerged`` with count 1, and puts
        ``refs/remotes/origin/develop~1`` — a ref that does not exist — into
        the abort message finish_story shows the operator.

        This direction is a false ABORT rather than a false done, so it is not
        the epic's silent-failure class. It is the same missing validation and
        the same untruth, and the fix is the same one line.
        """
        bad_base = f"{BASE}~1"
        _assert_not_a_branch_name(project, bad_base)
        assert _branch_merge_state(project, LANDED, base=BASE)["state"] == "merged", (
            "fixture premise broken: the control branch is not merged"
        )

        state = _branch_merge_state(project, LANDED, base=bad_base)

        assert state["state"] != "unmerged", (
            f"a revision operator in the BASE value turned a merged branch "
            f"into {state!r}: the count is measured from an ancestor of the "
            f"real base, and the 'base' string names a nonexistent ref"
        )
        assert state["state"] == "unknown", (
            f"an invalid base must route to the same loud unknown-abort path; "
            f"got {state!r}"
        )
        reason = state.get("reason") or ""
        assert bad_base in reason and re.search(
            r"not a valid|invalid", reason, re.IGNORECASE
        ), (
            f"the reason must name the invalid base {bad_base!r} as invalid so "
            f"the operator knows to fix repos.yaml's default_branch, not to go "
            f"looking for a missing ref. Got {reason!r}"
        )


# =============================================================================
# AC-5 — controls: ordinary names classify exactly as they do today
# =============================================================================


class TestOrdinaryBranchNamesUnaffected:
    def test_unmerged_branch_still_counts_its_commits(self, project: Path) -> None:
        """Green guard: the whole point of the classifier survives."""
        state = _branch_merge_state(project, AHEAD, base=BASE)
        assert state["state"] == "unmerged", state
        assert state["count"] == AHEAD_COMMITS, state

    def test_merged_branch_still_reads_merged(self, project: Path) -> None:
        """Green guard: a too-eager validator that refuses legal names would
        turn every no-PR finish into an abort — the opposite failure, and just
        as bad for the operator.
        """
        state = _branch_merge_state(project, LANDED, base=BASE)
        assert state["state"] == "merged", state
        assert state["count"] == 0, state

    def test_missing_branch_keeps_its_own_not_found_reason(
        self, project: Path
    ) -> None:
        """Green guard (AC-2, other side): a well-formed name that simply does
        not exist must keep the branch-not-found diagnosis. The new refusal must
        not swallow this case, or a deleted branch would be reported as a
        malformed field.
        """
        state = _branch_merge_state(project, "feat/162-25-never-existed", base=BASE)
        assert state["state"] == "unknown", state
        assert "not found" in (state.get("reason") or ""), state

    @pytest.mark.parametrize("name", ORDINARY_NAMES)
    def test_legal_but_awkward_names_are_not_refused(
        self, project: Path, name: str
    ) -> None:
        """Green guard (AC-5): ``release-1.2.3``, ``feat/v1.0``, ``UPPER_case``
        and ``a/b/c`` are all valid branch names (``check-ref-format --branch``
        rc=0) and all exist here, one commit ahead of the base. A hand-rolled
        ``^[A-Za-z0-9/_-]+$`` allowlist — the tempting shortcut — rejects the
        dotted ones and would abort finish on ordinary release branches.
        """
        state = _branch_merge_state(project, name, base=BASE)
        assert state["state"] == "unmerged", (
            f"legal branch name {name!r} was not classified: {state!r}. The "
            f"validator must match git's own ref grammar, not a narrower regex."
        )
        assert state["count"] == 1, state


# =============================================================================
# AC-6 — the trap in the probed fix: check-ref-format --branch EXPANDS @{-N}
# =============================================================================


class TestValidationDoesNotDwimOrRewrite:
    def test_reflog_shorthand_is_not_expanded_into_a_real_branch(
        self, project: Path
    ) -> None:
        """Green guard (AC-6), aimed squarely at the naive fix.

        ``git check-ref-format --branch @{-1}`` answers rc=0 and prints the
        previously-checked-out branch name — it expands rather than validates.
        A fix that reads rc=0 as "valid" and then uses that stdout would verify
        a DIFFERENT branch than the session declares: whatever happened to be
        checked out last, decided by the repo's reflog. This fixture arranges
        that trap explicitly (``AHEAD`` is the previous checkout), so a
        DWIM-substituting implementation would classify ``AHEAD`` and report
        ``unmerged``/``merged`` for a value the session never named.
        """
        _git(project, "checkout", "-q", AHEAD)
        _git(project, "checkout", "-q", BASE)
        expanded = subprocess.run(
            ["git", "check-ref-format", "--branch", "@{-1}"],
            cwd=str(project),
            capture_output=True,
            text=True,
        )
        assert expanded.returncode == 0 and expanded.stdout.strip() == AHEAD, (
            f"fixture premise broken: check-ref-format --branch '@{{-1}}' no "
            f"longer expands to {AHEAD!r} (rc={expanded.returncode}, "
            f"stdout={expanded.stdout!r}) — re-derive this guard"
        )

        state = _branch_merge_state(project, "@{-1}", base=BASE)

        assert state["state"] == "unknown", (
            f"'@{{-1}}' must never be classified: it names whatever branch the "
            f"repo's reflog happens to remember, not the session's branch. Got "
            f"{state!r}"
        )
        assert "count" not in state, (
            f"a count here means the reflog-expanded branch {AHEAD!r} was "
            f"verified in place of the declared value: {state!r}"
        )

    def test_declared_value_is_quoted_verbatim_not_rewritten(
        self, project: Path
    ) -> None:
        """Green guard (AC-6): the 162-10 review's "silently rewritten instead
        of refused" class. Whatever the validator computes internally, the
        value the operator sees back must be the one the session declared —
        otherwise the abort message points at a string that appears nowhere in
        their session file.
        """
        value = f"{AHEAD}~3"
        reason = _branch_merge_state(project, value, base=BASE).get("reason") or ""
        assert value in reason, (
            f"the reason quotes something other than the declared value "
            f"{value!r}: {reason!r}"
        )
        assert f"refs/heads/{value}" not in reason.replace(f"'{value}'", ""), (
            f"the reason surfaces the internal prefixed candidate rather than "
            f"the session's own value: {reason!r}"
        )


# =============================================================================
# Timeout — if validation goes through _run, a hung probe is not a pass
# =============================================================================


class TestTimedOutValidationIsNotMerged:
    def test_all_probes_timing_out_never_reads_merged(self, project: Path) -> None:
        """Green guard (162-9's rule, extended to a new probe): a validation
        call that never comes back must not fall through to a classification.

        Hardened for 162-48 (item 3). This test used to patch
        ``story_finish._run`` and hand back a hand-built ``_TimedOutProcess``,
        accepting ``state in {"timeout", "unknown"}``. Two problems, both
        closed here:

        - The mock stood in for the code under test. ``_run``'s real
          ``TimeoutExpired`` -> ``_TimedOutProcess`` conversion — the thing
          that makes ``_timed_out`` answer True at all — was never exercised.
          Patching at the ``subprocess.run`` boundary raises a real
          ``TimeoutExpired`` from the real syscall wrapper instead.
        - The ``or unknown`` escape hatch passed a timeout misrouted into the
          permissive arm, which is precisely what 162-9 forbids: ``unknown`` is
          a claim about this repo's refs, ``timeout`` says the probe never came
          back. The assertion is now the exact state.
        """

        def always_timeout(cmd: Any = None, **kwargs: Any) -> Any:
            raise subprocess.TimeoutExpired(
                cmd=[str(c) for c in (cmd or ["git"])], timeout=30.0
            )

        with patch.object(subprocess, "run", side_effect=always_timeout):
            state = _branch_merge_state(project, AHEAD, base=BASE)

        assert state["state"] == "timeout", (
            f"every git probe timed out, so nothing was verified. The state "
            f"must be exactly `timeout` — not `unknown`, which asserts a fact "
            f"about this repo's refs (162-9). Got {state!r}"
        )
        assert "count" not in state, (
            f"a timed-out probe verified nothing and cannot carry a count: {state!r}"
        )
        reason = state.get("reason") or ""
        assert "timed out" in reason.lower() or "timeout" in reason.lower(), (
            f"the reason must carry the real TimeoutExpired text, which names "
            f"the program and the bound that expired. Got {reason!r}"
        )


# =============================================================================
# Threat model — how these values reach the classifier
# =============================================================================


class TestThreatModelReachability:
    @pytest.mark.parametrize("value", FALSE_MERGED_FORMS + MISCLASSIFIED_FORMS)
    def test_extractor_passes_operator_forms_through_unchanged(
        self, value: str
    ) -> None:
        """Green guard: why the hole is reachable, and the layer boundary.

        ``_extract_branch`` refuses dash-leading values, interior whitespace and
        markdown residue (backticks, parens) — none of which describes ``~``,
        ``^``, ``@{...}`` or ``:``. So an operator form written into the
        session's ``**Branch:**`` field arrives at ``_branch_merge_state``
        verbatim.

        Deliberately tolerant about WHERE the refusal lands: if a later story
        tightens the extractor too (as 162-10 did for dash-leading values),
        raising here is a strictly stronger guard and this test accepts it. What
        it does NOT accept is the third option — silently REWRITING the value
        into something else, which is how a finish ends up verifying a branch
        nobody declared (the 162-10 review's rewritten-not-refused finding).

        Either way the classifier's own hardening stays load-bearing:
        ``_branch_merge_state`` is also called with values that never passed
        through the extractor (a repo-config ``default_branch``, a caller's
        argument), which is what ``TestBaseArmValidatesToo`` pins.
        """
        try:
            extracted = _extract_branch({"branch": value})
        except InvalidBranchValue:
            return
        assert extracted == value, (
            f"the extractor silently REWROTE {value!r} into {extracted!r}. "
            f"Refuse it or pass it through — a rewritten branch value makes "
            f"finish verify a branch the session never declared."
        )

    def test_annotated_operator_form_still_reduces_to_the_operator(self) -> None:
        """Green guard: the shapes agents actually write. A backticked,
        annotated value reduces to the bare operator form, so markdown dressing
        is not a second door and not a defense either.
        """
        value = f"{AHEAD}~3"
        assert _extract_branch({"branch": f"`{value}` (pushed)"}) == value
