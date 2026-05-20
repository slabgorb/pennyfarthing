"""Tests for CLI-level gating of pf jira mutating commands.

When `is_jira_enabled()` is False (no `jira.project` + `jira.url` config),
mutating Jira commands must fail-closed: exit non-zero with a clear stderr
message, WITHOUT invoking any downstream Jira logic.

Triggered by an incident where `sm-setup` ran `pf jira create epic 153`
against a kanban-only project that has no Jira configuration. The framework
silently attempted the create. Fix: gate at the CLI layer so any future caller
(agent prompt, hook, human) fails loudly instead of contacting Jira.

Gated commands (mutating):
  - create epic
  - create story
  - create standalone
  - claim
  - check       (uses claim flow under the hood)
  - move
  - assign
  - link
  - sync
  - bidirectional
  - sprint add
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.jira.cli import jira as jira_group


@pytest.fixture
def disabled_jira(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force is_jira_enabled() to resolve False."""
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: {},
    )
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)


@pytest.fixture
def enabled_jira(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force is_jira_enabled() to resolve True."""
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: {"jira": {"project": "PROJ", "url": "https://jira.example.com"}},
    )


class TestCreateEpicDisabled:
    """`pf jira create epic <id>` must refuse to run when jira is disabled."""

    def test_exits_nonzero_when_disabled(self, disabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.create.create_epic_in_jira") as create_mock:
            result = runner.invoke(jira_group, ["create", "epic", "153"])
        assert result.exit_code != 0, f"expected nonzero exit, got {result.exit_code}\n{result.output}"
        assert create_mock.call_count == 0, "create_epic_in_jira must NOT be called when jira disabled"

    def test_error_message_mentions_jira_disabled(self, disabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.create.create_epic_in_jira"):
            result = runner.invoke(jira_group, ["create", "epic", "153"])
        output = (result.output or "") + (str(result.stderr_bytes or b"", "utf-8") if hasattr(result, "stderr_bytes") else "")
        # Click's mix_stderr=True by default — both go to .output
        assert "jira" in output.lower() and (
            "not configured" in output.lower()
            or "not enabled" in output.lower()
            or "disabled" in output.lower()
        ), f"error output should explain jira is not configured: {output!r}"


class TestClaimDisabled:
    """`pf jira claim <key>` must refuse to run when jira is disabled."""

    def test_exits_nonzero_when_disabled(self, disabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.claim.main") as claim_mock:
            result = runner.invoke(jira_group, ["claim", "PROJ-1"])
        assert result.exit_code != 0
        assert claim_mock.call_count == 0, "claim.main must NOT be called when jira disabled"


class TestMoveDisabled:
    """`pf jira move <key> <status>` must refuse to run when jira is disabled."""

    def test_exits_nonzero_when_disabled(self, disabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.operations.move_issue") as move_mock:
            result = runner.invoke(jira_group, ["move", "PROJ-1", "Done"])
        assert result.exit_code != 0
        assert move_mock.call_count == 0


class TestCheckDisabled:
    """`pf jira check <key>` must refuse to run when jira is disabled.

    sm-setup uses `pf jira check` as a precondition before claiming. When
    jira is not configured, the check itself must report 'not synced' (exit
    nonzero) rather than invoking the jira CLI.
    """

    def test_exits_nonzero_when_disabled(self, disabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.claim.main") as claim_mock:
            result = runner.invoke(jira_group, ["check", "PROJ-1"])
        assert result.exit_code != 0
        assert claim_mock.call_count == 0


class TestEnabledStillWorks:
    """Regression: when jira IS enabled, the commands still dispatch to their
    backing implementation (we don't break the happy path)."""

    def test_create_epic_dispatches_when_enabled(self, enabled_jira: None) -> None:
        runner = CliRunner()
        with patch(
            "pf.jira.create.create_epic_in_jira",
            return_value={"success": True},
        ) as create_mock:
            result = runner.invoke(jira_group, ["create", "epic", "153"])
        assert result.exit_code == 0, result.output
        assert create_mock.call_count == 1

    def test_claim_dispatches_when_enabled(self, enabled_jira: None) -> None:
        runner = CliRunner()
        with patch("pf.jira.claim.main", return_value=0) as claim_mock:
            result = runner.invoke(jira_group, ["claim", "PROJ-1"])
        assert result.exit_code == 0
        assert claim_mock.call_count == 1
