/**
 * Claude CLI Service for VS Code Extension
 *
 * Spawns Claude Code CLI as a child process with stream-json format,
 * using the user's authenticated Pro/Max account.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Message types from Claude's stream-json output
 */
export interface AssistantMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  };
}

export interface ToolUseMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }>;
  };
}

export interface ResultMessage {
  type: 'result';
  result: string;
  session_id: string;
  cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ErrorMessage {
  type: 'error';
  error: {
    message: string;
    code?: string;
  };
}

export type SDKMessage = AssistantMessage | ToolUseMessage | ResultMessage | ErrorMessage;

/**
 * Events emitted by ClaudeService
 */
export interface ClaudeServiceEvents {
  message: (msg: SDKMessage) => void;
  text: (text: string) => void;
  toolUse: (name: string, input: Record<string, unknown>) => void;
  complete: (sessionId: string) => void;
  error: (error: Error) => void;
}

/**
 * Service that manages Claude CLI process communication
 */
export class ClaudeService extends EventEmitter {
  private proc: ChildProcess | null = null;
  private stdoutBuffer = '';
  private sessionId: string | null = null;
  private cwd: string;

  constructor(options: { cwd: string }) {
    super();
    this.cwd = options.cwd;
  }

  /**
   * Send a message to Claude and stream responses
   */
  async sendMessage(prompt: string): Promise<void> {
    // If no process running, spawn one
    if (!this.proc) {
      await this.spawn();
    }

    // Build stream-json user message
    const userMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    });

    // Send to Claude's stdin
    this.proc?.stdin?.write(userMessage + '\n');
  }

  /**
   * Spawn Claude CLI process
   */
  private async spawn(): Promise<void> {
    const args = this.buildArgs();

    this.proc = spawn('claude', args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Ensure we're in the right directory
        CLAUDE_PROJECT_DIR: this.cwd,
      },
    });

    // Handle stdout (stream-json messages)
    this.proc.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(data);
    });

    // Handle stderr (logs/errors)
    this.proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      // Only emit actual errors, not verbose logs
      if (text.includes('Error') || text.includes('error')) {
        this.emit('error', new Error(text));
      }
    });

    // Handle process exit
    this.proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.emit('error', new Error(`Claude process exited with code ${code}`));
      }
      this.proc = null;
    });

    // Handle spawn errors
    this.proc.on('error', (err) => {
      this.emit('error', err);
      this.proc = null;
    });
  }

  /**
   * Build CLI arguments for stream-json mode
   */
  private buildArgs(): string[] {
    const args = [
      '-p', // Print mode (non-interactive)
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
    ];

    // Resume session if we have one
    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    return args;
  }

  /**
   * Handle stdout data from Claude
   */
  private handleStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString();
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      if (!line.startsWith('{')) continue;

      try {
        const msg = JSON.parse(line) as SDKMessage;
        this.handleMessage(msg);
      } catch {
        // Skip malformed JSON
      }
    }
  }

  /**
   * Process a parsed message from Claude
   */
  private handleMessage(msg: SDKMessage): void {
    this.emit('message', msg);

    if (msg.type === 'assistant') {
      // Extract text content
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          this.emit('text', block.text);
        } else if (block.type === 'tool_use') {
          this.emit('toolUse', block.name, block.input);
        }
      }
    } else if (msg.type === 'result') {
      this.sessionId = msg.session_id;
      this.emit('complete', msg.session_id);
    } else if (msg.type === 'error') {
      this.emit('error', new Error(msg.error.message));
    }
  }

  /**
   * Stop the Claude process
   */
  stop(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  /**
   * Check if Claude process is running
   */
  isRunning(): boolean {
    return this.proc !== null;
  }
}
