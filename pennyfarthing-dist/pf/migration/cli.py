"""
Migration CLI - Click-based CLI for XML schema migration tools.

Usage:
    pf migration [COMMAND] [ARGS]...

Commands:
    session   Migrate session files to XML format
    skill     Audit skill files for required tags
    step      Audit workflow step files
    validate  Validate files against XML schemas
"""

from __future__ import annotations

from pathlib import Path

import click

from pf.common.output import error, info, success, warn


def _find_project_root() -> Path:
    """Find project root by looking for .pennyfarthing directory."""
    cwd = Path.cwd()

    # Walk up looking for .pennyfarthing
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").exists():
            return parent

    # Fall back to cwd
    return cwd


@click.group()
def migration():
    """XML schema migration tools.

    \b
    Commands:
      session   - Migrate session files to XML format
      skill     - Audit skill files for required tags
      step      - Audit workflow step files
      validate  - Validate files against schemas
    """
    pass


@migration.command()
@click.argument("file", required=False, type=click.Path(exists=True))
@click.option("--dry-run", is_flag=True, help="Show what would be done without writing")
@click.option("--all", "convert_all", is_flag=True, help="Convert all session files")
def session(file: str | None, dry_run: bool, convert_all: bool):
    """Migrate session files to XML format.

    \b
    Arguments:
      FILE  - Specific session file to convert (optional)

    \b
    Examples:
      pf migration session --dry-run .session/archive/MSSCI-12142-session.md
      pf migration session --all --dry-run
      pf migration session --all
    """
    from pf.migration.session import (
        convert_session_file,
        find_session_files,
    )

    root = _find_project_root()

    if file:
        file_path = Path(file)
        result = convert_session_file(file_path, dry_run=dry_run)

        if result.get("skipped"):
            info(f"{file_path.name}: Already in XML format")
        elif result.get("success"):
            if dry_run:
                click.echo(f"\n=== Would convert {file_path.name} to: ===\n")
                click.echo(result.get("content"))
                click.echo("\n=== End ===")
            else:
                success(f"Converted: {file_path.name}")
        else:
            error(result.get("message", "Conversion failed"))
            raise click.Abort()

    elif convert_all:
        files = find_session_files(root)
        if not files:
            warn("No session files found")
            return

        info(f"Found {len(files)} session files")
        converted = 0
        skipped = 0

        for file_path in files:
            result = convert_session_file(file_path, dry_run=dry_run)

            if result.get("skipped"):
                skipped += 1
            elif result.get("success"):
                converted += 1
                if dry_run:
                    info(f"Would convert: {file_path.name}")
                else:
                    success(f"Converted: {file_path.name}")
            else:
                error(f"Failed: {file_path.name} - {result.get('message')}")

        click.echo("")
        info(f"Summary: {converted} converted, {skipped} already XML")

    else:
        # Show available files
        files = find_session_files(root)
        if not files:
            warn("No session files found")
            return

        info(f"Session files found: {len(files)}")
        for f in files[:10]:
            click.echo(f"  {f.relative_to(root)}")
        if len(files) > 10:
            click.echo(f"  ... and {len(files) - 10} more")
        click.echo("")
        info("Use --all to convert all, or specify a file path")


@migration.command()
@click.argument("skill_name", required=False)
@click.option("--report", is_flag=True, help="Generate detailed report")
def skill(skill_name: str | None, report: bool):
    """Audit skill files for required XML tags.

    \b
    Arguments:
      SKILL_NAME  - Specific skill to audit (optional)

    \b
    Examples:
      pf migration skill --report
      pf migration skill sprint
    """
    from pf.migration.skill import audit_skills

    root = _find_project_root()
    results = audit_skills(root, skill_name=skill_name)

    if results["summary"].get("error"):
        error(results["summary"]["error"])
        raise click.Abort()

    # Print results
    for result in results["results"]:
        if result.status == "OK":
            success(f"{result.skill_name}: All tags present")
        elif result.status == "PARTIAL":
            warn(f"{result.skill_name}: Missing recommended: {', '.join(result.missing_recommended)}")
        else:
            error(f"{result.skill_name}: Missing required: {', '.join(result.missing_required)}")

        if report and (result.missing_required or result.missing_recommended):
            click.echo(f"    Present: {', '.join(result.present_tags)}")

    # Print summary
    summary = results["summary"]
    click.echo("")
    info("=== Summary ===")
    click.echo(f"  Total:       {summary['total']}")
    click.echo(f"  Valid:       {summary['valid']}")
    click.echo(f"  Partial:     {summary['partial']}")
    click.echo(f"  Needs work:  {summary['needs_update']}")

    if summary["needs_update"] > 0:
        click.echo("")
        info("Skills needing updates:")
        for result in results["results"]:
            if not result.is_valid:
                click.echo(f"  - {result.skill_name}")


@migration.command()
@click.argument("workflow_name", required=False)
@click.option("--report", is_flag=True, help="Generate detailed report")
def step(workflow_name: str | None, report: bool):
    """Audit workflow step files for required XML tags.

    \b
    Arguments:
      WORKFLOW_NAME  - Specific workflow to audit (optional)

    \b
    Examples:
      pf migration step --report
      pf migration step architecture
    """
    from pf.migration.step import audit_workflow_steps

    root = _find_project_root()
    results = audit_workflow_steps(root, workflow_name=workflow_name)

    # Print results by workflow
    for workflow in results["workflows"]:
        info(f"Workflow: {workflow.workflow_name} ({workflow.total_steps} steps)")

        for result in workflow.step_results:
            if result.status == "OK":
                if report:
                    success(f"  {result.step_name}: OK")
            elif result.status == "PARTIAL":
                warn(f"  {result.step_name}: Missing recommended: {', '.join(result.missing_recommended)}")
            else:
                error(f"  {result.step_name}: Missing required: {', '.join(result.missing_required)}")

    # Print summary
    summary = results["summary"]
    click.echo("")
    info("=== Summary ===")
    click.echo(f"  Workflows:   {summary['total_workflows']}")
    click.echo(f"  Step files:  {summary['total_files']}")
    click.echo(f"  Valid:       {summary['valid']}")
    click.echo(f"  Needs work:  {summary['needs_update']}")

    if summary["needs_update"] > 0:
        click.echo("")
        info("Workflows with missing required tags:")
        for workflow in results["workflows"]:
            if workflow.needs_update > 0:
                click.echo(f"  - {workflow.workflow_name} ({workflow.needs_update} files)")


@migration.command()
@click.option(
    "--type",
    "file_type",
    type=click.Choice(["session", "skill", "step", "all"]),
    default="all",
    help="Type of files to validate",
)
@click.option("--strict", is_flag=True, help="Treat warnings as errors")
def validate(file_type: str, strict: bool):
    """Validate files against XML schemas.

    \b
    Examples:
      pf migration validate
      pf migration validate --type skill
      pf migration validate --strict
    """
    from pf.migration.validate import validate_all

    root = _find_project_root()
    summary = validate_all(root, file_type=file_type, strict=strict)

    # Print results
    for result in summary.results:
        rel_path = result.file_path.relative_to(root) if root in result.file_path.parents else result.file_path
        if result.status == "PASS":
            success(f"{rel_path}")
        elif result.status == "WARN":
            warn(f"{rel_path}")
            for w in result.warnings:
                click.echo(f"    - {w}")
        else:
            error(f"{rel_path}")
            for e in result.errors:
                click.echo(f"    - {e}")

    # Print summary
    click.echo("")
    info("=== Summary ===")
    click.echo(f"  Passed:   {summary.passed}")
    click.echo(f"  Warnings: {summary.warnings}")
    click.echo(f"  Errors:   {summary.errors}")

    if not summary.success:
        raise click.Abort()

    if strict and summary.warnings > 0:
        error("Warnings treated as errors in strict mode")
        raise click.Abort()


# Alias for backwards compatibility
cli = migration


def main(args: list[str] | None = None) -> int:
    """Entry point."""
    try:
        migration(args)
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 0


if __name__ == "__main__":
    migration()
