"""Tests for story 155-6: wire ``format_story_not_found_error`` into ``finish_story``.

From 153-8 Reviewer deferred findings (PR pennyfarthing#107): ``story_finish.py``
looks a story up with ``find_story_in_data`` but every not-found path is soft —
the jira-key fallback and the two transition/completed lookups all fall back to
defaults (``in_progress`` / skip) when the story is ``None``. So ``finish`` on an
unknown story id (as long as a session file exists) silently proceeds through
merge → yaml-update → cleanup instead of erroring with candidate IDs the way
``update``/``remove`` already do. The 153-8 AC named finish but it was never wired.

This is the exact "finish silently lies about done state" class that epic 155
exists to kill: an unknown/typo'd id must abort loudly and list the real IDs,
*before* any irreversible step — and the dry-run preview must not paint a rosy
plan for a story that does not exist.

lang-review coverage:
- **#1 silent exception swallowing** — the not-found path must NOT be swallowed
  by the ``try/except: pass`` around the lookups; it must surface as a result.
- **#6 test quality** — every test below asserts on the actual error text /
  side-effect state, never a vacuous truth.
- **SOUL #10 return-results** — asserts the ``{success, error}`` result shape
  rather than expecting a raised exception.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures — a real sprint with two known stories, plus a session file for an
# id that does NOT exist in the sprint YAML.
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test155"
  jira_sprint_id: 999
  jira_sprint_name: "Test155"
  goal: Test finish not-found
  start_date: 2026-07-01
  end_date: 2026-07-14
  status: active
  number: 1
epics:
  - "155"
"""

EPIC_155_SHARD = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
stories:
  - id: 155-6
    title: wire format_story_not_found_error into story_finish
    points: 2
    priority: p3
    status: in_review
    workflow: tdd
  - id: 155-7
    title: sibling story used to prove candidate listing
    points: 1
    priority: p3
    status: backlog
    workflow: tdd
"""

# Session for the KNOWN story (drives the regression-guard happy path).
KNOWN_SESSION = """\
---
story_id: "155-6"
jira_key: ""
epic: "155"
workflow: "tdd"
---
# Story 155-6
**Branch:** none
"""
# Branch is the none-sentinel (155-34 pre-adjustment): this file pins the
# unknown-story guard, not branch verification — the sentinel stays on the
# accepted no-PR arm before and after the 155-34 unmerged-branch guard.

# Session for an UNKNOWN story id — the session exists (so the session gate at
# the top of finish_story passes) but 155-99 is absent from the sprint YAML.
UNKNOWN_SESSION = """\
---
story_id: "155-99"
jira_key: ""
epic: "155"
workflow: "tdd"
---
# Story 155-99 (does not exist in sprint YAML)
**Branch:** feat/155-99
"""

UNKNOWN_ID = "155-99"
KNOWN_ID = "155-6"


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Full project layout: sprint/ (index + one epic shard + archive) and
    .session/ carrying session files for both a known and an unknown story id.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(EPIC_155_SHARD)
    (sprint_dir / "archive").mkdir()

    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / f"{KNOWN_ID}-session.md").write_text(KNOWN_SESSION)
    (session_dir / f"{UNKNOWN_ID}-session.md").write_text(UNKNOWN_SESSION)
    return tmp_path


# =============================================================================
# RED — finish on an unknown story id must abort loudly with candidate IDs.
# =============================================================================


class TestFinishUnknownStoryListsCandidates:
    """``finish_story`` on an id absent from the sprint YAML must return
    ``success: False`` with ``format_story_not_found_error`` text, and must not
    perform any irreversible step.
    """

    def test_unknown_story_returns_failure(self, project: Path) -> None:
        """A session-backed but YAML-absent id must not report success."""
        result = finish_story(project, UNKNOWN_ID)

        assert result["success"] is False, (
            "finish_story must abort on an unknown story id, not silently "
            f"proceed. Got: {result}"
        )
        assert "error" in result and result["error"], (
            f"finish_story must return an error message on not-found. Got: {result}"
        )

    def test_error_names_the_unknown_id(self, project: Path) -> None:
        """The error must name the missing id so the operator knows what failed."""
        result = finish_story(project, UNKNOWN_ID)

        assert UNKNOWN_ID in result.get("error", ""), (
            f"Error must name the missing id '{UNKNOWN_ID}'. Got: {result.get('error')!r}"
        )

    def test_error_lists_candidate_ids(self, project: Path) -> None:
        """The error must list available IDs (proves format_story_not_found_error
        is wired, not just any generic error) — matching update/remove behaviour.
        """
        result = finish_story(project, UNKNOWN_ID)
        error = result.get("error", "")

        assert "Available story IDs" in error, (
            "Error must list candidate IDs via format_story_not_found_error. "
            f"Got: {error!r}"
        )
        assert KNOWN_ID in error, (
            f"The real sibling id '{KNOWN_ID}' must appear among the candidates. "
            f"Got: {error!r}"
        )

    def test_unknown_story_makes_no_irreversible_changes(self, project: Path) -> None:
        """Abort must happen BEFORE archive/remove: the session file survives and
        nothing is written into the archive dir for the bogus id.
        """
        session_path = project / ".session" / f"{UNKNOWN_ID}-session.md"
        archive_dir = project / "sprint" / "archive"

        finish_story(project, UNKNOWN_ID)

        assert session_path.exists(), (
            "finish_story must not remove/archive the session when the story id "
            "is unknown — the abort must precede any irreversible step."
        )
        archived = list(archive_dir.glob(f"*{UNKNOWN_ID}*"))
        assert archived == [], (
            f"No archive artifact should be written for an unknown id, found: {archived}"
        )

    def test_dry_run_unknown_story_reports_not_found(self, project: Path) -> None:
        """Dry-run must not paint a rosy plan for a nonexistent story (epic 155:
        finish must never lie). The guard has to sit before the dry-run branch.
        """
        result = finish_story(project, UNKNOWN_ID, dry_run=True)

        assert result["success"] is False, (
            "dry-run finish on an unknown id must report failure, not a clean "
            f"plan. Got: {result}"
        )
        assert UNKNOWN_ID in result.get("error", ""), (
            f"dry-run not-found error must name '{UNKNOWN_ID}'. Got: {result.get('error')!r}"
        )


# =============================================================================
# Regression guard — the new not-found guard must NOT break a known story.
# (Passes today; pins that Dev's guard fires only for genuinely-missing ids.)
# =============================================================================


class TestFinishKnownStoryNotBlockedByGuard:
    """A story that exists in the sprint YAML must pass the not-found guard and
    finish normally. Mirrors the mock seams from test_151_3's loud finish tests.
    """

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    def test_known_story_passes_guard_and_finishes(
        self,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        project: Path,
    ) -> None:
        """finish_story on a KNOWN id must not emit the not-found error and must
        report success once the transition succeeds.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, KNOWN_ID)

        assert "Available story IDs" not in (result.get("error") or ""), (
            "The not-found guard must not fire for a story that exists. "
            f"Got: {result}"
        )
        assert result["success"] is True, (
            f"A known story must finish successfully. Got: {result}"
        )


# =============================================================================
# Guard edge cases (155-6 review rework) — read failures, zero-candidate
# sprints, and jira-key-shaped ids (the guard sits on find_story_in_data,
# which resolves both local ids and Jira keys).
# =============================================================================


class TestFinishGuardEdgeCases:
    @patch("pf.sprint.story_finish.read_sprint")
    def test_read_sprint_failure_returns_result_not_raise(
        self, mock_read_sprint: MagicMock, project: Path
    ) -> None:
        """A missing/malformed sprint YAML must surface as {success: False}, not a
        raw traceback — finish_story's no-throw contract (SOUL #10). read_sprint
        is documented to raise FileNotFoundError/ValueError.
        """
        mock_read_sprint.side_effect = ValueError("malformed sprint YAML")

        result = finish_story(project, KNOWN_ID)

        assert result["success"] is False, (
            f"read_sprint failure must return a result dict, not raise. Got: {result}"
        )
        assert "sprint data" in result.get("error", "").lower(), (
            f"error should explain the read failure. Got: {result.get('error')!r}"
        )
        assert result.get("story_id") == KNOWN_ID, (
            f"result should carry story_id for the read-failure branch. Got: {result}"
        )

    @patch("pf.sprint.story_finish.read_sprint")
    def test_zero_candidate_sprint_uses_legacy_message(
        self, mock_read_sprint: MagicMock, project: Path
    ) -> None:
        """When no stories exist to list, the error falls back to the legacy
        message with no 'Available story IDs' suffix.
        """
        mock_read_sprint.return_value = {"epics": [{"id": "155", "stories": []}]}

        result = finish_story(project, UNKNOWN_ID)
        error = result.get("error", "")

        assert result["success"] is False
        assert UNKNOWN_ID in error, f"error must name the missing id. Got: {error!r}"
        assert "Available story IDs" not in error, (
            f"a zero-candidate sprint must omit the candidate list. Got: {error!r}"
        )

    def test_unknown_jira_key_hits_not_found_with_candidates(self, project: Path) -> None:
        """The guard resolves Jira keys too — a bogus jira-key-shaped id must hit
        the not-found path (with candidates), not slip past the guard.
        """
        # finish_story checks the session (named by the arg) before the guard, so
        # a session named by the bogus jira key must exist to reach the guard.
        bogus_key = "PROJ-00000"
        (project / ".session" / f"{bogus_key}-session.md").write_text(
            f"---\nstory_id: \"{bogus_key}\"\njira_key: \"{bogus_key}\"\n---\n"
        )

        result = finish_story(project, bogus_key)

        assert result["success"] is False
        error = result.get("error", "")
        assert bogus_key in error, f"error must name the bogus key. Got: {error!r}"
        assert "Available story IDs" in error and KNOWN_ID in error, (
            f"guard must list local-id candidates for a bogus jira key. Got: {error!r}"
        )
