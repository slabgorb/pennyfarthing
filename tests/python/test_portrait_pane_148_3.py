"""Tests for Story 148-3: Portrait pane shows description instead of portrait.

Two bugs:
  1. Portrait pane shows agent description text instead of portrait image because
     fetch_persona() does not resolve and include portraitPath in the persona data
     dict. The TUI must resolve locally, which may fail. Fix: resolve portrait path
     server-side in fetch_persona() and include portraitPath in the returned dict.

  2. Portrait quote changes on every TUI refresh (~2s) because load_persona() calls
     random.choice(catchphrases) on every invocation, and fetch_persona() calls
     load_persona() on every poll cycle. Fix: cache the selected quote per agent so
     it only changes when the active agent changes.

Acceptance Criteria:
  AC-1: Portrait pane displays the agent's portrait image (not description text)
  AC-2: Portrait quote caches per agent session and only changes when agent changes
  AC-3: No console errors or warnings related to portrait rendering

Run with: python -m pytest tests/python/test_portrait_pane_148_3.py -v
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def clear_quote_cache():
    from pf.prime.persona import _quote_cache
    _quote_cache.clear()
    yield
    _quote_cache.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_THEME_YAML = {
    "theme": {"name": "test-theme"},
    "agents": {
        "sm": {
            "character": "Test Leader",
            "style": "Coordinates with precision",
            "role": "The test leader",
            "catchphrases": [
                "First catchphrase!",
                "Second catchphrase!",
                "Third catchphrase!",
            ],
        },
        "dev": {
            "character": "Test Developer",
            "style": "Writes code elegantly",
            "role": "The coder",
            "catchphrases": [
                "Ship it!",
                "LGTM!",
            ],
        },
    },
}


def _setup_fake_agent(tmp_path: Path, agent_name: str = "sm") -> Path:
    """Create a fake .session/agents directory with an active agent file."""
    agents_dir = tmp_path / ".session" / "agents"
    agents_dir.mkdir(parents=True)
    agent_file = agents_dir / agent_name
    agent_file.write_text(agent_name)
    return tmp_path


# ---------------------------------------------------------------------------
# AC-1: fetch_persona includes portraitPath for TUI portrait rendering
# ---------------------------------------------------------------------------


class TestFetchPersonaIncludesPortraitPath:
    """AC-1: fetch_persona should resolve and include portraitPath in returned data."""

    def test_fetch_persona_returns_portrait_path_key(self, tmp_path: Path):
        """fetch_persona dict must contain 'portraitPath' key."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        fake_portrait = tmp_path / "portraits" / "sm.png"
        fake_portrait.parent.mkdir(parents=True)
        fake_portrait.write_bytes(b"\x89PNG")

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.tui.portrait_resolver.resolve_portrait_path", return_value=fake_portrait),
        ):
            from pf.prime.models import Persona

            mock_persona = Persona(
                character="Test Leader",
                style="Coordinates with precision",
                role="The test leader",
                quote="First catchphrase!",
            )
            mock_load.return_value = (mock_persona, "test-theme")

            from pf.frame.ws_push import fetch_persona

            result = fetch_persona()

        assert result, "fetch_persona should return data for active agent"
        assert "portraitPath" in result, (
            "fetch_persona must include 'portraitPath' key in returned dict. "
            f"Got keys: {list(result.keys())}"
        )

    def test_fetch_persona_portrait_path_is_resolved_path(self, tmp_path: Path):
        """portraitPath should be the resolved file path string, not None."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        fake_portrait = tmp_path / "portraits" / "sm.png"
        fake_portrait.parent.mkdir(parents=True)
        fake_portrait.write_bytes(b"\x89PNG")

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.tui.portrait_resolver.resolve_portrait_path", return_value=fake_portrait),
        ):
            from pf.prime.models import Persona

            mock_persona = Persona(
                character="Test Leader",
                style="Coordinates with precision",
                role="The test leader",
                quote="First catchphrase!",
            )
            mock_load.return_value = (mock_persona, "test-theme")

            from pf.frame.ws_push import fetch_persona

            result = fetch_persona()

        portrait_path = result.get("portraitPath")
        assert portrait_path is not None, (
            "portraitPath should be a resolved path string, not None"
        )
        assert str(fake_portrait) == portrait_path, (
            f"portraitPath should be '{fake_portrait}', got '{portrait_path}'"
        )

    def test_fetch_persona_portrait_path_none_when_no_portrait(self, tmp_path: Path):
        """portraitPath should be None (not absent) when no portrait exists."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.tui.portrait_resolver.resolve_portrait_path", return_value=None),
        ):
            from pf.prime.models import Persona

            mock_persona = Persona(
                character="Test Leader",
                style="Coordinates with precision",
                role="The test leader",
                quote="First catchphrase!",
            )
            mock_load.return_value = (mock_persona, "test-theme")

            from pf.frame.ws_push import fetch_persona

            result = fetch_persona()

        assert "portraitPath" in result, (
            "portraitPath key must be present even when no portrait exists. "
            f"Got keys: {list(result.keys())}"
        )
        assert result["portraitPath"] is None, (
            "portraitPath should be None when no portrait file exists"
        )


# ---------------------------------------------------------------------------
# AC-1: TUI renders portrait image when portraitPath is provided
# ---------------------------------------------------------------------------


class TestTuiRendersPortraitFromData:
    """AC-1: When portraitPath is in persona data, TUI should attempt portrait display."""

    def test_render_header_posts_portrait_update_with_path(self, tmp_path: Path):
        """_render_header should post PortraitLayoutUpdate with the portraitPath from data."""
        from pf.tui.app import AgentHeader

        fake_portrait = tmp_path / "portrait.png"
        fake_portrait.write_bytes(b"\x89PNG")

        header = AgentHeader()
        header._persona_data = {
            "character": "Test Leader",
            "role": "sm",
            "roleDescription": "Coordinates with precision",
            "quote": "First catchphrase!",
            "theme": "test-theme",
            "portraitPath": str(fake_portrait),
        }
        header._is_streaming = False

        # Track posted messages
        posted_messages = []
        header.post_message = lambda msg: posted_messages.append(msg)

        header._render_header()

        portrait_updates = [
            m for m in posted_messages
            if isinstance(m, AgentHeader.PortraitLayoutUpdate)
        ]
        assert len(portrait_updates) == 1, (
            f"Expected exactly 1 PortraitLayoutUpdate, got {len(portrait_updates)}"
        )
        update = portrait_updates[0]
        assert update.has_portrait is True, (
            "PortraitLayoutUpdate.has_portrait should be True when portraitPath is provided"
        )
        assert update.portrait_path == fake_portrait, (
            f"Portrait path should be {fake_portrait}, got {update.portrait_path}"
        )


# ---------------------------------------------------------------------------
# AC-2: Quote caching — repeated fetch_persona calls return same quote
# ---------------------------------------------------------------------------


class TestQuoteCachesPerAgent:
    """AC-2: Quote should be stable across repeated fetch_persona calls for same agent."""

    def test_repeated_fetch_persona_returns_same_quote(self, tmp_path: Path):
        """Multiple fetch_persona calls for same agent must return identical quote."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        import yaml

        theme_path = tmp_path / ".pennyfarthing" / "themes" / "test-theme.yaml"
        theme_path.parent.mkdir(parents=True)
        theme_path.write_text(yaml.dump(FAKE_THEME_YAML))

        config_path = tmp_path / ".pennyfarthing" / "config.local.yaml"
        config_path.write_text(yaml.dump({"theme": "test-theme"}))

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.get_project_root", return_value=project_dir),
            patch("pf.prime.persona.get_current_theme", return_value="test-theme"),
            patch("pf.prime.persona.load_theme", return_value=FAKE_THEME_YAML),
        ):
            from pf.frame.ws_push import fetch_persona

            quotes = set()
            for _ in range(20):
                result = fetch_persona()
                if result and result.get("quote"):
                    quotes.add(result["quote"])

        assert len(quotes) == 1, (
            f"Expected exactly 1 unique quote across 20 calls (cached), "
            f"but got {len(quotes)}: {quotes}"
        )

    def test_quote_changes_when_agent_changes(self, tmp_path: Path):
        """Quote should potentially change when switching to a different agent."""
        project_dir = _setup_fake_agent(tmp_path, "sm")
        agents_dir = tmp_path / ".session" / "agents"

        import yaml

        theme_path = tmp_path / ".pennyfarthing" / "themes" / "test-theme.yaml"
        theme_path.parent.mkdir(parents=True)
        theme_path.write_text(yaml.dump(FAKE_THEME_YAML))

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.get_project_root", return_value=project_dir),
            patch("pf.prime.persona.get_current_theme", return_value="test-theme"),
            patch("pf.prime.persona.load_theme", return_value=FAKE_THEME_YAML),
        ):
            from pf.frame.ws_push import fetch_persona

            # First agent: sm
            result_sm = fetch_persona()

            # Switch to dev agent
            dev_file = agents_dir / "dev"
            dev_file.write_text("dev")
            # Make dev file newer
            time.sleep(0.05)
            os.utime(dev_file, None)

            result_dev = fetch_persona()

            # Quotes should come from different catchphrase lists
            assert result_sm.get("character") == "Test Leader"
            assert result_dev.get("character") == "Test Developer"
            # The cache should have been invalidated on agent change
            # (we can't assert quotes are different since they COULD randomly match,
            # but we CAN assert the character changed, confirming agent switch detection)


class TestLoadPersonaQuoteCaching:
    """AC-2: load_persona should cache the selected catchphrase per agent."""

    def test_load_persona_returns_same_quote_on_repeated_calls(self):
        """Repeated load_persona calls for same agent should return same quote."""
        from pf.prime.persona import load_persona

        with (
            patch("pf.prime.persona.get_current_theme", return_value="test-theme"),
            patch("pf.prime.persona.load_theme", return_value=FAKE_THEME_YAML),
        ):
            quotes = set()
            for _ in range(20):
                persona, _ = load_persona("sm")
                if persona and persona.quote:
                    quotes.add(persona.quote)

        # sm has 3 catchphrases — without caching, random.choice will vary
        assert len(quotes) == 1, (
            f"Expected exactly 1 unique quote across 20 calls (cached), "
            f"but got {len(quotes)}: {quotes}. "
            "load_persona should cache the selected catchphrase per agent."
        )

    def test_load_persona_cache_invalidates_on_agent_change(self):
        """Cache should produce (potentially) different quote for different agent."""
        from pf.prime.persona import load_persona

        with (
            patch("pf.prime.persona.get_current_theme", return_value="test-theme"),
            patch("pf.prime.persona.load_theme", return_value=FAKE_THEME_YAML),
        ):
            # Load sm multiple times — should be stable
            sm_quotes = set()
            for _ in range(10):
                persona, _ = load_persona("sm")
                if persona and persona.quote:
                    sm_quotes.add(persona.quote)

            # Load dev — should be stable but potentially different catchphrase list
            dev_quotes = set()
            for _ in range(10):
                persona, _ = load_persona("dev")
                if persona and persona.quote:
                    dev_quotes.add(persona.quote)

        assert len(sm_quotes) == 1, (
            f"sm quote should be cached (1 unique), got {len(sm_quotes)}: {sm_quotes}"
        )
        assert len(dev_quotes) == 1, (
            f"dev quote should be cached (1 unique), got {len(dev_quotes)}: {dev_quotes}"
        )


# ---------------------------------------------------------------------------
# AC-2: ws_push quote stability across poll cycles
# ---------------------------------------------------------------------------


class TestWsPushQuoteStabilityAcrossPolls:
    """AC-2: Simulated poll cycles should not change the quote for the same agent."""

    def test_simulated_poll_cycles_stable_quote(self, tmp_path: Path):
        """Simulating POLL_CHANNELS persona fetches should return stable quote."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.get_project_root", return_value=project_dir),
            patch("pf.prime.persona.get_current_theme", return_value="test-theme"),
            patch("pf.prime.persona.load_theme", return_value=FAKE_THEME_YAML),
        ):
            from pf.frame.ws_push import fetch_persona

            # Simulate 10 poll cycles (what happens every ~2s in production)
            results = [fetch_persona() for _ in range(10)]

        quotes = {r.get("quote") for r in results if r}
        assert len(quotes) == 1, (
            f"Quote should not change across poll cycles. "
            f"Got {len(quotes)} different quotes: {quotes}"
        )


# ---------------------------------------------------------------------------
# AC-3: No errors when portrait resolution encounters edge cases
# ---------------------------------------------------------------------------


class TestPortraitResolutionEdgeCases:
    """AC-3: Portrait resolution should not raise errors or warnings."""

    def test_fetch_persona_no_error_when_portrait_resolver_unavailable(self, tmp_path: Path):
        """fetch_persona should not error if portrait_resolver fails."""
        project_dir = _setup_fake_agent(tmp_path, "sm")

        with (
            patch("pf.frame.ws_push._get_project_dir", return_value=str(project_dir)),
            patch("pf.prime.persona.load_persona") as mock_load,
        ):
            from pf.prime.models import Persona

            mock_persona = Persona(
                character="Test Leader",
                style="Coordinates with precision",
                role="The test leader",
                quote="Catchphrase!",
            )
            mock_load.return_value = (mock_persona, "test-theme")

            # Patch portrait resolver to raise ImportError (e.g., missing dependency)
            with patch(
                "pf.tui.portrait_resolver.resolve_portrait_path",
                side_effect=ImportError("textual-image not installed"),
            ):
                from pf.frame.ws_push import fetch_persona

                # Should not raise — portraitPath should gracefully be None
                result = fetch_persona()

        assert result is not None, "fetch_persona should return data even if portrait fails"
        assert result.get("character") == "Test Leader"
        # portraitPath should be None, not cause a crash
        assert "portraitPath" in result, (
            "portraitPath key must be present even when resolver fails"
        )
        assert result["portraitPath"] is None

    def test_render_header_no_error_with_invalid_portrait_path(self):
        """_render_header should not error if portraitPath points to nonexistent file."""
        from pf.tui.app import AgentHeader

        header = AgentHeader()
        header._persona_data = {
            "character": "Test Leader",
            "role": "sm",
            "roleDescription": "Coordinates with precision",
            "quote": "Catchphrase!",
            "theme": "test-theme",
            "portraitPath": "/nonexistent/path/portrait.png",
        }
        header._is_streaming = False

        # Should not raise
        posted_messages = []
        header.post_message = lambda msg: posted_messages.append(msg)
        header._render_header()

        # Should still render header text
        assert "Test Leader" in header._header_text
