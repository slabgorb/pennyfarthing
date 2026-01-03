/**
 * Benchmark Data Loader
 *
 * Build-time data pipeline that loads benchmark summary.yaml files
 * from results/benchmarks/ and transforms them for the showcase.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to benchmark results relative to showcase directory
const BENCHMARKS_DIR = join(__dirname, '..', '..', '..', 'results', 'benchmarks');

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
 * Load all benchmark summary.yaml files
 *
 * Traverses results/benchmarks/{scenario}/{theme-role}/summary.yaml
 */
export async function loadBenchmarkSummaries(): Promise<BenchmarkSummary[]> {
  const summaries: BenchmarkSummary[] = [];

  if (!existsSync(BENCHMARKS_DIR)) {
    return summaries;
  }

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

    // Calculate average delta if baseline data exists
    const deltas = themeSummaries
      .filter((s) => s.baselineComparison?.delta !== undefined)
      .map((s) => s.baselineComparison!.delta);

    const averageDelta =
      deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : undefined;

    leaderboard.push({
      theme,
      averageScore,
      averageDelta,
      scenarioCount: themeSummaries.length,
    });
  }

  // Sort descending by average score
  return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
}
