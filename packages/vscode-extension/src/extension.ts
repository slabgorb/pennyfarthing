import * as vscode from 'vscode';
import {
  PennyfarthingTerminalProfileProvider,
  PennyfarthingTerminalLinkProvider,
} from './providers/terminal';

/**
 * Pennyfarthing VS Code Extension
 *
 * Activates when a workspace contains .pennyfarthing or .claude directories,
 * providing agent orchestration integration for Claude Code.
 */

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Pennyfarthing');
  outputChannel.appendLine('Pennyfarthing extension activated');

  // Register status command
  const statusCommand = vscode.commands.registerCommand(
    'pennyfarthing.showStatus',
    () => {
      vscode.window.showInformationMessage('Pennyfarthing: Extension active');
    }
  );

  // Register terminal profile provider for "Pennyfarthing Claude" terminal
  const terminalProfileProvider = vscode.window.registerTerminalProfileProvider(
    'pennyfarthing.claudeTerminal',
    new PennyfarthingTerminalProfileProvider()
  );

  // Register terminal link provider for file:line detection
  const terminalLinkProvider = vscode.window.registerTerminalLinkProvider(
    new PennyfarthingTerminalLinkProvider()
  );

  context.subscriptions.push(
    outputChannel,
    statusCommand,
    terminalProfileProvider,
    terminalLinkProvider
  );
}

export function deactivate(): void {
  // Cleanup on deactivation
}
