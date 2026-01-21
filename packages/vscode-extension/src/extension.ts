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
let registerSkillCommands: typeof import('./commands/command-registry').registerSkillCommands | null = null;
let CyclistWebviewProvider: typeof import('./providers/cyclist-webview').CyclistWebviewProvider | null = null;
let WelcomeWebviewProvider: typeof import('./providers/welcome-webview').WelcomeWebviewProvider | null = null;
let ReflectorAdapter: typeof import('./adapters/reflector').ReflectorAdapter | null = null;

// Module-level reference for cleanup
let wheelHubAdapter: InstanceType<typeof import('./server/wheelhub-adapter').WheelHubAdapter> | null = null;
let chatParticipant: InstanceType<typeof import('./providers/chat-participant').PennyfarthingChatParticipant> | null = null;
let cyclistWebviewProvider: InstanceType<typeof import('./providers/cyclist-webview').CyclistWebviewProvider> | null = null;
let welcomeWebviewProvider: InstanceType<typeof import('./providers/welcome-webview').WelcomeWebviewProvider> | null = null;
let reflectorAdapter: InstanceType<typeof import('./adapters/reflector').ReflectorAdapter> | null = null;

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

    outputChannel.appendLine('Loading command registry...');
    const commandModule = await import('./commands/command-registry');
    registerSkillCommands = commandModule.registerSkillCommands;

    outputChannel.appendLine('Loading Cyclist webview...');
    const cyclistWebviewModule = await import('./providers/cyclist-webview');
    CyclistWebviewProvider = cyclistWebviewModule.CyclistWebviewProvider;

    outputChannel.appendLine('Loading Welcome webview...');
    const welcomeWebviewModule = await import('./providers/welcome-webview');
    WelcomeWebviewProvider = welcomeWebviewModule.WelcomeWebviewProvider;

    outputChannel.appendLine('Loading Reflector adapter...');
    const reflectorModule = await import('./adapters/reflector');
    ReflectorAdapter = reflectorModule.ReflectorAdapter;

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

  // Start file watchers for sidebar sync (MSSCI-12147)
  // This enables sidebar updates from session/config files without WheelHub
  sidebarProvider.startFileWatchers();
  outputChannel.appendLine('[Sidebar] File watchers started for session/config sync');

  // Register Cyclist webview provider (MSSCI-12051)
  cyclistWebviewProvider = new CyclistWebviewProvider!(context.extensionUri);
  const cyclistWebviewDisposable = vscode.window.registerWebviewViewProvider(
    'pennyfarthing.cyclistPanel',
    cyclistWebviewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  // Register Welcome webview provider (MSSCI-12123)
  welcomeWebviewProvider = new WelcomeWebviewProvider!(context.extensionUri, context.globalState);
  const welcomeWebviewDisposable = vscode.window.registerWebviewViewProvider(
    'pennyfarthing.welcomePanel',
    welcomeWebviewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  // First-run detection: reveal sidebar on first activation (MSSCI-12123)
  if (!welcomeWebviewProvider.hasUserSeenWelcome()) {
    outputChannel.appendLine('[Welcome] First activation detected, revealing sidebar');
    // Reveal the Pennyfarthing sidebar to show the welcome panel
    vscode.commands.executeCommand('workbench.view.extension.pennyfarthing');
  }

  // Register chat participant (MSSCI-12097)
  chatParticipant = new PennyfarthingChatParticipant();
  chatParticipant.setOutputChannel(outputChannel);
  try {
    chatParticipant.register();
    outputChannel.appendLine('[ChatParticipant] @pennyfarthing registered');
  } catch (err) {
    outputChannel.appendLine(`[ChatParticipant] Failed to register: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Register skill commands for command palette (MSSCI-12050)
  const skillCommandDisposables = registerSkillCommands!(context, outputChannel);
  context.subscriptions.push(...skillCommandDisposables);

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

  // Register invokeSkill command for sidebar skills (MSSCI-12124)
  const invokeSkillCommand = vscode.commands.registerCommand(
    'pennyfarthing.invokeSkill',
    async (skillName: string) => {
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        terminal.sendText(`/${skillName}`);
      } else {
        vscode.window.showInformationMessage(
          `Run /${skillName} in your Claude terminal`
        );
      }
    }
  );

  // Register invokeCommand command for sidebar commands (MSSCI-12124)
  const invokeCommandCommand = vscode.commands.registerCommand(
    'pennyfarthing.invokeCommand',
    async (commandName: string) => {
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        terminal.sendText(`/${commandName}`);
      } else {
        vscode.window.showInformationMessage(
          `Run /${commandName} in your Claude terminal`
        );
      }
    }
  );

  // Register contextClear command for Reflector CONTEXT_CLEAR marker (MSSCI-12049)
  const contextClearCommand = vscode.commands.registerCommand(
    'pennyfarthing.contextClear',
    async (agent?: string) => {
      // Clear context and optionally switch to specified agent
      // TirePump in Cyclist clears session and reloads
      const terminal = vscode.window.activeTerminal;
      if (terminal) {
        // Send /clear to reset context, then optionally invoke agent
        terminal.sendText('/clear');
        if (agent) {
          // Give a moment for clear to process, then switch agent
          setTimeout(() => {
            terminal.sendText(agent);
          }, 500);
        }
      } else {
        vscode.window.showInformationMessage(
          `Context clear requested${agent ? ` with ${agent}` : ''}. Start a Claude terminal first.`
        );
      }
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

        // Note: Chat participant uses direct CLI spawning (ADR-004), not WheelHub

        // Wire Cyclist webview provider to WheelHub for stats/story updates (MSSCI-12051)
        if (cyclistWebviewProvider) {
          cyclistWebviewProvider.connectToWheelHub(wheelHubAdapter!.getWebSocketManager());
          outputChannel.appendLine('[WheelHub] Cyclist webview connected to stats channel');
        }

        // Wire Reflector adapter to WheelHub for marker detection (MSSCI-12049)
        if (ReflectorAdapter) {
          reflectorAdapter = new ReflectorAdapter();
          reflectorAdapter.connectToWheelHub(wheelHubAdapter!.getWebSocketManager());
          outputChannel.appendLine('[WheelHub] Reflector adapter connected to messages channel');
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
    cyclistWebviewDisposable, // MSSCI-12051: Cyclist webview
    welcomeWebviewDisposable, // MSSCI-12123: Welcome webview
    { dispose: () => sidebarProvider.dispose() }, // Clean up sidebar provider
    { dispose: () => chatParticipant?.dispose() }, // Clean up chat participant
    { dispose: () => cyclistWebviewProvider?.dispose() }, // Clean up Cyclist webview provider
    { dispose: () => welcomeWebviewProvider?.dispose() }, // Clean up Welcome webview provider
    { dispose: () => reflectorAdapter?.dispose() }, // Clean up Reflector adapter (MSSCI-12049)
    switchAgentCommand,
    viewBacklogCommand,
    startWorkCommand,
    refreshCommand,
    openJiraCommand,
    invokeSkillCommand, // MSSCI-12124
    invokeCommandCommand, // MSSCI-12124
    contextClearCommand // MSSCI-12049
  );
}

export async function deactivate(): Promise<void> {
  // Cleanup WheelHub server on deactivation
  if (wheelHubAdapter) {
    await wheelHubAdapter.stop();
    wheelHubAdapter = null;
  }
}
