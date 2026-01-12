/**
 * OTEL Connection Status Module (Story 20-1)
 *
 * Provides connection status types and messaging for the UI status indicator.
 * Used to show whether OTEL telemetry is configured and receiving data.
 */
/**
 * Connection status enum for OTEL telemetry.
 */
export const OtelConnectionStatus = {
    CONNECTED: 'connected',
    WAITING: 'waiting',
    DISCONNECTED: 'disconnected',
};
/**
 * Determine the OTEL connection status based on configuration and data reception.
 */
export function getOtelConnectionStatus(input) {
    if (!input.hasOtelConfig) {
        return OtelConnectionStatus.DISCONNECTED;
    }
    if (!input.hasReceivedData) {
        return OtelConnectionStatus.WAITING;
    }
    return OtelConnectionStatus.CONNECTED;
}
/**
 * Get a user-friendly message for the given connection status.
 */
export function getStatusMessage(status) {
    switch (status) {
        case OtelConnectionStatus.CONNECTED:
            return 'OTEL connected - receiving telemetry data';
        case OtelConnectionStatus.WAITING:
            return 'Waiting for telemetry data...';
        case OtelConnectionStatus.DISCONNECTED:
            return 'OTEL not configured. Run setup to enable telemetry.';
        default:
            return 'Unknown status';
    }
}
//# sourceMappingURL=otel-status.js.map