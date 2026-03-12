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
@click.option(
    "--max-rework-cycles",
    default=0,
    type=click.IntRange(0, 2),
    help="Max reviewer kick-back cycles (0=disabled, max 2)",
)
@click.option(
    "--bmad-root",
    default=None,
    type=click.Path(exists=True),
    help="Path to BMAD-METHOD repo (uses BMAD adapter instead of PF agents)",
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
    judge_count,
    skip_score,
    keep_worktree,
    max_rework_cycles,
    bmad_root,
):
    """Run the TDD pipeline against a scenario."""
    from pf.benchmark.pipeline_replay import (
        PipelineScore,
        compute_majority_vote,
        compute_run_dir,
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
    bmad = Path(bmad_root) if bmad_root else None

    # Auto-set theme to "bmad" when using BMAD adapter
    if bmad and not theme:
        theme = "bmad"

    scenario = load_scenario(scenario_path, project_dir=project)

    tag = theme or "control"
    pipeline_label = "BMAD" if bmad else "PF"
    click.echo(f"=== Pipeline Replay ({pipeline_label}): {scenario.title} ===")
    click.echo(f"  Theme:    {tag}")
    click.echo(f"  Runs:     {runs}")
    click.echo(f"  Commit:   {scenario.base_commit[:12]}")
    click.echo(f"  Phases:   {' → '.join(scenario.phases)}")
    click.echo(f"  Judge:    {judge_model or 'default'} × {judge_count}")
    click.echo(f"  Rework:   {max_rework_cycles} max cycles")
    click.echo(f"  Output:   {out_dir}")
    click.echo()

    all_scores: list[PipelineScore] = []

    # Auto-increment: find highest existing run number
    theme_dir = compute_run_dir(out_dir, scenario.id, tag, 0).parent
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
            max_rework_cycles=max_rework_cycles,
            bmad_root=bmad,
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
        run_dir = save_result(result, score, out_dir, project_dir=project, bmad_root=bmad)
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
    save_result(pipeline_result, score, result_path.parent.parent.parent, project_dir=project)


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
@click.option(
    "--group-by",
    "group_by",
    default=None,
    type=click.Choice(["framework_version"]),
    help="Group results by framework_version instead of theme",
)
def replay_compare(scenario_path, results_dir, group_by):
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

    # Collect all scored runs (with version metadata)
    all_scores: list[PipelineScore] = []
    score_versions: dict[int, str] = {}  # run_id -> version tag
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

            # Extract version tag for grouping
            fw = score_data.get("framework_version") or {}
            version_tag = fw.get("tag") or fw.get("commit") or "unknown"

            # Infer run_id and theme from directory path when missing
            run_id = score_data.get("run_id")
            if run_id is None:
                run_name = run_dir.name  # e.g. "run-3"
                run_id = int(run_name.split("-")[1]) if run_name.startswith("run-") else 0
            theme = score_data.get("theme", theme_dir.name if theme_dir.name != "control" else None)

            # Use a unique key combining theme + run_id
            key = hash((theme, run_id))
            score_versions[key] = version_tag

            all_scores.append(
                PipelineScore(
                    scenario_id=score_data.get("scenario_id", scenario.id),
                    theme=theme,
                    run_id=run_id,
                    findings=[
                        FindingScore(**{k: v for k, v in f.items() if k in FindingScore.__dataclass_fields__})
                        for f in score_data.get("findings", [])
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

    if group_by == "framework_version":
        _print_version_summary(all_scores, score_versions)
    else:
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


@replay.command("phase")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--run", "run_num", required=True, type=int, help="Run number to replay against")
@click.option("--phase", "phase_name", required=True, help="Phase to re-run (e.g. reviewer, tea, dev)")
@click.option("--keep-worktree", is_flag=True, help="Don't remove worktree after run")
@click.option("--rejudge", is_flag=True, help="Re-judge using the new phase output")
@click.option("--model", default=None, help="Claude model for the phase agent")
@click.option("--judge-model", default="claude-sonnet-4-6", help="Claude model for scoring judge")
@click.option("--judge-count", default=3, type=int, help="Number of judge passes (default: 3)")
@click.option(
    "--theme", default=None,
    help="Theme tag for result lookup (default: control)",
)
@click.option(
    "--results-dir", default=None, type=click.Path(exists=True),
    help="Base results directory",
)
@click.option(
    "--worktree-base", default="/tmp/pf-replay", type=click.Path(),
    help="Base directory for git worktrees",
)
@click.option(
    "--project-dir", default=None, type=click.Path(exists=True),
    help="Project with pennyfarthing installed",
)
@click.option(
    "--output-dir", default=None, type=click.Path(),
    help="Where results are stored (default: internal/results/pipeline-replay/)",
)
def replay_phase(
    scenario_path, run_num, phase_name, keep_worktree, rejudge,
    model, judge_model, judge_count, theme, results_dir,
    worktree_base, project_dir, output_dir,
):
    """Re-run a single phase against an existing run's state.

    Useful for testing agent changes without re-running the full pipeline.
    For example, re-run just the reviewer after fixing a rubber-stamp gate.

    \b
    Examples:
        pf benchmark replay phase scenarios/dpgd-116.yaml --run 19 --phase reviewer
        pf benchmark replay phase scenarios/dpgd-116.yaml --run 19 --phase reviewer --rejudge
        pf benchmark replay phase scenarios/dpgd-116.yaml --run 19 --phase reviewer --keep-worktree
    """
    from pf.benchmark.pipeline_replay import (
        compute_run_dir,
        load_scenario,
        run_phase_replay,
    )

    project = Path(project_dir) if project_dir else Path.cwd()
    wt_base = Path(worktree_base)
    out_dir = (
        Path(output_dir) if output_dir else project / "internal" / "results" / "pipeline-replay"
    )
    base_results = Path(results_dir) if results_dir else out_dir

    scenario = load_scenario(scenario_path, project_dir=project)
    tag = theme or "control"

    run_dir = compute_run_dir(base_results, scenario.id, tag, run_num)
    if not run_dir.exists():
        click.echo(f"Error: run directory not found: {run_dir}", err=True)
        raise SystemExit(1)

    if phase_name not in scenario.phases:
        click.echo(
            f"Error: phase '{phase_name}' not in scenario phases: {scenario.phases}",
            err=True,
        )
        raise SystemExit(1)

    click.echo(f"=== Phase Replay: {scenario.id} / run-{run_num} / {phase_name} ===")
    click.echo(f"  Run dir:  {run_dir}")
    click.echo(f"  Phase:    {phase_name}")
    click.echo(f"  Rejudge:  {'yes' if rejudge else 'no'}")
    click.echo()

    result = run_phase_replay(
        scenario,
        run_dir,
        phase_name,
        project_dir=project,
        worktree_base=wt_base,
        model=model,
        keep_worktree=keep_worktree,
        rejudge=rejudge,
        judge_model=judge_model,
        judge_count=judge_count,
    )

    click.echo()
    click.echo(f"=== Phase replay complete (retry {result['retry_num']}) ===")
    if "majority_vote" in result:
        mv = result["majority_vote"]
        click.echo(f"  Score: {mv['weighted_caught']}/{mv['total_weight']} ({mv['score_pct']}%)")
    elif "scores" in result and result["scores"]:
        sc = result["scores"][0]
        click.echo(f"  Score: {sc['weighted_caught']}/{sc['total_weight']} ({sc['score_pct']}%)")


@replay.command("narrate")
@click.argument("run_dir", type=click.Path(exists=True))
@click.option("--yes", "skip_confirm", is_flag=True, help="Skip cost confirmation")
@click.option("--force", is_flag=True, help="Regenerate even if cached")
@click.option("--finding", default=None, help="Focus on a specific finding ID")
@click.option("--model", default=None, help="Claude model (default: claude-sonnet-4-6)")
def replay_narrate(run_dir, skip_confirm, force, finding, model):
    """Generate an LLM-narrated trace of a pipeline run.

    Produces a narrative.md file explaining what the agent did, what it
    missed, and why. Costs ~$0.50 per narration.

    \b
    Examples:
        pf benchmark replay narrate runs/run-1 --yes
        pf benchmark replay narrate runs/run-1 --finding I3
        pf benchmark replay narrate runs/run-1 --force --yes
    """
    from pf.benchmark.narrate import generate_narrative

    run_path = Path(run_dir)

    # Load scenario metadata from pipeline.yaml if available
    pipeline_file = run_path / "pipeline.yaml"
    scenario_id = "unknown"
    title = "Pipeline Run"
    phases = ["tea", "dev", "reviewer"]
    if pipeline_file.exists():
        pipeline_data = yaml.safe_load(pipeline_file.read_text())
        scenario_id = pipeline_data.get("scenario_id", scenario_id)
        if "phases" in pipeline_data and isinstance(pipeline_data["phases"], dict):
            phases = list(pipeline_data["phases"].keys())

    # Check cache first
    narrative_path = run_path / "narrative.md"
    if narrative_path.exists() and not force:
        click.echo(f"Cached narrative found: {narrative_path}")
        click.echo(narrative_path.read_text())
        return

    # Cost warning
    click.echo("Narration costs ~$0.50 per run (LLM call).", err=True)
    if not skip_confirm:
        if not click.confirm("Proceed?"):
            return

    click.echo(f"Generating narrative for {run_path.name}...")
    result_path = generate_narrative(
        run_path,
        scenario_id,
        phases,
        title,
        model=model,
        finding_id=finding,
        force=force,
        project_dir=Path.cwd(),
    )
    click.echo(f"Narrative saved to {result_path}")


@replay.command("backfill-versions")
@click.option(
    "--results-dir",
    default=None,
    type=click.Path(exists=True),
    help="Base results directory",
)
@click.option("--tag", default="baseline-pre-edge-hunter", help="Human label for backfilled runs")
@click.option("--dry-run", is_flag=True, help="Show what would be changed without writing")
def replay_backfill_versions(results_dir, tag, dry_run):
    """Backfill framework_version into existing pipeline.yaml and majority_vote.yaml files."""
    project = Path.cwd()
    base = (
        Path(results_dir) if results_dir else project / "internal" / "results" / "pipeline-replay"
    )

    if not base.exists():
        click.echo(f"Results directory not found: {base}", err=True)
        raise SystemExit(1)

    from pf import __version__

    default_version = {
        "commit": "pre-edge-hunter",
        "semver": __version__,
        "tag": tag,
        "agent_hashes": {},
    }

    updated = 0
    skipped = 0

    for yaml_file in sorted(base.rglob("pipeline.yaml")):
        data = yaml.safe_load(yaml_file.read_text())
        if data.get("framework_version"):
            skipped += 1
            continue
        if dry_run:
            click.echo(f"  Would backfill: {yaml_file}")
        else:
            data["framework_version"] = default_version
            yaml_file.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
            click.echo(f"  Backfilled: {yaml_file}")
        updated += 1

    for yaml_file in sorted(base.rglob("majority_vote.yaml")):
        data = yaml.safe_load(yaml_file.read_text())
        if data.get("framework_version"):
            skipped += 1
            continue
        if dry_run:
            click.echo(f"  Would backfill: {yaml_file}")
        else:
            data["framework_version"] = default_version
            yaml_file.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
            click.echo(f"  Backfilled: {yaml_file}")
        updated += 1

    action = "Would update" if dry_run else "Updated"
    click.echo(f"\n{action} {updated} files, skipped {skipped} (already tagged)")


def _print_version_summary(scores, score_versions):
    """Print a summary table grouped by framework version."""
    import statistics

    # Group scores by version tag
    groups: dict[str, list] = {}
    for s in scores:
        key = hash((s.theme, s.run_id))
        version = score_versions.get(key, "unknown")
        groups.setdefault(version, []).append(s)

    click.echo(f"{'Framework Version':<25} | {'Runs':>5} | {'Median':>7} | {'Mean':>7} | {'StdDev':>7}")
    click.echo("-" * 65)
    for version in sorted(groups.keys()):
        runs = groups[version]
        pcts = [s.score_pct for s in runs]
        median = statistics.median(pcts)
        mean = statistics.mean(pcts)
        stdev = statistics.stdev(pcts) if len(pcts) > 1 else 0.0
        click.echo(
            f"{version:<25} | {len(runs):>5} | {median:>6.1f}% | {mean:>6.1f}% | {stdev:>6.1f}"
        )
