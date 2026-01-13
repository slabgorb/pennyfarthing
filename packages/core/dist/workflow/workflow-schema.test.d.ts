/**
 * Tests for Story 31-1: Workflow Definition Schema
 *
 * These tests define the contract for workflow YAML validation.
 * The loader (31-2) will implement validateWorkflow() to pass these tests.
 *
 * Schema requirements:
 * - Required: workflow.name, workflow.phases (at least one), phases[].name, phases[].agent
 * - Optional: description, version, phases[].input/output/gate, triggers
 *
 * Run with: npm test
 */
export interface WorkflowValidationErrorType {
    field: string;
    message: string;
}
export interface WorkflowValidationResultType {
    valid: boolean;
    workflow?: {
        name: string;
        description?: string;
        version?: string;
        phases: Array<{
            name: string;
            agent: string;
            input?: string[];
            output?: string[];
            gate?: {
                type: string;
                condition?: string;
            };
        }>;
        triggers?: {
            tags?: string[];
            types?: string[];
            points?: {
                min?: number;
                max?: number;
            };
            default?: boolean;
        };
    };
    errors?: WorkflowValidationErrorType[];
}
//# sourceMappingURL=workflow-schema.test.d.ts.map