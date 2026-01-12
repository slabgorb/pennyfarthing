// Pennyfarthing - Programmatic API
// For use by other tools and slash commands

export { getPackageVersion, getAssetsPath } from './cli/utils/version.js';
export {
  readManifest,
  writeManifest,
  manifestExists,
  getInstalledVersion,
  type Manifest
} from './cli/utils/manifest.js';
export {
  hashFile,
  hashString,
  pathExists,
  isDirectory,
  isSymlink,
  getAllFiles,
  getDirectoryHashes
} from './cli/utils/files.js';

// Job-Fair Aggregator (Story 7-4, 7-5)
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
} from './scripts/job-fair-aggregator.js';
