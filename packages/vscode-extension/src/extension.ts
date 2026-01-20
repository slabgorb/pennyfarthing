import * as vscode from 'vscode';
import {
  PennyfarthingTerminalProfileProvider,
  PennyfarthingTerminalLinkProvider,
} from './providers/terminal';
import { WheelHubAdapter } from './server/wheelhub-adapter';

/**
 * Pennyfarthing VS Code Extension
 *
 * Activates when a workspace contains .pennyfarthing or .claude directories,
 * providing agent orchestration integration for Claude Code.
 */

// Module-level reference for cleanup
let wheelHubAdapter: WheelHubAdapter | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
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

  // Start WheelHub server (MSSCI-12047)
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    wheelHubAdapter = new WheelHubAdapter(
      workspaceFolder.uri.fsPath,
      outputChannel
    );

    try {
      await wheelHubAdapter.start();
      outputChannel.appendLine(
        `[WheelHub] Server listening on port ${wheelHubAdapter.getPort()}`
      );

      // Create disposable for cleanup
      const serverDisposable = {
        _isWheelHubDisposable: true,
        dispose: async () => {
          if (wheelHubAdapter) {
            await wheelHubAdapter.stop();
          }
        },
      };

      context.subscriptions.push(serverDisposable as vscode.Disposable);
    } catch (err) {
      outputChannel.appendLine(
        `[WheelHub] Failed to start server: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  context.subscriptions.push(
    outputChannel,
    statusCommand,
    terminalProfileProvider,
    terminalLinkProvider
  );
}

export async function deactivate(): Promise<void> {
  // Cleanup WheelHub server on deactivation
  if (wheelHubAdapter) {
    await wheelHubAdapter.stop();
    wheelHubAdapter = null;
  }
}
