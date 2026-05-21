"""Config migration — consolidate preferences.yaml and persona-config.yaml into config.local.yaml.

Story 126-5: config.local.yaml is the single source of truth for all user configuration.
"""

from __future__ import annotations

from pathlib import Path

import yaml


def migrate_config(project_root: Path) -> dict:
    """Migrate legacy config files into config.local.yaml.

    Consolidates:
      - .claude/pennyfarthing/preferences.yaml → config.local.yaml preferences section
      - .claude/pennyfarthing/preferences.local.yaml → overrides on top
      - .pennyfarthing/persona-config.yaml → config.local.yaml (theme, attributes)

    Preserves existing config.local.yaml settings. Removes legacy files after migration.

    Args:
        project_root: Project root path

    Returns:
        Result dict with {success: bool, migrated: list[str], error: str|None}
    """
    try:
        migrated: list[str] = []
        config_path = project_root / ".pennyfarthing" / "config.local.yaml"

        # Locate legacy files
        prefs_base = project_root / ".claude" / "pennyfarthing" / "preferences.yaml"
        prefs_local = project_root / ".claude" / "pennyfarthing" / "preferences.local.yaml"
        persona_config = project_root / ".pennyfarthing" / "persona-config.yaml"

        has_legacy = prefs_base.exists() or prefs_local.exists() or persona_config.exists()
        if not has_legacy:
            return {"success": True, "migrated": [], "error": None}

        # Load existing config.local.yaml (preserve all existing keys)
        config: dict = {}
        if config_path.exists():
            config = yaml.safe_load(config_path.read_text()) or {}

        # Track which legacy files to clean up after successful write
        files_to_remove: list[Path] = []

        # --- Migrate preferences.yaml → config.local.yaml preferences section ---
        if prefs_base.exists() or prefs_local.exists():
            prefs: dict = {}
            if prefs_base.exists():
                prefs = yaml.safe_load(prefs_base.read_text()) or {}
            if prefs_local.exists():
                local_prefs = yaml.safe_load(prefs_local.read_text()) or {}
                prefs.update(local_prefs)

            if prefs:
                existing_prefs = config.get("preferences", {}) or {}
                # Only set keys not already present in existing preferences
                for key, value in prefs.items():
                    if key not in existing_prefs:
                        existing_prefs[key] = value
                config["preferences"] = existing_prefs

            if prefs_base.exists():
                files_to_remove.append(prefs_base)
            if prefs_local.exists():
                files_to_remove.append(prefs_local)

        # --- Migrate persona-config.yaml → config.local.yaml ---
        if persona_config.exists():
            persona_data = yaml.safe_load(persona_config.read_text()) or {}

            # Theme: only set if config.local.yaml doesn't already have one
            if "theme" in persona_data and "theme" not in config:
                config["theme"] = persona_data["theme"]

            # Attributes: store under persona.attributes
            if "attributes" in persona_data:
                persona_section = config.get("persona", {}) or {}
                if "attributes" not in persona_section:
                    persona_section["attributes"] = persona_data["attributes"]
                config["persona"] = persona_section

            files_to_remove.append(persona_config)

        # Write updated config FIRST — before removing any legacy files
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

        # Only remove legacy files AFTER successful write
        for legacy_file in files_to_remove:
            legacy_file.unlink()
            migrated.append(str(legacy_file))

        return {"success": True, "migrated": migrated, "error": None}

    except Exception as e:
        return {"success": False, "migrated": [], "error": str(e)}
