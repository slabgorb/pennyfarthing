"""Tests for gating Jira behavior on sentinel ``jira`` values.

Story: 160-3 — Gate raw-truthy ``story.get('jira')`` in story_transition.py and
story_finish.py via the shared ``_has_real_jira_key`` helper + a single
``NO_JIRA_SENTINELS`` constant (from the 156-2 review).

TDD RED phase: these tests FAIL until Dev consolidates the helper into the shared
location and replaces the raw-truthy gates at both call sites.

Bug (confirmed empirically before writing these tests):
- A story carrying a sentinel ``jira`` value (e.g. the literal string ``"none"``)
  is TRUTHY, so ``story.get("jira")`` lets it through the Jira gate. In
  ``transition_story`` this calls ``get_client()`` and reports ``jira_key="none"``;
  in ``finish_story`` it archives the session as ``none-session.md`` and emits
  ``Transition none to Done``.
- Correct behavior: a sentinel ``jira`` value must behave EXACTLY like a missing
  Jira key — no Jira client call, ``jira_key`` reported as ``None``, session
  archived under the story ID.

The sentinel set + case-insensitivity are derived from the existing 156-2 logic in
``story_update.py`` (``_NO_JIRA_SENTINELS = {"", "none", "null", "x"}``), NOT from
assumption. Note "skip" is deliberately NOT a sentinel in the established set.

Designed interface for Dev (AC3 — one constant, one shared helper):
- ``pf.sprint.loader.NO_JIRA_SENTINELS``  (public ``frozenset[str]``)
- ``pf.sprint.loader._has_real_jira_key(story: dict) -> bool``
- ``story_update.py`` must consume these (no parallel/duplicated definition).

Acceptance Criteria:
1. Sentinel ``jira`` value → no Jira path in transition AND finish.
2. Real key (PROJ-12345) → Jira path unchanged.
3. ONE ``NO_JIRA_SENTINELS`` constant + ONE shared ``_has_real_jira_key``.
4. Missing/empty ``jira`` behaves as no-Jira (unchanged falsy behavior).
5. No regression in existing transition/finish tests.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story
from pf.sprint.story_transition import transition_story

# =============================================================================
# Test Data
# =============================================================================


def _sprint_yaml(jira_line: str) -> str:
    """Build a one-story sprint YAML, optionally injecting a ``jira:`` line."""
    return f"""\
sprint:
  name: "Sentinel Sprint"
  goal: Gate sentinel jira values
  start_date: 2026-06-01
  end_date: 2026-06-15
  status: active
epics:
  - id: "160"
    type: epic
    title: "Sentinel Epic"
    priority: p1
    status: in_progress
    stories:
      - id: 160-99
        title: Story with sentinel jira
        points: 1
        priority: p3
        status: in_progress
{jira_line}        workflow: trivial
      - id: 160-98
        title: Story in review with sentinel jira
        points: 1
        priority: p3
        status: in_review
{jira_line}        workflow: trivial
"""


def _session(jira_value: str) -> str:
    return f"""\
---
story_id: "160-99"
jira_key: "{jira_value}"
epic: "160"
workflow: "tdd"
---

# Story 160-99: Story with sentinel jira

## Story Details

- **ID:** 160-99
- **Jira:** {jira_value}
- **Branch:** none
"""
# Branch is the none-sentinel (155-34 pre-adjustment): these worlds pin jira
# sentinel gating and archive naming, not branch verification — the sentinel
# stays on the accepted no-PR arm before and after the 155-34 guard.


# Real-Jira sprint for AC2 regression.
REAL_JIRA_YAML = """\
sprint:
  name: "Real Jira Sprint"
  goal: Regression
  start_date: 2026-06-01
  end_date: 2026-06-15
  status: active
epics:
  - id: "160"
    type: epic
    title: "Real Jira Epic"
    priority: p1
    status: in_progress
    jira: PROJ-12300
    stories:
      - id: 160-1
        title: Real jira story
        points: 1
        priority: p3
        status: in_progress
        jira: PROJ-12345
        workflow: trivial
      - id: 160-2
        title: Real jira story in review
        points: 1
        priority: p3
        status: in_review
        jira: PROJ-12346
        workflow: trivial
"""

REAL_JIRA_SESSION = """\
---
story_id: "160-1"
jira_key: "PROJ-12345"
epic: "160"
workflow: "tdd"
---

# Story 160-1: Real jira story

## Story Details

- **ID:** 160-1
- **Jira:** [PROJ-12345](https://jira.example.com/browse/PROJ-12345)
- **Branch:** feature/PROJ-12345-real
- **PR:** #99 - Real story PR
"""


# =============================================================================
# Fixtures
# =============================================================================


def _make_project(tmp_path: Path, sprint_yaml: str, session_name: str, session_text: str) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(sprint_yaml)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / session_name).write_text(session_text)
    return tmp_path


# Every value here normalizes to "no real jira" per the 156-2 sentinel set.
SENTINEL_JIRA_LINES = pytest.mark.parametrize(
    "jira_line",
    [
        "        jira: none\n",
        "        jira: None\n",
        "        jira: NONE\n",
        "        jira: null\n",
        '        jira: "x"\n',
        '        jira: "  none  "\n',
    ],
)


# =============================================================================
# AC3: ONE shared constant + ONE shared helper
# =============================================================================


class TestSharedSentinelSurface:
    """AC3: the sentinel set and helper live in one shared place."""

    def test_no_jira_sentinels_constant_importable(self) -> None:
        """A single public NO_JIRA_SENTINELS constant exists in the shared module."""
        from pf.sprint.loader import NO_JIRA_SENTINELS

        assert "none" in NO_JIRA_SENTINELS
        assert "null" in NO_JIRA_SENTINELS
        assert "x" in NO_JIRA_SENTINELS
        assert "" in NO_JIRA_SENTINELS
        # "skip" is NOT part of the established 156-2 set.
        assert "skip" not in NO_JIRA_SENTINELS

    def test_has_real_jira_key_importable(self) -> None:
        """The shared helper is importable from the same module as the constant."""
        from pf.sprint.loader import _has_real_jira_key

        assert _has_real_jira_key({"jira": "PROJ-12345"}) is True
        assert _has_real_jira_key({"jira": "none"}) is False

    def test_story_update_uses_shared_definition(self) -> None:
        """story_update must consume the shared constant — not a parallel copy.

        Identity check: the object referenced by story_update is the same object
        defined in the shared loader module (no duplicated literal set).
        """
        import pf.sprint.story_update as su
        from pf.sprint.loader import NO_JIRA_SENTINELS

        shared = set(NO_JIRA_SENTINELS)
        # story_update may keep the old private alias, but it must resolve to the
        # shared values rather than redefining them.
        update_set = getattr(su, "_NO_JIRA_SENTINELS", None) or getattr(
            su, "NO_JIRA_SENTINELS", None
        )
        assert update_set is not None, "story_update lost its sentinel reference"
        assert set(update_set) == shared

    def test_helper_semantics_match_156_2(self) -> None:
        """Case-insensitive, whitespace-stripped, non-str truthy fallback."""
        from pf.sprint.loader import _has_real_jira_key

        assert _has_real_jira_key({"jira": "None"}) is False
        assert _has_real_jira_key({"jira": "  none  "}) is False
        assert _has_real_jira_key({"jira": "null"}) is False
        assert _has_real_jira_key({"jira": "x"}) is False
        assert _has_real_jira_key({"jira": ""}) is False
        assert _has_real_jira_key({"jira": None}) is False
        assert _has_real_jira_key({}) is False
        assert _has_real_jira_key({"jira": "PROJ-12345"}) is True


# =============================================================================
# AC1: sentinel jira → NO Jira path in transition
# =============================================================================


class TestTransitionSkipsSentinelJira:
    """AC1: a sentinel jira value must be treated exactly like no Jira key."""

    @SENTINEL_JIRA_LINES
    def test_transition_does_not_call_jira_client(
        self, tmp_path: Path, jira_line: str
    ) -> None:
        """get_client must NOT be called for a sentinel-jira story."""
        project = _make_project(
            tmp_path, _sprint_yaml(jira_line), "160-99-session.md", _session("none")
        )
        with patch("pf.sprint.story_transition.get_client") as mock_get_client:
            result = transition_story(project, "160-99", "in_review")

            assert result["success"] is True, result.get("error")
            mock_get_client.assert_not_called()

    @SENTINEL_JIRA_LINES
    def test_transition_reports_jira_key_none(
        self, tmp_path: Path, jira_line: str
    ) -> None:
        """Sentinel jira must surface as jira_key=None, not the sentinel string."""
        project = _make_project(
            tmp_path, _sprint_yaml(jira_line), "160-99-session.md", _session("none")
        )
        with patch("pf.sprint.story_transition.get_client"):
            result = transition_story(project, "160-99", "in_review")

        assert result["success"] is True, result.get("error")
        assert result["jira_key"] is None

    @SENTINEL_JIRA_LINES
    def test_transition_marks_jira_step_skipped(
        self, tmp_path: Path, jira_line: str
    ) -> None:
        """The jira_transition step must be present and skipped (not executed)."""
        project = _make_project(
            tmp_path, _sprint_yaml(jira_line), "160-99-session.md", _session("none")
        )
        with patch("pf.sprint.story_transition.get_client"):
            result = transition_story(project, "160-99", "in_review")

        assert result["success"] is True, result.get("error")
        jira_steps = [s for s in result["steps"] if s["action"] == "jira_transition"]
        assert len(jira_steps) == 1
        assert jira_steps[0].get("skipped") is True


# =============================================================================
# AC1: sentinel jira → NO Jira path in finish
# =============================================================================


class TestFinishSkipsSentinelJira:
    """AC1: finish must treat sentinel jira like no Jira key."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_archives_under_story_id_not_sentinel(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Session must archive as 160-99-session.md, never none-session.md."""
        project = _make_project(
            tmp_path,
            _sprint_yaml("        jira: none\n"),
            "160-99-session.md",
            _session("none"),
        )
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "160-99")

        assert result["success"] is True, result.get("error")
        good = project / "sprint" / "archive" / "160-99-session.md"
        bad = project / "sprint" / "archive" / "none-session.md"
        assert good.exists(), f"Expected archive at {good}"
        assert not bad.exists(), "Sentinel leaked into archive filename"

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_reports_jira_key_none(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """finish result must report jira_key None for a sentinel-jira story."""
        project = _make_project(
            tmp_path,
            _sprint_yaml("        jira: none\n"),
            "160-99-session.md",
            _session("none"),
        )
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "160-99")

        assert result["success"] is True, result.get("error")
        assert result.get("jira_key") is None

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_dry_run_skips_jira_for_sentinel(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Dry-run jira step (3) must be skipped and not name the sentinel."""
        project = _make_project(
            tmp_path,
            _sprint_yaml("        jira: none\n"),
            "160-99-session.md",
            _session("none"),
        )
        result = finish_story(project, "160-99", dry_run=True)

        assert result["success"] is True, result.get("error")
        step3 = next((s for s in result["steps"] if s["step"] == 3), None)
        assert step3 is not None
        action = step3["action"]
        assert "none" not in action, f"Sentinel leaked into dry-run step: {action!r}"
        assert "Skip" in action or "skip" in action.lower()


# =============================================================================
# AC4: missing/empty jira behaves as no-Jira (unchanged falsy behavior)
# =============================================================================


class TestMissingOrEmptyJira:
    """AC4: missing/empty jira keeps the existing no-Jira behavior."""

    def test_transition_missing_jira_skips_client(self, tmp_path: Path) -> None:
        """No jira field at all → no client call, jira_key None (unchanged)."""
        project = _make_project(
            tmp_path, _sprint_yaml(""), "160-99-session.md", _session("none")
        )
        with patch("pf.sprint.story_transition.get_client") as mock_get_client:
            result = transition_story(project, "160-99", "in_review")

            assert result["success"] is True, result.get("error")
            assert result["jira_key"] is None
            mock_get_client.assert_not_called()

    def test_transition_empty_string_jira_skips_client(self, tmp_path: Path) -> None:
        """Empty-string jira → treated as no-Jira."""
        project = _make_project(
            tmp_path,
            _sprint_yaml('        jira: ""\n'),
            "160-99-session.md",
            _session("none"),
        )
        with patch("pf.sprint.story_transition.get_client") as mock_get_client:
            result = transition_story(project, "160-99", "in_review")

            assert result["success"] is True, result.get("error")
            assert result["jira_key"] is None
            mock_get_client.assert_not_called()


# =============================================================================
# AC2: real Jira key → Jira path unchanged (regression)
# =============================================================================


class TestRealJiraKeyUnchanged:
    """AC2: a genuine Jira key still drives the Jira path exactly as before."""

    @patch("pf.sprint.story_transition.get_client")
    def test_transition_real_key_calls_jira(
        self, mock_get_client: MagicMock, tmp_path: Path
    ) -> None:
        """Real key still instantiates the client and transitions Jira."""
        mock_client = MagicMock()
        mock_client.token = "tok"
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        project = _make_project(
            tmp_path, REAL_JIRA_YAML, "160-1-session.md", REAL_JIRA_SESSION
        )

        result = transition_story(project, "160-1", "in_review")

        assert result["success"] is True, result.get("error")
        assert result["jira_key"] == "PROJ-12345"
        mock_client.transition_sync.assert_called_once_with("PROJ-12345", "In Review")

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_real_key_unchanged(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """finish with a real key still reports it and archives under the key."""
        project = _make_project(
            tmp_path, REAL_JIRA_YAML, "160-1-session.md", REAL_JIRA_SESSION
        )
        mock_transition.return_value = {"success": True, "to_status": "done"}
        # 155-1: finish verifies the PR merged via `gh pr view --json state`.
        mock_run.return_value = MagicMock(returncode=0, stdout='{"state": "MERGED"}')

        result = finish_story(project, "160-1")

        assert result["success"] is True, result.get("error")
        assert result["jira_key"] == "PROJ-12345"
        assert (project / "sprint" / "archive" / "PROJ-12345-session.md").exists()
