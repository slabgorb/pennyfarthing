"""Tests for testing-runner test-result cache isolation — Story 158-2 (gh #53).

RED phase: defines the expected behavior of a new test-result cache module
plus a static check on the testing-runner agent definition.

Story context (P1 data-loss):
  The ``testing-runner`` subagent writes its test-result summary to
  ``.session/{STORY_ID}-session.md`` — the SAME path as the live workflow
  session file owned by the SM/TEA/Dev handoff machinery. When invoked with the
  active story's STORY_ID (the normal case during a TDD GREEN/verify run) it
  OVERWRITES the live session, destroying the agent assessments, Delivery
  Findings, Design Deviations and Workflow Tracking that the handoff gates parse.
  The session file is gitignored, so the clobber is unrecoverable.

  Root cause: the bash helpers the agent ``source``-d (``test-cache.sh``) were
  deleted; the markdown still instructs writing the cache to the bare
  ``.session/${STORY_ID}-session.md`` path (testing-runner.md line ~78), so the
  agent improvises and clobbers the live session.

  Fix (SOUL #11 "promote to a script", #10 "return results"): a durable helper
  that namespaces the cache by RUN_ID and never targets a live session, plus a
  markdown update so the agent routes its cache through that safe path.

Expected new module (Dev implements): ``pf.session.test_cache``
  - ``test_run_cache_path(root: Path, run_id: str) -> Path``
        → ``<root>/.session/test-runs/<run_id>.md``; validates ``run_id``
          (non-empty, ``[A-Za-z0-9_-]+``; rejects traversal / NUL byte).
  - ``is_live_session_file(path: Path) -> bool``
        → True iff the file exists and holds workflow frontmatter (``story_id:``)
          or an ``## ... Assessment`` heading.
  - ``write_test_run_cache(root: Path, run_id: str, content: str) -> dict``
        → result object ``{success, path?, error?}``; writes ``content`` to the
          namespaced cache path (creating parent dirs); MUST NEVER write to a
          live session file.

Static contract on ``agents/testing-runner.md``:
  - It must NOT instruct writing the cache to the bare
    ``.session/${STORY_ID}-session.md`` path.
  - It must route the cache to a namespaced, RUN_ID-keyed path (``test-runs``).

All behavioral tests in this module should FAIL until the helper module and the
testing-runner.md update are implemented (RED state for Dev handoff).
"""

from __future__ import annotations

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures / sample data
# ---------------------------------------------------------------------------

# A populated live workflow session — exactly what must survive a cache write.
LIVE_SESSION_CONTENT = """\
---
story_id: "67-1"
jira_key: null
epic: "67"
workflow: "tdd"
---
# Story 67-1: Example live session

## Workflow Tracking
**Workflow:** tdd
**Phase:** green

## Sm Assessment
Routing decided. Hand to Dev.

## Delivery Findings
- No upstream findings.

## Design Deviations
### Dev (implementation)
- No deviations from spec.
"""

# What testing-runner improvises today and clobbers the session with.
TEST_RESULT_SUMMARY = """\
# Test Session: 67-1-dev-green-rework2

result: GREEN
passed: 42
failed: 0
"""


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """A minimal project root with the ``.pennyfarthing`` marker + ``.session``."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    return tmp_path


# ===========================================================================
# AC2 — Cache path is namespaced and keyed on RUN_ID (issue options 1 + 2)
# ===========================================================================


class TestTestRunCachePath:
    """``test_run_cache_path`` resolves to a namespaced path, never the session."""

    def test_lives_under_test_runs_dir(self, root: Path) -> None:
        from pf.session.test_cache import test_run_cache_path

        result = test_run_cache_path(root, "67-1-dev-green-rework2")

        assert result.parent.name == "test-runs", (
            f"cache must live under '.session/test-runs/', got parent="
            f"{result.parent.name!r}"
        )
        assert result.parent.parent.name == ".session", (
            f"test-runs/ must sit under '.session/', got {result}"
        )

    def test_filename_is_run_id_md(self, root: Path) -> None:
        from pf.session.test_cache import test_run_cache_path

        result = test_run_cache_path(root, "67-1-dev-green-rework2")

        assert result.name == "67-1-dev-green-rework2.md", (
            f"cache filename must be '{{run_id}}.md', got {result.name!r}"
        )

    def test_never_equals_live_session_path(self, root: Path) -> None:
        """The core regression: the cache path must never be the session path."""
        from pf.session.paths import canonical_session_path
        from pf.session.test_cache import test_run_cache_path

        session = canonical_session_path(root, "67-1")
        # RUN_IDs during a story embed the STORY_ID, the original collision source.
        cache = test_run_cache_path(root, "67-1-dev-green-rework2")

        assert cache != session, (
            "test-run cache path MUST NOT collide with the live session path; "
            f"both resolved to {cache}"
        )

    def test_keyed_on_run_id_not_story_id(self, root: Path) -> None:
        """Two runs of the same story must yield two distinct cache files."""
        from pf.session.test_cache import test_run_cache_path

        first = test_run_cache_path(root, "67-1-tea-red")
        second = test_run_cache_path(root, "67-1-dev-green-rework2")

        assert first != second, (
            "cache must be keyed on the unique RUN_ID so concurrent/sequential "
            f"runs of one story do not overwrite each other; both were {first}"
        )

    def test_returns_pathlib_path(self, root: Path) -> None:
        """Rule (path-handling): return ``pathlib.Path``, not a string."""
        from pf.session.test_cache import test_run_cache_path

        result = test_run_cache_path(root, "67-1-tea-red")

        assert isinstance(result, Path), (
            f"must return Path, got {type(result).__name__}"
        )

    def test_path_is_under_root(self, root: Path) -> None:
        from pf.session.test_cache import test_run_cache_path

        result = test_run_cache_path(root, "67-1-tea-red")

        assert root in result.parents, (
            f"cache path must be under root={root}, got {result}"
        )

    def test_rejects_empty_run_id(self, root: Path) -> None:
        from pf.session.test_cache import test_run_cache_path

        with pytest.raises((ValueError, AssertionError)):
            test_run_cache_path(root, "")

    def test_rejects_path_traversal_run_id(self, root: Path) -> None:
        """Rule #11 (input validation): reject ``..`` / ``/`` in run_id (CWE-22)."""
        from pf.session.test_cache import test_run_cache_path

        with pytest.raises((ValueError, AssertionError)):
            test_run_cache_path(root, "../../escape")

    def test_rejects_nul_byte_run_id(self, root: Path) -> None:
        """Reject NUL byte (CWE-158) — path-truncation bypass."""
        from pf.session.test_cache import test_run_cache_path

        with pytest.raises((ValueError, AssertionError)):
            test_run_cache_path(root, "abc\x00xyz")


# ===========================================================================
# AC1 + AC3 — Live session survives a cache write (issue option 3 guard)
# ===========================================================================


class TestLiveSessionProtection:
    """A populated live session must survive a ``write_test_run_cache`` call."""

    def test_write_does_not_modify_existing_live_session(self, root: Path) -> None:
        """Headline regression for gh #53: the audit trail must be untouched."""
        from pf.session.test_cache import write_test_run_cache

        session = root / ".session" / "67-1-session.md"
        session.write_text(LIVE_SESSION_CONTENT, encoding="utf-8")
        before = session.read_bytes()

        # RUN_ID embeds the active STORY_ID — exactly the case that clobbered.
        result = write_test_run_cache(
            root, "67-1-dev-green-rework2", TEST_RESULT_SUMMARY
        )

        assert session.read_bytes() == before, (
            "live session file was modified by a test-result cache write — "
            "this is the gh #53 data-loss bug"
        )
        assert isinstance(result, dict) and result.get("success") is True, (
            f"writer must return a success result object, got {result!r}"
        )

    def test_cache_lands_at_namespaced_path(self, root: Path) -> None:
        from pf.session.test_cache import test_run_cache_path, write_test_run_cache

        run_id = "67-1-dev-green-rework2"
        result = write_test_run_cache(root, run_id, TEST_RESULT_SUMMARY)

        expected = test_run_cache_path(root, run_id)
        assert expected.exists(), f"cache content not written to {expected}"
        assert expected.read_text(encoding="utf-8") == TEST_RESULT_SUMMARY
        # And the result object points at the file it wrote.
        assert result.get("path") in (expected, str(expected)), (
            f"result.path must reference the cache file; got {result.get('path')!r}"
        )

    def test_is_live_session_file_detects_frontmatter(self, root: Path) -> None:
        from pf.session.test_cache import is_live_session_file

        session = root / ".session" / "67-1-session.md"
        session.write_text(LIVE_SESSION_CONTENT, encoding="utf-8")

        assert is_live_session_file(session) is True, (
            "a file with `story_id:` frontmatter must be detected as a live session"
        )

    def test_is_live_session_file_detects_assessment_heading(
        self, root: Path
    ) -> None:
        from pf.session.test_cache import is_live_session_file

        # No frontmatter, but an agent assessment heading is present.
        f = root / ".session" / "weird-session.md"
        f.write_text("# Story\n\n## Sm Assessment\nrouted\n", encoding="utf-8")

        assert is_live_session_file(f) is True, (
            "a file with an '## ... Assessment' heading must be detected as live"
        )

    def test_is_live_session_file_false_for_cache_file(self, root: Path) -> None:
        from pf.session.test_cache import is_live_session_file

        runs = root / ".session" / "test-runs"
        runs.mkdir(parents=True)
        cache = runs / "67-1-dev-green-rework2.md"
        cache.write_text(TEST_RESULT_SUMMARY, encoding="utf-8")

        assert is_live_session_file(cache) is False, (
            "a test-result summary must NOT be mistaken for a live session"
        )

    def test_is_live_session_file_false_for_missing(self, root: Path) -> None:
        from pf.session.test_cache import is_live_session_file

        assert is_live_session_file(root / ".session" / "nope.md") is False, (
            "a nonexistent path is not a live session"
        )


# ===========================================================================
# System / instructional fix — the testing-runner agent definition
# ===========================================================================


class TestTestingRunnerAgentDoc:
    """testing-runner.md must stop instructing a write to the live session path."""

    # test file: pennyfarthing-dist/src/pf/tests/test_*.py
    # parents[3] = pennyfarthing-dist/
    _AGENT_DOC = (
        Path(__file__).resolve().parents[3] / "agents" / "testing-runner.md"
    )

    def test_agent_doc_exists(self) -> None:
        assert self._AGENT_DOC.exists(), (
            f"missing agent definition: {self._AGENT_DOC}"
        )

    def test_does_not_write_cache_to_bare_session_path(self) -> None:
        """The clobbering instruction (line ~78) must be gone."""
        content = self._AGENT_DOC.read_text(encoding="utf-8")

        for bad in (
            ".session/${STORY_ID}-session.md",
            ".session/{STORY_ID}-session.md",
        ):
            assert bad not in content, (
                "testing-runner.md still instructs writing the test-result cache "
                f"to the live session path {bad!r} — this is the gh #53 clobber. "
                "Route the cache to a namespaced test-runs/ path instead."
            )

    def test_routes_cache_to_namespaced_run_path(self) -> None:
        """The Test Cache section must reference a RUN_ID-keyed test-runs path."""
        content = self._AGENT_DOC.read_text(encoding="utf-8")

        assert "test-runs" in content, (
            "testing-runner.md must route its cache through a namespaced "
            "'test-runs/' directory (issue #53 fix option 1)."
        )
        assert "RUN_ID" in content or "run_id" in content, (
            "testing-runner.md cache path must be keyed on RUN_ID "
            "(issue #53 fix option 2)."
        )
