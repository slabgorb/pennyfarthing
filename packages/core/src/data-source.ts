/**
 * DataSource<T> — Abstract data provider interface.
 *
 * Story 124-3: Decouples panel hooks from transport (WebSocket, REST, mock).
 * Story 124-6: Exported from core index for cross-package use.
 *
 * Implementations:
 * - WebSocketDataSource: @pennyfarthing/bikerack
 * - MockDataSource: packages/core/src/public/data-source.ts (vite-only)
 */

/** Options for parameterized queries and multi-session composition */
export interface DataSourceOptions {
  /** Query parameters passed to the data source */
  params?: Record<string, string>;
  /** Session identifier for multi-session support */
  sessionId?: string;
  /** Custom endpoint path override */
  endpoint?: string;
}

/** Callback for unsubscribing from data updates */
export type Unsubscribe = () => void;

/**
 * Abstract data provider interface.
 *
 * Implementations handle transport details (WebSocket, HTTP, in-memory).
 * Consumers subscribe to typed data updates without knowing the transport.
 */
export interface DataSource<T> {
  /** Connect to the data source and begin receiving updates */
  connect(options?: DataSourceOptions): void;

  /** Disconnect and clean up resources */
  disconnect(): void;

  /** Subscribe to data updates. Returns an unsubscribe function. */
  subscribe(callback: (data: T) => void): Unsubscribe;

  /** Register an error handler */
  onError(callback: (error: Error) => void): Unsubscribe;

  /** Whether the data source is currently connected */
  isConnected(): boolean;

  /** Send a message back to the data source (for bidirectional sources) */
  send?(message: unknown): void;
}
