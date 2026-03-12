"""Context template generator — generates blank templates from the context schema.

Story: MSSCI-15684 (129-4) — Generate Context Document Templates from Schema
"""

from __future__ import annotations

from pathlib import Path

from pf.context.validator import _default_schema_path, load_schema


def _template_structured(name: str, schema: dict) -> str:
    """Generate a YAML template for a structured component."""
    lines = [f"# {name} — {schema.get('description', '')}"]
    lines.append("# Type: structured")
    if schema.get("required"):
        lines.append("# Required: yes")
    lines.append("")

    fields = schema.get("fields", {})
    for field_name, field_def in fields.items():
        ftype = field_def.get("type", "string")
        desc = field_def.get("description", "")
        required = field_def.get("required", False)

        comment_parts = [ftype]
        if required:
            comment_parts.append("required")
        if desc:
            comment_parts.append(desc)

        lines.append(f"# {field_name}: {', '.join(comment_parts)}")

        if ftype == "enum":
            values = field_def.get("values", [])
            default = values[0] if values else '""'
            lines.append(f"{field_name}: {default}")
        elif ftype == "integer":
            default = field_def.get("default", 0)
            lines.append(f"{field_name}: {default}")
        elif ftype == "path":
            lines.append(f'{field_name}: ""')
        else:
            lines.append(f'{field_name}: ""')

        lines.append("")

    return "\n".join(lines)


def _template_markdown(name: str, schema: dict) -> str:
    """Generate a markdown template for a markdown component."""
    lines = [f"# {name}"]
    lines.append("")
    lines.append(f"<!-- {schema.get('description', '')} -->")
    lines.append("")

    validation = schema.get("validation", {})
    min_length = validation.get("min_length")
    if min_length:
        lines.append(f"<!-- Minimum length: {min_length} characters -->")
        lines.append("")

    for section in validation.get("required_sections", []):
        lines.append(f"<{section}>")
        lines.append(f"<!-- Required section: {section} -->")
        lines.append(f"</{section}>")
        lines.append("")

    for section in validation.get("recommended_sections", []):
        lines.append(f"<{section}>")
        lines.append(f"<!-- Recommended section: {section} -->")
        lines.append(f"</{section}>")
        lines.append("")

    return "\n".join(lines)


def _template_text(name: str, schema: dict) -> str:
    """Generate a text template for a text component."""
    lines = [f"# {name}"]
    lines.append(f"# {schema.get('description', '')}")
    lines.append("")

    validation = schema.get("validation", {})

    pattern = validation.get("pattern")
    if pattern:
        desc = validation.get("description", "")
        lines.append(f"# Pattern: {pattern}")
        if desc:
            lines.append(f"# {desc}")
        lines.append("")

    for field in validation.get("required_fields", []):
        lines.append(f"# Required field: {field}")
    for field in validation.get("recommended_fields", []):
        lines.append(f"# Recommended field: {field}")

    if validation.get("required_fields") or validation.get("recommended_fields"):
        lines.append("")

    # Add a stub line matching the pattern if available
    if pattern:
        if "Sprint" in pattern:
            lines.append("Sprint NNNN: <sprint name>")
        elif "Assessment" in pattern:
            lines.append("## <Agent> Assessment")
            lines.append("")
            lines.append("<!-- Assessment content here -->")
        else:
            lines.append("<!-- Content matching pattern here -->")
    else:
        lines.append("<!-- Content here -->")

    lines.append("")
    return "\n".join(lines)


def _template_formatted_text(name: str, schema: dict) -> str:
    """Generate a template for a formatted_text component."""
    lines = [f"# {name}"]
    lines.append(f"# {schema.get('description', '')}")
    lines.append("")

    fields = schema.get("fields", {})
    for field_name, field_def in fields.items():
        required = field_def.get("required", False)
        desc = field_def.get("description", "")
        tag = "required" if required else "optional"
        lines.append(f"# {field_name}: {tag}" + (f" — {desc}" if desc else ""))

    if fields:
        lines.append("")

    for field_name in fields:
        lines.append(f'{field_name}: ""')

    lines.append("")
    return "\n".join(lines)


def _template_collection(name: str, schema: dict) -> str:
    """Generate a YAML template for a collection component."""
    lines = [f"# {name} — {schema.get('description', '')}"]
    lines.append("# Type: collection")
    lines.append("")

    items = schema.get("items", {})
    for item_name, item_def in items.items():
        desc = item_def.get("description", "")
        priority = item_def.get("priority", "")
        tags = item_def.get("validation", {}).get("recommended_tags", [])

        lines.append(f"# {item_name}: {desc}")
        if priority:
            lines.append(f"#   Priority: {priority}")
        if tags:
            lines.append(f"#   Recommended tags: {', '.join(tags)}")

        lines.append(f"{item_name}: |")

        # Generate stub content with recommended tags
        if tags:
            for tag in tags:
                lines.append(f'  <{tag} name="">')
                lines.append(f"  </{tag}>")
        else:
            lines.append("  <!-- Content here -->")

        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_TYPE_GENERATORS = {
    "structured": _template_structured,
    "markdown": _template_markdown,
    "text": _template_text,
    "formatted_text": _template_formatted_text,
    "collection": _template_collection,
}


def generate_component_template(name: str, component_schema: dict) -> str:
    """Generate a template string for a single component."""
    comp_type = component_schema.get("type", "text")
    generator = _TYPE_GENERATORS.get(comp_type, _template_text)
    return generator(name, component_schema)


def file_extension(component_schema: dict) -> str:
    """Return the appropriate file extension for a component type."""
    comp_type = component_schema.get("type", "text")
    if comp_type == "markdown":
        return ".md"
    if comp_type in ("structured", "collection"):
        return ".yaml"
    return ".txt"


def generate_templates(
    output_dir: Path,
    tier: str | None = None,
    schema_path: Path | None = None,
    overwrite: bool = False,
) -> list[Path]:
    """Generate template files for all components (or tier-filtered).

    Returns list of paths written.
    """
    if schema_path is None:
        schema_path = _default_schema_path()

    schema = load_schema(schema_path)
    components = schema.get("components", {})
    tiers = schema.get("tiers", {})

    # Filter by tier if specified
    if tier:
        tier_upper = tier.upper()
        if tier_upper not in tiers:
            raise ValueError(f"Unknown tier '{tier}' — valid tiers: {', '.join(tiers.keys())}")
        tier_components = set(tiers[tier_upper].get("components", []))
    else:
        tier_components = None  # all components

    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for comp_name, comp_schema in components.items():
        if tier_components is not None and comp_name not in tier_components:
            continue

        ext = file_extension(comp_schema)
        out_path = output_dir / f"{comp_name}{ext}"

        if out_path.exists() and not overwrite:
            continue

        content = generate_component_template(comp_name, comp_schema)
        out_path.write_text(content)
        written.append(out_path)

    return written
