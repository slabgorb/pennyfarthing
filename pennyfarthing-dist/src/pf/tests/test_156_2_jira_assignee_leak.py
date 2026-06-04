"""Tests for story 156-2 — jira-cli assignee email leak (gh #12).

TDD RED phase: tests encode the acceptance criteria for the live hole.

The bug: `pf sprint story update <id> --status in_progress` auto-populates
`assigned_to` by shelling out to `jira me`. A partial gate exists at
`story_update.py` (`is_jira_enabled() and story.get("jira")`), but
`story.get("jira")` is TRUTHY for the literal string `"none"` (and other
placeholder sentinels), so a `jira: none` story STILL calls `jira me` and
leaks the user's work email into a personal-project YAML.

Acceptance Criteria:
- AC1 (the leak): in_progress on a story whose `jira` is `none`/`""`/absent
  must NOT call `jira me` and must NOT write a jira-derived `assigned_to`.
- AC2: explicit `assigned_to` is honored regardless of jira state.
- AC3 (regression): a story WITH a real jira key + jira enabled STILL
  auto-assigns from `jira me`.
- AC4 (doc-scrub guard): shipped pf-jira skill docs contain no hardcoded
  corporate emails / real-person mapping table.
"""

import re
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_update import update_story
from pf.sprint.yaml_io import read_sprint

# Sentinel email the mocked `jira me` returns. If this string ever lands in a
# story dict or persisted YAML for a no-jira story, the leak reproduced.
LEAK_EMAIL = "leak@corp.example"


# =============================================================================
# Fixtures — sprint YAMLs whose stories vary only in their `jira` field.
# =============================================================================


def _sprint_yaml(story_extra: str) -> str:
    """Build a one-epic, one-story sprint YAML. `story_extra` is indented
    YAML lines (8 spaces) injected into the single story."""
    return f"""\
sprint:
  name: "Personal Sprint"
  jira_sprint_id: 276
  jira_sprint_name: "Personal Sprint"
  goal: ship it
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-156
    type: epic
    title: "Epic: leak repro"
    priority: P1
    status: in_progress
    stories:
      - id: 156-9
        title: Repro story
        points: 2
        priority: P1
        status: backlog
        workflow: tdd
{story_extra}
"""


@pytest.fixture
def jira_none_file(tmp_path: Path) -> Path:
    """Story whose jira key is the literal string 'none' — the live hole."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(_sprint_yaml('        jira: "none"\n'))
    return p


@pytest.fixture
def jira_empty_file(tmp_path: Path) -> Path:
    """Story whose jira key is an empty string."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(_sprint_yaml('        jira: ""\n'))
    return p


@pytest.fixture
def jira_absent_file(tmp_path: Path) -> Path:
    """Story with no jira field at all."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(_sprint_yaml(""))
    return p


@pytest.fixture
def jira_real_key_file(tmp_path: Path) -> Path:
    """Story WITH a real jira key — auto-assign SHOULD fire here."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(_sprint_yaml("        jira: PROJ-14257\n"))
    return p


def _leaking_subprocess_run() -> MagicMock:
    """A subprocess.run mock that, if called like `jira me`, returns the
    sentinel work email on stdout (returncode 0)."""
    mock = MagicMock()
    completed = MagicMock(spec=subprocess.CompletedProcess)
    completed.returncode = 0
    completed.stdout = LEAK_EMAIL + "\n"
    mock.return_value = completed
    return mock


# =============================================================================
# AC1 — the leak: no-jira stories must NOT invoke `jira me` nor get the email.
# =============================================================================


class TestNoJiraStoryDoesNotLeak:
    """A story with no real jira key must never trigger `jira me`."""

    @pytest.mark.parametrize(
        "fixture_name",
        ["jira_none_file", "jira_empty_file", "jira_absent_file"],
    )
    def test_in_progress_does_not_call_jira_me(
        self, request: pytest.FixtureRequest, fixture_name: str
    ) -> None:
        """in_progress on a none/empty/absent-jira story must NOT shell out to
        `jira me`. Jira is enabled globally; only the story's missing key
        should suppress the call.

        This is the core RED assertion. `jira: "none"` is the live hole:
        `story.get("jira")` is truthy for the literal string "none", so the
        gate lets `jira me` run and the user's work email is fetched. (The
        downstream YAML write then fails validation on the bad key, so the
        leak does not *persist* — but the work email was already shelled out
        for and captured in process memory, which is the privacy bug.) We
        assert on the CALL, not on the persisted value or success flag.
        """
        sprint_file: Path = request.getfixturevalue(fixture_name)

        run_mock = _leaking_subprocess_run()
        with patch("pf.sprint.story_update.is_jira_enabled", return_value=True), patch(
            "pf.sprint.story_update.subprocess.run", run_mock
        ):
            update_story(
                sprint_path=sprint_file,
                story_id="156-9",
                status="in_progress",
            )

        # `jira me` must never have been invoked for a no-real-key story.
        jira_me_calls = [
            c
            for c in run_mock.call_args_list
            if c.args and list(c.args[0])[:2] == ["jira", "me"]
        ]
        assert jira_me_calls == [], (
            f"jira me was called for a no-jira story ({fixture_name}); "
            "the assignee gate did not normalize the missing/sentinel jira key"
        )

    @pytest.mark.parametrize(
        "fixture_name",
        ["jira_none_file", "jira_empty_file", "jira_absent_file"],
    )
    def test_sentinel_email_never_persisted(
        self, request: pytest.FixtureRequest, fixture_name: str
    ) -> None:
        """The mocked work email must never appear in the story dict or the
        persisted YAML for a no-jira story."""
        sprint_file: Path = request.getfixturevalue(fixture_name)

        run_mock = _leaking_subprocess_run()
        with patch("pf.sprint.story_update.is_jira_enabled", return_value=True), patch(
            "pf.sprint.story_update.subprocess.run", run_mock
        ):
            update_story(
                sprint_path=sprint_file,
                story_id="156-9",
                status="in_progress",
            )

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][0]
        assert story.get("assigned_to") != LEAK_EMAIL, (
            f"work email leaked into assigned_to for {fixture_name}"
        )
        assert LEAK_EMAIL not in sprint_file.read_text(), (
            f"work email leaked into persisted YAML for {fixture_name}"
        )


# =============================================================================
# AC2 — explicit assigned_to is honored regardless of jira state.
# =============================================================================


class TestExplicitAssigneeHonored:
    """An explicit assigned_to wins and suppresses the jira lookup."""

    def test_explicit_assignee_used_no_jira_call(self, jira_absent_file: Path) -> None:
        run_mock = _leaking_subprocess_run()
        with patch("pf.sprint.story_update.is_jira_enabled", return_value=True), patch(
            "pf.sprint.story_update.subprocess.run", run_mock
        ):
            result = update_story(
                sprint_path=jira_absent_file,
                story_id="156-9",
                status="in_progress",
                assigned_to="me@example.com",
            )

        assert result["success"] is True

        data = read_sprint(jira_absent_file)
        story = data["epics"][0]["stories"][0]
        assert story["assigned_to"] == "me@example.com"
        assert story["assigned_to"] != LEAK_EMAIL

        jira_me_calls = [
            c
            for c in run_mock.call_args_list
            if c.args and list(c.args[0])[:2] == ["jira", "me"]
        ]
        assert jira_me_calls == [], "explicit assignee must suppress `jira me`"

    def test_explicit_assignee_honored_with_real_key(
        self, jira_real_key_file: Path
    ) -> None:
        """Even with a real jira key, an explicit assignee is preferred over
        `jira me`."""
        run_mock = _leaking_subprocess_run()
        with patch("pf.sprint.story_update.is_jira_enabled", return_value=True), patch(
            "pf.sprint.story_update.subprocess.run", run_mock
        ):
            update_story(
                sprint_path=jira_real_key_file,
                story_id="156-9",
                status="in_progress",
                assigned_to="me@example.com",
            )

        data = read_sprint(jira_real_key_file)
        story = data["epics"][0]["stories"][0]
        assert story["assigned_to"] == "me@example.com"


# =============================================================================
# AC3 — regression: a real jira key + enabled STILL auto-assigns from jira me.
# =============================================================================


class TestRealJiraKeyStillAutoAssigns:
    """The legitimate auto-assign path must keep working."""

    def test_real_key_auto_assigns_from_jira_me(self, jira_real_key_file: Path) -> None:
        run_mock = _leaking_subprocess_run()
        with patch("pf.sprint.story_update.is_jira_enabled", return_value=True), patch(
            "pf.sprint.story_update.subprocess.run", run_mock
        ):
            result = update_story(
                sprint_path=jira_real_key_file,
                story_id="156-9",
                status="in_progress",
            )

        assert result["success"] is True

        # jira me SHOULD have been called for a real-key story.
        jira_me_calls = [
            c
            for c in run_mock.call_args_list
            if c.args and list(c.args[0])[:2] == ["jira", "me"]
        ]
        assert jira_me_calls, "`jira me` should fire for a story with a real jira key"

        data = read_sprint(jira_real_key_file)
        story = data["epics"][0]["stories"][0]
        assert story["assigned_to"] == LEAK_EMAIL, (
            "real-key story should auto-assign the value returned by `jira me`"
        )


# =============================================================================
# AC4 — doc-scrub guard: shipped pf-jira skill docs carry no real corporate
# emails / real-person mapping table.
# =============================================================================


# Resolve the SHIPPED skill dir relative to the installed package, so the guard
# checks what actually ships, not a working-copy path. tests/ -> pf -> src ->
# pennyfarthing-dist -> skills/pf-jira
_SKILL_DIR = (
    Path(__file__).resolve().parents[3] / "skills" / "pf-jira"
)

# Email-like pattern that deliberately EXCLUDES known-safe placeholder hosts
# (example.com/org, your-org.com). Anything else that looks like a real
# corporate address should fail the guard.
_PLACEHOLDER_HOSTS = ("example.com", "example.org", "your-org.com", "your-org")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _corporate_emails_in(text: str) -> list[str]:
    hits = []
    for m in _EMAIL_RE.findall(text):
        host = m.split("@", 1)[1].lower()
        if any(host == h or host.endswith("." + h) for h in _PLACEHOLDER_HOSTS):
            continue
        hits.append(m)
    return hits


class TestShippedDocsAreScrubbed:
    """Shipped pf-jira skill docs must not embed real corporate emails."""

    def test_skill_dir_exists(self) -> None:
        assert _SKILL_DIR.is_dir(), f"skill dir not found: {_SKILL_DIR}"

    @pytest.mark.parametrize("doc_name", ["jira.md", "examples.md", "usage.md"])
    def test_no_corporate_emails(self, doc_name: str) -> None:
        doc = _SKILL_DIR / doc_name
        if not doc.exists():
            pytest.skip(f"{doc_name} not present")
        hits = _corporate_emails_in(doc.read_text())
        assert hits == [], (
            f"{doc_name} embeds non-placeholder email(s): {hits} — "
            "genericize to you@example.com / your-org.com"
        )

    def test_no_realperson_mapping_table(self) -> None:
        """If a 'GitHub to Jira User Mapping' table ships, its example rows
        must use generic placeholders, not real-person github→email mappings."""
        doc = _SKILL_DIR / "jira.md"
        hits = _corporate_emails_in(doc.read_text())
        assert hits == [], (
            f"user-mapping section embeds real emails: {hits}"
        )
