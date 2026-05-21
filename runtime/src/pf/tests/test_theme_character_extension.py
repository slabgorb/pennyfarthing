"""Tests for theme character extension via config.local.yaml.

Story 150-3: Theme character extension — config.local.yaml overrides for custom roles

Acceptance Criteria:
1. Wire theme_characters map from config.local.yaml into load_persona()
2. Consumer sets theme_characters.my-agent: "Character Name" and persona loader picks it up
3. Custom roles not in theme YAML resolve via config.local.yaml theme_characters
"""

from pathlib import Path

import pytest
import yaml

from pf import paths
from pf.prime.persona import (
    get_crew_manifest,
    load_persona,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def theme_project(tmp_path: Path, monkeypatch) -> Path:
    """Create a project with a theme and config.local.yaml."""
    plugin_data = tmp_path / "plugin_data"
    plugin_data.mkdir()
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Create a minimal theme
    themes_dir = pf_dir / "personas" / "themes"
    themes_dir.mkdir(parents=True)
    theme_data = {
        "theme": {"name": "Test Theme", "user_title": "friend"},
        "agents": {
            "sm": {
                "character": "Theme SM",
                "style": "Coordinates things",
                "role": "The coordinator",
            },
            "dev": {
                "character": "Theme Dev",
                "style": "Writes code",
                "role": "The developer",
            },
            "tea": {
                "character": "Theme TEA",
                "style": "Tests things",
                "role": "The tester",
            },
        },
    }
    (themes_dir / "test-theme.yaml").write_text(yaml.dump(theme_data))

    # Config with theme set and theme_characters overrides
    config = {
        "theme": "test-theme",
        "theme_characters": {
            "sm": "Override SM Character",
            "gm": "The Game Master",
        },
    }
    cfg = paths.config_path(tmp_path)
    cfg.parent.mkdir(parents=True, exist_ok=True)
    cfg.write_text(yaml.dump(config))

    return tmp_path


@pytest.fixture()
def theme_project_no_overrides(tmp_path: Path, monkeypatch) -> Path:
    """Project with theme but NO theme_characters in config."""
    plugin_data = tmp_path / "plugin_data"
    plugin_data.mkdir()
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    themes_dir = pf_dir / "personas" / "themes"
    themes_dir.mkdir(parents=True)
    theme_data = {
        "theme": {"name": "Plain Theme"},
        "agents": {
            "dev": {
                "character": "Plain Dev",
                "style": "Just codes",
                "role": "Developer",
            },
        },
    }
    (themes_dir / "plain-theme.yaml").write_text(yaml.dump(theme_data))

    config = {"theme": "plain-theme"}
    cfg = paths.config_path(tmp_path)
    cfg.parent.mkdir(parents=True, exist_ok=True)
    cfg.write_text(yaml.dump(config))

    return tmp_path


# ---------------------------------------------------------------------------
# AC 1: config.local.yaml theme_characters wired into load_persona()
# ---------------------------------------------------------------------------


class TestThemeCharacterOverride:
    """AC 1: theme_characters from config.local.yaml overrides theme YAML."""

    def test_config_override_takes_priority(self, theme_project: Path) -> None:
        """When theme_characters has an entry for a built-in role,
        load_persona() must use the override character name."""
        persona, theme = load_persona("sm", theme_project)
        assert persona is not None
        assert persona.character == "Override SM Character"

    def test_theme_yaml_used_when_no_override(self, theme_project: Path) -> None:
        """Roles NOT in theme_characters should still resolve from theme YAML."""
        persona, theme = load_persona("dev", theme_project)
        assert persona is not None
        assert persona.character == "Theme Dev"

    def test_no_theme_characters_uses_theme_yaml(
        self, theme_project_no_overrides: Path
    ) -> None:
        """Without theme_characters in config, theme YAML is the only source."""
        persona, theme = load_persona("dev", theme_project_no_overrides)
        assert persona is not None
        assert persona.character == "Plain Dev"


# ---------------------------------------------------------------------------
# AC 2/3: Custom roles resolve via config.local.yaml
# ---------------------------------------------------------------------------


class TestCustomRoleResolution:
    """AC 2/3: Custom roles not in theme YAML resolve via theme_characters."""

    def test_custom_role_resolves_from_config(self, theme_project: Path) -> None:
        """A custom role (gm) not in the theme YAML but in theme_characters
        should return a valid Persona."""
        persona, theme = load_persona("gm", theme_project)
        assert persona is not None
        assert persona.character == "The Game Master"

    def test_custom_role_has_theme_name(self, theme_project: Path) -> None:
        """Custom role persona should report the correct theme name."""
        persona, theme = load_persona("gm", theme_project)
        assert theme == "test-theme"

    def test_custom_role_not_in_either_returns_none(
        self, theme_project: Path
    ) -> None:
        """A role not in theme_characters OR theme YAML returns (None, None)."""
        persona, theme = load_persona("nonexistent", theme_project)
        assert persona is None
        assert theme is None

    def test_custom_role_persona_has_character_field(
        self, theme_project: Path
    ) -> None:
        """Custom role persona must have the character name populated."""
        persona, theme = load_persona("gm", theme_project)
        assert persona is not None
        assert persona.character == "The Game Master"
        # Style/role may be empty for config-only personas — that's OK
        # The character name is the minimum viable persona


# ---------------------------------------------------------------------------
# Crew manifest includes custom roles
# ---------------------------------------------------------------------------


class TestCrewManifestWithCustomRoles:
    """Crew manifest should include custom roles from theme_characters."""

    def test_crew_includes_override_character(self, theme_project: Path) -> None:
        """Crew manifest should show the override character for built-in roles."""
        crew = get_crew_manifest(theme_project)
        sm_members = [m for m in crew if m.role == "sm"]
        assert len(sm_members) == 1
        assert sm_members[0].character == "Override SM Character"

    def test_crew_includes_custom_role(self, theme_project: Path) -> None:
        """Crew manifest should include custom roles from theme_characters."""
        crew = get_crew_manifest(theme_project)
        gm_members = [m for m in crew if m.role == "gm"]
        assert len(gm_members) == 1
        assert gm_members[0].character == "The Game Master"


# ---------------------------------------------------------------------------
# Backward compatibility
# ---------------------------------------------------------------------------


class TestBackwardCompatibility:
    """Existing behavior must not break."""

    def test_no_config_file_still_works(self, tmp_path: Path, monkeypatch) -> None:
        """Project with no config.local.yaml at all should still load personas
        from theme YAML."""
        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        theme_data = {
            "theme": {"name": "Bare Theme"},
            "agents": {
                "dev": {
                    "character": "Bare Dev",
                    "style": "Minimal",
                    "role": "Dev role",
                },
            },
        }
        (themes_dir / "bare-theme.yaml").write_text(yaml.dump(theme_data))
        # Set theme via config without theme_characters
        cfg = paths.config_path(tmp_path)
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text("theme: bare-theme\n")

        persona, theme = load_persona("dev", tmp_path)
        assert persona is not None
        assert persona.character == "Bare Dev"

    def test_empty_theme_characters_map(self, tmp_path: Path, monkeypatch) -> None:
        """Empty theme_characters: {} should not break anything."""
        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        theme_data = {
            "theme": {"name": "Empty Override Theme"},
            "agents": {
                "dev": {
                    "character": "Normal Dev",
                    "style": "Normal",
                    "role": "Dev",
                },
            },
        }
        (themes_dir / "empty-override.yaml").write_text(yaml.dump(theme_data))

        config = {"theme": "empty-override", "theme_characters": {}}
        cfg = paths.config_path(tmp_path)
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text(yaml.dump(config))

        persona, theme = load_persona("dev", tmp_path)
        assert persona is not None
        assert persona.character == "Normal Dev"

    def test_no_theme_set_returns_none(self, tmp_path: Path, monkeypatch) -> None:
        """No theme configured at all returns (None, None)."""
        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        cfg = paths.config_path(tmp_path)
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text("{}\n")

        persona, theme = load_persona("dev", tmp_path)
        assert persona is None
        assert theme is None
