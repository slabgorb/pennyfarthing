// API module exports
export { createStatsRouter, broadcastStats, getCurrentStats, getStatsClients, updatePwd } from './stats.js';
export { createPortraitRouter, getCurrentPortrait } from './portrait.js';
export { createPersonaRouter, broadcastPersona, getPersonaClients, getStreamingState, setStreamingState } from './persona.js';
export { createGitRouter, getGitInfo, getAllReposGitInfo, getGitInfoAsync, getAllReposGitInfoAsync, resetFetchCooldown, GIT_FETCH_COOLDOWN_MS } from './git.js';
export type { GitInfo } from './git.js';
export { createOTLPRouter } from './otlp.js';
export { createStoryRouter } from './story.js';
export { createHotspotsRouter } from './hotspots.js';
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
// 35-1: Settings API for contextual settings
export { createSettingsRouter, getSettingsForWebSocket } from './settings.js';
// 35-16: Background tasks API
export { createBackgroundTasksRouter, getBackgroundTaskClients, broadcastBackgroundTaskEvent, initBackgroundTaskBroadcast } from './background-tasks.js';
// MSSCI-11734: Enriched spans API
export { createSpansRouter } from './spans.js';
// Bell mode WebSocket broadcast
export { getBellClients, broadcastBellConsumed } from './bell.js';
// Welcome message WebSocket broadcast
export { getWelcomeClients, broadcastWelcome } from './welcome.js';
// MSSCI-12409: Hook request API (WheelHub consolidation)
export { createHookRequestRouter, getHookClients, addHookClient, resolveApproval, handleHookWebSocketMessage } from './hook-request.js';
// MSSCI-12469: Identity API for stats strip
export { createIdentityRouter } from './identity.js';
export type { IdentityInfo } from './identity.js';
// Todos API for web mode fallback
export { createTodosRouter, setWebModeTodos, getWebModeTodos } from './todos.js';
// Audit log API
export { createAuditLogRouter } from './audit-log.js';
// MSSCI-14325: Permissions API (grant management)
export { createPermissionsRouter } from './permissions.js';
// MSSCI-14461: Agent Load Analyzer API
export { createAgentLoadRouter } from './agent-load.js';
// MSSCI-14456: Code Markers API
export { createCodeMarkersRouter } from './code-markers.js';
// MSSCI-14460: Dead Code API
export { createDeadCodeRouter } from './dead-code.js';
// MSSCI-14468: Complexity + Dependencies APIs
export { createComplexityRouter } from './complexity.js';
export { createDependenciesRouter } from './dependencies.js';
// MSSCI-14471: Health Score API
export { createHealthScoreRouter } from './health-score.js';
// 110-6: Project Info API
export { createProjectInfoRouter } from './project-info.js';
export type { ProjectInfo } from './project-info.js';
