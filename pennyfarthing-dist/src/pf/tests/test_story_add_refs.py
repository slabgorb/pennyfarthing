from pathlib import Path

import yaml

from pf.sprint.story_add import add_story


def _write_sprint(tmp_path: Path) -> Path:
    sprint_file = tmp_path / "current-sprint.yaml"
    data = {
        "sprint": {
            "name": "Test", "number": 1, "status": "active",
            "start_date": "2026-01-01", "end_date": "2026-01-14",
            "goal": "test",
        },
        "epics": [
            {"id": "99", "type": "epic", "title": "E", "priority": "p1",
             "status": "backlog", "stories": []},
        ],
    }
    sprint_file.write_text(yaml.safe_dump(data))
    return sprint_file


def test_add_story_persists_plan_ref_and_superpowers_workflow(tmp_path):
    sprint_file = _write_sprint(tmp_path)
    res = add_story(
        sprint_file, "99", "Build the thing", 1,
        workflow="superpowers", repos="ui,server",
        plan_ref="plan:docs/superpowers/plans/p.md#task-1",
    )
    assert res["success"], res
    saved = yaml.safe_load(sprint_file.read_text())
    story = saved["epics"][0]["stories"][0]
    assert story["workflow"] == "superpowers"
    assert story["repos"] == "ui,server"
    assert story["plan_ref"] == "plan:docs/superpowers/plans/p.md#task-1"
