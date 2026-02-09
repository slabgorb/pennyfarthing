"""
Core health score analysis engine.

Aggregates lightweight dimension scores into a composite 0-100 score.
Supports caching with a configurable TTL (default 5 minutes).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from pathlib import Path

from pennyfarthing_scripts.healthscore.models import (
    DEFAULT_WEIGHTS,
    DimensionScore,
    HealthscoreResult,
)


async def analyze_healthscore(
    target_path: Path,
    weights: dict[str, float] | None = None,
    cache_ttl: int = 300,
) -> HealthscoreResult:
    """Analyze codebase health across all dimensions.

    Args:
        target_path: Directory to analyze.
        weights: Custom dimension weights (must sum to 1.0). Uses defaults if None.
        cache_ttl: Cache time-to-live in seconds (default 300 = 5 minutes).

    Returns:
        HealthscoreResult with composite score and per-dimension breakdown.
    """
    w = weights if weights is not None else DEFAULT_WEIGHTS
    resolved = target_path.resolve()

    cache_dir = get_cache_path(resolved)
    any_cached = False
    raw_scores: dict[str, float | None] = {}
    dimensions: list[DimensionScore] = []

    # Separate cached vs uncached dimensions
    uncached_dims: list[str] = []
    for dim_name in w:
        if cache_ttl > 0:
            cached = read_cached_score(cache_dir, dim_name, cache_ttl)
            if cached is not None:
                raw_scores[dim_name] = cached
                any_cached = True
                continue
        uncached_dims.append(dim_name)

    # Run all uncached probes concurrently
    if uncached_dims:
        probe_results = await asyncio.gather(
            *(_probe_dimension(name, resolved) for name in uncached_dims)
        )
        for dim_name, score in zip(uncached_dims, probe_results):
            raw_scores[dim_name] = score
            if score is not None and cache_ttl > 0:
                cache_dir.mkdir(parents=True, exist_ok=True)
                write_cached_score(cache_dir, dim_name, score)

    # Build dimension list in original weight order
    for dim_name, dim_weight in w.items():
        score = raw_scores.get(dim_name)
        error = f"{dim_name} not available" if score is None else None
        dimensions.append(DimensionScore(
            name=dim_name,
            score=score,
            weight=dim_weight,
            error=error,
        ))

    composite = compute_composite_score(raw_scores, w)

    return HealthscoreResult(
        success=True,
        composite_score=composite,
        target_path=str(resolved),
        dimensions=dimensions,
        cached=any_cached,
    )


async def _probe_dimension(name: str, target_path: Path) -> float | None:
    """Run a lightweight probe for a single dimension.

    Returns a score 0-100 or None if the dimension cannot be assessed.
    Wires into existing analyzer modules where available.
    """
    try:
        probes = {
            "churn": _probe_churn,
            "todo_density": _probe_todo_density,
            "complexity": _probe_complexity,
            "dead_code": _probe_dead_code,
            "dependency_freshness": _probe_dependency_freshness,
        }
        probe_fn = probes.get(name)
        if probe_fn is None:
            return None
        return await probe_fn(target_path)
    except Exception:
        return None


async def _probe_churn(target_path: Path) -> float | None:
    """Score based on average hotspot score — lower churn is better."""
    from pennyfarthing_scripts.hotspots.analyze import analyze_repo

    result = await analyze_repo("project", target_path, days=90)
    if not result.success or not result.file_hotspots:
        return None
    # hotspot_score is 0-100 where higher = more churn (worse)
    # Take top 20 files, average their scores, invert for health
    top = sorted(result.file_hotspots, key=lambda h: h.hotspot_score, reverse=True)[:20]
    avg_hotspot = sum(h.hotspot_score for h in top) / len(top)
    return max(0.0, min(100.0, 100.0 - avg_hotspot))


async def _probe_todo_density(target_path: Path) -> float | None:
    """Score based on TODO/FIXME marker count."""
    from pennyfarthing_scripts.codemarkers.analyze import analyze_repo

    result = await analyze_repo("project", target_path)
    if not result.success or not result.summary:
        return None
    total = result.summary.total_markers
    # Heuristic: diminishing penalty curve
    # <10 = great (90+), 10-50 = good (60-90), 50-200 = moderate (30-60), 200+ = poor
    if total <= 10:
        return 95.0
    elif total <= 50:
        return 90.0 - (total - 10) * (30.0 / 40.0)
    elif total <= 200:
        return 60.0 - (total - 50) * (30.0 / 150.0)
    elif total <= 1000:
        return 30.0 - (total - 200) * (25.0 / 800.0)
    else:
        return max(0.0, 5.0 - (total - 1000) * 0.005)


async def _probe_complexity(target_path: Path) -> float | None:
    """Score based on average cyclomatic complexity."""
    from pennyfarthing_scripts.complexity.analyze import analyze_complexity

    result = await analyze_complexity(target_path)
    if not result.success or not result.files:
        return None
    files_with_fns = [f for f in result.files if f.function_count > 0]
    if not files_with_fns:
        return None
    avg = sum(f.avg_cyclomatic_complexity for f in files_with_fns) / len(files_with_fns)
    # Heuristic: avg 1-2 = excellent (90+), 3-5 = good (70-90), 5-10 = moderate (40-70), 10+ = poor
    if avg <= 2.0:
        return 95.0
    elif avg <= 5.0:
        return 90.0 - (avg - 2.0) * (20.0 / 3.0)
    elif avg <= 10.0:
        return 70.0 - (avg - 5.0) * (30.0 / 5.0)
    else:
        return max(0.0, 40.0 - (avg - 10.0) * 4.0)


async def _probe_dead_code(target_path: Path) -> float | None:
    """Score based on unused export count."""
    from pennyfarthing_scripts.deadcode.analyze import find_unused_exports

    result = await find_unused_exports(target_path)
    if not result.success:
        return None
    count = len(result.unused_exports)
    # Heuristic: 0 = perfect, each unused export deducts ~2 points
    return max(0.0, 100.0 - count * 2.0)


async def _probe_dependency_freshness(target_path: Path) -> float | None:
    """Score based on outdated dependency count."""
    from pennyfarthing_scripts.dependencies.analyze import analyze_dependencies

    result = await analyze_dependencies(target_path)
    if not result.success:
        return None
    outdated = len(result.outdated)
    advisories = len(result.advisories)
    # Each outdated package deducts 5 points, each advisory deducts 15
    return max(0.0, 100.0 - outdated * 5.0 - advisories * 15.0)


def compute_composite_score(
    dimension_scores: dict[str, float | None],
    weights: dict[str, float],
) -> float:
    """Compute weighted average from dimension scores.

    Dimensions with None scores are excluded and remaining weights
    are renormalized.

    Args:
        dimension_scores: Map of dimension name to score (0-100 or None).
        weights: Map of dimension name to weight.

    Returns:
        Composite score 0-100.
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for name, score in dimension_scores.items():
        if score is not None:
            w = weights.get(name, 0.0)
            weighted_sum += score * w
            total_weight += w

    if total_weight == 0.0:
        return 0.0

    return weighted_sum / total_weight


def get_cache_path(target_path: Path) -> Path:
    """Return the cache directory for a given target path."""
    path_hash = hashlib.md5(str(target_path).encode()).hexdigest()[:12]
    return target_path / ".pennyfarthing" / ".cache" / "healthscore" / path_hash


def read_cached_score(cache_dir: Path, dimension: str, ttl: int) -> float | None:
    """Read a cached dimension score if still valid.

    Returns None if cache miss or expired.
    """
    cache_file = cache_dir / f"{dimension}.json"
    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    ts = data.get("timestamp", 0)
    if ttl <= 0 or (time.time() - ts) > ttl:
        return None

    return data.get("score")


def write_cached_score(cache_dir: Path, dimension: str, score: float) -> None:
    """Write a dimension score to cache."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{dimension}.json"
    data = {"score": score, "timestamp": time.time()}
    cache_file.write_text(json.dumps(data))
