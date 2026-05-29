from pathlib import Path

import yaml

from pf.sprint.epic_from_plan import epic_from_plan

PLAN = """\
# Demo Plan

### Task 1: Add the widget

**Files:**
- Create: `pennyfarthing-dist/src/pf/widget.py`

- [ ] Step 1: write test

### Task 2: Wire the widget

**Files:**
- Modify: `pennyfarthing-dist/src/pf/app.py`

- [ ] Step 1: do it
"""


def _sprint(tmp_path: Path) -> Path:
    sprint_file = tmp_path / "current-sprint.yaml"
    data = {
        "sprint": {"name": "T", "number": 1, "status": "active",
                   "start_date": "2026-01-01", "end_date": "2026-01-14", "goal": "g"},
        "epics": [{"id": "99", "type": "epic", "title": "E", "priority": "p1",
                   "status": "backlog", "stories": []}],
    }
    sprint_file.write_text(yaml.safe_dump(data))
    return sprint_file


def test_creates_one_story_per_task(tmp_path):
    sprint_file = _sprint(tmp_path)
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN)
    res = epic_from_plan(sprint_file, plan, "99", project_root=tmp_path)
    assert res["success"], res
    assert len(res["created"]) == 2
    saved = yaml.safe_load(sprint_file.read_text())
    stories = saved["epics"][0]["stories"]
    assert [s["title"] for s in stories] == ["Add the widget", "Wire the widget"]
    assert all(s["workflow"] == "superpowers" for s in stories)
    assert stories[0]["plan_ref"] == "plan:plan.md#task-1"


def test_annotates_plan_with_closing_step(tmp_path):
    sprint_file = _sprint(tmp_path)
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN)
    res = epic_from_plan(sprint_file, plan, "99", project_root=tmp_path)
    text = plan.read_text()
    sid0 = res["created"][0]
    assert f"pf sprint story complete {sid0}" in text


def test_idempotent_rerun_skips_existing(tmp_path):
    sprint_file = _sprint(tmp_path)
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN)
    epic_from_plan(sprint_file, plan, "99", project_root=tmp_path)
    res2 = epic_from_plan(sprint_file, plan, "99", project_root=tmp_path)
    assert res2["success"]
    assert res2["created"] == []
    assert sorted(res2["skipped"]) == [1, 2]
    saved = yaml.safe_load(sprint_file.read_text())
    assert len(saved["epics"][0]["stories"]) == 2  # not duplicated


def test_missing_epic_errors(tmp_path):
    sprint_file = _sprint(tmp_path)
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN)
    res = epic_from_plan(sprint_file, plan, "404", project_root=tmp_path)
    assert not res["success"]
    assert "not found" in res["error"]


def test_no_tasks_errors(tmp_path):
    sprint_file = _sprint(tmp_path)
    plan = tmp_path / "plan.md"
    plan.write_text("# Empty\n\nno tasks here\n")
    res = epic_from_plan(sprint_file, plan, "99", project_root=tmp_path)
    assert not res["success"]
    assert "Task" in res["error"]
