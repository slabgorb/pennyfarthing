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
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
/**
 * ClaudeService - Wrapper for Claude Code CLI programmatic mode
 *
 * Uses child_process with stdin pipe for NDJSON streaming programmatic control
 * of Claude Code without requiring an Anthropic API key.
 */
export class ClaudeService extends EventEmitter {
    sessionId = null;
    pendingMode = 'acceptEdits';
    activeMode = undefined;
    currentProcess = null;
    interrupted = false;
    defaultCwd;
    spawner;
    // Persistent process state for background agent support
    stdoutBuffer = '';
    messageQueue = [];
    messageResolvers = [];
    processExited = false;
    processError = null;
    /** Default environment variables to pass to spawned Claude process */
    defaultEnv;
    constructor(options) {
        super();
        this.defaultCwd = options?.cwd;
        this.spawner = options?.spawner ?? spawn;
        this.defaultEnv = options?.env;
    }
    /**
     * Ensure a Claude process is running, spawning one if needed.
     * Reuses existing process to preserve background Task agents.
     */
    ensureProcess(options) {
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
        const env = { ...process.env, ...this.defaultEnv, ...options?.env, CYCLIST: '1' };
        console.log('[ClaudeService] Spawning new Claude process (persistent mode)');
        const proc = this.spawner('claude', args, {
            cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.currentProcess = proc;
        // Set up persistent stdout handler
        proc.stdout?.on('data', (data) => {
            this.stdoutBuffer += data.toString();
            const lines = this.stdoutBuffer.split('\n');
            this.stdoutBuffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                if (!line.startsWith('{'))
                    continue;
                try {
                    const msg = JSON.parse(line);
                    this.handleIncomingMessage(msg);
                }
                catch {
                    if (line.length > 10) {
                        console.warn('[ClaudeService] Skipping malformed JSON:', line.substring(0, 100));
                    }
                }
            }
        });
        // Log stderr for debugging
        proc.stderr?.on('data', (data) => {
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
                    const msg = JSON.parse(this.stdoutBuffer);
                    this.handleIncomingMessage(msg);
                }
                catch {
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
    handleIncomingMessage(msg) {
        // Capture session ID from system/init or result message
        if ((msg.type === 'system' || msg.type === 'result') && 'session_id' in msg && msg.session_id) {
            this.sessionId = msg.session_id;
        }
        // If someone is waiting for a message, give it to them
        const resolver = this.messageResolvers.shift();
        if (resolver) {
            resolver(msg);
        }
        else {
            // Otherwise queue it
            this.messageQueue.push(msg);
        }
    }
    /**
     * Wait for the next message from Claude.
     * Returns null if process exits or is interrupted.
     */
    waitForMessage() {
        // Check queue first
        if (this.messageQueue.length > 0) {
            return Promise.resolve(this.messageQueue.shift());
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
    async *sendMessage(prompt, options) {
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
                console.log('[ClaudeService] Turn complete (result message received), process stays alive');
                break;
            }
        }
    }
    /**
     * Get the current session ID (captured from init message)
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * Set the permission mode for subsequent queries
     * B-10: This sets the pending mode - takes effect on next query
     */
    setPermissionMode(mode) {
        this.pendingMode = mode;
    }
    /**
     * Get the current permission mode (pending mode for next query)
     * @deprecated Use getPendingMode() for clarity
     */
    getPermissionMode() {
        return this.pendingMode;
    }
    /**
     * B-10: Get the mode that was used in the last query
     * Returns undefined if no query has run yet
     */
    getActiveMode() {
        return this.activeMode;
    }
    /**
     * B-10: Get the mode that will be used in the next query
     */
    getPendingMode() {
        return this.pendingMode;
    }
    /**
     * B-10: Check if there's a pending mode change
     * Returns true when pendingMode differs from activeMode
     */
    hasPendingModeChange() {
        // If no query has run yet, there's always a "pending" change
        if (this.activeMode === undefined) {
            return true;
        }
        return this.activeMode !== this.pendingMode;
    }
    /**
     * B-10: Get complete mode state for UI synchronization
     */
    getModeState() {
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
    interrupt() {
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
     * Background agent fix: Clear process state properly
     */
    abort() {
        if (this.currentProcess) {
            console.log('[ClaudeService] Aborting process');
            this.currentProcess.kill();
            this.currentProcess = null;
        }
        this.processExited = true;
        // Clear any pending message resolvers
        for (const resolve of this.messageResolvers) {
            resolve(null);
        }
        this.messageResolvers = [];
        this.interrupt(); // Also set interrupted flag and emit event
    }
    /**
     * Reset the session (clear session ID and kill process)
     * B-10: Also clears activeMode since no query has run in new session
     * Background agent fix: Kill process to start fresh
     */
    resetSession() {
        // Kill the persistent process - next sendMessage will spawn fresh
        if (this.currentProcess) {
            console.log('[ClaudeService] Killing process on session reset');
            this.currentProcess.kill();
            this.currentProcess = null;
        }
        this.processExited = true;
        this.sessionId = null;
        this.activeMode = undefined;
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
    setSessionId(id) {
        this.sessionId = id;
    }
    /**
     * Clear the session (alias for resetSession, named for test clarity)
     * E7-3: New conversation support
     * B-10: Also clears activeMode for consistent behavior with resetSession()
     */
    clearSession() {
        this.resetSession();
    }
    /**
     * Build CLI arguments for stream-json input/output mode
     */
    buildArgs() {
        const args = [
            '-p', // Print mode (non-interactive)
            '--input-format', 'stream-json',
            '--output-format', 'stream-json',
            '--verbose',
        ];
        // Set permission mode based on user selection
        if (this.pendingMode === 'dangerouslySkipPermissions') {
            args.push('--dangerously-skip-permissions');
        }
        else {
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
    buildStreamJsonUserMessage(prompt, images) {
        // Build content array: text first, then images
        // (Claude API requires text before images)
        const content = [];
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
//# sourceMappingURL=claude-service.js.map