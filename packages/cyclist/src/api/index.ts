// API module exports
export { createStatsRouter, broadcastStats, getCurrentStats, getStatsClients } from './stats.js';
export { createPortraitRouter, getCurrentPortrait } from './portrait.js';
export { createPersonaRouter, broadcastPersona, getPersonaClients } from './persona.js';
export { createGitRouter, getGitInfo } from './git.js';
export type { GitInfo } from './git.js';
export { createOTLPRouter } from './otlp.js';
export { createStoryRouter } from './story.js';
export { createFileBrowserRouter } from './file-browser.js';
export { createTokenStatsRouter, broadcastTokenStats, getTokenStatsClients, initTokenStatsBroadcast } from './token-stats.js';
export { createContextRouter, getContextUsage } from './context.js';
export type { ContextInfo } from './context.js';
export { createThemeAgentsRouter, getThemeAgents } from './theme-agents.js';
export type { AgentCharacterMap } from './theme-agents.js';
export { createModeRouter, getModeInfo } from './mode.js';
export type { ModeInfo } from './mode.js';
export { createTelemetryRouter } from './telemetry.js';
export { createEvaluationRouter } from './evaluation.js';
// Note: benchmark router is dynamically imported in server.ts (pennyfarthing-only feature)
// 35-1: Settings API for contextual settings
export { createSettingsRouter } from './settings.js';
// 35-16: Background tasks API
export { createBackgroundTasksRouter, getBackgroundTaskClients, broadcastBackgroundTaskEvent, initBackgroundTaskBroadcast } from './background-tasks.js';
