"""Regression tests for Story 164-17 — `**Phase Started:**` rewrite must replace
the WHOLE value, not just up to the first space (159-4 review finding).

`complete_phase` rewrote the header with `r"(\\*\\*Phase Started:\\*\\*) \\S+"`.
`\\S+` stops at whitespace, so a space-separated timestamp — the
`YYYY-MM-DD HH:MM:SS UTC` shape 159-4 taught the codebase to *accept* — was only
partially rewritten, leaving a stale tail glued onto the fresh timestamp
(`**Phase Started:** 2026-08-11T12:48:16Z 22:00 UTC`). The fix widens the value
match to `[^\\n]+`.
"""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase

STORY_ID = "164-17"

TDD_WORKFLOW = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _green_session(phase_started: str) -> str:
    return textwrap.dedent(f"""\
        # Story {STORY_ID}: phase started full rewrite

        **Story ID:** {STORY_ID}
        **Workflow:** tdd
        **Phase:** green
        **Phase Started:** {phase_started}

        ## Dev Assessment

        Implementation complete — tests green.

        ## Workflow Tracking

        **Phase:** green
        **Phase Started:** {phase_started}

        ### Phase History
        | Phase | Started | Ended | Duration |
        |-------|---------|-------|----------|
        | green | {phase_started} | - | - |

        ### Handoff History
        | From | To | Gate | Status | Timestamp |
        |------|-----|------|--------|-----------|
    """)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "tdd.yaml").write_text(yaml.dump(TDD_WORKFLOW, default_flow_style=False))
    (tmp_path / ".session").mkdir()
    return tmp_path


def _phase_started_values(session_file: Path) -> list[str]:
    return [
        line.split("**Phase Started:**", 1)[1].strip()
        for line in session_file.read_text().splitlines()
        if "**Phase Started:**" in line
    ]


@pytest.mark.parametrize(
    "started",
    [
        "2026-06-03T22:00:00Z",  # ISO-8601 — must keep working (AC-3)
        "2026-06-03 22:00:00 UTC",  # space + UTC suffix (AC-1/AC-2)
        "2026-06-03 22:00:00",  # bare space-separated (AC-1/AC-2)
    ],
    ids=["iso", "space_utc", "space_bare"],
)
def test_phase_started_fully_rewritten(project: Path, started: str) -> None:
    session = project / ".session" / f"{STORY_ID}-session.md"
    session.write_text(_green_session(started))

    result = complete_phase(STORY_ID, "tdd", "green", "review", "tests_pass", project)
    assert result["status"] == "success", result.get("error")

    values = _phase_started_values(session)
    assert values, "no **Phase Started:** line survived the rewrite"
    for value in values:
        # RED against `\S+`: the space-separated cases leave the tail behind,
        # e.g. "2026-08-11T12:48:16Z 22:00 UTC".
        assert ISO_RE.match(value), (
            f"Phase Started value not fully rewritten: {value!r} "
            f"(stale fragment of {started!r} left behind)"
        )
