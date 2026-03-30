"""Tests for demo signal collector (story 145-1).

Tests validate collect_signals() and its helper functions against all 8 ACs.
Each AC maps to a test class. Tests are in RED state — stubs raise NotImplementedError.

Run with: python -m pytest tests/python/test_demo_collector.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.collector import (  # noqa: E402
    collect_signals,
    extract_file_extensions,
    get_commit_messages,
    get_pr_diff,
    get_review_findings,
    parse_session_fields,
)
from pf.demo.models import SignalBundle  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_SESSION = textwrap.dedent("""\
    # Story 99-1: Sample story for testing

    ## Story Details
    - **ID:** 99-1
    - **Workflow:** tdd
    - **Points:** 3
    - **Priority:** P0
    - **Epic:** 99 — Test Epic
    - **Repos:** pennyfarthing
    - **Branch:** feat/99-1-sample

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** red
    **Phase Started:** 2026-03-12T00:00:00Z

    ## Context
    This is a sample story for testing the signal collector.

    ## Acceptance Criteria
    - AC1: First acceptance criterion
    - AC2: Second acceptance criterion
""")

SAMPLE_SPRINT_DATA = {
    "sprint": {"name": "TO Sprint 2610", "status": "active"},
    "epics": [
        {
            "id": "epic-99",
            "title": "Test Epic",
            "jira": "PROJ-99999",
            "status": "in_progress",
            "stories": [
                {
                    "id": "99-1",
                    "title": "Sample story for testing",
                    "points": 3,
                    "jira": "PROJ-99991",
                    "status": "in_progress",
                    "branch": "feat/99-1-sample",
                    "acceptance_criteria": [
                        "First acceptance criterion",
                        "Second acceptance criterion",
                    ],
                },
            ],
        },
    ],
}

SAMPLE_DIFF = textwrap.dedent("""\
    diff --git a/src/pf/demo/collector.py b/src/pf/demo/collector.py
    new file mode 100644
    --- /dev/null
    +++ b/src/pf/demo/collector.py
    @@ -0,0 +1,30 @@
    +def collect_signals(story_id):
    +    pass
    diff --git a/tests/python/test_demo_collector.py b/tests/python/test_demo_collector.py
    new file mode 100644
    --- /dev/null
    +++ b/tests/python/test_demo_collector.py
    @@ -0,0 +1,10 @@
    +import pytest
    diff --git a/src/pf/demo/models.py b/src/pf/demo/models.py
    new file mode 100644
    --- /dev/null
    +++ b/src/pf/demo/models.py
    @@ -0,0 +1,5 @@
    +from dataclasses import dataclass
""")


@pytest.fixture
def project_tree(tmp_path):
    """Create a minimal project tree with session and sprint files."""
    # Session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "99-1-session.md").write_text(SAMPLE_SESSION)

    # Sprint files
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()

    return tmp_path


@pytest.fixture
def session_path(project_tree):
    """Path to the sample session file."""
    return project_tree / ".session" / "99-1-session.md"


# ---------------------------------------------------------------------------
# AC1: collect_signals returns a SignalBundle with all required fields
# ---------------------------------------------------------------------------


class TestCollectSignalsReturnsSignalBundle:
    """AC1: collect_signals(story_id) returns a SignalBundle dataclass."""

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_returns_result_object_with_signal_bundle(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """collect_signals returns {success: True, data: SignalBundle}."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": True, "data": SAMPLE_DIFF}

        result = collect_signals("99-1", project_root=project_tree)

        assert result["success"] is True
        assert isinstance(result["data"], SignalBundle)

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_signal_bundle_has_all_required_fields(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """SignalBundle has all 10 fields populated."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": True, "data": SAMPLE_DIFF}

        result = collect_signals("99-1", project_root=project_tree)
        bundle = result["data"]

        assert bundle.story_id == "99-1"
        assert bundle.title == "Sample story for testing"
        assert bundle.jira_key == "PROJ-99991"
        assert bundle.points == 3
        assert isinstance(bundle.acceptance_criteria, list)
        assert isinstance(bundle.pr_diff, str)
        assert isinstance(bundle.commit_messages, list)
        assert isinstance(bundle.session_fields, dict)
        assert isinstance(bundle.file_extensions, set)
        # review_findings can be None
        assert bundle.review_findings is None or isinstance(
            bundle.review_findings, str
        )

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_result_object_follows_adr_0008(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """Result has exactly {success, data, error} keys per ADR-0008."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": True, "data": SAMPLE_DIFF}

        result = collect_signals("99-1", project_root=project_tree)

        assert "success" in result
        assert isinstance(result["success"], bool)
        # On success: data present, error absent or None
        if result["success"]:
            assert "data" in result
        else:
            assert "error" in result


# ---------------------------------------------------------------------------
# AC2: Collects acceptance criteria from sprint YAML
# ---------------------------------------------------------------------------


class TestCollectAcceptanceCriteria:
    """AC2: Collects acceptance criteria from sprint YAML via pf.sprint.loader."""

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_acceptance_criteria_from_sprint_yaml(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """ACs are extracted from sprint YAML story data."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": True, "data": ""}

        result = collect_signals("99-1", project_root=project_tree)
        bundle = result["data"]

        assert bundle.acceptance_criteria == [
            "First acceptance criterion",
            "Second acceptance criterion",
        ]

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_empty_acceptance_criteria_when_none_defined(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """Stories without ACs get an empty list, not None."""
        data = {
            "sprint": {"name": "Test"},
            "epics": [
                {
                    "id": "epic-99",
                    "stories": [
                        {"id": "99-1", "title": "No ACs", "points": 1, "status": "in_progress"},
                    ],
                },
            ],
        }
        mock_load_sprint.return_value = data
        mock_pr_diff.return_value = {"success": True, "data": ""}

        result = collect_signals("99-1", project_root=project_tree)
        bundle = result["data"]

        assert bundle.acceptance_criteria == []


# ---------------------------------------------------------------------------
# AC3: Parses session file fields using **Key:** Value pattern
# ---------------------------------------------------------------------------


class TestParseSessionFields:
    """AC3: Parses session file fields using **Key:** Value markdown pattern."""

    def test_extracts_standard_fields(self, session_path):
        """Parses **Key:** Value lines into a dict."""
        fields = parse_session_fields(session_path)

        assert "id" in fields
        assert fields["id"] == "99-1"
        assert "workflow" in fields
        assert fields["workflow"] == "tdd"

    def test_keys_are_lowercased(self, session_path):
        """Field keys are normalized to lowercase."""
        fields = parse_session_fields(session_path)

        # All keys should be lowercase
        for key in fields:
            assert key == key.lower(), f"Key '{key}' should be lowercase"

    def test_multi_word_keys(self, session_path):
        """Multi-word keys like 'Phase Started' are preserved."""
        fields = parse_session_fields(session_path)

        assert "phase started" in fields

    def test_missing_session_file_returns_empty_dict(self, tmp_path):
        """Non-existent session file returns empty dict, not error."""
        missing = tmp_path / "nonexistent-session.md"
        fields = parse_session_fields(missing)

        assert fields == {}

    def test_empty_session_file_returns_empty_dict(self, tmp_path):
        """Empty session file returns empty dict."""
        empty = tmp_path / "empty-session.md"
        empty.write_text("")
        fields = parse_session_fields(empty)

        assert fields == {}

    def test_strips_whitespace_from_values(self, tmp_path):
        """Leading/trailing whitespace is stripped from values."""
        session = tmp_path / "session.md"
        session.write_text("- **Name:**   spaced value   \n")
        fields = parse_session_fields(session)

        assert fields["name"] == "spaced value"


# ---------------------------------------------------------------------------
# AC4: Retrieves PR diff via gh CLI, falls back to git diff
# ---------------------------------------------------------------------------


class TestGetPrDiff:
    """AC4: Retrieves PR diff via gh CLI, falls back to git diff."""

    @patch("subprocess.run")
    def test_returns_diff_from_gh_cli(self, mock_run):
        """Primary path: get diff via `gh pr diff`."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="diff --git a/file.py b/file.py\n+new line\n",
        )

        result = get_pr_diff("feat/99-1-sample")

        assert result["success"] is True
        assert "diff --git" in result["data"]

    @patch("subprocess.run")
    def test_falls_back_to_git_diff_when_gh_fails(self, mock_run):
        """Fallback: use git diff when gh CLI fails."""
        # First call (gh) fails, second call (git diff) succeeds
        mock_run.side_effect = [
            MagicMock(returncode=1, stderr="no PR found"),
            MagicMock(
                returncode=0,
                stdout="diff --git a/file.py b/file.py\n+fallback\n",
            ),
        ]

        result = get_pr_diff("feat/99-1-sample")

        assert result["success"] is True
        assert "fallback" in result["data"]

    @patch("subprocess.run")
    def test_truncates_diff_at_50k_chars(self, mock_run):
        """Diff is capped at 50,000 characters per ADR-0038."""
        huge_diff = "x" * 60_000
        mock_run.return_value = MagicMock(returncode=0, stdout=huge_diff)

        result = get_pr_diff("feat/99-1-sample")

        assert result["success"] is True
        assert len(result["data"]) <= 50_000

    @patch("subprocess.run")
    def test_returns_error_when_both_methods_fail(self, mock_run):
        """Returns error result when both gh and git diff fail."""
        mock_run.side_effect = [
            MagicMock(returncode=1, stderr="gh failed"),
            MagicMock(returncode=1, stderr="git failed"),
        ]

        result = get_pr_diff("feat/99-1-sample")

        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC5: Gathers commit messages from the story branch
# ---------------------------------------------------------------------------


class TestGetCommitMessages:
    """AC5: Gathers commit messages from the story branch."""

    @patch("subprocess.run")
    def test_returns_commit_messages(self, mock_run):
        """Collects commit messages via git log."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="feat: add collector\n\ntest: add failing tests\n\nfix: typo\n",
        )

        messages = get_commit_messages("feat/99-1-sample")

        assert len(messages) >= 1
        assert any("collector" in m for m in messages)

    @patch("subprocess.run")
    def test_returns_empty_list_when_no_commits(self, mock_run):
        """No commits on branch returns empty list, not error."""
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        messages = get_commit_messages("feat/99-1-sample")

        assert messages == []

    @patch("subprocess.run")
    def test_handles_multiline_commit_messages(self, mock_run):
        """Multi-line commit messages are handled correctly."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="feat: add feature\n\nThis is a longer description\nwith multiple lines\n",
        )

        messages = get_commit_messages("feat/99-1-sample")

        assert len(messages) >= 1


# ---------------------------------------------------------------------------
# AC6: Collects review findings if present
# ---------------------------------------------------------------------------


class TestGetReviewFindings:
    """AC6: Collects review findings if present in session/sprint data."""

    def test_returns_findings_from_archive(self, tmp_path):
        """Reads findings from sprint/archive/findings/{story-id}.md."""
        findings_dir = tmp_path / "sprint" / "archive" / "findings"
        findings_dir.mkdir(parents=True)
        (findings_dir / "99-1.md").write_text(
            "- **Gap** (non-blocking): Missing edge case test."
        )

        findings = get_review_findings("99-1", project_root=tmp_path)

        assert findings is not None
        assert "Missing edge case" in findings

    def test_returns_none_when_no_findings(self, tmp_path):
        """Returns None when no findings file exists."""
        (tmp_path / "sprint" / "archive" / "findings").mkdir(parents=True)

        findings = get_review_findings("99-1", project_root=tmp_path)

        assert findings is None

    def test_returns_none_when_findings_dir_missing(self, tmp_path):
        """Returns None gracefully when findings directory doesn't exist."""
        findings = get_review_findings("99-1", project_root=tmp_path)

        assert findings is None


# ---------------------------------------------------------------------------
# AC7: Extracts file extensions from PR diff
# ---------------------------------------------------------------------------


class TestExtractFileExtensions:
    """AC7: Extracts file extensions from PR diff for classification hints."""

    def test_extracts_python_and_test_extensions(self):
        """Extracts .py from diff headers."""
        extensions = extract_file_extensions(SAMPLE_DIFF)

        assert ".py" in extensions

    def test_extracts_multiple_extensions(self):
        """Extracts all unique extensions from diff."""
        diff = textwrap.dedent("""\
            diff --git a/src/main.rs b/src/main.rs
            diff --git a/src/lib.ts b/src/lib.ts
            diff --git a/styles/app.css b/styles/app.css
        """)

        extensions = extract_file_extensions(diff)

        assert ".rs" in extensions
        assert ".ts" in extensions
        assert ".css" in extensions

    def test_returns_empty_set_for_empty_diff(self):
        """Empty diff returns empty set."""
        extensions = extract_file_extensions("")

        assert extensions == set()

    def test_deduplicates_extensions(self):
        """Same extension from multiple files appears once."""
        diff = textwrap.dedent("""\
            diff --git a/src/foo.py b/src/foo.py
            diff --git a/src/bar.py b/src/bar.py
            diff --git a/src/baz.py b/src/baz.py
        """)

        extensions = extract_file_extensions(diff)

        assert extensions == {".py"}

    def test_handles_files_without_extensions(self):
        """Files like Dockerfile don't produce spurious extensions."""
        diff = "diff --git a/Dockerfile b/Dockerfile\n"

        extensions = extract_file_extensions(diff)

        # Dockerfile has no extension — should not appear
        assert "" not in extensions


# ---------------------------------------------------------------------------
# AC8: Returns error result for invalid story_id
# ---------------------------------------------------------------------------


class TestInvalidStoryId:
    """AC8: Returns proper error result when story_id is invalid (hard fail)."""

    @patch("pf.sprint.loader.load_sprint")
    def test_returns_error_for_nonexistent_story(self, mock_load_sprint, project_tree):
        """Story not found in sprint YAML returns error result."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA

        result = collect_signals("999-99", project_root=project_tree)

        assert result["success"] is False
        assert "error" in result
        assert "999-99" in result["error"]

    @patch("pf.sprint.loader.load_sprint")
    def test_returns_error_when_sprint_data_unavailable(
        self, mock_load_sprint, project_tree
    ):
        """Missing sprint YAML returns error result."""
        mock_load_sprint.return_value = None

        result = collect_signals("99-1", project_root=project_tree)

        assert result["success"] is False
        assert "error" in result

    def test_returns_error_for_empty_story_id(self, project_tree):
        """Empty string story_id returns error."""
        result = collect_signals("", project_root=project_tree)

        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# Edge cases and integration
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases that cross multiple ACs."""

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_missing_session_file_is_non_fatal(
        self, mock_load_sprint, mock_pr_diff, tmp_path
    ):
        """collect_signals succeeds even without a session file (non-fatal)."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": True, "data": ""}

        # No .session directory at all
        result = collect_signals("99-1", project_root=tmp_path)

        assert result["success"] is True
        assert result["data"].session_fields == {}

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_failed_pr_diff_is_non_fatal(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """collect_signals succeeds with empty diff when PR retrieval fails."""
        mock_load_sprint.return_value = SAMPLE_SPRINT_DATA
        mock_pr_diff.return_value = {"success": False, "error": "no PR"}

        result = collect_signals("99-1", project_root=project_tree)

        # PR diff failure should be non-fatal
        assert result["success"] is True
        assert result["data"].pr_diff == ""

    @patch("pf.demo.collector.get_pr_diff")
    @patch("pf.sprint.loader.load_sprint")
    def test_story_without_jira_key(
        self, mock_load_sprint, mock_pr_diff, project_tree
    ):
        """Stories without Jira key get jira_key=None."""
        data = {
            "sprint": {"name": "Test"},
            "epics": [
                {
                    "id": "epic-99",
                    "stories": [
                        {"id": "99-1", "title": "No Jira", "points": 2, "status": "in_progress"},
                    ],
                },
            ],
        }
        mock_load_sprint.return_value = data
        mock_pr_diff.return_value = {"success": True, "data": ""}

        result = collect_signals("99-1", project_root=project_tree)

        assert result["success"] is True
        assert result["data"].jira_key is None
