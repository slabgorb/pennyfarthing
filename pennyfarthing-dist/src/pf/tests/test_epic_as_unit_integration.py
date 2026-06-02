"""End-to-end integration test: epic_from_plan -> complete_story (closed loop).

Exercises the full epic-as-unit workflow:
  1. epic_from_plan ingests a plan and creates stories, annotating the plan.
  2. complete_story marks the first story done and checks its plan checkbox.
  3. The second story's checkbox is untouched.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from pf.sprint.epic_from_plan import epic_from_plan
from pf.sprint.story_complete import complete_story

PLAN = """\
# Integration Test Plan

### Task 1: Implement parser

**Files:**
- Create: `pennyfarthing-dist/src/pf/sprint/plan_parser.py`

- [ ] Step A: write the regex

### Task 2: Wire CLI

**Files:**
- Modify: `pennyfarthing-dist/src/pf/sprint/cli.py`

- [ ] Step B: register the command
"""


def _make_sprint(tmp_path: Path) -> Path:
    sprint_file = tmp_path / "current-sprint.yaml"
    data = {
        "sprint": {
            "name": "Integration",
            "number": 1,
            "status": "active",
            "start_date": "2026-01-01",
            "end_date": "2026-01-14",
            "goal": "epic-as-unit e2e",
        },
        "epics": [
            {
                "id": "99",
                "type": "epic",
                "title": "Epic-as-unit",
                "priority": "p1",
                "status": "backlog",
                "stories": [],
            }
        ],
    }
    sprint_file.write_text(yaml.safe_dump(data))
    return sprint_file


def test_epic_as_unit_closed_loop(tmp_path: Path) -> None:
    """Full loop: from-plan creates stories; complete checks exactly the right box."""
    sprint_file = _make_sprint(tmp_path)
    plan_file = tmp_path / "plan.md"
    plan_file.write_text(PLAN)

    # --- Phase 1: materialise stories ---
    result = epic_from_plan(sprint_file, plan_file, "99", project_root=tmp_path)
    assert result["success"], f"epic_from_plan failed: {result}"
    assert len(result["created"]) == 2, f"expected 2 stories, got {result['created']}"
    assert result["skipped"] == []

    sid_first = result["created"][0]
    sid_second = result["created"][1]

    # Plan should now have both annotation lines (unchecked)
    plan_text = plan_file.read_text()
    assert f"- [ ] **Story {sid_first} complete**" in plan_text
    assert f"- [ ] **Story {sid_second} complete**" in plan_text

    # Sprint YAML should have 2 stories with correct workflow and plan_ref
    saved = yaml.safe_load(sprint_file.read_text())
    stories = saved["epics"][0]["stories"]
    assert len(stories) == 2
    assert all(s["workflow"] == "superpowers" for s in stories)
    plan_refs = {s["id"]: s["plan_ref"] for s in stories}
    assert plan_refs[sid_first].startswith("plan:")
    assert "#task-1" in plan_refs[sid_first]
    assert plan_refs[sid_second].startswith("plan:")
    assert "#task-2" in plan_refs[sid_second]

    # --- Phase 2: complete the first story ---
    complete_result = complete_story(sprint_file, sid_first, project_root=tmp_path)
    assert complete_result["success"], f"complete_story failed: {complete_result}"
    assert complete_result["story_id"] == sid_first
    assert complete_result["plan_checked"] is True, "expected plan box to be checked"

    # First story status is done in YAML
    saved2 = yaml.safe_load(sprint_file.read_text())
    stories2 = {s["id"]: s for s in saved2["epics"][0]["stories"]}
    assert stories2[sid_first]["status"] == "done"
    assert stories2[sid_second]["status"] == "backlog"

    # Plan file: first story's box is checked; second story's box is still unchecked
    plan_text2 = plan_file.read_text()
    assert f"- [x] **Story {sid_first} complete**" in plan_text2
    assert f"- [ ] **Story {sid_second} complete**" in plan_text2
