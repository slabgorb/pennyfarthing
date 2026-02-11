"""
Core health score analysis engine.

Aggregates lightweight dimension scores into a composite 0-100 score.
Supports caching with a configurable TTL (default 5 minutes).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from datetime import UTC
from pathlib import Path

from pennyfarthing_scripts.healthscore.models import (
    DEFAULT_WEIGHTS,
    DimensionScore,
    HealthscoreResult,
)

logger = logging.getLogger("healthscore")


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
    logger.info("[healthscore] Starting analysis for %s", resolved)
    logger.info("[healthscore] Dimensions: %s", list(w.keys()))

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
                logger.info("[healthscore] %s: cached score = %.1f", dim_name, cached)
                raw_scores[dim_name] = cached
                any_cached = True
                continue
        uncached_dims.append(dim_name)

    logger.info("[healthscore] Uncached dimensions to probe: %s", uncached_dims)

    # Run all uncached probes concurrently
    if uncached_dims:
        probe_results = await asyncio.gather(
            *(_probe_dimension(name, resolved) for name in uncached_dims)
        )
        for dim_name, score in zip(uncached_dims, probe_results, strict=False):
            raw_scores[dim_name] = score
            logger.info("[healthscore] %s: probed score = %s", dim_name, score)
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
    logger.info("[healthscore] Composite score: %.1f", composite)

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
            "deprecation_debt": _probe_deprecation_debt,
            "test_gaps": _probe_test_gaps,
            "agent_context_efficiency": _probe_agent_context_efficiency,
        }
        probe_fn = probes.get(name)
        if probe_fn is None:
            logger.warning("[healthscore] No probe registered for dimension: %s", name)
            return None
        logger.info("[healthscore] Running probe: %s", name)
        result = await probe_fn(target_path)
        logger.info("[healthscore] Probe %s returned: %s", name, result)
        return result
    except Exception as exc:
        logger.error("[healthscore] Probe %s failed: %s", name, exc, exc_info=True)
        return None


async def _probe_churn(target_path: Path) -> float | None:
    """Score based on code churn — uses PyDriller for smart file filtering.

    Falls back to existing hotspots analyzer if PyDriller is unavailable.
    """
    try:
        return await _probe_churn_pydriller(target_path)
    except ImportError:
        logger.info("[healthscore:churn] PyDriller not available, falling back to hotspots")
        return await _probe_churn_fallback(target_path)


async def _probe_churn_pydriller(target_path: Path) -> float | None:
    """PyDriller-based churn: counts changes per file with noise filtering."""
    from datetime import datetime, timedelta

    from pydriller import Repository

    # Files that churn naturally but aren't code quality signals
    noise_patterns = {
        "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
        "tsconfig.json", "pyproject.toml", ".gitignore",
    }
    noise_exts = {
        ".md", ".yaml", ".yml", ".json", ".lock", ".toml",
        ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot",
        ".d.ts", ".snap", ".map",
    }
    noise_dirs = {
        "node_modules", "dist", "build", ".git", "sprint", ".session",
        "docs", ".github", "coverage", "__pycache__",
    }
    code_exts = {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"}

    since = datetime.now(UTC) - timedelta(days=90)
    file_changes: dict[str, int] = {}

    # PyDriller is sync — run in executor to avoid blocking
    def _collect():
        repo = Repository(str(target_path), since=since)
        for commit in repo.traverse_commits():
            for mod in commit.modified_files:
                fpath = mod.new_path or mod.old_path
                if not fpath:
                    continue
                # Skip noise files
                fname = fpath.split("/")[-1]
                if fname in noise_patterns:
                    continue
                ext = "." + fname.rsplit(".", 1)[-1] if "." in fname else ""
                if ext.lower() in noise_exts:
                    continue
                # Skip noise directories
                if any(d in fpath.split("/") for d in noise_dirs):
                    continue
                # Only count source code files
                if ext.lower() not in code_exts:
                    continue

                file_changes[fpath] = file_changes.get(fpath, 0) + 1
        return file_changes

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _collect)

    if not file_changes:
        logger.info("[healthscore:churn] No code file changes in 90 days")
        return 100.0  # No churn = perfect score

    # Score based on top-20 most-churned files
    sorted_files = sorted(file_changes.items(), key=lambda x: x[1], reverse=True)
    top20 = sorted_files[:20]
    max_changes = top20[0][1] if top20 else 1

    # Normalize: files with many changes score higher (worse churn)
    # Score each file 0-100 based on its change count relative to max
    churn_scores = [(changes / max_changes) * 100.0 for _, changes in top20]
    avg_churn = sum(churn_scores) / len(churn_scores)

    # Invert: high churn = low health score
    score = max(0.0, min(100.0, 100.0 - avg_churn))

    logger.info("[healthscore:churn] PyDriller: %d code files changed, top=%s(%d), avg_churn=%.1f, score=%.1f",
                len(file_changes), top20[0][0] if top20 else "?", max_changes, avg_churn, score)
    for f, c in top20[:5]:
        logger.info("[healthscore:churn]   %s: %d changes", f, c)
    return score


async def _probe_churn_fallback(target_path: Path) -> float | None:
    """Fallback churn probe using existing hotspots analyzer."""
    from pennyfarthing_scripts.hotspots.analyze import analyze_repo

    result = await analyze_repo("project", target_path, days=90)
    if not result.success or not result.file_hotspots:
        logger.info("[healthscore:churn] No hotspot data (success=%s, count=%s)",
                     result.success, len(result.file_hotspots) if result.file_hotspots else 0)
        return None
    top = sorted(result.file_hotspots, key=lambda h: h.hotspot_score, reverse=True)[:20]
    avg_hotspot = sum(h.hotspot_score for h in top) / len(top)
    score = max(0.0, min(100.0, 100.0 - avg_hotspot))
    logger.info("[healthscore:churn] fallback: top20 avg=%.1f, score=%.1f", avg_hotspot, score)
    return score


async def _probe_todo_density(target_path: Path) -> float | None:
    """Score based on TODO/FIXME marker count."""
    from pennyfarthing_scripts.codemarkers.analyze import analyze_repo

    result = await analyze_repo("project", target_path)
    if not result.success or not result.summary:
        logger.info("[healthscore:todo_density] No marker data (success=%s)", result.success)
        return None
    total = result.summary.total_markers
    logger.info("[healthscore:todo_density] Found %d markers", total)
    if total <= 10:
        score = 95.0
    elif total <= 50:
        score = 90.0 - (total - 10) * (30.0 / 40.0)
    elif total <= 200:
        score = 60.0 - (total - 50) * (30.0 / 150.0)
    elif total <= 1000:
        score = 30.0 - (total - 200) * (25.0 / 800.0)
    else:
        score = max(0.0, 5.0 - (total - 1000) * 0.005)
    logger.info("[healthscore:todo_density] total=%d, score=%.1f", total, score)
    return score


async def _probe_complexity(target_path: Path) -> float | None:
    """Score based on average cyclomatic complexity."""
    from pennyfarthing_scripts.complexity.analyze import analyze_complexity

    result = await analyze_complexity(target_path)
    if not result.success or not result.files:
        logger.info("[healthscore:complexity] No complexity data (success=%s)", result.success)
        return None
    files_with_fns = [f for f in result.files if f.function_count > 0]
    if not files_with_fns:
        logger.info("[healthscore:complexity] No files with functions found")
        return None
    avg = sum(f.avg_cyclomatic_complexity for f in files_with_fns) / len(files_with_fns)
    if avg <= 2.0:
        score = 95.0
    elif avg <= 5.0:
        score = 90.0 - (avg - 2.0) * (20.0 / 3.0)
    elif avg <= 10.0:
        score = 70.0 - (avg - 5.0) * (30.0 / 5.0)
    else:
        score = max(0.0, 40.0 - (avg - 10.0) * 4.0)
    logger.info("[healthscore:complexity] avg=%.2f, files=%d, score=%.1f", avg, len(files_with_fns), score)
    return score


async def _probe_dead_code(target_path: Path) -> float | None:
    """Score based on unused export count."""
    from pennyfarthing_scripts.deadcode.analyze import find_unused_exports

    result = await find_unused_exports(target_path)
    if not result.success:
        logger.info("[healthscore:dead_code] Analysis failed")
        return None
    count = len(result.unused_exports)
    score = max(0.0, 100.0 - count * 2.0)
    logger.info("[healthscore:dead_code] unused_exports=%d, score=%.1f", count, score)
    return score


async def _probe_dependency_freshness(target_path: Path) -> float | None:
    """Score based on outdated dependency count."""
    from pennyfarthing_scripts.dependencies.analyze import analyze_dependencies

    result = await analyze_dependencies(target_path)
    if not result.success:
        logger.info("[healthscore:dependency_freshness] Analysis failed")
        return None
    outdated = len(result.outdated)
    advisories = len(result.advisories)
    score = max(0.0, 100.0 - outdated * 5.0 - advisories * 15.0)
    logger.info("[healthscore:dependency_freshness] outdated=%d, advisories=%d, score=%.1f",
                outdated, advisories, score)
    return score


async def _probe_deprecation_debt(target_path: Path) -> float | None:
    """Score based on @deprecated symbol count and active callers."""
    from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

    result = await analyze_deprecations(target_path)
    if not result.get("success"):
        logger.info("[healthscore:deprecation_debt] Analysis failed: %s", result.get("error"))
        return None
    summary = result.get("summary", {})
    total = summary.get("total_deprecations", 0)
    with_callers = summary.get("deprecations_with_callers", 0)
    # Heuristic: each deprecated symbol deducts 5 points,
    # each one still actively called deducts an extra 10
    score = max(0.0, 100.0 - total * 5.0 - with_callers * 10.0)
    logger.info("[healthscore:deprecation_debt] total=%d, with_callers=%d, score=%.1f",
                total, with_callers, score)
    return score


async def _probe_test_gaps(target_path: Path) -> float | None:
    """Score based on ratio of testable source files with corresponding test files.

    Uses directory-aware matching: for a source file like src/api/health-score.ts,
    checks for tests/api/health-score.test.ts, src/api/__tests__/health-score.test.ts,
    test_health_score.py, etc. Also filters out non-testable files (configs, types, index
    re-exports) to avoid inflating the denominator.
    """
    logger.info("[healthscore:test_gaps] Scanning %s", target_path)

    exclude_dirs = {"node_modules", "dist", "build", ".git", "__pycache__", ".cache",
                    ".pennyfarthing", "coverage", ".next", ".venv", "venv", ".session",
                    "sprint", "docs"}
    source_exts = {".ts", ".tsx", ".js", ".jsx", ".py"}
    # Files that don't need dedicated tests
    non_testable_stems = {"index", "types", "constants", "config", "__init__",
                          "cli", "__main__", "main", "preload", "vite-env"}
    non_testable_patterns = {".d.ts", ".config.ts", ".config.js", "vite.config",
                             "tailwind.config", "postcss.config", "jest.config",
                             "vitest.config", "tsconfig"}

    # Collect source files as (stem_lower, rel_path) and test files as set of stem variants
    source_files: list[tuple[str, str]] = []
    # test_stems: set of lowered stems stripped of test prefixes/suffixes
    test_stems: set[str] = set()
    # test_relpaths: full relative paths of test files for directory matching
    test_relpaths: set[str] = set()

    for file_path in target_path.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in source_exts:
            continue

        parts = file_path.relative_to(target_path).parts
        if any(p in exclude_dirs for p in parts):
            continue

        rel = str(file_path.relative_to(target_path))
        fname = file_path.name.lower()
        stem = file_path.stem.lower()
        # Strip double extensions: foo.test.ts -> stem is "foo.test"
        if "." in stem:
            base_stem = stem.split(".")[0]
        else:
            base_stem = stem

        is_test = (
            fname.startswith("test_")
            or ".test." in fname
            or ".spec." in fname
            or fname.endswith("_test.py")
            or "__tests__" in rel
            or "/tests/" in rel
            or "/test/" in rel
            or rel.startswith("tests/")
            or rel.startswith("test/")
        )

        if is_test:
            # Extract the tested module stem from test file name
            # test_foo.py -> foo, foo.test.ts -> foo, foo.spec.tsx -> foo, foo_test.py -> foo
            tested = base_stem
            if tested.startswith("test_"):
                tested = tested[5:]
            elif tested.startswith("test"):
                tested = tested[4:]
            if tested.endswith("_test"):
                tested = tested[:-5]
            if tested:
                test_stems.add(tested)
            test_relpaths.add(rel.lower())
        else:
            # Filter out non-testable files
            if base_stem in non_testable_stems:
                continue
            if any(p in fname for p in non_testable_patterns):
                continue
            source_files.append((base_stem, rel))

    if not source_files:
        logger.info("[healthscore:test_gaps] No testable source files found")
        return None

    covered = 0
    uncovered_samples: list[str] = []
    for src_stem, src_rel in source_files:
        # Strategy 1: Direct stem match in test_stems set
        if src_stem in test_stems:
            covered += 1
            continue

        # Strategy 2: Hyphenated/underscored variants (health-score -> health_score)
        normalized = src_stem.replace("-", "_")
        if normalized in test_stems or normalized.replace("_", "-") in test_stems:
            covered += 1
            continue

        # Strategy 3: Directory-aware — check if test file exists at parallel path
        # src/api/health-score.ts -> tests/api/health-score.test.ts
        src_lower = src_rel.lower()
        src_dir = "/".join(src_lower.split("/")[:-1])
        matched = False
        for variant in [
            f"{src_dir}/{src_stem}.test.",
            f"{src_dir}/{src_stem}.spec.",
            f"{src_dir}/__tests__/{src_stem}.",
        ]:
            if any(variant in tp for tp in test_relpaths):
                matched = True
                break
        # Also check tests/ mirror: src/api/foo.ts -> tests/api/foo.test.ts
        if not matched and src_dir:
            for prefix in ["tests/", "test/"]:
                for variant in [
                    f"{prefix}{src_dir}/{src_stem}.test.",
                    f"{prefix}{src_dir}/{src_stem}.spec.",
                    f"{prefix}{src_dir}/test_{src_stem}.",
                ]:
                    if any(variant in tp for tp in test_relpaths):
                        matched = True
                        break
                if matched:
                    break

        if matched:
            covered += 1
        else:
            if len(uncovered_samples) < 10:
                uncovered_samples.append(src_rel)

    ratio = covered / len(source_files)
    if ratio >= 0.8:
        score = 90.0 + (ratio - 0.8) * 50.0
    elif ratio >= 0.5:
        score = 60.0 + (ratio - 0.5) * 100.0
    elif ratio >= 0.2:
        score = 30.0 + (ratio - 0.2) * 100.0
    else:
        score = max(5.0, ratio * 150.0)

    score = max(0.0, min(100.0, score))
    logger.info("[healthscore:test_gaps] source=%d, covered=%d, ratio=%.2f, score=%.1f",
                len(source_files), covered, ratio, score)
    if uncovered_samples:
        logger.info("[healthscore:test_gaps] Sample uncovered: %s", uncovered_samples[:5])
    return score


async def _probe_agent_context_efficiency(target_path: Path) -> float | None:
    """Score based on agent context token budgets.

    Uses the Prime tier system to load FULL context for each agent
    and scores based on how well agents stay within token budget.
    Target: ~4000 tokens per agent for FULL tier.
    """
    from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

    agents = ["sm", "tea", "dev", "reviewer", "architect",
              "pm", "tech-writer", "ux-designer", "devops", "orchestrator"]

    target_budget = 4000
    scores: list[float] = []

    for agent in agents:
        try:
            components = load_tier_components(ContextTier.FULL, agent, target_path)
            total = components.get("total_tokens", 0)
            if total <= 0:
                logger.info("[healthscore:agent_context] %s: no tokens loaded", agent)
                continue
            # Score per agent: at or under budget = 100, over budget degrades linearly
            # 2x budget = 0
            ratio = total / target_budget
            if ratio <= 1.0:
                agent_score = 100.0
            else:
                agent_score = max(0.0, 100.0 - (ratio - 1.0) * 100.0)
            logger.info("[healthscore:agent_context] %s: %d tokens (%.1f%% of budget), score=%.1f",
                        agent, total, ratio * 100, agent_score)
            scores.append(agent_score)
        except Exception as exc:
            logger.warning("[healthscore:agent_context] %s failed: %s", agent, exc)
            continue

    if not scores:
        logger.info("[healthscore:agent_context] No agent scores collected")
        return None

    avg = sum(scores) / len(scores)
    logger.info("[healthscore:agent_context] %d agents scored, avg=%.1f", len(scores), avg)
    return avg


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
