import { Router } from 'express';
/**
 * Agent character mapping from theme
 */
export interface AgentCharacterMap {
    [role: string]: {
        character: string;
        shortName?: string;
    };
}
/**
 * Get all agent-to-character mappings from current theme
 * @param projectDir - The project directory
 * @returns Map of role -> character data
 */
export declare function getThemeAgents(projectDir: string): AgentCharacterMap | null;
/**
 * Create theme agents API router
 */
export declare function createThemeAgentsRouter(getProjectDir: () => string): Router;
//# sourceMappingURL=theme-agents.d.ts.map