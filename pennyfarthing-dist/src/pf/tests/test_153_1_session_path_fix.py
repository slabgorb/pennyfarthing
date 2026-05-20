"""Tests for sm-setup canonical session path + legacy migration — Story 153-1.

RED phase: defines the expected behavior of three new helpers plus a static
check on the sm-setup agent definition.

Story context (P0 framework reliability):
  sm-setup has been writing session files to the wrong path (`sprint/{id}-session.md`)
  instead of the canonical `.session/{id}-session.md`. Two fixes:
    1. sm-setup agent definition explicitly instructs writing to `.session/`.
    2. A migration helper relocates legacy session files written to the wrong
       location (idempotent, non-destructive).

Expected new module (Dev implements):
  pf.session.paths
    - canonical_session_path(root: Path, story_id: str) -> Path
    - find_legacy_sessions(root: Path) -> list[Path]
    - migrate_legacy_sessions(root: Path, *, dry_run: bool = False) -> dict

All tests in this module should FAIL until the helper module and the
sm-setup.md update are implemented.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_SESSION_CONTENT = """\
---
story_id: "100-1"
jira_key: null
epic: "100"
workflow: "tdd"
---

# Story 100-1: Example legacy session

## Workflow Tracking
**Workflow:** tdd
**Phase:** red
"""


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """A minimal project root with marker directory."""
    (tmp_path / ".pennyfarthing").mkdir()
    return tmp_path


def _write(p: Path, content: str = SAMPLE_SESSION_CONTENT) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


# ===========================================================================
# AC1: sm-setup writes session files to .session/{story-id}-session.md
# ===========================================================================


class TestCanonicalSessionPath:
    """canonical_session_path must always resolve to <root>/.session/<id>-session.md."""

    def test_returns_dot_session_directory(self, project_root: Path) -> None:
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "100-1")

        assert result.parent.name == ".session", (
            f"canonical path must live under '.session/', got parent={result.parent.name!r}"
        )

    def test_uses_story_id_session_md_filename(self, project_root: Path) -> None:
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "100-1")

        assert result.name == "100-1-session.md", (
            f"filename must be '{{story_id}}-session.md', got {result.name!r}"
        )

    def test_path_is_under_project_root(self, project_root: Path) -> None:
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "100-1")

        assert project_root in result.parents, (
            f"canonical path must be under project_root={project_root}, got {result}"
        )

    def test_returns_pathlib_path_not_string(self, project_root: Path) -> None:
        """Rule #5 (path handling): use pathlib.Path, not strings."""
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "100-1")

        assert isinstance(result, Path), f"must return Path, got {type(result).__name__}"

    def test_does_not_use_sprint_directory(self, project_root: Path) -> None:
        """The core regression check: never resolve to sprint/."""
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "100-1")

        assert "sprint" not in [p.name for p in result.parents], (
            f"canonical path MUST NOT include 'sprint/' anywhere; got {result}"
        )

    def test_works_with_alphanumeric_story_id(self, project_root: Path) -> None:
        """Story IDs may be Jira-style (PROJ-12345) or local (153-1)."""
        from pf.session.paths import canonical_session_path

        result = canonical_session_path(project_root, "PROJ-12345")

        assert result.name == "PROJ-12345-session.md"
        assert result.parent.name == ".session"

    def test_rejects_empty_story_id(self, project_root: Path) -> None:
        """Validate input at boundary — empty story_id is a programmer error."""
        from pf.session.paths import canonical_session_path

        with pytest.raises((ValueError, AssertionError)):
            canonical_session_path(project_root, "")

    def test_rejects_path_traversal_in_story_id(self, project_root: Path) -> None:
        """Rule #11 (input validation): reject `..` and `/` in story_id (CWE-22)."""
        from pf.session.paths import canonical_session_path

        with pytest.raises((ValueError, AssertionError)):
            canonical_session_path(project_root, "../escape")


class TestSmSetupAgentDocSpecifiesCanonicalPath:
    """The sm-setup.md agent definition must explicitly instruct writing to .session/."""

    # Resolve agents/sm-setup.md relative to pennyfarthing-dist/
    # test file: pennyfarthing-dist/src/pf/tests/test_*.py
    # parents[3] = pennyfarthing-dist/
    _AGENT_DOC = Path(__file__).resolve().parents[3] / "agents" / "sm-setup.md"

    def test_agent_doc_file_exists(self) -> None:
        """Sanity: the agent definition file is where we expect it."""
        assert self._AGENT_DOC.exists(), f"missing agent definition: {self._AGENT_DOC}"

    def test_write_session_file_step_mentions_canonical_path(self) -> None:
        """Step 4 ('Write Session File') must explicitly call out the path."""
        content = self._AGENT_DOC.read_text(encoding="utf-8")

        # Find the Step 4 section
        match = re.search(
            r"##\s*Step 4[^\n]*Write Session File\s*\n(.*?)(?=\n##\s*Step\s*5|\Z)",
            content,
            re.DOTALL,
        )
        assert match is not None, "missing '## Step 4: Write Session File' section"
        step_4 = match.group(1)

        # Step 4 body MUST mention the canonical path literally so LLMs follow it
        assert ".session/{STORY_ID}-session.md" in step_4 or ".session/${STORY_ID}-session.md" in step_4, (
            "Step 4 body must explicitly instruct writing to "
            "'.session/{STORY_ID}-session.md' — found no such mention.\n"
            f"Step 4 content was:\n{step_4[:500]}"
        )

    def test_agent_doc_does_not_instruct_sprint_path(self) -> None:
        """Negative: the agent must NOT instruct writing session files into sprint/."""
        content = self._AGENT_DOC.read_text(encoding="utf-8")

        # Forbidden: any direction to write a session file under sprint/
        # (sprint/archive/ is fine — that's the archive home, not the live path)
        forbidden_patterns = [
            r"sprint/\{STORY_ID\}-session\.md",
            r"sprint/\$\{STORY_ID\}-session\.md",
            r"Write[^\n]*session file[^\n]*sprint/",
        ]
        for pattern in forbidden_patterns:
            assert not re.search(pattern, content, re.IGNORECASE), (
                f"sm-setup.md still instructs writing session file into sprint/: "
                f"pattern={pattern!r} matched"
            )


# ===========================================================================
# AC2: Migration helper relocates legacy session files
# ===========================================================================


class TestFindLegacySessions:
    """find_legacy_sessions surfaces files in the wrong location only."""

    def test_finds_session_file_in_sprint_directory(self, project_root: Path) -> None:
        from pf.session.paths import find_legacy_sessions

        legacy = _write(project_root / "sprint" / "100-1-session.md")

        result = find_legacy_sessions(project_root)

        assert legacy in result, f"legacy file {legacy} not detected"

    def test_finds_multiple_legacy_files(self, project_root: Path) -> None:
        from pf.session.paths import find_legacy_sessions

        f1 = _write(project_root / "sprint" / "100-1-session.md")
        f2 = _write(project_root / "sprint" / "100-2-session.md")
        f3 = _write(project_root / "sprint" / "PROJ-9-session.md")

        result = set(find_legacy_sessions(project_root))

        assert {f1, f2, f3}.issubset(result), (
            f"expected all three legacy files; missing {{f1, f2, f3}} - result = {result}"
        )

    def test_ignores_archive_subdirectory(self, project_root: Path) -> None:
        """sprint/archive/*-session.md is INTENTIONAL — archive home, do not migrate."""
        from pf.session.paths import find_legacy_sessions

        archived = _write(project_root / "sprint" / "archive" / "99-1-session.md")

        result = find_legacy_sessions(project_root)

        assert archived not in result, (
            f"archive file must be left alone; found in legacy list: {archived}"
        )

    def test_ignores_canonical_dot_session_files(self, project_root: Path) -> None:
        """Files already in .session/ are not legacy."""
        from pf.session.paths import find_legacy_sessions

        canonical = _write(project_root / ".session" / "100-1-session.md")

        result = find_legacy_sessions(project_root)

        assert canonical not in result, (
            f"canonical file must not be flagged as legacy: {canonical}"
        )

    def test_returns_empty_when_sprint_dir_missing(self, project_root: Path) -> None:
        from pf.session.paths import find_legacy_sessions

        # sprint/ does not exist in this fixture
        result = find_legacy_sessions(project_root)

        assert result == [], f"expected empty list, got {result}"

    def test_only_matches_session_md_naming(self, project_root: Path) -> None:
        """Don't pick up unrelated files in sprint/."""
        from pf.session.paths import find_legacy_sessions

        _write(project_root / "sprint" / "current-sprint.yaml", "stories: []")
        _write(project_root / "sprint" / "epic-100.yaml", "title: x")
        _write(project_root / "sprint" / "100-1-context.md", "context")

        result = find_legacy_sessions(project_root)

        assert result == [], (
            f"only *-session.md files in sprint/ are legacy; got {result}"
        )


class TestMigrateLegacySessions:
    """migrate_legacy_sessions moves wrong-location session files into .session/."""

    def test_moves_legacy_file_to_canonical_location(self, project_root: Path) -> None:
        from pf.session.paths import migrate_legacy_sessions

        legacy = _write(project_root / "sprint" / "100-1-session.md")
        canonical = project_root / ".session" / "100-1-session.md"

        migrate_legacy_sessions(project_root)

        assert canonical.exists(), f"canonical {canonical} must exist after migration"
        assert not legacy.exists(), f"legacy {legacy} must be removed after migration"

    def test_preserves_file_content(self, project_root: Path) -> None:
        from pf.session.paths import migrate_legacy_sessions

        _write(project_root / "sprint" / "100-1-session.md", SAMPLE_SESSION_CONTENT)

        migrate_legacy_sessions(project_root)

        migrated = (project_root / ".session" / "100-1-session.md").read_text(encoding="utf-8")
        assert migrated == SAMPLE_SESSION_CONTENT, "content must survive migration byte-for-byte"

    def test_is_idempotent_when_no_legacy_remains(self, project_root: Path) -> None:
        """Running twice in a row produces the same final state, no errors."""
        from pf.session.paths import migrate_legacy_sessions

        _write(project_root / "sprint" / "100-1-session.md")

        result1 = migrate_legacy_sessions(project_root)
        result2 = migrate_legacy_sessions(project_root)

        # First run migrates 1; second run finds nothing to do
        assert len(result1.get("migrated", [])) == 1, (
            f"first run should migrate 1 file, got {result1}"
        )
        assert len(result2.get("migrated", [])) == 0, (
            f"second run should be a no-op, got {result2}"
        )
        # No errors on either run
        assert not result1.get("errors"), f"first run had errors: {result1}"
        assert not result2.get("errors"), f"idempotent second run had errors: {result2}"

    def test_non_destructive_when_canonical_already_exists_with_different_content(
        self, project_root: Path
    ) -> None:
        """If a canonical file exists with different content, do NOT overwrite it."""
        from pf.session.paths import migrate_legacy_sessions

        legacy = _write(project_root / "sprint" / "100-1-session.md", "LEGACY CONTENT")
        canonical = _write(
            project_root / ".session" / "100-1-session.md", "CANONICAL CONTENT"
        )

        result = migrate_legacy_sessions(project_root)

        # Canonical preserved
        assert canonical.read_text(encoding="utf-8") == "CANONICAL CONTENT", (
            "canonical session file must NOT be overwritten by legacy content"
        )
        # Legacy preserved too (non-destructive — caller decides what to do)
        assert legacy.exists(), "legacy file must not be deleted when conflict detected"
        # Conflict reported in result
        skipped = result.get("skipped", [])
        assert any(
            "100-1" in str(item) for item in skipped
        ), f"conflict must be reported in 'skipped'; got {result}"

    def test_safe_to_delete_legacy_when_canonical_identical(
        self, project_root: Path
    ) -> None:
        """If canonical exists and content is identical, the legacy duplicate may be cleaned."""
        from pf.session.paths import migrate_legacy_sessions

        legacy = _write(project_root / "sprint" / "100-1-session.md", SAMPLE_SESSION_CONTENT)
        canonical = _write(project_root / ".session" / "100-1-session.md", SAMPLE_SESSION_CONTENT)

        result = migrate_legacy_sessions(project_root)

        # Canonical still present with same content
        assert canonical.exists()
        assert canonical.read_text(encoding="utf-8") == SAMPLE_SESSION_CONTENT
        # Legacy no longer needed (duplicate removed) — and no errors
        assert not legacy.exists(), (
            "identical legacy duplicate should be cleaned up to avoid future ambiguity"
        )
        assert not result.get("errors"), f"identical-duplicate migration had errors: {result}"

    def test_dry_run_does_not_modify_filesystem(self, project_root: Path) -> None:
        from pf.session.paths import migrate_legacy_sessions

        legacy = _write(project_root / "sprint" / "100-1-session.md")
        canonical = project_root / ".session" / "100-1-session.md"

        result = migrate_legacy_sessions(project_root, dry_run=True)

        assert legacy.exists(), "dry-run must leave legacy file untouched"
        assert not canonical.exists(), "dry-run must NOT create canonical file"
        # But it should still report what it WOULD do
        assert result.get("migrated"), f"dry-run must report planned migrations; got {result}"

    def test_returns_structured_result(self, project_root: Path) -> None:
        """Result must be a dict with at least 'migrated', 'skipped', 'errors' keys."""
        from pf.session.paths import migrate_legacy_sessions

        result = migrate_legacy_sessions(project_root)

        assert isinstance(result, dict), f"expected dict, got {type(result).__name__}"
        for key in ("migrated", "skipped", "errors"):
            assert key in result, f"result missing required key {key!r}; got keys {list(result)}"

    def test_handles_missing_sprint_dir(self, project_root: Path) -> None:
        """No sprint/ in project → migration is a graceful no-op."""
        from pf.session.paths import migrate_legacy_sessions

        # No sprint/ dir created
        result = migrate_legacy_sessions(project_root)

        assert result.get("migrated") == [], f"expected no migrations, got {result}"
        assert not result.get("errors"), f"missing sprint/ must not raise errors, got {result}"

    def test_migrates_multiple_files_independently(self, project_root: Path) -> None:
        from pf.session.paths import migrate_legacy_sessions

        legacy_files = [
            _write(project_root / "sprint" / "100-1-session.md", "A"),
            _write(project_root / "sprint" / "100-2-session.md", "B"),
            _write(project_root / "sprint" / "PROJ-9-session.md", "C"),
        ]

        result = migrate_legacy_sessions(project_root)

        assert len(result.get("migrated", [])) == 3, (
            f"expected 3 migrations, got {result}"
        )
        for legacy in legacy_files:
            assert not legacy.exists(), f"legacy {legacy} should have been moved"
            canonical = project_root / ".session" / legacy.name
            assert canonical.exists(), f"canonical {canonical} should exist after migration"

    def test_creates_dot_session_dir_when_missing(self, project_root: Path) -> None:
        """If .session/ doesn't exist yet, the migration must create it."""
        from pf.session.paths import migrate_legacy_sessions

        _write(project_root / "sprint" / "100-1-session.md")
        assert not (project_root / ".session").exists()

        migrate_legacy_sessions(project_root)

        assert (project_root / ".session" / "100-1-session.md").exists()

    def test_does_not_touch_archive_files(self, project_root: Path) -> None:
        """Archive files (sprint/archive/*-session.md) must be left in place."""
        from pf.session.paths import migrate_legacy_sessions

        archived = _write(project_root / "sprint" / "archive" / "99-1-session.md", "ARCHIVED")

        migrate_legacy_sessions(project_root)

        assert archived.exists(), "archive file must not be migrated or removed"
        assert archived.read_text(encoding="utf-8") == "ARCHIVED"
        # And nothing should land in .session/ from the archive
        assert not (project_root / ".session" / "99-1-session.md").exists(), (
            "archive contents must not leak into .session/"
        )

    def test_uses_utf8_when_reading_and_writing(self, project_root: Path) -> None:
        """Rule #5: explicit encoding= for cross-platform safety (CWE-838)."""
        from pf.session.paths import migrate_legacy_sessions

        # Non-ASCII content (em dash) — would fail if migration opened without utf-8
        unicode_content = "# Story 100-1 — naïve façade\n\n## Notes\nñoño\n"
        _write(project_root / "sprint" / "100-1-session.md", unicode_content)

        migrate_legacy_sessions(project_root)

        migrated = (project_root / ".session" / "100-1-session.md").read_text(encoding="utf-8")
        assert migrated == unicode_content, "unicode content must survive migration"
