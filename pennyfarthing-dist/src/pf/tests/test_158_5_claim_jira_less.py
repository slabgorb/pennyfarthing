"""Tests for story 158-5: `pf sprint story claim` on Jira-less projects (gh #48).

## The bug

On a project that does not use Jira (no ``[jira]`` block in
``.pennyfarthing/config.local.yaml``; story has no ``jira`` key), claiming a
story fails:

    $ pf sprint story claim 22-1
    Error: Story not available: assigned to unknown

``pf sprint story claim`` (``sprint/cli.py::story_claim``) calls
``pf.jira.claim.claim_issue`` with **no** ``is_jira_enabled()`` gate. That path
runs ``claim_story`` → ``check_availability`` → ``get_client().get_issue_sync``,
which requires Jira. With no Jira the availability check fails and
``claim_story`` returns the misleading ``"assigned to unknown"`` message — even
though the story's ``assignee`` is simply ``null`` (nobody is assigned).

Note: ``pf jira claim`` (a *different* command, ``jira/cli.py``) already gates on
``is_jira_enabled()`` and fails closed — see ``test_jira_cli_disabled_gate.py``.
This story fixes the *sprint-level* ``claim``, which should instead fall back to
a **local YAML** claim when Jira is absent.

## Expected (acceptance criteria)

- **AC1** — On a Jira-less project, ``claim_issue(story_id)`` succeeds via the
  local YAML path: it sets the story ``status`` to ``in_progress`` and records
  the current user in ``assigned_to``, and makes **no** Jira call
  (``get_client`` is never invoked).
- **AC2** — The misleading ``"assigned to unknown"`` error never fires when the
  ``assignee`` field is null/empty. A story genuinely claimed by *someone else*
  is still blocked, but the message names that person — not ``"unknown"``.
- **AC3** — When Jira **is** configured the existing behavior is unchanged: the
  claim still routes through ``check_availability`` (the Jira front door).

## RED / GREEN

RED on HEAD: the disabled-jira tests contact Jira (``get_client`` is called),
so the ``side_effect`` guard fires / ``call_count`` is non-zero. GREEN once
``claim_issue`` detects the Jira-less context and routes through a local-only
claim path. AC3 is a regression guard — green now, and must stay green so a
naive fix can't route the *enabled* path through the local shortcut too.

Hermetic: no network, no real Jira. ``is_jira_enabled()`` is driven through a
monkeypatched ``load_pennyfarthing_config`` (same technique as
``test_jira_cli_disabled_gate.py``); the project root is redirected to
``tmp_path``; identity is pinned via ``JIRA_USER`` (``get_current_user_email``
reads it first, so no ``git`` shell-out).
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from pf.jira.claim import claim_issue
from pf.sprint.cli import story as story_group

# A Jira-less sprint: one unclaimed story (22-1) and one already claimed by
# another user (22-2). Neither has a `jira` key — the local YAML path applies.
SPRINT_YAML = """\
sprint:
  name: Test Sprint
  status: active
  number: 22
epics:
  - id: "22"
    type: epic
    title: Jira-less epic
    status: backlog
    repos: pennyfarthing
    stories:
      - id: 22-1
        title: A jira-less story
        points: 2
        status: backlog
        workflow: tdd
      - id: 22-2
        title: Already claimed by someone else
        points: 2
        status: backlog
        workflow: tdd
        assigned_to: other@example.com
"""

CURRENT_USER = "dev@example.com"

# A patch target that makes ANY Jira contact fail loudly. The local claim path
# must never reach it, so a successful claim proves no Jira call happened.
_NO_JIRA = patch(
    "pf.jira.claim.get_client",
    side_effect=AssertionError("Jira must not be contacted on a Jira-less project"),
)


def _read_story(root: Path, story_id: str) -> dict:
    """Re-read a story straight from the sprint YAML on disk."""
    from pf.sprint.loader import find_story_in_data
    from pf.sprint.yaml_io import read_sprint

    data = read_sprint(root / "sprint" / "current-sprint.yaml")
    _epic, story, _loc = find_story_in_data(data, story_id)
    assert story is not None, f"story {story_id} not found in sprint YAML"
    return story


@pytest.fixture
def jira_less_project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A tmp project with Jira disabled and the sprint YAML in place."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SPRINT_YAML)

    # Force is_jira_enabled() -> False (no jira config, no env).
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: {},
    )
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)

    # Deterministic identity without shelling out to git.
    monkeypatch.setenv("JIRA_USER", CURRENT_USER)

    # Redirect project-root resolution to the sandbox.
    monkeypatch.setattr("pf.common.config.get_project_root", lambda *_a, **_kw: tmp_path)
    return tmp_path


# =============================================================================
# AC1 — Jira-less claim succeeds via local YAML, with no Jira call
# =============================================================================


class TestLocalClaimSucceeds:
    def test_claim_returns_success(self, jira_less_project: Path) -> None:
        with _NO_JIRA:
            result = claim_issue("22-1")
        assert result.get("success") is True, result

    def test_claim_sets_status_in_progress(self, jira_less_project: Path) -> None:
        with _NO_JIRA:
            claim_issue("22-1")
        story = _read_story(jira_less_project, "22-1")
        assert story["status"] == "in_progress", story

    def test_claim_records_current_user_as_assignee(self, jira_less_project: Path) -> None:
        with _NO_JIRA:
            claim_issue("22-1")
        story = _read_story(jira_less_project, "22-1")
        assert story.get("assigned_to") == CURRENT_USER, story

    def test_claim_makes_no_jira_call(self, jira_less_project: Path) -> None:
        # Plain mock (no side effect): assert it is simply never invoked.
        with patch("pf.jira.claim.get_client") as get_client_mock:
            result = claim_issue("22-1")
        assert get_client_mock.call_count == 0, (
            "get_client must not be called on a Jira-less project"
        )
        assert result.get("success") is True, result


class TestLocalClaimCli:
    """End-to-end through `pf sprint story claim` (the command in the bug report)."""

    def test_cli_claim_exits_zero(self, jira_less_project: Path) -> None:
        runner = CliRunner()
        with _NO_JIRA:
            result = runner.invoke(story_group, ["claim", "22-1"])
        assert result.exit_code == 0, (
            f"exit={result.exit_code} output={result.output!r} exc={result.exception!r}"
        )
        assert "assigned to unknown" not in result.output.lower()


# =============================================================================
# AC2 — No "assigned to unknown" for an empty assignee; real conflicts are clear
# =============================================================================


class TestErrorMessaging:
    def test_no_assigned_to_unknown_when_assignee_null(self, jira_less_project: Path) -> None:
        with _NO_JIRA:
            result = claim_issue("22-1")
        assert result.get("success") is True, result
        assert "unknown" not in (result.get("error") or "").lower(), result

    def test_claimed_by_other_blocks_and_names_them(self, jira_less_project: Path) -> None:
        with _NO_JIRA:
            result = claim_issue("22-2")
        assert result.get("success") is False, result
        err = (result.get("error") or "").lower()
        assert "other@example.com" in err, (
            f"a real conflict must name the assignee, got: {result.get('error')!r}"
        )
        assert "unknown" not in err, (
            f"must not report 'unknown' for a genuinely assigned story: {result.get('error')!r}"
        )

    def test_claim_returns_result_object_never_raises(self, jira_less_project: Path) -> None:
        # SOUL #10: return {success, error}, don't throw. A Jira-less claim must
        # resolve to a result dict, never propagate an exception to the caller.
        with _NO_JIRA:
            result = claim_issue("22-1")
        assert isinstance(result, dict) and "success" in result, result


# =============================================================================
# AC3 — Jira-enabled behavior unchanged (regression guard; green now)
# =============================================================================


class TestJiraEnabledUnchanged:
    @pytest.fixture
    def jira_enabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {
                "jira": {"project": "PROJ", "url": "https://jira.example.com"}
            },
        )

    def test_enabled_still_routes_through_check_availability(self, jira_enabled: None) -> None:
        fake_check = MagicMock(
            return_value={"available": False, "assigned_to": "alice", "exit_code": 1}
        )
        with patch("pf.jira.claim.check_availability", fake_check):
            result = claim_issue("PROJ-99")
        assert fake_check.call_count == 1, (
            "with Jira enabled, claim must still consult the Jira availability check"
        )
        assert result.get("success") is False
        assert "alice" in (result.get("error") or "").lower(), result
