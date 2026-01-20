import * as vscode from 'vscode';

/**
 * Pennyfarthing VS Code Extension
 *
 * Activates when a workspace contains .pennyfarthing or .claude directories,
 * providing agent orchestration integration for Claude Code.
 */

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Pennyfarthing');
  outputChannel.appendLine('Pennyfarthing extension activated');

  const statusCommand = vscode.commands.registerCommand(
    'pennyfarthing.showStatus',
    () => {
      vscode.window.showInformationMessage('Pennyfarthing: Extension active');
    }
  );

  context.subscriptions.push(outputChannel, statusCommand);
}

export function deactivate(): void {
  // Cleanup on deactivation
}
