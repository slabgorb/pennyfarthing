"""Validate CLI — top-level validation command.

Usage:
    pf validate              # Run all validators
    pf validate sprint       # Sprint YAML only
    pf validate schema       # XML schema only
    pf validate --fix        # Auto-fix where supported
    pf validate --strict     # Treat warnings as errors
"""

from __future__ import annotations

import click

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.common.output import error, header, info, success, warn
from pennyfarthing_scripts.validate import ValidateReport

VALIDATORS = {
    "sprint": "pennyfarthing_scripts.validate.adapters.sprint",
    "schema": "pennyfarthing_scripts.validate.adapters.schema",
}


def _run_validator(name: str, *, fix: bool, strict: bool) -> ValidateReport:
    """Run a single validator by name."""
    import importlib

    mod = importlib.import_module(VALIDATORS[name])
    root = get_project_root()
    return mod.run(root, fix=fix, strict=strict)


def _print_reports(reports: list[ValidateReport]) -> None:
    """Print validation reports with color output."""
    for report in reports:
        header(f"Validator: {report.validator}", char="-", width=50)

        if report.details:
            for line in report.details:
                if "[ERROR]" in line or "[SYNTAX]" in line or "[SCHEMA]" in line:
                    error(line)
                elif "[WARN]" in line or "[FORMAT]" in line:
                    warn(line)
                else:
                    click.echo(f"  {line}", err=True)

        parts = [f"{report.passed} passed"]
        if report.warnings:
            parts.append(f"{report.warnings} warnings")
        if report.errors:
            parts.append(f"{report.errors} errors")
        if report.fixed:
            parts.append("(fixed)")

        summary_line = ", ".join(parts)
        if report.success:
            success(f"{report.validator}: {summary_line}")
        else:
            error(f"{report.validator}: {summary_line}")

    click.echo("", err=True)
    total_errors = sum(r.errors for r in reports)
    total_warnings = sum(r.warnings for r in reports)
    total_passed = sum(r.passed for r in reports)

    info(f"Total: {total_passed} passed, {total_warnings} warnings, {total_errors} errors")


@click.group(invoke_without_command=True)
@click.option("--fix", is_flag=True, help="Auto-fix format issues where supported")
@click.option("--strict", is_flag=True, help="Treat warnings as errors")
@click.pass_context
def validate(ctx, fix: bool, strict: bool):
    """Run project validators.

    \b
    With no subcommand, runs ALL validators.
    Specify a validator name to run only that one.

    \b
    Validators:
      sprint  - Sprint YAML (epics, initiatives, future, current-sprint)
      schema  - XML schema (sessions, skills, workflow steps)
    """
    ctx.ensure_object(dict)
    ctx.obj["fix"] = fix
    ctx.obj["strict"] = strict

    if ctx.invoked_subcommand is None:
        reports = []
        for name in VALIDATORS:
            reports.append(_run_validator(name, fix=fix, strict=strict))
        _print_reports(reports)
        if any(not r.success for r in reports):
            raise SystemExit(1)


@validate.command("sprint")
@click.pass_context
def validate_sprint(ctx):
    """Validate sprint YAML files (auto-discovers all files in sprint/)."""
    report = _run_validator("sprint", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("schema")
@click.pass_context
def validate_schema(ctx):
    """Validate XML schema files (sessions, skills, workflow steps)."""
    report = _run_validator("schema", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)
