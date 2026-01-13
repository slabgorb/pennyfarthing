/**
 * BMAD Project Context Reader - Story 32-4
 *
 * Parses BMAD project-context.md files and extracts technology stack,
 * implementation rules, and AI agent guidance for Pennyfarthing integration.
 */
export interface TechnologyStack {
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
export interface ImplementationRule {
    number: number;
    title: string;
    description: string;
}
export interface AiAgentGuidance {
    do?: string[];
    dont?: string[];
    contextLoading?: string;
}
export interface ExternalDependency {
    name: string;
    purpose: string;
    documentation: string;
}
export interface BmadProjectContext {
    overview: string;
    technologyStack: TechnologyStack;
    implementationRules: ImplementationRule[];
    projectStructure?: string;
    codingStandards?: string;
    aiAgentGuidance?: AiAgentGuidance;
    externalDependencies?: ExternalDependency[];
    environmentSetup?: string;
}
export interface ContextParseError {
    section: string;
    message: string;
    line?: number;
}
export interface ContextParseResult {
    success: boolean;
    context?: BmadProjectContext;
    errors?: ContextParseError[];
}
/**
 * Parse a BMAD project-context.md file and extract structured context.
 *
 * @param content - Raw markdown content of project-context.md
 * @returns ContextParseResult with success status and either context or errors
 */
export declare function parseBmadContext(content: string): ContextParseResult;
//# sourceMappingURL=context-reader.d.ts.map