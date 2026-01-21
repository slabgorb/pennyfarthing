/**
 * Workflow Module Exports
 *
 * Provides workflow loading, validation, routing, and permission checking.
 *
 * Stories:
 * - 31-1: Workflow schema validation
 * - 31-2: Workflow loader
 * - 31-3: Story-to-workflow routing
 * - MSSCI-11710: Permission presets by workflow
 */

// Schema validation and types
export {
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowPhase,
  type WorkflowTriggers,
  type WorkflowPermissionPreset,
  type WorkflowValidationError,
  type WorkflowValidationResult,
} from './workflow-schema.js';

// Workflow loading
export {
  loadWorkflowFile,
  loadWorkflowsFromDir,
  type WorkflowLoadResult,
  type WorkflowLoadResults,
} from './workflow-loader.js';

// Story-to-workflow routing
export {
  routeStoryToWorkflow,
  type StoryMetadata,
  type RoutingResult,
} from './workflow-router.js';

// Permission checking (Story MSSCI-11710)
export {
  checkWorkflowPermissions,
  type WorkflowPermissionCheckResult,
} from './workflow-permissions.js';

// Note: WorkflowPermissionPreset is exported from workflow-schema.ts
// to keep all workflow definition types in one place.
// The workflow-permissions.ts module has its own copy for backwards
// compatibility but workflow-schema.ts is the canonical source.
