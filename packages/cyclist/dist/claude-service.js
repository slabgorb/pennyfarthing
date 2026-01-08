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
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
/**
 * Default spawner using node-pty
 * Claude CLI requires a TTY to produce stream-json output
 */
const defaultSpawner = (command, args, options) => {
    return pty.spawn(command, args, {
        name: options.name ?? 'xterm-256color',
        cols: options.cols ?? 120,
        rows: options.rows ?? 30,
        cwd: options.cwd,
        env: options.env,
    });
};
export class ClaudeService extends EventEmitter {
    sessionId = null;
    pendingMode = 'acceptEdits';
    activeMode = undefined;
    currentProcess = null;
    interrupted = false;
    spawner;
    defaultCwd;
    constructor(options) {
        super();
        this.spawner = options?.spawner ?? defaultSpawner;
        this.defaultCwd = options?.cwd;
    }
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
    async *sendMessage(prompt, options) {
        // CRITICAL: Kill any existing process before starting a new one
        // This prevents duplicate Claude instances responding to the same conversation
        if (this.currentProcess) {
            console.log('[ClaudeService] Killing existing process before starting new one');
            this.currentProcess.kill();
            this.currentProcess = null;
        }
        const args = this.buildArgs(prompt);
        const spawnOptions = this.buildSpawnOptions(options);
        // B-10: Update activeMode to match pendingMode at query start
        this.activeMode = this.pendingMode;
        // Reset interrupted flag for new message
        this.interrupted = false;
        const proc = this.spawner('claude', args, spawnOptions);
        this.currentProcess = proc;
        // Buffer for incomplete JSON lines
        let buffer = '';
        // Create a promise-based message queue
        const messageQueue = [];
        let resolveNext = null;
        let done = false;
        let error = null;
        const pushMessage = (msg) => {
            // Capture session ID from system/init message
            if ((msg.type === 'system' || msg.type === 'result') && 'session_id' in msg && msg.session_id) {
                this.sessionId = msg.session_id;
            }
            if (resolveNext) {
                resolveNext({ value: msg, done: false });
                resolveNext = null;
            }
            else {
                messageQueue.push(msg);
            }
        };
        const finish = (err) => {
            done = true;
            error = err ?? null;
            if (resolveNext) {
                if (err) {
                    // Don't reject, just mark done - error is captured
                }
                resolveNext({ value: undefined, done: true });
                resolveNext = null;
            }
        };
        // Handle PTY data - parse NDJSON
        // node-pty combines stdout/stderr into a single stream
        proc.onData((data) => {
            buffer += data;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Keep incomplete line in buffer
            for (const line of lines) {
                if (!line.trim())
                    continue;
                // Skip ANSI escape sequences and non-JSON lines
                // PTY may include terminal control characters
                const cleanLine = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
                if (!cleanLine.startsWith('{'))
                    continue;
                try {
                    const msg = JSON.parse(cleanLine);
                    pushMessage(msg);
                }
                catch {
                    // Skip malformed JSON lines (may include terminal formatting)
                    if (cleanLine.length > 10) {
                        console.warn('[ClaudeService] Skipping malformed JSON:', cleanLine.substring(0, 100));
                    }
                }
            }
        });
        // Handle PTY exit
        proc.onExit(({ exitCode, signal }) => {
            // Flush any remaining buffer
            if (buffer.trim()) {
                const cleanBuffer = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
                if (cleanBuffer.startsWith('{')) {
                    try {
                        const msg = JSON.parse(cleanBuffer);
                        pushMessage(msg);
                    }
                    catch {
                        // Ignore incomplete JSON at end
                    }
                }
            }
            // Only error on non-zero exit if we got no messages and no signal
            // Exit code 1 can happen normally when process is terminated
            if (exitCode !== 0 && exitCode !== null && signal === 0 && messageQueue.length === 0) {
                finish(new Error(`Claude process exited with code ${exitCode}`));
            }
            else {
                finish();
            }
            this.currentProcess = null;
        });
        // Expose resolveNext so interrupt() can break the wait
        const self = this;
        // Yield messages as they arrive
        while (!done || messageQueue.length > 0) {
            // Check if interrupted
            if (self.interrupted) {
                break;
            }
            if (messageQueue.length > 0) {
                yield messageQueue.shift();
            }
            else if (!done) {
                // Wait for next message or interrupt
                const msg = await new Promise((resolve) => {
                    const onInterrupt = () => resolve(null);
                    self.once('interrupted', onInterrupt);
                    resolveNext = (result) => {
                        self.removeListener('interrupted', onInterrupt);
                        if (result.done || self.interrupted) {
                            resolve(null);
                        }
                        else {
                            resolve(result.value);
                        }
                    };
                });
                // Check if we got a null (done or interrupted)
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
            // Send Escape character to interrupt current turn
            this.currentProcess.write('\x1b');
        }
        // Emit event to break any waiting promises
        this.emit('interrupted');
    }
    /**
     * Abort the running process completely (kill it)
     * Unlike interrupt(), this fully terminates the subprocess
     */
    abort() {
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
    resetSession() {
        this.sessionId = null;
        this.activeMode = undefined;
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
     * Build CLI arguments for claude command
     *
     * NOTE: --verbose is REQUIRED when using -p with --output-format stream-json
     * Without it, Claude CLI produces no output.
     */
    buildArgs(prompt) {
        const args = [
            '-p', prompt,
            '--output-format', 'stream-json',
            '--verbose', // REQUIRED for stream-json with -p flag
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
     * Build spawn options for node-pty including OTEL environment variables
     */
    buildSpawnOptions(options) {
        // Preserve OTEL environment variables from parent process
        const env = {
            ...process.env,
            ...options?.env,
        };
        return {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: options?.cwd ?? this.defaultCwd ?? process.cwd(),
            env,
        };
    }
}
//# sourceMappingURL=claude-service.js.map