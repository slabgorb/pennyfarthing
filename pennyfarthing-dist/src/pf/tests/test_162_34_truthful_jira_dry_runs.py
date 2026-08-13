"""Truthful dry-run contract for pf jira claim / move / create story (Story 162-34).

Epic: 162 — Finish & sprint-tooling truthfulness.
Source: the 162-7 AC4 audit, which fixed ``assign``/``link``/``sprint add`` and
listed three remaining false-positive dry-runs.

The contract 162-7 established (see test_162_7_assign_dry_run_truthful.py):

* A ``--dry-run`` resolves the SAME state the real call would resolve, BEFORE
  it prints a preview. It reads; it never writes.
* If the real call would fail, the dry-run fails — same error text, non-zero
  exit — instead of echoing the input back as success. A dry-run that cannot
  fail is worse than no dry-run: it manufactures confidence.
* Result dicts only — ``{success, error?, dry_run?}``. Nothing raises (rule 6).

Three defects pinned here:

1. **claim** (``jira/claim.py`` + the ``claim`` command in ``jira/cli.py``) —
   the highest-frequency agent-facing path, and a PURE ECHO: the dry-run branch
   returns before anything imports the claim module, so it never looks the issue
   up. ``pf jira claim PROJ-999 --dry-run`` previews success for an issue that
   does not exist, and for an issue already claimed by a teammate.
2. **move** (``move_issue`` in ``jira/operations.py``) — a MISSING issue and a
   NONEXISTENT target transition both preview success. ``get_issue_sync``
   returning None falls straight through to the dry-run echo, and the transition
   list is only ever consulted inside ``transition_sync``, on the real path.
3. **create story** (``create_story_in_jira`` in ``jira/create.py``) — the
   parent epic key is validated against the sprint YAML only. A YAML epic whose
   ``jira`` key was deleted (or typo'd) previews a successful create; the real
   call then fails on the ``parent`` field.

Acceptance criteria covered:
- [AC1] claim dry-run reflects real issue state (missing / already claimed),
        does not blindly echo, and performs no writes.
- [AC2] move dry-run previews FAILURE for a missing issue.
- [AC3] move dry-run previews FAILURE for a target transition that is not
        available on the issue.
- [AC4] create-story dry-run previews FAILURE for a parent epic that does not
        exist in Jira.
- [AC5] guards — a valid issue / available transition / existing epic still
        preview SUCCESS, and still write nothing.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml
from click.testing import CliRunner

from pf.jira.cli import jira as jira_group
from pf.jira.create import create_story_in_jira
from pf.jira.operations import move_issue

EXISTING_ISSUE = "PROJ-1"
CLAIMED_ISSUE = "PROJ-2"
MISSING_ISSUE = "PROJ-999"

EPIC_JIRA_KEY = "PROJ-100"
MISSING_EPIC_KEY = "PROJ-404"
STORY_ID = "162-34"

OTHER_USER = "Dana Reyes"

# Transitions the fake instance offers on EXISTING_ISSUE.
AVAILABLE_TRANSITIONS = ("In Progress", "In Review", "Done")
UNAVAILABLE_TRANSITION = "Shipped"


def _issue(
    key: str,
    *,
    status: str = "To Do",
    assignee: str | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "fields": {
            "summary": f"Fixture issue {key}",
            "status": {"name": status},
            "assignee": (
                {"displayName": assignee, "emailAddress": "dana@corp.example.com"}
                if assignee
                else None
            ),
        },
    }


# =============================================================================
# Jira boundary stub (get_client seam — 162-5 / 162-7 pattern, no network)
# =============================================================================


class _StubJiraClient:
    """Deterministic stand-in for JiraClient.

    Reads and writes are recorded SEPARATELY, because the claim of this story is
    "the dry-run reads the real state and writes nothing". A stub that lumped
    them together could not prove either half.
    """

    def __init__(
        self,
        *,
        issues: dict[str, dict[str, Any]] | None = None,
        transitions: dict[str, tuple[str, ...]] | None = None,
        token: str = "stub-token",
    ) -> None:
        self.token = token
        self._issues = dict(issues or {})
        self._transitions = dict(transitions or {})
        # Reads
        self.issue_reads: list[str] = []
        self.transition_reads: list[str] = []
        # Writes
        self.assign_calls: list[tuple[str, str | None]] = []
        self.transition_calls: list[tuple[str, str]] = []
        self.created_payloads: list[dict[str, Any]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.sprint_adds: list[tuple[str, str]] = []

    @property
    def writes(self) -> list[tuple[str, ...]]:
        """Every mutating call, flattened — must stay empty through a dry-run."""
        return (
            [("assign", k, str(v)) for k, v in self.assign_calls]
            + [("transition", *c) for c in self.transition_calls]
            + [("create", str(p)) for p in self.created_payloads]
            + [("update", k, str(v)) for k, v in self.updated]
            + [("sprint_add", *c) for c in self.sprint_adds]
        )

    # --- reads ---------------------------------------------------------------

    def get_issue_sync(self, issue_key: str) -> dict[str, Any] | None:
        self.issue_reads.append(issue_key)
        return self._issues.get(issue_key)

    def get_transitions_sync(self, issue_key: str) -> list[dict[str, Any]] | None:
        """Read-only transition list — the lookup a truthful move dry-run needs.

        Returns None for an unknown issue (mirrors a 404 from Jira), so a dry-run
        cannot mistake "no transitions" for "transition unavailable".
        """
        self.transition_reads.append(issue_key)
        if issue_key not in self._issues:
            return None
        names = self._transitions.get(issue_key, AVAILABLE_TRANSITIONS)
        return [{"id": str(i + 1), "name": n} for i, n in enumerate(names)]

    def find_user_sync(self, query: str) -> dict[str, Any] | None:
        return {"accountId": "acct-1", "emailAddress": query, "displayName": "Stub User"}

    # --- writes --------------------------------------------------------------

    def assign_issue_sync(self, issue_key: str, email: str | None) -> dict[str, Any]:
        self.assign_calls.append((issue_key, email))
        return {"success": True}

    def transition_sync(self, issue_key: str, target_status: str) -> dict[str, Any]:
        transitions = self.get_transitions_sync(issue_key)
        if transitions is None:
            return {"success": False, "error": "Could not get transitions"}
        names = [t["name"] for t in transitions]
        if target_status.lower() not in {n.lower() for n in names}:
            return {
                "success": False,
                "error": f"No transition to '{target_status}' available. Available: {names}",
            }
        self.transition_calls.append((issue_key, target_status))
        return {"success": True}

    def create_issue_sync(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        self.created_payloads.append(payload)
        return {"key": "PROJ-777"}

    def update_issue_sync(self, issue_key: str, fields: dict[str, Any]) -> dict[str, Any]:
        self.updated.append((issue_key, fields))
        return {"success": True}

    def add_to_sprint_sync(self, sprint_id: str, issue_key: str) -> dict[str, Any]:
        self.sprint_adds.append((sprint_id, issue_key))
        return {"success": True}


@pytest.fixture
def stub_client(monkeypatch: pytest.MonkeyPatch) -> _StubJiraClient:
    """Install one stub across every module that resolves a client for these paths."""
    client = _StubJiraClient(
        issues={
            EXISTING_ISSUE: _issue(EXISTING_ISSUE),
            CLAIMED_ISSUE: _issue(CLAIMED_ISSUE, assignee=OTHER_USER),
            EPIC_JIRA_KEY: _issue(EPIC_JIRA_KEY, status="In Progress"),
        },
        transitions={EXISTING_ISSUE: AVAILABLE_TRANSITIONS},
    )
    for module in ("pf.jira.claim", "pf.jira.operations", "pf.jira.create"):
        monkeypatch.setattr(f"{module}.get_client", lambda: client, raising=True)
    # Jira is disabled in this repo; the claim path must not short-circuit to the
    # local-YAML branch just because of ambient config.
    monkeypatch.setattr("pf.jira.client.is_jira_enabled", lambda: True, raising=False)
    monkeypatch.setattr(
        "pf.jira.client.get_current_user_email", lambda: "keith@corp.example.com", raising=False
    )
    return client


@pytest.fixture
def sprint_path(tmp_path: Path) -> Path:
    """Sprint YAML holding one epic and one un-created story under it."""
    path = tmp_path / "current-sprint.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "sprint": {"name": "sprint-162"},
                "epics": [
                    {
                        "id": "162",
                        "jira": EPIC_JIRA_KEY,
                        "title": "Truthfulness",
                        "stories": [
                            {
                                "id": STORY_ID,
                                "title": "Truthful jira dry-runs",
                                "points": 3,
                                "priority": "P1",
                                "status": "ready",
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def _invoke(args: list[str]):
    return CliRunner().invoke(jira_group, args)


# =============================================================================
# AC1 — claim dry-run reflects real issue state
# =============================================================================


def test_claim_dry_run_fails_for_missing_issue(stub_client: _StubJiraClient) -> None:
    """[AC1] A dry-run claim of an issue that does not exist must not preview success."""
    result = _invoke(["claim", MISSING_ISSUE, "--dry-run"])

    assert result.exit_code != 0, (
        "claim --dry-run previewed success for a nonexistent issue "
        f"(exit 0, output: {result.output!r})"
    )
    assert "not found" in result.output.lower()
    assert "would claim" not in result.output.lower(), (
        "blind echo: previewed a claim that cannot happen"
    )


def test_claim_dry_run_looks_the_issue_up(stub_client: _StubJiraClient) -> None:
    """[AC1] The dry-run must actually read Jira — a pure echo reads nothing."""
    _invoke(["claim", MISSING_ISSUE, "--dry-run"])

    assert MISSING_ISSUE in stub_client.issue_reads, (
        "claim --dry-run never looked the issue up; it echoed the input"
    )


def test_claim_dry_run_fails_when_already_claimed(stub_client: _StubJiraClient) -> None:
    """[AC1] An issue assigned to someone else is not claimable — say so, name them."""
    result = _invoke(["claim", CLAIMED_ISSUE, "--dry-run"])

    assert result.exit_code != 0, (
        f"previewed success for an already-claimed issue: {result.output!r}"
    )
    assert OTHER_USER in result.output, (
        f"error must name the current assignee, not 'unknown': {result.output!r}"
    )


def test_claim_dry_run_writes_nothing(stub_client: _StubJiraClient) -> None:
    """[AC1][AC5] Reading is allowed; assigning or transitioning is not."""
    _invoke(["claim", EXISTING_ISSUE, "--dry-run"])

    assert stub_client.writes == [], f"claim --dry-run mutated Jira: {stub_client.writes}"


# =============================================================================
# AC2 / AC3 — move dry-run
# =============================================================================


def test_move_dry_run_fails_for_missing_issue(stub_client: _StubJiraClient) -> None:
    """[AC2] Missing issue: the real call fails, so the dry-run must fail."""
    result = move_issue(MISSING_ISSUE, "In Progress", dry_run=True)

    assert result.get("success") is False, f"previewed success for a missing issue: {result}"
    assert MISSING_ISSUE in result.get("error", "")
    assert stub_client.transition_calls == []


def test_move_dry_run_fails_for_unavailable_transition(stub_client: _StubJiraClient) -> None:
    """[AC3] Target status with no matching transition must preview FAILURE."""
    result = move_issue(EXISTING_ISSUE, UNAVAILABLE_TRANSITION, dry_run=True)

    assert result.get("success") is False, (
        f"previewed success for a transition Jira does not offer: {result}"
    )
    error = result.get("error", "")
    assert UNAVAILABLE_TRANSITION in error
    assert "In Progress" in error, f"error should list the available transitions: {error!r}"
    assert stub_client.transition_calls == [], "dry-run performed the transition"


def test_move_cli_dry_run_exits_nonzero_for_unavailable_transition(
    stub_client: _StubJiraClient,
) -> None:
    """[AC3] The CLI must surface the failure, not print 'Moved ...'."""
    result = _invoke(["move", EXISTING_ISSUE, UNAVAILABLE_TRANSITION, "--dry-run"])

    assert result.exit_code != 0, f"move --dry-run exited 0: {result.output!r}"
    assert "moved" not in result.output.lower(), (
        f"dry-run claimed the move happened: {result.output!r}"
    )


def test_move_dry_run_succeeds_for_available_transition(stub_client: _StubJiraClient) -> None:
    """[AC5] Guard — don't over-abort: a valid transition still previews success."""
    result = move_issue(EXISTING_ISSUE, "In Progress", dry_run=True)

    assert result.get("success") is True, f"valid transition previewed failure: {result}"
    assert result.get("dry_run") is True
    assert stub_client.writes == [], f"dry-run mutated Jira: {stub_client.writes}"


# =============================================================================
# AC4 — create story dry-run validates the parent epic
# =============================================================================


def test_create_story_dry_run_fails_for_missing_parent_epic(
    stub_client: _StubJiraClient, sprint_path: Path
) -> None:
    """[AC4] Parent epic absent from Jira → the create would fail, so preview FAILURE."""
    data = yaml.safe_load(sprint_path.read_text(encoding="utf-8"))
    data["epics"][0]["jira"] = MISSING_EPIC_KEY
    sprint_path.write_text(yaml.safe_dump(data), encoding="utf-8")

    result = create_story_in_jira(MISSING_EPIC_KEY, STORY_ID, sprint_path=sprint_path, dry_run=True)

    assert result.get("success") is False, (
        f"previewed success with a parent epic that does not exist in Jira: {result}"
    )
    assert MISSING_EPIC_KEY in result.get("error", "")
    assert stub_client.created_payloads == []


def test_create_story_dry_run_validates_parent_against_jira(
    stub_client: _StubJiraClient, sprint_path: Path
) -> None:
    """[AC4] The parent check must hit Jira, not just the sprint YAML."""
    create_story_in_jira(EPIC_JIRA_KEY, STORY_ID, sprint_path=sprint_path, dry_run=True)

    assert EPIC_JIRA_KEY in stub_client.issue_reads, (
        "create story --dry-run never asked Jira whether the parent epic exists"
    )


def test_create_story_dry_run_succeeds_for_existing_parent_epic(
    stub_client: _StubJiraClient, sprint_path: Path
) -> None:
    """[AC5] Guard — an existing parent epic still previews success, and writes nothing."""
    result = create_story_in_jira(EPIC_JIRA_KEY, STORY_ID, sprint_path=sprint_path, dry_run=True)

    assert result.get("success") is True, f"valid parent epic previewed failure: {result}"
    assert result.get("dry_run") is True
    assert stub_client.writes == [], f"dry-run mutated Jira: {stub_client.writes}"
    # The sprint YAML must be untouched too — no jira key stamped on the story.
    data = yaml.safe_load(sprint_path.read_text(encoding="utf-8"))
    assert "jira" not in data["epics"][0]["stories"][0]


# =============================================================================
# Contract integrity — result dicts, never exceptions (rule 6)
# =============================================================================


@pytest.mark.parametrize("target", ["In Progress", UNAVAILABLE_TRANSITION])
def test_move_dry_run_never_raises(stub_client: _StubJiraClient, target: str) -> None:
    """Both outcomes come back as result dicts."""
    result = move_issue(MISSING_ISSUE, target, dry_run=True)

    assert isinstance(result, dict)
    assert "success" in result
