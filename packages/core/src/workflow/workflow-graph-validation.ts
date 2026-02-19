/**
 * Workflow Graph Validation (Story 91-14)
 *
 * Semantic/graph-level validation for workflow definitions.
 * Complements workflow-schema.ts (structural validation) with:
 * - Phase reachability analysis
 * - Duplicate phase name detection
 * - Agent reference validation (phase agents, tandem partners, team members)
 * - Gate file existence checking
 * - Data flow validation (input/output wiring)
 * - Collaboration validation (tandem/team consistency)
 */

import { VALID_AGENT_NAMES, type WorkflowDefinition, type WorkflowPhase } from './workflow-schema.js';

/**
 * Error details for graph validation failures
 */
export interface WorkflowGraphError {
  /** Field path (e.g., "phases[1].agent") */
  field: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Warning details for non-critical graph issues
 */
export interface WorkflowGraphWarning {
  /** Field path */
  field: string;
  /** Human-readable warning message */
  message: string;
}

/**
 * Context for graph validation — provides external knowledge
 * (gate files, agent registry) without requiring filesystem access.
 */
export interface GraphValidationContext {
  /** Known gate file paths (e.g., ["gates/tests-pass", "gates/approval"]) */
  knownGateFiles: string[];
  /** Known agent names. Defaults to VALID_AGENT_NAMES if not provided. */
  knownAgents?: string[];
}

/**
 * Result of workflow graph validation
 */
export interface WorkflowGraphValidationResult {
  /** Whether the workflow graph is valid (no errors) */
  valid: boolean;
  /** Validation errors (blocking issues) */
  errors?: WorkflowGraphError[];
  /** Validation warnings (advisory issues) */
  warnings?: WorkflowGraphWarning[];
}

/**
 * Validates the graph semantics of a workflow definition.
 *
 * Assumes the workflow has already passed structural validation
 * via validateWorkflow(). This function checks semantic correctness:
 * reachability, references, data flow, and collaboration consistency.
 *
 * @param workflow - A structurally valid WorkflowDefinition
 * @param context - External context (known gates, agents)
 * @returns Graph validation result with errors and warnings
 */
export function validateWorkflowGraph(
  workflow: WorkflowDefinition,
  context: GraphValidationContext,
): WorkflowGraphValidationResult {
  const errors: WorkflowGraphError[] = [];
  const warnings: WorkflowGraphWarning[] = [];

  const phases = workflow.phases;

  // Stepped workflows or workflows without phases skip phase-level checks
  if (!phases || phases.length === 0) {
    return { valid: true };
  }

  const agents = context.knownAgents ?? [...VALID_AGENT_NAMES];
  const agentSet = new Set(agents);
  const gateSet = new Set(context.knownGateFiles);

  // Build phase name → index map
  const phaseNameToIndex = new Map<string, number>();

  // Check 1: Duplicate phase names
  for (let i = 0; i < phases.length; i++) {
    const name = phases[i].name;
    if (phaseNameToIndex.has(name)) {
      errors.push({
        field: `phases[${i}].name`,
        message: `Duplicate phase name '${name}' (first at index ${phaseNameToIndex.get(name)})`,
      });
    } else {
      phaseNameToIndex.set(name, i);
    }
  }

  // Check 2: Phase reachability via graph traversal
  checkReachability(phases, phaseNameToIndex, errors);

  // Per-phase checks
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];

    // Check 3: Agent reference validation
    if (!agentSet.has(phase.agent)) {
      errors.push({
        field: `phases[${i}].agent`,
        message: `Unknown agent '${phase.agent}'. Valid agents: ${agents.join(', ')}`,
      });
    }

    // Check 3b: Tandem partner validation
    if (phase.tandem) {
      if (!agentSet.has(phase.tandem.partner)) {
        errors.push({
          field: `phases[${i}].tandem.partner`,
          message: `Unknown tandem partner '${phase.tandem.partner}'. Valid agents: ${agents.join(', ')}`,
        });
      }
      // Collaboration: self-tandem warning
      if (phase.tandem.partner === phase.agent) {
        warnings.push({
          field: `phases[${i}].tandem.partner`,
          message: `Tandem partner is same as phase agent '${phase.agent}' (self-tandem)`,
        });
      }
    }

    // Check 3c: Team teammate validation
    if (phase.team?.teammates) {
      const seenTeammates = new Set<string>();
      for (let t = 0; t < phase.team.teammates.length; t++) {
        const teammate = phase.team.teammates[t];

        if (!agentSet.has(teammate.agent)) {
          errors.push({
            field: `phases[${i}].team.teammates[${t}].agent`,
            message: `Unknown team agent '${teammate.agent}'. Valid agents: ${agents.join(', ')}`,
          });
        }

        // Collaboration: teammate same as lead
        if (teammate.agent === phase.agent) {
          errors.push({
            field: `phases[${i}].team.teammates[${t}].agent`,
            message: `Team teammate '${teammate.agent}' is same as phase lead — lead cannot be their own teammate`,
          });
        }

        // Collaboration: duplicate teammates
        if (seenTeammates.has(teammate.agent)) {
          errors.push({
            field: `phases[${i}].team.teammates[${t}].agent`,
            message: `Duplicate teammate '${teammate.agent}' in team`,
          });
        }
        seenTeammates.add(teammate.agent);
      }
    }

    // Check 4: Gate file existence
    const gateFile = phase.gate?.file;
    if (gateFile && !gateSet.has(gateFile)) {
      errors.push({
        field: `phases[${i}].gate.file`,
        message: `Gate file '${gateFile}' not found in known gate files`,
      });
    }
  }

  // Check 5: Data flow validation
  checkDataFlow(phases, warnings);

  const valid = errors.length === 0;
  return {
    valid,
    ...(errors.length > 0 ? { errors } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Walks the phase graph from the first phase, following `next:` overrides
 * or sequential progression. Reports unreachable phases.
 */
function checkReachability(
  phases: WorkflowPhase[],
  phaseNameToIndex: Map<string, number>,
  errors: WorkflowGraphError[],
): void {
  const visited = new Set<number>();
  const maxSteps = phases.length * 2; // prevent infinite loops on cycles
  let steps = 0;

  let current = 0;
  while (current < phases.length && steps < maxSteps) {
    if (visited.has(current)) break; // cycle detected, stop
    visited.add(current);
    steps++;

    const phase = phases[current];
    if (phase.next) {
      const nextIndex = phaseNameToIndex.get(phase.next);
      if (nextIndex !== undefined) {
        current = nextIndex;
      } else {
        break; // dangling next reference (schema validator catches this)
      }
    } else {
      current++;
    }
  }

  // Any phase not visited is unreachable
  for (let i = 0; i < phases.length; i++) {
    if (!visited.has(i)) {
      errors.push({
        field: `phases[${i}]`,
        message: `Phase '${phases[i].name}' is unreachable from the workflow start`,
      });
    }
  }
}

/**
 * Checks that phase inputs are produced by outputs of earlier phases.
 * Unresolved inputs generate warnings (advisory, not blocking).
 */
function checkDataFlow(
  phases: WorkflowPhase[],
  warnings: WorkflowGraphWarning[],
): void {
  const availableOutputs = new Set<string>();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];

    // Check inputs against available outputs
    if (phase.input) {
      for (const inp of phase.input) {
        if (!availableOutputs.has(inp)) {
          warnings.push({
            field: `phases[${i}].input`,
            message: `Input '${inp}' in phase '${phase.name}' is not produced by any prior phase output`,
          });
        }
      }
    }

    // Add this phase's outputs to the available set
    if (phase.output) {
      for (const out of phase.output) {
        availableOutputs.add(out);
      }
    }
  }
}
