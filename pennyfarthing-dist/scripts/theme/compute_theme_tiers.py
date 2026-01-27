#!/usr/bin/env python3
"""
compute_theme_tiers.py - Compute tier rankings from job-fair results

Reads all summary.yaml files from internal/results/job-fair/
For each theme, extracts character x role scores from the matrix
Normalizes across formats, then computes delta vs baseline
Assigns tier based on overall performance vs control baseline

KEY DESIGN DECISIONS:
1. Normalizes dev roles: averages dev-codegen + dev-debug into synthetic "dev"
   to enable fair comparison across old 4-role and new 6-role formats.
   Final comparison uses: dev, reviewer, sm, tea (4 roles)
2. Uses the MOST COMPLETE run for each theme (most matrix entries),
   not the most recent. This prevents incomplete runs from overriding good data.

Tier criteria (calibrated for actual delta distribution):
  S: delta >= +7  (elite - top performers)
  A: delta >= +5  (excellent - strong positive)
  B: delta >= +3  (strong - solid performers)
  C: delta >= +1  (good - above average)
  D: delta < +1   (average/below)
  U: no data      (unbenchmarked)

Usage:
  compute_theme_tiers.py [--dry-run] [--verbose] [--min-entries N]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    """Find project root by looking for .pennyfarthing directory."""
    current = Path.cwd()
    while current != current.parent:
        if (current / ".pennyfarthing").is_dir():
            return current
        current = current.parent
    return Path.cwd()


PROJECT_ROOT = find_project_root()
JOB_FAIR_DIR = PROJECT_ROOT.parent / 'internal' / 'results' / 'job-fair'
THEMES_DIR = PROJECT_ROOT / 'pennyfarthing-dist' / 'personas' / 'themes'

DEFAULT_MIN_ENTRIES = 20

NORMALIZED_ROLES = {'dev', 'reviewer', 'sm', 'tea'}
DEV_SUBROLES = ['dev-codegen', 'dev-debug']

TIER_THRESHOLDS = {
    'S': 7,
    'A': 5,
    'B': 3,
    'C': 1,
}


def yq_get(file_path: Path, field: str) -> str | None:
    """Extract YAML field using yq."""
    try:
        result = subprocess.run(
            ['yq', '-r', field, str(file_path)],
            capture_output=True, text=True, check=True
        )
        value = result.stdout.strip()
        return None if value == 'null' else value
    except Exception:
        return None


def parse_baselines(file_path: Path) -> dict | None:
    """Parse baselines from summary.yaml."""
    try:
        result = subprocess.run(
            ['yq', '-o=json', '.baselines', str(file_path)],
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except Exception:
        return None


def count_matrix_entries(file_path: Path) -> int:
    """Count matrix entries by grep."""
    try:
        result = subprocess.run(
            ['awk', '/^matrix:/,0 { if (/mean:/) count++ } END { print count }', str(file_path)],
            capture_output=True, text=True, check=True
        )
        return int(result.stdout.strip()) if result.stdout.strip() else 0
    except Exception:
        return 0


def parse_matrix_scores(file_path: Path) -> list[dict]:
    """Extract all scores from matrix section using yq."""
    try:
        result = subprocess.run(
            ['yq', '.matrix | to_entries | .[] | .key as $char | .value | to_entries | .[] | [$char, .key, .value.mean, .value.n] | @csv', str(file_path)],
            capture_output=True, text=True, check=True
        )

        scores = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split(',')
            if len(parts) >= 4:
                character = parts[0].strip('"')
                role = parts[1].strip('"')
                try:
                    mean = float(parts[2])
                    n = int(parts[3])
                    scores.append({'character': character, 'role': role, 'mean': mean, 'n': n})
                except ValueError:
                    continue
        return scores
    except Exception:
        return []


def normalize_baselines(baselines: dict | None) -> dict | None:
    """Normalize baselines: average dev-codegen + dev-debug into synthetic dev."""
    if not baselines:
        return None

    normalized = dict(baselines)

    if 'dev' not in normalized and 'dev-codegen' in normalized and 'dev-debug' in normalized:
        codegen = normalized['dev-codegen']
        debug = normalized['dev-debug']
        normalized['dev'] = {
            'mean': (codegen['mean'] + debug['mean']) / 2,
            'std': ((codegen['std'] ** 2 + debug['std'] ** 2) / 2) ** 0.5,
            'n': codegen['n'] + debug['n'],
        }

    return normalized


def compute_deltas(baselines: dict | None, matrix_scores: list[dict]) -> dict | None:
    """Compute delta vs baselines for a job-fair run."""
    if not baselines or not matrix_scores:
        return None

    normalized_baselines = normalize_baselines(baselines)

    # First pass: collect raw scores
    raw_scores = {}
    for score in matrix_scores:
        role = score['role']
        mean = score['mean']
        if not isinstance(mean, (int, float)):
            continue
        if role not in raw_scores:
            raw_scores[role] = {'sum': 0, 'count': 0}
        raw_scores[role]['sum'] += mean
        raw_scores[role]['count'] += 1

    # Second pass: normalize dev subroles
    role_scores = {}
    for role, scores in raw_scores.items():
        if role in DEV_SUBROLES:
            if 'dev' not in role_scores:
                role_scores['dev'] = {'sum': 0, 'count': 0}
            role_scores['dev']['sum'] += scores['sum']
            role_scores['dev']['count'] += scores['count']
        elif role in NORMALIZED_ROLES:
            role_scores[role] = scores

    # Compute deltas
    role_deltas = {}
    total_delta = 0
    total_score = 0
    n_roles = 0

    for role, scores in role_scores.items():
        baseline = normalized_baselines.get(role)
        if not baseline or not isinstance(baseline.get('mean'), (int, float)):
            continue

        role_mean = scores['sum'] / scores['count']
        delta = role_mean - baseline['mean']

        role_deltas[role] = {
            'mean': role_mean,
            'baseline': baseline['mean'],
            'delta': delta,
            'n': scores['count'],
        }

        total_delta += delta
        total_score += role_mean
        n_roles += 1

    if n_roles == 0:
        return None

    return {
        'mean_delta': total_delta / n_roles,
        'mean_score': total_score / n_roles,
        'n_roles': n_roles,
        'role_deltas': role_deltas,
    }


def assign_tier(mean_delta: float) -> str:
    """Assign tier based on mean delta."""
    if mean_delta >= TIER_THRESHOLDS['S']:
        return 'S'
    if mean_delta >= TIER_THRESHOLDS['A']:
        return 'A'
    if mean_delta >= TIER_THRESHOLDS['B']:
        return 'B'
    if mean_delta >= TIER_THRESHOLDS['C']:
        return 'C'
    return 'D'


def find_summary_files() -> list[dict]:
    """Find all job-fair summary files."""
    if not JOB_FAIR_DIR.exists():
        print(f"Error: Job fair directory not found: {JOB_FAIR_DIR}", file=sys.stderr)
        sys.exit(1)

    files = []
    for entry in sorted(JOB_FAIR_DIR.iterdir()):
        if not entry.is_dir():
            continue
        summary_path = entry / 'summary.yaml'
        if summary_path.exists():
            files.append({
                'path': summary_path,
                'run_name': entry.name,
            })
    return files


def update_theme_tier(theme_name: str, new_tier: str, dry_run: bool) -> dict:
    """Update tier in theme file."""
    theme_file = THEMES_DIR / f"{theme_name}.yaml"
    if not theme_file.exists():
        return {'updated': False, 'reason': 'file not found'}

    content = theme_file.read_text()
    tier_match = re.search(r'^(\s+tier:\s*)(\S+)', content, re.MULTILINE)

    if not tier_match:
        return {'updated': False, 'reason': 'no tier field', 'current_tier': 'U'}

    current_tier = tier_match.group(2)
    if current_tier == new_tier:
        return {'updated': False, 'reason': 'unchanged', 'current_tier': current_tier}

    if not dry_run:
        new_content = re.sub(r'^(\s+tier:\s*)\S+', f'\\g<1>{new_tier}', content, count=1, flags=re.MULTILINE)
        theme_file.write_text(new_content)

    return {'updated': True, 'current_tier': current_tier, 'new_tier': new_tier}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compute tier rankings from job-fair results"
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Output changes without writing to theme files')
    parser.add_argument('--verbose', action='store_true',
                        help='Show detailed output including skipped runs')
    parser.add_argument('--min-entries', type=int, default=DEFAULT_MIN_ENTRIES,
                        help=f'Minimum matrix entries for a run to be complete (default: {DEFAULT_MIN_ENTRIES})')
    args = parser.parse_args()

    if args.dry_run:
        print('DRY RUN - no changes will be made\n')

    print('Configuration:')
    print(f"  Minimum entries for complete run: {args.min_entries}")
    print(f"  Normalized roles: {', '.join(sorted(NORMALIZED_ROLES))}")
    print(f"  Dev subroles (averaged): {' + '.join(DEV_SUBROLES)} -> dev")
    print(f"  Job fair directory: {JOB_FAIR_DIR}")
    print('')

    summary_files = find_summary_files()
    print(f"Scanning {len(summary_files)} job-fair runs...\n")

    theme_runs = {}
    skipped_runs = []

    for file_info in summary_files:
        path = file_info['path']
        run_name = file_info['run_name']

        theme = yq_get(path, '.theme')
        if not theme:
            continue

        entries = count_matrix_entries(path)

        if entries < args.min_entries:
            skipped_runs.append({'theme': theme, 'run_name': run_name, 'entries': entries, 'reason': 'incomplete'})
            continue

        baselines = parse_baselines(path)
        matrix_scores = parse_matrix_scores(path)

        deltas = compute_deltas(baselines, matrix_scores)
        if not deltas:
            skipped_runs.append({'theme': theme, 'run_name': run_name, 'entries': entries, 'reason': 'no valid deltas'})
            continue

        if theme not in theme_runs or entries > theme_runs[theme]['entries']:
            theme_runs[theme] = {
                'run_name': run_name,
                'entries': entries,
                **deltas,
            }

    if args.verbose and skipped_runs:
        print('Skipped Runs (incomplete or invalid):')
        for run in skipped_runs:
            print(f"  {run['theme']}: {run['run_name']} ({run['entries']} entries) - {run['reason']}")
        print('')

    sorted_themes = sorted(
        [{'theme': theme, **data} for theme, data in theme_runs.items()],
        key=lambda x: x['mean_delta'],
        reverse=True
    )

    print('Theme Performance Summary')
    print('=' * 70)
    print('')
    header = f"{'Theme':<28}{'Entries':>8}{'Mean':>8}{'Delta':>10}{'Tier':>6}"
    if args.verbose:
        header += '  Source Run'
    print(header)
    print('-' * 70)

    updated = 0
    unchanged = 0
    tier_counts = {'S': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0}

    for item in sorted_themes:
        theme = item['theme']
        run_name = item['run_name']
        entries = item['entries']
        mean_score = item['mean_score']
        mean_delta = item['mean_delta']

        tier = assign_tier(mean_delta)
        tier_counts[tier] += 1

        delta_str = f"{'+' if mean_delta >= 0 else ''}{mean_delta:.2f}"
        line = f"{theme:<28}{entries:>8}{mean_score:>8.2f}{delta_str:>10}{tier:>6}"
        if args.verbose:
            line += f"  {run_name}"
        print(line)

        result = update_theme_tier(theme, tier, args.dry_run)
        if result['updated']:
            updated += 1
            if args.verbose:
                print(f"  -> Updated: {result['current_tier']} -> {result['new_tier']}")
        else:
            unchanged += 1

    print('')
    print('Tier Distribution:')
    for tier in ['S', 'A', 'B', 'C', 'D']:
        print(f"  {tier}: {tier_counts[tier]} themes")

    all_themes = [f.stem for f in THEMES_DIR.glob('*.yaml')]
    benchmarked_themes = set(theme_runs.keys())
    unbenchmarked = [t for t in all_themes if t not in benchmarked_themes]
    print(f"  U: {len(unbenchmarked)} themes (unbenchmarked)")

    if args.verbose and unbenchmarked:
        sample = ', '.join(unbenchmarked[:10])
        suffix = '...' if len(unbenchmarked) > 10 else ''
        print(f"     {sample}{suffix}")

    print('')
    print(f"Summary: {updated} updated, {unchanged} unchanged")

    return 0


if __name__ == "__main__":
    sys.exit(main())
