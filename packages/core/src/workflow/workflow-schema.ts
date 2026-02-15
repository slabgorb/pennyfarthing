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
    /** Gate type: tests_pass, tests_fail, approval, manual */
    type?: string;
    /** Gate file path (relative, no traversal) */
    file?: string;
    /** Additional condition description (optional) */
    condition?: string;
  };
  /** Tandem backseat observer configuration (optional) */
  tandem?: {
    /** Agent name to run as backseat observer */
    partner: string;
    /** Observation scope(s): file-watch, tool-watch, context-watch */
    scope?: string | string[];
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
 * Permission preset required by a workflow
 */
export interface WorkflowPermissionPreset {
  /** Tool name (e.g., "Bash", "Read", "WebFetch") */
  tool: string;
  /** Scope pattern for the permission */
  scope: string;
  /** Human-readable reason shown when prompting for permission */
  reason: string;
}

/**
 * Steps configuration for stepped workflows
 */
export interface WorkflowSteps {
  /** Directory containing step files */
  path: string;
  /** Naming pattern for step files (e.g., "step-{nn}-*.md") */
  pattern: string;
}

/**
 * Tri-modal configuration for stepped workflows
 */
export interface WorkflowModes {
  /** Default mode: 'create' | 'validate' | 'edit' */
  default: 'create' | 'validate' | 'edit';
  /** Path to create mode steps */
  create?: string;
  /** Path to validate mode steps */
  validate?: string;
  /** Path to edit mode steps */
  edit?: string;
}

/**
 * Gate configuration for stepped workflows
 */
export interface WorkflowSteppedGates {
  /** Step numbers after which to pause for user approval */
  after_steps?: number[];
  /** Marker string to detect gates in step file content */
  gate_marker?: string;
}

/**
 * Complete workflow definition
 * Supports both phased (traditional) and stepped (BMAD-style) workflows
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  name: string;
  /** Human-readable description (optional) */
  description?: string;
  /** Semver version for tracking changes (optional) */
  version?: string;
  /** Workflow type: 'phased' (default) or 'stepped' */
  type?: 'phased' | 'stepped';
  /** Ordered list of phases (required for phased workflows) */
  phases?: WorkflowPhase[];
  /** Primary agent for stepped workflows */
  agent?: string;
  /** Steps configuration (required for stepped workflows) */
  steps?: WorkflowSteps;
  /** Tri-modal configuration (optional, stepped only) */
  modes?: WorkflowModes;
  /** Variable definitions for stepped workflows */
  variables?: Record<string, unknown>;
  /** Gate configuration for stepped workflows */
  gates?: WorkflowSteppedGates;
  /** Output template path for stepped workflows */
  template?: string;
  /** Rules for automatic workflow selection (optional) */
  triggers?: WorkflowTriggers;
  /** Permission presets required by this workflow (optional) */
  permissions?: WorkflowPermissionPreset[];
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

  // Determine workflow type (default to 'phased' for backward compatibility)
  const workflowType = ('type' in workflowObj && workflowObj.type !== undefined)
    ? workflowObj.type
    : 'phased';

  // Validate type field if present
  if ('type' in workflowObj && workflowObj.type !== undefined) {
    if (workflowObj.type !== 'phased' && workflowObj.type !== 'stepped') {
      errors.push({ field: 'workflow.type', message: 'Type must be "phased" or "stepped"' });
    }
  }

  const isStepped = workflowType === 'stepped';
  const hasPhases = 'phases' in workflowObj && workflowObj.phases !== undefined;
  const hasSteps = 'steps' in workflowObj && workflowObj.steps !== undefined;

  // Validate mutual exclusivity: stepped workflows cannot have phases
  if (isStepped && hasPhases) {
    errors.push({ field: 'workflow.phases', message: 'Stepped workflows cannot have phases (mutually exclusive)' });
  }

  // Validate stepped workflow requirements
  if (isStepped) {
    // steps is required for stepped workflows
    if (!hasSteps) {
      errors.push({ field: 'workflow.steps', message: 'steps configuration is required for stepped workflows' });
    } else {
      // Validate steps object
      const stepsObj = workflowObj.steps as Record<string, unknown>;
      if (!stepsObj || typeof stepsObj !== 'object') {
        errors.push({ field: 'workflow.steps', message: 'Steps must be an object' });
      } else {
        // path is required and must be non-empty
        if (!('path' in stepsObj) || stepsObj.path === undefined || stepsObj.path === null) {
          errors.push({ field: 'workflow.steps.path', message: 'Steps path is required' });
        } else if (typeof stepsObj.path !== 'string') {
          errors.push({ field: 'workflow.steps.path', message: 'Steps path must be a string' });
        } else if (stepsObj.path.trim() === '') {
          errors.push({ field: 'workflow.steps.path', message: 'Steps path cannot be empty' });
        }
        // pattern is required and must be non-empty
        if (!('pattern' in stepsObj) || stepsObj.pattern === undefined || stepsObj.pattern === null) {
          errors.push({ field: 'workflow.steps.pattern', message: 'Steps pattern is required' });
        } else if (typeof stepsObj.pattern !== 'string') {
          errors.push({ field: 'workflow.steps.pattern', message: 'Steps pattern must be a string' });
        } else if (stepsObj.pattern.trim() === '') {
          errors.push({ field: 'workflow.steps.pattern', message: 'Steps pattern cannot be empty' });
        }
      }
    }

    // Validate modes (optional, but only valid for stepped)
    if ('modes' in workflowObj && workflowObj.modes !== undefined) {
      const modesObj = workflowObj.modes as Record<string, unknown>;
      if (!modesObj || typeof modesObj !== 'object') {
        errors.push({ field: 'workflow.modes', message: 'Modes must be an object' });
      } else {
        // default mode must be one of: create, validate, edit
        if ('default' in modesObj && modesObj.default !== undefined) {
          if (modesObj.default !== 'create' && modesObj.default !== 'validate' && modesObj.default !== 'edit') {
            errors.push({ field: 'workflow.modes.default', message: 'Modes default must be "create", "validate", or "edit"' });
          }
        }
        // Mode paths must be strings if present
        for (const mode of ['create', 'validate', 'edit']) {
          if (mode in modesObj && modesObj[mode] !== undefined && typeof modesObj[mode] !== 'string') {
            errors.push({ field: `workflow.modes.${mode}`, message: `Modes ${mode} must be a string` });
          }
        }
      }
    }

    // Validate stepped gates (optional)
    if ('gates' in workflowObj && workflowObj.gates !== undefined) {
      const gatesObj = workflowObj.gates as Record<string, unknown>;
      if (!gatesObj || typeof gatesObj !== 'object') {
        errors.push({ field: 'workflow.gates', message: 'Gates must be an object' });
      } else {
        // after_steps must be array of numbers if present
        if ('after_steps' in gatesObj && gatesObj.after_steps !== undefined) {
          if (!Array.isArray(gatesObj.after_steps)) {
            errors.push({ field: 'workflow.gates.after_steps', message: 'Gates after_steps must be an array' });
          } else {
            const afterSteps = gatesObj.after_steps as unknown[];
            afterSteps.forEach((step, index) => {
              if (typeof step !== 'number') {
                errors.push({ field: `workflow.gates.after_steps[${index}]`, message: 'Gates after_steps values must be numbers' });
              }
            });
          }
        }
        // gate_marker must be string if present
        if ('gate_marker' in gatesObj && gatesObj.gate_marker !== undefined) {
          if (typeof gatesObj.gate_marker !== 'string') {
            errors.push({ field: 'workflow.gates.gate_marker', message: 'Gates gate_marker must be a string' });
          }
        }
      }
    }

    // Validate template (optional, string)
    if ('template' in workflowObj && workflowObj.template !== undefined) {
      if (typeof workflowObj.template !== 'string') {
        errors.push({ field: 'workflow.template', message: 'Template must be a string' });
      }
    }

    // Validate variables (optional, object) - no additional constraints
    // variables can be any object shape

  } else {
    // Phased workflow validation

    // modes is only valid for stepped workflows
    if ('modes' in workflowObj && workflowObj.modes !== undefined) {
      errors.push({ field: 'workflow.modes', message: 'modes configuration is only valid for stepped workflows' });
    }
  }

  // Validate workflow.phases (required for phased workflows)
  if (!isStepped) {
    if (!hasPhases) {
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

      // Phase gate (optional, but if present must have type or file)
      if ('gate' in phaseObj && phaseObj.gate !== undefined) {
        if (!phaseObj.gate || typeof phaseObj.gate !== 'object') {
          errors.push({ field: `workflow.phases[${index}].gate`, message: 'Gate must be an object' });
        } else {
          const gateObj = phaseObj.gate as Record<string, unknown>;
          const validGateTypes = ['tests_pass', 'tests_fail', 'approval', 'manual', 'quality_pass', 'design_review', 'validation'];
          const hasType = 'type' in gateObj && gateObj.type !== undefined && gateObj.type !== null;
          const hasFile = 'file' in gateObj && gateObj.file !== undefined && gateObj.file !== null;

          // Must have at least type or file
          if (!hasType && !hasFile) {
            errors.push({ field: `workflow.phases[${index}].gate`, message: 'Gate requires type or file (or both)' });
          }

          // Validate type if present
          if (hasType) {
            if (typeof gateObj.type !== 'string') {
              errors.push({ field: `workflow.phases[${index}].gate.type`, message: 'Gate type must be a string' });
            } else if (!validGateTypes.includes(gateObj.type)) {
              errors.push({ field: `workflow.phases[${index}].gate.type`, message: `Unknown gate type '${gateObj.type}'. Valid types: ${validGateTypes.join(', ')}` });
            }
          }

          // Validate file if present
          if (hasFile) {
            if (typeof gateObj.file !== 'string') {
              errors.push({ field: `workflow.phases[${index}].gate.file`, message: 'gate.file must be a string (e.g. "gates/tests-pass")' });
            } else if (gateObj.file === '') {
              errors.push({ field: `workflow.phases[${index}].gate.file`, message: 'gate.file cannot be empty' });
            } else if ((gateObj.file as string).includes('..')) {
              errors.push({ field: `workflow.phases[${index}].gate.file`, message: 'gate.file must not contain path traversal (..)' });
            } else if ((gateObj.file as string).startsWith('/')) {
              errors.push({ field: `workflow.phases[${index}].gate.file`, message: 'gate.file must be a relative path, not absolute' });
            }
          }

          // Validate condition if present
          if ('condition' in gateObj && gateObj.condition !== undefined && gateObj.condition !== null) {
            if (typeof gateObj.condition !== 'string') {
              errors.push({ field: `workflow.phases[${index}].gate.condition`, message: 'Gate condition must be a string' });
            }
          }
        }
      }

      // Phase tandem (optional, but if present must be object with partner)
      if ('tandem' in phaseObj && phaseObj.tandem !== undefined) {
        if (!phaseObj.tandem || typeof phaseObj.tandem !== 'object') {
          errors.push({ field: `workflow.phases[${index}].tandem`, message: 'Tandem must be an object' });
        } else {
          const tandemObj = phaseObj.tandem as Record<string, unknown>;
          // partner (required, string)
          if (!('partner' in tandemObj) || tandemObj.partner === undefined || tandemObj.partner === null) {
            errors.push({ field: `workflow.phases[${index}].tandem.partner`, message: 'Tandem partner is required' });
          } else if (typeof tandemObj.partner !== 'string') {
            errors.push({ field: `workflow.phases[${index}].tandem.partner`, message: 'Tandem partner must be a string' });
          }
          // scope (optional, string or string[])
          const validScopes = ['file-watch', 'tool-watch', 'context-watch'];
          if ('scope' in tandemObj && tandemObj.scope !== undefined) {
            if (typeof tandemObj.scope === 'string') {
              if (!validScopes.includes(tandemObj.scope)) {
                errors.push({ field: `workflow.phases[${index}].tandem.scope`, message: `Tandem scope must be one of: ${validScopes.join(', ')}` });
              }
            } else if (Array.isArray(tandemObj.scope)) {
              (tandemObj.scope as unknown[]).forEach((s, sIndex) => {
                if (typeof s !== 'string' || !validScopes.includes(s)) {
                  errors.push({ field: `workflow.phases[${index}].tandem.scope[${sIndex}]`, message: `Tandem scope must be one of: ${validScopes.join(', ')}` });
                }
              });
            } else {
              errors.push({ field: `workflow.phases[${index}].tandem.scope`, message: `Tandem scope must be a string or array of: ${validScopes.join(', ')}` });
            }
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

  // Validate permissions (optional, array of permission presets)
  if ('permissions' in workflowObj && workflowObj.permissions !== undefined) {
    if (!Array.isArray(workflowObj.permissions)) {
      errors.push({ field: 'workflow.permissions', message: 'Permissions must be an array' });
    } else {
      const permissions = workflowObj.permissions as unknown[];
      permissions.forEach((permission, index) => {
        if (!permission || typeof permission !== 'object') {
          errors.push({ field: `workflow.permissions[${index}]`, message: 'Permission must be an object' });
          return;
        }

        const permObj = permission as Record<string, unknown>;

        // tool (required, string)
        if (!('tool' in permObj) || permObj.tool === undefined || permObj.tool === null) {
          errors.push({ field: `workflow.permissions[${index}].tool`, message: 'Permission tool is required' });
        } else if (typeof permObj.tool !== 'string') {
          errors.push({ field: `workflow.permissions[${index}].tool`, message: 'Permission tool must be a string' });
        }

        // scope (required, string)
        if (!('scope' in permObj) || permObj.scope === undefined || permObj.scope === null) {
          errors.push({ field: `workflow.permissions[${index}].scope`, message: 'Permission scope is required' });
        } else if (typeof permObj.scope !== 'string') {
          errors.push({ field: `workflow.permissions[${index}].scope`, message: 'Permission scope must be a string' });
        }

        // reason (required, string)
        if (!('reason' in permObj) || permObj.reason === undefined || permObj.reason === null) {
          errors.push({ field: `workflow.permissions[${index}].reason`, message: 'Permission reason is required' });
        } else if (typeof permObj.reason !== 'string') {
          errors.push({ field: `workflow.permissions[${index}].reason`, message: 'Permission reason must be a string' });
        }
      });
    }
  }

  // If there are errors, return invalid result
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build the validated workflow object
  const workflow: WorkflowDefinition = {
    name: workflowObj.name as string
  };

  // Set type (default to phased for backward compatibility)
  if ('type' in workflowObj && workflowObj.type !== undefined) {
    workflow.type = workflowObj.type as 'phased' | 'stepped';
  }

  // Determine if stepped for conditional field handling
  const isSteppedWorkflow = workflow.type === 'stepped';

  // Build phases array for phased workflows
  if (!isSteppedWorkflow && workflowObj.phases !== undefined) {
    workflow.phases = (workflowObj.phases as Record<string, unknown>[]).map((phase): WorkflowPhase => {
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
        result.gate = {};
        if (gateObj.type !== undefined) {
          result.gate.type = gateObj.type as string;
        }
        if (gateObj.file !== undefined) {
          (result.gate as Record<string, unknown>).file = gateObj.file as string;
        }
        if (gateObj.condition !== undefined) {
          result.gate.condition = gateObj.condition as string;
        }
      }
      if (phase.tandem !== undefined) {
        const tandemObj = phase.tandem as Record<string, unknown>;
        result.tandem = {
          partner: tandemObj.partner as string
        };
        if (tandemObj.scope !== undefined) {
          result.tandem.scope = tandemObj.scope as string | string[];
        }
      }

      return result;
    });
  }

  // Build stepped workflow fields
  if (isSteppedWorkflow) {
    // agent (optional for stepped workflows)
    if (workflowObj.agent !== undefined) {
      workflow.agent = workflowObj.agent as string;
    }

    // steps (required for stepped, already validated)
    if (workflowObj.steps !== undefined) {
      const stepsObj = workflowObj.steps as Record<string, unknown>;
      workflow.steps = {
        path: stepsObj.path as string,
        pattern: stepsObj.pattern as string
      };
    }

    // modes (optional)
    if (workflowObj.modes !== undefined) {
      const modesObj = workflowObj.modes as Record<string, unknown>;
      workflow.modes = {
        default: modesObj.default as 'create' | 'validate' | 'edit'
      };
      if (modesObj.create !== undefined) {
        workflow.modes.create = modesObj.create as string;
      }
      if (modesObj.validate !== undefined) {
        workflow.modes.validate = modesObj.validate as string;
      }
      if (modesObj.edit !== undefined) {
        workflow.modes.edit = modesObj.edit as string;
      }
    }

    // variables (optional)
    if (workflowObj.variables !== undefined) {
      workflow.variables = workflowObj.variables as Record<string, unknown>;
    }

    // gates (optional, stepped workflow gates)
    if (workflowObj.gates !== undefined) {
      const gatesObj = workflowObj.gates as Record<string, unknown>;
      workflow.gates = {};
      if (gatesObj.after_steps !== undefined) {
        workflow.gates.after_steps = gatesObj.after_steps as number[];
      }
      if (gatesObj.gate_marker !== undefined) {
        workflow.gates.gate_marker = gatesObj.gate_marker as string;
      }
    }

    // template (optional)
    if (workflowObj.template !== undefined) {
      workflow.template = workflowObj.template as string;
    }
  }

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

  // Build permissions array if present
  if (workflowObj.permissions !== undefined) {
    const permissionsArr = workflowObj.permissions as Record<string, unknown>[];
    workflow.permissions = permissionsArr.map((perm): WorkflowPermissionPreset => ({
      tool: perm.tool as string,
      scope: perm.scope as string,
      reason: perm.reason as string,
    }));
  }

  return { valid: true, workflow };
}
