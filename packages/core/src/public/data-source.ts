/**
 * DataSource<T> — Abstract data provider interface.
 *
 * Story 124-3: Decouples panel hooks from transport (WebSocket, REST, mock).
 * Implementations live in their respective packages:
 * - WebSocketDataSource: packages/bikerack/
 * - MockDataSource: here (for testing)
 */

// =============================================================================
// Configuration
// =============================================================================

/** Options for parameterized queries and multi-session composition */
export interface DataSourceOptions {
  /** Query parameters passed to the data source */
  params?: Record<string, string>;
  /** Session identifier for multi-session support */
  sessionId?: string;
  /** Custom endpoint path override */
  endpoint?: string;
}

// =============================================================================
// DataSource<T> Interface
// =============================================================================

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

// =============================================================================
// MockDataSource<T> — Test implementation
// =============================================================================

/**
 * In-memory DataSource for testing. Allows pushing data to subscribers
 * without any network transport.
 */
export class MockDataSource<T> implements DataSource<T> {
  private subscribers: Set<(data: T) => void> = new Set();
  private errorSubscribers: Set<(error: Error) => void> = new Set();
  private connected = false;
  private sentMessages: unknown[] = [];

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.subscribers.clear();
    this.errorSubscribers.clear();
  }

  subscribe(callback: (data: T) => void): Unsubscribe {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  onError(callback: (error: Error) => void): Unsubscribe {
    this.errorSubscribers.add(callback);
    return () => this.errorSubscribers.delete(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(message: unknown): void {
    this.sentMessages.push(message);
  }

  /** Emit data to all subscribers (test helper) */
  emit(data: T): void {
    for (const cb of this.subscribers) {
      cb(data);
    }
  }

  /** Emit an error to all error subscribers (test helper) */
  emitError(error: Error): void {
    for (const cb of this.errorSubscribers) {
      cb(error);
    }
  }

  /** Get all messages sent via send() (test helper) */
  getSentMessages(): unknown[] {
    return [...this.sentMessages];
  }
}
