"""Parse superpowers implementation plans into discrete Tasks."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_TASK_RE = re.compile(r"^###\s+Task\s+(\d+):\s*(.+?)\s*$")
_FILE_RE = re.compile(r"^\s*-\s*(?:Create|Modify|Test):\s*`([^`]+)`")


@dataclass
class PlanTask:
    """One `### Task N` block from a plan."""

    number: int
    title: str
    files: list[str] = field(default_factory=list)

    @property
    def anchor(self) -> str:
        return f"task-{self.number}"


def parse_plan(text: str) -> list[PlanTask]:
    """Return the ordered list of ``PlanTask`` parsed from plan markdown.

    A Task block runs from its ``### Task N:`` header until the next ``### ``
    or ``## `` header (or EOF). File paths come from ``- Create:``/``- Modify:``/
    ``- Test:`` bullets; any ``:line-range`` suffix is stripped. Lines inside
    fenced code blocks (``` or ~~~) are ignored, so example task headers in code
    samples are not mistaken for real tasks.
    """
    tasks: list[PlanTask] = []
    current: PlanTask | None = None
    in_fence = False

    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = _TASK_RE.match(line)
        if m:
            current = PlanTask(number=int(m.group(1)), title=m.group(2))
            tasks.append(current)
            continue
        if line.startswith("### ") or line.startswith("## "):
            current = None
            continue
        if current is not None:
            fm = _FILE_RE.match(line)
            if fm:
                path = fm.group(1).split(":")[0].strip()  # strip optional :line-range suffix
                if path and path not in current.files:
                    current.files.append(path)

    return tasks
