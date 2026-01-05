/**
 * Benchmark Data Loader
 *
 * Build-time data pipeline that loads benchmark summary.yaml files
 * from internal/results/benchmarks/ and transforms them for the showcase.
 *
 * Also loads control baselines from internal/results/baselines/ and calculates
 * delta comparisons for themed summaries that lack embedded baseline data.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths to benchmark results relative to showcase directory
const BENCHMARKS_DIR = join(__dirname, '..', '..', '..', 'results', 'benchmarks');
const BASELINES_DIR = join(__dirname, '..', '..', '..', 'results', 'baselines');

/**
 * Raw YAML structure for benchmark summary files
 */
interface RawBenchmarkSummary {
  agent: {
    theme: string;
    role: string;
    spec: string;
    character?: string;
  };
  scenario: {
    name: string;
    title?: string;
    category?: string;
    difficulty?: string;
  };
  statistics: {
    n: number;
    mean: number;
    std_dev: number;
    min: number;
    max: number;
    scores: number[];
  };
  efficiency?: {
    avg_input_tokens: number;
    avg_output_tokens: number;
    tokens_per_point: number;
  };
  baseline_comparison?: {
    control_mean: number;
    control_stddev: number;
    delta: number;
  };
  runs?: string[];
}

/**
 * Typed benchmark summary for use in components
 */
export interface BenchmarkSummary {
  agent: {
    theme: string;
    role: string;
    spec: string;
    character?: string;
  };
  scenario: {
    name: string;
    title?: string;
    category?: string;
    difficulty?: string;
  };
  statistics: {
    n: number;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    scores: number[];
  };
  efficiency?: {
    avgInputTokens: number;
    avgOutputTokens: number;
    tokensPerPoint: number;
  };
  baselineComparison?: {
    controlMean: number;
    controlStddev: number;
    delta: number;
  };
}

/**
 * Grouped summaries by scenario name
 */
export type ScenarioGroup = Record<string, BenchmarkSummary[]>;

/**
 * Leaderboard entry for a theme within a role
 */
export interface RoleLeaderboard {
  theme: string;
  persona?: string;
  averageScore: number;
  averageDelta?: number;
  scenarioCount: number;
}

/**
 * Transform raw YAML to typed BenchmarkSummary
 */
function transformSummary(raw: RawBenchmarkSummary): BenchmarkSummary {
  const summary: BenchmarkSummary = {
    agent: {
      theme: raw.agent.theme,
      role: raw.agent.role,
      spec: raw.agent.spec,
      character: raw.agent.character,
    },
    scenario: {
      name: raw.scenario.name,
      title: raw.scenario.title,
      category: raw.scenario.category,
      difficulty: raw.scenario.difficulty,
    },
    statistics: {
      n: raw.statistics.n,
      mean: raw.statistics.mean,
      stdDev: raw.statistics.std_dev,
      min: raw.statistics.min,
      max: raw.statistics.max,
      scores: raw.statistics.scores,
    },
  };

  if (raw.efficiency) {
    summary.efficiency = {
      avgInputTokens: raw.efficiency.avg_input_tokens,
      avgOutputTokens: raw.efficiency.avg_output_tokens,
      tokensPerPoint: raw.efficiency.tokens_per_point,
    };
  }

  if (raw.baseline_comparison) {
    summary.baselineComparison = {
      controlMean: raw.baseline_comparison.control_mean,
      controlStddev: raw.baseline_comparison.control_stddev,
      delta: raw.baseline_comparison.delta,
    };
  }

  return summary;
}

/**
 * Load a single summary.yaml file
 */
function loadSummaryFile(filePath: string): BenchmarkSummary | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const raw = parse(content) as RawBenchmarkSummary;
    return transformSummary(raw);
  } catch {
    // Skip malformed files
    return null;
  }
}

/**
 * Baseline statistics for comparison
 */
interface BaselineStats {
  mean: number;
  stdDev: number;
}

/**
 * Load all baseline summaries into a lookup map
 *
 * Returns map keyed by "scenario:role" for O(1) lookups
 * Traverses internal/results/baselines/{scenario}/{role}/summary.yaml
 */
function loadBaselines(): Map<string, BaselineStats> {
  const baselines = new Map<string, BaselineStats>();

  if (!existsSync(BASELINES_DIR)) {
    return baselines;
  }

  // Get all scenario directories
  const scenarios = readdirSync(BASELINES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const scenario of scenarios) {
    const scenarioDir = join(BASELINES_DIR, scenario);

    // Get all role directories within each scenario
    const roles = readdirSync(scenarioDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const role of roles) {
      const summaryPath = join(scenarioDir, role, 'summary.yaml');

      if (existsSync(summaryPath)) {
        try {
          const content = readFileSync(summaryPath, 'utf-8');
          const raw = parse(content) as RawBenchmarkSummary;
          const key = `${scenario}:${role}`;
          baselines.set(key, {
            mean: raw.statistics.mean,
            stdDev: raw.statistics.std_dev,
          });
        } catch {
          // Skip malformed baseline files
        }
      }
    }
  }

  return baselines;
}

/**
 * Load all benchmark summary.yaml files
 *
 * Traverses internal/results/benchmarks/{scenario}/{theme-role}/summary.yaml
 * Also loads baselines from internal/results/baselines/ and calculates deltas
 */
export async function loadBenchmarkSummaries(): Promise<BenchmarkSummary[]> {
  const summaries: BenchmarkSummary[] = [];

  if (!existsSync(BENCHMARKS_DIR)) {
    return summaries;
  }

  // Load baselines first for comparison lookups
  const baselines = loadBaselines();

  // Get all scenario directories
  const scenarios = readdirSync(BENCHMARKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const scenario of scenarios) {
    const scenarioDir = join(BENCHMARKS_DIR, scenario);

    // Get all theme-role directories within each scenario
    const themeRoles = readdirSync(scenarioDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const themeRole of themeRoles) {
      const summaryPath = join(scenarioDir, themeRole, 'summary.yaml');

      if (existsSync(summaryPath)) {
        const summary = loadSummaryFile(summaryPath);
        if (summary) {
          // If no embedded baseline comparison, calculate from baselines
          if (!summary.baselineComparison) {
            const baselineKey = `${summary.scenario.name}:${summary.agent.role}`;
            const baseline = baselines.get(baselineKey);
            if (baseline) {
              summary.baselineComparison = {
                controlMean: baseline.mean,
                controlStddev: baseline.stdDev,
                delta: summary.statistics.mean - baseline.mean,
              };
            }
          }
          summaries.push(summary);
        }
      }
    }
  }

  return summaries;
}

/**
 * Group summaries by scenario name
 */
export function groupByScenario(summaries: BenchmarkSummary[]): ScenarioGroup {
  const grouped: ScenarioGroup = {};

  for (const summary of summaries) {
    const key = summary.scenario.name;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(summary);
  }

  return grouped;
}

/**
 * Group summaries by agent role
 */
export function groupByRole(summaries: BenchmarkSummary[]): ScenarioGroup {
  const grouped: ScenarioGroup = {};

  for (const summary of summaries) {
    const key = summary.agent.role;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(summary);
  }

  return grouped;
}

/**
 * Calculate leaderboard for a set of summaries (typically filtered by role)
 *
 * Aggregates scores by theme and sorts descending by average score.
 */
export function calculateRoleLeaderboard(summaries: BenchmarkSummary[]): RoleLeaderboard[] {
  // Group by theme
  const byTheme: Record<string, BenchmarkSummary[]> = {};

  for (const summary of summaries) {
    const theme = summary.agent.theme;
    if (!byTheme[theme]) {
      byTheme[theme] = [];
    }
    byTheme[theme].push(summary);
  }

  // Calculate averages for each theme
  const leaderboard: RoleLeaderboard[] = [];

  for (const [theme, themeSummaries] of Object.entries(byTheme)) {
    const scores = themeSummaries.map((s) => s.statistics.mean);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Get persona from first summary (all summaries for same theme+role should have same persona)
    const persona = themeSummaries[0]?.agent.character;

    // Calculate average delta if baseline data exists
    const deltas = themeSummaries
      .filter((s) => s.baselineComparison?.delta !== undefined)
      .map((s) => s.baselineComparison!.delta);

    const averageDelta =
      deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : undefined;

    leaderboard.push({
      theme,
      persona,
      averageScore,
      averageDelta,
      scenarioCount: themeSummaries.length,
    });
  }

  // Sort descending by average score
  return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
}
