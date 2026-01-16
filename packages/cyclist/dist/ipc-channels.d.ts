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
export declare const IPC_DATA_CHANNELS: {
    readonly STATS_GET: "stats:get";
    readonly STATS_UPDATE: "stats:update";
    readonly PERSONA_GET: "persona:get";
    readonly PERSONA_UPDATE: "persona:update";
    readonly STORY_GET: "story:get";
    readonly STORY_UPDATE: "story:update";
    readonly GIT_GET: "git:get";
    readonly GIT_UPDATE: "git:update";
    readonly TOOL_STATS_GET: "toolStats:get";
    readonly TOOL_STATS_UPDATE: "toolStats:update";
    readonly TOKEN_STATS_GET: "tokenStats:get";
    readonly TOKEN_STATS_UPDATE: "tokenStats:update";
    readonly TODOS_GET: "todos:get";
    readonly TODOS_UPDATE: "todos:update";
    readonly CONTEXT_GET: "context:get";
    readonly CONTEXT_UPDATE: "context:update";
    readonly TOOL_EVENTS_UPDATE: "toolEvents:update";
    readonly USAGE_STATS_GET: "usageStats:get";
    readonly USAGE_STATS_UPDATE: "usageStats:update";
    readonly PROJECT_INFO_GET: "projectInfo:get";
    readonly PROJECT_INFO_UPDATE: "projectInfo:update";
};
/**
 * IPC channel names for Claude SDK communication (E7-3)
 */
export declare const IPC_CLAUDE_CHANNELS: {
    readonly CLAUDE_SEND: "claude:send";
    readonly CLAUDE_MESSAGE: "claude:message";
    readonly CLAUDE_COMPLETE: "claude:complete";
    readonly CLAUDE_ERROR: "claude:error";
    readonly CLAUDE_SET_MODE: "claude:setMode";
    readonly CLAUDE_GET_MODE: "claude:getMode";
    readonly CLAUDE_ABORT: "claude:abort";
    readonly CLAUDE_CLEAR: "claude:clear";
};
/**
 * IPC channel names for agent launcher (B-23)
 */
export declare const IPC_AGENT_CHANNELS: {
    readonly AGENT_LAUNCH: "agent:launch";
};
/**
 * IPC channel names for diff viewer (E8-2)
 */
export declare const IPC_DIFF_CHANNELS: {
    readonly DIFF_UPDATE: "diff:update";
};
/**
 * IPC channel names for settings (22-5, 24-1)
 */
export declare const IPC_SETTINGS_CHANNELS: {
    readonly VERBOSE_MODE_GET: "settings:getVerboseMode";
    readonly VERBOSE_MODE_SET: "settings:setVerboseMode";
    readonly VERBOSE_MODE_UPDATE: "settings:verboseModeUpdate";
    readonly GET: "settings:get";
    readonly SAVE: "settings:save";
    readonly CHANGED: "settings:changed";
    readonly OPEN_WINDOW: "settings:openWindow";
    readonly GET_AVAILABLE_THEMES: "settings:getAvailableThemes";
    readonly GET_THEME_METADATA: "settings:getThemeMetadata";
};
/**
 * IPC channel names for audit log (22-6)
 */
export declare const IPC_AUDIT_LOG_CHANNELS: {
    readonly GET_ENTRIES: "auditLog:getEntries";
    readonly GET_TYPES: "auditLog:getTypes";
    readonly EXPORT: "auditLog:export";
    readonly GET_STATS: "auditLog:getStats";
    readonly CLEAR: "auditLog:clear";
    readonly ENTRY: "auditLog:entry";
};
/**
 * IPC channel names for file browser (E8-3)
 */
export declare const IPC_FILE_BROWSER_CHANNELS: {
    readonly LIST_DIRECTORY: "file-browser:list-directory";
    readonly OPEN_FILE: "file-browser:open-file";
    readonly OPEN_IN_EDITOR: "file-browser:open-in-editor";
};
/**
 * IPC channel names for command execution (23-3)
 * Used to execute Claude Code commands via IPC rather than PTY injection
 */
export declare const IPC_COMMAND_CHANNELS: {
    readonly EXECUTE: "command:execute";
    readonly RESULT: "command:result";
    readonly ERROR: "command:error";
};
/**
 * IPC channel names for background task notifications (31-15)
 */
export declare const IPC_BACKGROUND_TASK_CHANNELS: {
    readonly TASK_COMPLETED: "backgroundTask:completed";
};
//# sourceMappingURL=ipc-channels.d.ts.map