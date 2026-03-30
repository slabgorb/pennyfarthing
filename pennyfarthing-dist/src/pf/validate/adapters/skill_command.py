"""Skill registry and command file structural validator adapter.

Validates skill-registry.yaml against skill-registry.schema.json and
command file structure in pennyfarthing-dist/commands/.

Story: PROJ-14711 (91-13)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from pf.common.config import get_dist_root
from pf.validate import ValidateReport

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def discover_skill_registry(root: Path) -> Path | None:
    """Locate skill-registry.yaml in the project.

    Returns:
        Path to skill-registry.yaml, or None if not found.
    """
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        return None
    path = dist_root / "skills" / "skill-registry.yaml"
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
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        return None
    schema_path = dist_root / "skills" / "skill-registry.schema.json"
    if not schema_path.is_file():
        return None
    try:
        return json.loads(schema_path.read_text())
    except json.JSONDecodeError:
        return None


def _validate_against_schema(data: dict, schema: dict) -> list[str]:
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
                    errors.append(f"{path}: additional property '{key}' not allowed")
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
                    f"{path}: value '{value}' not in allowed values: {', '.join(enum_vals)}"
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
    return content[end + 4 :].strip()


def _discover_registry(root: Path) -> dict | None:
    """Load command-registry.yaml if it exists."""
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        return None
    path = dist_root / "command-registry.yaml"
    if not path.is_file():
        return None
    try:
        return yaml.safe_load(path.read_text())
    except yaml.YAMLError:
        return None


def _collect_registry_command_names(registry: dict) -> set[str]:
    """Collect all command names expected from the registry."""
    names: set[str] = set()

    # Groups: each group has a slash field like "/pf-sprint"
    for _group_name, group in registry.get("groups", {}).items():
        slash = group.get("slash", "")
        if slash:
            # "/pf-sprint" -> "pf-sprint"
            names.add(slash.lstrip("/"))

    # Standalone
    for _cmd_name, cmd in registry.get("standalone", {}).items():
        slash = cmd.get("slash", "")
        if slash:
            names.add(slash.lstrip("/"))

    # Agents
    agents = registry.get("agents", {})
    for _agent_name, agent in agents.get("commands", {}).items():
        slash = agent.get("slash", "")
        if slash:
            names.add(slash.lstrip("/"))

    # Benchmarking
    benchmarking = registry.get("benchmarking", {})
    for _cmd_name, cmd in benchmarking.get("commands", {}).items():
        slash = cmd.get("slash", "")
        if slash:
            names.add(slash.lstrip("/"))

    # Also add the new grouped commands (pf-git, pf-session, pf-epic, pf-ci, pf-docs)
    for group_name in registry.get("groups", {}):
        names.add(f"pf-{group_name}")
    for cmd_name in registry.get("standalone", {}):
        if cmd_name not in (
            "help",
            "setup",
            "health-check",
            "prime",
            "check",
            "work",
            "chore",
            "patch",
            "standalone",
            "party-mode",
            "brainstorming",
            "retro",
            "permissions",
        ):
            names.add(f"pf-{cmd_name}")

    return names


def validate_prefix(commands_dir: Path) -> tuple[list[str], list[str]]:
    """Check all command files have pf- prefix."""
    errors: list[str] = []
    warnings: list[str] = []

    for path in discover_command_files(commands_dir):
        name = path.stem  # filename without .md
        if not name.startswith("pf-"):
            # Check if it's a deprecated redirect stub
            content = path.read_text()
            fm = _parse_frontmatter(content)
            if fm and fm.get("deprecated"):
                continue  # Redirect stubs are fine without prefix
            warnings.append(f"{path.name}: missing 'pf-' prefix")

    return errors, warnings


def validate_deprecated(commands_dir: Path) -> tuple[list[str], list[str]]:
    """Check deprecated files have redirect field."""
    errors: list[str] = []
    warnings: list[str] = []

    for path in discover_command_files(commands_dir):
        content = path.read_text()
        fm = _parse_frontmatter(content)
        if fm and fm.get("deprecated") and not fm.get("redirect"):
            errors.append(f"{path.name}: deprecated command missing 'redirect' field")

    return errors, warnings


def validate_registry_crossref(root: Path, commands_dir: Path) -> tuple[list[str], list[str]]:
    """Cross-reference command files with command-registry.yaml."""
    errors: list[str] = []
    warnings: list[str] = []

    registry = _discover_registry(root)
    if registry is None:
        warnings.append("command-registry.yaml not found — skipping cross-reference")
        return errors, warnings

    registry_names = _collect_registry_command_names(registry)

    # Check command files against registry
    for path in discover_command_files(commands_dir):
        name = path.stem
        content = path.read_text()
        fm = _parse_frontmatter(content)
        if fm and fm.get("deprecated"):
            continue  # Skip deprecated stubs
        if name not in registry_names:
            warnings.append(f"{path.name}: not found in command-registry.yaml")

    return errors, warnings


def validate_skill_alignment(root: Path) -> tuple[list[str], list[str]]:
    """Check skill command_group values match registry groups."""
    errors: list[str] = []
    warnings: list[str] = []

    registry = _discover_registry(root)
    if registry is None:
        return errors, warnings

    registry_path = discover_skill_registry(root)
    if registry_path is None:
        return errors, warnings

    try:
        skills_data = yaml.safe_load(registry_path.read_text())
    except yaml.YAMLError:
        return errors, warnings

    registry_groups = set(registry.get("groups", {}).keys())

    for skill_name, skill in skills_data.get("skills", {}).items():
        command_group = skill.get("command_group")
        if command_group and command_group not in registry_groups:
            warnings.append(
                f"skill '{skill_name}': command_group '{command_group}' "
                f"not found in command-registry.yaml groups"
            )

    return errors, warnings


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
    dist_root = get_dist_root(project_root=root)
    commands_dir = (
        (dist_root / "commands") if dist_root else root / "pennyfarthing-dist" / "commands"
    )
    command_files = discover_command_files(commands_dir)

    if not command_files:
        report.warnings += 1
        report.details.append("[WARN] No command files found in commands directory")

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

    # --- New validation checks ---

    # Prefix check
    prefix_errors, prefix_warnings = validate_prefix(commands_dir)
    for e in prefix_errors:
        report.errors += 1
        report.details.append(f"[ERROR] prefix: {e}")
    for w in prefix_warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] prefix: {w}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] prefix: {w}")

    # Deprecated check
    depr_errors, depr_warnings = validate_deprecated(commands_dir)
    for e in depr_errors:
        report.errors += 1
        report.details.append(f"[ERROR] deprecated: {e}")
    for w in depr_warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] deprecated: {w}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] deprecated: {w}")

    # Registry cross-reference
    xref_errors, xref_warnings = validate_registry_crossref(root, commands_dir)
    for e in xref_errors:
        report.errors += 1
        report.details.append(f"[ERROR] registry: {e}")
    for w in xref_warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] registry: {w}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] registry: {w}")

    # Skill alignment
    align_errors, align_warnings = validate_skill_alignment(root)
    for e in align_errors:
        report.errors += 1
        report.details.append(f"[ERROR] skill-align: {e}")
    for w in align_warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] skill-align: {w}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] skill-align: {w}")

    return report
