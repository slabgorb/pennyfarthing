// BikeRack mode detection (ADR-0024, Rule 1)
// Extracted to break circular import: server → api/index → mode → server

/**
 * Centralized gate — all mode checks go through this function.
 * Returns true when IS_BIKERACK env var is set (by bikerack.ts entry point).
 */
export function isBikeRackMode(): boolean {
  return process.env.IS_BIKERACK === '1';
}
