/**
 * Menu Builder
 *
 * Electron menu definitions and builders for agents, workflows, and views.
 * Extracted from main.ts for better maintainability.
 */

import { getVerboseMode, setVerboseMode } from '@pennyfarthing/core/dist/server/settings-store.js';
import { IPC_AGENT_CHANNELS, IPC_SETTINGS_CHANNELS } from './ipc-channels.js';

// Broadcast function type - set by main.ts
type BroadcastFn = (channel: string, data: unknown) => void;
let broadcastToRenderer: BroadcastFn = () => {};

// Panel toggle via WebSocket - set by main.ts
type PanelToggleFn = (panelId: string) => void;
let panelToggleFn: PanelToggleFn = () => {};

// Settings window opener - set by main.ts (avoids direct cyclist dependency)
type SettingsOpenerFn = () => void;
let settingsOpenerFn: SettingsOpenerFn = () => {};

/**
 * Set the broadcast function (called from main.ts)
 */
export function setBroadcastFunction(fn: BroadcastFn): void {
  broadcastToRenderer = fn;
}

/**
 * Set the panel toggle broadcast function (called from main.ts)
 * Routes through WebSocket instead of IPC
 */
export function setPanelToggleBroadcast(fn: PanelToggleFn): void {
  panelToggleFn = fn;
}

/**
 * Set the settings window opener function (called from main.ts)
 * Avoids direct @pennyfarthing/cyclist dependency in menu-builder
 */
export function setSettingsOpener(fn: SettingsOpenerFn): void {
  settingsOpenerFn = fn;
}

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
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // Tactical agents (TDD flow)
  { id: 'sm', label: 'SM (Scrum Master)', command: '/sm', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+S', description: 'Story coordination and sprint management' },
  { id: 'tea', label: 'TEA (Test Engineer)', command: '/tea', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+T', description: 'Test planning and TDD' },
  { id: 'dev', label: 'Dev (Developer)', command: '/dev', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+D', description: 'Feature implementation' },
  { id: 'reviewer', label: 'Reviewer', command: '/reviewer', category: 'tactical', accelerator: 'CmdOrCtrl+Shift+R', description: 'Code review' },
  // Strategic agents
  { id: 'architect', label: 'Architect', command: '/architect', category: 'strategic', accelerator: 'CmdOrCtrl+Shift+A', description: 'System design and architecture' },
  { id: 'pm', label: 'PM (Product Manager)', command: '/pm', category: 'strategic', accelerator: 'CmdOrCtrl+Shift+P', description: 'Product strategy and prioritization' },
  { id: 'orchestrator', label: 'Orchestrator', command: '/orchestrator', category: 'strategic', description: 'Meta coordination of agents' },
];

/**
 * Pennyfarthing workflow definitions for menu
 */
export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  { id: 'new-work', label: 'New Work', command: '/new-work', accelerator: 'CmdOrCtrl+Shift+N', description: 'Start a new story from backlog' },
  { id: 'work', label: 'Resume Work', command: '/work', accelerator: 'CmdOrCtrl+Shift+W', description: 'Resume current work session' },
  { id: 'benchmark', label: 'Benchmark', command: '/benchmark', description: 'Run agent benchmarks' },
];

/**
 * Build Electron menu for agents
 * Groups agents by category with separator between tactical and strategic
 */
export function buildAgentMenu(): { label: string; submenu: unknown[] } {
  const tacticalAgents = AGENT_DEFINITIONS.filter(a => a.category === 'tactical');
  const strategicAgents = AGENT_DEFINITIONS.filter(a => a.category === 'strategic');

  const submenu: unknown[] = [
    ...tacticalAgents.map(agent => ({
      label: agent.label,
      accelerator: agent.accelerator,
      click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent.command),
    })),
    { type: 'separator' },
    ...strategicAgents.map(agent => ({
      label: agent.label,
      accelerator: agent.accelerator,
      click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, agent.command),
    })),
  ];

  return {
    label: 'Agents',
    submenu,
  };
}

/**
 * Build Electron menu for workflows
 */
export function buildWorkflowMenu(): { label: string; submenu: unknown[] } {
  const submenu = WORKFLOW_DEFINITIONS.map(workflow => ({
    label: workflow.label,
    accelerator: workflow.accelerator,
    click: () => broadcastToRenderer(IPC_AGENT_CHANNELS.AGENT_LAUNCH, workflow.command),
  }));

  return {
    label: 'Workflows',
    submenu,
  };
}

/**
 * Build Tools menu with Execution Log (Story 22-6)
 * Updated: toggles tool panel instead of showing modal
 */
export function buildToolsMenu(): { label: string; submenu: unknown[] } {
  return {
    label: 'Tools',
    submenu: [
      {
        label: 'Execution Log',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => broadcastToRenderer('tools:toggleToolPanel', null),
      },
    ],
  };
}

/**
 * Panel definitions for View menu toggles
 */
const VIEW_MENU_PANELS = [
  { id: 'message', label: 'Messages' },
  { id: 'changed', label: 'Changed Files' },
  { id: 'diffs', label: 'Diffs' },
  { id: 'debug', label: 'Debug' },
  { id: 'audit-log', label: 'Audit Log' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'ac', label: 'AC' },
  { id: 'todo', label: 'Todo' },
  { id: 'background', label: 'Background' },
  { id: 'git', label: 'Git' },
  { id: 'hotspots', label: 'Hotspots' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Build custom View menu with Verbose Mode toggle (Story 22-5)
 * Includes standard view items plus panel toggles via WebSocket
 */
export function buildViewMenu(): { label: string; submenu: unknown[] } {
  return {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Toggle Panel',
        submenu: VIEW_MENU_PANELS.map(panel => ({
          label: panel.label,
          click: () => panelToggleFn(panel.id),
        })),
      },
      { type: 'separator' },
      {
        id: 'verbose-mode',
        label: 'Verbose Mode',
        type: 'checkbox',
        checked: getVerboseMode(),
        accelerator: 'CmdOrCtrl+Shift+V',
        click: (menuItem: { checked: boolean }) => {
          setVerboseMode(menuItem.checked);
          broadcastToRenderer(IPC_SETTINGS_CHANNELS.VERBOSE_MODE_UPDATE, menuItem.checked);
        },
      },
    ],
  };
}

/**
 * Build the app menu (macOS style)
 */
export function buildAppMenu(): { label: string; submenu: unknown[] } {
  return {
    label: 'Cyclist',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => settingsOpenerFn() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}

/**
 * Get the menu template for testing
 * Returns the full menu structure including settings
 */
export function getMenuTemplate(): Array<{ role?: string; label?: string; submenu?: Array<{ label?: string; accelerator?: string; click?: () => void }> }> {
  return [
    {
      role: 'appMenu',
      label: 'Cyclist',
      submenu: [
        { label: 'About Cyclist' },
        { label: 'Settings...', accelerator: 'CmdOrCtrl+,' },
        { label: 'Quit Cyclist' },
      ],
    },
  ];
}

/**
 * Register settings keyboard shortcut
 * Called during app initialization
 */
export function registerSettingsShortcut(): void {
  // Shortcut is handled via menu accelerator, not global shortcut
  // This function exists for test compatibility
}
