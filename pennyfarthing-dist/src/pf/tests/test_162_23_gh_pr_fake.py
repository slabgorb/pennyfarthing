"""Tests for story 162-23: shared GhPrFake callable dataclass + Literal aliases.

RED — all tests in this file fail with ``ModuleNotFoundError`` until Dev
creates::

    pennyfarthing-dist/src/pf/tests/helpers/gh_pr_fake.py

containing:
- ``GhPrFake`` — callable dataclass reproducing the union of behaviours from
  the four divergent ``_make_fake_run`` implementations
  (test_155_1:168, test_155_12:146, test_155_15:192, test_162_1:186)
- ``GhPrState``, ``GhMergeable``, ``GhMergeStateStatus`` — shared ``Literal``
  type aliases for the gh API string values, re-exported from wherever
  production declares them (``story_finish.py`` or a new shared module)

These tests pin the API contract so Dev cannot accidentally break existing
suite behavior during migration.  The FULL regression contract lives in the
existing four test files; the tests here are the *helper*'s own contract.

Union-of-behaviors covered
--------------------------
- ``parts[:3] == ["gh", "pr", "merge"]`` dispatch (not ``"merge" in parts``)
- ``merge_calls: list[list[str]]`` typed ledger — no ``type: ignore`` needed
- Stateful mode: ``pre_merge_state`` before any merge; ``pr_state`` after a
  ``merge_rc=0`` merge; failed (non-zero) merge does not advance state
- Full view payload: ``state``, ``mergedAt``, ``mergeable``,
  ``mergeStateStatus``, ``baseRefName``
- ``list_stdout`` forwarded on ``gh pr list``
- Passthrough (returncode=0, empty stdout/stderr) for any other command
- ``merge_stderr`` forwarded on merge response
- ``GhPrState`` / ``GhMergeable`` / ``GhMergeStateStatus`` importable from
  both the helpers module and the production namespace

Dev migration interface (how each call site maps onto GhPrFake)
---------------------------------------------------------------
- test_155_1  : ``GhPrFake(merge_rc=…, pr_state=…, list_stdout=…)``
  Replace ``MagicMock(side_effect=_make_fake_run(…))`` with bare
  ``GhPrFake(…)``; ``_merge_invoked`` → ``len(fake.merge_calls) > 0``

- test_155_12 : ``GhPrFake(merge_rc=…, pr_state=…, mergeable=…,
  merge_state_status=…, list_stdout=…)``
  Same MagicMock-wrapper elimination; ``_merge_invoked`` → ledger

- test_155_15 : ``GhPrFake(merge_rc=…, merge_stderr=…, pr_state=…,
  pre_merge_state=…, mergeable=…, merge_state_status=…, list_stdout=…)``
  Eliminates both ``type: ignore`` escapes (lines 281/287); ``_merge_calls``
  accessor becomes ``fake.merge_calls`` (typed, no ignore needed)

- test_162_1  : ``GhPrFake(pr_state=…, mergeable=…, merge_state_status=…,
  merge_rc=…, list_stdout=…, base_ref=…)``
  Replaces ``_make_run``; ``_merge_invoked`` → ledger

- test_155_29 : ``GhPrFake(pre_merge_state="MERGED", pr_state="MERGED",
  mergeable="UNKNOWN", merge_state_status="UNKNOWN", merge_rc=…)``
  for the already-merged world (replaces ``_make_already_merged_run``);
  default ``GhPrFake(merge_rc=0)`` for the clean-path world (replaces
  ``_make_stateful_run``).  Eliminates the ``MagicMock(side_effect=)``
  footgun entirely.
"""

import json
from typing import Any, get_args

# ---------------------------------------------------------------------------
# TRUE RED IMPORT — pf.tests.helpers.gh_pr_fake does not exist yet.
# Every test below collects as an error (ModuleNotFoundError) until Dev
# creates the module.  That is the correct RED state for this story.
# ---------------------------------------------------------------------------
from pf.tests.helpers.gh_pr_fake import (
    GhMergeable,
    GhMergeStateStatus,
    GhPrFake,
    GhPrState,
)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _view(fake: GhPrFake, pr: str = "315") -> dict[str, Any]:
    """Ask the fake for a ``gh pr view`` snapshot, as production code does."""
    result = fake(["gh", "pr", "view", pr, "--json",
                   "state,mergeable,mergeStateStatus,baseRefName,mergedAt"])
    return dict(json.loads(result.stdout))


# ===========================================================================
# Dispatch — parts[:3] not "merge" in parts
# ===========================================================================


class TestDispatch:
    """The dispatch key is ``parts[:3] == ["gh", "pr", "merge"]``.

    The old fakes used ``"merge" in parts``, which would accidentally match
    a ``git merge`` invocation.  The new dispatch is precise.
    """

    def test_gh_pr_merge_dispatches_as_merge(self) -> None:
        fake = GhPrFake(merge_rc=0)
        result = fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert result.returncode == 0

    def test_git_merge_does_not_dispatch_as_gh_pr_merge(self) -> None:
        """``git merge develop`` contains the word 'merge' but must NOT trip
        the gh-pr-merge branch — it falls through to the passthrough arm."""
        fake = GhPrFake(merge_rc=99)
        result = fake(["git", "merge", "--no-ff", "develop"])
        assert result.returncode == 0, (
            "git merge must not dispatch to the gh-pr-merge arm; "
            "parts[:3] != ['gh', 'pr', 'merge']"
        )
        assert fake.merge_calls == [], (
            "git merge must not be recorded in the gh-pr-merge ledger"
        )

    def test_gh_pr_view_dispatches_as_view(self) -> None:
        fake = GhPrFake()
        result = fake(["gh", "pr", "view", "315", "--json", "state"])
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert "state" in data

    def test_gh_pr_list_dispatches_as_list(self) -> None:
        fake = GhPrFake(list_stdout="315")
        result = fake(["gh", "pr", "list", "--head", "feat/my-branch", "--json", "number"])
        assert result.returncode == 0
        assert result.stdout == "315"

    def test_other_commands_are_passthrough(self) -> None:
        fake = GhPrFake(merge_rc=99)
        for cmd in (
            ["git", "checkout", "develop"],
            ["git", "pull", "--rebase"],
            ["git", "branch", "-d", "feat/x"],
        ):
            result = fake(cmd)
            assert result.returncode == 0, f"passthrough failed for {cmd}"
            assert result.stdout == ""
            assert result.stderr == ""


# ===========================================================================
# Merge ledger — typed list[list[str]], no type:ignore
# ===========================================================================


class TestMergeLedger:
    """``merge_calls`` is a typed ``list[list[str]]`` dataclass field.

    The old ``_fake_run.merge_calls = []  # type: ignore[attr-defined]`` and
    ``return fake.merge_calls  # type: ignore[no-any-return]`` idioms are
    replaced by a proper typed field — no suppression comment needed.
    """

    def test_merge_calls_starts_empty(self) -> None:
        fake = GhPrFake()
        calls: list[list[str]] = fake.merge_calls  # typed, no cast required
        assert calls == []

    def test_each_instance_owns_its_own_ledger(self) -> None:
        """Default mutable must be ``field(default_factory=list)``, not a
        shared class-level ``[]``."""
        first = GhPrFake(merge_rc=0)
        second = GhPrFake(merge_rc=0)
        first(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert len(first.merge_calls) == 1
        assert second.merge_calls == [], "second instance must have its own ledger"

    def test_ledger_records_each_invocation(self) -> None:
        fake = GhPrFake(merge_rc=0)
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert len(fake.merge_calls) == 2

    def test_ledger_captures_full_argv(self) -> None:
        fake = GhPrFake(merge_rc=0)
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert fake.merge_calls[0] == [
            "gh", "pr", "merge", "315", "--squash", "--delete-branch"
        ]

    def test_non_merge_calls_not_in_ledger(self) -> None:
        fake = GhPrFake()
        fake(["gh", "pr", "view", "315", "--json", "state"])
        fake(["gh", "pr", "list"])
        fake(["git", "checkout", "develop"])
        assert fake.merge_calls == []

    def test_failed_merge_is_still_recorded(self) -> None:
        """A denied merge is an *invocation* — it must appear in the ledger
        even though it did not advance the PR state."""
        fake = GhPrFake(merge_rc=1, merge_stderr="pull request is not mergeable")
        fake(["gh", "pr", "merge", "999", "--squash"])
        assert len(fake.merge_calls) == 1


# ===========================================================================
# Stateful mode — pre_merge_state / pr_state knobs
# ===========================================================================


class TestStatefulMode:
    """The fake models PR state as a function of history.

    - Before any merge: reports ``pre_merge_state`` (default ``"OPEN"``)
    - After a *successful* (``merge_rc=0``) merge: reports ``pr_state``
    - A denied merge (``merge_rc != 0``) must NOT advance the state

    This is the 162-2 fix: the old stateless fakes reported ``pr_state`` on
    every view, causing clean-merge tests to silently exercise the 155-29
    already-merged short-circuit instead of the real merge path.
    """

    def test_initial_state_is_pre_merge_state(self) -> None:
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=0)
        assert _view(fake)["state"] == "OPEN", (
            "before any merge, the fake must report pre_merge_state — a fake "
            "that reports MERGED up front trips the 155-29 short-circuit and "
            "the clean-merge tests never exercise `gh pr merge`"
        )

    def test_state_flips_after_successful_merge(self) -> None:
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=0)
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert _view(fake)["state"] == "MERGED"

    def test_failed_merge_does_not_advance_state(self) -> None:
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=1)
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        assert _view(fake)["state"] == "OPEN", (
            "a denied merge (rc!=0) must not flip state — the PR did not land"
        )

    def test_guardrail_noop_world_stays_open_on_both_sides(self) -> None:
        """merge_rc=0 but pr_state='OPEN' models the guardrail no-op:
        gh accepted the request but the PR never landed."""
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="OPEN", merge_rc=0)
        before = _view(fake)["state"]
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        after = _view(fake)["state"]
        assert (before, after) == ("OPEN", "OPEN")

    def test_pre_and_post_state_are_distinguishable(self) -> None:
        """Sensitivity test: a stateless fake pinned at ``pr_state`` returns
        the expected answer on BOTH probes and cannot be distinguished from a
        correct stateful implementation in the no-op world.  Using two distinct
        values separates them."""
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=0)
        before = _view(fake)["state"]
        fake(["gh", "pr", "merge", "315", "--squash", "--delete-branch"])
        after = _view(fake)["state"]
        assert (before, after) == ("OPEN", "MERGED")

    def test_already_merged_world_starts_merged(self) -> None:
        """When pre_merge_state='MERGED' the 155-29 pre-check sees MERGED
        immediately — models the retry-after-post-merge-abort scenario."""
        fake = GhPrFake(
            pre_merge_state="MERGED",
            pr_state="MERGED",
            mergeable="UNKNOWN",
            merge_state_status="UNKNOWN",
        )
        assert _view(fake)["state"] == "MERGED"

    def test_merged_at_non_null_after_successful_merge(self) -> None:
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=0)
        fake(["gh", "pr", "merge", "315", "--squash"])
        assert _view(fake)["mergedAt"] is not None, (
            "mergedAt must be a non-null timestamp after a successful merge "
            "(story_finish corroborates state==MERGED via mergedAt; a null "
            "timestamp makes the post-merge verification report UNREADABLE)"
        )

    def test_merged_at_null_before_merge(self) -> None:
        fake = GhPrFake(pre_merge_state="OPEN", pr_state="MERGED", merge_rc=0)
        assert _view(fake)["mergedAt"] is None, (
            "mergedAt must be null before merge — a non-null pre-merge "
            "timestamp would make the 155-29 pre-check see MERGED and "
            "skip the load-bearing merge call"
        )


# ===========================================================================
# View payload — full union of all fields
# ===========================================================================


class TestViewFields:
    """``gh pr view`` must always return the union of every field any caller
    reads: ``state``, ``mergedAt``, ``mergeable``, ``mergeStateStatus``,
    ``baseRefName``.  A response that omits any of these causes silent
    fallbacks or KeyErrors in production code.
    """

    def test_view_includes_all_five_fields(self) -> None:
        fake = GhPrFake()
        data = _view(fake)
        for field in ("state", "mergedAt", "mergeable", "mergeStateStatus", "baseRefName"):
            assert field in data, (
                f"gh pr view response is missing {field!r} — "
                "the shared fake must include the union of all fields"
            )

    def test_mergeable_field_reflects_knob(self) -> None:
        assert _view(GhPrFake(mergeable="CONFLICTING"))["mergeable"] == "CONFLICTING"

    def test_merge_state_status_field_reflects_knob(self) -> None:
        assert _view(GhPrFake(merge_state_status="DIRTY"))["mergeStateStatus"] == "DIRTY"

    def test_base_ref_field_reflects_knob(self) -> None:
        assert _view(GhPrFake(base_ref="main"))["baseRefName"] == "main"

    def test_base_ref_defaults_to_develop(self) -> None:
        assert _view(GhPrFake())["baseRefName"] == "develop"

    def test_mergeable_defaults_to_mergeable(self) -> None:
        assert _view(GhPrFake())["mergeable"] == "MERGEABLE"

    def test_merge_state_status_defaults_to_clean(self) -> None:
        assert _view(GhPrFake())["mergeStateStatus"] == "CLEAN"


# ===========================================================================
# Merge stderr forwarding
# ===========================================================================


class TestMergeStderr:
    def test_merge_returns_given_stderr(self) -> None:
        msg = "GraphQL: Pull request #999 is already merged (mergePullRequest)"
        fake = GhPrFake(merge_rc=1, merge_stderr=msg)
        result = fake(["gh", "pr", "merge", "999", "--squash"])
        assert result.stderr == msg

    def test_merge_default_stderr_is_empty(self) -> None:
        fake = GhPrFake(merge_rc=0)
        result = fake(["gh", "pr", "merge", "315", "--squash"])
        assert result.stderr == ""

    def test_merge_returncode_forwarded(self) -> None:
        for rc in (0, 1, 128):
            fake = GhPrFake(merge_rc=rc)
            result = fake(["gh", "pr", "merge", "315", "--squash"])
            assert result.returncode == rc


# ===========================================================================
# Shared Literal aliases
# ===========================================================================


class TestLiteralAliases:
    """``GhPrState``, ``GhMergeable``, ``GhMergeStateStatus`` pin the set of
    gh API string values accepted by the fake's parameters and used by
    production code in ``story_finish.py``.

    These aliases must be importable from BOTH the helpers module (done above
    at module scope) and from the production namespace so production code can
    use them to type its own gh-state comparisons.
    """

    def test_gh_pr_state_contains_merged(self) -> None:
        assert "MERGED" in get_args(GhPrState)

    def test_gh_pr_state_contains_open(self) -> None:
        assert "OPEN" in get_args(GhPrState)

    def test_gh_pr_state_contains_closed(self) -> None:
        assert "CLOSED" in get_args(GhPrState)

    def test_gh_mergeable_contains_mergeable(self) -> None:
        assert "MERGEABLE" in get_args(GhMergeable)

    def test_gh_mergeable_contains_conflicting(self) -> None:
        assert "CONFLICTING" in get_args(GhMergeable)

    def test_gh_mergeable_contains_unknown(self) -> None:
        assert "UNKNOWN" in get_args(GhMergeable)

    def test_gh_merge_state_status_contains_clean(self) -> None:
        assert "CLEAN" in get_args(GhMergeStateStatus)

    def test_gh_merge_state_status_contains_dirty(self) -> None:
        assert "DIRTY" in get_args(GhMergeStateStatus)

    def test_gh_merge_state_status_contains_unknown(self) -> None:
        assert "UNKNOWN" in get_args(GhMergeStateStatus)

    def test_shared_aliases_importable_from_production_namespace(self) -> None:
        """The aliases must exist where production code declares them — not
        buried in the test tree.  ``pr_types`` is the canonical production
        source; ``story_finish`` is the primary consumer.
        """
        from pf.sprint.pr_types import GhPrState as ProductionGhPrState  # noqa: F401

    def test_production_and_helper_aliases_cover_same_values(self) -> None:
        """The aliases in gh_pr_fake.py and in the production module
        ``pr_types`` must cover the same gh-API string values — they share a
        source (``gh_pr_fake`` re-exports from ``pr_types``)."""
        from pf.sprint.pr_types import GhPrState as ProductionGhPrState

        assert set(get_args(GhPrState)) == set(get_args(ProductionGhPrState)), (
            "GhPrState in gh_pr_fake and in pr_types must be the same "
            "Literal — they are defined once in pr_types and re-exported"
        )
