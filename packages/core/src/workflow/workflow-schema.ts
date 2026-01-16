/**
 * Workflow Schema Validation
 *
 * Defines types and validation for workflow definitions.
 * See pennyfarthing-dist/guides/workflow-schema.md for spec.
 */

/**
 * Error details for validation failures
 */
export interface WorkflowValidationError {
  /** Field path that failed validation (e.g., "workflow.phases[0].agent") */
  field: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Phase definition within a workflow
 */
export interface WorkflowPhase {
  /** Unique name for this phase */
  name: string;
  /** Agent to invoke (sm, tea, dev, reviewer, etc.) */
  agent: string;
  /** What this phase receives from previous phases (optional) */
  input?: string[];
  /** What this phase produces for next phases (optional) */
  output?: string[];
  /** Conditions to proceed to next phase (optional) */
  gate?: {
    /** Gate type: tests_pass, tests_fail, approval, manual, etc. */
    type: string;
    /** Additional condition description (optional) */
    condition?: string;
  };
}

/**
 * Trigger rules for automatic workflow selection
 */
export interface WorkflowTriggers {
  /** Story tags that match this workflow */
  tags?: string[];
  /** Story types that match (feature, bug, chore, docs) */
  types?: string[];
  /** Point-based routing */
  points?: {
    min?: number;
    max?: number;
  };
  /** Use as fallback when no other workflow matches */
  default?: boolean;
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  name: string;
  /** Human-readable description (optional) */
  description?: string;
  /** Semver version for tracking changes (optional) */
  version?: string;
  /** Ordered list of phases */
  phases: WorkflowPhase[];
  /** Rules for automatic workflow selection (optional) */
  triggers?: WorkflowTriggers;
}

/**
 * Result of workflow validation
 */
export interface WorkflowValidationResult {
  /** Whether the workflow is valid */
  valid: boolean;
  /** Parsed workflow (only present if valid) */
  workflow?: WorkflowDefinition;
  /** Validation errors (only present if invalid) */
  errors?: WorkflowValidationError[];
}

/**
 * Validates a workflow definition object
 *
 * @param input - Raw workflow object (e.g., parsed from YAML)
 * @returns Validation result with parsed workflow or errors
 *
 * @example
 * ```typescript
 * const yaml = fs.readFileSync('workflow.yaml', 'utf-8');
 * const parsed = YAML.parse(yaml);
 * const result = validateWorkflow(parsed);
 *
 * if (result.valid) {
 *   console.log(`Workflow "${result.workflow.name}" is valid`);
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateWorkflow(input: unknown): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];

  // Check input is an object
  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'workflow', message: 'Input must be an object' }]
    };
  }

  const inputObj = input as Record<string, unknown>;

  // Check for root 'workflow' key
  if (!('workflow' in inputObj) || !inputObj.workflow || typeof inputObj.workflow !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'workflow', message: 'Missing required root "workflow" key' }]
    };
  }

  const workflowObj = inputObj.workflow as Record<string, unknown>;

  // Validate workflow.name (required, string)
  if (!('name' in workflowObj) || workflowObj.name === undefined || workflowObj.name === null) {
    errors.push({ field: 'workflow.name', message: 'Name is required' });
  } else if (typeof workflowObj.name !== 'string') {
    errors.push({ field: 'workflow.name', message: 'Name must be a string' });
  }

  // Validate workflow.phases (required, array with at least one phase)
  if (!('phases' in workflowObj) || workflowObj.phases === undefined) {
    errors.push({ field: 'workflow.phases', message: 'Phases is required' });
  } else if (!Array.isArray(workflowObj.phases)) {
    errors.push({ field: 'workflow.phases', message: 'Phases must be an array' });
  } else if (workflowObj.phases.length === 0) {
    errors.push({ field: 'workflow.phases', message: 'Workflow must have at least one phase' });
  } else {
    // Validate each phase
    const phases = workflowObj.phases as unknown[];
    phases.forEach((phase, index) => {
      if (!phase || typeof phase !== 'object') {
        errors.push({ field: `workflow.phases[${index}]`, message: 'Phase must be an object' });
        return;
      }

      const phaseObj = phase as Record<string, unknown>;

      // Phase name (required)
      if (!('name' in phaseObj) || phaseObj.name === undefined || phaseObj.name === null) {
        errors.push({ field: `workflow.phases[${index}].name`, message: 'Phase name is required' });
      } else if (typeof phaseObj.name !== 'string') {
        errors.push({ field: `workflow.phases[${index}].name`, message: 'Phase name must be a string' });
      }

      // Phase agent (required)
      if (!('agent' in phaseObj) || phaseObj.agent === undefined || phaseObj.agent === null) {
        errors.push({ field: `workflow.phases[${index}].agent`, message: 'Phase agent is required' });
      } else if (typeof phaseObj.agent !== 'string') {
        errors.push({ field: `workflow.phases[${index}].agent`, message: 'Phase agent must be a string' });
      }

      // Phase gate (optional, but if present must have type)
      if ('gate' in phaseObj && phaseObj.gate !== undefined) {
        if (!phaseObj.gate || typeof phaseObj.gate !== 'object') {
          errors.push({ field: `workflow.phases[${index}].gate`, message: 'Gate must be an object' });
        } else {
          const gateObj = phaseObj.gate as Record<string, unknown>;
          if (!('type' in gateObj) || gateObj.type === undefined || gateObj.type === null) {
            errors.push({ field: `workflow.phases[${index}].gate.type`, message: 'Gate type is required' });
          } else if (typeof gateObj.type !== 'string') {
            errors.push({ field: `workflow.phases[${index}].gate.type`, message: 'Gate type must be a string' });
          }
        }
      }

      // Phase input (optional, array of strings)
      if ('input' in phaseObj && phaseObj.input !== undefined) {
        if (!Array.isArray(phaseObj.input)) {
          errors.push({ field: `workflow.phases[${index}].input`, message: 'Input must be an array' });
        }
      }

      // Phase output (optional, array of strings)
      if ('output' in phaseObj && phaseObj.output !== undefined) {
        if (!Array.isArray(phaseObj.output)) {
          errors.push({ field: `workflow.phases[${index}].output`, message: 'Output must be an array' });
        }
      }
    });
  }

  // Validate triggers (optional)
  if ('triggers' in workflowObj && workflowObj.triggers !== undefined) {
    if (!workflowObj.triggers || typeof workflowObj.triggers !== 'object') {
      errors.push({ field: 'workflow.triggers', message: 'Triggers must be an object' });
    } else {
      const triggersObj = workflowObj.triggers as Record<string, unknown>;

      // tags (optional, array)
      if ('tags' in triggersObj && triggersObj.tags !== undefined) {
        if (!Array.isArray(triggersObj.tags)) {
          errors.push({ field: 'workflow.triggers.tags', message: 'Tags must be an array' });
        }
      }

      // types (optional, array)
      if ('types' in triggersObj && triggersObj.types !== undefined) {
        if (!Array.isArray(triggersObj.types)) {
          errors.push({ field: 'workflow.triggers.types', message: 'Types must be an array' });
        }
      }

      // points (optional, object with min/max)
      if ('points' in triggersObj && triggersObj.points !== undefined) {
        if (!triggersObj.points || typeof triggersObj.points !== 'object') {
          errors.push({ field: 'workflow.triggers.points', message: 'Points must be an object' });
        } else {
          const pointsObj = triggersObj.points as Record<string, unknown>;

          // min (optional, number)
          if ('min' in pointsObj && pointsObj.min !== undefined) {
            if (typeof pointsObj.min !== 'number') {
              errors.push({ field: 'workflow.triggers.points.min', message: 'Points min must be a number' });
            }
          }

          // max (optional, number)
          if ('max' in pointsObj && pointsObj.max !== undefined) {
            if (typeof pointsObj.max !== 'number') {
              errors.push({ field: 'workflow.triggers.points.max', message: 'Points max must be a number' });
            }
          }

          // Validate min <= max if both present and valid numbers
          if (
            'min' in pointsObj && 'max' in pointsObj &&
            typeof pointsObj.min === 'number' && typeof pointsObj.max === 'number' &&
            pointsObj.min > pointsObj.max
          ) {
            errors.push({ field: 'workflow.triggers.points', message: 'Points min cannot be greater than max' });
          }
        }
      }

      // default (optional, boolean)
      if ('default' in triggersObj && triggersObj.default !== undefined) {
        if (typeof triggersObj.default !== 'boolean') {
          errors.push({ field: 'workflow.triggers.default', message: 'Default must be a boolean' });
        }
      }
    }
  }

  // If there are errors, return invalid result
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build the validated workflow object
  const phases = (workflowObj.phases as Record<string, unknown>[]).map((phase): WorkflowPhase => {
    const result: WorkflowPhase = {
      name: phase.name as string,
      agent: phase.agent as string
    };

    if (phase.input !== undefined) {
      result.input = phase.input as string[];
    }
    if (phase.output !== undefined) {
      result.output = phase.output as string[];
    }
    if (phase.gate !== undefined) {
      const gateObj = phase.gate as Record<string, unknown>;
      result.gate = {
        type: gateObj.type as string
      };
      if (gateObj.condition !== undefined) {
        result.gate.condition = gateObj.condition as string;
      }
    }

    return result;
  });

  const workflow: WorkflowDefinition = {
    name: workflowObj.name as string,
    phases
  };

  if (workflowObj.description !== undefined) {
    workflow.description = workflowObj.description as string;
  }
  if (workflowObj.version !== undefined) {
    workflow.version = workflowObj.version as string;
  }
  if (workflowObj.triggers !== undefined) {
    const triggersObj = workflowObj.triggers as Record<string, unknown>;
    const triggers: WorkflowTriggers = {};

    if (triggersObj.tags !== undefined) {
      triggers.tags = triggersObj.tags as string[];
    }
    if (triggersObj.types !== undefined) {
      triggers.types = triggersObj.types as string[];
    }
    if (triggersObj.points !== undefined) {
      const pointsObj = triggersObj.points as Record<string, unknown>;
      triggers.points = {};
      if (pointsObj.min !== undefined) {
        triggers.points.min = pointsObj.min as number;
      }
      if (pointsObj.max !== undefined) {
        triggers.points.max = pointsObj.max as number;
      }
    }
    if (triggersObj.default !== undefined) {
      triggers.default = triggersObj.default as boolean;
    }

    workflow.triggers = triggers;
  }

  return { valid: true, workflow };
}
