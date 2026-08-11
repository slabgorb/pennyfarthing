"""Tests for story 162-10: the session branch extractor must strip to a FIXED
POINT, pin its no-branch sentinel set, and refuse values that cannot be a
branch (findings from the 155-33 and 162-4 reviews).

The bug
-------
``_extract_branch`` applies its two strips ONCE, in a fixed order::

    raw = re.sub(r"\\s*\\(.*\\)\\s*$", "", raw).strip()   # trailing annotation
    raw = raw.strip("`").strip()                        # markdown backticks

That order only handles ONE nesting: annotation OUTSIDE backticks. Agents write
the other nesting too — the annotation INSIDE the backticks — and then the
annotation regex never matches (the value ends with a backtick, not a paren),
so the backtick strip hands back a branch name with the annotation still glued
on. Every downstream git/gh call then receives that residue: the PR-resolution
probe, the merge-state classifier, the branch delete. The failure mode is not a
crash — it is a probe that finds nothing, which drops finish into the no-PR arm
and lets a story be marked done off a value that was never a ref.

Two more holes in the same six lines:

1. Nested sentinels. A no-branch sentinel wrapped the same way (a
   backtick-quoted "none (no branch)") survives the single pass as a truthy
   string and reaches the PR probe, which is exactly the 155-33 failure the
   sentinel set exists to prevent.
2. Dash-leading values. The sentinel set contains a LONE dash, so anything
   dash-LEADING passes every check and reaches git's argv as an option
   (162-4 proved real git will execute ``--local-env-vars`` from that
   position). 162-4 hardened the probe's argv; this story closes the door at
   the extractor. Scope line: SYNTACTIC rejection only — revision-operator
   shapes (tilde/caret/colon forms) are 162-25's probe-layer story and are
   deliberately not pinned here.

Acceptance criteria (from the SM Assessment — authoritative)
------------------------------------------------------------
- AC-1: nested annotation/backtick forms extract to the clean branch name
  (iterate strips to a fixed point), and the iteration is BOUNDED — no
  pathological value can spin.
- AC-2: the no-branch sentinel set is documented and PINNED by tests.
- AC-3: dash-leading values never reach a downstream git call; the chosen arm
  is loud and truthful.

Designed interface for Dev (tests bind to behavior, not mechanism)
------------------------------------------------------------------
``_extract_branch(fields) -> str | None`` keeps its signature and its
``None`` == "no branch recorded" contract. Three changes:

1. Loop the two existing strips until the value STOPS CHANGING, then test the
   sentinel set against that fixed point (so a nested sentinel resolves to
   ``None``). Both strips must run inside the loop; re-ordering them without
   looping fixes one nesting and breaks the other.

2. Bound the loop with a module-level constant. These tests read and
   monkeypatch ``story_finish._MAX_BRANCH_STRIP_PASSES``, so it must be a
   module global consulted at CALL time (not a default argument captured at
   import). The strips are monotonically shrinking, so any bound above ~2 is
   never reached in practice — it is a belt, and the belt must fail LOUD: if
   the value still holds residue when the bound is spent, raise (see 3), never
   return the residue.

3. A value that cannot be a git branch raises ``InvalidBranchValue`` — a new
   ``ValueError`` subclass exported from ``pf.sprint.story_finish`` — whose
   message contains the offending RAW field value. Three shapes qualify:
   leading dash (after the lone-dash sentinel has had its chance), interior
   whitespace, and leftover backtick/paren residue. ``finish_story`` catches it
   and returns the standard ``{"success": False, "error": ...}`` result BEFORE
   any irreversible step.

Why raising, and not ``None``: ``None`` means "the session records no branch",
which routes finish into the no-PR arm — a silent, SUCCESSFUL finish. A session
that DECLARES a branch which cannot be a branch is not the no-branch world; it
is an unverifiable one, and epic 155's rule is that finish must not lie. So the
truthful arm is a loud abort naming the value, not a quiet no-PR finish.

RED on HEAD — the failing classes:
  - TestNestedAnnotationBacktickForms (annotation-inside-backticks residue)
  - TestNestedSentinelFormsResolveToNoBranch
  - TestStripIterationIsBounded (bound constant does not exist yet)
  - TestImpossibleBranchValuesRejected (InvalidBranchValue does not exist yet)
  - TestFinishAbortsOnImpossibleBranchValue
Green-on-arrival guards (over-reach protection — must stay green):
  - TestCanonicalFormsUnchanged, TestSentinelSetPinned (bare forms),
    TestPrNumberExtractorUnaffected, TestRevisionOperatorFormsNotInScope
"""

import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint import story_finish
from pf.sprint.story_finish import (
    _BRANCH_SENTINELS,
    _extract_branch,
    _extract_pr_number,
    _field_is_sentinel,
    finish_story,
)

#: The one true answer every extraction below must converge on.
BRANCH = "feat/162-10-extract-branch-fixed-point"

#: Characters that must never survive into an extracted branch name: they are
#: the markdown/annotation residue the strips exist to remove, and git's own
#: ref grammar forbids whitespace outright.
RESIDUE_CHARS = ("`", "(", ")", " ", "\t")


def _fields(raw: str) -> dict[str, str]:
    """A parsed-session field map carrying *raw* as the branch value."""
    return {"branch": raw}


# =============================================================================
# AC-1 — nested annotation/backtick forms (RED)
# =============================================================================

#: Value shapes agents actually write into the session's branch field. The
#: ``inner-*`` ids are the nestings the single fixed-order pass cannot handle.
NESTED_FORMS = [
    pytest.param(f"`{BRANCH} (pushed)`", id="inner-annotation"),
    pytest.param(f"``{BRANCH} (pushed)``", id="inner-annotation-doubled-ticks"),
    pytest.param(f"`{BRANCH} (pushed)` (merged)", id="inner-and-outer-annotation"),
    pytest.param(f"`{BRANCH} (pushed)` (PR #181 merged)", id="inner-plus-pr-annotation"),
    pytest.param(f"`` `{BRANCH} (pushed)` ``", id="nested-ticks-and-annotation"),
    pytest.param(f"`{BRANCH}` (pushed)", id="outer-annotation-already-worked"),
    pytest.param(f"{BRANCH} (pushed) (merged)", id="doubled-annotation-already-worked"),
    pytest.param(f"`{BRANCH}`", id="ticks-only-already-worked"),
    pytest.param(BRANCH, id="bare-already-worked"),
]


class TestNestedAnnotationBacktickForms:
    """AC-1. Each shape names the SAME branch; the extractor must agree,
    regardless of which formatting layer sits inside which.
    """

    @pytest.mark.parametrize("raw", NESTED_FORMS)
    def test_nested_form_extracts_clean_branch(self, raw: str) -> None:
        assert _extract_branch(_fields(raw)) == BRANCH, (
            f"strip residue survived {raw!r} — the extracted value feeds "
            f"gh pr list --head, git rev-parse, and the branch delete"
        )

    @pytest.mark.parametrize("raw", NESTED_FORMS)
    def test_extracted_value_holds_no_residue(self, raw: str) -> None:
        """Stronger than equality: no markdown or annotation character may
        reach a git argv position, whatever the value ended up being.
        """
        extracted = _extract_branch(_fields(raw))
        assert extracted is not None
        for char in RESIDUE_CHARS:
            assert char not in extracted, f"{char!r} survived extraction of {raw!r} → {extracted!r}"

    def test_extraction_is_idempotent(self) -> None:
        """A fixed point IS the definition: re-extracting the extracted value
        must change nothing. Fails for any implementation that merely adds a
        second hard-coded pass and stops mid-reduction.
        """
        once = _extract_branch(_fields(f"`{BRANCH} (pushed)` (merged)"))
        assert once is not None
        assert _extract_branch(_fields(once)) == once


# =============================================================================
# AC-1/AC-2 — nested sentinel forms must still mean "no branch" (RED)
# =============================================================================

NESTED_SENTINEL_FORMS = [
    pytest.param("`none (no branch)`", id="inner-annotated-none"),
    pytest.param("`n/a (chore, nothing to merge)`", id="inner-annotated-na"),
    pytest.param("``- (no branch)``", id="inner-annotated-dash-doubled-ticks"),
    pytest.param("`none` (no branch)", id="outer-annotation-already-worked"),
    pytest.param("``none``", id="doubled-ticks-already-worked"),
]


class TestNestedSentinelFormsResolveToNoBranch:
    """AC-2. The sentinel test must run on the FIXED POINT. A sentinel that
    survives as a truthy string is the original 155-33 bug: finish probes
    ``gh pr list --head 'none (no branch)'``, gets nothing, and silently takes
    the no-PR arm.
    """

    @pytest.mark.parametrize("raw", NESTED_SENTINEL_FORMS)
    def test_nested_sentinel_extracts_as_no_branch(self, raw: str) -> None:
        assert _extract_branch(_fields(raw)) is None, (
            f"{raw!r} extracted as a truthy branch — a placeholder reaches gh"
        )

    @pytest.mark.parametrize("raw", NESTED_SENTINEL_FORMS)
    def test_no_pr_gate_agrees_with_extractor(self, raw: str) -> None:
        """The no-PR gate's own normalization must stay in step with the
        extractor's (155-34 reuses it deliberately). If the two disagree on a
        nested form, the gate reads an affirmative "no branch" declaration as
        an unfilled field and aborts a legitimately branchless finish — or
        worse, the reverse.
        """
        assert _field_is_sentinel(raw) is True, (
            f"{raw!r} reads as a sentinel to the extractor but not to the "
            f"no-PR gate — the two normalizations have drifted"
        )


# =============================================================================
# AC-1 — the iteration is BOUNDED (RED: the bound does not exist yet)
# =============================================================================


class TestStripIterationIsBounded:
    def test_bound_constant_exists_and_permits_real_nesting(self) -> None:
        """The bound is a reviewable module constant, not a magic number buried
        in a while-loop condition. It must leave room for the real nestings
        above (which need more than one pass).
        """
        bound = getattr(story_finish, "_MAX_BRANCH_STRIP_PASSES", None)
        assert isinstance(bound, int), (
            "story_finish._MAX_BRANCH_STRIP_PASSES must be a module-level int "
            "so the loop's ceiling is visible and testable"
        )
        assert bound >= 2, f"bound {bound} cannot even reduce a nested form"

    @pytest.mark.parametrize("depth", [64, 512, 4096])
    def test_pathological_nesting_terminates_quickly(self, depth: int) -> None:
        """Adversarial (or merely copy-paste-mangled) input must not spin. The
        wall-clock ceiling is generous — it fails an unbounded loop and a
        quadratic re-scan, not a slow machine.
        """
        raw = "`" * depth + BRANCH + " (pushed)" + "`" * depth
        started = time.monotonic()
        result = _extract_branch(_fields(raw))
        elapsed = time.monotonic() - started
        assert elapsed < 2.0, f"depth {depth} took {elapsed:.2f}s — unbounded strip loop"
        assert result == BRANCH, f"depth {depth} left residue: {result!r}"

    def test_spent_bound_refuses_rather_than_returning_residue(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The belt must fail LOUD. With the bound starved to one pass, a
        nested form cannot fully reduce — and a half-reduced value is the exact
        thing that must never reach git. Raise, do not return residue, and do
        not return None (that would be a silent no-PR finish).
        """
        monkeypatch.setattr(story_finish, "_MAX_BRANCH_STRIP_PASSES", 1)
        raw = f"`{BRANCH} (pushed)`"
        with pytest.raises(story_finish.InvalidBranchValue) as excinfo:
            _extract_branch(_fields(raw))
        assert BRANCH in str(excinfo.value), (
            "the abort must quote the offending value so the operator can fix "
            f"the session field: {excinfo.value}"
        )


# =============================================================================
# AC-2 — the sentinel set is pinned
# =============================================================================


class TestSentinelSetPinned:
    def test_sentinel_set_membership_is_exact(self) -> None:
        """Pin the SET, not just its behavior: a value silently added here
        turns a real branch into a no-PR finish, and a value silently removed
        sends a placeholder to gh. Both are silent, so the set is the contract.
        """
        assert set(_BRANCH_SENTINELS) == {"none", "n/a", "na", "null", "-", "—"}

    @pytest.mark.parametrize("sentinel", sorted({"none", "n/a", "na", "null", "-", "—"}))
    def test_each_sentinel_means_no_branch(self, sentinel: str) -> None:
        assert _extract_branch(_fields(sentinel)) is None
        assert _extract_branch(_fields(f"`{sentinel}`")) is None
        assert _extract_branch(_fields(f"{sentinel} (nothing to merge)")) is None

    @pytest.mark.parametrize("sentinel", sorted({"none", "n/a", "na", "null"}))
    def test_sentinel_match_is_case_insensitive(self, sentinel: str) -> None:
        assert _extract_branch(_fields(sentinel.upper())) is None
        assert _extract_branch(_fields(sentinel.title())) is None

    @pytest.mark.parametrize(
        "raw,label",
        [
            ("", "empty-value"),
            ("   ", "whitespace-only"),
            ("(none)", "annotation-only"),
            ("(no branch — chore)", "prose-annotation-only"),
            ("``", "empty-ticks"),
        ],
    )
    def test_empty_and_placeholder_shapes_mean_no_branch(self, raw: str, label: str) -> None:
        """Distinct from the affirmative sentinels: these reduce to nothing.
        They must still resolve to None rather than to a truthy fragment —
        telling the two apart is the no-PR gate's job, not the extractor's.
        """
        assert _extract_branch(_fields(raw)) is None, label

    def test_missing_branch_key_means_no_branch(self) -> None:
        assert _extract_branch({}) is None
        assert _extract_branch({"pr": "#181"}) is None

    @pytest.mark.parametrize(
        "raw",
        ["feat/none", "none-of-the-above", "chore/na-cleanup", "fix/null-deref", "na/162-10"],
    )
    def test_branch_names_containing_a_sentinel_token_survive(self, raw: str) -> None:
        """Over-reach guard: the sentinel test is whole-value equality, never a
        substring or prefix match. A real branch swallowed by the sentinel set
        finishes a story without merging it.
        """
        assert _extract_branch(_fields(raw)) == raw
        assert _extract_branch(_fields(f"`{raw}` (pushed)")) == raw


# =============================================================================
# AC-3 — values that cannot be a branch are rejected LOUDLY (RED)
# =============================================================================

#: Dash-leading shapes. 162-4 verified against real git that the last two are
#: not merely ugly: rev-parse EXECUTES them from an argv position.
DASH_LEADING = [
    pytest.param("-evil", id="single-dash"),
    pytest.param("--default", id="double-dash-usage-fatal"),
    pytest.param("--local-env-vars", id="double-dash-executes"),
    pytest.param("-rf", id="short-flag-shape"),
]


class TestImpossibleBranchValuesRejected:
    """AC-3. The extractor is the door. A session that declares a branch which
    cannot BE a branch must abort loudly — not resolve to None (silent no-PR
    finish) and not pass through (git argv injection, 162-4).
    """

    @pytest.mark.parametrize("raw", DASH_LEADING)
    def test_dash_leading_value_raises(self, raw: str) -> None:
        with pytest.raises(story_finish.InvalidBranchValue) as excinfo:
            _extract_branch(_fields(raw))
        assert raw in str(excinfo.value), f"abort must name the value: {excinfo.value}"

    @pytest.mark.parametrize("raw", DASH_LEADING)
    def test_dash_leading_value_raises_through_every_wrapper(self, raw: str) -> None:
        """The check runs on the FIXED POINT, so formatting cannot smuggle a
        dash past it — and the sentinel set cannot rescue it either.
        """
        for wrapped in (f"`{raw}`", f"{raw} (pushed)", f"`{raw} (pushed)`", f"``{raw}``"):
            with pytest.raises(story_finish.InvalidBranchValue):
                _extract_branch(_fields(wrapped))

    def test_invalid_branch_value_is_a_value_error(self) -> None:
        """Subclassing ValueError keeps existing broad ``except ValueError``
        handlers (and the module's own read_sprint handling) from turning a
        rejected branch into an unhandled traceback.
        """
        assert issubclass(story_finish.InvalidBranchValue, ValueError)

    def test_lone_dash_stays_the_sentinel(self) -> None:
        """Boundary between AC-2 and AC-3: the lone dash is an affirmative
        no-branch sentinel and must NOT become an abort. The sentinel test
        therefore runs before the dash-leading rejection.
        """
        assert _extract_branch(_fields("-")) is None
        assert _extract_branch(_fields("`-` (no branch)")) is None

    @pytest.mark.parametrize(
        "raw,label",
        [
            ("feat/162-10 broken name", "interior-space"),
            ("feat/162-10\tbroken", "interior-tab"),
            ("feat/mid`tick", "interior-backtick"),
            ("feat/162-10 (pushed) extra", "unstrippable-annotation-residue"),
        ],
    )
    def test_unfixable_residue_raises(self, raw: str, label: str) -> None:
        """A value no number of strip passes can make into a ref: git's own
        grammar forbids whitespace in a ref name, and a mid-value backtick is
        markdown the strips cannot reach. Refusing beats handing it to git.
        """
        with pytest.raises(story_finish.InvalidBranchValue):
            _extract_branch(_fields(raw))


class TestRevisionOperatorFormsNotInScope:
    """Scope fence: revision-operator shapes are 162-25's probe-layer story.
    This extractor's check is SYNTACTIC, so these still extract as branch
    names here. Pinned so 162-10's Dev does not silently absorb 162-25's
    scope (and so 162-25 has a test to flip when it lands).
    """

    @pytest.mark.parametrize("raw", ["feat/162-10~2", "feat/162-10^", "HEAD@{1}", "develop:file"])
    def test_revision_operator_forms_pass_the_syntactic_check(self, raw: str) -> None:
        assert _extract_branch(_fields(raw)) == raw


# =============================================================================
# Green-on-arrival guards — the sibling extractor must not drift
# =============================================================================


class TestPrNumberExtractorUnaffected:
    """The PR extractor does NOT share the strip logic (it regex-scans for a
    hash-number). Pinned so a Dev refactoring the strips into a shared helper
    cannot change what the PR field means.
    """

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("#748 - title", "748"),
            ("`#748` (merged)", "748"),
            ("`#748 (merged)`", "748"),
            ("none", None),
            ("(none yet — recorded when the PR is created)", None),
            ("", None),
        ],
    )
    def test_pr_number_shapes(self, raw: str, expected: str | None) -> None:
        assert _extract_pr_number({"pr": raw}) == expected


class TestCanonicalFormsUnchanged:
    """AC over-reach guard: the shapes 155-33/155-40 already pinned keep
    extracting exactly as they do today.
    """

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("feat/155-33-session-template", "feat/155-33-session-template"),
            ("`feat/155-33-session-template`", "feat/155-33-session-template"),
            ("feat/155-33-session-template (pushed)", "feat/155-33-session-template"),
            ("`feat/155-33-session-template` (pushed)", "feat/155-33-session-template"),
            ("  feat/155-33-session-template  ", "feat/155-33-session-template"),
            ("release/1.2.3", "release/1.2.3"),
            ("chore/sprint-162-rollover", "chore/sprint-162-rollover"),
        ],
    )
    def test_canonical_shapes(self, raw: str, expected: str) -> None:
        assert _extract_branch(_fields(raw)) == expected


# =============================================================================
# AC-3 integration — finish aborts loudly, before anything irreversible (RED)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test16210"
  jira_sprint_id: 999
  jira_sprint_name: "Test16210"
  goal: Pin the branch extractor's fixed point and its refusals
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
title: "Finish flow hardening"
priority: p1
status: in_progress
stories:
  - id: 162-10
    title: extract_branch iterates strips to a fixed point
    points: 1
    priority: p2
    status: in_review
    workflow: tdd
"""

SESSION_TEMPLATE = """\
---
story_id: "162-10"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-10: extract_branch iterates strips to a fixed point

## Story Details
- **ID:** 162-10
- **Workflow:** tdd
- **Branch:** {branch_value}
"""


def _make_project(tmp_path: Path, *, branch_value: str) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-10-session.md").write_text(
        SESSION_TEMPLATE.format(branch_value=branch_value)
    )
    return tmp_path


class TestFinishAbortsOnImpossibleBranchValue:
    """The chosen arm, end to end: a declared-but-impossible branch aborts the
    finish with an operator-actionable error, leaves the session in place, and
    never reaches a subprocess. The alternative — treating it as "no branch" —
    would report SUCCESS and mark the story done off an unverifiable session.
    """

    @pytest.mark.parametrize("branch_value", ["-evil", "--local-env-vars", "`-evil` (pushed)"])
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    def test_finish_fails_loudly_and_touches_nothing(
        self,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
        branch_value: str,
    ) -> None:
        project = _make_project(tmp_path, branch_value=branch_value)

        result: dict[str, Any] = finish_story(project, "162-10")

        assert result["success"] is False, (
            f"finish reported success for branch value {branch_value!r} — an "
            f"unverifiable session must not finish"
        )
        error = str(result.get("error") or "")
        assert "-evil" in error or "--local-env-vars" in error, (
            f"the abort must quote the offending value: {error!r}"
        )
        assert mock_run.call_count == 0, (
            f"a subprocess ran before the abort: "
            f"{[list(c.args[0]) for c in mock_run.call_args_list]}"
        )
        mock_transition.assert_not_called()
        mock_add_completed.assert_not_called()
        assert (project / ".session" / "162-10-session.md").exists(), (
            "the session was archived before the abort — the operator has nothing left to fix"
        )
        assert not list((project / "sprint" / "archive").iterdir())

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    def test_dry_run_also_refuses(
        self,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Preview/reality parity (155-31): the plan must not promise a finish
        the real run will refuse.
        """
        project = _make_project(tmp_path, branch_value="-evil")

        result: dict[str, Any] = finish_story(project, "162-10", dry_run=True)

        assert result["success"] is False, "dry run previewed a finish that cannot happen"
        assert "-evil" in str(result.get("error") or "")

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    def test_nested_annotated_branch_reaches_gh_clean(
        self,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """AC-1 at the integration seam: the value the PR probe receives is the
        clean branch name, not the annotated one. This is the whole point of the
        fixed point — a residue-bearing head argument silently resolves no PR.
        """
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="")
        project = _make_project(tmp_path, branch_value=f"`{BRANCH} (pushed)`")

        finish_story(project, "162-10", dry_run=True)

        head_args: list[str] = []
        for call in mock_run.call_args_list:
            argv = [str(a) for a in call.args[0]]
            if "--head" in argv:
                head_args.append(argv[argv.index("--head") + 1])
        assert head_args, "finish never probed for the PR by branch"
        for value in head_args:
            assert value == BRANCH, f"gh received a residue-bearing branch: {value!r}"
