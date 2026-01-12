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
    constructor(options) {
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
    async *sendMessage(prompt, options) {
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
                resolveNext({ value: undefined, done: true });
                resolveNext = null;
            }
        };
        // Parse NDJSON from stdout
        proc.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                if (!line.startsWith('{'))
                    continue;
                try {
                    const msg = JSON.parse(line);
                    pushMessage(msg);
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
        // Handle process exit
        proc.on('close', (exitCode) => {
            // Flush remaining buffer
            if (buffer.trim() && buffer.startsWith('{')) {
                try {
                    const msg = JSON.parse(buffer);
                    pushMessage(msg);
                }
                catch {
                    // Ignore incomplete JSON
                }
            }
            if (exitCode !== 0 && exitCode !== null && messageQueue.length === 0) {
                finish(new Error(`Claude process exited with code ${exitCode}`));
            }
            else {
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
                yield messageQueue.shift();
            }
            else if (!done) {
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