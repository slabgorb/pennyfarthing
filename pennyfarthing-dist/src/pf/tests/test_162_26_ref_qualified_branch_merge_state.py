"""Tests for story 162-26: a ref-qualified ``Branch`` value must not
double-prefix itself into a false abort — and the fix must not resurrect the
look-alike shadow 162-4 closed.

The hole (from the 162-4 review)
--------------------------------
``_branch_merge_state`` builds its branch candidates as ``f"refs/heads/{branch}"``
and ``f"refs/remotes/{remote}/{branch}"``. Both assume ``branch`` is a BARE name.
When the session's ``Branch`` field arrives already remote-qualified —
``origin/feat-x``, the shape a human copies out of ``git branch -a`` output —
the candidates become ``refs/heads/origin/feat-x`` and
``refs/remotes/origin/origin/feat-x``. Neither resolves, so the probe answers
``unknown`` ("branch not found locally or on origin") and the no-PR arm aborts
finish on a story whose work has actually landed. It fails CLOSED (162-4 traded
a silent false-done for a loud false-abort, correctly), but it is still a wrong
answer about a done story, and the operator's only recourse is to hand-edit the
session field.

Why the obvious fix is UNSOUND (this is the whole story)
-------------------------------------------------------
Stripping the prefix — ``origin/feat-x`` -> ``feat-x`` — collides head-on with
the threat 162-4 exists to defend against. ``git checkout -b origin/feat-x`` is
a real, common typo, and it creates a LITERAL local branch that lives at
``refs/heads/origin/feat-x`` and is a DIFFERENT ref from
``refs/remotes/origin/feat-x``. A stripping implementation resolves the typo
branch's session field to the remote-tracking ref, which is usually merged
while the typo branch's commits are not — unlanded work reads ``merged`` and
finish marks the story done. That is exactly the shadow 162-4 documented
(docstring "the ``git checkout -b origin/x`` typo branch, shadows the intended
one and answers ``merged`` for unlanded work").

So the invariant stands: every candidate handed to git stays a FULL ref path,
and the LITERAL interpretation of the declared value keeps its existing
priority. The fix direction the SM recommends is candidate WIDENING — when the
value is remote-qualified, ADD ``refs/remotes/<remote>/<rest>`` to the candidate
list while still probing the literal ``refs/heads/<value>`` FIRST. Every
candidate remains a full ref, no bare name reaches git, and the look-alike
stays resolvable and distinct. Mechanism is Dev's call; these tests pin only the
verdicts and the ordering consequence.

Acceptance criteria
-------------------
- AC-1: a remote-qualified branch value (``<remote>/<name>``) whose
  remote-tracking ref exists classifies definitively — ``merged`` or
  ``unmerged`` with the true count — instead of ``unknown``/not-found.
- AC-2: the widening keys off the repo's CONFIGURED remote name, not a
  hardcoded ``origin`` (the 162-6 remote-name thread).
- AC-3 (162-4 REGRESSION, must not regress): when a literal look-alike branch
  really exists at ``refs/heads/origin/<name>``, it is resolved DISTINCTLY from
  ``refs/remotes/origin/<name>``: the literal wins, its own commits are counted,
  and the verdict is NOT ``merged`` just because the remote-tracking ref is. A
  strip-prefix implementation fails this; so does a widening implementation that
  probes the widened candidate before the literal one.
- AC-4 (162-25 REGRESSION, must not regress): a ``refs/``-prefixed value
  (``refs/heads/x``, ``refs/remotes/origin/x``) is still REFUSED at the name
  gate as "not a valid branch name", costs zero subprocesses, and carries no
  ``count``. See the deviation note below — this is deliberately NOT widened.
- AC-5 (deliverable B anchor): the ``base`` field's dual shape is pinned. On
  every arm that resolved a base ref, ``base`` is the winning FULL ref
  (``refs/remotes/origin/develop`` / ``refs/heads/develop``). On every arm that
  returns before a base ref resolves, ``base`` is the BARE base name.

Design deviation from the SM Assessment (logged in the session file)
--------------------------------------------------------------------
The SM Assessment asks for RED coverage of BOTH ``origin/x`` and
``refs/heads/x``. Only ``origin/x`` actually double-prefixes today.
``refs/heads/x`` never reaches the candidate loop: ``_classify_branch_name``
refuses any value whose first path component is ``refs`` (162-25), so it already
returns ``unknown`` with the *correct*, actionable "not a valid branch name"
reason and emits no git at all. Making it resolve would DELETE a 162-25
invariant and reintroduce the ``refs/heads/refs/heads/x`` class of confusion the
gate was built to stop. It is therefore pinned as a green-on-arrival regression
(AC-4), not written RED. The remaining defect is the remote-qualified form.

Designed interface for Dev (tests pin behavior, not mechanism)
--------------------------------------------------------------
``_branch_merge_state(repo_path, branch, base, *, remote=...)`` keeps its
signature and its result-object contract:
``{"state": "merged" | "unmerged" | "unknown" | "timeout", ...}`` with
``count``/``base`` on a definitive answer and ``reason`` on an unknown/timed-out
one. No throws.

``_run`` is THE hermetic seam and is faked here: the fake routes on argv and
answers rc/stdout per candidate ref, so the tests control exactly which ref
"resolves" without a real repo. ``base`` and ``remote`` are always passed
explicitly (never resolved from config), and every faked call is asserted to
carry ``cwd=str(repo_path)`` — a probe that drops ``cwd`` would interrogate the
test runner's own repo, and ``_assert_cwd_pinned`` fails it.

Deliberately unpinned (Delivery Findings, not tests): the cross-remote form
(``origin/x`` declared in a repo whose configured remote is ``upstream``) —
whether that widens to ``refs/remotes/origin/x`` or stays not-found is Dev's
call, both are sound since both candidates are full refs; and whether the
extractor should additionally canonicalize/reject remote-qualified values at
write time (the SM's alternative design) — widening here is local and cannot be
bypassed by a new producer, so the extractor question is separable.

RED on HEAD — 3 failures, all on assertions:
  - TestRemoteQualifiedBranchClassifies (3): ``origin/feat-x`` answers
    ``unknown`` / "branch not found locally or on origin" where the true verdict
    is ``merged`` (count 0), ``unmerged`` (count 3), and — with a configured
    remote of ``upstream`` — ``merged`` (count 0).
Green-on-arrival guards (regression pins, intentional):
  - TestLookAlikeBranchStaysDistinct (2): AC-3, the 162-4 look-alike invariant.
  - TestRefsPrefixedValuesStayRefused (4): AC-4, the 162-25 name gate.
  - TestBaseFieldDualShape (9): AC-5, prefixed vs bare ``base``.
  - TestSeamFidelity (3): the defect's current argv, the untouched canonical
    case, and the full-ref-only invariant. 18 green on arrival.
"""

import subprocess
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from pf.sprint.story_finish import _branch_merge_state

BASE = "develop"
NAME = "feat-x"

#: The declared session value under test: remote-qualified, as copied out of
#: ``git branch -a``.
QUALIFIED = f"origin/{NAME}"

#: The two DISTINCT refs a remote-qualified value can mean. Keeping them apart
#: is the entire 162-4 invariant.
LITERAL_LOOKALIKE_REF = f"refs/heads/origin/{NAME}"
REMOTE_TRACKING_REF = f"refs/remotes/origin/{NAME}"

ORIGIN_BASE_REF = f"refs/remotes/origin/{BASE}"
LOCAL_BASE_REF = f"refs/heads/{BASE}"

#: Stand-in shas, distinct so a mixed-up endpoint is visible.
LITERAL_SHA = "1111111111111111111111111111111111111111"
REMOTE_SHA = "2222222222222222222222222222222222222222"


# =============================================================================
# The hermetic seam: a fake ``_run`` that answers per candidate ref
# =============================================================================


def _completed(cmd: list[str], returncode: int, stdout: str = "", stderr: str = "") -> Any:
    return subprocess.CompletedProcess(list(cmd), returncode, stdout, stderr)


class FakeGit:
    """Routes ``_run`` argv to canned git answers and records every call.

    ``existing_refs`` are the refs that resolve rc=0 under
    ``rev-parse --verify --quiet``; everything else answers rc=1 (git's
    ``--quiet`` "no such ref" contract). ``counts`` maps a ``<base>..<branch>``
    range string to the ``rev-list --count`` stdout. A range that was not
    declared answers rc=128 with a loud fixture stderr, so an implementation
    that ranges over an unexpected endpoint surfaces as that text rather than
    as a silently plausible number.
    """

    def __init__(
        self,
        *,
        existing_refs: Iterable[str] = (),
        counts: Mapping[str, int] | None = None,
        invalid_names: Iterable[str] = (),
        rev_list_stdout: str | None = None,
        rev_list_returncode: int | None = None,
    ) -> None:
        self.existing_refs = set(existing_refs)
        self.counts = dict(counts or {})
        self.invalid_names = set(invalid_names)
        self.rev_list_stdout = rev_list_stdout
        self.rev_list_returncode = rev_list_returncode
        self.calls: list[tuple[list[str], dict[str, Any]]] = []

    # -- introspection helpers -------------------------------------------
    @property
    def argvs(self) -> list[list[str]]:
        return [cmd for cmd, _ in self.calls]

    def probed_refs(self) -> list[str]:
        """Candidate refs handed to ``rev-parse --verify``, in probe order."""
        return [cmd[-1] for cmd in self.argvs if cmd[1:2] == ["rev-parse"]]

    def rev_list_ranges(self) -> list[str]:
        return [cmd[-1] for cmd in self.argvs if cmd[1:2] == ["rev-list"]]

    # -- the seam ---------------------------------------------------------
    def __call__(self, cmd: list[str], **kwargs: Any) -> Any:
        self.calls.append((list(cmd), dict(kwargs)))
        sub = cmd[1] if len(cmd) > 1 else ""
        if sub == "check-ref-format":
            bad = cmd[-1] in self.invalid_names
            return _completed(cmd, 128 if bad else 0, stderr="fatal: bad name\n" if bad else "")
        if sub == "rev-parse":
            ref = cmd[-1]
            if ref in self.existing_refs:
                sha = LITERAL_SHA if ref == LITERAL_LOOKALIKE_REF else REMOTE_SHA
                return _completed(cmd, 0, stdout=f"{sha}\n")
            return _completed(cmd, 1)
        if sub == "rev-list":
            if self.rev_list_returncode is not None:
                return _completed(
                    cmd,
                    self.rev_list_returncode,
                    stdout=self.rev_list_stdout or "",
                    stderr="fatal: rev-list refused\n",
                )
            if self.rev_list_stdout is not None:
                return _completed(cmd, 0, stdout=self.rev_list_stdout)
            rng = cmd[-1]
            if rng not in self.counts:
                return _completed(
                    cmd, 128, stderr=f"fixture: undeclared rev-list range {rng!r}\n"
                )
            return _completed(cmd, 0, stdout=f"{self.counts[rng]}\n")
        raise AssertionError(f"fixture: unexpected git subcommand in {cmd!r}")


def _assert_cwd_pinned(fake: FakeGit, repo_path: Path) -> None:
    """Every probe must carry an explicit ``cwd`` for the owning repo (155-34)."""
    for cmd, kwargs in fake.calls:
        assert kwargs.get("cwd") == str(repo_path), (
            f"probe {cmd!r} lost its explicit cwd: {kwargs!r}"
        )


def _call(
    repo_path: Path,
    fake: FakeGit,
    *,
    branch: str,
    base: str = BASE,
    remote: str = "origin",
) -> dict[str, Any]:
    """Drive ``_branch_merge_state`` over the fake seam, then pin ``cwd``.

    ``base``/``remote`` are always explicit: this suite never lets config or
    ``_resolve_base_branch`` decide, so a failure is about the candidate
    construction and nothing else.
    """
    with patch("pf.sprint.story_finish._run", side_effect=fake):
        result = _branch_merge_state(repo_path, branch, base, remote=remote)
    _assert_cwd_pinned(fake, repo_path)
    assert isinstance(result, dict), "contract: a result object, never a throw"
    return result


@pytest.fixture
def repo_path(tmp_path: Path) -> Path:
    """A repo path that need not be a real repo — ``_run`` is faked.

    It is still a distinct directory so a dropped-``cwd`` regression cannot
    accidentally match the test runner's own repo root.
    """
    root = tmp_path / "code-repo"
    root.mkdir()
    return root


# =============================================================================
# AC-1 / AC-2 — RED: the remote-qualified value must classify
# =============================================================================


class TestRemoteQualifiedBranchClassifies:
    """A ``<remote>/<name>`` Branch value must reach a definitive verdict.

    Today every candidate double-prefixes (``refs/heads/origin/feat-x``,
    ``refs/remotes/origin/origin/feat-x``), neither resolves, and the probe
    answers ``unknown`` — a false abort on a story that is done.
    """

    def test_remote_qualified_merged_branch_reads_merged(self, repo_path: Path) -> None:
        """AC-1: the remote-tracking ref exists and is fully merged -> merged."""
        fake = FakeGit(
            existing_refs={REMOTE_TRACKING_REF, ORIGIN_BASE_REF},
            counts={f"{ORIGIN_BASE_REF}..{REMOTE_TRACKING_REF}": 0},
        )
        result = _call(repo_path, fake, branch=QUALIFIED)

        assert result["state"] == "merged", (
            f"remote-qualified {QUALIFIED!r} must classify, got {result!r}"
        )
        assert result["count"] == 0
        assert result["base"] == ORIGIN_BASE_REF
        assert "reason" not in result

    def test_remote_qualified_unmerged_branch_reads_unmerged_with_true_count(
        self, repo_path: Path
    ) -> None:
        """AC-1: the true count comes from the widened ref's own range."""
        fake = FakeGit(
            existing_refs={REMOTE_TRACKING_REF, ORIGIN_BASE_REF},
            counts={f"{ORIGIN_BASE_REF}..{REMOTE_TRACKING_REF}": 3},
        )
        result = _call(repo_path, fake, branch=QUALIFIED)

        assert result["state"] == "unmerged", f"expected unmerged, got {result!r}"
        assert result["count"] == 3
        assert result["base"] == ORIGIN_BASE_REF

    def test_widening_uses_the_configured_remote_not_hardcoded_origin(
        self, repo_path: Path
    ) -> None:
        """AC-2: a repo whose remote is ``upstream`` gets the same treatment."""
        branch = f"upstream/{NAME}"
        tracking = f"refs/remotes/upstream/{NAME}"
        base_ref = f"refs/remotes/upstream/{BASE}"
        fake = FakeGit(
            existing_refs={tracking, base_ref},
            counts={f"{base_ref}..{tracking}": 0},
        )
        result = _call(repo_path, fake, branch=branch, remote="upstream")

        assert result["state"] == "merged", f"expected merged, got {result!r}"
        assert result["count"] == 0
        assert result["base"] == base_ref


# =============================================================================
# AC-3 — REGRESSION: the 162-4 look-alike branch stays distinct
# =============================================================================


class TestLookAlikeBranchStaysDistinct:
    """The ``git checkout -b origin/x`` typo branch is its OWN ref.

    These are the 162-4 guard. A strip-prefix implementation fails them: it
    would resolve ``origin/feat-x`` to ``refs/remotes/origin/feat-x`` (merged)
    and report a story done whose real commits sit unlanded on
    ``refs/heads/origin/feat-x``.
    """

    def test_literal_lookalike_wins_over_widened_candidate_and_is_not_merged(
        self, repo_path: Path
    ) -> None:
        """Both refs exist; the LITERAL one is what the session declared.

        The remote-tracking ref is fully merged (count 0) and the literal typo
        branch has 2 unlanded commits. The verdict must follow the literal ref.
        """
        fake = FakeGit(
            existing_refs={LITERAL_LOOKALIKE_REF, REMOTE_TRACKING_REF, ORIGIN_BASE_REF},
            counts={
                f"{ORIGIN_BASE_REF}..{LITERAL_LOOKALIKE_REF}": 2,
                f"{ORIGIN_BASE_REF}..{REMOTE_TRACKING_REF}": 0,
            },
        )
        result = _call(repo_path, fake, branch=QUALIFIED)

        assert result["state"] != "merged", (
            "162-4 invariant: the look-alike's unlanded commits must not be "
            f"answered for by the remote-tracking ref, got {result!r}"
        )
        assert result["state"] == "unmerged"
        assert result["count"] == 2
        assert result["base"] == ORIGIN_BASE_REF
        assert fake.rev_list_ranges() == [f"{ORIGIN_BASE_REF}..{LITERAL_LOOKALIKE_REF}"], (
            "the counted range must end at the ref that won resolution"
        )
        assert fake.probed_refs()[0] == LITERAL_LOOKALIKE_REF, (
            "the literal interpretation keeps first-probe priority"
        )

    def test_lookalike_alone_still_resolves_rather_than_reading_missing(
        self, repo_path: Path
    ) -> None:
        """Only the typo branch exists: it must be found, not reported missing."""
        fake = FakeGit(
            existing_refs={LITERAL_LOOKALIKE_REF, ORIGIN_BASE_REF},
            counts={f"{ORIGIN_BASE_REF}..{LITERAL_LOOKALIKE_REF}": 2},
        )
        result = _call(repo_path, fake, branch=QUALIFIED)

        assert result["state"] == "unmerged", f"expected unmerged, got {result!r}"
        assert result["count"] == 2
        assert fake.rev_list_ranges() == [f"{ORIGIN_BASE_REF}..{LITERAL_LOOKALIKE_REF}"]


# =============================================================================
# AC-4 — REGRESSION: ``refs/``-prefixed values stay refused (162-25)
# =============================================================================


class TestRefsPrefixedValuesStayRefused:
    """A value carrying its own ``refs/`` prefix is refused, not widened.

    Widening these would delete the 162-25 name gate and reintroduce the
    ``refs/heads/refs/heads/x`` confusion it was built to stop. Pinned so the
    162-26 fix cannot "helpfully" resolve them.
    """

    @pytest.mark.parametrize(
        "branch",
        [f"refs/heads/{NAME}", f"refs/remotes/origin/{NAME}", "refs/tags/v1.0"],
    )
    def test_refs_prefixed_branch_value_is_unknown_and_named_invalid(
        self, repo_path: Path, branch: str
    ) -> None:
        fake = FakeGit(existing_refs={ORIGIN_BASE_REF})
        result = _call(repo_path, fake, branch=branch)

        assert result["state"] == "unknown", f"expected refusal, got {result!r}"
        reason = result["reason"]
        assert branch in reason, "the refusal must quote the offending value verbatim"
        assert "not a valid branch name" in reason
        assert "count" not in result, "no merged/unmerged claim about a non-branch"

    def test_refs_prefixed_value_costs_zero_subprocesses(self, repo_path: Path) -> None:
        """162-25 AC-3: refusal happens in-process, before any git runs."""
        fake = FakeGit(existing_refs={ORIGIN_BASE_REF})
        _call(repo_path, fake, branch=f"refs/heads/{NAME}")

        assert fake.calls == [], f"git ran for a refused value: {fake.argvs!r}"


# =============================================================================
# AC-5 — the ``base`` field's dual shape (anchors deliverable B's doc change)
# =============================================================================


class TestBaseFieldDualShape:
    """``base`` is the winning FULL ref once one resolves, else the BARE name.

    This is the shape the story asks to be documented. Pinned on both sides so
    the docstring cannot drift from the code.
    """

    def test_base_is_origin_ref_on_definitive_answer(self, repo_path: Path) -> None:
        fake = FakeGit(
            existing_refs={f"refs/heads/{NAME}", ORIGIN_BASE_REF, LOCAL_BASE_REF},
            counts={f"{ORIGIN_BASE_REF}..refs/heads/{NAME}": 0},
        )
        assert _call(repo_path, fake, branch=NAME)["base"] == ORIGIN_BASE_REF

    def test_base_is_local_ref_when_origin_base_is_absent(self, repo_path: Path) -> None:
        """The base arm's fallback ref is reported as the FULL local ref."""
        fake = FakeGit(
            existing_refs={f"refs/heads/{NAME}", LOCAL_BASE_REF},
            counts={f"{LOCAL_BASE_REF}..refs/heads/{NAME}": 4},
        )
        result = _call(repo_path, fake, branch=NAME)
        assert result["state"] == "unmerged"
        assert result["base"] == LOCAL_BASE_REF

    def test_base_is_bare_when_branch_is_not_found(self, repo_path: Path) -> None:
        fake = FakeGit(existing_refs={ORIGIN_BASE_REF})
        result = _call(repo_path, fake, branch="ghost-branch")
        assert result["state"] == "unknown"
        assert result["base"] == BASE, "not-found arm reports the BARE base name"
        assert "count" not in result

    def test_base_is_bare_when_base_is_not_found(self, repo_path: Path) -> None:
        fake = FakeGit(existing_refs={f"refs/heads/{NAME}"})
        result = _call(repo_path, fake, branch=NAME)
        assert result["state"] == "unknown"
        assert result["base"] == BASE
        assert BASE in result["reason"]

    def test_base_is_bare_when_the_name_gate_refuses(self, repo_path: Path) -> None:
        fake = FakeGit(existing_refs={ORIGIN_BASE_REF}, invalid_names={f"refs/heads/{NAME}~3"})
        result = _call(repo_path, fake, branch=f"{NAME}~3")
        assert result["state"] == "unknown"
        assert result["base"] == BASE

    def test_base_is_bare_when_the_base_value_itself_is_refused(
        self, repo_path: Path
    ) -> None:
        """The bare shape is the DECLARED base, echoed back unprefixed."""
        fake = FakeGit(existing_refs={f"refs/heads/{NAME}"})
        result = _call(repo_path, fake, branch=NAME, base="refs/heads/develop")
        assert result["state"] == "unknown"
        assert result["base"] == "refs/heads/develop"
        assert "not a valid branch name" in result["reason"]

    def test_base_is_prefixed_when_rev_list_fails(self, repo_path: Path) -> None:
        fake = FakeGit(
            existing_refs={f"refs/heads/{NAME}", ORIGIN_BASE_REF},
            rev_list_returncode=128,
        )
        result = _call(repo_path, fake, branch=NAME)
        assert result["state"] == "unknown"
        assert result["base"] == ORIGIN_BASE_REF, (
            "once a base ref resolved, the failure arms report the FULL ref"
        )

    def test_base_is_prefixed_when_rev_list_output_is_unparseable(
        self, repo_path: Path
    ) -> None:
        fake = FakeGit(
            existing_refs={f"refs/heads/{NAME}", ORIGIN_BASE_REF},
            rev_list_stdout="not-a-number\n",
        )
        result = _call(repo_path, fake, branch=NAME)
        assert result["state"] == "unknown"
        assert result["base"] == ORIGIN_BASE_REF

    def test_dual_shape_holds_for_the_remote_qualified_value_too(
        self, repo_path: Path
    ) -> None:
        """AC-1 x AC-5: widening must not change which shape ``base`` takes."""
        fake = FakeGit(existing_refs=set())
        result = _call(repo_path, fake, branch=QUALIFIED)
        assert result["state"] == "unknown"
        assert result["base"] == BASE, "still bare on the not-found arm"


# =============================================================================
# Sanity: the fake seam is faithful enough to trust the RED verdicts
# =============================================================================


class TestSeamFidelity:
    """Guards that a RED failure above is the DEFECT, not a fixture artifact."""

    def test_todays_candidates_are_the_double_prefixed_pair(self, repo_path: Path) -> None:
        """Documents the defect: this is what git is asked for today.

        This test asserts nothing about the verdict — it records that the
        double-prefixed candidates are among those probed, and that the
        correctly-interpreted ref is (today) NOT. Dev should expect the second
        half of this assertion to flip; update it with the fix.
        """
        fake = FakeGit(existing_refs={REMOTE_TRACKING_REF, ORIGIN_BASE_REF})
        _call(repo_path, fake, branch=QUALIFIED)
        probed = fake.probed_refs()
        assert LITERAL_LOOKALIKE_REF in probed
        assert all(not ref.startswith("refs/heads/refs/") for ref in probed), (
            "no candidate may ever double-prefix a refs/ path"
        )

    def test_bare_canonical_branch_is_unaffected(self, repo_path: Path) -> None:
        """The ordinary case keeps its exact probe order and verdict (162-4)."""
        fake = FakeGit(
            existing_refs={f"refs/heads/{NAME}", ORIGIN_BASE_REF},
            counts={f"{ORIGIN_BASE_REF}..refs/heads/{NAME}": 0},
        )
        result = _call(repo_path, fake, branch=NAME)
        assert result == {"state": "merged", "count": 0, "base": ORIGIN_BASE_REF}
        assert fake.probed_refs()[0] == f"refs/heads/{NAME}"

    def test_every_candidate_is_a_full_ref_path(self, repo_path: Path) -> None:
        """162-4's core invariant: no bare name ever reaches git's argv."""
        fake = FakeGit(existing_refs={ORIGIN_BASE_REF})
        _call(repo_path, fake, branch=QUALIFIED)
        for ref in fake.probed_refs():
            assert ref.startswith(("refs/heads/", "refs/remotes/")), (
                f"bare-ish candidate reached git: {ref!r}"
            )
