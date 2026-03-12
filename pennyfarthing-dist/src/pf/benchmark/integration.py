"""Benchmark Integration Module (ported from TypeScript).

Correlates OCEAN personality profiles with benchmark performance data.

Original: packages/core/src/benchmark/benchmark-integration.ts
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class OceanScores:
    O: int  # noqa: E741 — OCEAN personality model standard abbreviation
    C: int
    E: int
    A: int
    N: int


@dataclass
class BenchmarkResult:
    theme: str
    role: str
    character: str
    scenario: str
    mean: float
    std_dev: float
    delta: float
    n: int
    scores: list[float]
    ocean: OceanScores
    face: str
    benchmark_missing: bool = False
    cohens_d: float | None = None


@dataclass
class CorrelationEffect:
    effect: float
    direction: str


@dataclass
class CorrelationResult:
    O: CorrelationEffect  # noqa: E741
    C: CorrelationEffect
    E: CorrelationEffect
    A: CorrelationEffect
    N: CorrelationEffect
    strongest: dict[str, Any]


@dataclass
class OptimalProfile:
    ocean: OceanScores
    reasoning: str


@dataclass
class RoleRecommendations:
    role: str
    top_themes: list[dict[str, Any]]
    avoid_themes: list[dict[str, Any]]
    insight: str


@dataclass
class PerformerResult:
    theme: str
    character: str
    score: float
    delta: float
    ocean: OceanScores
    face: str


@dataclass
class ErrorTypeCell:
    correlation: float
    arrow: str


@dataclass
class OceanErrorCorrelation:
    matrix: dict[str, dict[str, ErrorTypeCell]]
    strongest: dict[str, Any]


VALID_ROLES = [
    "orchestrator",
    "sm",
    "tea",
    "dev",
    "reviewer",
    "architect",
    "pm",
    "tech-writer",
    "ux-designer",
    "devops",
    "ba",
]

VALID_DIMENSIONS = ["O", "C", "E", "A", "N"]

_ERROR_TYPES = ["reasoning", "planning", "execution"]


def _project_root() -> str:
    d = os.path.dirname(__file__)
    for _ in range(10):
        if os.path.exists(os.path.join(d, "pennyfarthing-dist")) or os.path.exists(
            os.path.join(d, ".pennyfarthing")
        ):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return os.path.dirname(__file__)


def _benchmarks_dir() -> str:
    root = _project_root()
    env = os.environ.get("BENCHMARK_PATH")
    if env:
        return os.path.join(env, "benchmarks")
    return os.path.join(root, "packages", "benchmark", "results", "benchmarks")


def _themes_dir() -> str:
    return os.path.join(_project_root(), "pennyfarthing-dist", "personas", "themes")


def _get_character_info(theme: str, role: str) -> dict[str, Any] | None:
    path = os.path.join(_themes_dir(), f"{theme}.yaml")
    if not os.path.exists(path):
        return None
    try:
        data = yaml.safe_load(Path(path).read_text())
        agents = (data or {}).get("agents", {})
        agent = agents.get(role)
        if not agent:
            return None
        ocean = agent.get("ocean")
        if not ocean:
            return None
        return {
            "character": agent.get("character", role),
            "ocean": OceanScores(
                O=ocean["O"], C=ocean["C"], E=ocean["E"], A=ocean["A"], N=ocean["N"]
            ),
        }
    except Exception:
        return None


def _load_benchmark_summary(scenario: str, theme: str, role: str) -> dict[str, Any] | None:
    path = os.path.join(_benchmarks_dir(), scenario, f"{theme}-{role}", "summary.yaml")
    if not os.path.exists(path):
        return None
    try:
        data = yaml.safe_load(Path(path).read_text())
        stats = data.get("statistics", {})
        baseline = data.get("baseline_comparison", {})
        delta_str = str(baseline.get("delta", 0)).replace("+", "") if baseline else "0"
        return {
            "mean": float(stats.get("mean", 0)),
            "std_dev": float(stats.get("std_dev", 0)),
            "delta": float(delta_str),
            "n": int(stats.get("n", 0)),
            "scores": stats.get("scores", []),
        }
    except Exception:
        return None


def _get_available_scenarios() -> list[str]:
    bd = _benchmarks_dir()
    if not os.path.exists(bd):
        return []
    return [
        f for f in os.listdir(bd) if not f.startswith(".") and os.path.isdir(os.path.join(bd, f))
    ]


def _get_benchmarked_themes(scenario: str, role: str) -> list[str]:
    sp = os.path.join(_benchmarks_dir(), scenario)
    if not os.path.exists(sp):
        return []
    suffix = f"-{role}"
    return [d.replace(suffix, "") for d in os.listdir(sp) if d.endswith(suffix)]


def _calc_dimension_effect(results: list[BenchmarkResult], dim: str) -> CorrelationEffect:
    if len(results) < 2:
        return CorrelationEffect(effect=0, direction="none")
    low = [r for r in results if getattr(r.ocean, dim) <= 2]
    high = [r for r in results if getattr(r.ocean, dim) >= 4]
    if not low or not high:
        return CorrelationEffect(effect=0, direction="none")
    low_mean = sum(r.mean for r in low) / len(low)
    high_mean = sum(r.mean for r in high) / len(high)
    effect = round(abs(high_mean - low_mean), 2)
    direction = (
        "positive" if high_mean > low_mean else "negative" if high_mean < low_mean else "none"
    )
    return CorrelationEffect(effect=effect, direction=direction)


def load_benchmark_data(scenario: str, role: str) -> list[BenchmarkResult]:
    themes = _get_benchmarked_themes(scenario, role)
    results: list[BenchmarkResult] = []
    for theme in themes:
        bm = _load_benchmark_summary(scenario, theme, role)
        ci = _get_character_info(theme, role)
        if bm and ci:
            results.append(
                BenchmarkResult(
                    theme=theme,
                    role=role,
                    character=ci["character"],
                    scenario=scenario,
                    mean=bm["mean"],
                    std_dev=bm["std_dev"],
                    delta=bm["delta"],
                    n=bm["n"],
                    scores=bm["scores"],
                    ocean=ci["ocean"],
                    face=f"by-theme/{theme}/{role}.svg",
                )
            )
    return sorted(results, key=lambda r: r.mean, reverse=True)


def get_benchmark_with_face(theme: str, role: str, scenario: str) -> BenchmarkResult | None:
    bm = _load_benchmark_summary(scenario, theme, role)
    ci = _get_character_info(theme, role)
    if not bm and ci:
        return BenchmarkResult(
            theme=theme,
            role=role,
            character=ci["character"],
            scenario=scenario,
            mean=0,
            std_dev=0,
            delta=0,
            n=0,
            scores=[],
            ocean=ci["ocean"],
            face=f"by-theme/{theme}/{role}.svg",
            benchmark_missing=True,
        )
    if not bm or not ci:
        return None
    return BenchmarkResult(
        theme=theme,
        role=role,
        character=ci["character"],
        scenario=scenario,
        mean=bm["mean"],
        std_dev=bm["std_dev"],
        delta=bm["delta"],
        n=bm["n"],
        scores=bm["scores"],
        ocean=ci["ocean"],
        face=f"by-theme/{theme}/{role}.svg",
    )


def calculate_ocean_correlation(scenario: str, role: str) -> CorrelationResult:
    results = load_benchmark_data(scenario, role)
    effects = {d: _calc_dimension_effect(results, d) for d in VALID_DIMENSIONS}
    max_dim = max(VALID_DIMENSIONS, key=lambda d: effects[d].effect)
    return CorrelationResult(
        O=effects["O"],
        C=effects["C"],
        E=effects["E"],
        A=effects["A"],
        N=effects["N"],
        strongest={"dimension": max_dim, "effect": effects[max_dim].effect},
    )


def generate_correlation_report(scenario: str, role: str) -> str:
    corr = calculate_ocean_correlation(scenario, role)
    results = load_benchmark_data(scenario, role)
    md = f"# OCEAN Correlation Report: {role} on {scenario}\n\n"
    md += "## Dimension Effects\n\n| Dimension | Effect | Direction |\n|-----------|--------|----------|\n"
    for d in VALID_DIMENSIONS:
        e = getattr(corr, d)
        md += f"| {d} | {e.effect:.2f} | {e.direction} |\n"
    md += f"\n## Strongest Correlation\n\n**{corr.strongest['dimension']}** ({corr.strongest['effect']:.2f} points)\n"
    if results:
        md += "\n## Top Performers\n\n"
        for r in results[:3]:
            md += f"- **{r.character}** ({r.theme}): {r.mean} pts\n"
    return md


def get_optimal_profile(role: str) -> OptimalProfile:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Valid roles are: {', '.join(VALID_ROLES)}")
    scenarios = _get_available_scenarios()
    all_results: list[BenchmarkResult] = []
    for s in scenarios:
        all_results.extend(load_benchmark_data(s, role))
    if not all_results:
        return OptimalProfile(
            ocean=OceanScores(O=3, C=3, E=3, A=3, N=3),
            reasoning=f"No benchmark data available for {role} role. Returning balanced profile.",
        )
    all_results.sort(key=lambda r: r.mean, reverse=True)
    top_count = max(1, len(all_results) // 4)
    top = all_results[:top_count]
    avg = OceanScores(
        O=round(sum(r.ocean.O for r in top) / len(top)),
        C=round(sum(r.ocean.C for r in top) / len(top)),
        E=round(sum(r.ocean.E for r in top) / len(top)),
        A=round(sum(r.ocean.A for r in top) / len(top)),
        N=round(sum(r.ocean.N for r in top) / len(top)),
    )
    names = ", ".join(r.character for r in top[:3])
    return OptimalProfile(ocean=avg, reasoning=f"Based on {top_count} top performers ({names}).")


def get_role_recommendations(role: str) -> RoleRecommendations:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Valid roles are: {', '.join(VALID_ROLES)}")
    scenarios = _get_available_scenarios()
    all_results: list[BenchmarkResult] = []
    for s in scenarios:
        all_results.extend(load_benchmark_data(s, role))
    if not all_results:
        return RoleRecommendations(
            role=role,
            top_themes=[],
            avoid_themes=[],
            insight=f"No benchmark data available for {role} role.",
        )
    all_results.sort(key=lambda r: r.mean, reverse=True)
    top = [
        {"theme": r.theme, "character": r.character, "score": r.mean, "ocean": r.ocean}
        for r in all_results[:3]
    ]
    avoid = [
        {"theme": r.theme, "character": r.character, "score": r.mean} for r in all_results[-3:]
    ]
    insight = f"For {role} role: "
    if top:
        insight += (
            f"Top performer: {top[0]['character']} ({top[0]['theme']}) at {top[0]['score']} pts."
        )
    return RoleRecommendations(role=role, top_themes=top, avoid_themes=avoid, insight=insight)


def find_top_performers(
    scenario: str | None = None,
    role: str | None = None,
    ocean_filter: str | None = None,
    limit: int | None = None,
    min_score: float | None = None,
) -> list[PerformerResult]:
    if not scenario or not role:
        return []
    results = load_benchmark_data(scenario, role)
    if ocean_filter:
        f = parse_ocean_filter(ocean_filter)
        results = [r for r in results if _matches_filter(r.ocean, f)]
    if min_score is not None:
        results = [r for r in results if r.mean >= min_score]
    performers = [
        PerformerResult(
            theme=r.theme,
            character=r.character,
            score=r.mean,
            delta=r.delta,
            ocean=r.ocean,
            face=r.face,
        )
        for r in results
    ]
    if limit and limit > 0:
        performers = performers[:limit]
    return performers


def query_benchmarks(
    scenario: str | None = None,
    role: str | None = None,
    ocean_filter: str | None = None,
    limit: int | None = None,
    sort_by: str = "score",
) -> list[PerformerResult]:
    if not scenario or not role:
        return []
    results = load_benchmark_data(scenario, role)
    if ocean_filter:
        f = parse_ocean_filter(ocean_filter)
        results = [r for r in results if _matches_filter(r.ocean, f)]
    performers = [
        PerformerResult(
            theme=r.theme,
            character=r.character,
            score=r.mean,
            delta=r.delta,
            ocean=r.ocean,
            face=r.face,
        )
        for r in results
    ]
    if sort_by == "delta":
        performers.sort(key=lambda p: p.delta, reverse=True)
    elif sort_by == "name":
        performers.sort(key=lambda p: p.theme)
    if limit and limit > 0:
        performers = performers[:limit]
    return performers


def _get_arrow(correlation: float) -> str:
    if correlation >= 0.3:
        return "↑"
    if correlation <= -0.3:
        return "↓"
    return "→"


def calculate_error_type_correlation(
    results: list[dict[str, Any]],
    judge_scores: list[dict[str, Any]],
) -> OceanErrorCorrelation:
    matrix: dict[str, dict[str, ErrorTypeCell]] = {}
    for dim in VALID_DIMENSIONS:
        matrix[dim] = {}
        for err in _ERROR_TYPES:
            matrix[dim][err] = ErrorTypeCell(correlation=0, arrow="→")

    if len(results) >= 2 and len(judge_scores) >= 1:
        min_len = min(len(results), len(judge_scores))
        for dim in VALID_DIMENSIONS:
            for err in _ERROR_TYPES:
                pairs_low: list[float] = []
                pairs_high: list[float] = []
                for i in range(min_len):
                    r = results[i]
                    j = judge_scores[i]
                    ocean = r.get("ocean")
                    det = j.get("detection_by_type")
                    if ocean and det:
                        val = (
                            ocean.get(dim, 3) if isinstance(ocean, dict) else getattr(ocean, dim, 3)
                        )
                        if val <= 2:
                            pairs_low.append(det.get(err, 0))
                        elif val >= 4:
                            pairs_high.append(det.get(err, 0))
                if pairs_low and pairs_high:
                    low_mean = sum(pairs_low) / len(pairs_low)
                    high_mean = sum(pairs_high) / len(pairs_high)
                    corr = round(high_mean - low_mean, 2)
                    matrix[dim][err] = ErrorTypeCell(correlation=corr, arrow=_get_arrow(corr))

    strongest = {"dimension": "O", "errorType": "reasoning", "correlation": 0}
    for dim in VALID_DIMENSIONS:
        for err in _ERROR_TYPES:
            if abs(matrix[dim][err].correlation) > abs(strongest["correlation"]):
                strongest = {
                    "dimension": dim,
                    "errorType": err,
                    "correlation": matrix[dim][err].correlation,
                }
    return OceanErrorCorrelation(matrix=matrix, strongest=strongest)


def generate_ocean_error_heat_map(correlation: OceanErrorCorrelation) -> str:
    labels = {
        "O": "O (Open)",
        "C": "C (Consc)",
        "E": "E (Extra)",
        "A": "A (Agree)",
        "N": "N (Neuro)",
    }
    md = "## OCEAN × Error-Type Correlation\n\n"
    md += "|           | Reasoning | Planning | Execution |\n|-----------|-----------|----------|----------|\n"
    for dim in VALID_DIMENSIONS:
        row = correlation.matrix[dim]
        md += f"| {labels[dim]} | {row['reasoning'].arrow} {row['reasoning'].correlation:.2f} | {row['planning'].arrow} {row['planning'].correlation:.2f} | {row['execution'].arrow} {row['execution'].correlation:.2f} |\n"
    md += "\nLegend: ↑ positive (≥0.3), ↓ negative (≤-0.3), → neutral\n"
    if correlation.strongest["correlation"] != 0:
        md += f"\n**Strongest:** {correlation.strongest['dimension']} × {correlation.strongest['errorType']} ({_get_arrow(correlation.strongest['correlation'])} {correlation.strongest['correlation']:.2f})\n"
    return md


def parse_ocean_filter(expr: str) -> dict[str, Any]:
    match = re.match(r"^([OCEAN])(>=|<=|=|>|<)(\d+)$", expr)
    if not match:
        dim_match = re.match(r"^([A-Z])", expr)
        if dim_match and dim_match.group(1) not in VALID_DIMENSIONS:
            raise ValueError(f"Invalid OCEAN dimension: {dim_match.group(1)}")
        raise ValueError(f"Invalid OCEAN filter format: {expr}")
    return {"dimension": match.group(1), "operator": match.group(2), "value": int(match.group(3))}


def _matches_filter(ocean: OceanScores, f: dict[str, Any]) -> bool:
    score = getattr(ocean, f["dimension"])
    op = f["operator"]
    val = f["value"]
    if op == ">=":
        return score >= val
    if op == "<=":
        return score <= val
    if op == "=":
        return score == val
    if op == ">":
        return score > val
    if op == "<":
        return score < val
    return False
