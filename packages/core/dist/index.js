// Pennyfarthing - Programmatic API
// For use by other tools and slash commands
export { getPackageVersion, getAssetsPath } from './cli/utils/version.js';
export { readManifest, writeManifest, manifestExists, getInstalledVersion } from './cli/utils/manifest.js';
export { hashFile, hashString, pathExists, isDirectory, isSymlink, getAllFiles, getDirectoryHashes } from './cli/utils/files.js';
// Permission Request Protocol (Story 33-1)
export { validatePermissionRequest, createGrant, VALID_GRANT_TYPES, } from './permissions/index.js';
// Job-Fair Aggregator (Story 7-4, 7-5)
export { aggregateJobFairResults, getBaselineComparison, getRoleStatistics, getTopPerformers, getHistoricalTrend, saveHistoricalSnapshot, aggregateByDimension, getDimensionValues, generateDifferentialReport, } from './scripts/job-fair-aggregator.js';
//# sourceMappingURL=index.js.map