"""Benchmark CLI commands.

Usage:
    pf benchmark replay run <scenario.yaml> --theme firefly [--n 1]
    pf benchmark replay score <result-dir>
    pf benchmark replay compare <scenario.yaml>
    pf benchmark analyze <scenario.yaml> [--section tier|findings|dimensions|untested|all]

Must be run from a regular terminal (not inside Claude Code).

Extension discovery:
    Projects can register additional benchmark commands by placing Python files
    in `.pennyfarthing/extensions/benchmark/`. Each file must define a
    `register(parent)` function that adds Click commands to the parent group.
"""

from __future__ import annotations

import math
from pathlib import Path

import click
import yaml

from pf.extensions import load_extensions


@click.group()
def benchmark():
    """Benchmark tools — pipeline replay, scoring, comparison."""
    pass


# Load project-local extensions (lazy — only runs when benchmark group is invoked)
load_extensions(benchmark, "benchmark")


# ---------------------------------------------------------------------------
# analyze command
# ---------------------------------------------------------------------------


@benchmark.command("analyze")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option(
    "--results-dir",
    default=None,
    type=click.Path(exists=True),
    help="Base results directory",
)
@click.option(
    "--section",
    type=click.Choice(["tier", "findings", "dimensions", "untested", "all"]),
    default="all",
    help="Which analysis section to show",
)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def analyze(scenario_path, results_dir, section, as_json):
    """Analyze benchmark results — tiers, catch rates, dimension correlations.

    \b
    Sections:
      tier        Theme ranking by weighted score average
      findings    Per-finding catch rates across themes
      dimensions  Theme dimension correlation with scores
      untested    Themes not yet benchmarked
      all         All sections (default)

    \b
    Examples:
        pf benchmark analyze scenarios/dpgd-116.yaml
        pf benchmark analyze scenarios/dpgd-116.yaml --section dimensions
        pf benchmark analyze scenarios/dpgd-116.yaml --json
    """
    import json as json_mod

    from pf.benchmark.pipeline_replay import FindingScore, PipelineScore, load_scenario

    project = Path.cwd()
    scenario = load_scenario(scenario_path, project_dir=project)

    base = Path(results_dir) if results_dir else project / "internal" / "results" / "pipeline-replay"
    scenario_dir = base / scenario.id

    if not scenario_dir.exists():
        click.echo(f"No results found at {scenario_dir}", err=True)
        raise SystemExit(1)

    # --- Collect all scored runs ---
    theme_runs: dict[str, list[PipelineScore]] = {}
    for theme_dir in sorted(scenario_dir.iterdir()):
        if not theme_dir.is_dir() or theme_dir.name.startswith("_"):
            continue
        for run_dir in sorted(theme_dir.iterdir()):
            if not run_dir.is_dir() or not run_dir.name.startswith("run-"):
                continue
            mv_file = run_dir / "majority_vote.yaml"
            score_file = run_dir / "score.yaml"
            chosen = mv_file if mv_file.exists() else score_file
            if not chosen.exists():
                continue
            score_data = yaml.safe_load(chosen.read_text())
            run_num = int(run_dir.name.split("-")[1]) if "-" in run_dir.name else 0
            ps = PipelineScore(
                scenario_id=score_data.get("scenario_id", scenario.id),
                theme=score_data.get("theme", theme_dir.name),
                run_id=score_data.get("run_id", run_num),
                findings=[
                    FindingScore(**{
                        k: v for k, v in f.items()
                        if k in ("finding_id", "title", "weight", "phase_ideal", "caught", "caught_by", "evidence")
                    })
                    for f in score_data.get("findings", [])
                ],
                total_caught=score_data["total_caught"],
                total_findings=score_data["total_findings"],
                weighted_caught=score_data["weighted_caught"],
                total_weight=score_data["total_weight"],
                score_pct=score_data["score_pct"],
            )
            tag = theme_dir.name
            theme_runs.setdefault(tag, []).append(ps)

    if not theme_runs:
        click.echo("No scored runs found.", err=True)
        raise SystemExit(1)

    # --- Compute stats per theme ---
    finding_ids = [gt.id for gt in scenario.ground_truth]
    theme_stats = _compute_theme_stats(theme_runs, finding_ids)

    # --- Collect for JSON output ---
    result_data: dict = {"scenario_id": scenario.id}

    show_all = section == "all"

    if show_all or section == "tier":
        _print_tier_ranking(theme_stats, finding_ids, scenario)
        result_data["tiers"] = _tier_data(theme_stats)

    if show_all or section == "findings":
        _print_finding_rates(theme_stats, finding_ids, scenario)
        result_data["finding_rates"] = _finding_rate_data(theme_stats, finding_ids, scenario)

    if show_all or section == "dimensions":
        _print_dimension_correlation(theme_stats, scenario)
        result_data["dimensions"] = _dimension_data(theme_stats)

    if show_all or section == "untested":
        _print_untested_themes(theme_stats)
        result_data["untested"] = _untested_data(theme_stats)

    if as_json:
        click.echo(json_mod.dumps(result_data, indent=2))


def _compute_theme_stats(
    theme_runs: dict[str, list], finding_ids: list[str]
) -> dict[str, dict]:
    """Compute per-theme statistics from collected runs."""
    stats = {}
    for theme, runs in theme_runs.items():
        scores = [r.score_pct for r in runs]
        n = len(scores)
        avg = sum(scores) / n
        stdev = math.sqrt(sum((s - avg) ** 2 for s in scores) / n) if n > 1 else 0.0

        # Per-finding catch rates
        finding_rates = {}
        for fid in finding_ids:
            catches = sum(
                1 for r in runs
                for f in r.findings
                if f.finding_id == fid and f.caught
            )
            finding_rates[fid] = catches / n * 100

        # Per-finding phase attribution
        finding_phases = {}
        for fid in finding_ids:
            phase_counts: dict[str, int] = {}
            for r in runs:
                for f in r.findings:
                    if f.finding_id == fid and f.caught and f.caught_by:
                        phase_counts[f.caught_by] = phase_counts.get(f.caught_by, 0) + 1
            finding_phases[fid] = phase_counts

        stats[theme] = {
            "avg": avg,
            "stdev": stdev,
            "n": n,
            "scores": scores,
            "finding_rates": finding_rates,
            "finding_phases": finding_phases,
        }
    return stats


def _assign_tiers(theme_stats: dict[str, dict]) -> dict[str, str]:
    """Assign themes to tiers based on average score."""
    ranked = sorted(theme_stats.items(), key=lambda x: -x[1]["avg"])
    tiers = {}
    for theme, s in ranked:
        avg = s["avg"]
        if avg >= 62:
            tiers[theme] = "A"
        elif avg >= 55:
            tiers[theme] = "B"
        elif avg >= 48:
            tiers[theme] = "C"
        else:
            tiers[theme] = "D"
    return tiers


def _print_tier_ranking(theme_stats, finding_ids, scenario):
    """Print themes ranked by score with tier assignments."""
    tiers = _assign_tiers(theme_stats)
    ranked = sorted(theme_stats.items(), key=lambda x: -x[1]["avg"])

    control_avg = theme_stats.get("control", {}).get("avg")
    overall_avg = sum(s["avg"] for s in theme_stats.values()) / len(theme_stats)

    click.echo(f"\n{'=' * 80}")
    click.echo(f"  THEME TIER RANKING — {scenario.id}")
    click.echo(f"  Control: {control_avg:.1f}%  |  Overall mean: {overall_avg:.1f}%  |  Themes: {len(theme_stats)}")
    click.echo(f"{'=' * 80}")

    hdr = f"  {'Tier':<5} {'Theme':<25} {'Avg':>6} {'SD':>6} {'N':>3}  "
    hdr += "  ".join(f"{fid:>4}" for fid in finding_ids)
    click.echo(hdr)
    click.echo(f"  {'-' * (len(hdr) - 2)}")

    current_tier = None
    for theme, s in ranked:
        tier = tiers[theme]
        if tier != current_tier:
            if current_tier is not None:
                click.echo()
            current_tier = tier

        fr = s["finding_rates"]
        row = f"  {tier:<5} {theme:<25} {s['avg']:5.1f}% {s['stdev']:5.1f} {s['n']:3d}  "
        row += "  ".join(f"{fr.get(fid, 0):3.0f}%" for fid in finding_ids)

        # Mark control
        if theme == "control":
            row += "  <-- control"
        click.echo(row)

    click.echo()
    click.echo("  Tier thresholds: A >= 62% | B >= 55% | C >= 48% | D < 48%")
    click.echo()


def _print_finding_rates(theme_stats, finding_ids, scenario):
    """Print per-finding catch rates sorted by difficulty."""
    overall_rates = {}
    for fid in finding_ids:
        all_rates = [s["finding_rates"][fid] for s in theme_stats.values()]
        overall_rates[fid] = sum(all_rates) / len(all_rates)

    click.echo(f"\n{'=' * 80}")
    click.echo("  FINDING CATCH RATES (sorted by difficulty)")
    click.echo(f"{'=' * 80}")

    sorted_findings = sorted(
        scenario.ground_truth, key=lambda gt: -overall_rates.get(gt.id, 0)
    )
    for gt in sorted_findings:
        rate = overall_rates[gt.id]
        bar_len = int(rate / 2)
        bar = "█" * bar_len + "░" * (50 - bar_len)
        click.echo(f"  {gt.id:<4} {bar} {rate:5.1f}%  w={gt.weight}  {gt.title[:50]}")

    click.echo()


def _print_dimension_correlation(theme_stats, scenario):
    """Cross-reference theme dimensions with benchmark scores."""
    from pf.benchmark.aggregator import _default_themes_dir, _load_theme_dimensions

    themes_dir = _default_themes_dir()
    overall_avg = sum(s["avg"] for s in theme_stats.values()) / len(theme_stats)

    # Load dimensions for all tested themes
    dim_values: dict[str, dict[str, list[float]]] = {}
    themes_with_dims = 0
    for theme in theme_stats:
        dims = _load_theme_dimensions(theme, themes_dir)
        if not dims:
            continue
        themes_with_dims += 1
        for k, v in dims.items():
            v_str = str(v)
            dim_values.setdefault(k, {}).setdefault(v_str, []).append(
                theme_stats[theme]["avg"]
            )

    click.echo(f"\n{'=' * 80}")
    click.echo(f"  DIMENSION CORRELATION  (overall mean: {overall_avg:.1f}%, {themes_with_dims} themes with dimensions)")
    click.echo(f"{'=' * 80}")

    for dim in sorted(dim_values.keys()):
        vals = dim_values[dim]
        if len(vals) < 2:
            continue

        click.echo(f"\n  --- {dim.upper()} ---")
        for v, scores in sorted(vals.items(), key=lambda x: -sum(x[1]) / len(x[1])):
            n = len(scores)
            avg = sum(scores) / n
            delta = avg - overall_avg
            marker = " **" if abs(delta) > 5 else ""
            click.echo(
                f"    {v:<22} avg={avg:5.1f}%  delta={delta:+5.1f}  n={n:2d}{marker}"
            )

    click.echo()
    click.echo("  ** = delta > 5 points from overall mean")
    click.echo()


def _print_untested_themes(theme_stats):
    """Show themes that haven't been benchmarked yet."""
    from pf.benchmark.aggregator import _default_themes_dir

    themes_dir = Path(_default_themes_dir())
    if not themes_dir.exists():
        click.echo("  Themes directory not found.", err=True)
        return

    all_themes = sorted(
        f.stem for f in themes_dir.iterdir()
        if f.is_file() and f.suffix == ".yaml" and f.stem != "control"
    )
    tested = set(theme_stats.keys()) - {"control"}
    untested = [t for t in all_themes if t not in tested]

    click.echo(f"\n{'=' * 80}")
    click.echo(f"  UNTESTED THEMES  ({len(untested)} of {len(all_themes)} remaining)")
    click.echo(f"{'=' * 80}")

    # Show in columns
    cols = 4
    for i in range(0, len(untested), cols):
        row = "  ".join(f"{t:<25}" for t in untested[i : i + cols])
        click.echo(f"  {row}")

    click.echo()


# --- JSON data helpers ---

def _tier_data(theme_stats):
    tiers = _assign_tiers(theme_stats)
    ranked = sorted(theme_stats.items(), key=lambda x: -x[1]["avg"])
    return [
        {
            "theme": t,
            "tier": tiers[t],
            "avg": round(s["avg"], 1),
            "stdev": round(s["stdev"], 1),
            "n": s["n"],
        }
        for t, s in ranked
    ]


def _finding_rate_data(theme_stats, finding_ids, scenario):
    result = {}
    for gt in scenario.ground_truth:
        rates = [s["finding_rates"][gt.id] for s in theme_stats.values()]
        result[gt.id] = {
            "title": gt.title,
            "weight": gt.weight,
            "overall_rate": round(sum(rates) / len(rates), 1),
            "by_theme": {
                t: round(s["finding_rates"][gt.id], 1)
                for t, s in theme_stats.items()
            },
        }
    return result


def _dimension_data(theme_stats):
    from pf.benchmark.aggregator import _default_themes_dir, _load_theme_dimensions

    themes_dir = _default_themes_dir()
    overall_avg = sum(s["avg"] for s in theme_stats.values()) / len(theme_stats)

    dim_values: dict[str, dict[str, list[float]]] = {}
    for theme in theme_stats:
        dims = _load_theme_dimensions(theme, themes_dir)
        if not dims:
            continue
        for k, v in dims.items():
            dim_values.setdefault(k, {}).setdefault(str(v), []).append(
                theme_stats[theme]["avg"]
            )

    result = {}
    for dim, vals in sorted(dim_values.items()):
        if len(vals) < 2:
            continue
        result[dim] = {
            v: {
                "avg": round(sum(scores) / len(scores), 1),
                "delta": round(sum(scores) / len(scores) - overall_avg, 1),
                "n": len(scores),
            }
            for v, scores in vals.items()
        }
    return result


def _untested_data(theme_stats):
    from pf.benchmark.aggregator import _default_themes_dir

    themes_dir = Path(_default_themes_dir())
    if not themes_dir.exists():
        return []
    all_themes = sorted(
        f.stem for f in themes_dir.iterdir()
        if f.is_file() and f.suffix == ".yaml" and f.stem != "control"
    )
    tested = set(theme_stats.keys()) - {"control"}
    return [t for t in all_themes if t not in tested]


# ---------------------------------------------------------------------------
# replay subgroup
# ---------------------------------------------------------------------------


@benchmark.group()
def replay():
    """Pipeline replay — re-run TDD pipelines against real code."""
    pass


@replay.command("run")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--theme", default=None, help="Theme name (omit for control/no-persona)")
@click.option("--n", "runs", default=1, type=int, help="Number of runs")
@click.option(
    "--worktree-base",
    default="/tmp/pf-replay",
    type=click.Path(),
    help="Base directory for git worktrees",
)
@click.option(
    "--project-dir",
    default=None,
    type=click.Path(exists=True),
    help="Project with pennyfarthing installed (for prompt extraction)",
)
@click.option(
    "--output-dir",
    default=None,
    type=click.Path(),
    help="Where to store results (default: internal/results/pipeline-replay/)",
)
@click.option("--model", default=None, help="Claude model for pipeline agents")
@click.option("--judge-model", default=None, help="Claude model for scoring judge")
@click.option("--skip-score", is_flag=True, help="Skip judge scoring after run")
@click.option("--keep-worktree", is_flag=True, help="Don't remove worktree after run")
@click.option(
    "--otel-endpoint",
    default=None,
    help="OTEL collector endpoint (auto-detects WheelHub if omitted)",
)
def replay_run(
    scenario_path,
    theme,
    runs,
    worktree_base,
    project_dir,
    output_dir,
    model,
    judge_model,
    skip_score,
    keep_worktree,
    otel_endpoint,
):
    """Run the TDD pipeline against a scenario."""
    from pf.benchmark.pipeline_replay import (
        PipelineScore,
        load_scenario,
        remove_worktree,
        run_pipeline,
        save_result,
        score_with_judge,
    )

    project = Path(project_dir) if project_dir else Path.cwd()
    wt_base = Path(worktree_base)
    out_dir = Path(output_dir) if output_dir else project / "internal" / "results" / "pipeline-replay"

    scenario = load_scenario(scenario_path, project_dir=project)

    tag = theme or "control"
    click.echo(f"=== Pipeline Replay: {scenario.title} ===")
    click.echo(f"  Theme:    {tag}")
    click.echo(f"  Runs:     {runs}")
    click.echo(f"  Commit:   {scenario.base_commit[:12]}")
    click.echo(f"  Phases:   {' → '.join(scenario.phases)}")
    click.echo(f"  Output:   {out_dir}")
    click.echo()

    all_scores: list[PipelineScore] = []

    # Auto-increment: find highest existing run number
    theme_dir = out_dir / scenario.id / tag
    start_id = 1
    if theme_dir.exists():
        existing = [
            int(d.name.split("-")[1])
            for d in theme_dir.iterdir()
            if d.is_dir() and d.name.startswith("run-") and d.name.split("-")[1].isdigit()
        ]
        if existing:
            start_id = max(existing) + 1

    for i, run_id in enumerate(range(start_id, start_id + runs)):
        click.echo(f"--- Run {run_id} ({i + 1}/{runs}) ---")

        result = run_pipeline(
            scenario,
            theme=theme,
            run_id=run_id,
            project_dir=project,
            worktree_base=wt_base,
            model=model,
            otel_endpoint=otel_endpoint,
        )

        # Score
        score = None
        if not skip_score:
            click.echo("  [JUDGE] Scoring against ground truth...")
            score = score_with_judge(
                scenario, result, model=judge_model, project_dir=project
            )
            click.echo(
                f"  [JUDGE] Score: {score.weighted_caught}/{score.total_weight} "
                f"({score.score_pct}%) — {score.total_caught}/{score.total_findings} findings"
            )
            all_scores.append(score)

        # Save
        run_dir = save_result(result, score, out_dir)
        click.echo(f"  Saved to {run_dir}")

        # Cleanup worktree
        if not keep_worktree:
            try:
                remove_worktree(Path(scenario.repo_path), Path(result.worktree_path))
            except Exception:
                click.echo(f"  Warning: could not remove worktree {result.worktree_path}")

        click.echo()

    # Summary
    if all_scores:
        _print_run_summary(scenario, all_scores)

    click.echo("=== Done ===")


@replay.command("score")
@click.argument("result_dir", type=click.Path(exists=True))
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--model", default=None, help="Claude model for judge")
@click.option("--project-dir", default=None, type=click.Path(exists=True))
def replay_score(result_dir, scenario_path, model, project_dir):
    """Re-score an existing pipeline run."""
    from pf.benchmark.pipeline_replay import (
        load_scenario,
        reconstruct_pipeline_result,
        save_result,
        score_with_judge,
    )

    project = Path(project_dir) if project_dir else Path.cwd()
    result_path = Path(result_dir)

    scenario = load_scenario(scenario_path, project_dir=project)

    pipeline_result = reconstruct_pipeline_result(result_path, scenario)
    if pipeline_result is None:
        click.echo(f"Error: pipeline.yaml not found in {result_path}", err=True)
        raise SystemExit(1)

    click.echo("Scoring against ground truth...")
    score = score_with_judge(scenario, pipeline_result, model=model, project_dir=project)

    click.echo(
        f"Score: {score.weighted_caught}/{score.total_weight} "
        f"({score.score_pct}%) — {score.total_caught}/{score.total_findings} findings"
    )

    # Print per-finding results
    for f in score.findings:
        status = "CAUGHT" if f.caught else "MISSED"
        by = f" by {f.caught_by}" if f.caught_by else ""
        click.echo(f"  [{status}] {f.finding_id}: {f.title} ({f.weight}pts){by}")

    # Save updated score
    save_result(pipeline_result, score, result_path.parent.parent.parent)


@replay.command("judge")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option(
    "--results-dir",
    default=None,
    type=click.Path(exists=True),
    help="Base results directory",
)
@click.option("--theme", default=None, help="Only judge this theme (default: all)")
@click.option(
    "--target-judges",
    default=3,
    type=int,
    help="Target total judges per run (including initial score.yaml)",
)
@click.option("--model", default=None, help="Claude model for judge")
@click.option("--project-dir", default=None, type=click.Path(exists=True))
def replay_judge(scenario_path, results_dir, theme, target_judges, model, project_dir):
    """Run additional judge passes and compute majority vote.

    Adds judge_1.yaml, judge_2.yaml, etc. alongside the existing score.yaml,
    then computes a majority_vote.yaml for each run. Does NOT overwrite
    score.yaml.

    \b
    Examples:
        pf benchmark replay judge scenarios/dpgd-116.yaml
        pf benchmark replay judge scenarios/dpgd-116.yaml --theme firefly
        pf benchmark replay judge scenarios/dpgd-116.yaml --target-judges 5
    """
    import signal
    import time

    from pf.benchmark.pipeline_replay import (
        compute_majority_vote,
        get_existing_judge_passes,
        load_scenario,
        run_judge_pass,
    )

    project = Path(project_dir) if project_dir else Path.cwd()
    scenario = load_scenario(scenario_path, project_dir=project)

    base = (
        Path(results_dir)
        if results_dir
        else project / "internal" / "results" / "pipeline-replay"
    )
    scenario_dir = base / scenario.id

    if not scenario_dir.exists():
        click.echo(f"No results found at {scenario_dir}", err=True)
        raise SystemExit(1)

    # Graceful shutdown on Ctrl-C
    shutdown = False

    def _handle_signal(sig, frame):
        nonlocal shutdown
        click.echo("\nShutdown requested, finishing current judge call...")
        shutdown = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # Collect all run dirs
    run_items: list[tuple[str, Path]] = []
    for theme_dir in sorted(scenario_dir.iterdir()):
        if not theme_dir.is_dir() or theme_dir.name.startswith("_"):
            continue
        if theme and theme_dir.name != theme:
            continue
        for run_dir in sorted(theme_dir.iterdir()):
            if run_dir.is_dir() and run_dir.name.startswith("run-"):
                run_items.append((theme_dir.name, run_dir))

    # Sort: control first, then alphabetical
    run_items.sort(key=lambda x: ("" if x[0] == "control" else x[0], x[1].name))

    click.echo(f"=== Multi-Judge: {scenario.id} ===")
    click.echo(f"  Runs:    {len(run_items)}")
    click.echo(f"  Target:  {target_judges} judges per run")
    click.echo()

    judged = 0
    skipped = 0

    for i, (tag, run_dir) in enumerate(run_items):
        if shutdown:
            break

        existing = get_existing_judge_passes(run_dir)
        has_score = (run_dir / "score.yaml").exists()
        current_total = (1 if has_score else 0) + len(existing)
        needed = target_judges - current_total

        if needed <= 0:
            skipped += 1
            continue

        next_pass = max(existing) + 1 if existing else 1
        click.echo(
            f"  [{i + 1}/{len(run_items)}] {tag}/{run_dir.name} "
            f"— {current_total} judges, adding {needed}"
        )

        for p in range(next_pass, next_pass + needed):
            if shutdown:
                break
            start = time.time()
            try:
                result = run_judge_pass(
                    run_dir, scenario, p, model=model, project_dir=project
                )
                elapsed = time.time() - start
                if result:
                    click.echo(f"    Pass {p}: {result['score_pct']}% ({elapsed:.0f}s)")
                    judged += 1
                else:
                    click.echo(f"    Pass {p}: FAILED ({elapsed:.0f}s)")
            except Exception as e:
                click.echo(f"    Pass {p}: ERROR: {e} ({time.time() - start:.0f}s)")

        if not shutdown:
            mv = compute_majority_vote(run_dir, scenario)
            if mv:
                click.echo(
                    f"    Majority vote ({mv['n_judges']}j): {mv['score_pct']}%"
                )

    click.echo()
    click.echo(f"=== Done: {judged} judge passes added, {skipped} runs already at target ===")


@replay.command("compare")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option(
    "--results-dir",
    default=None,
    type=click.Path(exists=True),
    help="Base results directory",
)
def replay_compare(scenario_path, results_dir):
    """Compare pipeline results across themes for a scenario."""
    from pf.benchmark.pipeline_replay import (
        FindingScore,
        PipelineScore,
        build_comparison_summary,
        load_scenario,
    )

    project = Path.cwd()
    scenario = load_scenario(scenario_path, project_dir=project)

    base = Path(results_dir) if results_dir else project / "internal" / "results" / "pipeline-replay"
    scenario_dir = base / scenario.id

    if not scenario_dir.exists():
        click.echo(f"No results found at {scenario_dir}", err=True)
        raise SystemExit(1)

    # Collect all scored runs
    all_scores: list[PipelineScore] = []
    for theme_dir in sorted(scenario_dir.iterdir()):
        if not theme_dir.is_dir() or theme_dir.name.startswith("_"):
            continue
        for run_dir in sorted(theme_dir.iterdir()):
            if not run_dir.is_dir() or not run_dir.name.startswith("run-"):
                continue
            # Prefer majority_vote.yaml over score.yaml
            mv_file = run_dir / "majority_vote.yaml"
            score_file = run_dir / "score.yaml"
            chosen = mv_file if mv_file.exists() else score_file
            if not chosen.exists():
                continue
            score_data = yaml.safe_load(chosen.read_text())
            all_scores.append(
                PipelineScore(
                    scenario_id=score_data["scenario_id"],
                    theme=score_data.get("theme"),
                    run_id=score_data["run_id"],
                    findings=[
                        FindingScore(**f) for f in score_data.get("findings", [])
                    ],
                    total_caught=score_data["total_caught"],
                    total_findings=score_data["total_findings"],
                    weighted_caught=score_data["weighted_caught"],
                    total_weight=score_data["total_weight"],
                    score_pct=score_data["score_pct"],
                )
            )

    if not all_scores:
        click.echo("No scored runs found.", err=True)
        raise SystemExit(1)

    # Print detection heatmap
    _print_heatmap(scenario, all_scores)

    # Save comparison
    summary_path = build_comparison_summary(scenario, all_scores, base)
    click.echo(f"\nSaved comparison to {summary_path}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _print_run_summary(scenario, scores):
    """Print a summary table after all runs."""
    click.echo("=== Summary ===")
    click.echo(f"  Runs: {len(scores)}")

    mean_pct = sum(s.score_pct for s in scores) / len(scores)
    mean_caught = sum(s.total_caught for s in scores) / len(scores)
    click.echo(f"  Mean score: {mean_pct:.1f}%")
    click.echo(f"  Mean findings caught: {mean_caught:.1f}/{scores[0].total_findings}")

    # Per-finding detection rate
    click.echo("\n  Finding detection rates:")
    for gt in scenario.ground_truth:
        caught_count = sum(
            1
            for s in scores
            for f in s.findings
            if f.finding_id == gt.id and f.caught
        )
        rate = caught_count / len(scores) * 100
        click.echo(f"    {gt.id}: {caught_count}/{len(scores)} ({rate:.0f}%) — {gt.title}")

    # Phase attribution breakdown
    phase_catches: dict[str, dict[str, int]] = {}
    for phase in scenario.phases:
        phase_catches[phase] = {}
    for s in scores:
        for f in s.findings:
            if f.caught and f.caught_by:
                phase_catches.setdefault(f.caught_by, {})
                phase_catches[f.caught_by][f.finding_id] = (
                    phase_catches[f.caught_by].get(f.finding_id, 0) + 1
                )

    click.echo("\n  Phase attribution:")
    for phase in scenario.phases:
        findings = phase_catches.get(phase, {})
        total = sum(findings.values())
        detail = ", ".join(
            f"{fid}({c}/{len(scores)})"
            for fid, c in sorted(findings.items())
        )
        click.echo(f"    {phase:10s}: {total:2d} catches — {detail if detail else 'none'}")


def _print_heatmap(scenario, scores):
    """Print a detection heatmap across themes."""
    # Group scores by theme
    themes: dict[str, list] = {}
    for s in scores:
        tag = s.theme or "control"
        themes.setdefault(tag, []).append(s)

    theme_names = sorted(themes.keys())

    # Header
    col_w = max(len(t) for t in theme_names) + 2
    header = "Finding".ljust(45) + "".join(t.center(col_w) for t in theme_names)
    click.echo(header)
    click.echo("-" * len(header))

    for gt in scenario.ground_truth:
        row = f"{gt.id} {gt.title[:38]}".ljust(45)
        for theme in theme_names:
            theme_scores = themes[theme]
            # For each theme, show which phase caught it (majority vote)
            caught_by_counts: dict[str, int] = {}
            missed = 0
            for s in theme_scores:
                finding = next((f for f in s.findings if f.finding_id == gt.id), None)
                if finding and finding.caught and finding.caught_by:
                    caught_by_counts[finding.caught_by] = (
                        caught_by_counts.get(finding.caught_by, 0) + 1
                    )
                else:
                    missed += 1

            if caught_by_counts:
                best = max(caught_by_counts, key=caught_by_counts.get)
                count = caught_by_counts[best]
                cell = f"{best}({count}/{len(theme_scores)})"
            else:
                cell = "—"
            row += cell.center(col_w)
        click.echo(row)

    # Totals
    click.echo("-" * len(header))
    totals_row = "TOTAL".ljust(45)
    for theme in theme_names:
        theme_scores = themes[theme]
        mean_caught = sum(s.total_caught for s in theme_scores) / len(theme_scores)
        mean_pct = sum(s.score_pct for s in theme_scores) / len(theme_scores)
        totals_row += f"{mean_caught:.1f} ({mean_pct:.0f}%)".center(col_w)
    click.echo(totals_row)
