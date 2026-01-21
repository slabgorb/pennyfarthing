import * as vscode from 'vscode';

/**
 * Pennyfarthing VS Code Extension
 *
 * Activates when a workspace contains .pennyfarthing or .claude directories,
 * providing agent orchestration integration for Claude Code.
 */

// Lazy imports to avoid blocking activation
let WheelHubAdapter: typeof import('./server/wheelhub-adapter').WheelHubAdapter | null = null;
let AgentStatusTreeDataProvider: typeof import('./providers/sidebar').AgentStatusTreeDataProvider | null = null;
let PennyfarthingTerminalProfileProvider: typeof import('./providers/terminal').PennyfarthingTerminalProfileProvider | null = null;
let PennyfarthingTerminalLinkProvider: typeof import('./providers/terminal').PennyfarthingTerminalLinkProvider | null = null;
let PennyfarthingChatParticipant: typeof import('./providers/chat-participant').PennyfarthingChatParticipant | null = null;

// Module-level reference for cleanup
let wheelHubAdapter: InstanceType<typeof import('./server/wheelhub-adapter').WheelHubAdapter> | null = null;
let chatParticipant: InstanceType<typeof import('./providers/chat-participant').PennyfarthingChatParticipant> | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Pennyfarthing');
  outputChannel.appendLine('Pennyfarthing extension activating...');
  outputChannel.show(); // Show output panel to see logs

  // Load modules lazily
  try {
    outputChannel.appendLine('Loading providers...');
    const terminalModule = await import('./providers/terminal');
    PennyfarthingTerminalProfileProvider = terminalModule.PennyfarthingTerminalProfileProvider;
    PennyfarthingTerminalLinkProvider = terminalModule.PennyfarthingTerminalLinkProvider;

    outputChannel.appendLine('Loading sidebar...');
    const sidebarModule = await import('./providers/sidebar');
    AgentStatusTreeDataProvider = sidebarModule.AgentStatusTreeDataProvider;

    outputChannel.appendLine('Loading WheelHub...');
    const wheelhubModule = await import('./server/wheelhub-adapter');
    WheelHubAdapter = wheelhubModule.WheelHubAdapter;

    outputChannel.appendLine('Loading chat participant...');
    const chatModule = await import('./providers/chat-participant');
    PennyfarthingChatParticipant = chatModule.PennyfarthingChatParticipant;

    outputChannel.appendLine('All modules loaded');
  } catch (err) {
    outputChannel.appendLine(`Failed to load modules: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

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

  // Register chat participant (MSSCI-12097)
  chatParticipant = new PennyfarthingChatParticipant();
  chatParticipant.setOutputChannel(outputChannel);
  try {
    chatParticipant.register();
    outputChannel.appendLine('[ChatParticipant] @pennyfarthing registered');
  } catch (err) {
    outputChannel.appendLine(`[ChatParticipant] Failed to register: ${err instanceof Error ? err.message : String(err)}`);
  }

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

  // Start WheelHub server (MSSCI-12047) - non-blocking to avoid activation hang
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    wheelHubAdapter = new WheelHubAdapter(
      workspaceFolder.uri.fsPath,
      outputChannel
    );

    // Start server asynchronously to not block extension activation
    wheelHubAdapter.start()
      .then(() => {
        outputChannel.appendLine(
          `[WheelHub] Server listening on port ${wheelHubAdapter!.getPort()}`
        );

        // Wire sidebar provider to WheelHub for real-time stats updates (MSSCI-12048)
        sidebarProvider.connectToWheelHub(wheelHubAdapter!.getWebSocketManager());
        outputChannel.appendLine('[WheelHub] Sidebar provider connected to stats channel');

        // Wire chat participant to WheelHub for message streaming (MSSCI-12097)
        if (chatParticipant) {
          chatParticipant.connectToWheelHub(wheelHubAdapter!.getWebSocketManager());
          outputChannel.appendLine('[WheelHub] Chat participant connected to messages channel');
        }
      })
      .catch((err) => {
        outputChannel.appendLine(
          `[WheelHub] Failed to start server: ${err instanceof Error ? err.message : String(err)}`
        );
      });

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
  }

  context.subscriptions.push(
    outputChannel,
    statusCommand,
    terminalProfileProvider,
    terminalLinkProvider,
    sidebarTreeView,
    { dispose: () => sidebarProvider.dispose() }, // Clean up sidebar provider
    { dispose: () => chatParticipant?.dispose() }, // Clean up chat participant
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
