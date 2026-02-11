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
