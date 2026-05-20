"""Tests for story 152-2 — gate jira-cli lookups on jira.enabled config.

Epic 152 (Jira isolation) — second story.

TDD RED phase. All tests should FAIL until implementation lands.

Story 152-1 removed PROJ hardcoding and made the project key config-driven
with fail-loud resolution. This story closes two remaining leak paths:

1. Sprint flows that touch jira-cli unconditionally
   (`pf sprint work` -> `get_current_user_email`,
    `pf sprint story update --status in_progress` -> `subprocess.run(["jira", "me"])`).
2. Stories with `jira: null` — auto-assignee lookup should skip outright.

Acceptance Criteria:
- AC1: `pf.jira.client.is_jira_enabled()` returns True only when both
  `jira.project` and `jira.url` config values resolve to a non-empty string.
  No silent defaults.
- AC2: `check_story` and `get_next_story` short-circuit `get_current_user_email()`
  when jira is not enabled; `update_story(status="in_progress")` does NOT
  invoke `subprocess.run(["jira", "me"])` when jira is not enabled.
- AC3: `update_story(status="in_progress")` does NOT invoke `jira me` when the
  *story itself* has no `jira` key, even if global jira is enabled.
- AC4: Regression — when jira IS enabled and the story HAS a jira key,
  the auto-assignee lookups still happen.
- AC5: Hygiene — no new corporate-email or domain strings introduced.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

# =============================================================================
# Fixtures
# =============================================================================


NON_JIRA_SPRINT = """\
sprint:
  name: "Hobby Sprint"
  number: 1
  goal: Hobby work
  start_date: 2026-05-01
  end_date: 2026-05-15
  status: active
epics:
  - id: "E1"
    type: epic
    title: "Local Epic"
    priority: p1
    status: in_progress
    stories:
      - id: E1-1
        title: Backlog story
        points: 2
        priority: p2
        status: backlog
        workflow: tdd
      - id: E1-2
        title: Active assigned story
        points: 1
        priority: p2
        status: backlog
        assigned_to: someone@example.com
        workflow: trivial
"""


JIRA_SPRINT = """\
sprint:
  name: "TO Sprint 2618"
  number: 2618
  goal: Sprint goal
  start_date: 2026-05-01
  end_date: 2026-05-15
  status: active
epics:
  - id: "200"
    type: epic
    title: "Jira Epic"
    priority: p1
    status: in_progress
    jira: PROJ-20000
    stories:
      - id: 200-1
        title: Jira-tagged backlog story
        points: 2
        priority: p2
        status: backlog
        jira: PROJ-20001
        workflow: tdd
      - id: 200-2
        title: Jira-tagged assigned story
        points: 1
        priority: p2
        status: backlog
        assigned_to: other@example.com
        jira: PROJ-20002
        workflow: trivial
"""


@pytest.fixture
def non_jira_project(tmp_path: Path) -> Path:
    """Project with no Jira keys on any story."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(NON_JIRA_SPRINT)
    (sprint_dir / "archive").mkdir()
    return tmp_path


@pytest.fixture
def jira_project(tmp_path: Path) -> Path:
    """Project with Jira-tagged stories (regression fixture)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(JIRA_SPRINT)
    (sprint_dir / "archive").mkdir()
    return tmp_path


@pytest.fixture
def disabled_jira_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force `is_jira_enabled()` to resolve False (no project + no url)."""

    def _fake_config(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config", _fake_config
    )
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)


@pytest.fixture
def enabled_jira_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force `is_jira_enabled()` to resolve True (project + url present)."""

    def _fake_config(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return {"jira": {"project": "PROJ", "url": "https://jira.example.com"}}

    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config", _fake_config
    )
    monkeypatch.setenv("JIRA_PROJECT", "PROJ")
    monkeypatch.setenv("JIRA_URL", "https://jira.example.com")


# =============================================================================
# AC1: is_jira_enabled() config predicate
# =============================================================================


class TestIsJiraEnabledPredicate:
    """AC1: predicate exposes whether jira integration is configured."""

    def test_is_jira_enabled_is_exported(self) -> None:
        """`is_jira_enabled` must be a public callable on `pf.jira.client`."""
        from pf.jira import client

        assert hasattr(client, "is_jira_enabled"), (
            "pf.jira.client.is_jira_enabled must exist (AC1)"
        )
        assert callable(client.is_jira_enabled)

    def test_returns_false_when_no_config(
        self, disabled_jira_config: None
    ) -> None:
        """No project + no url + no env vars -> False."""
        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_true_when_project_and_url_set(
        self, enabled_jira_config: None
    ) -> None:
        """Both project + url set -> True."""
        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is True

    def test_returns_false_when_only_project_set(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Project alone is not enough — url required to reach Jira."""
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_k: {"jira": {"project": "PROJ"}},
        )
        monkeypatch.delenv("JIRA_URL", raising=False)
        monkeypatch.setenv("JIRA_PROJECT", "PROJ")

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_false_when_only_url_set(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """URL alone without a project key is not enough."""
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_k: {"jira": {"url": "https://jira.example.com"}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.setenv("JIRA_URL", "https://jira.example.com")

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_false_on_empty_strings(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Empty strings must NOT count as configured (no silent defaults)."""
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_k: {"jira": {"project": "", "url": ""}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False


# =============================================================================
# AC2: assignee auto-lookup short-circuits when jira disabled
# =============================================================================


class TestSprintWorkSkipsAssigneeLookupWhenDisabled:
    """AC2: `pf sprint work` flows never call jira when jira not configured."""

    def test_check_story_does_not_call_get_current_user_email(
        self,
        non_jira_project: Path,
        disabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """check_story for a backlog story with an `assigned_to` field must
        NOT probe jira-cli when jira is disabled. (E1-2 in the fixture is
        backlog + assigned_to=someone@example.com.)
        """
        monkeypatch.setattr(
            "pf.sprint.loader.get_project_root", lambda: non_jira_project
        )

        sentinel = MagicMock(return_value="should-not-be-called@example.com")
        monkeypatch.setattr(
            "pf.jira.client.get_current_user_email", sentinel
        )

        from pf.sprint.work import check_story

        result = check_story("E1-2")

        # The jira lookup must not have happened.
        sentinel.assert_not_called()
        # And the story must have been found (this guards against a vacuous
        # pass where check_story returned early with `story not found`).
        assert isinstance(result, dict)
        assert "available" in result
        # We're not asserting available True/False — that's an implementation
        # choice for the gating Dev makes. But we ARE asserting we reached
        # past the "story not found" early return.
        assert result.get("error") != "Story 'E1-2' not found"

    def test_get_next_story_does_not_call_get_current_user_email(
        self,
        non_jira_project: Path,
        disabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """get_next_story must not probe jira-cli when jira is disabled."""
        monkeypatch.setattr(
            "pf.sprint.loader.get_project_root", lambda: non_jira_project
        )

        sentinel = MagicMock(return_value="should-not-be-called@example.com")
        monkeypatch.setattr(
            "pf.jira.client.get_current_user_email", sentinel
        )

        from pf.sprint.work import get_next_story

        result = get_next_story()

        sentinel.assert_not_called()
        assert isinstance(result, dict)
        # Guard against vacuous pass — get_next_story should have found stories
        # (E1-1 is backlog).
        assert result.get("available") is True, (
            f"Expected an available story, got: {result}"
        )

    def test_update_story_skips_jira_me_when_disabled(
        self,
        non_jira_project: Path,
        disabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """update_story(status='in_progress') must not run `jira me` subprocess
        when jira is disabled.
        """
        from pf.sprint import story_update

        # Spy on subprocess.run to assert no `jira me` invocation.
        original_run = story_update.subprocess.run
        calls: list[list[str]] = []

        def spy_run(args: list[str], *a: Any, **kw: Any) -> Any:
            calls.append(list(args))
            return original_run(args, *a, **kw)

        monkeypatch.setattr(story_update.subprocess, "run", spy_run)

        sprint_path = non_jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "E1-1", status="in_progress"
        )

        # Must succeed
        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )

        # No `jira` subprocess invocation
        jira_calls = [c for c in calls if c and c[0] == "jira"]
        assert jira_calls == [], (
            f"Expected no `jira` subprocess calls; got: {jira_calls}"
        )


# =============================================================================
# AC3: per-story skip when story.jira is null
# =============================================================================


class TestPerStoryJiraSkipsWhenStoryHasNoJiraKey:
    """AC3: A story without its own `jira` key must never trigger a jira-cli
    lookup, regardless of global jira-enabled state.
    """

    def test_update_story_skips_jira_me_for_story_without_jira_key(
        self,
        non_jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Even with jira enabled globally, a story without its own jira key
        must not trigger `jira me` lookup.
        """
        from pf.sprint import story_update

        calls: list[list[str]] = []

        def spy_run(args: list[str], *a: Any, **kw: Any) -> Any:
            calls.append(list(args))
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = ""
            return mock_result

        monkeypatch.setattr(story_update.subprocess, "run", spy_run)

        sprint_path = non_jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "E1-1", status="in_progress"
        )

        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )

        jira_calls = [c for c in calls if c and c[0] == "jira"]
        assert jira_calls == [], (
            f"Story has no jira key — `jira` subprocess should not be invoked. Got: {jira_calls}"
        )


# =============================================================================
# AC4: Regression — jira-enabled projects still claim
# =============================================================================


class TestJiraEnabledProjectsStillLookUp:
    """AC4: Regression — when jira is enabled AND story has a jira key,
    the auto-assignee lookup still happens.
    """

    def test_update_story_invokes_jira_me_when_enabled_and_story_has_jira(
        self,
        jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """For jira-enabled config + jira-tagged story, `jira me` is still
        invoked for auto-assignee.
        """
        from pf.sprint import story_update

        calls: list[list[str]] = []

        def spy_run(args: list[str], *a: Any, **kw: Any) -> Any:
            calls.append(list(args))
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = "user@example.com"
            return mock_result

        monkeypatch.setattr(story_update.subprocess, "run", spy_run)

        sprint_path = jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "200-1", status="in_progress"
        )

        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )

        # `jira me` MUST have been invoked
        jira_me_calls = [
            c for c in calls if len(c) >= 2 and c[0] == "jira" and c[1] == "me"
        ]
        assert len(jira_me_calls) == 1, (
            f"Expected exactly one `jira me` call for jira-enabled story; got: {calls}"
        )

    def test_check_story_calls_get_current_user_email_when_enabled(
        self,
        jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """check_story should still probe jira when jira is enabled and the
        story has an assignee to compare against. (200-2 in the fixture is
        backlog + assigned_to=other@example.com + jira=PROJ-20002.)
        """
        monkeypatch.setattr(
            "pf.sprint.loader.get_project_root", lambda: jira_project
        )

        sentinel = MagicMock(return_value="me@example.com")
        monkeypatch.setattr(
            "pf.jira.client.get_current_user_email", sentinel
        )

        from pf.sprint.work import check_story

        result = check_story("200-2")

        assert sentinel.called, (
            "Jira-enabled path must still consult get_current_user_email"
        )
        assert isinstance(result, dict)
        assert result.get("error") != "Story '200-2' not found"


# =============================================================================
# AC5: Hygiene — no new corporate-email/domain leakage
# =============================================================================


class TestNoCorporateLeakageInGatingCode:
    """AC5: The implementation must not introduce new corporate-domain or
    email strings. The 152-1 hygiene gate stays green.
    """

    def test_jira_client_module_has_no_corporate_domain(self) -> None:
        """Scan the client source for any new corporate email/domain references.
        152-1 already removed these; 152-2 must not regress.
        """
        import pf.jira.client as client_module

        source_path = Path(client_module.__file__)
        source = source_path.read_text()
        # These are the leak markers scrubbed by 152-1's hygiene gate. They
        # must remain absent here. Use lowercase to catch case-mismatches.
        lower = source.lower()

        for bad in ("@redacted-corp.com", "redacted-corp.atlassian.net"):
            assert bad not in lower, (
                f"Forbidden corporate string '{bad}' found in {source_path}"
            )

    def test_work_module_has_no_corporate_domain(self) -> None:
        """Scan work.py similarly — no corporate strings."""
        import pf.sprint.work as work_module

        source = Path(work_module.__file__).read_text().lower()
        for bad in ("@redacted-corp.com", "redacted-corp.atlassian.net"):
            assert bad not in source

    def test_story_update_module_has_no_corporate_domain(self) -> None:
        """Scan story_update.py similarly — no corporate strings."""
        import pf.sprint.story_update as story_update_module

        source = Path(story_update_module.__file__).read_text().lower()
        for bad in ("@redacted-corp.com", "redacted-corp.atlassian.net"):
            assert bad not in source


# =============================================================================
# Python rule coverage — silent exception swallowing in new code paths
# =============================================================================


class TestPredicateDoesNotSwallowExceptions:
    """python.md rule #1 — is_jira_enabled must not silently swallow a load
    error and return True (which would be a false positive that triggers
    jira-cli calls without config).
    """

    def test_predicate_returns_false_when_config_load_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """If config loading raises, predicate must default to False, not True."""

        def boom(*_a: Any, **_kw: Any) -> dict[str, Any]:
            raise RuntimeError("config file corrupt")

        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config", boom
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        # Predicate must fail-closed — if we can't read config, treat jira as
        # disabled rather than falsely claiming it's enabled.
        assert is_jira_enabled() is False
