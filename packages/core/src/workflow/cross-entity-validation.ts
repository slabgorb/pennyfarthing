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
  const errors: CrossEntityError[] = [];
  const warnings: CrossEntityWarning[] = [];

  const agentFileSet = new Set(context.knownAgentFiles);
  const workflowNameSet = new Set(context.knownWorkflowNames);
  const skillNameSet = new Set(context.knownSkillNames);

  // AC1: Agents referenced in workflows must exist as agent files
  for (const wfRef of context.workflowAgentRefs) {
    for (const agent of wfRef.referencedAgents) {
      if (!agentFileSet.has(agent)) {
        errors.push({
          field: `workflow[${wfRef.workflow}].agent[${agent}]`,
          message: `Agent '${agent}' referenced in workflow '${wfRef.workflow}' has no agent file`,
        });
      }
    }
  }

  // AC2: Workflows referenced by agents must be defined
  for (const agRef of context.agentWorkflowRefs) {
    for (const wf of agRef.referencedWorkflows) {
      if (!workflowNameSet.has(wf)) {
        errors.push({
          field: `agent[${agRef.agent}].workflow[${wf}]`,
          message: `Workflow '${wf}' referenced by agent '${agRef.agent}' is not defined`,
        });
      }
    }
  }

  // AC3: Skills' related_skills must exist in the registry
  for (const skillRef of context.skillEntityRefs) {
    for (const related of skillRef.relatedSkills) {
      if (related === skillRef.skill) {
        warnings.push({
          field: `skill[${skillRef.skill}].related_skills`,
          message: `Skill '${skillRef.skill}' lists itself as a related skill (self-reference)`,
        });
        continue;
      }
      if (!skillNameSet.has(related)) {
        errors.push({
          field: `skill[${skillRef.skill}].related_skills[${related}]`,
          message: `Related skill '${related}' referenced by skill '${skillRef.skill}' does not exist`,
        });
      }
    }
  }

  // AC4: Skills referenced by commands must exist
  for (const cmdRef of context.commandSkillRefs) {
    for (const skill of cmdRef.referencedSkills) {
      if (!skillNameSet.has(skill)) {
        errors.push({
          field: `command[${cmdRef.command}].skill[${skill}]`,
          message: `Skill '${skill}' referenced by command '${cmdRef.command}' does not exist`,
        });
      }
    }
  }

  // AC5: Bidirectional consistency — workflow↔agent
  // Build lookup maps for bidirectional checks
  const workflowToAgents = new Map<string, Set<string>>();
  for (const wfRef of context.workflowAgentRefs) {
    workflowToAgents.set(wfRef.workflow, new Set(wfRef.referencedAgents));
  }

  const agentToWorkflows = new Map<string, Set<string>>();
  for (const agRef of context.agentWorkflowRefs) {
    agentToWorkflows.set(agRef.agent, new Set(agRef.referencedWorkflows));
  }

  // Check: workflow references agent, but agent doesn't claim that workflow
  for (const [workflow, agents] of workflowToAgents) {
    for (const agent of agents) {
      const agentWfs = agentToWorkflows.get(agent);
      if (agentWfs && !agentWfs.has(workflow)) {
        warnings.push({
          field: `bidirectional[${workflow}↔${agent}]`,
          message: `Workflow '${workflow}' references agent '${agent}', but '${agent}' does not list '${workflow}' in its workflow references`,
        });
      }
    }
  }

  // Check: agent claims workflow, but workflow doesn't reference agent
  for (const [agent, workflows] of agentToWorkflows) {
    for (const workflow of workflows) {
      const wfAgents = workflowToAgents.get(workflow);
      if (wfAgents && !wfAgents.has(agent)) {
        warnings.push({
          field: `bidirectional[${agent}↔${workflow}]`,
          message: `Agent '${agent}' claims workflow '${workflow}', but '${workflow}' does not reference '${agent}'`,
        });
      }
    }
  }

  // AC5: Bidirectional consistency — related_skills symmetry
  const skillToRelated = new Map<string, Set<string>>();
  for (const skillRef of context.skillEntityRefs) {
    skillToRelated.set(skillRef.skill, new Set(skillRef.relatedSkills));
  }

  for (const [skill, relatedSet] of skillToRelated) {
    for (const related of relatedSet) {
      if (related === skill) continue; // self-ref already warned
      const reverseSet = skillToRelated.get(related);
      if (reverseSet && !reverseSet.has(skill)) {
        warnings.push({
          field: `bidirectional[${skill}↔${related}]`,
          message: `Skill '${skill}' lists '${related}' as related, but '${related}' does not list '${skill}' back (asymmetric)`,
        });
      }
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    ...(errors.length > 0 ? { errors } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
