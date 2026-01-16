/**
 * Workflow Schema Validation
 *
 * Defines types and validation for workflow definitions.
 * See pennyfarthing-dist/guides/workflow-schema.md for spec.
 */
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
export function validateWorkflow(input) {
    const errors = [];
    // Check input is an object
    if (!input || typeof input !== 'object') {
        return {
            valid: false,
            errors: [{ field: 'workflow', message: 'Input must be an object' }]
        };
    }
    const inputObj = input;
    // Check for root 'workflow' key
    if (!('workflow' in inputObj) || !inputObj.workflow || typeof inputObj.workflow !== 'object') {
        return {
            valid: false,
            errors: [{ field: 'workflow', message: 'Missing required root "workflow" key' }]
        };
    }
    const workflowObj = inputObj.workflow;
    // Validate workflow.name (required, string)
    if (!('name' in workflowObj) || workflowObj.name === undefined || workflowObj.name === null) {
        errors.push({ field: 'workflow.name', message: 'Name is required' });
    }
    else if (typeof workflowObj.name !== 'string') {
        errors.push({ field: 'workflow.name', message: 'Name must be a string' });
    }
    // Validate workflow.phases (required, array with at least one phase)
    if (!('phases' in workflowObj) || workflowObj.phases === undefined) {
        errors.push({ field: 'workflow.phases', message: 'Phases is required' });
    }
    else if (!Array.isArray(workflowObj.phases)) {
        errors.push({ field: 'workflow.phases', message: 'Phases must be an array' });
    }
    else if (workflowObj.phases.length === 0) {
        errors.push({ field: 'workflow.phases', message: 'Workflow must have at least one phase' });
    }
    else {
        // Validate each phase
        const phases = workflowObj.phases;
        phases.forEach((phase, index) => {
            if (!phase || typeof phase !== 'object') {
                errors.push({ field: `workflow.phases[${index}]`, message: 'Phase must be an object' });
                return;
            }
            const phaseObj = phase;
            // Phase name (required)
            if (!('name' in phaseObj) || phaseObj.name === undefined || phaseObj.name === null) {
                errors.push({ field: `workflow.phases[${index}].name`, message: 'Phase name is required' });
            }
            else if (typeof phaseObj.name !== 'string') {
                errors.push({ field: `workflow.phases[${index}].name`, message: 'Phase name must be a string' });
            }
            // Phase agent (required)
            if (!('agent' in phaseObj) || phaseObj.agent === undefined || phaseObj.agent === null) {
                errors.push({ field: `workflow.phases[${index}].agent`, message: 'Phase agent is required' });
            }
            else if (typeof phaseObj.agent !== 'string') {
                errors.push({ field: `workflow.phases[${index}].agent`, message: 'Phase agent must be a string' });
            }
            // Phase gate (optional, but if present must have type)
            if ('gate' in phaseObj && phaseObj.gate !== undefined) {
                if (!phaseObj.gate || typeof phaseObj.gate !== 'object') {
                    errors.push({ field: `workflow.phases[${index}].gate`, message: 'Gate must be an object' });
                }
                else {
                    const gateObj = phaseObj.gate;
                    if (!('type' in gateObj) || gateObj.type === undefined || gateObj.type === null) {
                        errors.push({ field: `workflow.phases[${index}].gate.type`, message: 'Gate type is required' });
                    }
                    else if (typeof gateObj.type !== 'string') {
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
        }
        else {
            const triggersObj = workflowObj.triggers;
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
                }
                else {
                    const pointsObj = triggersObj.points;
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
                    if ('min' in pointsObj && 'max' in pointsObj &&
                        typeof pointsObj.min === 'number' && typeof pointsObj.max === 'number' &&
                        pointsObj.min > pointsObj.max) {
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
    const phases = workflowObj.phases.map((phase) => {
        const result = {
            name: phase.name,
            agent: phase.agent
        };
        if (phase.input !== undefined) {
            result.input = phase.input;
        }
        if (phase.output !== undefined) {
            result.output = phase.output;
        }
        if (phase.gate !== undefined) {
            const gateObj = phase.gate;
            result.gate = {
                type: gateObj.type
            };
            if (gateObj.condition !== undefined) {
                result.gate.condition = gateObj.condition;
            }
        }
        return result;
    });
    const workflow = {
        name: workflowObj.name,
        phases
    };
    if (workflowObj.description !== undefined) {
        workflow.description = workflowObj.description;
    }
    if (workflowObj.version !== undefined) {
        workflow.version = workflowObj.version;
    }
    if (workflowObj.triggers !== undefined) {
        const triggersObj = workflowObj.triggers;
        const triggers = {};
        if (triggersObj.tags !== undefined) {
            triggers.tags = triggersObj.tags;
        }
        if (triggersObj.types !== undefined) {
            triggers.types = triggersObj.types;
        }
        if (triggersObj.points !== undefined) {
            const pointsObj = triggersObj.points;
            triggers.points = {};
            if (pointsObj.min !== undefined) {
                triggers.points.min = pointsObj.min;
            }
            if (pointsObj.max !== undefined) {
                triggers.points.max = pointsObj.max;
            }
        }
        if (triggersObj.default !== undefined) {
            triggers.default = triggersObj.default;
        }
        workflow.triggers = triggers;
    }
    return { valid: true, workflow };
}
//# sourceMappingURL=workflow-schema.js.map