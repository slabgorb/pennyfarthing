/**
 * Observation File Writer for Story 95-3
 *
 * Creates and appends to observation files used by tandem backseat agents.
 * Files are append-only markdown at `.session/{storyId}-tandem-{agent}.md`.
 * Each write is entry-atomic — the file remains valid markdown on crash.
 */

import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

// =============================================================================
// Implementations
// =============================================================================

/**
 * Initialize an observation file with header metadata.
 *
 * Creates the file at `.session/{storyId}-tandem-{agent}.md` with
 * a header containing observer agent, persona, phase, and start timestamp.
 */
export function initObservationFile(
  config: ObservationWriterConfig
): ObservationResult<{ path: string }> {
  try {
    const { storyId, agent, persona, phase, sessionDir } = config;
    const filePath = join(sessionDir, `${storyId}-tandem-${agent}.md`);

    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    const now = new Date().toISOString();
    const header = `# Tandem Observations: ${storyId}\n**Observer:** ${agent} (${persona})\n**Phase:** ${phase}\n**Started:** ${now}\n\n---\n`;

    writeFileSync(filePath, header, 'utf-8');

    return { success: true, data: { path: filePath } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Append an observation entry to an existing observation file.
 *
 * Each append is entry-atomic: the complete entry (separator, timestamp,
 * trigger, observation text) is written in a single operation.
 */
export function appendObservation(
  filePath: string,
  entry: ObservationEntry
): ObservationResult {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const block = `\n## [${hh}:${mm}] Observation\n**Trigger:** ${entry.triggerType}: ${entry.triggerDetail}\n${entry.observation}\n\n---\n`;

    appendFileSync(filePath, block, 'utf-8');

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Parse an observation file and return its entries.
 *
 * Used by bell mode to read recent observations for injection.
 */
export function parseObservationFile(
  filePath: string
): ObservationResult<{ header: ObservationFileHeader; entries: ParsedObservationEntry[] }> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');

    // Parse header
    const storyMatch = content.match(/^# Tandem Observations: (.+)$/m);
    const observerMatch = content.match(/^\*\*Observer:\*\* (.+)$/m);
    const phaseMatch = content.match(/^\*\*Phase:\*\* (.+)$/m);
    const startedMatch = content.match(/^\*\*Started:\*\* (.+)$/m);

    const header: ObservationFileHeader = {
      storyId: storyMatch?.[1] ?? '',
      observer: observerMatch?.[1] ?? '',
      phase: phaseMatch?.[1] ?? '',
      started: startedMatch?.[1] ?? '',
    };

    // Parse entries — split on ## [HH:MM] Observation headings
    const entries: ParsedObservationEntry[] = [];
    const entryPattern = /## \[(\d{2}:\d{2})\] Observation\n\*\*Trigger:\*\* ([^:]+): ([^\n]+)\n([\s\S]*?)(?=\n---)/g;
    let match;
    while ((match = entryPattern.exec(content)) !== null) {
      entries.push({
        timestamp: match[1],
        triggerType: match[2],
        triggerDetail: match[3],
        observation: match[4].trim(),
      });
    }

    return { success: true, data: { header, entries } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
