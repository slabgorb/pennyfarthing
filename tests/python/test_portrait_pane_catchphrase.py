"""Tests for Story 148-3: Portrait pane shows catchphrase instead of description.

Bug: The TUI portrait header shows roleDescription (agent style) instead of a
catchphrase because persona.py reads the nonexistent 'quote' field from YAML
instead of the 'catchphrases' list. The fix must read 'catchphrases', randomly
select one, and populate the 'quote' field on the Persona model.

Verifies:
  AC-1: Portrait pane displays a catchphrase from persona YAML, not role description
  AC-2: Falls back to role description when no catchphrases are defined
  AC-3: Catchphrase is randomly selected if multiple are defined

Run with: python -m pytest tests/python/test_portrait_pane_catchphrase.py -v
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

# Project root for path resolution in tests
PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# AC-1: Catchphrase from persona YAML reaches Persona.quote
# ---------------------------------------------------------------------------


class TestCatchphraseLoadedFromYAML:
    """AC-1: load_persona should populate quote from catchphrases list."""

    def test_load_persona_populates_quote_from_catchphrases(self, tmp_path: Path):
        """load_persona should set quote from the catchphrases list in YAML."""
        from pf.prime.persona import load_persona

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "sm": {
                    "character": "Test Leader",
                    "style": "Test coordination style",
                    "role": "The test leader",
                    "catchphrases": [
                        "First catchphrase!",
                        "Second catchphrase!",
                        "Third catchphrase!",
                    ],
                }
            },
        }

        # Set up theme file
        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        theme_file = theme_dir / "test-theme.yaml"
        theme_file.write_text(yaml.dump(theme_yaml))

        # Set up config
        config_dir = tmp_path / ".pennyfarthing"
        config_file = config_dir / "config.local.yaml"
        config_file.write_text(yaml.dump({"theme": "test-theme"}))

        persona, theme = load_persona("sm", project_root=tmp_path)

        assert persona is not None, "Should load persona successfully"
        assert persona.quote is not None, (
            "Persona.quote should be populated from catchphrases"
        )
        assert persona.quote in theme_yaml["agents"]["sm"]["catchphrases"], (
            f"quote '{persona.quote}' should be one of the defined catchphrases"
        )

    def test_catchphrase_not_role_description(self, tmp_path: Path):
        """quote should be a catchphrase, NOT the style/roleDescription."""
        from pf.prime.persona import load_persona

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "dev": {
                    "character": "Test Dev",
                    "style": "This is the style description",
                    "role": "The developer role",
                    "catchphrases": ["I code, therefore I am."],
                }
            },
        }

        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        (theme_dir / "test-theme.yaml").write_text(yaml.dump(theme_yaml))
        config_dir = tmp_path / ".pennyfarthing"
        (config_dir / "config.local.yaml").write_text(
            yaml.dump({"theme": "test-theme"})
        )

        persona, _ = load_persona("dev", project_root=tmp_path)

        assert persona is not None
        assert persona.quote == "I code, therefore I am.", (
            f"quote should be the catchphrase, not the style. Got: '{persona.quote}'"
        )
        assert persona.quote != persona.style, (
            "quote must differ from style (roleDescription)"
        )

    def test_real_theme_has_catchphrase_in_persona(self):
        """A real theme (dune) should have quote populated from catchphrases."""
        from pf.prime.persona import load_persona

        persona, theme = load_persona("sm", project_root=PROJECT_ROOT)

        # Skip if theme not configured
        if persona is None:
            pytest.skip("No theme configured in test environment")

        assert persona.quote is not None, (
            "Real theme persona should have quote populated from catchphrases"
        )
        assert persona.quote != "", (
            "Real theme persona quote should not be empty"
        )
        # The quote should NOT be the style (which is what shows as roleDescription)
        assert persona.quote != persona.style, (
            f"quote should be a catchphrase, not the style. "
            f"Got quote='{persona.quote}', style='{persona.style}'"
        )


# ---------------------------------------------------------------------------
# AC-2: Fallback to roleDescription when no catchphrases
# ---------------------------------------------------------------------------


class TestFallbackWhenNoCatchphrases:
    """AC-2: If no catchphrases defined, quote should be None (TUI falls back)."""

    def test_no_catchphrases_quote_is_none(self, tmp_path: Path):
        """When catchphrases list is absent, quote should be None."""
        from pf.prime.persona import load_persona

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "sm": {
                    "character": "Plain Leader",
                    "style": "Plain coordination style",
                    "role": "The plain leader",
                    # No catchphrases field at all
                }
            },
        }

        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        (theme_dir / "test-theme.yaml").write_text(yaml.dump(theme_yaml))
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text(
            yaml.dump({"theme": "test-theme"})
        )

        persona, _ = load_persona("sm", project_root=tmp_path)

        assert persona is not None
        assert persona.quote is None, (
            f"quote should be None when no catchphrases defined, got: '{persona.quote}'"
        )

    def test_empty_catchphrases_quote_is_none(self, tmp_path: Path):
        """When catchphrases is an empty list, quote should be None."""
        from pf.prime.persona import load_persona

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "sm": {
                    "character": "Empty Leader",
                    "style": "Empty catchphrase style",
                    "role": "The empty leader",
                    "catchphrases": [],
                }
            },
        }

        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        (theme_dir / "test-theme.yaml").write_text(yaml.dump(theme_yaml))
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text(
            yaml.dump({"theme": "test-theme"})
        )

        persona, _ = load_persona("sm", project_root=tmp_path)

        assert persona is not None
        assert persona.quote is None, (
            f"quote should be None when catchphrases is empty, got: '{persona.quote}'"
        )

    def test_tui_header_falls_back_to_role_desc_without_quote(self):
        """TUI header should show roleDescription when quote is empty."""
        from pf.tui.app import AgentHeader

        header = AgentHeader()
        header._persona_data = {
            "character": "Fallback Agent",
            "role": "sm",
            "roleDescription": "Story coordination",
            "quote": "",  # Empty quote
            "theme": "test",
        }
        header._is_streaming = False
        header._render_header()

        rendered = header._header_text
        assert "Story coordination" in rendered, (
            f"Header should fall back to roleDescription when no quote. Got: '{rendered}'"
        )


# ---------------------------------------------------------------------------
# AC-3: Random selection from multiple catchphrases
# ---------------------------------------------------------------------------


class TestRandomCatchphraseSelection:
    """AC-3: When multiple catchphrases defined, one is randomly selected."""

    def test_quote_varies_across_loads(self, tmp_path: Path):
        """Loading persona multiple times should eventually produce different quotes."""
        from pf.prime.persona import load_persona

        catchphrases = [
            "Catchphrase Alpha",
            "Catchphrase Beta",
            "Catchphrase Gamma",
            "Catchphrase Delta",
            "Catchphrase Epsilon",
        ]

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "sm": {
                    "character": "Random Leader",
                    "style": "Random style",
                    "role": "The random leader",
                    "catchphrases": catchphrases,
                }
            },
        }

        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        (theme_dir / "test-theme.yaml").write_text(yaml.dump(theme_yaml))
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text(
            yaml.dump({"theme": "test-theme"})
        )

        # Load multiple times and collect quotes
        quotes_seen: set[str] = set()
        for _ in range(20):
            persona, _ = load_persona("sm", project_root=tmp_path)
            assert persona is not None
            assert persona.quote is not None
            quotes_seen.add(persona.quote)

        # With 5 catchphrases and 20 loads, we should see at least 2 different ones
        assert len(quotes_seen) > 1, (
            f"With {len(catchphrases)} catchphrases, expected variation across "
            f"20 loads but always got: {quotes_seen}"
        )

    def test_single_catchphrase_always_selected(self, tmp_path: Path):
        """With only one catchphrase, it should always be selected."""
        from pf.prime.persona import load_persona

        theme_yaml = {
            "theme": {"name": "test-theme"},
            "agents": {
                "sm": {
                    "character": "Solo Leader",
                    "style": "Solo style",
                    "role": "The solo leader",
                    "catchphrases": ["The only catchphrase"],
                }
            },
        }

        theme_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        theme_dir.mkdir(parents=True)
        (theme_dir / "test-theme.yaml").write_text(yaml.dump(theme_yaml))
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text(
            yaml.dump({"theme": "test-theme"})
        )

        persona, _ = load_persona("sm", project_root=tmp_path)

        assert persona is not None
        assert persona.quote == "The only catchphrase", (
            f"Single catchphrase should always be selected. Got: '{persona.quote}'"
        )


# ---------------------------------------------------------------------------
# Integration: ws_push persona data includes catchphrase
# ---------------------------------------------------------------------------


class TestWsPushCatchphrase:
    """Verify the WebSocket push layer includes the catchphrase in persona data."""

    def test_ws_push_persona_includes_quote_from_catchphrases(self):
        """fetch_persona should populate quote from catchphrases, not empty."""
        from pf.frame.ws_push import fetch_persona

        # This test verifies the full pipeline: YAML → load_persona → ws_push
        # If load_persona is fixed, ws_push should get the catchphrase via persona.quote
        result = fetch_persona()

        # If no agent is active, result might be empty — skip
        if not result or not result.get("character"):
            pytest.skip("No active agent for integration test")

        quote = result.get("quote", "")
        role_desc = result.get("roleDescription", "")

        # The quote should not be empty (should have a catchphrase)
        assert quote, (
            f"quote should be populated from catchphrases. "
            f"Got quote='{quote}', roleDescription='{role_desc}'"
        )
        # The quote should not be the same as roleDescription
        assert quote != role_desc, (
            f"quote should be a catchphrase, not the roleDescription. "
            f"Both are: '{quote}'"
        )


# ---------------------------------------------------------------------------
# TUI header renders catchphrase (not roleDescription)
# ---------------------------------------------------------------------------


class TestTuiHeaderCatchphraseDisplay:
    """Verify the TUI header renders catchphrase when provided in persona data."""

    def test_header_shows_catchphrase_when_quote_present(self):
        """Header should display quote (catchphrase) in italic, not roleDescription."""
        from pf.tui.app import AgentHeader

        header = AgentHeader()
        header._persona_data = {
            "character": "Stilgar",
            "role": "sm",
            "roleDescription": "Fremen Naib who leads through tribal wisdom",
            "quote": "The sprint backlog is our water. We waste nothing.",
            "theme": "dune",
        }
        header._is_streaming = False
        header._render_header()

        rendered = header._header_text
        assert "The sprint backlog is our water" in rendered, (
            f"Header should display the catchphrase. Got: '{rendered}'"
        )
        # roleDescription should NOT appear when catchphrase is available
        assert "Fremen Naib" not in rendered, (
            f"Header should NOT show roleDescription when catchphrase is present. "
            f"Got: '{rendered}'"
        )

    def test_header_shows_role_desc_when_no_catchphrase(self):
        """Header should fall back to roleDescription when no catchphrase."""
        from pf.tui.app import AgentHeader

        header = AgentHeader()
        header._persona_data = {
            "character": "Plain Agent",
            "role": "dev",
            "roleDescription": "Developer who writes code",
            "quote": "",
            "theme": "test",
        }
        header._is_streaming = False
        header._render_header()

        rendered = header._header_text
        assert "Developer who writes code" in rendered, (
            f"Header should show roleDescription as fallback. Got: '{rendered}'"
        )
