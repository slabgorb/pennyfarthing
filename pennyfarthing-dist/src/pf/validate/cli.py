"""Validate CLI — top-level validation command.

Usage:
    pf validate              # Run all validators
    pf validate sprint       # Sprint YAML only
    pf validate schema       # XML schema only
    pf validate --fix        # Auto-fix where supported
    pf validate --strict     # Treat warnings as errors
"""

from __future__ import annotations

import re

import click

from pf.common.config import get_project_root
from pf.common.output import error, header, info, success, warn
from pf.validate import ValidateReport

# Story IDs and epic IDs are flat tokens of alphanumerics, dashes, and
# underscores (e.g. "153-5", "PROJ-14238"). Any other character — including
# `/`, `\`, `.`, or NUL — would let a malicious caller escape the
# sprint/context/ directory via path interpolation in `_validate_single_context`.
_CONTEXT_ID_RE = re.compile(r"\A[A-Za-z0-9_-]+\Z")

VALIDATORS = {
    "sprint": "pf.validate.adapters.sprint",
    "schema": "pf.validate.adapters.schema",
    "agent": "pf.validate.adapters.agent",
    "workflow": "pf.validate.adapters.workflow",
    "skill-command": "pf.validate.adapters.skill_command",
    "tandem-awareness": "pf.validate.adapters.tandem_awareness",
    "context": "pf.validate.adapters.context",
    "adr": "pf.validate.adapters.adr",
    "prd": "pf.validate.adapters.prd",
    "architecture": "pf.validate.adapters.architecture",
    "theme": "pf.validate.adapters.theme",
    "version": "pf.validate.adapters.version",
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
@click.argument("names", nargs=-1)
@click.option("--fix", is_flag=True, help="Auto-fix format issues where supported")
@click.option("--strict", is_flag=True, help="Treat warnings as errors")
@click.pass_context
def validate(ctx, names: tuple[str, ...], fix: bool, strict: bool):
    """Run project validators.

    \b
    With no arguments, runs ALL validators.
    Pass one or more validator names to run only those.
    Also supports subcommands for individual validators.

    \b
    Usage:
      pf validate                           # Run all
      pf validate agent theme               # Run specific validators
      pf validate agent --fix               # Run with auto-fix

    \b
    Validators:
      sprint             - Sprint YAML (epics, initiatives, future, current-sprint)
      schema             - XML schema (sessions, skills, workflow steps)
      agent              - Agent definitions (required sections, model values, subagent refs)
      workflow           - Workflow definitions (phased/stepped/procedural structure)
      skill-command      - Skill registry and command files (prefix, deprecated, cross-ref)
      tandem-awareness   - Agent tandem consultation sections (ADR-0012 pairings)
      context            - Context sources and schema validation
      adr                - Architecture Decision Records (format, status, sections)
      prd                - Product Requirements Documents (structure, density, measurability)
      architecture       - Architecture documents (sections, diagrams, references)
      theme              - Theme persona YAML (roles, OCEAN scores, dimensions)
      version            - Version consistency (VERSION, __init__.py, pyproject.toml)
    """
    ctx.ensure_object(dict)
    ctx.obj["fix"] = fix
    ctx.obj["strict"] = strict

    # Click's nargs=-1 consumes subcommand names into `names`. Dispatch
    # to a subcommand when:
    #   - names = (subcmd,)            — single-name shortcut (legacy)
    #   - names = (subcmd, arg, ...)   — subcommand that takes positional args
    #                                    (e.g. `validate context-story 6-1`)
    # When the first name is a no-arg subcommand AND extra names follow,
    # treat the whole list as multiple validator names (e.g. `validate agent theme`).
    if names and names[0] in validate.commands:
        sub_cmd = validate.commands[names[0]]
        sub_takes_args = any(isinstance(p, click.Argument) for p in sub_cmd.params)
        if len(names) == 1 or sub_takes_args:
            sub_ctx = click.Context(sub_cmd, parent=ctx, info_name=names[0])
            with sub_ctx:
                # Sequential parse + invoke. The previous `parse_args(...) or
                # invoke(...)` worked only because parse_args returns [] when
                # all args consume cleanly; a future subcommand with leftover
                # args would silently skip invoke and exit 0 with no validation.
                sub_cmd.parse_args(sub_ctx, list(names[1:]))
                return sub_cmd.invoke(sub_ctx)

    if ctx.invoked_subcommand is None:
        # If names provided as positional args, run only those
        if names:
            bad = [n for n in names if n not in VALIDATORS]
            if bad:
                error(f"Unknown validator(s): {', '.join(bad)}")
                info(f"Available: {', '.join(sorted(VALIDATORS))}")
                raise SystemExit(1)
            to_run = list(names)
        else:
            to_run = list(VALIDATORS)

        reports = []
        for name in to_run:
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


@validate.command("context")
@click.pass_context
def validate_context(ctx):
    """Validate context sources against context schema (components, tiers, assembly).

    \b
    Usage:
      pf validate context                 # Validate all context sources
      pf validate context --story 6-1     # Validate story context file (see note)
      pf validate context --epic 6        # Validate epic context file (see note)

    \b
    Note: Due to Click argument parsing, --story/--epic options must be
    placed BEFORE 'context': pf validate --story 6-1 context
    Or use the group-level options: pf validate context-story 6-1
    """
    report = _run_validator("context", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("context-story")
@click.argument("story_id")
def validate_context_story(story_id: str):
    """Validate a specific story context file.

    \b
    Usage:
      pf validate context-story 6-1
    """
    _validate_single_context("story", story_id)


@validate.command("context-epic")
@click.argument("epic_id")
def validate_context_epic(epic_id: str):
    """Validate a specific epic context file.

    \b
    Usage:
      pf validate context-epic 6
    """
    _validate_single_context("epic", epic_id)


def _validate_single_context(context_type: str, context_id: str) -> None:
    """Validate a single epic or story context file.

    Story context files in this project are markdown documents — the
    on-activation gate only needs to confirm that one exists and is
    non-empty. The full YAML schema validator (``pf validate context``)
    handles structured context documents separately.

    Exit codes match the contract documented in the TEA agent's
    on-activation step:
      - 0: context file exists and is non-empty (proceed)
      - 1: file exists but is empty / unreadable (stop)
      - 2: file is missing OR context_id is syntactically invalid (stop)
    """
    if not _CONTEXT_ID_RE.match(context_id):
        error(
            f"Invalid context ID: {context_id!r} — "
            "must contain only letters, digits, dashes, and underscores."
        )
        raise SystemExit(2)

    root = get_project_root()
    path = root / "sprint" / "context" / f"context-{context_type}-{context_id}.md"

    if not path.exists():
        error(f"Context file not found: {path.relative_to(root)}")
        raise SystemExit(2)

    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        error(f"Could not read context file {path.relative_to(root)}: {exc}")
        raise SystemExit(1) from exc

    if not content.strip():
        error(f"Context file is empty: {path.relative_to(root)}")
        raise SystemExit(1)

    success(f"context-{context_type}-{context_id}: present ({len(content)} bytes)")
    raise SystemExit(0)


@validate.command("adr")
@click.pass_context
def validate_adr(ctx):
    """Validate Architecture Decision Records (format, status, sections)."""
    report = _run_validator("adr", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("prd")
@click.pass_context
def validate_prd(ctx):
    """Validate Product Requirements Documents (structure, density, measurability)."""
    report = _run_validator("prd", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("architecture")
@click.pass_context
def validate_architecture(ctx):
    """Validate architecture documents (sections, diagrams, references)."""
    report = _run_validator("architecture", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("theme")
@click.pass_context
def validate_theme(ctx):
    """Validate theme persona YAML (roles, OCEAN scores, dimensions)."""
    report = _run_validator("theme", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)


@validate.command("version")
@click.pass_context
def validate_version(ctx):
    """Validate version consistency (VERSION, __init__.py, pyproject.toml)."""
    report = _run_validator("version", fix=ctx.obj["fix"], strict=ctx.obj["strict"])
    _print_reports([report])
    if not report.success:
        raise SystemExit(1)
