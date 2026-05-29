from pf.sprint.plan_parser import PlanTask, parse_plan  # noqa: F401

SAMPLE = """\
# Some Plan

**Goal:** do things

---

### Task 1: First Component

**Files:**
- Create: `sidequest-ui/src/Foo.tsx`
- Test: `sidequest-ui/src/Foo.test.tsx`

- [ ] Step 1: write test

### Task 2: Second Component

**Files:**
- Modify: `sidequest-server/app.py:10-20`

- [ ] Step 1: do it

## Closing Section

Not a task.
"""


def test_parses_task_headers_and_titles():
    tasks = parse_plan(SAMPLE)
    assert [t.number for t in tasks] == [1, 2]
    assert tasks[0].title == "First Component"
    assert tasks[1].title == "Second Component"


def test_extracts_files_stripping_line_ranges():
    tasks = parse_plan(SAMPLE)
    assert tasks[0].files == ["sidequest-ui/src/Foo.tsx", "sidequest-ui/src/Foo.test.tsx"]
    assert tasks[1].files == ["sidequest-server/app.py"]


def test_section_header_ends_task_block():
    tasks = parse_plan(SAMPLE)
    assert all(t.number in (1, 2) for t in tasks)


def test_anchor_is_task_n():
    tasks = parse_plan(SAMPLE)
    assert tasks[0].anchor == "task-1"


def test_empty_plan_returns_empty():
    assert parse_plan("# Nothing here\n") == []
