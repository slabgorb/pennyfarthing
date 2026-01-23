#!/usr/bin/env node
/**
 * compute-theme-tiers.js - Compute tier rankings from job-fair results
 *
 * Reads all summary.yaml files from internal/results/job-fair/
 * For each theme, extracts all character×role scores from the matrix
 * Computes delta vs baseline for each role, then averages across all roles
 * Assigns tier based on overall performance vs control baseline
 *
 * IMPORTANT: Uses the MOST COMPLETE run for each theme (most matrix entries),
 * not the most recent. This prevents incomplete runs from overriding good data.
 *
 * Tier criteria (calibrated for actual delta distribution):
 *   S: delta >= +7  (elite - top performers)
 *   A: delta >= +5  (excellent - strong positive)
 *   B: delta >= +3  (strong - solid performers)
 *   C: delta >= +1  (good - above average)
 *   D: delta < +1   (average/below)
 *   U: no data      (unbenchmarked)
 *
 * Usage:
 *   compute-theme-tiers.js [--dry-run] [--verbose] [--min-entries N]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const JOB_FAIR_DIR = join(PROJECT_ROOT, '..', 'internal', 'results', 'job-fair');
const THEMES_DIR = join(PROJECT_ROOT, 'personas', 'themes');

// Default minimum entries for a run to be considered complete
const DEFAULT_MIN_ENTRIES = 20;

// Tier thresholds (calibrated for actual delta distribution)
const TIER_THRESHOLDS = {
  S: 7,    // delta >= +7  (elite - top performers)
  A: 5,    // delta >= +5  (excellent - strong positive)
  B: 3,    // delta >= +3  (strong - solid performers)
  C: 1,    // delta >= +1  (good - above average)
  // D: below +1 (average/below)
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    verbose: false,
    minEntries: DEFAULT_MIN_ENTRIES,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--min-entries':
        args.minEntries = parseInt(argv[++i], 10);
        break;
      case '--help':
      case '-h':
        showUsage();
        process.exit(0);
    }
    i++;
  }
  return args;
}

function showUsage() {
  console.log(`Usage: compute-theme-tiers.js [OPTIONS]

Options:
  --dry-run           Output changes without writing to theme files
  --verbose           Show detailed output including skipped runs
  --min-entries N     Minimum matrix entries for a run to be complete (default: ${DEFAULT_MIN_ENTRIES})
  --help, -h          Show this help message

Tier Criteria (based on mean delta from control):
  S: delta >= +7    (elite - top performers)
  A: delta >= +5    (excellent - strong positive)
  B: delta >= +3    (strong - solid performers)
  C: delta >= +1    (good - above average)
  D: delta < +1     (average/below)
  U: no data        (unbenchmarked)`);
}

/**
 * Extract YAML field using yq
 */
function yqGet(filePath, field) {
  try {
    const result = execSync(`yq -r '${field}' "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result === 'null' ? null : result;
  } catch {
    return null;
  }
}

/**
 * Parse baselines from summary.yaml
 * Returns: { role: { mean, std, n } }
 */
function parseBaselines(filePath) {
  try {
    const raw = execSync(`yq -o=json '.baselines' "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Count matrix entries by grep (handles duplicate YAML keys)
 * Counts lines matching "mean:" within the matrix section
 */
function countMatrixEntries(filePath) {
  try {
    // Count "mean:" lines after "matrix:" line, excluding baselines section
    const result = execSync(
      `awk '/^matrix:/,0 { if (/mean:/) count++ } END { print count }' "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Extract all scores from matrix section using yq (handles duplicate keys)
 * Returns: [{ character, role, mean, n }]
 */
function parseMatrixScores(filePath) {
  try {
    // Use yq to iterate through matrix entries - handles duplicates
    const raw = execSync(
      `yq '.matrix | to_entries | .[] | .key as $char | .value | to_entries | .[] | [$char, .key, .value.mean, .value.n] | @csv' "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const scores = [];
    for (const line of raw.trim().split('\n')) {
      if (!line) continue;
      // Parse CSV: character,role,mean,n (unquoted or quoted)
      // Handle both: death,dev,70.00,1 and "death","dev",70.00,1
      const parts = line.split(',');
      if (parts.length >= 4) {
        const character = parts[0].replace(/^"|"$/g, '');
        const role = parts[1].replace(/^"|"$/g, '');
        const mean = parseFloat(parts[2]);
        const n = parseInt(parts[3], 10);
        if (!isNaN(mean) && !isNaN(n)) {
          scores.push({ character, role, mean, n });
        }
      }
    }
    return scores;
  } catch {
    return [];
  }
}

/**
 * Compute delta vs baselines for a job-fair run
 * Returns: { meanDelta, meanScore, nRoles, roleDeltas }
 */
function computeDeltas(baselines, matrixScores) {
  if (!baselines || !matrixScores || matrixScores.length === 0) return null;

  // Aggregate scores by role
  const roleScores = {};
  for (const { role, mean } of matrixScores) {
    if (typeof mean !== 'number') continue;
    if (!roleScores[role]) {
      roleScores[role] = { sum: 0, count: 0 };
    }
    roleScores[role].sum += mean;
    roleScores[role].count++;
  }

  // Compute deltas vs baselines
  const roleDeltas = {};
  let totalDelta = 0;
  let totalScore = 0;
  let nRoles = 0;

  for (const [role, scores] of Object.entries(roleScores)) {
    const baseline = baselines[role];
    if (!baseline || typeof baseline.mean !== 'number') continue;

    const roleMean = scores.sum / scores.count;
    const delta = roleMean - baseline.mean;

    roleDeltas[role] = {
      mean: roleMean,
      baseline: baseline.mean,
      delta,
      n: scores.count,
    };

    totalDelta += delta;
    totalScore += roleMean;
    nRoles++;
  }

  if (nRoles === 0) return null;

  return {
    meanDelta: totalDelta / nRoles,
    meanScore: totalScore / nRoles,
    nRoles,
    roleDeltas,
  };
}

/**
 * Assign tier based on mean delta
 */
function assignTier(meanDelta) {
  if (meanDelta >= TIER_THRESHOLDS.S) return 'S';
  if (meanDelta >= TIER_THRESHOLDS.A) return 'A';
  if (meanDelta >= TIER_THRESHOLDS.B) return 'B';
  if (meanDelta >= TIER_THRESHOLDS.C) return 'C';
  return 'D';
}

/**
 * Find all job-fair summary files
 */
function findSummaryFiles() {
  if (!existsSync(JOB_FAIR_DIR)) {
    console.error(`Error: Job fair directory not found: ${JOB_FAIR_DIR}`);
    process.exit(1);
  }

  const files = [];
  for (const entry of readdirSync(JOB_FAIR_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const summaryPath = join(JOB_FAIR_DIR, entry.name, 'summary.yaml');
    if (existsSync(summaryPath)) {
      files.push({
        path: summaryPath,
        runName: entry.name,
      });
    }
  }
  return files.sort((a, b) => a.runName.localeCompare(b.runName));
}

/**
 * Update tier in theme file
 */
function updateThemeTier(themeName, newTier, dryRun) {
  const themeFile = join(THEMES_DIR, `${themeName}.yaml`);
  if (!existsSync(themeFile)) {
    return { updated: false, reason: 'file not found' };
  }

  const content = readFileSync(themeFile, 'utf-8');
  const tierMatch = content.match(/^(\s+tier:\s*)(\S+)/m);

  if (!tierMatch) {
    return { updated: false, reason: 'no tier field', currentTier: 'U' };
  }

  const currentTier = tierMatch[2];
  if (currentTier === newTier) {
    return { updated: false, reason: 'unchanged', currentTier };
  }

  if (!dryRun) {
    const newContent = content.replace(/^(\s+tier:\s*)\S+/m, `$1${newTier}`);
    writeFileSync(themeFile, newContent);
  }

  return { updated: true, currentTier, newTier };
}

/**
 * Main execution
 */
function main() {
  const args = parseArgs(process.argv);

  if (args.dryRun) {
    console.log('DRY RUN - no changes will be made\n');
  }

  console.log('Configuration:');
  console.log(`  Minimum entries for complete run: ${args.minEntries}`);
  console.log(`  Job fair directory: ${JOB_FAIR_DIR}`);
  console.log('');

  // Find all summary files
  const summaryFiles = findSummaryFiles();
  console.log(`Scanning ${summaryFiles.length} job-fair runs...\n`);

  // Process each run and collect best run per theme
  const themeRuns = {}; // theme -> { bestRun, entries, data }
  const skippedRuns = [];

  for (const { path, runName } of summaryFiles) {
    const theme = yqGet(path, '.theme');
    if (!theme) continue;

    const entries = countMatrixEntries(path);

    // Skip incomplete runs
    if (entries < args.minEntries) {
      skippedRuns.push({ theme, runName, entries, reason: 'incomplete' });
      continue;
    }

    const baselines = parseBaselines(path);
    const matrixScores = parseMatrixScores(path);

    const deltas = computeDeltas(baselines, matrixScores);
    if (!deltas) {
      skippedRuns.push({ theme, runName, entries, reason: 'no valid deltas' });
      continue;
    }

    // Keep the most complete run for each theme
    if (!themeRuns[theme] || entries > themeRuns[theme].entries) {
      themeRuns[theme] = {
        runName,
        entries,
        ...deltas,
      };
    }
  }

  // Show skipped runs in verbose mode
  if (args.verbose && skippedRuns.length > 0) {
    console.log('Skipped Runs (incomplete or invalid):');
    for (const { theme, runName, entries, reason } of skippedRuns) {
      console.log(`  ${theme}: ${runName} (${entries} entries) - ${reason}`);
    }
    console.log('');
  }

  // Sort themes by delta (best first)
  const sortedThemes = Object.entries(themeRuns)
    .map(([theme, data]) => ({ theme, ...data }))
    .sort((a, b) => b.meanDelta - a.meanDelta);

  // Print results
  console.log('Theme Performance Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(
    'Theme'.padEnd(28) +
    'Entries'.padStart(8) +
    'Mean'.padStart(8) +
    'Delta'.padStart(10) +
    'Tier'.padStart(6) +
    (args.verbose ? '  Source Run' : '')
  );
  console.log('-'.repeat(70));

  let updated = 0;
  let unchanged = 0;
  const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };

  for (const { theme, runName, entries, meanScore, meanDelta } of sortedThemes) {
    const tier = assignTier(meanDelta);
    tierCounts[tier]++;

    const deltaStr = (meanDelta >= 0 ? '+' : '') + meanDelta.toFixed(2);
    console.log(
      theme.padEnd(28) +
      entries.toString().padStart(8) +
      meanScore.toFixed(2).padStart(8) +
      deltaStr.padStart(10) +
      tier.padStart(6) +
      (args.verbose ? `  ${runName}` : '')
    );

    // Update theme file
    const result = updateThemeTier(theme, tier, args.dryRun);
    if (result.updated) {
      updated++;
      if (args.verbose) {
        console.log(`  → Updated: ${result.currentTier} → ${result.newTier}`);
      }
    } else {
      unchanged++;
    }
  }

  console.log('');
  console.log('Tier Distribution:');
  for (const tier of ['S', 'A', 'B', 'C', 'D']) {
    console.log(`  ${tier}: ${tierCounts[tier]} themes`);
  }

  // Count unbenchmarked themes
  const allThemes = readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''));
  const benchmarkedThemes = new Set(Object.keys(themeRuns));
  const unbenchmarked = allThemes.filter(t => !benchmarkedThemes.has(t));
  console.log(`  U: ${unbenchmarked.length} themes (unbenchmarked)`);

  if (args.verbose && unbenchmarked.length > 0) {
    console.log(`     ${unbenchmarked.slice(0, 10).join(', ')}${unbenchmarked.length > 10 ? '...' : ''}`);
  }

  console.log('');
  console.log(`Summary: ${updated} updated, ${unchanged} unchanged`);
}

main();
