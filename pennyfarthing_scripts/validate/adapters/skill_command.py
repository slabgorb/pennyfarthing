"""Skill registry and command file structural validator adapter.

Validates skill-registry.yaml against skill-registry.schema.json and
command file structure in pennyfarthing-dist/commands/.

Story: MSSCI-14711 (91-13)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from pennyfarthing_scripts.validate import ValidateReport

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def discover_skill_registry(root: Path) -> Path | None:
    """Locate skill-registry.yaml in the project.

    Returns:
        Path to skill-registry.yaml, or None if not found.
    """
    path = root / "pennyfarthing-dist" / "skills" / "skill-registry.yaml"
    return path if path.is_file() else None


def discover_command_files(commands_dir: Path) -> list[Path]:
    """Discover all command markdown files.

    Returns:
        Sorted list of Path objects for command .md files.
    """
    if not commands_dir.is_dir():
        return []
    return sorted(f for f in commands_dir.glob("*.md"))


def _load_schema(root: Path) -> dict | None:
    """Load the skill-registry.schema.json file."""
    schema_path = root / "pennyfarthing-dist" / "skills" / "skill-registry.schema.json"
    if not schema_path.is_file():
        return None
    try:
        return json.loads(schema_path.read_text())
    except json.JSONDecodeError:
        return None


def _validate_against_schema(
    data: dict, schema: dict
) -> list[str]:
    """Validate data against a JSON Schema (manual implementation).

    Handles the subset of JSON Schema used by skill-registry.schema.json:
    - type checking (object, string, array, boolean)
    - required fields
    - additionalProperties: false
    - pattern (regex)
    - enum
    - $ref to #/definitions/*
    - items (for arrays)

    Returns:
        List of error message strings.
    """
    errors: list[str] = []

    def _resolve_ref(ref: str) -> dict:
        """Resolve a $ref pointer like #/definitions/skill."""
        parts = ref.lstrip("#/").split("/")
        result = schema
        for part in parts:
            result = result.get(part, {})
        return result

    def _validate_value(value, prop_schema: dict, path: str) -> None:
        """Validate a single value against its schema."""
        # Handle $ref
        if "$ref" in prop_schema:
            prop_schema = _resolve_ref(prop_schema["$ref"])

        expected_type = prop_schema.get("type")

        # Type checking
        if expected_type == "object":
            if not isinstance(value, dict):
                errors.append(f"{path}: expected object, got {type(value).__name__}")
                return

            props = prop_schema.get("properties", {})
            additional = prop_schema.get("additionalProperties")

            # Required fields
            for req in prop_schema.get("required", []):
                if req not in value:
                    errors.append(f"{path}: missing required field '{req}'")

            # Validate known properties
            for key, val in value.items():
                if key in props:
                    _validate_value(val, props[key], f"{path}.{key}")
                elif additional is False:
                    errors.append(
                        f"{path}: additional property '{key}' not allowed"
                    )
                elif isinstance(additional, dict):
                    _validate_value(val, additional, f"{path}.{key}")

        elif expected_type == "string":
            if not isinstance(value, str):
                errors.append(f"{path}: expected string, got {type(value).__name__}")
                return
            pattern = prop_schema.get("pattern")
            if pattern and not re.match(pattern, value):
                errors.append(f"{path}: value '{value}' does not match pattern '{pattern}'")
            enum_vals = prop_schema.get("enum")
            if enum_vals and value not in enum_vals:
                errors.append(
                    f"{path}: value '{value}' not in allowed values: "
                    f"{', '.join(enum_vals)}"
                )

        elif expected_type == "array":
            if not isinstance(value, list):
                errors.append(f"{path}: expected array, got {type(value).__name__}")
                return
            items_schema = prop_schema.get("items")
            if items_schema:
                for i, item in enumerate(value):
                    _validate_value(item, items_schema, f"{path}[{i}]")

        elif expected_type == "boolean":
            if not isinstance(value, bool):
                errors.append(f"{path}: expected boolean, got {type(value).__name__}")

    _validate_value(data, schema, "")
    return errors


def validate_skill_registry(root: Path) -> tuple[list[str], list[str]]:
    """Validate skill-registry.yaml against its JSON schema.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    registry_path = discover_skill_registry(root)
    if registry_path is None:
        errors.append("skill-registry.yaml not found")
        return errors, warnings

    schema = _load_schema(root)
    if schema is None:
        errors.append("skill-registry.schema.json not found or invalid")
        return errors, warnings

    try:
        content = registry_path.read_text()
        data = yaml.safe_load(content)
    except yaml.YAMLError:
        errors.append("skill-registry.yaml: YAML parse error")
        return errors, warnings

    if not isinstance(data, dict):
        errors.append("skill-registry.yaml: expected a YAML mapping")
        return errors, warnings

    schema_errors = _validate_against_schema(data, schema)
    errors.extend(schema_errors)

    return errors, warnings


def _has_frontmatter(content: str) -> bool:
    """Check if content starts with YAML frontmatter (--- delimited)."""
    return content.startswith("---\n")


def _parse_frontmatter(content: str) -> dict | None:
    """Extract YAML frontmatter from content.

    Returns:
        Parsed dict, or None if no valid frontmatter.
    """
    if not _has_frontmatter(content):
        return None
    end = content.find("\n---", 3)
    if end == -1:
        return None
    fm_text = content[4:end]
    try:
        return yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return None


def _get_body(content: str) -> str:
    """Extract body content after frontmatter."""
    if not _has_frontmatter(content):
        return content
    end = content.find("\n---", 3)
    if end == -1:
        return ""
    return content[end + 4:].strip()


def validate_command_file(path: Path) -> tuple[list[str], list[str]]:
    """Validate a command markdown file.

    Checks:
    - YAML frontmatter present
    - description field in frontmatter (non-empty)
    - Body content not empty (warning)

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    fm = _parse_frontmatter(content)
    if fm is None:
        errors.append("Missing YAML frontmatter")
        return errors, warnings

    desc = fm.get("description")
    if desc is None:
        errors.append("Missing required frontmatter field: description")
    elif not isinstance(desc, str) or not desc.strip():
        errors.append("Frontmatter description must be a non-empty string")

    body = _get_body(content)
    if not body:
        warnings.append("Command body is empty — consider adding content")

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate skill registry and command files."""
    report = ValidateReport(validator="skill-command")

    # --- Skill registry validation ---
    registry_errors, registry_warnings = validate_skill_registry(root)

    for e in registry_errors:
        report.errors += 1
        report.details.append(f"[ERROR] skill-registry.yaml: {e}")

    for w in registry_warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] skill-registry.yaml: {w}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] skill-registry.yaml: {w}")

    if not registry_errors:
        report.passed += 1

    # --- Command file validation ---
    commands_dir = root / "pennyfarthing-dist" / "commands"
    command_files = discover_command_files(commands_dir)

    for path in command_files:
        file_errors, file_warnings = validate_command_file(path)

        for e in file_errors:
            report.errors += 1
            report.details.append(f"[ERROR] {path.name}: {e}")

        for w in file_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] {path.name}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {path.name}: {w}")

        if not file_errors:
            report.passed += 1

    return report
