"""Benchmark CLI commands.

Usage:
    pf benchmark replay run <scenario.yaml> --theme firefly [--n 1]
    pf benchmark replay score <result-dir>
    pf benchmark replay compare <scenario.yaml>

Must be run from a regular terminal (not inside Claude Code).

Extension discovery:
    Projects can register additional benchmark commands by placing Python files
    in `.pennyfarthing/extensions/benchmark/`. Each file must define a
    `register(parent)` function that adds Click commands to the parent group.
"""

from __future__ import annotations

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
@click.option("--judge-model", default="claude-sonnet-4-6", help="Claude model for scoring judge")
@click.option("--judge-count", default=3, type=int, help="Number of independent judge passes (default: 3)")
@click.option("--skip-score", is_flag=True, help="Skip judge scoring after run")
@click.option("--keep-worktree", is_flag=True, help="Don't remove worktree after run")
@click.option("--pipeline", "pipeline_name", default="default", help="Pipeline variant: 'default' (PF) or 'bmad'")
@click.option("--bmad-root", default=None, type=click.Path(exists=True), help="Path to BMAD-METHOD repo (required for --pipeline bmad)")
def replay_run(
    scenario_path,
    theme,
    runs,
    worktree_base,
    project_dir,
    output_dir,
    model,
    judge_model,
    judge_count,
    skip_score,
    keep_worktree,
    pipeline_name,
    bmad_root,
):
    """Run the TDD pipeline against a scenario."""
    from pf.benchmark.pipeline_replay import (
        PipelineScore,
        compute_majority_vote,
        load_scenario,
        remove_worktree,
        run_judge_pass,
        run_pipeline,
        save_result,
        score_with_judge,
    )

    project = Path(project_dir) if project_dir else Path.cwd()
    wt_base = Path(worktree_base)
    out_dir = (
        Path(output_dir) if output_dir else project / "internal" / "results" / "pipeline-replay"
    )

    scenario = load_scenario(scenario_path, project_dir=project)

    # Build pipeline config if non-default
    pipe_config = None
    if pipeline_name != "default":
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        bmad_path = Path(bmad_root) if bmad_root else None
        pipe_config = get_pipeline_config(pipeline_name, bmad_root=bmad_path)

    tag = pipe_config.result_subdir if pipe_config else (theme or "control")
    phases = pipe_config.phases if pipe_config else scenario.phases
    click.echo(f"=== Pipeline Replay: {scenario.title} ===")
    click.echo(f"  Pipeline: {pipeline_name}")
    click.echo(f"  Theme:    {tag}")
    click.echo(f"  Runs:     {runs}")
    click.echo(f"  Commit:   {scenario.base_commit[:12]}")
    click.echo(f"  Phases:   {' → '.join(phases)}")
    click.echo(f"  Judge:    {judge_model or 'default'} × {judge_count}")
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
            output_dir=out_dir,
            model=model,
            pipeline_config=pipe_config,
        )

        # Score — first judge pass (saved as score.yaml)
        score = None
        if not skip_score:
            click.echo(f"  [JUDGE 1/{judge_count}] Scoring against ground truth ({judge_model or 'default'})...")
            score = score_with_judge(
                scenario, result, model=judge_model, project_dir=project
            )
            click.echo(
                f"  [JUDGE 1/{judge_count}] Score: {score.weighted_caught}/{score.total_weight} "
                f"({score.score_pct}%) — {score.total_caught}/{score.total_findings} findings"
            )
            all_scores.append(score)

        # Save pipeline result + score.yaml
        run_dir = save_result(result, score, out_dir)
        click.echo(f"  Saved to {run_dir}")

        # Additional judge passes (judge_1.yaml, judge_2.yaml, ...)
        if not skip_score and judge_count > 1:
            for pass_num in range(1, judge_count):
                click.echo(f"  [JUDGE {pass_num + 1}/{judge_count}] Additional judge pass...")
                try:
                    jresult = run_judge_pass(
                        run_dir, scenario, pass_num,
                        model=judge_model, project_dir=project,
                    )
                    if jresult:
                        click.echo(
                            f"  [JUDGE {pass_num + 1}/{judge_count}] Score: "
                            f"{jresult['weighted_caught']}/{jresult['total_weight']} "
                            f"({jresult['score_pct']}%)"
                        )
                    else:
                        click.echo(f"  [JUDGE {pass_num + 1}/{judge_count}] Failed to score")
                except Exception as e:
                    click.echo(f"  [JUDGE {pass_num + 1}/{judge_count}] ERROR: {e}")

            # Compute majority vote
            mv = compute_majority_vote(run_dir, scenario)
            if mv:
                click.echo(
                    f"  [MAJORITY] {mv['n_judges']}j vote: {mv['score_pct']}%"
                )

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
        Path(results_dir) if results_dir else project / "internal" / "results" / "pipeline-replay"
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
                result = run_judge_pass(run_dir, scenario, p, model=model, project_dir=project)
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
                click.echo(f"    Majority vote ({mv['n_judges']}j): {mv['score_pct']}%")

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

    base = (
        Path(results_dir) if results_dir else project / "internal" / "results" / "pipeline-replay"
    )
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
                    findings=[FindingScore(**f) for f in score_data.get("findings", [])],
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
            1 for s in scores for f in s.findings if f.finding_id == gt.id and f.caught
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
        detail = ", ".join(f"{fid}({c}/{len(scores)})" for fid, c in sorted(findings.items()))
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
