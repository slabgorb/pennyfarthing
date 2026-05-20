"""Tests for story 152-2 — gate jira-cli lookups on jira.enabled config.

Epic 152 (Jira isolation) — second story. Story 152-1 removed PROJ hardcoding
and made the project key config-driven with fail-loud resolution. This story
gates the implicit `subprocess.run(["jira", "me"])` invocation in the
sprint-story-update auto-assignee path.

Acceptance criteria (refined during review — see session 152-2 Architect notes):

- AC1: `pf.jira.client.is_jira_enabled()` returns True only when both
  `jira.project` and `jira.url` resolve to non-empty `str` values. No silent
  defaults — non-string YAML scalars (`true`, `1`) and whitespace-only strings
  do not enable jira.
- AC2: `update_story(status="in_progress")` does NOT invoke
  `subprocess.run(["jira", "me"], ...)` when `is_jira_enabled()` is False.
  (Original AC2 named `get_current_user_email` as a forbidden call, but that
  function reads `JIRA_USER` env and `git config user.email` only — no
  jira-cli, no network probe. The real leak path is the `jira me` subprocess
  in story_update; that is what this story gates. Documented as a deviation
  in the session.)
- AC3: `update_story(status="in_progress")` does NOT invoke `jira me` when
  the story itself has no `jira` key, even if global jira is enabled.
- AC4: Regression — when jira IS enabled and the story HAS a jira key, the
  `jira me` lookup still runs.
- AC5: Hygiene — no new corporate-domain strings in any gating module.
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
        title: Jira-tagged story with explicit assignee
        points: 1
        priority: p2
        status: backlog
        assigned_to: other@example.com
        jira: PROJ-20002
        workflow: trivial
      - id: 200-3
        title: Local story inside jira-enabled project
        points: 1
        priority: p2
        status: backlog
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
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: {},
    )
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)


@pytest.fixture
def enabled_jira_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force `is_jira_enabled()` to resolve True (project + url present)."""
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: {"jira": {"project": "PROJ", "url": "https://jira.example.com"}},
    )


# =============================================================================
# AC1: is_jira_enabled() config predicate
# =============================================================================


class TestIsJiraEnabledPredicate:
    """AC1: predicate exposes whether jira integration is configured."""

    def test_is_jira_enabled_is_exported(self) -> None:
        """`is_jira_enabled` must be a public callable on `pf.jira.client`."""
        from pf.jira import client

        assert hasattr(client, "is_jira_enabled")
        assert callable(client.is_jira_enabled)

    def test_returns_false_when_no_config(self, disabled_jira_config: None) -> None:
        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_true_when_project_and_url_set(
        self, enabled_jira_config: None
    ) -> None:
        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is True

    def test_returns_false_when_only_project_set(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {"jira": {"project": "PROJ"}},
        )
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_false_when_only_url_set(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {"jira": {"url": "https://jira.example.com"}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_returns_false_on_empty_strings(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {"jira": {"project": "", "url": ""}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    @pytest.mark.parametrize(
        "project_value, url_value, case",
        [
            (True, "https://jira.example.com", "project: true (bool)"),
            (1, "https://jira.example.com", "project: 1 (int)"),
            ("PROJ", 42, "url: 42 (int)"),
            ("PROJ", True, "url: true (bool)"),
        ],
    )
    def test_returns_false_for_non_string_truthy_values(
        self,
        monkeypatch: pytest.MonkeyPatch,
        project_value: Any,
        url_value: Any,
        case: str,
    ) -> None:
        """AC1 explicitly forbids 'silent defaults'. A non-string truthy YAML
        value must NOT enable jira even though `bool(value)` is True.
        """
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {"jira": {"project": project_value, "url": url_value}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False, f"Should reject case: {case}"

    @pytest.mark.parametrize(
        "project_value, url_value",
        [
            ("   ", "https://jira.example.com"),
            ("PROJ", "   "),
            ("\t\n", "https://jira.example.com"),
            ("", "https://jira.example.com"),
        ],
    )
    def test_returns_false_for_whitespace_only_strings(
        self,
        monkeypatch: pytest.MonkeyPatch,
        project_value: str,
        url_value: str,
    ) -> None:
        """Whitespace-only strings are truthy under bool() but must NOT count
        as configured per AC1 ('non-empty string').
        """
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: {"jira": {"project": project_value, "url": url_value}},
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False


# =============================================================================
# Fail-closed behavior: predicate must default to False on resolution error
# =============================================================================


class TestPredicateFailsClosed:
    """python.md rule #1 — is_jira_enabled must not silently swallow a
    config-resolution error and return True. The two-layer behavior
    (`_resolve_jira_config` catches its own errors internally) is the
    primary safety net; this test verifies the contract end-to-end.
    """

    def test_predicate_returns_false_when_config_load_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """If config loading raises, predicate defaults to False — fail closed."""
        monkeypatch.setattr(
            "pf.common.config.load_pennyfarthing_config",
            lambda *_a, **_kw: (_ for _ in ()).throw(RuntimeError("config corrupt")),
        )
        monkeypatch.delenv("JIRA_PROJECT", raising=False)
        monkeypatch.delenv("JIRA_URL", raising=False)

        from pf.jira.client import is_jira_enabled

        assert is_jira_enabled() is False

    def test_predicate_returns_false_when_resolve_jira_config_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Direct test of the predicate's fail-closed contract: if
        `_resolve_jira_config` itself raises (bypassing its inner handler),
        `is_jira_enabled()` must still return False. This exercises the
        contract independent of where the safety net lives.
        """
        from pf.jira import client

        def boom(*_a: Any, **_kw: Any) -> Any:
            raise RuntimeError("resolver corrupt")

        monkeypatch.setattr(client, "_resolve_jira_config", boom)

        with pytest.raises(RuntimeError):
            # Sanity: confirm the patch reaches the resolver
            client._resolve_jira_config()

        # The predicate's defense-in-depth outer try/except must catch this
        # and return False — not propagate the exception to gate call sites.
        result = client.is_jira_enabled()
        assert result is False


# =============================================================================
# AC2: update_story auto-assignee short-circuits when jira disabled
# =============================================================================


class TestUpdateStorySkipsJiraMeWhenDisabled:
    """AC2: `pf sprint story update --status in_progress` must not invoke
    `subprocess.run(["jira", "me"], ...)` when jira is not enabled.
    """

    def test_update_story_skips_jira_me_when_disabled(
        self,
        non_jira_project: Path,
        disabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from pf.sprint import story_update

        # Fully mock subprocess — any unexpected call fails loudly rather
        # than passing through to a real CLI on the host.
        mock_run = MagicMock(
            side_effect=AssertionError(
                "update_story must not invoke any subprocess when jira disabled"
            )
        )
        monkeypatch.setattr(story_update.subprocess, "run", mock_run)

        sprint_path = non_jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "E1-1", status="in_progress"
        )

        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )
        mock_run.assert_not_called()


# =============================================================================
# AC3: per-story skip when story.jira is null
# =============================================================================


class TestPerStoryJiraSkipsWhenStoryHasNoJiraKey:
    """AC3: A story without its own `jira` key must never trigger a `jira me`
    invocation, regardless of global jira-enabled state.
    """

    def test_update_story_skips_jira_me_for_story_without_jira_key(
        self,
        jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Even with jira enabled globally, story 200-3 (jira: null) must NOT
        trigger `jira me`.
        """
        from pf.sprint import story_update

        mock_run = MagicMock(
            side_effect=AssertionError(
                "update_story must not invoke subprocess for story with no jira key"
            )
        )
        monkeypatch.setattr(story_update.subprocess, "run", mock_run)

        sprint_path = jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "200-3", status="in_progress"
        )

        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )
        mock_run.assert_not_called()


# =============================================================================
# AC4: Regression — jira-enabled projects still claim
# =============================================================================


class TestJiraEnabledProjectsStillLookUp:
    """AC4: When jira is enabled AND story has a jira key, the auto-assignee
    lookup still happens.
    """

    def test_update_story_invokes_jira_me_when_enabled_and_story_has_jira(
        self,
        jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from pf.sprint import story_update

        calls: list[list[str]] = []

        def spy_run(args: list[str], *_a: Any, **_kw: Any) -> Any:
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

        jira_me_calls = [
            c for c in calls if len(c) >= 2 and c[0] == "jira" and c[1] == "me"
        ]
        assert len(jira_me_calls) == 1, (
            f"Expected exactly one `jira me` call; got: {calls}"
        )

    def test_update_story_skips_jira_me_when_story_already_assigned(
        self,
        jira_project: Path,
        enabled_jira_config: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Even when jira is enabled, an already-assigned story must NOT have
        its `assigned_to` overwritten by the `jira me` auto-assignee path
        (story 200-2 has `assigned_to: other@example.com` pre-set).
        """
        from pf.sprint import story_update

        mock_run = MagicMock(
            side_effect=AssertionError(
                "Already-assigned story must not trigger jira me overwrite"
            )
        )
        monkeypatch.setattr(story_update.subprocess, "run", mock_run)

        sprint_path = jira_project / "sprint" / "current-sprint.yaml"
        result = story_update.update_story(
            sprint_path, "200-2", status="in_progress"
        )

        assert result.get("success") is True, (
            f"update_story failed: {result.get('error')}"
        )
        mock_run.assert_not_called()


# =============================================================================
# AC5: Hygiene — no new corporate-email/domain leakage
# =============================================================================


class TestNoCorporateLeakageInGatingCode:
    """AC5: The implementation must not introduce new corporate-domain or
    email strings. The 152-1 hygiene gate stays green.
    """

    @pytest.mark.parametrize(
        "module_name",
        [
            "pf.jira.client",
            "pf.sprint.work",
            "pf.sprint.story_update",
        ],
    )
    def test_module_has_no_corporate_domain(self, module_name: str) -> None:
        """Scan the module source for any corporate email/domain references."""
        import importlib

        module = importlib.import_module(module_name)
        assert module.__file__ is not None
        source = Path(module.__file__).read_text().lower()
        for bad in ("@redacted-corp.com", "redacted-corp.atlassian.net"):
            assert bad not in source, (
                f"Forbidden corporate string '{bad}' found in {module.__file__}"
            )
