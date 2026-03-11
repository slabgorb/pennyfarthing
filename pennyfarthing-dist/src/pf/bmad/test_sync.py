"""Tests for BMAD sync engine."""

from __future__ import annotations

from pathlib import Path

from pf.bmad.sync import (
    BmadSyncChange,
    BmadSyncPlan,
    DevAgentRecord,
    _collect_dev_record,
    _find_session_file,
    _parse_session_for_record,
    _populate_dev_agent_record,
    _update_bmad_file_status,
    format_sync_plan,
    generate_sync_plan,
)

# =============================================================================
# Fixtures
# =============================================================================


def _pf_story(
    story_id: str, bmad_key: str, status: str = "ready", jira: str = ""
) -> dict:
    return {
        "id": story_id,
        "title": f"Story {story_id}",
        "status": status,
        "bmad_key": bmad_key,
        "jira": jira,
        "points": 3,
    }


def _bmad_story(
    bmad_key: str, bmad_status: str = "ready-for-dev", jira: str = ""
) -> dict:
    from pf.bmad.parser import map_bmad_to_pf

    parts = bmad_key.split("-", 2)
    return {
        "id": f"{parts[0]}-{parts[1]}",
        "title": f"Story {bmad_key}",
        "status": map_bmad_to_pf(bmad_status),
        "bmad_key": bmad_key,
        "bmad_status": bmad_status,
        "bmad_path": f"/fake/{bmad_key}.md",
        "jira": jira,
        "epic_num": parts[0],
        "points": 3,
    }


_BLANK_DEV_RECORD = """\
# Story 1.1: Workspace

Status: ready-for-dev
Story-Key: 1-1-workspace
Jira: DPGD-10

## Story

Content here.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
"""

_POPULATED_DEV_RECORD = """\
# Story 1.2: Types

Status: done
Story-Key: 1-2-types

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context) via Claude Code CLI

### Debug Log References

- PR #17: https://github.com/1898andCo/axiathon/pull/17

### Completion Notes List

- Existing note one
- Existing note two

### File List

```
crates/axiathon-core/src/types.rs
```
"""

_SESSION_CONTENT = """\
# Story 1-5: Testing Framework
**Jira:** DPGD-21
**Workflow:** tdd
**Phase:** finish
**Branch:** feature/DPGD-21-testing-framework

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `Cargo.toml` — added workspace dev-dependencies
- `crates/axiathon-core/Cargo.toml` — added crate dev-dependencies

**Tests:** 57/57 passing (GREEN)
**Branch:** feature/DPGD-21-testing-framework (pushed)

**Handoff:** To next phase (review)

## Delivery Findings

- **Gap** (non-blocking): Missing snapshot review docs. Affects `docs/testing.md` (add section).
"""


# =============================================================================
# Sync Plan Generation
# =============================================================================


class TestGenerateSyncPlan:
    def test_all_in_sync(self):
        pf = [_pf_story("1-1", "1-1-workspace", "ready")]
        bmad = [_bmad_story("1-1-workspace", "ready-for-dev")]

        plan = generate_sync_plan(pf, bmad, direction="both")

        assert plan.both == ["1-1-workspace"]
        assert plan.changes == []
        assert plan.pf_only == []
        assert plan.bmad_only == []

    def test_pull_detects_bmad_change(self):
        pf = [_pf_story("1-1", "1-1-workspace", "ready")]
        bmad = [_bmad_story("1-1-workspace", "completed")]

        plan = generate_sync_plan(pf, bmad, direction="pull")

        assert len(plan.changes) == 1
        change = plan.changes[0]
        assert change.action == "update-pf"
        assert change.pf_value == "ready"
        assert change.bmad_value == "completed"
        assert change.target_value == "done"

    def test_push_detects_pf_change(self):
        pf = [_pf_story("2-1", "2-1-schema", "done")]
        bmad = [_bmad_story("2-1-schema", "ready-for-dev")]

        plan = generate_sync_plan(pf, bmad, direction="push")

        assert len(plan.changes) == 1
        change = plan.changes[0]
        assert change.action == "update-bmad"
        assert change.target_value == "done"

    def test_both_pf_wins(self):
        pf = [_pf_story("1-1", "1-1-workspace", "in_progress")]
        bmad = [_bmad_story("1-1-workspace", "ready-for-dev")]

        plan = generate_sync_plan(pf, bmad, direction="both", pf_wins=True)

        assert len(plan.changes) == 1
        assert plan.changes[0].action == "update-bmad"
        assert plan.changes[0].target_value == "in-progress"

    def test_both_bmad_wins(self):
        pf = [_pf_story("1-1", "1-1-workspace", "in_progress")]
        bmad = [_bmad_story("1-1-workspace", "completed")]

        plan = generate_sync_plan(pf, bmad, direction="both", pf_wins=False)

        assert len(plan.changes) == 1
        assert plan.changes[0].action == "update-pf"
        assert plan.changes[0].target_value == "done"

    def test_pf_only_stories(self):
        pf = [_pf_story("1-1", "1-1-workspace"), _pf_story("9-9", "9-9-custom")]
        bmad = [_bmad_story("1-1-workspace")]

        plan = generate_sync_plan(pf, bmad, direction="both")

        assert plan.pf_only == ["9-9-custom"]
        assert plan.both == ["1-1-workspace"]

    def test_bmad_only_stories(self):
        pf = [_pf_story("1-1", "1-1-workspace")]
        bmad = [_bmad_story("1-1-workspace"), _bmad_story("3-2-rule-parser")]

        plan = generate_sync_plan(pf, bmad, direction="both")

        assert plan.bmad_only == ["3-2-rule-parser"]

    def test_multiple_changes(self):
        pf = [
            _pf_story("1-1", "1-1-workspace", "done"),
            _pf_story("2-1", "2-1-schema", "in_progress"),
        ]
        bmad = [
            _bmad_story("1-1-workspace", "ready-for-dev"),
            _bmad_story("2-1-schema", "ready-for-dev"),
        ]

        plan = generate_sync_plan(pf, bmad, direction="push")

        assert len(plan.changes) == 2

    def test_empty_inputs(self):
        plan = generate_sync_plan([], [], direction="both")

        assert plan.changes == []
        assert plan.both == []
        assert plan.pf_only == []
        assert plan.bmad_only == []


# =============================================================================
# BMAD File Update
# =============================================================================


class TestUpdateBmadFile:
    def test_update_status_line(self, tmp_path: Path):
        md_file = tmp_path / "1-1-workspace.md"
        md_file.write_text(
            "# Story 1.1: Workspace\n\n"
            "Status: ready-for-dev\n"
            "Story-Key: 1-1-workspace\n"
            "Jira: DPGD-10 / DPGD-15\n\n"
            "## Story\n\nContent here.\n"
        )

        result = _update_bmad_file_status(str(md_file), "completed")

        assert result is True
        content = md_file.read_text()
        assert "Status: completed" in content
        assert "ready-for-dev" not in content
        # Other lines preserved
        assert "Story-Key: 1-1-workspace" in content
        assert "Jira: DPGD-10 / DPGD-15" in content

    def test_update_nonexistent_file(self, tmp_path: Path):
        result = _update_bmad_file_status(str(tmp_path / "missing.md"), "completed")
        assert result is False

    def test_update_file_without_status_line(self, tmp_path: Path):
        md_file = tmp_path / "no-status.md"
        md_file.write_text("# No status\n\nJust content.\n")

        result = _update_bmad_file_status(str(md_file), "completed")
        assert result is False


# =============================================================================
# Formatting
# =============================================================================


class TestFormatSyncPlan:
    def test_format_empty_plan(self):
        plan = BmadSyncPlan()
        output = format_sync_plan(plan)
        assert "Everything is in sync" in output

    def test_format_with_changes(self):
        plan = BmadSyncPlan(
            changes=[
                BmadSyncChange(
                    bmad_key="1-1-workspace",
                    pf_id="1-1",
                    field="status",
                    action="update-pf",
                    pf_value="ready",
                    bmad_value="completed",
                    target_value="done",
                )
            ],
            both=["1-1-workspace"],
        )
        output = format_sync_plan(plan)
        assert "Changes (1)" in output
        assert "BMAD→PF" in output
        assert "1-1-workspace" in output

    def test_format_with_new_bmad(self):
        plan = BmadSyncPlan(bmad_only=["3-2-rule-parser", "3-3-rule-engine"])
        output = format_sync_plan(plan)
        assert "New in BMAD (2)" in output
        assert "3-2-rule-parser" in output


# =============================================================================
# Dev Agent Record
# =============================================================================


class TestPopulateDevAgentRecord:
    def test_populates_blank_sections(self, tmp_path: Path):
        md_file = tmp_path / "story.md"
        md_file.write_text(_BLANK_DEV_RECORD)

        record = DevAgentRecord(
            agent_model="Claude Opus 4.6 via Claude Code CLI",
            debug_log_refs=["PR: https://github.com/example/pull/1"],
            completion_notes=["Fixed data mismatch"],
            file_list=["`src/lib.rs` — re-exports"],
        )

        result = _populate_dev_agent_record(str(md_file), record)

        assert result is True
        content = md_file.read_text()
        assert "Claude Opus 4.6 via Claude Code CLI" in content
        assert "PR: https://github.com/example/pull/1" in content
        assert "Fixed data mismatch" in content
        assert "`src/lib.rs` — re-exports" in content

    def test_overwrites_populated_sections(self, tmp_path: Path):
        md_file = tmp_path / "story.md"
        md_file.write_text(_POPULATED_DEV_RECORD)

        record = DevAgentRecord(
            agent_model="New Model",
            debug_log_refs=["New ref"],
            completion_notes=["New note"],
            file_list=["new_file.rs"],
        )

        result = _populate_dev_agent_record(str(md_file), record)

        assert result is True
        content = md_file.read_text()
        assert "New Model" in content
        assert "Claude Opus 4.6 (1M context)" not in content
        assert "New ref" in content
        assert "New note" in content
        assert "new_file.rs" in content

    def test_skips_empty_values(self, tmp_path: Path):
        md_file = tmp_path / "story.md"
        md_file.write_text(_BLANK_DEV_RECORD)

        record = DevAgentRecord(
            agent_model="Claude Opus 4.6",
            # No debug refs, notes, or files
        )

        _populate_dev_agent_record(str(md_file), record)
        content = md_file.read_text()
        assert "Claude Opus 4.6" in content
        # Other sections remain blank
        assert "### Debug Log References\n\n###" in content

    def test_nonexistent_file(self):
        result = _populate_dev_agent_record("/fake/missing.md", DevAgentRecord())
        assert result is False

    def test_no_dev_agent_record_section(self, tmp_path: Path):
        md_file = tmp_path / "story.md"
        md_file.write_text("# Story\n\nNo record section.\n")

        result = _populate_dev_agent_record(
            str(md_file), DevAgentRecord(agent_model="X")
        )
        assert result is False

    def test_preserves_surrounding_content(self, tmp_path: Path):
        md_file = tmp_path / "story.md"
        md_file.write_text(_BLANK_DEV_RECORD)

        record = DevAgentRecord(agent_model="Test Model")
        _populate_dev_agent_record(str(md_file), record)

        content = md_file.read_text()
        assert "# Story 1.1: Workspace" in content
        assert "Status: ready-for-dev" in content
        assert "Content here." in content


class TestParseSessionForRecord:
    def test_extracts_files_changed(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(_SESSION_CONTENT)

        record = _parse_session_for_record(session)

        assert len(record.file_list) == 2
        assert "`Cargo.toml` — added workspace dev-dependencies" in record.file_list[0]

    def test_extracts_branch(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(_SESSION_CONTENT)

        record = _parse_session_for_record(session)

        assert any("feature/DPGD-21" in r for r in record.debug_log_refs)

    def test_extracts_delivery_findings(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(_SESSION_CONTENT)

        record = _parse_session_for_record(session)

        finding_notes = [n for n in record.completion_notes if "[Finding]" in n]
        assert len(finding_notes) == 1
        assert "Missing snapshot review docs" in finding_notes[0]

    def test_sets_default_agent_model(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(_SESSION_CONTENT)

        record = _parse_session_for_record(session)

        assert "Claude Opus 4.6" in record.agent_model


class TestFindSessionFile:
    def test_finds_by_jira_key(self, tmp_path: Path):
        archive = tmp_path / "sprint" / "archive"
        archive.mkdir(parents=True)
        session = archive / "DPGD-21-session.md"
        session.write_text("# test")

        result = _find_session_file("DPGD-21", "1-5", tmp_path)

        assert result == session

    def test_returns_none_when_not_found(self, tmp_path: Path):
        (tmp_path / "sprint" / "archive").mkdir(parents=True)

        result = _find_session_file("DPGD-999", "99-99", tmp_path)

        assert result is None

    def test_prefers_active_over_archive(self, tmp_path: Path):
        active = tmp_path / ".session"
        active.mkdir()
        archive = tmp_path / "sprint" / "archive"
        archive.mkdir(parents=True)

        active_file = active / "DPGD-21-session.md"
        active_file.write_text("active")
        archive_file = archive / "DPGD-21-session.md"
        archive_file.write_text("archive")

        result = _find_session_file("DPGD-21", "1-5", tmp_path)

        assert result == active_file


class TestCollectDevRecord:
    def test_returns_none_for_non_push(self):
        change = BmadSyncChange(
            bmad_key="1-1-workspace",
            pf_id="1-1",
            field="status",
            action="update-pf",
            pf_value="ready",
            bmad_value="done",
            target_value="done",
        )
        assert _collect_dev_record(change, Path("/fake")) is None

    def test_returns_none_for_non_terminal_status(self):
        change = BmadSyncChange(
            bmad_key="1-1-workspace",
            pf_id="1-1",
            field="status",
            action="update-bmad",
            pf_value="in_progress",
            bmad_value="ready-for-dev",
            target_value="in-progress",
        )
        assert _collect_dev_record(change, Path("/fake")) is None

    def test_returns_record_for_review_with_session(self, tmp_path: Path):
        archive = tmp_path / "sprint" / "archive"
        archive.mkdir(parents=True)
        session = archive / "DPGD-21-session.md"
        session.write_text(_SESSION_CONTENT)

        change = BmadSyncChange(
            bmad_key="1-5-testing",
            pf_id="1-5",
            field="status",
            action="update-bmad",
            pf_value="in_review",
            bmad_value="ready-for-dev",
            target_value="review",
            jira_key="DPGD-21",
        )

        record = _collect_dev_record(change, tmp_path)

        assert record is not None
        assert "Claude Opus 4.6" in record.agent_model
        assert len(record.file_list) == 2


class TestJiraKeyOnChanges:
    def test_push_change_carries_jira_key(self):
        pf = [_pf_story("5-1", "5-1-query", "in_review", jira="DPGD-115")]
        bmad = [_bmad_story("5-1-query", "ready-for-dev", jira="DPGD-115")]

        plan = generate_sync_plan(pf, bmad, direction="push")

        assert len(plan.changes) == 1
        assert plan.changes[0].jira_key == "DPGD-115"

    def test_jira_key_from_compound_ref(self):
        pf = [_pf_story("1-1", "1-1-workspace", "done", jira="DPGD-10 / DPGD-15")]
        bmad = [_bmad_story("1-1-workspace", "ready-for-dev", jira="DPGD-10 / DPGD-15")]

        plan = generate_sync_plan(pf, bmad, direction="push")

        assert plan.changes[0].jira_key == "DPGD-10"
