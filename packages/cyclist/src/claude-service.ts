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
 * Session context state for tiered context injection
 * MSSCI-12795: Foundation for the tiered context injection system (MSSCI-12793)
 *
 * Tracks session state to determine which context tier to use:
 * - FULL (~4000 tokens): First turn of new session
 * - REFRESH (~600 tokens): Resumed session, same agent
 * - HANDOFF (~700 tokens): Resumed session, different agent
 * - MINIMAL (~200 tokens): Deep conversation (turn 3+), same agent
 */
export interface SessionContextState {
  /** Last agent that received context injection (e.g., 'dev', 'tea', 'sm') */
  lastAgent: string | null;
  /** Number of messages sent in the current session */
  turnCount: number;
  /** Components already injected this session (e.g., 'persona', 'skills', 'guides') */
  injectedComponents: string[];
}

/**
 * ClaudeService - Wrapper for Claude Code CLI programmatic mode
 *
 * Uses child_process with stdin pipe for NDJSON streaming programmatic control
 * of Claude Code without requiring an Anthropic API key.
 */
/**
 * Format an agent command for sending to Claude
 * Normalizes agent names to ensure they have a leading slash
 *
 * @param agent - Agent name or command (e.g., 'dev' or '/dev')
 * @returns Formatted agent command (e.g., '/dev')
 */
export function formatAgentCommand(agent: string): string {
  if (agent.startsWith('/')) {
    return agent;
  }
  return `/${agent}`;
}

export class ClaudeService extends EventEmitter {
  private sessionId: string | null = null;
  private pendingMode: PermissionMode = 'acceptEdits';
  private activeMode: PermissionMode | undefined = undefined;
  private currentProcess: ChildProcess | null = null;
  private interrupted = false;
  private defaultCwd?: string;
  private spawner: ClaudeSpawner;

  // Persistent process state for background agent support
  private stdoutBuffer = '';
  private messageQueue: SDKMessage[] = [];
  private messageResolvers: Array<(msg: SDKMessage | null) => void> = [];
  private processExited = false;
  private processError: Error | null = null;

  /** Default environment variables to pass to spawned Claude process */
  private defaultEnv?: Record<string, string>;

  /** System prompt to append (persona/agent context) */
  private appendSystemPrompt?: string;

  /** MSSCI-12795: Session context state for tiered context injection */
  private contextState: SessionContextState = {
    lastAgent: null,
    turnCount: 0,
    injectedComponents: [],
  };

  constructor(options?: { cwd?: string; spawner?: ClaudeSpawner; env?: Record<string, string>; systemPrompt?: string }) {
    super();
    this.defaultCwd = options?.cwd;
    this.spawner = options?.spawner ?? spawn;
    this.defaultEnv = options?.env;
    this.appendSystemPrompt = options?.systemPrompt;
  }

  /**
   * Set or update the system prompt (persona/agent context).
   * This will be passed via --append-system-prompt on next process spawn.
   * If a process is already running, it will be killed and restarted.
   */
  setSystemPrompt(prompt: string): void {
    this.appendSystemPrompt = prompt;
    // If process is running, we need to restart it for the new prompt to take effect
    if (this.currentProcess && !this.processExited) {
      console.log('[ClaudeService] System prompt updated, restarting process...');
      this.abort();
    }
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.appendSystemPrompt;
  }

  /**
   * Ensure a Claude process is running, spawning one if needed.
   * Reuses existing process to preserve background Task agents.
   */
  private ensureProcess(options?: ClaudeSpawnOptions): ChildProcess {
    if (this.currentProcess && !this.processExited) {
      console.log('[ClaudeService] Reusing existing Claude process');
      return this.currentProcess;
    }

    // Reset state for new process
    this.stdoutBuffer = '';
    this.messageQueue = [];
    this.messageResolvers = [];
    this.processExited = false;
    this.processError = null;

    const args = this.buildArgs();
    const cwd = options?.cwd ?? this.defaultCwd ?? process.cwd();
    // Augment PATH for GUI apps that don't inherit shell profile
    const home = process.env.HOME ?? '';
    const extraPaths = [
      `${home}/.local/bin`,
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ].join(':');
    const augmentedPath = `${extraPaths}:${process.env.PATH ?? ''}`;
    const env = { ...process.env, ...this.defaultEnv, ...options?.env, CYCLIST: '1', PATH: augmentedPath };

    console.log('[ClaudeService] Spawning new Claude process (persistent mode)');
    const proc = this.spawner('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.currentProcess = proc;

    // Emit process-spawned event with PID for tracking (B-24 fix)
    if (proc.pid) {
      this.emit('process-spawned', proc.pid);
    }

    // Set up persistent stdout handler
    proc.stdout?.on('data', (data: Buffer) => {
      this.stdoutBuffer += data.toString();
      const lines = this.stdoutBuffer.split('\n');
      this.stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!line.startsWith('{')) continue;
        try {
          const msg = JSON.parse(line) as SDKMessage;
          this.handleIncomingMessage(msg);
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

    // Handle process exit (should only happen on reset or error)
    proc.on('close', (exitCode) => {
      console.log(`[ClaudeService] Process exited with code ${exitCode}`);
      this.processExited = true;

      // Track non-zero exit as an error if we haven't received any messages
      if (exitCode !== 0 && exitCode !== null && this.messageQueue.length === 0) {
        this.processError = new Error(`Claude process exited with code ${exitCode}`);
      }

      // Flush remaining buffer
      if (this.stdoutBuffer.trim() && this.stdoutBuffer.startsWith('{')) {
        try {
          const msg = JSON.parse(this.stdoutBuffer) as SDKMessage;
          this.handleIncomingMessage(msg);
        } catch {
          // Ignore incomplete JSON
        }
      }

      // Resolve any waiting message requests with null
      for (const resolve of this.messageResolvers) {
        resolve(null);
      }
      this.messageResolvers = [];
      this.currentProcess = null;
    });

    proc.on('error', (err) => {
      console.error('[ClaudeService] Process error:', err);
      this.processError = err;
      this.processExited = true;
      for (const resolve of this.messageResolvers) {
        resolve(null);
      }
      this.messageResolvers = [];
    });

    return proc;
  }

  /**
   * Handle an incoming message from Claude stdout.
   * Routes to waiting resolvers or queues for later.
   */
  private handleIncomingMessage(msg: SDKMessage): void {
    // Capture session ID from system/init or result message
    if ((msg.type === 'system' || msg.type === 'result') && 'session_id' in msg && msg.session_id) {
      this.sessionId = msg.session_id;
    }

    // If someone is waiting for a message, give it to them
    const resolver = this.messageResolvers.shift();
    if (resolver) {
      resolver(msg);
    } else {
      // Otherwise queue it
      this.messageQueue.push(msg);
    }
  }

  /**
   * Wait for the next message from Claude.
   * Returns null if process exits or is interrupted.
   */
  private waitForMessage(): Promise<SDKMessage | null> {
    // Check interrupted flag FIRST - exit immediately if interrupted
    if (this.interrupted) {
      return Promise.resolve(null);
    }

    // Check queue first
    if (this.messageQueue.length > 0) {
      return Promise.resolve(this.messageQueue.shift()!);
    }

    // If process has exited, return null
    if (this.processExited) {
      return Promise.resolve(null);
    }

    // Wait for next message
    return new Promise((resolve) => {
      this.messageResolvers.push(resolve);
    });
  }

  /**
   * Send a message to Claude and receive streaming responses
   *
   * Uses a persistent Claude process to support background Task agents.
   * The process stays alive between messages; only killed on explicit reset.
   *
   * @param prompt - The prompt to send to Claude
   * @param options - Optional spawn options (cwd, env, images)
   * @returns AsyncIterable of SDK messages
   */
  async *sendMessage(prompt: string, options?: ClaudeSpawnOptions): AsyncIterable<SDKMessage> {
    // Ensure we have a running process (reuses existing or spawns new)
    const proc = this.ensureProcess(options);

    // B-10: Update activeMode to match pendingMode at query start
    this.activeMode = this.pendingMode;

    // Reset interrupted flag for new message
    this.interrupted = false;

    // Build and write the user message to stdin (DO NOT close stdin!)
    const userMessage = this.buildStreamJsonUserMessage(prompt, options?.images ?? []);
    console.log('[ClaudeService] Writing stream-json user message to stdin (persistent mode)');
    proc.stdin?.write(userMessage + '\n');
    // NOTE: We intentionally do NOT call proc.stdin.end() to keep the process alive

    // Yield messages until we get a 'result' message (turn complete)
    while (!this.interrupted && !this.processExited) {
      const msg = await this.waitForMessage();

      if (msg === null) {
        // Process exited or interrupted
        if (this.processError && !this.interrupted) {
          throw this.processError;
        }
        break;
      }

      yield msg;

      // 'result' message marks end of turn - stop yielding but keep process alive
      if (msg.type === 'result') {
        // MSSCI-12795: Increment turn count on successful turn completion
        this.contextState.turnCount++;
        console.log('[ClaudeService] Turn complete (result message received), process stays alive');
        break;
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
   * Set the permission mode, taking effect immediately on the running process.
   * Sends a stream-json control request to stdin (same protocol as the Agent SDK's
   * Query.setPermissionMode). Also updates pendingMode for future process spawns.
   */
  setPermissionMode(mode: PermissionMode): void {
    this.pendingMode = mode;
    this.sendControlRequest({ subtype: 'set_permission_mode', mode });
  }

  /**
   * Send a control request to the running Claude process via stdin.
   * Uses the Agent SDK's stream-json control_request protocol.
   */
  private sendControlRequest(request: Record<string, unknown>): void {
    if (!this.currentProcess || this.processExited) {
      console.log('[ClaudeService] No running process, control request will apply on next spawn');
      return;
    }
    const message = {
      request_id: Math.random().toString(36).substring(2, 15),
      type: 'control_request',
      request,
    };
    console.log('[ClaudeService] Sending control request:', request.subtype);
    this.currentProcess.stdin?.write(JSON.stringify(message) + '\n');
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

  // ===========================================================================
  // MSSCI-12795: Session Context State Methods
  // ===========================================================================

  /**
   * Get the current session context state
   * Returns an immutable copy to prevent external mutation
   */
  getContextState(): SessionContextState {
    return {
      lastAgent: this.contextState.lastAgent,
      turnCount: this.contextState.turnCount,
      injectedComponents: [...this.contextState.injectedComponents],
    };
  }

  /**
   * Set the last agent that received context injection
   * @param agent - Agent name (e.g., 'dev', 'tea') or null to clear
   */
  setLastAgent(agent: string | null): void {
    this.contextState.lastAgent = agent;
  }

  /**
   * Add a component to the list of injected components
   * Prevents duplicates - only adds if not already present
   * @param component - Component name (e.g., 'persona', 'skills', 'guides')
   */
  addInjectedComponent(component: string): void {
    if (!this.contextState.injectedComponents.includes(component)) {
      this.contextState.injectedComponents.push(component);
    }
  }

  /**
   * Check if a component has been injected this session
   * @param component - Component name to check
   * @returns true if the component has been injected
   */
  hasInjectedComponent(component: string): boolean {
    return this.contextState.injectedComponents.includes(component);
  }

  /**
   * Clear all injected components (but keep lastAgent and turnCount)
   * Useful when agent changes but session continues
   */
  clearInjectedComponents(): void {
    this.contextState.injectedComponents = [];
  }

  /**
   * Reset context state to initial values
   * Called internally by resetSession() and clearSession()
   */
  private resetContextState(): void {
    this.contextState = {
      lastAgent: null,
      turnCount: 0,
      injectedComponents: [],
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
    // Clear any queued messages - don't process stale data after interrupt
    this.messageQueue = [];
    // Resolve any pending message resolvers to unblock waitForMessage()
    // This allows the sendMessage() generator to exit its while loop
    for (const resolve of this.messageResolvers) {
      resolve(null);
    }
    this.messageResolvers = [];
    // Emit event for any external listeners
    this.emit('interrupted');
  }

  /**
   * Abort the running process completely (kill it)
   * Unlike interrupt(), this fully terminates the subprocess
   * Background agent fix: Clear process state properly
   */
  abort(): void {
    console.log('[ClaudeService] abort() called, currentProcess:', !!this.currentProcess);
    // Set interrupted flag first so waitForMessage exits immediately
    this.interrupted = true;
    this.processExited = true;
    // Clear message queue - don't process stale data
    this.messageQueue = [];
    // Kill the process if running - use SIGKILL for immediate termination
    if (this.currentProcess) {
      console.log('[ClaudeService] Killing process with SIGKILL, pid:', this.currentProcess.pid);
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }
    // Clear any pending message resolvers
    for (const resolve of this.messageResolvers) {
      resolve(null);
    }
    this.messageResolvers = [];
    // Emit event for any external listeners
    this.emit('interrupted');
  }

  /**
   * Reset the session (clear session ID and kill process)
   * B-10: Also clears activeMode since no query has run in new session
   * MSSCI-12795: Also clears context state for fresh session
   * Background agent fix: Kill process to start fresh
   */
  resetSession(): void {
    // Kill the persistent process - next sendMessage will spawn fresh
    if (this.currentProcess) {
      console.log('[ClaudeService] Killing process on session reset');
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    this.processExited = true;
    this.sessionId = null;
    this.activeMode = undefined;
    // MSSCI-12795: Reset context state for new session
    this.resetContextState();
    // Clear any pending message resolvers
    for (const resolve of this.messageResolvers) {
      resolve(null);
    }
    this.messageResolvers = [];
    this.messageQueue = [];
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
   * Clear the session and wait for process to fully exit
   * MSSCI-11840: Async version that prevents race conditions when spawning new process
   * @returns Promise that resolves when process has fully exited
   */
  clearSessionAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.currentProcess) {
        // No process running, just clear state and resolve immediately
        this.resetSession();
        resolve();
        return;
      }

      // Set up listener for process exit BEFORE killing
      const proc = this.currentProcess;
      const onExit = () => {
        proc.removeListener('close', onExit);
        proc.removeListener('error', onExit);
        resolve();
      };

      proc.once('close', onExit);
      proc.once('error', onExit);

      // Now kill the process - resetSession will set currentProcess to null
      this.resetSession();

      // Safety timeout in case process doesn't exit cleanly
      setTimeout(() => {
        proc.removeListener('close', onExit);
        proc.removeListener('error', onExit);
        resolve();
      }, 2000);
    });
  }

  /**
   * Alias for resetSession - used by preload API
   */
  clear(): void {
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

    // Append system prompt for persona/agent context
    // This makes personas behave the same as in CLI mode
    if (this.appendSystemPrompt) {
      args.push('--append-system-prompt', this.appendSystemPrompt);
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
