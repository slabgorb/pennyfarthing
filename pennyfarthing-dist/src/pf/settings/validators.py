"""Write-time validators for settings and repo fields — Story 147-8.

Validates values before they are persisted to config.local.yaml or repos.yaml.
Uses SettingSpec and RepoFieldSpec metadata to enforce type, option, and
read-only constraints.
"""

from __future__ import annotations

from typing import Any

from pf.sprint.validator import ValidationResult


def validate_setting(key: str, value: Any) -> ValidationResult:
    """Validate a setting value against its SettingSpec metadata.

    Checks:
    - Key is not empty/whitespace
    - Key exists in DEFAULTS (known setting)
    - Type matches (bool settings reject non-bool)
    - Value is in options list (for select widgets)

    Returns:
        ValidationResult with valid=True or errors describing failures.
    """
    result = ValidationResult(valid=True)

    # Empty key check
    if not key or not key.strip():
        result.add_error("Setting key must not be empty", key)
        return result

    # Known key check — must exist in DEFAULTS
    from pf.settings.settings import DEFAULTS

    if not _key_exists_in_defaults(key, DEFAULTS):
        result.add_error(
            f"'{key}' is not a known setting key",
            key,
        )
        return result

    # Get the default value to infer expected type
    default_value = _get_default_value(key, DEFAULTS)

    # Type check — if default is bool, value must be bool
    if isinstance(default_value, bool) and not isinstance(value, bool):
        result.add_error(
            f"'{key}' expects a bool value, got {type(value).__name__}",
            key,
        )
        return result

    # Constrained value check — if SettingSpec has options, value must be in them
    spec = _find_setting_spec(key)
    if spec is not None and spec.widget_type == "select":
        options = spec.get_options()
        valid_values = [v for _, v in options]
        if value not in valid_values:
            opts_str = ", ".join(str(v) for v in valid_values)
            result.add_error(
                f"'{key}' must be one of: {opts_str}. Got '{value}'",
                key,
            )
            return result

    return result


def validate_repo_field(field: str, value: Any) -> ValidationResult:
    """Validate a repo field value against its RepoFieldSpec metadata.

    Checks:
    - Read-only fields cannot be written
    - Type matches (bool fields reject non-bool)
    - Value is in options list (for select widgets)

    Returns:
        ValidationResult with valid=True or errors describing failures.
    """
    result = ValidationResult(valid=True)

    spec = _find_repo_field_spec(field)

    # Read-only check
    if spec is not None and (spec.read_only or spec.widget_type == "readonly"):
        result.add_error(
            f"'{field}' is a read-only field and cannot be modified",
            field,
        )
        return result

    # Type check — if spec widget is "switch", value must be bool
    if spec is not None and spec.widget_type == "switch":
        if not isinstance(value, bool):
            result.add_error(
                f"'{field}' expects a bool value, got {type(value).__name__}",
                field,
            )
            return result

    # Constrained value check — select widgets
    if spec is not None and spec.widget_type == "select" and spec.options:
        valid_values = [v for _, v in spec.options]
        if value not in valid_values:
            opts_str = ", ".join(str(v) for v in valid_values)
            result.add_error(
                f"'{field}' must be one of: {opts_str}. Got '{value}'",
                field,
            )
            return result

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _key_exists_in_defaults(key: str, defaults: dict) -> bool:
    """Check if a dot-separated key exists in the DEFAULTS dict."""
    parts = key.split(".")
    current = defaults
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def _get_default_value(key: str, defaults: dict) -> Any:
    """Get the default value for a dot-separated key."""
    parts = key.split(".")
    current = defaults
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _find_setting_spec(key: str):
    """Find the SettingSpec for a given key, or None."""
    try:
        from pf.tui.settings_meta import build_setting_specs

        for spec in build_setting_specs():
            if spec.key == key:
                return spec
    except Exception:
        pass
    return None


def _find_repo_field_spec(field: str):
    """Find the RepoFieldSpec for a given field, or None."""
    try:
        from pf.tui.repos_meta import REPO_FIELDS_META

        return REPO_FIELDS_META.get(field)
    except Exception:
        pass
    return None
