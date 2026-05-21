"""
CLI commands for dead code detection.

Usage:
    pf deadcode stale [OPTIONS]
    pf deadcode exports [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click


@click.group()
def deadcode():
    """Dead code detection tools.

    \b
    Commands:
      stale    - Find files with no recent commits
      exports  - Find unused TypeScript exports via ts-prune
    """
    pass


def _common_options(fn):
    """Shared options for deadcode commands."""
    fn = click.option("--repo", help="Analyze a single named repo from repos.yaml")(fn)
    fn = click.option(
        "--path", "repo_path", type=click.Path(exists=True), help="Analyze a standalone repo path"
    )(fn)
    fn = click.option("--days", default=180, show_default=True, help="Time window in days")(fn)
    fn = click.option("--top", default=20, show_default=True, help="Number of top results to show")(
        fn
    )
    fn = click.option(
        "--format",
        "fmt",
        type=click.Choice(["table", "json", "csv"]),
        default="table",
        show_default=True,
    )(fn)
    fn = click.option("--output", "output_file", type=click.Path(), help="Write output to file")(fn)
    fn = click.option("--exclude", multiple=True, help="Additional exclude patterns (repeatable)")(
        fn
    )
    fn = click.option(
        "--branch", default="--all", show_default=True, help="Branch spec for git log"
    )(fn)
    return fn


def _run_analysis(repo: str | None, repo_path: str | None, days: int, exclude: tuple, branch: str):
    """Run analysis and return result."""
    from pf.common.config import get_project_root
    from pf.deadcode.analyze import analyze_repo

    excludes = list(exclude) if exclude else None

    if repo_path:
        p = Path(repo_path).resolve()
        return asyncio.run(analyze_repo(p.name, p, days, excludes, branch))
    elif repo:
        project_root = get_project_root()
        from pf.common.config import load_yaml_config

        repos_yaml = load_yaml_config(project_root / ".pennyfarthing" / "repos.yaml")
        if repos_yaml and repo in repos_yaml:
            cfg = repos_yaml[repo]
            rpath = cfg.get("path", repo) if isinstance(cfg, dict) else str(cfg)
            return asyncio.run(analyze_repo(repo, project_root / rpath, days, excludes, branch))
        else:
            candidate = project_root / repo
            if candidate.exists():
                return asyncio.run(analyze_repo(repo, candidate, days, excludes, branch))
            raise click.ClickException(f"Repo not found: {repo}")
    else:
        project_root = get_project_root()
        return asyncio.run(analyze_repo(project_root.name, project_root, days, excludes, branch))


def _output_result(result, fmt: str, output_file: str | None, top: int):
    """Format and output the analysis result."""
    from pf.deadcode.formatters import (
        export_csv,
        export_json,
        format_table,
    )

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        text = export_csv(result.stale_files[:top])
    else:
        text = format_table(result.stale_files, top)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@deadcode.command()
@_common_options
def stale(repo, repo_path, days, top, fmt, output_file, exclude, branch):
    """Find files with no recent git commits."""
    result = _run_analysis(repo, repo_path, days, exclude, branch)
    _output_result(result, fmt, output_file, top)


def _exports_options(fn):
    """Shared options for exports subcommand."""
    fn = click.option("--repo", help="Analyze a single named repo from repos.yaml")(fn)
    fn = click.option(
        "--path", "repo_path", type=click.Path(exists=True), help="Analyze a standalone repo path"
    )(fn)
    fn = click.option("--top", default=20, show_default=True, help="Number of top results to show")(
        fn
    )
    fn = click.option(
        "--format",
        "fmt",
        type=click.Choice(["table", "json", "csv"]),
        default="table",
        show_default=True,
    )(fn)
    fn = click.option("--output", "output_file", type=click.Path(), help="Write output to file")(fn)
    return fn


def _run_exports_analysis(repo: str | None, repo_path: str | None):
    """Run unused export analysis and return result."""
    from pf.common.config import get_project_root
    from pf.deadcode.analyze import find_unused_exports

    if repo_path:
        p = Path(repo_path).resolve()
        return asyncio.run(find_unused_exports(p))
    elif repo:
        project_root = get_project_root()
        from pf.common.config import load_yaml_config

        repos_yaml = load_yaml_config(project_root / ".pennyfarthing" / "repos.yaml")
        if repos_yaml and repo in repos_yaml:
            cfg = repos_yaml[repo]
            rpath = cfg.get("path", repo) if isinstance(cfg, dict) else str(cfg)
            return asyncio.run(find_unused_exports(project_root / rpath))
        else:
            candidate = project_root / repo
            if candidate.exists():
                return asyncio.run(find_unused_exports(candidate))
            raise click.ClickException(f"Repo not found: {repo}")
    else:
        project_root = get_project_root()
        return asyncio.run(find_unused_exports(project_root))


def _output_exports_result(result, fmt: str, output_file: str | None, top: int):
    """Format and output the exports analysis result."""
    from pf.deadcode.formatters import (
        export_exports_csv,
        export_exports_json,
        format_exports_table,
    )

    if fmt == "json":
        text = export_exports_json(result)
    elif fmt == "csv":
        text = export_exports_csv(result.unused_exports[:top])
    else:
        text = format_exports_table(result.unused_exports, top)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@deadcode.command()
@_exports_options
def exports(repo, repo_path, top, fmt, output_file):
    """Find unused TypeScript exports via ts-prune."""
    result = _run_exports_analysis(repo, repo_path)
    _output_exports_result(result, fmt, output_file, top)
