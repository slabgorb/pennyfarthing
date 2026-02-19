/**
 * Cross-Entity Reference Validation (Story 91-15)
 *
 * Semantic validation of cross-entity references between agents, workflows,
 * commands, and skills. Layer 4 in the validation pipeline.
 *
 * Layers 0-3 (formatting, file refs, schema, graph) are prerequisites.
 * This layer validates that entities reference each other consistently:
 * - Agents referenced in workflows exist as agent definitions
 * - Workflows referenced by agents are properly defined
 * - Skills referenced via related_skills exist in the registry
 * - Commands referenced by skills exist, and vice versa
 * - Bidirectional consistency of all cross-references
 */

import type { WorkflowDefinition } from './workflow-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A workflow's agent references (extracted from phases)
 */
export interface WorkflowAgentRefs {
  /** Workflow name */
  workflow: string;
  /** All distinct agent names referenced in this workflow's phases */
  referencedAgents: string[];
}

/**
 * An agent's claimed workflow references
 */
export interface AgentWorkflowRefs {
  /** Agent name (file basename without extension) */
  agent: string;
  /** Workflow names this agent claims to participate in */
  referencedWorkflows: string[];
}

/**
 * A skill's references to other skills and commands
 */
export interface SkillEntityRefs {
  /** Skill name */
  skill: string;
  /** Other skill names listed in related_skills */
  relatedSkills: string[];
}

/**
 * A command's references to skills
 */
export interface CommandSkillRefs {
  /** Command name (file basename without extension) */
  command: string;
  /** Skill names this command invokes */
  referencedSkills: string[];
}

/**
 * Context for cross-entity validation — provides discovered entities
 * and their cross-references without requiring filesystem access.
 */
export interface CrossEntityContext {
  /** Agent file basenames (e.g., ['sm', 'dev', 'tea']) from agents/ directory */
  knownAgentFiles: string[];
  /** Workflow names (e.g., ['tdd', 'trivial']) from workflows/ directory */
  knownWorkflowNames: string[];
  /** Command file basenames (e.g., ['pf-sprint', 'pf-dev']) from commands/ directory */
  knownCommandFiles: string[];
  /** Skill names (e.g., ['pf-sprint', 'pf-testing']) from skills/ directory or registry */
  knownSkillNames: string[];

  /** Workflows with their agent references (from parsed phase definitions) */
  workflowAgentRefs: WorkflowAgentRefs[];
  /** Agents with their workflow references (from parsed agent files) */
  agentWorkflowRefs: AgentWorkflowRefs[];
  /** Skills with their cross-references (from skill-registry.yaml) */
  skillEntityRefs: SkillEntityRefs[];
  /** Commands with their skill references (from parsed command files) */
  commandSkillRefs: CommandSkillRefs[];
}

/**
 * Error details for cross-entity validation failures
 */
export interface CrossEntityError {
  /** Field path or entity reference (e.g., "workflow[tdd].agent[ghost]") */
  field: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Warning details for cross-entity advisory issues
 */
export interface CrossEntityWarning {
  /** Field path or entity reference */
  field: string;
  /** Human-readable warning message */
  message: string;
}

/**
 * Result of cross-entity validation
 */
export interface CrossEntityValidationResult {
  /** Whether all cross-entity references are valid (no errors) */
  valid: boolean;
  /** Validation errors (blocking issues) */
  errors?: CrossEntityError[];
  /** Validation warnings (advisory issues) */
  warnings?: CrossEntityWarning[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates cross-entity references between agents, workflows, commands, and skills.
 *
 * Assumes entities have already passed structural/schema validation (Layers 0-3).
 * This function checks semantic cross-references:
 * - AC1: Agents referenced in workflows exist
 * - AC2: Workflows referenced by agents are defined
 * - AC3: Skills' related_skills references exist
 * - AC4: Commands' skill references exist
 * - AC5: Bidirectional consistency
 *
 * @param context - Discovered entities and their cross-references
 * @returns Validation result with errors and warnings
 */
export function validateCrossEntityRefs(
  context: CrossEntityContext,
): CrossEntityValidationResult {
  // STUB: Always returns valid. Tests will fail on assertion (RED state).
  return { valid: true };
}
