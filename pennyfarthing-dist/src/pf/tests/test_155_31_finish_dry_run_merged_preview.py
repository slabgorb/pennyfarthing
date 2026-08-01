"""Tests for story 155-31: the finish dry-run must preview "already merged —
will skip" instead of "Merge PR #N" for a PR that has already landed (from the
155-29 review).

The bug (why the dry-run preview lies today)
--------------------------------------------
155-29 taught the REAL finish run to short-circuit Step 2 when the PR is
already MERGED (a retry after a post-merge abort must not re-attempt
``gh pr merge``). The dry-run branch of ``finish_story`` was not updated: it
builds its Step 2 preview from ``pr_number`` alone — no PR probe at all — so
for an already-merged PR it previews ``Merge PR #N (squash, delete branch)``,
an action the real run would never perform. In the finish-truthfulness epic
(155), a preview that promises a merge the run will skip is the epic's own bug
class: the report lies.

Acceptance criteria (defined by TEA during RED — the context file records
"TEA to define during the RED phase"; this docstring is the AC record)
----------------------------------------------------------------------
- AC-1: ``finish_story(root, id, dry_run=True)`` in auto merge mode, for a PR
  gh reports MERGED, previews Step 2 as already-merged-will-skip (wording must
  contain "already merged" and "skip", case-insensitive) and does NOT contain
  the "Merge PR #" promise.
- AC-2: the dry-run answers "is it merged?" with the single consolidated
  ``gh pr view`` probe from 155-32 — exactly ONE view invocation for the
  merged-PR dry-run preview; never a second probe.
- AC-3: an OPEN PR still previews ``Merge PR #N`` (no over-reach), and a
  probe error (``gh pr view`` rc!=0) falls back to the merge preview — a
  probe failure must NEVER be presented as "already merged" (lang-review
  python #1: no silent fallback opening a false-skip hole).
- AC-4: the dry-run stays a dry-run: no ``gh pr merge``, no archive copy, no
  session removal, no status transition — and the rest of the step plan
  (steps 1..7) is unchanged.
- AC-5: the probe stays inside the AUTO-mode preview only. Human merge mode
  and the no-PR path make NO ``gh pr view`` call (mirrors the 155-32 design:
  human mode needs neither pre-merge answer, and hoisting the fetch would add
  an API round trip to every human-mode finish).

Designed interface (for Dev — tests bind only to the essentials)
----------------------------------------------------------------
In the ``if dry_run:`` block's Step 2 preview, auto-mode ``elif pr_number:``
arm::

    elif pr_number:
        if _view_is_merged(_pr_view(pr_number)):
            steps.append({"step": 2,
                          "action": f"PR #{pr_number} already merged — will skip merge"})
        else:
            steps.append({"step": 2,
                          "action": f"Merge PR #{pr_number} (squash, delete branch)"})

(``_pr_is_merged(pr_number)`` is equally acceptable — it is the same single
``gh pr view`` through the 155-32 consolidated helper. Exact preview wording
is Dev's; tests assert only the "already merged" + "skip" keywords and the
absence of the "Merge PR #" promise.)

RED tests (fail on HEAD, for the right reason — assertion-level):
  - ``TestMergedPrDryRunPreview`` — preview says already-merged/skip; the
    merge promise is gone; exactly one consolidated view probe.

Green-on-arrival guards (over-reach protection — must stay green; logged as
intentional-green Design Deviations in the session):
  - ``TestDryRunPreviewUnchangedPaths`` — OPEN PR still previews the merge;
    probe error falls back to the merge preview; human mode and no-PR path
    are untouched and probe-free.
  - ``TestDryRunStaysSideEffectFree`` — the merged-PR dry-run performs no
    merge/archive/transition/cleanup and keeps the full step plan.

Harness mirrors ``test_155_29_finish_short_circuit_merged_pr.py`` (command-
dispatching fake for ``story_finish._run`` + patched ``transition_story`` +
patched ``pf.common.pr_config.get_pr_merge_mode`` — the dry-run branch imports
it late, so patching the source module covers it).
"""

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures — minimal sprint/.session project (mirrors test_155_29)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15531"
  jira_sprint_id: 999
  jira_sprint_name: "Test15531"
  goal: Test the finish dry-run preview for an already-merged PR
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "155"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
stories:
  - id: 155-31
    title: finish dry-run previews already-merged PRs truthfully
    points: 1
    priority: p1
    status: in_progress
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "155-31"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-31: finish dry-run previews already-merged PRs truthfully

## Story Details
- **ID:** 155-31
- **Workflow:** tdd
- **Branch:** feat/155-31-finish-dry-run-merged-preview
- **PR:** #999 - dry-run preview for merged PRs
"""

SESSION_NO_PR = """\
---
story_id: "155-31"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-31: finish dry-run previews already-merged PRs truthfully

## Story Details
- **ID:** 155-31
- **Workflow:** tdd
- **Branch:** feat/155-31-finish-dry-run-merged-preview
"""


def _make_project(tmp_path: Path, *, session_body: str = SESSION_WITH_PR) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-31-session.md").write_text(session_body)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fakes (mirror the 155-29 worlds)
# =============================================================================


def _make_merged_world_run(*, list_stdout: str = ""):
    """World: PR #999 is ALREADY MERGED.

    ``gh pr merge`` rc=1 "already merged" — what gh really does, and what a
    dry-run must never invoke anyway. ``gh pr view`` → MERGED.
    """

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(
                returncode=1,
                stdout="",
                stderr="GraphQL: Pull request #999 is already merged (mergePullRequest)",
            )
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": "MERGED",
                        "mergedAt": "2026-08-01T00:00:00Z",
                        "mergeable": "UNKNOWN",
                        "mergeStateStatus": "UNKNOWN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout=list_stdout, stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_open_world_run():
    """World: PR #999 is OPEN and cleanly mergeable."""

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": "OPEN",
                        "mergedAt": None,
                        "mergeable": "MERGEABLE",
                        "mergeStateStatus": "CLEAN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_view_error_run():
    """World: ``gh pr view`` cannot establish the PR state (rc=1)."""

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(returncode=1, stdout="", stderr="could not resolve PR")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _view_invocations(fake: MagicMock) -> int:
    """Count ``gh pr view`` calls made through the fake ``_run``."""
    count = 0
    for call in fake.call_args_list:
        argv = [str(x) for x in call.args[0]]
        if "view" in argv:
            count += 1
    return count


def _merge_invoked(fake: MagicMock) -> bool:
    """True if ``gh pr merge`` was ever called through the fake ``_run``."""
    for call in fake.call_args_list:
        argv = [str(x) for x in call.args[0]]
        if "merge" in argv:
            return True
    return False


def _step2_actions(result: dict[str, Any]) -> list[str]:
    """Action strings of every dry-run plan entry with ``step == 2``."""
    return [
        str(s.get("action", ""))
        for s in result.get("steps", [])
        if s.get("step") == 2
    ]


# "already merged" / "already-merged" / an em-dash variant all count.
ALREADY_MERGED_RE = re.compile(r"already[\s—–-]*merged", re.IGNORECASE)
SKIP_RE = re.compile(r"skip", re.IGNORECASE)


# =============================================================================
# AC-1 / AC-2 — merged-PR dry-run preview (GENUINELY RED on HEAD)
# =============================================================================


class TestMergedPrDryRunPreview:
    """The dry-run plan for an already-merged PR must preview the skip the
    real run (155-29) will actually perform — never promise a merge."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_preview_says_already_merged_will_skip(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-1 (positive half): the step-2 preview names the truth — the PR
        is already merged and the merge will be skipped. Wording is asserted
        by keyword only ("already merged" + "skip"); exact text is Dev's.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_merged_world_run(),
        ):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert len(actions) == 1, (
            f"dry-run plan must contain exactly one step-2 entry: {result.get('steps')}"
        )
        action = actions[0]
        assert ALREADY_MERGED_RE.search(action) and SKIP_RE.search(action), (
            "dry-run step 2 for a MERGED PR must preview 'already merged — "
            f"will skip' (keywords 'already merged' + 'skip'). Got: {action!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_preview_drops_merge_promise(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-1 (negative half): the "Merge PR #N" promise must be GONE — the
        real run (155-29 short-circuit) will not merge, so a plan that says
        "Merge PR #999" reports an action that will never happen.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_merged_world_run(),
        ):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert "Merge PR #" not in actions[0], (
            "dry-run step 2 still promises a merge for an already-MERGED PR — "
            f"the real run would skip it (155-29). Got: {actions[0]!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dry_run_uses_single_consolidated_view_probe(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-2: the merged-or-not answer comes from exactly ONE ``gh pr
        view`` — the 155-32 consolidated probe (``_pr_view`` /
        ``_pr_is_merged``). Zero probes means the preview is guessing
        (today's bug); two would readmit the duplicated-probe class 155-32
        just removed.
        """
        fake = MagicMock(side_effect=_make_merged_world_run())
        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-31", dry_run=True)

        views = _view_invocations(fake)
        assert views == 1, (
            f"dry-run made {views} `gh pr view` call(s) — the preview must "
            "consult the PR state through exactly one consolidated probe "
            "(155-32): 0 = guessing (the 155-31 bug), 2+ = duplicated probes"
        )


# =============================================================================
# AC-3 / AC-5 — unchanged preview paths (green-on-arrival over-reach guards)
# =============================================================================


class TestDryRunPreviewUnchangedPaths:
    """The already-merged preview must fire ONLY for a PR gh reports MERGED.
    Every other Step 2 preview is unchanged. All green on HEAD and post-fix;
    logged as intentional-green Design Deviations.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_pr_still_previews_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-3 (over-reach): an OPEN PR's dry-run must keep promising the
        merge — that IS what the real run will do."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_open_world_run(),
        ):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert "Merge PR #999" in actions[0], (
            f"an OPEN PR must still preview the merge: {actions[0]!r}"
        )
        assert not ALREADY_MERGED_RE.search(actions[0]), (
            f"an OPEN PR must never be previewed as already merged: {actions[0]!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_probe_error_falls_back_to_merge_preview(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-3 (rule #1): an unreadable PR state (``gh pr view`` rc!=0 →
        ``_pr_view`` None → NOT merged) must fall back to the normal merge
        preview — presenting a probe failure as "already merged — will skip"
        would be a silent fallback promising to skip a merge that the real
        run would attempt.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_view_error_run(),
        ):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert "Merge PR #999" in actions[0], (
            "a probe error must degrade to the merge preview (unknown ≠ "
            f"merged — permissive, same as the real run): {actions[0]!r}"
        )
        assert not ALREADY_MERGED_RE.search(actions[0]), (
            f"a probe error must never be previewed as already merged: {actions[0]!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_preview_unchanged_and_probe_free(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-5: human merge mode's preview ("waiting for human review") is
        untouched and makes NO ``gh pr view`` call — the probe belongs to the
        auto-mode arm only, mirroring the real run's 155-32 placement (human
        mode needs neither pre-merge answer; hoisting the fetch would tax
        every human-mode finish with an API round trip).
        """
        fake = MagicMock(side_effect=_make_merged_world_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert "waiting for human" in actions[0], (
            f"human-mode dry-run preview must be unchanged: {actions[0]!r}"
        )
        assert not ALREADY_MERGED_RE.search(actions[0]), (
            f"human-mode preview must not claim already-merged: {actions[0]!r}"
        )
        assert _view_invocations(fake) == 0, (
            "human-mode dry-run must not probe the PR — the view call belongs "
            "to the auto-mode arm only (155-32 placement)"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_preview_unchanged_and_probe_free(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """AC-5: with no PR (session names none, ``gh pr list`` resolves
        none), step 2 still previews "No PR to merge" and no view probe runs
        — there is nothing to ask about.
        """
        project = _make_project(tmp_path, session_body=SESSION_NO_PR)
        fake = MagicMock(side_effect=_make_merged_world_run(list_stdout=""))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-31", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert "No PR to merge" in actions[0], (
            f"no-PR dry-run preview must be unchanged: {actions[0]!r}"
        )
        assert _view_invocations(fake) == 0, (
            "no-PR dry-run must not invoke `gh pr view` — there is no PR to probe"
        )


# =============================================================================
# AC-4 — a dry-run stays a dry-run (green-on-arrival side-effect guards)
# =============================================================================


class TestDryRunStaysSideEffectFree:
    """Adding a read-only probe must not drag any real Step 2 behavior into
    the dry-run. Green on HEAD and post-fix; intentional-green, logged."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_dry_run_performs_no_side_effects(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-4: the merged-PR dry-run must not merge, archive, transition,
        or clean up — it only reports. ``gh pr view`` is the sole permitted
        gh interaction beyond PR-number resolution.
        """
        session_path = project / ".session" / "155-31-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(side_effect=_make_merged_world_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-31", dry_run=True)

        assert not _merge_invoked(fake), "dry-run must NEVER invoke `gh pr merge`"
        assert mock_transition.call_count == 0, (
            "dry-run must never transition story status"
        )
        assert session_path.exists(), "dry-run must not remove the session file"
        assert list(archive_dir.iterdir()) == [], (
            "dry-run must not archive anything"
        )
        assert result.get("success") is True and result.get("dry_run") is True, (
            f"dry-run result contract {{success: True, dry_run: True}}: {result!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_dry_run_keeps_full_step_plan(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-4: the already-merged preview replaces ONLY the step-2 action;
        the rest of the plan (archive, Jira, YAML, branch, session steps)
        must survive intact.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_merged_world_run(),
        ):
            result = finish_story(project, "155-31", dry_run=True)

        step_ids = [s.get("step") for s in result.get("steps", [])]
        for expected in (1, 2, 3, 4, 5, 6, 7):
            assert expected in step_ids, (
                f"dry-run plan lost step {expected}: {step_ids!r}"
            )
        assert step_ids.count(2) == 1, (
            f"dry-run plan must have exactly one step-2 entry: {step_ids!r}"
        )
