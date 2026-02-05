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

// Session state tracking (Story MSSCI-12082, wired in MSSCI-14299)
export {
  initWorkflowState,
  updateWorkflowState,
  parseSessionState,
  updateSessionContent,
  formatWorkflowState,
  type WorkflowState,
  type SessionStateResult,
  type UpdateResult,
} from './session-state.js';

// Workflow executor - step completion and lifecycle (Story MSSCI-12084, wired in MSSCI-14299)
// Note: WorkflowDefinition from executor is re-exported as ExecutorWorkflowDefinition
// to avoid conflict with WorkflowDefinition from workflow-schema.ts
export {
  completeStep,
  startWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  loadStep,
  hasActiveWorkflow,
  detectIncompleteWorkflow,
  type WorkflowDefinition as ExecutorWorkflowDefinition,
  type StartResult,
  type ResumeResult,
  type WorkflowStatus,
  type StatusResult,
} from './workflow-executor.js';
