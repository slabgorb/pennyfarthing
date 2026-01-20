import * as vscode from 'vscode';
import {
  PennyfarthingTerminalProfileProvider,
  PennyfarthingTerminalLinkProvider,
} from './providers/terminal';
import { AgentStatusTreeDataProvider } from './providers/sidebar';
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

  // Register sidebar tree view (MSSCI-12048)
  const sidebarProvider = new AgentStatusTreeDataProvider();
  const sidebarTreeView = vscode.window.registerTreeDataProvider(
    'pennyfarthing.agentStatus',
    sidebarProvider
  );

  // Register sidebar commands
  const switchAgentCommand = vscode.commands.registerCommand(
    'pennyfarthing.switchAgent',
    async () => {
      const agents = [
        { label: '/sm - Scrum Master', value: '/sm' },
        { label: '/tea - Test Engineer', value: '/tea' },
        { label: '/dev - Developer', value: '/dev' },
        { label: '/reviewer - Code Reviewer', value: '/reviewer' },
      ];
      const selected = await vscode.window.showQuickPick(agents, {
        placeHolder: 'Select agent to switch to',
      });
      if (selected) {
        // Send command to active terminal
        const terminal = vscode.window.activeTerminal;
        if (terminal) {
          terminal.sendText(selected.value);
        } else {
          vscode.window.showInformationMessage(
            `Switch to ${selected.value} in your Claude terminal`
          );
        }
      }
    }
  );

  const viewBacklogCommand = vscode.commands.registerCommand(
    'pennyfarthing.viewBacklog',
    async () => {
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        terminal.sendText('/sprint');
      } else {
        vscode.window.showInformationMessage(
          'Run /sprint in your Claude terminal to view backlog'
        );
      }
    }
  );

  const startWorkCommand = vscode.commands.registerCommand(
    'pennyfarthing.startWork',
    async () => {
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        terminal.sendText('/work');
      } else {
        vscode.window.showInformationMessage(
          'Run /work in your Claude terminal to start work'
        );
      }
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    'pennyfarthing.refresh',
    () => {
      // Trigger tree refresh by firing change event
      // Only update if persona exists to avoid null errors
      const persona = sidebarProvider.getPersona();
      if (persona) {
        sidebarProvider.updatePersona(persona);
      } else {
        // If no persona, just fire the change event by updating with null data
        // which will show the empty state
        sidebarProvider.updateContext({ usablePercent: 0 });
      }
    }
  );

  const openJiraCommand = vscode.commands.registerCommand(
    'pennyfarthing.openJira',
    (storyId: string) => {
      // Open Jira issue in browser
      // Assumes JIRA_BASE_URL environment variable or default
      const jiraBase =
        process.env.JIRA_BASE_URL || 'https://jira.atlassian.com';
      const jiraUrl = `${jiraBase}/browse/${storyId}`;
      vscode.env.openExternal(vscode.Uri.parse(jiraUrl));
    }
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

      // Wire sidebar provider to WheelHub for real-time stats updates (MSSCI-12048)
      sidebarProvider.connectToWheelHub(wheelHubAdapter.getWebSocketManager());
      outputChannel.appendLine('[WheelHub] Sidebar provider connected to stats channel');

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
    terminalLinkProvider,
    sidebarTreeView,
    { dispose: () => sidebarProvider.dispose() }, // Clean up sidebar provider
    switchAgentCommand,
    viewBacklogCommand,
    startWorkCommand,
    refreshCommand,
    openJiraCommand
  );
}

export async function deactivate(): Promise<void> {
  // Cleanup WheelHub server on deactivation
  if (wheelHubAdapter) {
    await wheelHubAdapter.stop();
    wheelHubAdapter = null;
  }
}
