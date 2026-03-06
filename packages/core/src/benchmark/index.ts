// @pennyfarthing/benchmark — barrel exports
// Story 93-1: Package shell with migrated modules

export {
  aggregateJobFairResults,
  getBaselineComparison,
  getRoleStatistics,
  getTopPerformers,
  getHistoricalTrend,
  saveHistoricalSnapshot,
  aggregateByDimension,
  getDimensionValues,
  generateDifferentialReport,
  type Performer,
  type RoleStats,
  type OverallChampion,
  type TrendPoint,
  type AggregateStats,
  type DimensionName,
  type DimensionValues,
  type ThemeDimensions,
  type DimensionValueStats,
  type DimensionComparison,
  type DimensionStats,
} from './job-fair-aggregator.js';

export {
  loadBenchmarkData,
  getBenchmarkWithFace,
  calculateOceanCorrelation,
  generateCorrelationReport,
  getOptimalProfile,
  getRoleRecommendations,
  findTopPerformers,
  queryBenchmarks,
  calculateErrorTypeCorrelation,
  generateOceanErrorHeatMap,
  generateBenchmarkReport,
  type OceanScores,
  type BenchmarkResult,
  type CorrelationResult,
  type OptimalProfile,
  type RoleRecommendations,
  type PerformerResult,
  type QueryOptions,
  type BenchmarkReportResult,
  type ErrorTypeCell,
  type OceanErrorCorrelation,
  type JudgeScore,
  type BenchmarkResultWithOcean,
} from './benchmark-integration.js';

export {
  validateScenario,
  type Scenario,
  type RedHerring,
} from './scenario-schema.js';
