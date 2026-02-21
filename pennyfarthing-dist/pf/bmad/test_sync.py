"""Tests for BMAD sync engine."""

from __future__ import annotations

from pathlib import Path

from pf.bmad.sync import (
    BmadSyncChange,
    BmadSyncPlan,
    _update_bmad_file_status,
    format_sync_plan,
    generate_sync_plan,
)

# =============================================================================
# Fixtures
# =============================================================================


def _pf_story(story_id: str, bmad_key: str, status: str = "ready") -> dict:
    return {
        "id": story_id,
        "title": f"Story {story_id}",
        "status": status,
        "bmad_key": bmad_key,
        "points": 3,
    }


def _bmad_story(bmad_key: str, bmad_status: str = "ready-for-dev") -> dict:
    from pf.bmad.parser import map_bmad_to_pf

    parts = bmad_key.split("-", 2)
    return {
        "id": f"{parts[0]}-{parts[1]}",
        "title": f"Story {bmad_key}",
        "status": map_bmad_to_pf(bmad_status),
        "bmad_key": bmad_key,
        "bmad_status": bmad_status,
        "bmad_path": f"/fake/{bmad_key}.md",
        "epic_num": parts[0],
        "points": 3,
    }


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
        assert change.target_value == "completed"

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
