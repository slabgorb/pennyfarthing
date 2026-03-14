"""Tests for Story 148-2: Portrait pane does not follow agent changes.

Verifies:
  AC1: Portrait pane updates when agent changes (handoff, activation, relay)
  AC2: No manual refresh needed — pane reacts to agent change signals

Root cause: "persona" channel is not in POLL_CHANNELS, so after initial
WebSocket connection, persona data is never re-fetched or broadcast.
The portrait pane stays stuck on whichever agent was first displayed.

Run with: python -m pytest tests/python/test_portrait_pane_agent_follow.py -v
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# AC1: Persona channel must be polled for changes
# ---------------------------------------------------------------------------


class TestPersonaInPollChannels:
    """Persona channel must be included in POLL_CHANNELS so agent changes
    are detected and broadcast to the TUI portrait pane."""

    def test_persona_channel_is_polled(self):
        """persona must be in POLL_CHANNELS for portrait to follow agent changes."""
        from pf.frame.ws_push import POLL_CHANNELS

        assert "persona" in POLL_CHANNELS, (
            "persona channel must be in POLL_CHANNELS so agent changes "
            "are broadcast to the TUI. Currently only sent on initial connect."
        )

    def test_persona_channel_has_fetcher(self):
        """persona must have a registered fetcher in CHANNEL_FETCHERS."""
        from pf.frame.ws_push import CHANNEL_FETCHERS

        assert "persona" in CHANNEL_FETCHERS, (
            "persona channel must have a fetcher to provide data on poll"
        )

    def test_persona_fetcher_is_callable(self):
        """The persona fetcher must be a callable function."""
        from pf.frame.ws_push import CHANNEL_FETCHERS

        fetcher = CHANNEL_FETCHERS.get("persona")
        assert callable(fetcher), "persona fetcher must be callable"


# ---------------------------------------------------------------------------
# AC1: fetch_persona detects agent file changes
# ---------------------------------------------------------------------------


class TestFetchPersonaDetectsAgentChanges:
    """fetch_persona reads .session/agents/ and returns data for the most
    recently modified agent file. When agents change, the fetcher must
    return different data."""

    @pytest.fixture
    def agents_dir(self, tmp_path: Path) -> Path:
        """Create a temporary .session/agents/ directory."""
        d = tmp_path / ".session" / "agents"
        d.mkdir(parents=True)
        return d

    def test_fetch_persona_returns_latest_agent(self, tmp_path: Path, agents_dir: Path):
        """fetch_persona should return data for the most recently written agent file."""
        from pf.frame.ws_push import fetch_persona

        # Write first agent
        (agents_dir / "sm").write_text("sm")
        time.sleep(0.05)
        # Write second agent (more recent)
        (agents_dir / "tea").write_text("tea")

        with patch("pf.frame.ws_push._get_project_dir", return_value=str(tmp_path)):
            with patch("pf.prime.persona.load_persona") as mock_load:
                mock_persona = MagicMock()
                mock_persona.character = "Amos Burton"
                mock_persona.style = "Methodical"
                mock_persona.quote = "I am that guy"
                mock_persona.motto = ""
                mock_persona.trait = "Relentless"
                mock_load.return_value = (mock_persona, "the-expanse")

                result = fetch_persona()

                # Should have called load_persona with "tea" (most recent)
                mock_load.assert_called_once()
                call_args = mock_load.call_args
                assert call_args[0][0] == "tea", (
                    f"Should load most recent agent 'tea', got '{call_args[0][0]}'"
                )

    def test_fetch_persona_changes_on_agent_switch(self, tmp_path: Path, agents_dir: Path):
        """When the active agent changes, fetch_persona should return different data."""
        from pf.frame.ws_push import fetch_persona

        with patch("pf.frame.ws_push._get_project_dir", return_value=str(tmp_path)):
            # First agent: sm
            (agents_dir / "sm").write_text("sm")

            with patch("pf.prime.persona.load_persona") as mock_load:
                sm_persona = MagicMock()
                sm_persona.character = "Camina Drummer"
                sm_persona.style = "Direct"
                sm_persona.quote = "Belt first"
                sm_persona.motto = ""
                sm_persona.trait = "Fierce"
                mock_load.return_value = (sm_persona, "the-expanse")

                result_sm = fetch_persona()

            time.sleep(0.05)

            # Switch agent: touch tea as most recent
            (agents_dir / "tea").write_text("tea")

            with patch("pf.prime.persona.load_persona") as mock_load:
                tea_persona = MagicMock()
                tea_persona.character = "Amos Burton"
                tea_persona.style = "Methodical"
                tea_persona.quote = "I am that guy"
                tea_persona.motto = ""
                tea_persona.trait = "Relentless"
                mock_load.return_value = (tea_persona, "the-expanse")

                result_tea = fetch_persona()

            assert result_sm.get("role") != result_tea.get("role"), (
                f"fetch_persona should return different roles after agent switch. "
                f"SM result: {result_sm}, TEA result: {result_tea}"
            )
            assert result_sm.get("character") != result_tea.get("character"), (
                "Character should change when agent switches"
            )

    def test_fetch_persona_empty_agents_dir(self, tmp_path: Path, agents_dir: Path):
        """Empty agents dir should return empty dict, not crash."""
        from pf.frame.ws_push import fetch_persona

        with patch("pf.frame.ws_push._get_project_dir", return_value=str(tmp_path)):
            result = fetch_persona()
            assert result == {}, "Empty agents dir should return empty dict"

    def test_fetch_persona_no_agents_dir(self, tmp_path: Path):
        """Missing agents dir should return empty dict, not crash."""
        from pf.frame.ws_push import fetch_persona

        with patch("pf.frame.ws_push._get_project_dir", return_value=str(tmp_path)):
            result = fetch_persona()
            assert result == {}, "Missing agents dir should return empty dict"


# ---------------------------------------------------------------------------
# AC2: poll_and_broadcast includes persona channel
# ---------------------------------------------------------------------------


class TestPollBroadcastIncludesPersona:
    """poll_and_broadcast must poll the persona channel so the TUI receives
    updates without manual refresh."""

    @pytest.mark.asyncio
    async def test_poll_broadcasts_persona_when_clients_connected(self):
        """When clients are connected to persona channel, poll_and_broadcast
        should call fetch_persona and broadcast the result."""
        import asyncio

        from pf.frame.ws_push import POLL_CHANNELS, poll_and_broadcast

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        # Simulate a connected persona client
        mock_clients = {"persona": [MagicMock()]}

        persona_data = {
            "character": "Amos Burton",
            "role": "tea",
            "roleDescription": "Methodical",
            "quote": "I am that guy",
            "theme": "the-expanse",
            "trait": "Relentless",
            "isStreaming": False,
        }

        with (
            patch("pf.frame.app._ws_clients", mock_clients),
            patch(
                "pf.frame.ws_push.CHANNEL_FETCHERS",
                {"persona": lambda: persona_data},
            ),
        ):
            # Run one iteration of the poll loop (cancel after first sleep)
            task = asyncio.create_task(poll_and_broadcast(mock_broadcast))
            await asyncio.sleep(0.1)  # Let poll_and_broadcast start
            # Give it time to complete one poll cycle
            await asyncio.sleep(5.5)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        persona_broadcasts = [c for c in broadcast_calls if c[0] == "persona"]
        assert len(persona_broadcasts) > 0, (
            "poll_and_broadcast must broadcast persona data when clients are "
            "connected. Got broadcasts for channels: "
            f"{[c[0] for c in broadcast_calls]}"
        )

    @pytest.mark.asyncio
    async def test_poll_skips_persona_when_no_clients(self):
        """When no clients are connected to persona channel, skip broadcast."""
        import asyncio

        from pf.frame.ws_push import poll_and_broadcast

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        # No persona clients connected
        mock_clients: dict = {}

        with patch("pf.frame.app._ws_clients", mock_clients):
            task = asyncio.create_task(poll_and_broadcast(mock_broadcast))
            await asyncio.sleep(5.5)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        persona_broadcasts = [c for c in broadcast_calls if c[0] == "persona"]
        assert len(persona_broadcasts) == 0, (
            "Should not broadcast persona when no clients connected"
        )


# ---------------------------------------------------------------------------
# AC1: TUI header updates on persona message (integration)
# ---------------------------------------------------------------------------


class TestTuiHeaderFollowsAgentChange:
    """The TUI AgentHeader must re-render when a new persona message arrives,
    showing the new agent's character, role, and portrait."""

    PERSONA_SM = {
        "character": "Camina Drummer",
        "role": "sm",
        "roleDescription": "Story coordination",
        "quote": "Belt first",
        "theme": "the-expanse",
        "trait": "Fierce loyalty",
    }

    PERSONA_TEA = {
        "character": "Amos Burton",
        "role": "tea",
        "roleDescription": "Test engineer",
        "quote": "I am that guy",
        "theme": "the-expanse",
        "trait": "Relentless testing",
    }

    PERSONA_DEV = {
        "character": "Naomi Nagata",
        "role": "dev",
        "roleDescription": "Developer",
        "quote": "There is always a way",
        "theme": "the-expanse",
        "trait": "Engineering genius",
    }

    @pytest.fixture
    def app(self):
        from pf.tui.tui import Frame TUIApp

        return Frame TUIApp()

    async def test_header_updates_role_on_agent_change(self, app):
        """Header should show new role when agent changes sm → tea."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            # Start with SM
            header._apply_persona(self.PERSONA_SM)
            await pilot.pause()

            # Switch to TEA
            header._apply_persona(self.PERSONA_TEA)
            await pilot.pause()

            try:
                text_widget = header.query_one("#agent-text")
                rendered = str(text_widget.render())
            except Exception:
                rendered = str(header.render())

            assert "Amos" in rendered or "TEA" in rendered, (
                f"Header should show TEA agent after switch, got: '{rendered}'"
            )
            assert "Drummer" not in rendered, (
                "SM agent name should not be visible after switching to TEA"
            )

    async def test_header_updates_through_three_agent_changes(self, app):
        """Header should correctly follow sm → tea → dev transitions."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            for persona, expected_name in [
                (self.PERSONA_SM, "Drummer"),
                (self.PERSONA_TEA, "Amos"),
                (self.PERSONA_DEV, "Naomi"),
            ]:
                header._apply_persona(persona)
                await pilot.pause()

                try:
                    text_widget = header.query_one("#agent-text")
                    rendered = str(text_widget.render())
                except Exception:
                    rendered = str(header.render())

                assert expected_name in rendered, (
                    f"Header should show '{expected_name}' for role "
                    f"'{persona['role']}', got: '{rendered}'"
                )

    async def test_persona_update_message_triggers_header_refresh(self, app):
        """PersonaUpdate message through Textual event system should update header."""
        async with app.run_test() as pilot:
            # Set initial persona
            header = app.query_one("#agent-header")
            header._apply_persona(self.PERSONA_SM)
            await pilot.pause()

            # Simulate what _handle_persona_message does
            app._handle_persona_message(self.PERSONA_TEA)
            await pilot.pause()

            try:
                text_widget = header.query_one("#agent-text")
                rendered = str(text_widget.render())
            except Exception:
                rendered = str(header.render())

            assert "Amos" in rendered or "TEA" in rendered, (
                f"Message-driven update should show TEA, got: '{rendered}'"
            )
