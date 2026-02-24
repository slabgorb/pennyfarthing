"""Tests for config consolidation — Story 126-5.

Migrate preferences.yaml and persona-config.yaml into config.local.yaml
as the single source of truth for all user configuration.

ACs:
  1. Migration moves preferences.yaml content to config.local.yaml
  2. All config readers use config.local.yaml
  3. preferences.yaml template removed
  4. persona-config.yaml references removed
  5. Existing user settings preserved during migration
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def project_tree(tmp_path: Path) -> Path:
    """Create a minimal project tree with .pennyfarthing/ directory."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture
def config_local(project_tree: Path) -> Path:
    """Return path to config.local.yaml (does not create it)."""
    return project_tree / ".pennyfarthing" / "config.local.yaml"


@pytest.fixture
def preferences_yaml(project_tree: Path) -> Path:
    """Create a legacy preferences.yaml with all three settings."""
    prefs_dir = project_tree / ".claude" / "pennyfarthing"
    prefs_dir.mkdir(parents=True)
    prefs_file = prefs_dir / "preferences.yaml"
    prefs_file.write_text(textwrap.dedent("""\
        character_voice: true
        explain_decisions: true
        auto_commit: false
    """))
    return prefs_file


@pytest.fixture
def preferences_local_yaml(project_tree: Path) -> Path:
    """Create a legacy preferences.local.yaml override."""
    prefs_dir = project_tree / ".claude" / "pennyfarthing"
    prefs_dir.mkdir(parents=True, exist_ok=True)
    prefs_file = prefs_dir / "preferences.local.yaml"
    prefs_file.write_text(textwrap.dedent("""\
        character_voice: false
    """))
    return prefs_file


@pytest.fixture
def persona_config_yaml(project_tree: Path) -> Path:
    """Create a legacy persona-config.yaml."""
    pf_dir = project_tree / ".pennyfarthing"
    persona_file = pf_dir / "persona-config.yaml"
    persona_file.write_text(textwrap.dedent("""\
        theme: discworld
        attributes:
          verbosity: medium
          formality: casual
          humor: enabled
          emoji_use: minimal
        overrides: {}
    """))
    return persona_file


# ===========================================================================
# AC 1: Migration moves preferences.yaml content to config.local.yaml
# ===========================================================================

class TestMigrationMovesPreferences:
    """Migration should copy preferences.yaml settings into config.local.yaml."""

    def test_migrate_preferences_creates_preferences_section(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path
    ) -> None:
        """After migration, config.local.yaml should have a 'preferences' section."""
        from pf.config_migration import migrate_config  # noqa: F811

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        assert "preferences" in config
        assert config["preferences"]["character_voice"] is True
        assert config["preferences"]["explain_decisions"] is True
        assert config["preferences"]["auto_commit"] is False

    def test_migrate_preferences_handles_local_override(
        self, project_tree: Path, preferences_yaml: Path,
        preferences_local_yaml: Path, config_local: Path
    ) -> None:
        """Migration should merge .local override on top of base preferences."""
        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        # .local says character_voice: false, overrides base true
        assert config["preferences"]["character_voice"] is False

    def test_migrate_persona_config_into_config_local(
        self, project_tree: Path, persona_config_yaml: Path, config_local: Path
    ) -> None:
        """Migration should move persona-config.yaml attributes into config.local.yaml."""
        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        assert config.get("theme") == "discworld"
        assert "attributes" in config.get("persona", config)

    def test_migrate_removes_legacy_preferences_files(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path
    ) -> None:
        """After migration, legacy preferences.yaml should be removed."""
        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        assert not preferences_yaml.exists(), "preferences.yaml should be removed after migration"

    def test_migrate_removes_persona_config(
        self, project_tree: Path, persona_config_yaml: Path, config_local: Path
    ) -> None:
        """After migration, persona-config.yaml should be removed."""
        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        assert not persona_config_yaml.exists(), "persona-config.yaml should be removed after migration"


# ===========================================================================
# AC 2: All config readers use config.local.yaml
# ===========================================================================

class TestConfigReadersUseConfigLocal:
    """All config readers should read from config.local.yaml only."""

    def test_character_voice_reads_from_config_local(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """is_character_voice_enabled() should read from config.local.yaml preferences section."""
        config_local.write_text(textwrap.dedent("""\
            theme: discworld
            preferences:
              character_voice: false
        """))

        from pf.prime.persona import is_character_voice_enabled

        result = is_character_voice_enabled(project_root=project_tree)
        assert result is False

    def test_character_voice_defaults_true_when_missing(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """is_character_voice_enabled() should default True when no preference set."""
        config_local.write_text("theme: discworld\n")

        from pf.prime.persona import is_character_voice_enabled

        result = is_character_voice_enabled(project_root=project_tree)
        assert result is True

    def test_theme_reads_only_from_config_local(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """get_current_theme() should only check config.local.yaml, not persona-config.yaml."""
        config_local.write_text("theme: star-trek-tos\n")

        # Also create a persona-config.yaml with a DIFFERENT theme
        persona = project_tree / ".pennyfarthing" / "persona-config.yaml"
        persona.write_text("theme: discworld\n")

        from pf.common.themes import get_current_theme

        result = get_current_theme(project_root=project_tree)
        # Should ONLY read config.local.yaml — not fall back to persona-config.yaml
        assert result == "star-trek-tos"

    def test_theme_returns_none_without_persona_config_fallback(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """get_current_theme() should return None if config.local.yaml has no theme,
        NOT fall back to persona-config.yaml."""
        config_local.write_text("workflow:\n  bell_mode: true\n")

        # persona-config.yaml exists with a theme, but should be ignored
        persona = project_tree / ".pennyfarthing" / "persona-config.yaml"
        persona.write_text("theme: discworld\n")

        from pf.common.themes import get_current_theme

        result = get_current_theme(project_root=project_tree)
        assert result is None, "Should not fall back to persona-config.yaml"


# ===========================================================================
# AC 3: preferences.yaml template removed
# ===========================================================================

class TestPreferencesTemplateRemoved:
    """The preferences.yaml.template file should no longer exist."""

    def test_preferences_template_does_not_exist(self) -> None:
        """pennyfarthing-dist/templates/preferences.yaml.template should be removed."""
        from pf.common.config import get_dist_root

        dist = get_dist_root()
        assert dist is not None, "Could not find dist root"

        template = dist / "templates" / "preferences.yaml.template"
        assert not template.exists(), (
            f"preferences.yaml.template should be removed, still found at {template}"
        )


# ===========================================================================
# AC 4: persona-config.yaml references removed
# ===========================================================================

class TestPersonaConfigReferencesRemoved:
    """No code should reference persona-config.yaml as a config source."""

    def test_themes_get_current_theme_has_no_persona_config_path(self) -> None:
        """get_current_theme() should not reference persona-config.yaml."""
        import inspect
        from pf.common.themes import get_current_theme

        source = inspect.getsource(get_current_theme)
        assert "persona-config" not in source, (
            "get_current_theme() still references persona-config.yaml"
        )

    def test_statusline_has_no_persona_config_fallback(self) -> None:
        """Statusline hook should not fall back to persona-config.yaml."""
        import inspect
        from pf.hooks import statusline

        source = inspect.getsource(statusline)
        assert "persona-config" not in source, (
            "statusline.py still references persona-config.yaml"
        )

    def test_persona_config_template_does_not_exist(self) -> None:
        """pennyfarthing-dist/templates/persona-config.yaml.template should be removed."""
        from pf.common.config import get_dist_root

        dist = get_dist_root()
        assert dist is not None

        template = dist / "templates" / "persona-config.yaml.template"
        assert not template.exists(), (
            f"persona-config.yaml.template should be removed, still found at {template}"
        )


# ===========================================================================
# AC 5: Existing user settings preserved during migration
# ===========================================================================

class TestExistingSettingsPreserved:
    """Migration must not clobber existing config.local.yaml settings."""

    def test_migration_preserves_existing_theme(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path
    ) -> None:
        """Migration should not overwrite existing theme in config.local.yaml."""
        config_local.write_text(textwrap.dedent("""\
            theme: the-expanse
            workflow:
              bell_mode: true
        """))

        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        assert config["theme"] == "the-expanse", "Existing theme should be preserved"
        assert config["workflow"]["bell_mode"] is True, "Existing workflow settings preserved"

    def test_migration_preserves_existing_layout(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path
    ) -> None:
        """Migration should not touch existing layout configuration."""
        config_local.write_text(textwrap.dedent("""\
            theme: discworld
            layout:
              grid:
                width: 100
        """))

        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        assert config["layout"]["grid"]["width"] == 100

    def test_migration_merges_persona_theme_only_if_absent(
        self, project_tree: Path, persona_config_yaml: Path, config_local: Path
    ) -> None:
        """persona-config.yaml theme should only be set if config.local.yaml has no theme."""
        # config.local.yaml already has a theme
        config_local.write_text("theme: star-trek-tos\n")

        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        config = yaml.safe_load(config_local.read_text())
        assert config["theme"] == "star-trek-tos", "Existing theme should win over persona-config"

    def test_migration_is_idempotent(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path
    ) -> None:
        """Running migration twice should produce the same result."""
        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)
        first_run = config_local.read_text()

        # Run again — legacy files are gone, should be a no-op
        migrate_config(project_root=project_tree)
        second_run = config_local.read_text()

        assert first_run == second_run, "Migration should be idempotent"

    def test_migration_no_op_when_no_legacy_files(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """Migration should be a no-op when no legacy files exist."""
        config_local.write_text("theme: discworld\n")
        original = config_local.read_text()

        from pf.config_migration import migrate_config

        migrate_config(project_root=project_tree)

        assert config_local.read_text() == original, "Should not modify config when no legacy files"


# ===========================================================================
# Reviewer Finding: Crash safety — write before delete
# ===========================================================================

class TestMigrationCrashSafety:
    """Legacy files must survive if config.local.yaml write fails.

    Reviewer finding [HIGH]: unlink() runs BEFORE yaml.dump(). If the write
    fails (disk full, permissions, crash), legacy files are already deleted
    and user preferences are permanently lost.
    """

    def test_legacy_prefs_survive_write_failure(
        self, project_tree: Path, preferences_yaml: Path, config_local: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """If config.local.yaml write fails, preferences.yaml must still exist."""
        import yaml as _yaml
        from pf import config_migration

        original_dump = _yaml.dump

        def failing_dump(*args, **kwargs):
            raise OSError("Simulated disk full")

        monkeypatch.setattr(_yaml, "dump", failing_dump)

        result = config_migration.migrate_config(project_root=project_tree)

        # Function should return error dict, not raise
        assert not result["success"], "Expected migration to fail"
        assert result["error"] is not None, "Expected error message"

        assert preferences_yaml.exists(), (
            "preferences.yaml was deleted before config.local.yaml was written — data loss risk"
        )

    def test_legacy_persona_config_survives_write_failure(
        self, project_tree: Path, persona_config_yaml: Path, config_local: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """If config.local.yaml write fails, persona-config.yaml must still exist."""
        import yaml as _yaml
        from pf import config_migration

        def failing_dump(*args, **kwargs):
            raise OSError("Simulated disk full")

        monkeypatch.setattr(_yaml, "dump", failing_dump)

        result = config_migration.migrate_config(project_root=project_tree)

        # Function should return error dict, not raise
        assert not result["success"], "Expected migration to fail"
        assert result["error"] is not None, "Expected error message"

        assert persona_config_yaml.exists(), (
            "persona-config.yaml was deleted before config.local.yaml was written — data loss risk"
        )


# ===========================================================================
# Reviewer Finding: Error handling — return result dict, don't throw
# ===========================================================================

class TestMigrationErrorHandling:
    """migrate_config() must return {success: False, error: ...} on bad input.

    Reviewer finding [MEDIUM]: Function docstring promises result dict with
    error field but never catches exceptions. Malformed YAML throws instead
    of returning error. Violates project convention "Return result objects —
    don't throw."
    """

    def test_malformed_preferences_returns_error_dict(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """Malformed preferences.yaml should return error result, not raise."""
        prefs_dir = project_tree / ".claude" / "pennyfarthing"
        prefs_dir.mkdir(parents=True)
        (prefs_dir / "preferences.yaml").write_text("{invalid yaml: [unterminated")

        from pf.config_migration import migrate_config

        result = migrate_config(project_root=project_tree)

        assert isinstance(result, dict), "Should return a dict, not raise"
        assert result["success"] is False, "Should report failure"
        assert result["error"] is not None, "Should include error message"

    def test_malformed_persona_config_returns_error_dict(
        self, project_tree: Path, config_local: Path
    ) -> None:
        """Malformed persona-config.yaml should return error result, not raise."""
        persona_file = project_tree / ".pennyfarthing" / "persona-config.yaml"
        persona_file.write_text("theme: [unclosed\nattributes: {bad:")

        from pf.config_migration import migrate_config

        result = migrate_config(project_root=project_tree)

        assert isinstance(result, dict), "Should return a dict, not raise"
        assert result["success"] is False, "Should report failure"
        assert result["error"] is not None, "Should include error message"


# ===========================================================================
# Reviewer Finding: Migration wired into upgrade path
# ===========================================================================

class TestMigrationWiredIntoPrime:
    """migrate_config() must be called during agent activation (prime flow).

    Reviewer finding [HIGH]: Config readers now ONLY read config.local.yaml,
    but migrate_config() is never called in production. Users with legacy
    files silently lose preferences on upgrade.
    """

    def test_prime_function_calls_migrate_config(self) -> None:
        """prime() should invoke migrate_config during agent activation."""
        import inspect

        from pf.prime.cli import prime

        source = inspect.getsource(prime)
        assert "migrate_config" in source, (
            "prime() does not call migrate_config — legacy configs are never migrated"
        )


# ===========================================================================
# Reviewer Finding: pf prime as first-class CLI command
# ===========================================================================

class TestPrimeCLIRegistration:
    """pf prime should be a registered top-level CLI command.

    Reviewer finding [HIGH]: Prime is only accessible as `pf agent start`
    which delegates to prime(). There is no standalone `pf prime` command.
    prime/cli.py uses raw argparse — not registered in _LAZY_COMMANDS.
    """

    def test_prime_registered_in_lazy_commands(self) -> None:
        """'prime' should be a registered lazy command in the pf CLI."""
        from pf.cli import _LAZY_COMMANDS

        assert "prime" in _LAZY_COMMANDS, (
            "'prime' is not registered as a CLI command — "
            "should be in _LAZY_COMMANDS for `pf prime` access"
        )
