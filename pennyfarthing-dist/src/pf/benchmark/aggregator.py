"""Job-Fair Aggregator Module (ported from TypeScript).

Aggregates job-fair results across multiple themes into unified benchmark
statistics with historical trend tracking and dimension-based analysis.

Original: packages/core/src/benchmark/job-fair-aggregator.ts
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


@dataclass
class Performer:
    character: str
    theme: str
    score: float


@dataclass
class RoleStats:
    mean_score: float
    std_dev: float
    baseline_comparison: float | None
    top_performers: list[Performer]


@dataclass
class OverallChampion:
    character: str
    theme: str
    avg_score: float


@dataclass
class TrendPoint:
    date: str
    mean: float
    variance: float
    role: str | None = None


@dataclass
class AggregateStats:
    themes_included: list[str]
    last_updated: str
    by_role: dict[str, RoleStats]
    overall_champions: list[OverallChampion]
    historical_trend: list[TrendPoint]


@dataclass
class DimensionValueStats:
    value: str
    themes: list[str]
    sample_size: int
    by_role: dict[str, dict[str, float]]
    overall_mean: float


@dataclass
class DimensionComparison:
    dimension: str
    value_a: str
    value_b: str
    delta: float
    significance: str
    by_role: dict[str, dict[str, Any]]


@dataclass
class DimensionStats:
    dimension: str
    last_updated: str
    values: list[DimensionValueStats]
    comparisons: list[DimensionComparison]


def calculate_std_dev(values: list[float], mean: float) -> float:
    """Calculate population standard deviation."""
    if len(values) <= 1:
        return 0
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return math.sqrt(variance)


def _parse_directory_name(dir_name: str) -> tuple[str, str] | None:
    match = re.match(r'^(.+)-(\d{8}(?:T\d{6}Z?|-\d{6})?)$', dir_name)
    if not match:
        return None
    return match.group(1), match.group(2)


def _get_latest_run_per_theme(results_dir: str) -> dict[str, str]:
    p = Path(results_dir)
    if not p.exists():
        return {}
    theme_latest: dict[str, tuple[str, str]] = {}
    for entry in p.iterdir():
        if not entry.is_dir():
            continue
        parsed = _parse_directory_name(entry.name)
        if not parsed:
            continue
        theme, ts = parsed
        existing = theme_latest.get(theme)
        if not existing or ts > existing[0]:
            theme_latest[theme] = (ts, entry.name)
    return {theme: info[1] for theme, info in theme_latest.items()}


def _parse_summary_yaml(file_path: str, theme_name: str) -> dict[str, Any] | None:
    try:
        content = Path(file_path).read_text()
        data = yaml.safe_load(content)
        if not data:
            return None
        theme = (data.get("meta") or {}).get("theme") or data.get("theme") or theme_name
        timestamp = (data.get("meta") or {}).get("timestamp") or data.get("timestamp") or datetime.now(timezone.utc).isoformat()
        scores: list[dict[str, Any]] = []
        matrix = data.get("matrix")
        if matrix:
            if isinstance(matrix, dict) and "rows" in matrix and isinstance(matrix["rows"], list):
                roles = ["dev", "reviewer", "tea", "sm"]
                for row in matrix["rows"]:
                    for role in roles:
                        score = row.get(role)
                        if isinstance(score, (int, float)):
                            scores.append({"character": row["character"], "role": role, "score": float(score)})
            elif isinstance(matrix, dict):
                for char, role_scores in matrix.items():
                    if char in ("headers", "rows"):
                        continue
                    if isinstance(role_scores, dict):
                        for role, score in role_scores.items():
                            if isinstance(score, (int, float)):
                                scores.append({"character": char, "role": role, "score": float(score)})
        if not scores:
            rr = data.get("role_rankings")
            if rr:
                for role, rankings in rr.items():
                    for entry in rankings:
                        scores.append({"character": entry["character"], "role": role, "score": entry["score"]})
        return {"theme": theme, "timestamp": timestamp, "champions": data.get("champions", {}), "scores": scores}
    except Exception:
        return None


def aggregate_job_fair_results(results_dir: str) -> AggregateStats:
    """Aggregate job-fair results from all themes."""
    latest_runs = _get_latest_run_per_theme(results_dir)
    all_results: list[dict[str, Any]] = []
    for theme, dir_name in latest_runs.items():
        summary_path = os.path.join(results_dir, dir_name, "summary.yaml")
        if not os.path.exists(summary_path):
            continue
        result = _parse_summary_yaml(summary_path, theme)
        if result and result["scores"]:
            all_results.append(result)

    scores_by_role: dict[str, list[dict[str, Any]]] = {}
    for result in all_results:
        for s in result["scores"]:
            scores_by_role.setdefault(s["role"], []).append(
                {"character": s["character"], "theme": result["theme"], "score": s["score"]}
            )

    all_scores = [e["score"] for entries in scores_by_role.values() for e in entries]
    overall_mean = sum(all_scores) / len(all_scores) if all_scores else 0

    by_role: dict[str, RoleStats] = {}
    for role, entries in scores_by_role.items():
        scores = [e["score"] for e in entries]
        mean = sum(scores) / len(scores)
        std_dev = calculate_std_dev(scores, mean)
        sorted_entries = sorted(entries, key=lambda e: e["score"], reverse=True)
        by_role[role] = RoleStats(
            mean_score=mean,
            std_dev=std_dev,
            baseline_comparison=mean - overall_mean,
            top_performers=[Performer(character=e["character"], theme=e["theme"], score=e["score"]) for e in sorted_entries[:5]],
        )

    char_avgs: dict[str, dict[str, Any]] = {}
    for result in all_results:
        for s in result["scores"]:
            key = f"{s['character']}|{result['theme']}"
            char_avgs.setdefault(key, {"theme": result["theme"], "scores": []})["scores"].append(s["score"])

    overall_champions = sorted(
        [OverallChampion(character=k.split("|")[0], theme=v["theme"], avg_score=sum(v["scores"]) / len(v["scores"])) for k, v in char_avgs.items()],
        key=lambda c: c.avg_score, reverse=True,
    )[:10]

    historical_trend = _load_historical_trend(results_dir)
    return AggregateStats(
        themes_included=[r["theme"] for r in all_results],
        last_updated=datetime.now(timezone.utc).isoformat(),
        by_role=by_role,
        overall_champions=overall_champions,
        historical_trend=historical_trend,
    )


def get_baseline_comparison(role: str, results_dir: str) -> float | None:
    stats = aggregate_job_fair_results(results_dir)
    rs = stats.by_role.get(role)
    return rs.baseline_comparison if rs else None


def get_role_statistics(role: str, results_dir: str) -> RoleStats:
    stats = aggregate_job_fair_results(results_dir)
    return stats.by_role.get(role, RoleStats(mean_score=0, std_dev=0, baseline_comparison=None, top_performers=[]))


def get_top_performers(role: str, limit: int, results_dir: str) -> list[Performer]:
    stats = aggregate_job_fair_results(results_dir)
    rs = stats.by_role.get(role)
    if not rs:
        return []
    return rs.top_performers[:limit]


def _load_historical_trend(results_dir: str) -> list[TrendPoint]:
    history_path = os.path.join(results_dir, "aggregate", "history.yaml")
    if not os.path.exists(history_path):
        return []
    try:
        data = yaml.safe_load(Path(history_path).read_text())
        return [TrendPoint(date=s["date"], mean=s["mean"], variance=s["variance"], role=s.get("role")) for s in (data or {}).get("snapshots", [])]
    except Exception:
        return []


def get_historical_trend(role: str | None, results_dir: str) -> list[TrendPoint]:
    trend = _load_historical_trend(results_dir)
    if not role:
        return trend
    return [p for p in trend if not p.role or p.role == role]


def save_historical_snapshot(results_dir: str) -> None:
    stats = aggregate_job_fair_results(results_dir)
    role_means = [rs.mean_score for rs in stats.by_role.values()]
    overall_mean = sum(role_means) / len(role_means) if role_means else 0
    overall_variance = sum((m - overall_mean) ** 2 for m in role_means) / len(role_means) if len(role_means) > 1 else 0

    new_point = {"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "mean": overall_mean, "variance": overall_variance}

    existing = _load_historical_trend(results_dir)
    snapshots = [{"date": t.date, "mean": t.mean, "variance": t.variance} for t in existing]
    snapshots.append(new_point)

    agg_dir = Path(results_dir) / "aggregate"
    agg_dir.mkdir(parents=True, exist_ok=True)
    (agg_dir / "history.yaml").write_text(yaml.dump({"snapshots": snapshots}))


def _load_theme_dimensions(theme_name: str, themes_dir: str) -> dict[str, str] | None:
    theme_path = os.path.join(themes_dir, f"{theme_name}.yaml")
    if not os.path.exists(theme_path):
        return None
    try:
        data = yaml.safe_load(Path(theme_path).read_text())
        return (data or {}).get("theme", {}).get("dimensions")
    except Exception:
        return None


def _default_themes_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", "..", "personas", "themes")


def aggregate_by_dimension(dimension: str, results_dir: str, themes_dir: str | None = None) -> DimensionStats:
    themes_dir = themes_dir or _default_themes_dir()
    latest_runs = _get_latest_run_per_theme(results_dir)

    themes_by_value: dict[str, list[str]] = {}
    for theme in latest_runs:
        dims = _load_theme_dimensions(theme, themes_dir)
        if not dims:
            continue
        val = dims.get(dimension)
        if not val:
            continue
        themes_by_value.setdefault(val, []).append(theme)

    theme_scores: dict[str, list[dict[str, Any]]] = {}
    for theme, dir_name in latest_runs.items():
        summary_path = os.path.join(results_dir, dir_name, "summary.yaml")
        if not os.path.exists(summary_path):
            continue
        result = _parse_summary_yaml(summary_path, theme)
        if result and result["scores"]:
            theme_scores[theme] = [{"role": s["role"], "score": s["score"]} for s in result["scores"]]

    values: list[DimensionValueStats] = []
    for value, themes in themes_by_value.items():
        role_scores: dict[str, list[float]] = {}
        total_scores: list[float] = []
        for theme in themes:
            for s in theme_scores.get(theme, []):
                role_scores.setdefault(s["role"], []).append(s["score"])
                total_scores.append(s["score"])
        by_role: dict[str, dict[str, float]] = {}
        for role, scores in role_scores.items():
            mean = sum(scores) / len(scores)
            by_role[role] = {"mean_score": mean, "std_dev": calculate_std_dev(scores, mean), "n": float(len(scores))}
        overall_mean = sum(total_scores) / len(total_scores) if total_scores else 0
        values.append(DimensionValueStats(value=value, themes=themes, sample_size=len(total_scores), by_role=by_role, overall_mean=overall_mean))

    comparisons: list[DimensionComparison] = []
    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            a, b = values[i], values[j]
            delta = a.overall_mean - b.overall_mean
            comparisons.append(DimensionComparison(
                dimension=dimension, value_a=a.value, value_b=b.value,
                delta=delta, significance="not_significant", by_role={},
            ))

    return DimensionStats(dimension=dimension, last_updated=datetime.now(timezone.utc).isoformat(), values=values, comparisons=comparisons)


def get_dimension_values(dimension: str, themes_dir: str | None = None) -> list[dict[str, Any]]:
    themes_dir = themes_dir or _default_themes_dir()
    p = Path(themes_dir)
    if not p.exists():
        return []
    counts: dict[str, int] = {}
    for f in p.iterdir():
        if not f.is_file() or not f.name.endswith(".yaml"):
            continue
        dims = _load_theme_dimensions(f.stem, themes_dir)
        if dims and dims.get(dimension):
            val = dims[dimension]
            counts[val] = counts.get(val, 0) + 1
    return sorted([{"value": v, "theme_count": c} for v, c in counts.items()], key=lambda x: x["theme_count"], reverse=True)


def generate_differential_report(dimension: str, results_dir: str, themes_dir: str | None = None) -> str:
    stats = aggregate_by_dimension(dimension, results_dir, themes_dir)
    lines = [f"# Differential Report: {dimension}", "", f"Generated: {stats.last_updated}", "", "## Summary by Value", ""]
    sorted_values = sorted(stats.values, key=lambda v: v.overall_mean, reverse=True)
    for v in sorted_values:
        lines.append(f"### {v.value}")
        lines.append(f"- Themes: {len(v.themes)} ({', '.join(v.themes)})")
        lines.append(f"- Sample size: {v.sample_size}")
        lines.append(f"- Overall mean: {v.overall_mean:.2f}")
        lines.append("")
        lines.append("| Role | Mean | Std Dev | N |")
        lines.append("|------|------|---------|---|")
        for role, rs in v.by_role.items():
            lines.append(f"| {role} | {rs['mean_score']:.2f} | {rs['std_dev']:.2f} | {int(rs['n'])} |")
        lines.append("")
    lines.append("## Pairwise Comparisons")
    lines.append("")
    for comp in stats.comparisons:
        direction = ">" if comp.delta > 0 else "<" if comp.delta < 0 else "="
        lines.append(f"### {comp.value_a} {direction} {comp.value_b}")
        lines.append(f"- Delta: {'+' if comp.delta > 0 else ''}{comp.delta:.2f} ({comp.significance})")
        lines.append("")
    return "\n".join(lines)
