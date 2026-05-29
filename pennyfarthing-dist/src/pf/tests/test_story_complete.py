from pathlib import Path

import yaml

from pf.sprint.story_complete import complete_story


def _sprint_with_story(tmp_path: Path, plan_ref: str | None) -> Path:
    sprint_file = tmp_path / "current-sprint.yaml"
    story = {"id": "99-1", "title": "Do it", "points": 1,
             "status": "in_progress", "workflow": "superpowers"}
    if plan_ref:
        story["plan_ref"] = plan_ref
    data = {
        "sprint": {"name": "T", "number": 1, "status": "active",
                   "start_date": "2026-01-01", "end_date": "2026-01-14", "goal": "g"},
        "epics": [{"id": "99", "type": "epic", "title": "E", "priority": "p1",
                   "status": "backlog", "stories": [story]}],
    }
    sprint_file.write_text(yaml.safe_dump(data))
    return sprint_file


def test_flips_status_to_done(tmp_path):
    sprint_file = _sprint_with_story(tmp_path, plan_ref=None)
    res = complete_story(sprint_file, "99-1", project_root=tmp_path)
    assert res["success"], res
    saved = yaml.safe_load(sprint_file.read_text())
    story = saved["epics"][0]["stories"][0]
    assert story["status"] == "done"
    assert "completed" in story
    assert res["plan_checked"] is False  # no plan_ref -> nothing to check


def test_checks_plan_box_when_ref_present(tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(
        "### Task 1: Do it\n\n"
        "- [ ] Step 1\n\n"
        "- [ ] **Story 99-1 complete** — run `pf sprint story complete 99-1`\n"
    )
    sprint_file = _sprint_with_story(tmp_path, plan_ref="plan:plan.md#task-1")
    res = complete_story(sprint_file, "99-1", project_root=tmp_path)
    assert res["success"]
    assert res["plan_checked"] is True
    text = plan.read_text()
    assert "- [x] **Story 99-1 complete**" in text
    assert "- [ ] Step 1" in text  # other boxes untouched


def test_missing_story_returns_error(tmp_path):
    sprint_file = _sprint_with_story(tmp_path, plan_ref=None)
    res = complete_story(sprint_file, "99-404", project_root=tmp_path)
    assert not res["success"]
