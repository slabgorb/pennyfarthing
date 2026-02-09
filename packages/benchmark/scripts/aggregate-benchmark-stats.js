#!/usr/bin/env node
/**
 * aggregate-benchmark-stats.js - Aggregate job-fair results into benchmark statistics
 *
 * Scans consolidated job-fair results and generates unified statistics:
 * - Per-role aggregate statistics (mean, std_dev, n, min, max)
 * - Theme rankings per role
 * - Control baseline comparisons
 *
 * Usage:
 *   aggregate-benchmark-stats.js [--dry-run] [--theme THEME]
 */

import { readdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = join(dirname(__dirname), '..', '..');
const CONSOLIDATED_DIR = join(PROJECT_DIR, 'internal', 'results', 'job-fair', 'consolidated');
const OUTPUT_FILE = join(PROJECT_DIR, 'internal', 'results', 'aggregate-stats.yaml');

// Standard roles from job-fair
const STANDARD_ROLES = ['dev-codegen', 'dev-debug', 'reviewer', 'tea', 'sm', 'architect'];

// Baselines from control theme (hardcoded from job-fair-runner.sh)
const BASELINES = {
  'dev-codegen': { mean: 85.8, std: 7.30, n: 10 },
  'dev-debug': { mean: 77.5, std: 8.54, n: 10 },
  'reviewer': { mean: 78.5, std: 1.8, n: 10 },
  'tea': { mean: 72.1, std: 2.3, n: 10 },
  'sm': { mean: 80.3, std: 1.9, n: 10 },
  'architect': { mean: 87.2, std: 3.25, n: 10 },
};

// Parse command line arguments
function parseArgs(argv) {
  const args = {
    dryRun: false,
    theme: null,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--theme':
        args.theme = argv[++i];
        break;
      case '--help':
      case '-h':
        showUsage();
        process.exit(0);
        break;
    }
    i++;
  }
  return args;
}

function showUsage() {
  console.log(`Usage: aggregate-benchmark-stats.js [OPTIONS]

Options:
  --dry-run       Output to stdout instead of writing file
  --theme THEME   Only process specific theme
  --help, -h      Show this help message

Output: internal/results/aggregate-stats.yaml`);
}

// Extract YAML field using yq
function yqGet(filePath, field) {
  try {
    const result = execSync(`yq -r '.${field}' "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = result.trim();
    return trimmed === 'null' ? null : trimmed;
  } catch {
    return null;
  }
}

// Get all keys from a YAML object
function yqKeys(filePath, field) {
  try {
    const result = execSync(`yq -r '.${field} | keys | .[]' "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Get numeric value from YAML
function yqNumber(filePath, field) {
  const val = yqGet(filePath, field);
  return val !== null ? parseFloat(val) : null;
}

// Calculate statistics from array of numbers
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, std_dev: 0, n: 0, min: 0, max: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const std_dev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    mean: Math.round(mean * 100) / 100,
    std_dev: Math.round(std_dev * 100) / 100,
    n,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
  };
}

// Load theme data from consolidated summary
function loadThemeData(themePath) {
  const summaryPath = join(themePath, 'summary.yaml');
  if (!existsSync(summaryPath)) {
    return null;
  }

  const theme = yqGet(summaryPath, 'theme');
  if (!theme) return null;

  const characters = yqKeys(summaryPath, 'matrix');
  const roleScores = {};

  // Initialize role arrays
  for (const role of STANDARD_ROLES) {
    roleScores[role] = [];
  }

  // Collect scores from each character
  for (const char of characters) {
    for (const role of STANDARD_ROLES) {
      const mean = yqNumber(summaryPath, `matrix.${char}.${role}.mean`);
      if (mean !== null && mean > 0) {
        roleScores[role].push(mean);
      }
    }
  }

  return { theme, roleScores };
}

// Main aggregation logic
function aggregate(args) {
  // Get list of consolidated themes
  let themes;
  if (args.theme) {
    themes = [args.theme];
  } else {
    themes = readdirSync(CONSOLIDATED_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  // Collect all scores per role across themes
  const allRoleScores = {};
  const themeRoleAverages = {}; // theme -> role -> mean

  for (const role of STANDARD_ROLES) {
    allRoleScores[role] = [];
  }

  let themesProcessed = 0;

  for (const themeName of themes) {
    const themePath = join(CONSOLIDATED_DIR, themeName);
    const data = loadThemeData(themePath);
    if (!data) continue;

    themesProcessed++;
    themeRoleAverages[data.theme] = {};

    for (const role of STANDARD_ROLES) {
      // Add all character scores for this theme/role to the global pool
      allRoleScores[role].push(...data.roleScores[role]);

      // Calculate theme average for rankings
      if (data.roleScores[role].length > 0) {
        const avg = data.roleScores[role].reduce((a, b) => a + b, 0) / data.roleScores[role].length;
        themeRoleAverages[data.theme][role] = Math.round(avg * 100) / 100;
      }
    }
  }

  // Calculate aggregate statistics per role
  const roles = {};
  for (const role of STANDARD_ROLES) {
    roles[role] = calculateStats(allRoleScores[role]);
  }

  // Generate rankings per role (sorted by mean descending)
  const rankings = {};
  for (const role of STANDARD_ROLES) {
    const themeList = [];
    for (const [theme, roleAvgs] of Object.entries(themeRoleAverages)) {
      if (roleAvgs[role] !== undefined) {
        themeList.push({ theme, mean: roleAvgs[role] });
      }
    }
    // Sort descending by mean
    themeList.sort((a, b) => b.mean - a.mean);
    rankings[role] = themeList;
  }

  // Control baseline comparison
  const control = {
    baseline: 'from job-fair-runner.sh',
  };

  // Get control theme data if available
  const controlPath = join(CONSOLIDATED_DIR, 'control');
  const controlData = loadThemeData(controlPath);

  for (const role of STANDARD_ROLES) {
    const baseline = BASELINES[role];
    let controlMean = null;

    if (controlData && controlData.roleScores[role].length > 0) {
      const scores = controlData.roleScores[role];
      controlMean = scores.reduce((a, b) => a + b, 0) / scores.length;
      controlMean = Math.round(controlMean * 100) / 100;
    }

    control[role] = {
      mean: controlMean !== null ? controlMean : baseline.mean,
      baseline_mean: baseline.mean,
      vs_baseline: controlMean !== null
        ? Math.round((controlMean - baseline.mean) * 100) / 100
        : 0,
    };
  }

  // Build output YAML
  const timestamp = new Date().toISOString();

  const output = {
    metadata: {
      generated_at: timestamp,
      themes_processed: themesProcessed,
      source: 'internal/results/job-fair/consolidated/',
    },
    roles,
    rankings,
    control,
  };

  return output;
}

// Format output as YAML
function toYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object') {
          // Inline object format for array items
          const parts = Object.entries(item).map(([k, v]) => `${k}: ${v}`);
          yaml += `${spaces}  - {${parts.join(', ')}}\n`;
        } else {
          yaml += `${spaces}  - ${item}\n`;
        }
      }
    } else if (typeof value === 'object') {
      yaml += `${spaces}${key}:\n`;
      yaml += toYaml(value, indent + 1);
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}

// Main entry point
function main() {
  const args = parseArgs(process.argv);
  const result = aggregate(args);
  const yamlOutput = '# Aggregate Benchmark Statistics\n# Generated from job-fair consolidated results\n\n' + toYaml(result);

  if (args.dryRun) {
    console.log(yamlOutput);
  } else {
    writeFileSync(OUTPUT_FILE, yamlOutput);
    console.log(`Wrote aggregate stats to ${OUTPUT_FILE}`);
    console.log(`Themes processed: ${result.metadata.themes_processed}`);
  }
}

main();
