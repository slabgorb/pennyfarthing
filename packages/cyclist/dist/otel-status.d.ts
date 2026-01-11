/**
 * OTEL Connection Status Module (Story 20-1)
 *
 * Provides connection status types and messaging for the UI status indicator.
 * Used to show whether OTEL telemetry is configured and receiving data.
 */
/**
 * Connection status enum for OTEL telemetry.
 */
export declare const OtelConnectionStatus: {
    readonly CONNECTED: "connected";
    readonly WAITING: "waiting";
    readonly DISCONNECTED: "disconnected";
};
export type OtelConnectionStatusType = (typeof OtelConnectionStatus)[keyof typeof OtelConnectionStatus];
/**
 * Input for determining connection status.
 */
export interface OtelStatusInput {
    /** Whether OTEL environment variables are configured */
    hasOtelConfig: boolean;
    /** Whether any telemetry data has been received */
    hasReceivedData: boolean;
}
/**
 * Determine the OTEL connection status based on configuration and data reception.
 */
export declare function getOtelConnectionStatus(input: OtelStatusInput): OtelConnectionStatusType;
/**
 * Get a user-friendly message for the given connection status.
 */
export declare function getStatusMessage(status: OtelConnectionStatusType): string;
//# sourceMappingURL=otel-status.d.ts.map