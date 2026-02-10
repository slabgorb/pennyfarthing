"""
CLI commands for hotspot analysis.

Usage:
    pf hotspots analyze [OPTIONS]
    pf hotspots files [OPTIONS]
    pf hotspots dirs [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click


@click.group()
def hotspots():
    """Git history hotspot detection.

    \b
    Commands:
      analyze  - Full hotspot analysis (files + directories)
      files    - File-level hotspot report
      dirs     - Directory-level hotspot report
    """
    pass


def _common_options(fn):
    """Shared options for all hotspot commands."""
    fn = click.option("--repo", help="Analyze a single named repo from repos.yaml")(fn)
    fn = click.option("--path", "repo_path", type=click.Path(exists=True), help="Analyze a standalone repo path")(fn)
    fn = click.option("--days", default=90, show_default=True, help="Time window in days")(fn)
    fn = click.option("--top", default=20, show_default=True, help="Number of top results to show")(fn)
    fn = click.option("--format", "fmt", type=click.Choice(["table", "json", "csv"]), default="table", show_default=True)(fn)
    fn = click.option("--output", "output_file", type=click.Path(), help="Write output to file")(fn)
    fn = click.option("--exclude", multiple=True, help="Additional exclude patterns (repeatable)")(fn)
    fn = click.option("--branch", default="--all", show_default=True, help="Branch spec for git log")(fn)
    fn = click.option("--skip-type", "skip_type", multiple=True, help="Skip repos by type (repeatable, e.g. --skip-type orchestrator)")(fn)
    return fn


def _run_analysis(repo: str | None, repo_path: str | None, days: int, exclude: tuple, branch: str, skip_type: tuple = ()):
    """Run analysis and return result."""
    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.hotspots.analyze import analyze_all_repos, analyze_repo

    excludes = list(exclude) if exclude else None
    skip_types = list(skip_type) if skip_type else None

    if repo_path:
        # Standalone analysis of a specific path
        p = Path(repo_path).resolve()
        return asyncio.run(analyze_repo(p.name, p, days, excludes, branch))
    elif repo:
        # Single named repo from project
        project_root = get_project_root()
        from pennyfarthing_scripts.common.config import load_yaml_config
        repos_yaml = load_yaml_config(project_root / ".pennyfarthing" / "repos.yaml")
        if repos_yaml and repo in repos_yaml:
            cfg = repos_yaml[repo]
            rpath = cfg.get("path", repo) if isinstance(cfg, dict) else str(cfg)
            return asyncio.run(
                analyze_repo(repo, project_root / rpath, days, excludes, branch)
            )
        else:
            # Try as a subdirectory name
            candidate = project_root / repo
            if candidate.exists():
                return asyncio.run(
                    analyze_repo(repo, candidate, days, excludes, branch)
                )
            raise click.ClickException(f"Repo not found: {repo}")
    else:
        # All repos
        project_root = get_project_root()
        return asyncio.run(
            analyze_all_repos(project_root, days, excludes, branch, skip_types)
        )


def _output_result(result, fmt: str, output_file: str | None, top: int, mode: str):
    """Format and output the analysis result."""
    from pennyfarthing_scripts.hotspots.formatters import (
        export_csv,
        export_json,
        format_dir_table,
        format_file_table,
        format_summary,
    )
    from pennyfarthing_scripts.hotspots.models import MultiRepoHotspotResult

    # Collect all repo results
    if isinstance(result, MultiRepoHotspotResult):
        repo_results = result.repo_results
    else:
        repo_results = [result]

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        # CSV only supports file-level
        all_files = []
        for r in repo_results:
            all_files.extend(r.file_hotspots)
        all_files.sort(key=lambda h: h.hotspot_score, reverse=True)
        text = export_csv(all_files[:top])
    else:
        # Table output
        parts = []
        for r in repo_results:
            if not r.success:
                parts.append(f"Error ({r.repo_name}): {r.error}")
                continue
            format_summary(r)
            if mode in ("analyze", "files"):
                parts.append("\nFile Hotspots:")
                parts.append(format_file_table(r.file_hotspots, top))
            if mode in ("analyze", "dirs"):
                parts.append("\nDirectory Hotspots:")
                parts.append(format_dir_table(r.directory_hotspots, top))
        text = "\n".join(parts)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@hotspots.command()
@_common_options
def analyze(repo, repo_path, days, top, fmt, output_file, exclude, branch, skip_type):
    """Full hotspot analysis — files and directories."""
    result = _run_analysis(repo, repo_path, days, exclude, branch, skip_type)
    _output_result(result, fmt, output_file, top, "analyze")


@hotspots.command()
@_common_options
def files(repo, repo_path, days, top, fmt, output_file, exclude, branch, skip_type):
    """File-level hotspot report."""
    result = _run_analysis(repo, repo_path, days, exclude, branch, skip_type)
    _output_result(result, fmt, output_file, top, "files")


@hotspots.command()
@_common_options
def dirs(repo, repo_path, days, top, fmt, output_file, exclude, branch, skip_type):
    """Directory-level hotspot report."""
    result = _run_analysis(repo, repo_path, days, exclude, branch, skip_type)
    _output_result(result, fmt, output_file, top, "dirs")
