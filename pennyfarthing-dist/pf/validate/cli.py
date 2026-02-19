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

from pf.common.config import get_project_root
from pf.common.output import error, header, info, success, warn
from pf.validate import ValidateReport

VALIDATORS = {
    "sprint": "pf.validate.adapters.sprint",
    "schema": "pf.validate.adapters.schema",
    "agent": "pf.validate.adapters.agent",
    "workflow": "pf.validate.adapters.workflow",
    "skill-command": "pf.validate.adapters.skill_command",
    "tandem-awareness": "pf.validate.adapters.tandem_awareness",
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
      sprint             - Sprint YAML (epics, initiatives, future, current-sprint)
      schema             - XML schema (sessions, skills, workflow steps)
      agent              - Agent definitions (required sections, model values, subagent refs)
      workflow           - Workflow definitions (phased/stepped/procedural structure)
      skill-command      - Skill registry and command files (prefix, deprecated, cross-ref)
      tandem-awareness   - Agent tandem consultation sections (ADR-0012 pairings)
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


@validate.command("agent")
@click.pass_context
def validate_agent(ctx):
    """Validate agent definition files (required sections, model values, refs)."""
    report = _run_validator("agent", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("workflow")
@click.pass_context
def validate_workflow(ctx):
    """Validate workflow definitions (phased/stepped/procedural structure)."""
    report = _run_validator("workflow", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("skill-command")
@click.pass_context
def validate_skill_command(ctx):
    """Validate skill registry and command files (prefix, deprecated, cross-ref)."""
    report = _run_validator("skill-command", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("tandem-awareness")
@click.pass_context
def validate_tandem_awareness(ctx):
    """Validate agent tandem consultation sections (ADR-0012 pairings, roles)."""
    report = _run_validator("tandem-awareness", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)
