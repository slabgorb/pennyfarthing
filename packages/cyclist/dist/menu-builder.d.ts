/**
 * Menu Builder
 *
 * Electron menu definitions and builders for agents, workflows, and views.
 * Extracted from main.ts for better maintainability.
 */
type BroadcastFn = (channel: string, data: unknown) => void;
/**
 * Set the broadcast function (called from main.ts)
 */
export declare function setBroadcastFunction(fn: BroadcastFn): void;
/**
 * Agent definition for Electron menu
 */
export interface AgentDefinition {
    id: string;
    label: string;
    command: string;
    category: 'tactical' | 'strategic';
    accelerator?: string;
    description?: string;
}
/**
 * Workflow definition for Electron menu
 */
export interface WorkflowDefinition {
    id: string;
    label: string;
    command: string;
    accelerator?: string;
    description?: string;
}
/**
 * Pennyfarthing agent definitions for menu
 * Tactical agents follow the TDD flow: SM → TEA → Dev → Reviewer
 * Strategic agents handle architecture and planning
 */
export declare const AGENT_DEFINITIONS: AgentDefinition[];
/**
 * Pennyfarthing workflow definitions for menu
 */
export declare const WORKFLOW_DEFINITIONS: WorkflowDefinition[];
/**
 * Build Electron menu for agents
 * Groups agents by category with separator between tactical and strategic
 */
export declare function buildAgentMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build Electron menu for workflows
 */
export declare function buildWorkflowMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build Tools menu with Execution Log (Story 22-6)
 * Updated: toggles tool panel instead of showing modal
 */
export declare function buildToolsMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build custom View menu with Verbose Mode toggle (Story 22-5)
 * Includes standard view items plus custom Cyclist options
 */
export declare function buildViewMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Build the app menu (macOS style)
 */
export declare function buildAppMenu(): {
    label: string;
    submenu: unknown[];
};
/**
 * Get the menu template for testing
 * Returns the full menu structure including settings
 */
export declare function getMenuTemplate(): Array<{
    role?: string;
    label?: string;
    submenu?: Array<{
        label?: string;
        accelerator?: string;
        click?: () => void;
    }>;
}>;
/**
 * Register settings keyboard shortcut
 * Called during app initialization
 */
export declare function registerSettingsShortcut(): void;
export {};
//# sourceMappingURL=menu-builder.d.ts.map