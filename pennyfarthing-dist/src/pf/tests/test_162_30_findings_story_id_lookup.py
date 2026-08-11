"""162-30: sprint findings must not silently drop stories with no Jira key.

Bug (caught by the legacy tree's `test_sprint_findings_cli`, confirmed against
source): `collect_session_files` built its lookup from `_collect_done_stories`,
which keyed every done story by its Jira key and skipped any story whose key it
could not resolve. All three session-matching strategies then keyed on that Jira
key alone.

`completed_stories` rows in `sprint-{N}-completed.yaml` carry `id` and `epic` but
no `jira`, so a Jira key is only resolvable when a matching `epic-{ref}.yaml`
shard also sits in the archive directory. Projects that do not track Jira never
have one at all. Either way the story was dropped, and its `## Delivery
Findings` never reached the sprint findings report — a silent empty success.

Fix: key the lookup on the Jira key when there is one and the story id
otherwise, and add story-id legs (frontmatter, body field, filename) to the
session-matching strategies.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

from pf.findings.aggregate import collect_session_files

SPRINT_COMPLETED = textwrap.dedent("""\
    sprint:
      name: "Sprint 9998"
      number: 9998
    completed_stories:
      - id: 98-1
        epic: '98'
        title: No jira key anywhere
        points: 2
        completed: '2026-01-10'
""")

SESSION_NO_JIRA = textwrap.dedent("""\
    ---
    story_id: "98-1"
    jira_key: ""
    ---

    # 98-1: No jira key anywhere

    ## Delivery Findings

    ### Dev (implementation)
    - **Gap** (blocking): Something worth reporting. Affects `src/a.py` (fix it).
""")


def _archive(tmp_path: Path, session_name: str, session_body: str) -> Path:
    archive = tmp_path / "sprint" / "archive"
    archive.mkdir(parents=True)
    (archive / "sprint-9998-completed.yaml").write_text(SPRINT_COMPLETED)
    (archive / session_name).write_text(session_body)
    return archive


def test_story_without_resolvable_jira_key_is_still_collected(tmp_path: Path) -> None:
    """The regression: no epic shard, empty jira_key — session must still match."""
    archive = _archive(tmp_path, "98-1-session.md", SESSION_NO_JIRA)

    result = collect_session_files(archive, 9998)

    assert result["success"] is True, result
    sessions = result["data"]["sessions"]
    assert [s["story_id"] for s in sessions] == ["98-1"], (
        f"Story 98-1 was dropped from the findings lookup: {sessions}"
    )


def test_matches_on_frontmatter_story_id_when_filename_differs(tmp_path: Path) -> None:
    """Filename is not the story id — the frontmatter story_id leg must carry it."""
    archive = _archive(tmp_path, "some-other-name-session.md", SESSION_NO_JIRA)

    sessions = collect_session_files(archive, 9998)["data"]["sessions"]

    assert [s["story_id"] for s in sessions] == ["98-1"], (
        f"frontmatter story_id did not match: {sessions}"
    )


def test_matches_on_body_id_field_without_frontmatter(tmp_path: Path) -> None:
    """Sessions with no YAML frontmatter match via the bold **ID:** body field."""
    body = textwrap.dedent("""\
        # 98-1: No frontmatter here

        ## Story Details
        - **ID:** 98-1

        ## Delivery Findings

        ### Dev (implementation)
        - **Gap** (blocking): Reported. Affects `src/a.py` (fix it).
    """)
    archive = _archive(tmp_path, "unrelated-session.md", body)

    sessions = collect_session_files(archive, 9998)["data"]["sessions"]

    assert [s["story_id"] for s in sessions] == ["98-1"], (
        f"body **ID:** field did not match: {sessions}"
    )


def test_jira_key_still_wins_when_present(tmp_path: Path) -> None:
    """The Jira legs keep priority — a Jira-tracked story matches on its key."""
    archive = tmp_path / "sprint" / "archive"
    archive.mkdir(parents=True)
    (archive / "sprint-9998-completed.yaml").write_text(
        textwrap.dedent("""\
            sprint:
              name: "Sprint 9998"
              number: 9998
            completed_epics: ['98']
            completed_stories: []
        """)
    )
    (archive / "epic-98.yaml").write_text(
        textwrap.dedent("""\
            stories:
              - id: 98-2
                jira: PROJ-98002
                status: done
        """)
    )
    (archive / "PROJ-98002-session.md").write_text(
        textwrap.dedent("""\
            ---
            story_id: "98-2"
            jira_key: "PROJ-98002"
            ---

            ## Delivery Findings

            ### Dev (implementation)
            - **Gap** (blocking): Reported. Affects `src/a.py` (fix it).
        """)
    )

    sessions = collect_session_files(archive, 9998)["data"]["sessions"]

    assert len(sessions) == 1, sessions
    assert sessions[0]["jira_key"] == "PROJ-98002"
    assert sessions[0]["story_id"] == "98-2"


def test_each_session_is_matched_at_most_once(tmp_path: Path) -> None:
    """Story id and filename both match the same story — no duplicate row."""
    archive = _archive(tmp_path, "98-1-session.md", SESSION_NO_JIRA)

    sessions = collect_session_files(archive, 9998)["data"]["sessions"]

    assert len(sessions) == 1, f"Session double-counted: {sessions}"
