/**
 * Pennyfarthing Chat Participant for VS Code Chat API
 *
 * Integrates with VS Code's native chat view to provide @pennyfarthing
 * as a chat participant alongside GitHub Copilot.
 *
 * Uses ClaudeService to spawn Claude CLI and stream responses.
 *
 * MSSCI-12097
 */

import * as vscode from 'vscode';
import { ClaudeService } from '../services/claude-service';

// Agent subcommand definitions
const AGENT_COMMANDS = [
  { name: 'sm', description: 'Switch to Scrum Master agent' },
  { name: 'tea', description: 'Switch to Test Engineer agent' },
  { name: 'dev', description: 'Switch to Developer agent' },
  { name: 'reviewer', description: 'Switch to Reviewer agent' },
  { name: 'architect', description: 'Switch to Architect agent' },
  { name: 'pm', description: 'Switch to Product Manager agent' },
];

// Agent display names for confirmations
const AGENT_NAMES: Record<string, string> = {
  sm: 'Scrum Master',
  tea: 'Test Engineer',
  dev: 'Developer',
  reviewer: 'Reviewer',
  architect: 'Architect',
  pm: 'Product Manager',
};

/**
 * Chat participant that bridges VS Code chat to Claude CLI.
 */
export class PennyfarthingChatParticipant {
  private participant: vscode.ChatParticipant | null = null;
  private claudeService: ClaudeService | null = null;
  private outputChannel: vscode.OutputChannel | null = null;

  constructor() {}

  /**
   * Register the chat participant with VS Code.
   */
  register(): vscode.ChatParticipant {
    this.participant = vscode.chat.createChatParticipant(
      'pennyfarthing-vscode.pennyfarthing',
      this.handleRequest.bind(this)
    );

    this.participant.displayName = 'Pennyfarthing';
    this.participant.iconPath = vscode.Uri.file(
      __dirname + '/../../resources/pennyfarthing.svg'
    );

    // Register agent subcommands
    this.participant.subCommands = AGENT_COMMANDS;

    return this.participant;
  }

  /**
   * Set output channel for logging.
   */
  setOutputChannel(channel: vscode.OutputChannel): void {
    this.outputChannel = channel;
  }

  /**
   * Log a message to the output channel.
   */
  private log(message: string): void {
    this.outputChannel?.appendLine(`[ChatParticipant] ${message}`);
  }

  /**
   * Get or create ClaudeService for the workspace.
   */
  private getClaudeService(): ClaudeService {
    if (!this.claudeService) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const cwd = workspaceFolder?.uri.fsPath ?? process.cwd();

      this.claudeService = new ClaudeService({ cwd });
      this.log(`Created ClaudeService for ${cwd}`);
    }
    return this.claudeService;
  }

  /**
   * Handle incoming chat request from VS Code.
   */
  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Check for cancellation
    if (token.isCancellationRequested) {
      response.markdown('Request cancelled.');
      return;
    }

    // Handle agent switch commands - prepend to prompt
    let prompt = request.prompt || '';
    if (request.command) {
      const agentName = AGENT_NAMES[request.command];
      if (agentName) {
        prompt = `/${request.command} ${prompt}`.trim();
        this.log(`Agent switch: ${agentName}`);
      }
    }

    // Handle empty prompt
    if (!prompt.trim()) {
      response.markdown('Please enter a message.');
      return;
    }

    // Show progress
    response.progress('Thinking...');
    this.log(`Sending: ${prompt.substring(0, 100)}...`);

    try {
      await this.streamClaudeResponse(prompt, response, token);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log(`Error: ${errorMsg}`);
      response.markdown(`\n\n❌ Error: ${errorMsg}`);
    }
  }

  /**
   * Stream response from Claude CLI to chat.
   */
  private async streamClaudeResponse(
    prompt: string,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const service = this.getClaudeService();

      // Handle text chunks
      const onText = (text: string) => {
        response.markdown(text);
      };

      // Handle tool use
      const onToolUse = (name: string, input: Record<string, unknown>) => {
        const inputStr = this.truncateInput(JSON.stringify(input, null, 2));
        response.markdown(
          `\n\n📄 **Tool: ${name}**\n\`\`\`json\n${inputStr}\n\`\`\`\n`
        );
      };

      // Handle completion
      const onComplete = () => {
        cleanup();
        resolve();
      };

      // Handle errors
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      // Cleanup listeners
      const cleanup = () => {
        service.off('text', onText);
        service.off('toolUse', onToolUse);
        service.off('complete', onComplete);
        service.off('error', onError);
      };

      // Register listeners
      service.on('text', onText);
      service.on('toolUse', onToolUse);
      service.on('complete', onComplete);
      service.on('error', onError);

      // Handle cancellation
      token.onCancellationRequested(() => {
        this.log('Request cancelled by user');
        service.stop();
        cleanup();
        resolve();
      });

      // Send the message
      service.sendMessage(prompt).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * Truncate long input strings for display.
   */
  private truncateInput(input: string, maxLength = 500): string {
    if (input.length <= maxLength) {
      return input;
    }
    return input.substring(0, maxLength) + '...';
  }

  /**
   * Dispose of the chat participant and Claude service.
   */
  dispose(): void {
    if (this.claudeService) {
      this.claudeService.stop();
      this.claudeService = null;
    }
    if (this.participant) {
      this.participant.dispose();
      this.participant = null;
    }
  }
}
