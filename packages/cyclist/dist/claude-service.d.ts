/**
 * ClaudeService - Programmatic interface to Claude Code CLI
 *
 * Uses Claude Code in programmatic mode (`claude -p --output-format stream-json`)
 * via node-pty for proper TTY support. Claude CLI requires a TTY to produce
 * stream-json output - see GitHub issue #9026 and #771.
 *
 * Does NOT require an Anthropic API key - uses the user's existing Claude Code
 * installation and authentication.
 *
 * @see sprint/adr/002-programmatic-mode-migration.md
 * @see .claude/project/agents/dev-sidecar/decisions.md
 * @see https://github.com/anthropics/claude-code/issues/9026 (TTY requirement bug)
 * @see https://github.com/anthropics/claude-code/issues/771 (Node.js spawn fix)
 */
import type { IPty } from 'node-pty';
import { EventEmitter } from 'events';
/**
 * Permission modes for Claude Code
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - PermissionMode type
 */
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions' | 'bypassPermissions';
/**
 * API key source indicator
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - ApiKeySource type
 */
export type ApiKeySource = 'user' | 'project' | 'org' | 'temporary';
/**
 * System initialization message from CLI
 *
 * Emitted at session start with environment context.
 * Note: CLI format includes fields not in SDK's SDKSystemMessage (which has subtype='init').
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - SDKSystemMessage
 */
export interface SDKSystemMessage {
    type: 'system';
    /** Message subtype - 'init' for session start, 'hook_response' for hook events */
    subtype?: 'init' | 'hook_response' | 'compact_boundary';
    /** Unique session identifier */
    session_id: string;
    /** Claude model being used (e.g., 'claude-sonnet-4-20250514') */
    model: string;
    /** Current working directory */
    cwd?: string;
    /** Available tools in this session */
    tools?: string[];
    /** How the API key was sourced */
    apiKeySource?: ApiKeySource;
    /** MCP server connection status */
    mcp_servers?: Array<{
        name: string;
        status: string;
    }>;
    /** Active permission mode for this session */
    permissionMode?: PermissionMode;
    /** Available slash commands */
    slash_commands?: string[];
    /** Output formatting style */
    output_style?: string;
    /** Unique message identifier (SDK format) */
    uuid?: string;
}
/**
 * Assistant response message from CLI
 *
 * Contains Claude's text response and/or tool use requests.
 * Note: CLI uses 'message' as alternate type for legacy compatibility.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - SDKAssistantMessage
 */
export interface SDKAssistantMessage {
    /** Message type - 'assistant' or legacy 'message' */
    type: 'assistant' | 'message';
    /** Wrapped message content (SDK format) */
    message?: {
        content: Array<{
            type: 'text';
            text: string;
        } | {
            type: 'tool_use';
            id: string;
            name: string;
            input: unknown;
        }>;
    };
    /** Direct content array (CLI format) */
    content?: Array<{
        type: 'text';
        text: string;
    }>;
    /** Role indicator */
    role?: 'assistant';
    /** Unique message identifier (SDK format) */
    uuid?: string;
    /** Session this message belongs to */
    session_id?: string;
    /** Parent tool use ID for nested tool calls */
    parent_tool_use_id?: string | null;
}
/**
 * Tool use request message from CLI
 *
 * Emitted when Claude wants to invoke a tool.
 * Note: In SDK format, tool_use is embedded in SDKAssistantMessage.message.content.
 * CLI emits discrete tool_use messages for streaming visibility.
 *
 * This is a CLI-specific message type not in the official SDK union.
 */
export interface SDKToolUseMessage {
    type: 'tool_use';
    /** Tool being invoked (e.g., 'Bash', 'Read', 'Edit') */
    tool_name: string;
    /** Unique identifier for this tool invocation */
    tool_id: string;
    /** Tool-specific input parameters */
    input: Record<string, unknown>;
}
/**
 * Tool result message from CLI
 *
 * Emitted after a tool completes execution.
 * Note: This is a CLI-specific message type for streaming visibility.
 * In SDK format, tool results flow through the message loop differently.
 *
 * This is a CLI-specific message type not in the official SDK union.
 */
export interface SDKToolResultMessage {
    type: 'tool_result';
    /** ID of the tool_use this is responding to */
    tool_id: string;
    /** Tool execution output (may be truncated for large outputs) */
    output: string;
    /** Whether the tool execution failed */
    is_error?: boolean;
}
/**
 * Session result message from CLI
 *
 * Emitted when a conversation turn completes.
 * Contains usage statistics and cost information.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - SDKResultMessage
 */
export interface SDKResultMessage {
    type: 'result';
    /** Result subtype indicating success or error condition */
    subtype?: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
    /** Token usage for this turn */
    usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
        /** @deprecated Use cache_read_input_tokens */
        cache_read_tokens?: number;
        /** @deprecated Use cache_creation_input_tokens */
        cache_creation_tokens?: number;
    };
    /** Total cost in USD for this turn */
    cost_usd?: number;
    /** @see cost_usd - SDK uses total_cost_usd */
    total_cost_usd?: number;
    /** Total wall-clock duration in milliseconds */
    duration_ms?: number;
    /** API call duration in milliseconds (SDK format) */
    duration_api_ms?: number;
    /** Session identifier */
    session_id?: string;
    /** Number of conversation turns */
    num_turns?: number;
    /** Whether this result represents an error */
    is_error?: boolean;
    /** Final result text (success only) */
    result?: string;
    /** Per-model usage breakdown (SDK format) */
    modelUsage?: Record<string, {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
        costUSD: number;
    }>;
    /** Tools that were denied permission */
    permission_denials?: Array<{
        tool_name: string;
        tool_use_id: string;
        tool_input: unknown;
    }>;
    /** Error messages (error subtypes only) */
    errors?: string[];
    /** Unique message identifier (SDK format) */
    uuid?: string;
}
/**
 * Error message from CLI
 *
 * Emitted when an error occurs during processing.
 * This is a CLI-specific message type for error reporting.
 *
 * Note: SDK handles errors through SDKResultMessage with error subtypes.
 */
export interface SDKErrorMessage {
    type: 'error';
    /** Human-readable error description */
    error: string;
    /** Error code for programmatic handling */
    code?: string;
}
/**
 * User message (for type completeness)
 *
 * Represents user input in the conversation.
 * Cyclist creates these locally; CLI echoes them back in resume scenarios.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - SDKUserMessage
 */
export interface SDKUserMessage {
    type: 'user';
    /** User-provided content */
    content?: string;
    /** Wrapped message content (SDK format) */
    message?: {
        content: Array<{
            type: 'text';
            text: string;
        } | {
            type: 'tool_result';
            tool_use_id: string;
            content: string;
        }>;
    };
    /** Unique message identifier */
    uuid?: string;
    /** Session this message belongs to */
    session_id?: string;
    /** Parent tool use ID for nested contexts */
    parent_tool_use_id?: string | null;
}
/**
 * Streaming partial message (SDK format)
 *
 * Emitted during streaming when includePartialMessages is enabled.
 * Not typically seen in CLI output but included for type completeness.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript - SDKPartialAssistantMessage
 */
export interface SDKPartialAssistantMessage {
    type: 'stream_event';
    /** Raw streaming event from Anthropic API */
    event: unknown;
    /** Parent tool use context */
    parent_tool_use_id: string | null;
    /** Unique message identifier */
    uuid: string;
    /** Session identifier */
    session_id: string;
}
/**
 * Union of all SDK message types from CLI stream-json output
 *
 * Note: Includes CLI-specific types (tool_use, tool_result, error) that are
 * not in the official SDK union but are emitted by `--output-format stream-json`.
 */
export type SDKMessage = SDKSystemMessage | SDKAssistantMessage | SDKUserMessage | SDKToolUseMessage | SDKToolResultMessage | SDKResultMessage | SDKErrorMessage | SDKPartialAssistantMessage;
/**
 * Options for spawning Claude Code subprocess
 */
export interface ClaudeSpawnOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}
/**
 * PTY spawn options for node-pty
 */
export interface PtySpawnOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: {
        [key: string]: string | undefined;
    };
}
/**
 * Spawner function type for dependency injection (enables testing)
 * Uses node-pty for proper TTY support required by Claude CLI
 */
export type ClaudeSpawner = (command: string, args: string[], options: PtySpawnOptions) => IPty;
/**
 * ClaudeService - Wrapper for Claude Code CLI programmatic mode
 *
 * Uses node-pty for TTY support with NDJSON streaming for programmatic control
 * of Claude Code without requiring an Anthropic API key.
 */
/**
 * Mode state for UI synchronization
 * B-10: Track both active (last query) and pending (user selected) modes
 */
export interface ModeState {
    activeMode: PermissionMode | undefined;
    pendingMode: PermissionMode;
    hasPendingChange: boolean;
}
export declare class ClaudeService extends EventEmitter {
    private sessionId;
    private pendingMode;
    private activeMode;
    private currentProcess;
    private interrupted;
    private spawner;
    private defaultCwd?;
    constructor(options?: {
        spawner?: ClaudeSpawner;
        cwd?: string;
    });
    /**
     * Send a message to Claude and receive streaming responses
     *
     * Uses node-pty for TTY support - Claude CLI requires a TTY to produce
     * stream-json output (GitHub issues #9026 and #771).
     *
     * @param prompt - The prompt to send to Claude
     * @param options - Optional spawn options (cwd, env)
     * @returns AsyncIterable of SDK messages
     */
    sendMessage(prompt: string, options?: ClaudeSpawnOptions): AsyncIterable<SDKMessage>;
    /**
     * Get the current session ID (captured from init message)
     */
    getSessionId(): string | null;
    /**
     * Set the permission mode for subsequent queries
     * B-10: This sets the pending mode - takes effect on next query
     */
    setPermissionMode(mode: PermissionMode): void;
    /**
     * Get the current permission mode (pending mode for next query)
     * @deprecated Use getPendingMode() for clarity
     */
    getPermissionMode(): PermissionMode;
    /**
     * B-10: Get the mode that was used in the last query
     * Returns undefined if no query has run yet
     */
    getActiveMode(): PermissionMode | undefined;
    /**
     * B-10: Get the mode that will be used in the next query
     */
    getPendingMode(): PermissionMode;
    /**
     * B-10: Check if there's a pending mode change
     * Returns true when pendingMode differs from activeMode
     */
    hasPendingModeChange(): boolean;
    /**
     * B-10: Get complete mode state for UI synchronization
     */
    getModeState(): ModeState;
    /**
     * Interrupt Claude's current turn (like pressing Escape in CLI)
     * Stops the current response but keeps session alive for new prompts
     */
    interrupt(): void;
    /**
     * Abort the running process completely (kill it)
     * Unlike interrupt(), this fully terminates the subprocess
     */
    abort(): void;
    /**
     * Reset the session (clear session ID)
     * B-10: Also clears activeMode since no query has run in new session
     */
    resetSession(): void;
    /**
     * Set the session ID (for restoring a previous session after app restart)
     * E7-3: Session persistence support
     */
    setSessionId(id: string): void;
    /**
     * Clear the session (alias for resetSession, named for test clarity)
     * E7-3: New conversation support
     * B-10: Also clears activeMode for consistent behavior with resetSession()
     */
    clearSession(): void;
    /**
     * Build CLI arguments for claude command
     *
     * NOTE: --verbose is REQUIRED when using -p with --output-format stream-json
     * Without it, Claude CLI produces no output.
     */
    private buildArgs;
    /**
     * Build spawn options for node-pty including OTEL environment variables
     */
    private buildSpawnOptions;
}
export type { IPty };
//# sourceMappingURL=claude-service.d.ts.map