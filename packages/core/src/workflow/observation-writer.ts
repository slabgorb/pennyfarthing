/**
 * Observation File Writer for Story 95-3
 *
 * Creates and appends to observation files used by tandem backseat agents.
 * Files are append-only markdown at `.session/{storyId}-tandem-{agent}.md`.
 * Each write is entry-atomic — the file remains valid markdown on crash.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for initializing an observation file
 */
export interface ObservationWriterConfig {
  /** Current story ID */
  storyId: string;
  /** Observer agent name */
  agent: string;
  /** Observer persona name */
  persona: string;
  /** Current workflow phase */
  phase: string;
  /** Path to .session/ directory */
  sessionDir: string;
}

/**
 * A single observation entry to append
 */
export interface ObservationEntry {
  /** Trigger type: file-watch, tool-watch, context-watch */
  triggerType: string;
  /** Trigger detail, e.g. "src/foo.ts modified" */
  triggerDetail: string;
  /** The observation text */
  observation: string;
}

/**
 * Standard result object per framework pattern
 */
export interface ObservationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// Implementations (stubs — to be implemented by Dev)
// =============================================================================

/**
 * Initialize an observation file with header metadata.
 *
 * Creates the file at `.session/{storyId}-tandem-{agent}.md` with
 * a header containing observer agent, persona, phase, and start timestamp.
 */
export function initObservationFile(
  _config: ObservationWriterConfig
): ObservationResult<{ path: string }> {
  return { success: false, error: 'not implemented' };
}

/**
 * Append an observation entry to an existing observation file.
 *
 * Each append is entry-atomic: the complete entry (separator, timestamp,
 * trigger, observation text) is written in a single operation.
 */
export function appendObservation(
  _filePath: string,
  _entry: ObservationEntry
): ObservationResult {
  return { success: false, error: 'not implemented' };
}

/**
 * Parse an observation file and return its entries.
 *
 * Used by bell mode to read recent observations for injection.
 */
export function parseObservationFile(
  _filePath: string
): ObservationResult<{ header: ObservationFileHeader; entries: ParsedObservationEntry[] }> {
  return { success: false, error: 'not implemented' };
}

// =============================================================================
// Parsed types (for parseObservationFile)
// =============================================================================

export interface ObservationFileHeader {
  storyId: string;
  observer: string;
  phase: string;
  started: string;
}

export interface ParsedObservationEntry {
  timestamp: string;
  triggerType: string;
  triggerDetail: string;
  observation: string;
}
