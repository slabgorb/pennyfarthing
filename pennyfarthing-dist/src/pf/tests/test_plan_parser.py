from pf.sprint.plan_parser import PlanTask, parse_plan

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
    titles = [t.title for t in tasks]
    assert "Closing Section" not in titles
    # Task 2 files must not include anything bled from the ## block
    assert tasks[1].files == ["sidequest-server/app.py"]


def test_anchor_is_task_n():
    tasks = parse_plan(SAMPLE)
    assert isinstance(tasks[0], PlanTask)
    assert tasks[0].anchor == "task-1"
    assert PlanTask(number=3, title="X").anchor == "task-3"


def test_empty_plan_returns_empty():
    assert parse_plan("# Nothing here\n") == []


def test_ignores_task_headers_inside_code_fences():
    text = (
        "### Task 1: Real task\n\n"
        "Here is an example plan in a code block:\n\n"
        "```\n"
        "### Task 2: Fake task in a fence\n"
        "- Create: `should/not/count.py`\n"
        "```\n\n"
        "### Task 3: Another real task\n"
    )
    tasks = parse_plan(text)
    assert [t.number for t in tasks] == [1, 3]
    assert [t.title for t in tasks] == ["Real task", "Another real task"]
    # the fenced Create: path must not attach to Task 1
    assert tasks[0].files == []
