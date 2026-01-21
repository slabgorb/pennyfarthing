/**
 * MSSCI-12051: Webview Message Handler
 *
 * Routes messages between the Cyclist webview and VS Code extension host.
 * Handles stats updates, story updates, and command execution requests.
 */

import * as vscode from 'vscode';

// Stats data type for handler
interface StatsData {
  persona?: {
    character: string;
    theme: string;
    role: string;
  };
  context?: {
    usablePercent: number;
  };
  sprint?: {
    totalPoints: number;
    completedPoints: number;
    inProgressCount: number;
  };
  story?: {
    id: string;
    title: string;
    phase: string;
    branch: string;
    points?: number;
  };
}

// Story data type for handler
interface StoryData {
  id: string;
  title: string;
  phase: string;
  branch: string;
  points?: number;
}

// Message types from webview
interface WebviewMessage {
  type: string;
  command?: string;
  args?: unknown[];
  [key: string]: unknown;
}

/**
 * WebviewMessageHandler - Routes messages to/from Cyclist webview
 */
export class WebviewMessageHandler {
  private _webview: vscode.Webview;

  constructor(webview: vscode.Webview) {
    this._webview = webview;
  }

  /**
   * Handle stats update from WheelHub.
   */
  public handleStats(data: StatsData): void {
    this._webview.postMessage({
      type: 'stats',
      data,
    });
  }

  /**
   * Handle story update from WheelHub.
   */
  public handleStory(data: StoryData): void {
    this._webview.postMessage({
      type: 'story',
      data,
    });
  }

  /**
   * Handle theme change from VS Code.
   */
  public handleThemeChange(theme: string): void {
    this._webview.postMessage({
      type: 'themeChange',
      theme,
    });
  }

  /**
   * Handle connection status change.
   */
  public handleConnectionStatus(status: 'connected' | 'reconnecting' | 'disconnected'): void {
    this._webview.postMessage({
      type: 'connectionStatus',
      status,
    });
  }

  /**
   * Handle message from webview.
   */
  public async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'executeCommand':
        if (message.command) {
          await vscode.commands.executeCommand(message.command, ...(message.args || []));
        }
        break;

      case 'log':
        // Log from webview for debugging
        console.log('[CyclistWebview]', message);
        break;

      case 'error':
        // Error from webview
        console.error('[CyclistWebview Error]', message);
        break;
    }
  }
}
