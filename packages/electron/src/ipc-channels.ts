/**
 * IPC Channel Constants
 *
 * Centralized definitions for all Electron IPC channels used in Cyclist.
 * Extracted from main.ts for better maintainability.
 */

/**
 * IPC channel names for sidebar data communication (B-2)
 * Used by preload script to expose data APIs to renderer
 */
export const IPC_DATA_CHANNELS = {
  STATS_GET: 'stats:get',
  STATS_UPDATE: 'stats:update',
  PERSONA_GET: 'persona:get',
  PERSONA_UPDATE: 'persona:update',
  STORY_GET: 'story:get',
  STORY_UPDATE: 'story:update',
  GIT_GET: 'git:get',
  GIT_UPDATE: 'git:update',
  TOOL_STATS_GET: 'toolStats:get',
  TOOL_STATS_UPDATE: 'toolStats:update',
  TOKEN_STATS_GET: 'tokenStats:get',
  TOKEN_STATS_UPDATE: 'tokenStats:update',
  // B-17: Todo visualizer
  TODOS_GET: 'todos:get',
  TODOS_UPDATE: 'todos:update',
  // B-19: Context usage progress bar
  CONTEXT_GET: 'context:get',
  CONTEXT_UPDATE: 'context:update',
  // Tool events (changed files, diffs)
  TOOL_EVENTS_UPDATE: 'toolEvents:update',
  // 23-1: Usage limits stats
  USAGE_STATS_GET: 'usageStats:get',
  USAGE_STATS_UPDATE: 'usageStats:update',
  // 35-2: Project info (directory and user email)
  PROJECT_INFO_GET: 'projectInfo:get',
  PROJECT_INFO_UPDATE: 'projectInfo:update',
} as const;

/**
 * IPC channel names for Claude SDK communication (E7-3)
 */
export const IPC_CLAUDE_CHANNELS = {
  CLAUDE_SEND: 'claude:send',
  CLAUDE_MESSAGE: 'claude:message',
  CLAUDE_COMPLETE: 'claude:complete',
  CLAUDE_ERROR: 'claude:error',
  CLAUDE_SET_MODE: 'claude:setMode',
  CLAUDE_GET_MODE: 'claude:getMode',
  CLAUDE_ABORT: 'claude:abort',
  CLAUDE_CLEAR: 'claude:clear',
  CLAUDE_SET_SYSTEM_PROMPT: 'claude:setSystemPrompt',
  CLAUDE_GET_SYSTEM_PROMPT: 'claude:getSystemPrompt',
} as const;

/**
 * IPC channel names for agent launcher (B-23)
 */
export const IPC_AGENT_CHANNELS = {
  AGENT_LAUNCH: 'agent:launch',
  AGENT_LOAD_CONTEXT: 'agent:loadContext',
} as const;

/**
 * IPC channel names for diff viewer (E8-2)
 */
export const IPC_DIFF_CHANNELS = {
  DIFF_UPDATE: 'diff:update',
} as const;

/**
 * IPC channel names for settings (22-5, 24-1)
 */
export const IPC_SETTINGS_CHANNELS = {
  VERBOSE_MODE_GET: 'settings:getVerboseMode',
  VERBOSE_MODE_SET: 'settings:setVerboseMode',
  VERBOSE_MODE_UPDATE: 'settings:verboseModeUpdate',
  // 24-1: Settings panel infrastructure
  GET: 'settings:get',
  SAVE: 'settings:save',
  CHANGED: 'settings:changed',
  OPEN_WINDOW: 'settings:openWindow',
  // 24-2: Pennyfarthing settings section
  GET_AVAILABLE_THEMES: 'settings:getAvailableThemes',
  // 24-5: Theme browser with metadata
  GET_THEME_METADATA: 'settings:getThemeMetadata',
} as const;

/**
 * IPC channel names for audit log (22-6)
 */
export const IPC_AUDIT_LOG_CHANNELS = {
  GET_ENTRIES: 'auditLog:getEntries',
  GET_TYPES: 'auditLog:getTypes',
  EXPORT: 'auditLog:export',
  GET_STATS: 'auditLog:getStats',
  CLEAR: 'auditLog:clear',
  ENTRY: 'auditLog:entry',
} as const;

/**
 * IPC channel names for file browser (E8-3)
 */
export const IPC_FILE_BROWSER_CHANNELS = {
  LIST_DIRECTORY: 'file-browser:list-directory',
  OPEN_FILE: 'file-browser:open-file',
  OPEN_IN_EDITOR: 'file-browser:open-in-editor',
} as const;

/**
 * IPC channel names for command execution (23-3)
 * Used to execute Claude Code commands via IPC rather than PTY injection
 */
export const IPC_COMMAND_CHANNELS = {
  EXECUTE: 'command:execute',
  RESULT: 'command:result',
  ERROR: 'command:error',
} as const;

/**
 * IPC channel names for background task notifications (31-15, 35-16, MSSCI-12784)
 */
export const IPC_BACKGROUND_TASK_CHANNELS = {
  TASK_GET_ALL: 'backgroundTask:getAll',    // MSSCI-12784: Fetch all on tab open
  TASK_STARTED: 'backgroundTask:started',   // Story 35-16
  TASK_COMPLETED: 'backgroundTask:completed',
} as const;

/**
 * IPC channel names for skill invocations (35-12)
 * Used by skill panel to track skill execution
 */
export const IPC_SKILL_CHANNELS = {
  SKILL_START: 'skill:start',
  SKILL_COMPLETE: 'skill:complete',
  SKILL_ERROR: 'skill:error',
  SKILL_GET: 'skill:get',
  SKILL_CLEAR: 'skill:clear',
} as const;

/**
 * IPC channel names for context clear operations (MSSCI-11840)
 * Used for auto-mode context clear and agent reload
 */
export const IPC_CONTEXT_CLEAR_CHANNELS = {
  CLEAR: 'context:clear',
  CLEAR_AND_LOAD: 'context:clearAndLoad',
} as const;

/**
 * IPC channel names for layout persistence (MSSCI-12706)
 * Used for saving/restoring workspace layout to config.local.yaml
 */
export const IPC_LAYOUT_CHANNELS = {
  GET: 'layout:get',
  SAVE: 'layout:save',
  UPDATE: 'layout:update',
} as const;

/**
 * IPC channel names for user avatar (MSSCI-12777)
 * Used for fetching and caching user avatars from GitHub
 */
export const IPC_AVATAR_CHANNELS = {
  GET: 'avatar:get',
  FETCH_FROM_GITHUB: 'avatar:fetchFromGitHub',
  GET_CACHED: 'avatar:getCached',
  SET_CACHED: 'avatar:setCached',
  CLEAR_CACHE: 'avatar:clearCache',
} as const;
