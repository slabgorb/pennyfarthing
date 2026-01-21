/**
 * MSSCI-12190: StatusBarManager - WheelHub Connection Infrastructure
 *
 * Orchestrates VS Code status bar items for Pennyfarthing extension.
 * Manages connection state and subscribes to WheelHub stats updates.
 */

import * as vscode from 'vscode';
import type { WebSocketManager, StatsData } from '../server/websocket-manager';

/** Connection state for WheelHub */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/** Callback for retry events */
type RetryCallback = () => void;

/**
 * Manages status bar items for the Pennyfarthing VS Code extension.
 * Displays context usage, connection state, and handles retry logic.
 */
export class StatusBarManager implements vscode.Disposable {
  /** Marker for identifying this disposable in subscriptions */
  public readonly _isStatusBarManager = true;

  /** Status bar item for context display */
  private contextItem: vscode.StatusBarItem;

  /** Subscription cleanup function for WebSocketManager */
  private statsUnsubscribe?: () => void;

  /** Current connection state */
  private connectionState: ConnectionState = 'connecting';

  /** Retry timer ID */
  private retryTimer?: ReturnType<typeof setInterval>;

  /** Retry callbacks */
  private retryCallbacks: Set<RetryCallback> = new Set();

  /** Whether this manager has been disposed */
  private disposed = false;

  /** Last known context data */
  private lastContext?: { usablePercent: number; tokens?: number };

  /**
   * Create a new StatusBarManager.
   * @param wsManager Optional WebSocketManager for stats subscription
   */
  constructor(wsManager?: WebSocketManager) {
    // Create context status bar item with priority 100 (leftmost)
    this.contextItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    // Set initial connecting state
    this.updateContextDisplay();
    this.contextItem.show();

    // Subscribe to stats if WebSocketManager provided
    if (wsManager) {
      this.statsUnsubscribe = wsManager.onStats((data) => this.handleStats(data));
    }
  }

  /**
   * Handle incoming stats data from WebSocketManager.
   */
  private handleStats(data: StatsData | null | undefined): void {
    if (this.disposed) return;

    // Gracefully handle null/undefined/malformed data
    if (!data || typeof data !== 'object') return;

    // Update connection state to connected on first stats
    if (this.connectionState !== 'connected') {
      this.setConnectionState('connected');
    }

    // Extract context data if present
    if (data.context && typeof data.context === 'object') {
      const percent = data.context.usablePercent;
      const tokens = (data.context as { tokens?: number }).tokens;

      // Validate percent is a reasonable number
      if (typeof percent === 'number' && !isNaN(percent)) {
        this.lastContext = {
          usablePercent: Math.max(0, Math.min(100, percent)),
          tokens: typeof tokens === 'number' ? tokens : undefined,
        };
        this.updateContextDisplay();
      }
    }
  }

  /**
   * Update the context status bar item display.
   */
  private updateContextDisplay(): void {
    if (this.disposed) return;

    switch (this.connectionState) {
      case 'connecting':
        this.contextItem.text = '$(sync~spin) Connecting...';
        this.contextItem.tooltip = 'Waiting for WheelHub connection';
        this.contextItem.backgroundColor = undefined;
        this.contextItem.color = undefined;
        break;

      case 'disconnected':
        this.contextItem.text = '$(debug-disconnect) Disconnected';
        this.contextItem.tooltip = 'WheelHub disconnected - retrying...';
        this.contextItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        this.contextItem.color = undefined;
        break;

      case 'connected':
        if (this.lastContext) {
          const percent = this.lastContext.usablePercent;
          const tokens = this.lastContext.tokens;

          // Format: "CONTEXT: 54k (31%)" or "CONTEXT: 31%"
          let text = 'CONTEXT: ';
          if (tokens !== undefined) {
            const kTokens = Math.round(tokens / 1000);
            text += `${kTokens}k (${Math.round(percent)}%)`;
          } else {
            text += `${Math.round(percent)}%`;
          }
          this.contextItem.text = text;
          this.contextItem.tooltip = `Context usage: ${Math.round(percent)}%`;

          // Apply color based on threshold
          if (percent >= 80) {
            // Red/danger for > 80%
            this.contextItem.backgroundColor = new vscode.ThemeColor(
              'statusBarItem.errorBackground'
            );
            this.contextItem.color = undefined;
          } else if (percent >= 60) {
            // Yellow/warning for 60-80%
            this.contextItem.backgroundColor = new vscode.ThemeColor(
              'statusBarItem.warningBackground'
            );
            this.contextItem.color = undefined;
          } else {
            // Green/safe for < 60% (default, no background)
            this.contextItem.backgroundColor = undefined;
            this.contextItem.color = undefined;
          }
        } else {
          this.contextItem.text = 'CONTEXT: --';
          this.contextItem.tooltip = 'Waiting for context data';
          this.contextItem.backgroundColor = undefined;
          this.contextItem.color = undefined;
        }
        break;
    }
  }

  /**
   * Set the connection state and update display accordingly.
   * @param state The new connection state
   */
  setConnectionState(state: ConnectionState): void {
    if (this.disposed) return;

    this.connectionState = state;

    // Clear retry timer when connected
    if (state === 'connected' && this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }

    // Start retry timer when disconnected
    if (state === 'disconnected' && !this.retryTimer) {
      this.retryTimer = setInterval(() => {
        if (this.disposed) {
          if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = undefined;
          }
          return;
        }

        // Notify retry callbacks
        for (const callback of this.retryCallbacks) {
          try {
            callback();
          } catch {
            // Ignore callback errors
          }
        }

        // Update display to show retry attempt
        this.updateContextDisplay();
      }, 2000);
    }

    this.updateContextDisplay();
  }

  /**
   * Connect to WheelHub WebSocketManager for stats updates.
   * Can be called after initialization to enable real-time updates.
   * @param wsManager WebSocketManager instance
   */
  connectToWheelHub(wsManager: WebSocketManager): void {
    if (this.disposed) return;

    // Unsubscribe from previous connection if any
    if (this.statsUnsubscribe) {
      this.statsUnsubscribe();
    }

    // Subscribe to new WebSocketManager
    this.statsUnsubscribe = wsManager.onStats((data) => this.handleStats(data));
  }

  /**
   * Register a callback for retry events.
   * @param callback Function to call on each retry attempt
   * @returns Unsubscribe function
   */
  onRetry(callback: RetryCallback): () => void {
    this.retryCallbacks.add(callback);
    return () => {
      this.retryCallbacks.delete(callback);
    };
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Clear retry timer
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }

    // Unsubscribe from WebSocketManager
    if (this.statsUnsubscribe) {
      this.statsUnsubscribe();
      this.statsUnsubscribe = undefined;
    }

    // Clear callbacks
    this.retryCallbacks.clear();

    // Dispose status bar items
    this.contextItem.dispose();
  }
}
