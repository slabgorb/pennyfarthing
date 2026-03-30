"""Context CLI — commands for context validation, inspection, and template generation.

Stories: PROJ-15683 (129-3), PROJ-15684 (129-4)
"""

from __future__ import annotations

from pathlib import Path

import click


@click.group()
def context():
    """Context document management and validation.

    \b
    Commands:
      validate  - Validate context files against schema
      template  - Generate blank templates from schema
    """
    pass


@context.command("validate")
@click.argument("file", required=False, type=click.Path(exists=False))
@click.option(
    "--tier",
    type=click.Choice(
        ["FULL", "REFRESH", "HANDOFF", "MINIMAL"],
        case_sensitive=False,
    ),
    help="Validate for a specific tier",
)
@click.option("--strict", is_flag=True, help="Treat warnings as errors")
def validate_cmd(file: str | None, tier: str | None, strict: bool) -> None:
    """Validate context files against the context schema.

    \b
    If FILE is provided, validates that specific context YAML file.
    If no FILE, validates all context sources referenced in the schema.

    \b
    Examples:
      pf context validate                    # Validate all sources
      pf context validate context.yaml       # Validate specific file
      pf context validate --tier FULL        # Validate for FULL tier
      pf context validate --strict           # Warnings as errors
    """
    from pf.context.validator import validate_context_file, validate_context_sources

    if file:
        path = Path(file)
        try:
            result = validate_context_file(path)
        except FileNotFoundError as err:
            click.echo(f"Error: File not found: {file}", err=True)
            raise SystemExit(1) from err

        if strict:
            # Promote warnings to errors
            result.errors.extend(result.warnings)
            result.warnings.clear()
            result.valid = len(result.errors) == 0

        if result.valid:
            click.echo(f"Context validation passed ({result.components_checked} components)")
        else:
            for err in result.errors:
                click.echo(f"[ERROR] {err.component}: {err.message}", err=True)
            for warn in result.warnings:
                click.echo(f"[WARN] {warn.component}: {warn.message}", err=True)
            raise SystemExit(1)
    else:
        try:
            from pf.common.config import get_project_root

            root = get_project_root()
        except Exception:
            root = Path.cwd()

        result = validate_context_sources(root)

        if result.valid:
            click.echo(f"Context sources valid ({result.components_checked} checked)")
        else:
            for err in result.errors:
                click.echo(f"[ERROR] {err.component}: {err.message}", err=True)
            raise SystemExit(1)


@context.command("template")
@click.option(
    "--tier",
    type=click.Choice(
        ["FULL", "REFRESH", "HANDOFF", "MINIMAL"],
        case_sensitive=False,
    ),
    help="Generate templates for a specific tier only",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(),
    default="./context-templates",
    help="Output directory (default: ./context-templates/)",
)
@click.option("--overwrite", is_flag=True, help="Overwrite existing template files")
def template_cmd(tier: str | None, output: str, overwrite: bool) -> None:
    """Generate blank context document templates from the schema.

    \b
    Creates template files for each component defined in the context
    schema, with inline documentation and placeholder content.

    \b
    Examples:
      pf context template                          # All components
      pf context template --tier FULL              # FULL tier only
      pf context template -o ./my-templates        # Custom output dir
      pf context template --overwrite              # Replace existing
    """
    from pf.context.templates import generate_templates

    output_dir = Path(output)

    try:
        written = generate_templates(output_dir, tier=tier, overwrite=overwrite)
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1) from None

    if written:
        click.echo(f"Generated {len(written)} template(s) in {output_dir}/")
        for p in written:
            click.echo(f"  {p.name}")
    else:
        click.echo("No templates generated (files may already exist, use --overwrite)")
