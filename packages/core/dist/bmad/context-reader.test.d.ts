/**
 * Tests for Story 32-4: BMAD Project Context Reader
 *
 * These tests define the contract for parsing BMAD project-context.md files.
 * Dev will implement parseBmadContext() to pass these tests.
 *
 * BMAD project-context format:
 * - Required: ## Overview, ## Technology Stack, ## Critical Implementation Rules
 * - Optional: ## Project Structure, ## Coding Standards, ## AI Agent Guidance,
 *             ## External Dependencies, ## Environment Setup
 *
 * Run with: npm test
 */
export interface TechnologyStackType {
    frontend?: {
        framework?: string;
        language?: string;
        stateManagement?: string;
        styling?: string;
        buildTool?: string;
    };
    backend?: {
        language?: string;
        framework?: string;
        database?: string;
        cache?: string;
        apiStyle?: string;
    };
    infrastructure?: {
        cloudProvider?: string;
        containerRuntime?: string;
        orchestration?: string;
        ciCd?: string;
    };
}
export interface ImplementationRuleType {
    number: number;
    title: string;
    description: string;
}
export interface AiAgentGuidanceType {
    do?: string[];
    dont?: string[];
    contextLoading?: string;
}
export interface ExternalDependencyType {
    name: string;
    purpose: string;
    documentation: string;
}
export interface BmadProjectContextType {
    overview: string;
    technologyStack: TechnologyStackType;
    implementationRules: ImplementationRuleType[];
    projectStructure?: string;
    codingStandards?: string;
    aiAgentGuidance?: AiAgentGuidanceType;
    externalDependencies?: ExternalDependencyType[];
    environmentSetup?: string;
}
export interface ContextParseResultType {
    success: boolean;
    context?: BmadProjectContextType;
    errors?: ContextParseErrorType[];
}
export interface ContextParseErrorType {
    section: string;
    message: string;
    line?: number;
}
//# sourceMappingURL=context-reader.test.d.ts.map