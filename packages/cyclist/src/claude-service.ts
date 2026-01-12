/**
 * ClaudeService - Programmatic interface to Claude Code CLI
 *
 * Uses Claude Code in programmatic mode with `--input-format stream-json` and
 * `--output-format stream-json` via child_process.spawn with stdin pipe.
 *
 * Does NOT require an Anthropic API key - uses the user's existing Claude Code
 * installation and authentication.
 *
 * @see sprint/adr/002-programmatic-mode-migration.md
 * @see .claude/project/agents/dev-sidecar/decisions.md
 * @see https://github.com/anthropics/claude-code/issues/1072 (stdin pipe requirement)
 */

import { spawn, type ChildProcess } from 'child_process';
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

// =============================================================================
// SDK Message Types - CLI stream-json Output Format
// =============================================================================
//
// These types represent the NDJSON messages from `claude -p --output-format stream-json`.
//
// IMPORTANT: CLI output format differs from the Claude Agent SDK programmatic format.
// The SDK types (SDKAssistantMessage, SDKUserMessage, etc.) use APIMessage wrappers,
// while CLI output uses a flatter structure with discrete message types for tool_use
// and tool_result.
//
// @see https://platform.claude.com/docs/en/agent-sdk/typescript for official SDK types
// @see sprint/adr/002-programmatic-mode-migration.md for Cyclist's CLI integration
// =============================================================================

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
  mcp_servers?: Array<{ name: string; status: string }>;
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
    content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }>;
  };
  /** Direct content array (CLI format) */
  content?: Array<{ type: 'text'; text: string }>;
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
    content: Array<{ type: 'text'; text: string } | { type: 'tool_result'; tool_use_id: string; content: string }>;
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
export type SDKMessage =
  | SDKSystemMessage
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKToolUseMessage
  | SDKToolResultMessage
  | SDKResultMessage
  | SDKErrorMessage
  | SDKPartialAssistantMessage;

/**
 * Image data from clipboard paste (28-1)
 */
export interface PastedImage {
  dataUrl: string;
  mimeType: string;
  filename: string;
}

/**
 * Options for spawning Claude Code subprocess
 * 28-1: Added images support
 */
export interface ClaudeSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** 28-1: Images to include with the prompt */
  images?: PastedImage[];
}

/**
 * Spawner function type for dependency injection (enables testing)
 * Returns a ChildProcess-like object with stdin, stdout, stderr streams
 */
export type ClaudeSpawner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ['pipe', 'pipe', 'pipe'] }
) => ChildProcess;

/**
 * Mode state for UI synchronization
 * B-10: Track both active (last query) and pending (user selected) modes
 */
export interface ModeState {
  activeMode: PermissionMode | undefined;
  pendingMode: PermissionMode;
  hasPendingChange: boolean;
}

/**
 * ClaudeService - Wrapper for Claude Code CLI programmatic mode
 *
 * Uses child_process with stdin pipe for NDJSON streaming programmatic control
 * of Claude Code without requiring an Anthropic API key.
 */
export class ClaudeService extends EventEmitter {
  private sessionId: string | null = null;
  private pendingMode: PermissionMode = 'acceptEdits';
  private activeMode: PermissionMode | undefined = undefined;
  private currentProcess: ChildProcess | null = null;
  private interrupted = false;
  private defaultCwd?: string;
  private spawner: ClaudeSpawner;

  constructor(options?: { cwd?: string; spawner?: ClaudeSpawner }) {
    super();
    this.defaultCwd = options?.cwd;
    this.spawner = options?.spawner ?? spawn;
  }

  /**
   * Send a message to Claude and receive streaming responses
   *
   * Uses child_process.spawn with stdin pipe and --input-format stream-json.
   * This enables sending images and works reliably without TTY requirements.
   *
   * @param prompt - The prompt to send to Claude
   * @param options - Optional spawn options (cwd, env, images)
   * @returns AsyncIterable of SDK messages
   */
  async *sendMessage(prompt: string, options?: ClaudeSpawnOptions): AsyncIterable<SDKMessage> {
    // CRITICAL: Kill any existing process before starting a new one
    // This prevents duplicate Claude instances responding to the same conversation
    if (this.currentProcess) {
      console.log('[ClaudeService] Killing existing process before starting new one');
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    const args = this.buildArgs();
    const cwd = options?.cwd ?? this.defaultCwd ?? process.cwd();
    const env = { ...process.env, ...options?.env };

    // B-10: Update activeMode to match pendingMode at query start
    this.activeMode = this.pendingMode;

    // Reset interrupted flag for new message
    this.interrupted = false;

    console.log('[ClaudeService] Spawning child process');
    const proc = this.spawner('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.currentProcess = proc;

    // Build and write the user message to stdin, then close it
    const userMessage = this.buildStreamJsonUserMessage(prompt, options?.images ?? []);
    console.log('[ClaudeService] Writing stream-json user message to stdin');
    proc.stdin?.write(userMessage + '\n');
    proc.stdin?.end();
    console.log('[ClaudeService] Closed stdin');

    // Buffer for incomplete JSON lines
    let buffer = '';

    // Create a promise-based message queue
    const messageQueue: SDKMessage[] = [];
    let resolveNext: ((value: IteratorResult<SDKMessage>) => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const pushMessage = (msg: SDKMessage) => {
      // Capture session ID from system/init message
      if ((msg.type === 'system' || msg.type === 'result') && 'session_id' in msg && msg.session_id) {
        this.sessionId = msg.session_id;
      }

      if (resolveNext) {
        resolveNext({ value: msg, done: false });
        resolveNext = null;
      } else {
        messageQueue.push(msg);
      }
    };

    const finish = (err?: Error) => {
      done = true;
      error = err ?? null;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as SDKMessage, done: true });
        resolveNext = null;
      }
    };

    // Parse NDJSON from stdout
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!line.startsWith('{')) continue;
        try {
          const msg = JSON.parse(line) as SDKMessage;
          pushMessage(msg);
        } catch {
          if (line.length > 10) {
            console.warn('[ClaudeService] Skipping malformed JSON:', line.substring(0, 100));
          }
        }
      }
    });

    // Log stderr for debugging
    proc.stderr?.on('data', (data: Buffer) => {
      console.error('[ClaudeService] stderr:', data.toString());
    });

    // Handle process exit
    proc.on('close', (exitCode) => {
      // Flush remaining buffer
      if (buffer.trim() && buffer.startsWith('{')) {
        try {
          const msg = JSON.parse(buffer) as SDKMessage;
          pushMessage(msg);
        } catch {
          // Ignore incomplete JSON
        }
      }

      if (exitCode !== 0 && exitCode !== null && messageQueue.length === 0) {
        finish(new Error(`Claude process exited with code ${exitCode}`));
      } else {
        finish();
      }
      this.currentProcess = null;
    });

    proc.on('error', (err) => {
      console.error('[ClaudeService] Process error:', err);
      finish(err);
    });

    const self = this;

    // Yield messages as they arrive
    while (!done || messageQueue.length > 0) {
      if (self.interrupted) {
        break;
      }

      if (messageQueue.length > 0) {
        yield messageQueue.shift()!;
      } else if (!done) {
        const msg = await new Promise<SDKMessage | null>((resolve) => {
          const onInterrupt = () => resolve(null);
          self.once('interrupted', onInterrupt);

          resolveNext = (result) => {
            self.removeListener('interrupted', onInterrupt);
            if (result.done || self.interrupted) {
              resolve(null);
            } else {
              resolve(result.value);
            }
          };
        });

        if (msg === null) {
          if (error && !self.interrupted) {
            throw error;
          }
          break;
        }
        yield msg;
      }
    }
  }

  /**
   * Get the current session ID (captured from init message)
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set the permission mode for subsequent queries
   * B-10: This sets the pending mode - takes effect on next query
   */
  setPermissionMode(mode: PermissionMode): void {
    this.pendingMode = mode;
  }

  /**
   * Get the current permission mode (pending mode for next query)
   * @deprecated Use getPendingMode() for clarity
   */
  getPermissionMode(): PermissionMode {
    return this.pendingMode;
  }

  /**
   * B-10: Get the mode that was used in the last query
   * Returns undefined if no query has run yet
   */
  getActiveMode(): PermissionMode | undefined {
    return this.activeMode;
  }

  /**
   * B-10: Get the mode that will be used in the next query
   */
  getPendingMode(): PermissionMode {
    return this.pendingMode;
  }

  /**
   * B-10: Check if there's a pending mode change
   * Returns true when pendingMode differs from activeMode
   */
  hasPendingModeChange(): boolean {
    // If no query has run yet, there's always a "pending" change
    if (this.activeMode === undefined) {
      return true;
    }
    return this.activeMode !== this.pendingMode;
  }

  /**
   * B-10: Get complete mode state for UI synchronization
   */
  getModeState(): ModeState {
    return {
      activeMode: this.activeMode,
      pendingMode: this.pendingMode,
      hasPendingChange: this.hasPendingModeChange(),
    };
  }

  /**
   * Interrupt Claude's current turn (like pressing Escape in CLI)
   * Stops the current response but keeps session alive for new prompts
   */
  interrupt(): void {
    this.interrupted = true;
    if (this.currentProcess) {
      // Send SIGINT to interrupt current turn
      this.currentProcess.kill('SIGINT');
    }
    // Emit event to break any waiting promises
    this.emit('interrupted');
  }

  /**
   * Abort the running process completely (kill it)
   * Unlike interrupt(), this fully terminates the subprocess
   */
  abort(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    this.interrupt(); // Also set interrupted flag and emit event
  }

  /**
   * Reset the session (clear session ID)
   * B-10: Also clears activeMode since no query has run in new session
   */
  resetSession(): void {
    this.sessionId = null;
    this.activeMode = undefined;
  }

  /**
   * Set the session ID (for restoring a previous session after app restart)
   * E7-3: Session persistence support
   */
  setSessionId(id: string): void {
    this.sessionId = id;
  }

  /**
   * Clear the session (alias for resetSession, named for test clarity)
   * E7-3: New conversation support
   * B-10: Also clears activeMode for consistent behavior with resetSession()
   */
  clearSession(): void {
    this.resetSession();
  }

  /**
   * Build CLI arguments for stream-json input/output mode
   */
  private buildArgs(): string[] {
    const args: string[] = [
      '-p', // Print mode (non-interactive)
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
    ];

    // Set permission mode based on user selection
    if (this.pendingMode === 'dangerouslySkipPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', this.pendingMode);
    }

    // Resume session if we have a session ID
    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    return args;
  }

  /**
   * Build stream-json user message with image content blocks (28-1)
   * Format: {"type":"user","message":{"role":"user","content":[{text},{image}...]}}
   */
  private buildStreamJsonUserMessage(prompt: string, images: PastedImage[]): string {
    // Build content array: text first, then images
    // (Claude API requires text before images)
    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    > = [];

    // Add text prompt
    content.push({ type: 'text', text: prompt });

    // Add images
    for (const image of images) {
      // Extract base64 data from data URL (remove "data:image/png;base64," prefix)
      const base64Data = image.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mimeType,
          data: base64Data,
        },
      });
    }

    const message = {
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    };

    return JSON.stringify(message);
  }
}
