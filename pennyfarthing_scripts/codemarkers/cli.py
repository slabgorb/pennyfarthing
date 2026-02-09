"""
CLI commands for code marker analysis.

Usage:
    pf codemarkers analyze [OPTIONS]
    pf codemarkers stale [OPTIONS]
    pf codemarkers summary [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click


@click.group()
def codemarkers():
    """Code marker detection (TODO, FIXME, HACK, XXX).

    \b
    Commands:
      analyze  - Full marker analysis with blame data
      stale    - Show only stale markers (older than threshold)
      summary  - Summary counts by marker type
    """
    pass


def _common_options(fn):
    """Shared options for all codemarkers commands."""
    fn = click.option("--repo", help="Analyze a single named repo from repos.yaml")(fn)
    fn = click.option("--path", "repo_path", type=click.Path(), help="Analyze a standalone repo path")(fn)
    fn = click.option("--days", default=90, show_default=True, help="Stale threshold in days")(fn)
    fn = click.option("--top", default=20, show_default=True, help="Number of top results to show")(fn)
    fn = click.option("--format", "fmt", type=click.Choice(["table", "json", "csv"]), default="table", show_default=True)(fn)
    fn = click.option("--output", "output_file", type=click.Path(), help="Write output to file")(fn)
    fn = click.option("--exclude", multiple=True, help="Additional exclude patterns (repeatable)")(fn)
    return fn


def _run_analysis(repo: str | None, repo_path: str | None, days: int, exclude: tuple):
    """Run analysis and return result."""
    from pennyfarthing_scripts.codemarkers.analyze import analyze_repo
    from pennyfarthing_scripts.common.config import get_project_root

    excludes = list(exclude) if exclude else None

    if repo_path:
        p = Path(repo_path).resolve()
        return asyncio.run(analyze_repo(p.name, p, days, excludes))
    elif repo:
        project_root = get_project_root()
        from pennyfarthing_scripts.common.config import load_yaml_config
        repos_yaml = load_yaml_config(project_root / ".pennyfarthing" / "repos.yaml")
        if repos_yaml and repo in repos_yaml:
            cfg = repos_yaml[repo]
            rpath = cfg.get("path", repo) if isinstance(cfg, dict) else str(cfg)
            return asyncio.run(
                analyze_repo(repo, project_root / rpath, days, excludes)
            )
        else:
            candidate = project_root / repo
            if candidate.exists():
                return asyncio.run(analyze_repo(repo, candidate, days, excludes))
            raise click.ClickException(f"Repo not found: {repo}")
    else:
        project_root = get_project_root()
        return asyncio.run(
            analyze_repo(project_root.name, project_root, days, excludes)
        )


def _output_result(result, fmt: str, output_file: str | None, top: int, mode: str):
    """Format and output the analysis result."""
    from pennyfarthing_scripts.codemarkers.formatters import (
        export_csv,
        export_json,
        format_marker_table,
        format_summary,
    )

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        text = export_csv(result.markers[:top])
    else:
        format_summary(result)
        if mode == "stale":
            stale = [m for m in result.markers if m.is_stale]
            text = format_marker_table(stale, top)
        else:
            text = format_marker_table(result.markers, top)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@codemarkers.command()
@_common_options
def analyze(repo, repo_path, days, top, fmt, output_file, exclude):
    """Full marker analysis with blame data."""
    result = _run_analysis(repo, repo_path, days, exclude)
    _output_result(result, fmt, output_file, top, "analyze")


@codemarkers.command()
@_common_options
def stale(repo, repo_path, days, top, fmt, output_file, exclude):
    """Show only stale markers (older than threshold)."""
    result = _run_analysis(repo, repo_path, days, exclude)
    _output_result(result, fmt, output_file, top, "stale")


@codemarkers.command()
@_common_options
def summary(repo, repo_path, days, top, fmt, output_file, exclude):
    """Summary counts by marker type."""
    result = _run_analysis(repo, repo_path, days, exclude)
    if fmt == "json":
        from pennyfarthing_scripts.codemarkers.formatters import export_json
        click.echo(export_json(result))
    else:
        from pennyfarthing_scripts.codemarkers.formatters import format_summary
        format_summary(result, file=click.get_text_stream("stdout"))


def _run_deprecation_analysis(repo_path, exclude):
    """Run deprecation analysis and return result dict."""
    from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

    excludes = list(exclude) if exclude else None
    if repo_path:
        p = Path(repo_path).resolve()
    else:
        from pennyfarthing_scripts.common.config import get_project_root
        p = get_project_root()

    return asyncio.run(analyze_deprecations(p, excludes))


@codemarkers.command()
@_common_options
def deprecations(repo, repo_path, days, top, fmt, output_file, exclude):
    """Scan for @deprecated symbols and cross-reference callers."""
    result = _run_deprecation_analysis(repo_path, exclude)

    if fmt == "json":
        import json
        from dataclasses import asdict

        output = {
            "success": result["success"],
            "deprecations": [asdict(m) for m in result.get("deprecations", [])],
            "summary": result.get("summary", {}),
        }
        text = json.dumps(output, indent=2)
    else:
        lines = []
        deps = result.get("deprecations", [])
        summary = result.get("summary", {})
        lines.append(f"Total deprecations: {summary.get('total_deprecations', 0)}")
        lines.append(f"With active callers: {summary.get('deprecations_with_callers', 0)}")
        lines.append("")
        for m in deps[:top]:
            callers_str = f" ({m.caller_count} callers)" if m.caller_count else ""
            lines.append(f"  {m.symbol} @ {m.path}:{m.line}{callers_str}")
            lines.append(f"    {m.text}")
        text = "\n".join(lines)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)
