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

// Permission Request Protocol (Story 33-1)
export {
  validatePermissionRequest,
  createGrant,
  type PermissionRequest,
  type PermissionGrant,
  type PermissionValidationError,
  type PermissionValidationResult,
  type GrantType,
  VALID_GRANT_TYPES,
} from './permissions/index.js';

// Workflow System (Stories 31-1, 31-2, 31-3, MSSCI-11710)
export {
  // Schema validation
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowPhase,
  type WorkflowTriggers,
  type WorkflowPermissionPreset,
  type WorkflowValidationError,
  type WorkflowValidationResult,
  // Workflow loading
  loadWorkflowFile,
  loadWorkflowsFromDir,
  type WorkflowLoadResult,
  type WorkflowLoadResults,
  // Story-to-workflow routing
  routeStoryToWorkflow,
  type StoryMetadata,
  type RoutingResult,
  // Permission checking (Story MSSCI-11710)
  checkWorkflowPermissions,
  type WorkflowPermissionCheckResult,
} from './workflow/index.js';

// Plugin Discovery (Story 93-3)
export {
  discoverPlugins,
  parsePluginManifest,
  getPluginCommands,
  getPluginSkills,
  getPluginRouters,
  type PluginManifest,
  type DiscoveredPlugin,
  type PluginCommand,
  type PluginSkill,
  type PluginRouter,
} from './plugins/plugin-discovery.js';

// Shared Utilities (Story 98-16: absorbed from @pennyfarthing/shared)
export {
  resolvePennyfarthingDist,
  resolvePortraitPath,
  getPortraitPaths,
  type PortraitPaths,
  loadTheme,
  listThemes,
  getAgentPersona,
  resolveThemePath,
  discoverAllThemeDirs,
  discoverThemePackages,
  loadAllThemeMetadata,
  deriveCategory,
  CATEGORY_MAP,
  type Theme,
  type ThemeAgent,
  type ThemePackageInfo,
  type ThemeMetadata,
  searchSkills,
  type SearchOptions,
  type SkillResult,
  suggestSkills,
  suggestFromSession,
  suggestFromKeywords,
  type SuggestOptions,
  type SkillSuggestion,
  type SessionContext,
  generateSkillDocs,
  type GeneratorOptions,
  type GeneratorResult,
  detectMarkers,
  stripMarkers,
  stripCodeBlocks,
  MARKER_PATTERN,
  MARKER_TYPES,
  VALID_MARKER_TYPES,
  type Marker,
  type MarkerType,
} from './shared/index.js';

// Benchmark (Story 98-16: absorbed from @pennyfarthing/benchmark)
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
} from './benchmark/index.js';
