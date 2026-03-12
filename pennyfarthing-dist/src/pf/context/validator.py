"""Context validator — validates context documents against the context schema.

Story: MSSCI-15683 (129-3) — Build Context Validator Python Module and CLI
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from pf.context import ContextValidationResult, ValidationError


def _default_schema_path() -> Path:
    """Resolve the default context schema path from package location."""
    # validator.py is at pennyfarthing-dist/src/pf/context/validator.py
    # schema is at pennyfarthing-dist/schemas/context-schema.yaml
    return Path(__file__).resolve().parents[3] / "schemas" / "context-schema.yaml"


def load_schema(schema_path: Path) -> dict:
    """Load and parse the context schema YAML file."""
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    content = schema_path.read_text()
    data = yaml.safe_load(content)
    if not isinstance(data, dict):
        raise ValueError(f"Invalid schema: expected mapping, got {type(data).__name__}")
    return data


# ---------------------------------------------------------------------------
# Component validation by type
# ---------------------------------------------------------------------------


def _validate_structured(name: str, content: dict, schema: dict) -> list[ValidationError]:
    """Validate a structured (dict) component — enum values, required fields."""
    errors: list[ValidationError] = []
    fields = schema.get("fields", {})

    for field_name, field_def in fields.items():
        field_required = field_def.get("required", False)
        field_type = field_def.get("type", "string")

        if field_required and field_name not in content:
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Required field '{field_name}' is missing",
                    field_path=field_name,
                )
            )
            continue

        if field_name in content and field_type == "enum":
            value = content[field_name]
            valid_values = field_def.get("values", [])
            if value not in valid_values:
                errors.append(
                    ValidationError(
                        component=name,
                        message=(
                            f"Invalid enum value '{value}' for '{field_name}' "
                            f"— must be one of: {', '.join(str(v) for v in valid_values)}"
                        ),
                        field_path=field_name,
                    )
                )

    return errors


def _validate_markdown(name: str, content: str, schema: dict) -> list[ValidationError]:
    """Validate a markdown component — min_length, required/recommended sections."""
    errors: list[ValidationError] = []
    validation = schema.get("validation", {})

    min_length = validation.get("min_length")
    if min_length and len(content) < min_length:
        errors.append(
            ValidationError(
                component=name,
                message=f"Content length ({len(content)}) is below minimum ({min_length})",
            )
        )

    for section in validation.get("required_sections", []):
        if f"<{section}" not in content:
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Missing required section '<{section}>'",
                    field_path=section,
                )
            )

    for section in validation.get("recommended_sections", []):
        if f"<{section}" not in content:
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Missing recommended section '<{section}>'",
                    field_path=section,
                    severity="warning",
                )
            )

    return errors


def _content_as_text(content: str | list | dict) -> str:
    """Convert any content type to a text string for field matching."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.extend(f"{k}: {v}" for k, v in item.items())
            else:
                parts.append(str(item))
        return "\n".join(parts)
    if isinstance(content, dict):
        return "\n".join(f"{k}: {v}" for k, v in content.items())
    return str(content)


def _validate_text(name: str, content: str | list | dict, schema: dict) -> list[ValidationError]:
    """Validate a text component — pattern matching, required/recommended fields."""
    errors: list[ValidationError] = []
    validation = schema.get("validation", {})
    text = _content_as_text(content)

    pattern = validation.get("pattern")
    if pattern and text:
        if not re.search(pattern, text):
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Content does not match required pattern '{pattern}'",
                )
            )

    text_lower = text.lower()
    for field in validation.get("required_fields", []):
        search_term = field.split()[0].lower()
        if search_term not in text_lower:
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Missing required field '{field}' in content",
                    field_path=field,
                )
            )

    for field in validation.get("recommended_fields", []):
        search_term = field.split()[0].lower()
        if search_term not in text_lower:
            errors.append(
                ValidationError(
                    component=name,
                    message=f"Missing recommended field '{field}' in content",
                    field_path=field,
                    severity="warning",
                )
            )

    return errors


def _validate_collection(name: str, content: dict, schema: dict) -> list[ValidationError]:
    """Validate a collection component — check recommended tags per item."""
    errors: list[ValidationError] = []
    items = schema.get("items", {})

    if not isinstance(content, dict):
        return errors

    for item_name, item_schema in items.items():
        if item_name not in content:
            continue
        item_content = str(content[item_name])
        recommended_tags = item_schema.get("validation", {}).get("recommended_tags", [])
        for tag in recommended_tags:
            if f"<{tag}" not in item_content:
                errors.append(
                    ValidationError(
                        component=name,
                        message=f"Missing recommended '<{tag}>' tag in {item_name}",
                        field_path=item_name,
                        severity="warning",
                    )
                )

    return errors


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_component(
    name: str,
    content: str | dict | None,
    component_schema: dict,
) -> list[ValidationError]:
    """Validate a single component's content against its schema rules."""
    if not component_schema:
        return []

    if content is None:
        return [
            ValidationError(
                component=name,
                message=f"Component '{name}' content is None — expected valid content",
            )
        ]

    if isinstance(content, str) and len(content.strip()) == 0:
        return [
            ValidationError(
                component=name,
                message=f"Component '{name}' content is empty — expected valid content",
            )
        ]

    comp_type = component_schema.get("type", "text")

    if comp_type == "structured":
        if not isinstance(content, dict):
            return [
                ValidationError(
                    component=name,
                    message=f"Expected structured dict for '{name}', got {type(content).__name__}",
                )
            ]
        return _validate_structured(name, content, component_schema)

    if comp_type == "markdown":
        return _validate_markdown(name, str(content), component_schema)

    if comp_type == "collection":
        if isinstance(content, dict):
            return _validate_collection(name, content, component_schema)
        return []

    # text and formatted_text — use text validation
    return _validate_text(name, content, component_schema)


def validate_tier_components(
    components: dict[str, str | dict],
    schema: dict,
    tier: str,
) -> ContextValidationResult:
    """Validate that all required components for a tier are present and valid."""
    tiers = schema.get("tiers", {})
    if tier not in tiers:
        raise ValueError(f"Unknown tier '{tier}' — valid tiers: {', '.join(tiers.keys())}")

    tier_def = tiers[tier]
    tier_components = tier_def.get("components", [])
    comp_schemas = schema.get("components", {})

    result = ContextValidationResult(tier=tier)

    for comp_name in tier_components:
        comp_schema = comp_schemas.get(comp_name, {})
        is_required = comp_schema.get("required", False)

        if comp_name not in components:
            if is_required:
                result.errors.append(
                    ValidationError(
                        component=comp_name,
                        message=f"Required component '{comp_name}' is missing for tier {tier}",
                    )
                )
            continue

        comp_errors = validate_component(comp_name, components[comp_name], comp_schema)
        for err in comp_errors:
            if err.severity == "warning":
                result.warnings.append(err)
            else:
                result.errors.append(err)

        result.components_checked += 1

    result.valid = len(result.errors) == 0
    return result


def validate_context_file(
    path: Path,
    schema_path: Path | None = None,
) -> ContextValidationResult:
    """Validate a context YAML file against the schema."""
    if not path.exists():
        raise FileNotFoundError(f"Context file not found: {path}")

    if schema_path is None:
        schema_path = _default_schema_path()

    content = path.read_text()
    if not content.strip():
        return ContextValidationResult(
            valid=False,
            errors=[
                ValidationError(
                    component="document",
                    message="Context file is empty",
                )
            ],
        )

    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as e:
        return ContextValidationResult(
            valid=False,
            errors=[
                ValidationError(
                    component="document",
                    message=f"Invalid YAML: {e}",
                )
            ],
        )

    if not isinstance(data, dict):
        return ContextValidationResult(
            valid=False,
            errors=[
                ValidationError(
                    component="document",
                    message="Context document must be a YAML mapping",
                )
            ],
        )

    schema = load_schema(schema_path)
    tier = data.get("tier", "FULL")
    components = data.get("components", {})

    if not components:
        return ContextValidationResult(
            valid=False,
            errors=[
                ValidationError(
                    component="document",
                    message="No components found in context document",
                )
            ],
        )

    return validate_tier_components(components, schema, tier)


def validate_context_sources(
    root: Path,
    schema_path: Path | None = None,
) -> ContextValidationResult:
    """Validate all context source files referenced in the schema."""
    if schema_path is None:
        schema_path = _default_schema_path()

    schema = load_schema(schema_path)
    comp_schemas = schema.get("components", {})

    result = ContextValidationResult()

    for comp_name, comp_schema in comp_schemas.items():
        source = comp_schema.get("source", {})
        is_required = comp_schema.get("required", False)

        # Check file-based sources (skip template paths with {variables})
        source_path = source.get("data_file") or source.get("path", "")
        if not source_path or "{" in source_path:
            continue

        full_path = root / source_path
        fallback = source.get("fallback", "")
        fallback_path = root / fallback if fallback and "{" not in fallback else None

        if full_path.exists():
            result.components_checked += 1
        elif fallback_path and fallback_path.exists():
            result.components_checked += 1
        elif is_required:
            result.errors.append(
                ValidationError(
                    component=comp_name,
                    message=f"Required source file not found: {source_path}",
                )
            )

    if result.components_checked == 0:
        result.errors.append(
            ValidationError(
                component="sources",
                message="No context source files found in project",
            )
        )

    result.valid = len(result.errors) == 0
    return result
