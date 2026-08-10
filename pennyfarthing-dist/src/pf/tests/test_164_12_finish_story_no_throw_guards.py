"""Tests for story 164-12: finish_story no-throw boundary hardening.

Three call sites currently raise through finish_story's no-throw boundary
(SOUL #10):

1. _parse_session call site (line 1144): a session file with invalid/undecodable
   UTF-8 bytes causes ``session_path.read_text(encoding="utf-8")`` to raise
   UnicodeDecodeError — no try-except wraps the call.

2. _resolve_base_branch (~line 630): ``load_repos_config(project_root)`` raises
   on a malformed repos.yaml (yaml.scanner.ScannerError) and the exception
   propagates through finish_story's boundary uncaught.

3. _resolve_story_repos (~line 655): same ``load_repos_config`` raise on a
   malformed repos.yaml, propagating through finish_story's boundary at the
   call site on line 1174.

Guard pattern to mirror: the sibling ``read_sprint`` guard in
``handoff/resolve_gate.py`` (lines 98-109) catches ``(OSError, UnicodeDecodeError)``
and returns a clean ``{"status": "error", "error": "..."}`` result dict rather
than propagating the exception. The repos.yaml guards mirror the shape but
catch ``(ValueError, OSError)`` for yaml-parse failures (yaml.YAMLError is a
subclass of Exception, not ValueError — but wrapping either as ValueError in
load_repos_config, or catching yaml.YAMLError, is implementation detail for
Dev to choose; what the tests pin is the BEHAVIOR: no exception escapes).

These tests FAIL in RED state because the exceptions currently escape finish_story.
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import (
    _resolve_base_branch,
    _resolve_story_repos,
    finish_story,
)

# ============================================================================
# Shared project fixtures
# ============================================================================

_INDEX_YAML = """\
sprint:
  name: "Test164"
  jira_sprint_id: 164
  jira_sprint_name: "Test164"
  goal: Test no-throw guards
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "164"
stories: []
standalone_stories: []
"""

_SHARD_YAML = """\
id: "164"
type: epic
title: "finish hardening — 164-12 no-throw guards"
priority: p1
status: in_progress
stories:
  - id: 164-12
    title: Wrap finish_story parse_session UnicodeDecodeError
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

_SESSION_WITH_PR = """\
---
story_id: "164-12"
jira_key: ""
epic: "164"
workflow: "tdd"
---

# Story 164-12

## Story Details
- **ID:** 164-12
- **Workflow:** tdd
- **Branch:** feat/164-12-wrap-parse-session-unicode-guard
- **PR:** #512 - finish: wrap parse_session UnicodeDecodeError
"""

# Deliberately malformed YAML — yaml.safe_load raises yaml.scanner.ScannerError.
_MALFORMED_REPOS_YAML = """\
repos:
  : [unclosed bracket
  bad: key: here
"""

_VALID_REPOS_YAML = """\
repos:
  orchestrator:
    path: "."
    type: orchestrator
    default_branch: main
    branch_strategy: trunk-based
"""


def _make_project(
    tmp_path: Path,
    *,
    session_bytes: bytes | None = None,
    session_text: str | None = _SESSION_WITH_PR,
    repos_yaml: str | None = None,
) -> Path:
    """Minimal project layout for finish_story tests.

    session_bytes: write raw bytes to the session file (for undecodable UTF-8).
    session_text: write as UTF-8 text (defaults to a valid session with PR #512).
    repos_yaml: write to .pennyfarthing/repos.yaml (None = no file created).
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(_INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-164.yaml").write_text(_SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    session_path = session_dir / "164-12-session.md"
    if session_bytes is not None:
        session_path.write_bytes(session_bytes)
    elif session_text is not None:
        session_path.write_text(session_text, encoding="utf-8")
    if repos_yaml is not None:
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(exist_ok=True)
        (pf_dir / "repos.yaml").write_text(repos_yaml, encoding="utf-8")
    return tmp_path


def _make_fake_run(*, pr_state: str = "MERGED") -> Any:
    """Command-dispatching fake for story_finish._run.

    Returns a clean MERGED PR for view probes so the code path proceeds past
    the merge gate. A bare success is returned for all other subprocesses
    (merge, list, pf epic archive, etc.).
    """

    def _fake_run(cmd: list[str], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": pr_state,
                        "mergedAt": "2026-08-04T00:00:00Z" if pr_state == "MERGED" else None,
                        "mergeable": "MERGEABLE",
                        "mergeStateStatus": "CLEAN",
                        "baseRefName": "develop",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


# ============================================================================
# AC1: _parse_session call site — undecodable session bytes
# ============================================================================


class TestParseSessionUnicodeGuard:
    """AC1: a session file containing undecodable bytes must NOT raise through
    finish_story's no-throw boundary (SOUL #10).

    Current behavior: ``session_path.read_text(encoding="utf-8")`` at line 166
    raises ``UnicodeDecodeError``, which propagates uncaught from the call site
    at line 1144. These tests FAIL in RED state because finish_story raises
    instead of returning a clean failure result dict.
    """

    # No _run mock needed: finish_story raises at line 1144 before any subprocess.

    def test_undecodable_session_returns_failure_not_exception(
        self, tmp_path: Path
    ) -> None:
        """Binary garbage in session file → finish_story returns {success: False}.

        Currently raises UnicodeDecodeError (RED).
        """
        project = _make_project(
            tmp_path,
            # Valid UTF-8 prefix followed by lone continuation bytes that are
            # never valid UTF-8, guaranteed to trigger UnicodeDecodeError.
            session_bytes=b"# Story 164-12\n\xff\xfe\x80\x81invalid bytes",
        )
        result = finish_story(project, "164-12")
        assert result["success"] is False, (
            "finish_story must return {success: False} on an undecodable session file; "
            f"instead it raised or returned: {result}"
        )

    def test_undecodable_session_result_contains_error_key(
        self, tmp_path: Path
    ) -> None:
        """finish_story result for undecodable session must carry an 'error' key.

        Currently raises UnicodeDecodeError (RED).
        """
        project = _make_project(
            tmp_path,
            session_bytes=b"\xff\xfe\x00\x00unreadable content\x80\x81",
        )
        result = finish_story(project, "164-12")
        assert "error" in result, (
            f"Result must have an 'error' key explaining the decode failure: {result}"
        )

    def test_undecodable_session_error_mentions_session_file(
        self, tmp_path: Path
    ) -> None:
        """Error message should identify the session file so the operator knows what to fix.

        Currently raises UnicodeDecodeError (RED).
        """
        project = _make_project(
            tmp_path,
            session_bytes=b"\x80\x81\x82 invalid utf-8 \xff",
        )
        result = finish_story(project, "164-12")
        error_msg = result.get("error", "")
        assert "164-12-session.md" in error_msg or "164-12" in error_msg, (
            f"Error message must reference the session file so operators can identify "
            f"the problem; got: {error_msg!r}"
        )


# ============================================================================
# AC2: _resolve_base_branch — malformed repos.yaml
# ============================================================================


class TestResolveBaseBranchMalformedRepos:
    """AC2: _resolve_base_branch must not raise on a malformed repos.yaml.

    Current behavior: ``load_repos_config(project_root)`` calls
    ``yaml.safe_load(f)`` on the file; malformed YAML raises
    ``yaml.scanner.ScannerError`` (a subclass of ``yaml.YAMLError``), which
    propagates uncaught through ``_resolve_base_branch``.

    These tests FAIL in RED state because _resolve_base_branch raises.
    """

    def test_returns_develop_fallback_on_malformed_repos_yaml(
        self, tmp_path: Path
    ) -> None:
        """Malformed repos.yaml → _resolve_base_branch returns 'develop' (fallback).

        The docstring promises the fallback is 'develop' when no repos.yaml
        resolves. A parse error is functionally equivalent to 'no repos.yaml
        resolves' — degrading to 'develop' is the correct behavior.

        Currently raises yaml.scanner.ScannerError (RED).
        """
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_MALFORMED_REPOS_YAML, encoding="utf-8")
        result = _resolve_base_branch(tmp_path)
        assert result == "develop", (
            f"_resolve_base_branch must fall back to 'develop' when repos.yaml is "
            f"malformed; got {result!r}"
        )

    def test_does_not_raise_on_malformed_repos_yaml(self, tmp_path: Path) -> None:
        """_resolve_base_branch must not propagate yaml parse errors.

        Currently raises yaml.scanner.ScannerError (RED).
        """
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_MALFORMED_REPOS_YAML, encoding="utf-8")
        # If _resolve_base_branch raises, this test fails with an unexpected exception.
        try:
            _resolve_base_branch(tmp_path)
        except Exception as exc:
            pytest.fail(
                f"_resolve_base_branch raised {type(exc).__name__} on malformed "
                f"repos.yaml but must never propagate yaml errors through the "
                f"no-throw boundary: {exc}"
            )


# ============================================================================
# AC3: _resolve_story_repos — malformed repos.yaml + step-6 post-merge protection
# ============================================================================


class TestResolveStoryReposMalformedRepos:
    """AC3 (unit): _resolve_story_repos must not raise on a malformed repos.yaml.

    Current behavior: ``load_repos_config(project_root)`` raises on the malformed
    file, propagating uncaught.

    These tests FAIL in RED state because _resolve_story_repos raises.
    """

    def test_degrades_to_project_root_on_malformed_repos_yaml(
        self, tmp_path: Path
    ) -> None:
        """Malformed repos.yaml → _resolve_story_repos returns [(project_root, None)].

        Degrading to the project root paired with None config preserves the
        pre-162-6 behavior (an unresolvable repos field degrades to project root)
        and causes _git_cleanup to skip cleanly rather than crash.

        Currently raises yaml.scanner.ScannerError (RED).
        """
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_MALFORMED_REPOS_YAML, encoding="utf-8")
        result = _resolve_story_repos(tmp_path, {})
        assert result == [(tmp_path, None)], (
            f"_resolve_story_repos must degrade to [(project_root, None)] on "
            f"malformed repos.yaml; got {result!r}"
        )

    def test_does_not_raise_on_malformed_repos_yaml(self, tmp_path: Path) -> None:
        """_resolve_story_repos must not propagate yaml parse errors.

        Currently raises yaml.scanner.ScannerError (RED).
        """
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_MALFORMED_REPOS_YAML, encoding="utf-8")
        try:
            _resolve_story_repos(tmp_path, {})
        except Exception as exc:
            pytest.fail(
                f"_resolve_story_repos raised {type(exc).__name__} on malformed "
                f"repos.yaml but must never propagate yaml errors through the "
                f"no-throw boundary: {exc}"
            )


class TestFinishStoryMalformedReposYaml:
    """AC3 (integration): finish_story must not strand a story with a traceback
    when repos.yaml is malformed.

    Current behavior: finish_story raises at line 1174 (the _resolve_story_repos
    call site) before any merge is attempted, because load_repos_config propagates
    yaml.scanner.ScannerError uncaught.

    These tests FAIL in RED state because an exception escapes finish_story.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_story_returns_dict_not_exception_on_malformed_repos(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Malformed repos.yaml → finish_story returns a result dict, not a traceback.

        Currently raises yaml.scanner.ScannerError at the _resolve_story_repos
        call site (line 1174), before any merge or archive step runs. (RED)
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_project(tmp_path, repos_yaml=_MALFORMED_REPOS_YAML)
        fake = _make_fake_run(pr_state="MERGED")
        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, "164-12")

        assert isinstance(result, dict), (
            "finish_story must return a result dict on malformed repos.yaml; "
            "currently it raises, stranding the story with a traceback"
        )
        assert "success" in result, (
            f"Result dict must carry a 'success' key: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step6_records_skip_not_crash_when_repos_degrade(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """After _resolve_story_repos degrades to (root, None), step-6 skips cleanly.

        When repos.yaml is malformed, _resolve_story_repos should degrade to
        [(project_root, None)]. With repo_config=None, _git_cleanup at line 991
        records a skip ('root-repo-unresolved') rather than attempting mutations.
        The merged story is NOT stranded — it is marked done, and cleanup is
        reported as skipped for manual follow-up.

        Currently: finish_story raises before reaching any step (RED).
        After fix: finish_story completes and step 6 reports a skip.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_project(tmp_path, repos_yaml=_MALFORMED_REPOS_YAML)
        fake = _make_fake_run(pr_state="MERGED")
        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, "164-12")

        assert isinstance(result, dict), (
            "finish_story raised on malformed repos.yaml instead of returning a "
            "result — the story is stranded with a traceback"
        )
        steps = result.get("steps", [])
        step6_entries = [s for s in steps if s.get("step") == 6]
        assert step6_entries, (
            f"No step-6 entry in result steps; expected a skip record. "
            f"steps={steps}"
        )
        skipped_reasons = [s.get("skipped") for s in step6_entries]
        assert "root-repo-unresolved" in skipped_reasons, (
            f"Step 6 must record skipped='root-repo-unresolved' when repo_config "
            f"is None (degraded from malformed repos.yaml); got skipped={skipped_reasons}"
        )


# ============================================================================
# AC4: Regression — valid encoding + valid repos.yaml (or absent) unchanged
# ============================================================================


class TestRegressionValidSession:
    """AC4: the happy path (valid encoding, no malformed repos.yaml) is unchanged.

    These tests confirm the guards are try-except only and do not affect the
    normal code path. They should PASS both before and after the fix.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_valid_session_and_no_repos_yaml_returns_success(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Valid UTF-8 session + no repos.yaml → finish_story completes normally.

        No repos.yaml means load_repos_config returns {} (existing behavior).
        This must still work after the guards are added.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        # No repos_yaml kwarg → no .pennyfarthing/repos.yaml file created
        project = _make_project(tmp_path)
        fake = _make_fake_run(pr_state="MERGED")
        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, "164-12")

        assert result["success"] is True, (
            f"Valid session + no repos.yaml must succeed: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_valid_session_and_valid_repos_yaml_returns_success(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Valid UTF-8 session + valid repos.yaml → finish_story completes normally.

        The guard must not change behavior when repos.yaml is well-formed.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_project(tmp_path, repos_yaml=_VALID_REPOS_YAML)
        fake = _make_fake_run(pr_state="MERGED")
        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, "164-12")

        assert result["success"] is True, (
            f"Valid session + valid repos.yaml must succeed: {result}"
        )

    def test_resolve_base_branch_valid_repos_yaml(self, tmp_path: Path) -> None:
        """_resolve_base_branch returns the configured branch from a valid repos.yaml."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_VALID_REPOS_YAML, encoding="utf-8")
        result = _resolve_base_branch(tmp_path)
        # The valid yaml has path: "." and default_branch: main
        assert result == "main", (
            f"_resolve_base_branch must return the configured default_branch from "
            f"a valid repos.yaml; got {result!r}"
        )

    def test_resolve_story_repos_valid_repos_yaml(self, tmp_path: Path) -> None:
        """_resolve_story_repos returns the project root with valid repos.yaml (no repos: field)."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(_VALID_REPOS_YAML, encoding="utf-8")
        result = _resolve_story_repos(tmp_path, {})
        # story has no repos: field → degrades to project root (existing behavior)
        assert len(result) == 1, (
            f"_resolve_story_repos with no repos: field must return exactly one entry: {result}"
        )
        repo_path, repo_config = result[0]
        assert repo_path == tmp_path, (
            f"Degraded repo path must be project_root; got {repo_path!r}"
        )
