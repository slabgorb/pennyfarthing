/**
 * Step File Parser for MSSCI-12079
 *
 * Parses step files in stepped workflows, extracting metadata from
 * <step-meta> YAML blocks and detecting gate markers.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parse } from 'yaml';

/**
 * Parsed step data extracted from a step file
 */
export interface ParsedStep {
  /** Step number (from meta or filename) */
  number: number;
  /** Step name/slug (from meta or filename) */
  name: string;
  /** Whether this step has a gate checkpoint */
  gate: boolean;
  /** Full markdown content (excluding step-meta block) */
  content: string;
  /** Raw step-meta YAML if present */
  meta?: Record<string, unknown>;
}

/**
 * Result of parsing a step file
 */
export interface StepParseResult {
  success: boolean;
  step?: ParsedStep;
  error?: string;
}

// Regex to match <step-meta>...</step-meta> block (handles CRLF)
const STEP_META_REGEX = /<step-meta>\s*([\s\S]*?)\s*<\/step-meta>/;

// Regex to match filename pattern: step-{n}-{name}.md or step-{nn}-{name}.md
const FILENAME_REGEX = /^step-(\d+)-(.+)\.md$/;

// Regex to detect gate marker (exact match with spaces, allows surrounding whitespace)
const GATE_MARKER_REGEX = /^\s*<!-- GATE -->\s*$/m;

/**
 * Extract step-meta block from content
 * Returns the parsed YAML object and the content with meta block removed
 */
function extractStepMeta(content: string): {
  meta: Record<string, unknown> | null;
  contentWithoutMeta: string;
  parseError: boolean;
} {
  const match = content.match(STEP_META_REGEX);

  if (!match) {
    return { meta: null, contentWithoutMeta: content, parseError: false };
  }

  const yamlContent = match[1];
  const contentWithoutMeta = content.replace(STEP_META_REGEX, '').replace(/^\n+|\n+$/g, '');

  try {
    const parsed = parse(yamlContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        meta: parsed as Record<string, unknown>,
        contentWithoutMeta,
        parseError: false,
      };
    }
    // YAML parsed but not an object - treat as parse error
    return { meta: null, contentWithoutMeta, parseError: true };
  } catch {
    // YAML parse error - fall back to filename
    return { meta: null, contentWithoutMeta, parseError: true };
  }
}

/**
 * Extract number and name from filename pattern
 */
function parseFilename(filename: string): { number: number; name: string } | null {
  const match = filename.match(FILENAME_REGEX);
  if (!match) {
    return null;
  }
  return {
    number: parseInt(match[1], 10),
    name: match[2],
  };
}

/**
 * Detect if content has a gate marker
 */
function hasGateMarker(content: string): boolean {
  return GATE_MARKER_REGEX.test(content);
}

/**
 * Parse a step file from its content
 *
 * @param content - The raw markdown content of the step file
 * @param filename - Optional filename for fallback extraction (e.g., "step-03-design.md")
 * @returns StepParseResult with parsed step or error
 */
export function parseStepFile(content: string, filename?: string): StepParseResult {
  const { meta, contentWithoutMeta, parseError } = extractStepMeta(content);

  // Try to get number and name from meta
  let number: number | undefined;
  let name: string | undefined;
  let gateFromMeta: boolean | undefined;

  if (meta && !parseError) {
    if (typeof meta.number === 'number') {
      number = meta.number;
    }
    if (typeof meta.name === 'string') {
      name = meta.name;
    }
    if (typeof meta.gate === 'boolean') {
      gateFromMeta = meta.gate;
    }
  }

  // Fall back to filename if needed
  if ((number === undefined || name === undefined) && filename) {
    const filenameData = parseFilename(filename);
    if (filenameData) {
      if (number === undefined) {
        number = filenameData.number;
      }
      if (name === undefined) {
        name = filenameData.name;
      }
    }
  }

  // If we still don't have number or name, fail
  if (number === undefined || name === undefined) {
    return {
      success: false,
      error: 'Could not determine step number and name from meta block or filename',
    };
  }

  // Determine gate status
  // Priority: meta gate field > marker detection
  let gate: boolean;
  if (gateFromMeta !== undefined) {
    gate = gateFromMeta;
  } else {
    // Check for marker in original content (not stripped content)
    // But we need to check the content after meta is stripped for the marker
    gate = hasGateMarker(contentWithoutMeta) || hasGateMarker(content);
  }

  return {
    success: true,
    step: {
      number,
      name,
      gate,
      content: contentWithoutMeta,
      meta: meta && !parseError ? meta : undefined,
    },
  };
}

/**
 * Parse a step file from a file path
 *
 * @param filePath - Absolute or relative path to the step file
 * @returns Promise<StepParseResult> with parsed step or error
 */
export async function parseStepFromPath(filePath: string): Promise<StepParseResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const filename = basename(filePath);
    return parseStepFile(content, filename);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
