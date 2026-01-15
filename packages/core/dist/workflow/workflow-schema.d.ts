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
export declare function validateWorkflow(input: unknown): WorkflowValidationResult;
//# sourceMappingURL=workflow-schema.d.ts.map