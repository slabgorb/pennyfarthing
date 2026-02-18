# Brownfield & Code Analysis Tools

<info>
CLI tools for analyzing existing codebases. Identify change hotspots, complexity bottlenecks, dead code, stale dependencies, and code markers (TODO/FIXME). Each tool produces table, JSON, or CSV output and has a corresponding WheelHub API route for panel integration.
</info>

## Overview

All tools are available under `pf.sh debug` and share a consistent interface: `--format` (table/json/csv), `--output` (file), `--top` (result count), `--exclude` (patterns), and `--repo` (target).

## Tools

### Hotspots

Find files that change most frequently — high churn often correlates with bugs and complexity.

```bash
# Full analysis (files + directories)
pf.sh debug hotspots analyze

# File-level only
pf.sh debug hotspots files

# Directory-level only
pf.sh debug hotspots dirs

# Options
pf.sh debug hotspots analyze --days 90 --top 20 --repo pennyfarthing
pf.sh debug hotspots analyze --format json --output hotspots.json
pf.sh debug hotspots analyze --exclude "*.test.ts" --branch main
pf.sh debug hotspots analyze --skip-type orchestrator
```

### Complexity

Measure code complexity metrics across files.

```bash
pf.sh debug complexity analyze
pf.sh debug complexity analyze --path ./packages/core/src
pf.sh debug complexity analyze --top 30 --format csv
```

### Dead Code

Find unused code: stale files with no recent commits, and unused TypeScript exports.

```bash
# Files with no recent commits (default: 180 days)
pf.sh debug deadcode stale
pf.sh debug deadcode stale --days 90 --repo pennyfarthing

# Unused TypeScript exports (via ts-prune)
pf.sh debug deadcode exports
pf.sh debug deadcode exports --repo pennyfarthing --format json
```

### Code Markers

Detect TODO, FIXME, HACK, and XXX comments with git blame data.

```bash
# Full analysis with blame data
pf.sh debug codemarkers analyze

# Only stale markers (older than threshold)
pf.sh debug codemarkers stale --days 90

# Summary counts by type
pf.sh debug codemarkers summary

# Deprecated symbol detection
pf.sh debug codemarkers deprecations
```

### Dependencies

Analyze dependency staleness and security advisories.

```bash
pf.sh debug dependencies analyze
pf.sh debug dependencies analyze --path ./pennyfarthing --format json
```

### Health Score

Composite health score across all dimensions (hotspots, complexity, dead code, dependencies, markers).

```bash
pf.sh debug healthscore analyze
pf.sh debug healthscore analyze --no-cache   # Bypass cache
pf.sh debug healthscore analyze --format json --output health.json
```

## Common Options

| Option | Description | Default |
|--------|-------------|---------|
| `--repo NAME` | Analyze a single named repo from `repos.yaml` | All repos |
| `--path DIR` | Analyze a standalone directory | Current directory |
| `--format FMT` | Output format: `table`, `json`, `csv` | `table` |
| `--output FILE` | Write output to file | stdout |
| `--top N` | Number of top results | 20 |
| `--exclude PAT` | Exclude patterns (repeatable) | — |
| `--days N` | Time window for analysis | Varies by tool |

## WheelHub API Routes

Each tool has a corresponding HTTP API in WheelHub for panel integration:

| Route | Tool |
|-------|------|
| `/api/hotspots` | Hotspot analysis |
| `/api/complexity` | Complexity metrics |
| `/api/dead-code` | Dead code detection |
| `/api/dependencies` | Dependency health |
| `/api/code-markers` | Code marker scan |
| `/api/health-score` | Composite health score |

These power the **HotspotsPanel** in Cyclist and BikeRack.

## Key Files

| Directory | Purpose |
|-----------|---------|
| `pennyfarthing_scripts/hotspots/` | Hotspot analysis (analyze, formatters, models) |
| `pennyfarthing_scripts/complexity/` | Complexity analysis |
| `pennyfarthing_scripts/deadcode/` | Dead code detection |
| `pennyfarthing_scripts/dependencies/` | Dependency analysis |
| `pennyfarthing_scripts/codemarkers/` | Code marker detection |
| `pennyfarthing_scripts/healthscore/` | Composite health score |
| `pennyfarthing_scripts/brownfield/` | Brownfield codebase discovery |
| `packages/core/src/server/api/` | WheelHub API routes |
