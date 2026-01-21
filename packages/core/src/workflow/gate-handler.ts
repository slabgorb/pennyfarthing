/**
 * Gate Handler for MSSCI-12085
 *
 * Unifies gate detection from three sources:
 * 1. Workflow YAML: gates.after_steps array
 * 2. Step-meta: gate: true field
 * 3. Content marker: <!-- GATE --> in step content
 *
 * Also handles gate prompt extraction and decision recording.
 */

/**
 * Information about a detected gate
 */
export interface GateInfo {
  /** Whether this step has a gate */
  isGate: boolean;
  /** Source that triggered the gate (null if no gate) */
  source: 'workflow' | 'step-meta' | 'marker' | null;
  /** Gate prompt text to display to user */
  prompt?: string;
  /** Step number for tracking */
  stepNumber: number;
}

/**
 * Parameters for gate detection
 */
export interface DetectGateParams {
  /** Current step number */
  stepNumber: number;
  /** Steps with gates from workflow.gates.after_steps */
  afterSteps?: number[];
  /** Step metadata from <step-meta> block */
  stepMeta?: Record<string, unknown>;
  /** Step content (markdown) */
  stepContent: string;
}

/**
 * A recorded gate decision
 */
export interface GateDecision {
  /** Step number where decision was made */
  step: number;
  /** User's choice */
  choice: 'continue' | 'revise';
  /** ISO timestamp of decision */
  timestamp: string;
  /** Optional notes from user */
  notes?: string;
}

// Regex to detect gate marker (exact match with spaces, allows surrounding whitespace on the line)
const GATE_MARKER_REGEX = /^\s*<!-- GATE -->\s*$/m;

// Default prompt when no custom prompt is provided
const DEFAULT_GATE_PROMPT = 'Review the output above. Continue to next step or revise?';

/**
 * Detect if a step has a gate from any of the three sources
 *
 * Priority (for source reporting): workflow > step-meta > marker
 * Logic: OR - any source triggers a gate
 *
 * @param params - Detection parameters
 * @returns GateInfo with detection result
 */
export function detectGate(params: DetectGateParams): GateInfo {
  const { stepNumber, afterSteps, stepMeta, stepContent } = params;

  let isGate = false;
  let source: GateInfo['source'] = null;

  // Check workflow gates.after_steps (highest priority)
  if (afterSteps && afterSteps.includes(stepNumber)) {
    isGate = true;
    source = 'workflow';
  }
  // Check step-meta gate: true (second priority)
  else if (stepMeta && stepMeta.gate === true) {
    isGate = true;
    source = 'step-meta';
  }
  // Check content marker (lowest priority)
  else if (GATE_MARKER_REGEX.test(stepContent)) {
    isGate = true;
    source = 'marker';
  }

  // Extract prompt if gate detected
  let prompt: string | undefined;
  if (isGate) {
    prompt = extractGatePrompt(stepContent, stepMeta);
  }

  return {
    isGate,
    source,
    prompt,
    stepNumber,
  };
}

// Regex to extract ## Gate Prompt section content
// Captures until next ## heading or end of string
const GATE_PROMPT_SECTION_REGEX = /## Gate Prompt\n([\s\S]*?)(?=\n## |\n*$)/;

/**
 * Extract gate prompt from step content or metadata
 *
 * Priority: ## Gate Prompt section > step-meta gate_prompt > default
 *
 * @param content - Step markdown content
 * @param meta - Optional step metadata
 * @returns Gate prompt text
 */
export function extractGatePrompt(
  content: string,
  meta?: Record<string, unknown>
): string {
  // Priority 1: Check for ## Gate Prompt section in content
  const sectionMatch = content.match(GATE_PROMPT_SECTION_REGEX);
  if (sectionMatch) {
    const sectionContent = sectionMatch[1].trim();
    if (sectionContent) {
      return sectionContent;
    }
  }

  // Priority 2: Check for gate_prompt in step-meta
  if (meta && typeof meta.gate_prompt === 'string' && meta.gate_prompt) {
    return meta.gate_prompt;
  }

  // Priority 3: Return default prompt
  return DEFAULT_GATE_PROMPT;
}

/**
 * Record a gate decision to session file content
 *
 * Adds or updates the ## Gate Decisions section with a markdown table
 *
 * @param sessionContent - Current session file content
 * @param decision - Gate decision to record
 * @returns Updated session content
 */
export function recordGateDecision(
  sessionContent: string,
  decision: GateDecision
): string {
  // Normalize line endings
  const normalized = sessionContent.replace(/\r\n/g, '\n');

  // Parse existing decisions
  const existingDecisions = parseGateDecisions(normalized);

  // Add the new decision
  const allDecisions = [...existingDecisions, decision];

  // Format the new section
  const newSection = formatGateDecisions(allDecisions);

  // Check if section already exists
  const sectionMatch = normalized.match(GATE_DECISIONS_SECTION_REGEX);

  if (sectionMatch) {
    // Replace existing section
    return normalized.replace(GATE_DECISIONS_SECTION_REGEX, newSection + '\n');
  }

  // Insert new section - find a good location
  // Preferred: before ## Workflow State or after ## Acceptance Criteria
  const workflowStateMatch = normalized.match(/\n## Workflow State/);
  if (workflowStateMatch && workflowStateMatch.index !== undefined) {
    return (
      normalized.slice(0, workflowStateMatch.index) +
      '\n\n' +
      newSection +
      normalized.slice(workflowStateMatch.index)
    );
  }

  // Fallback: insert before last ## section or at end
  const lastSectionMatch = normalized.match(/\n(## [^\n]+)(?![\s\S]*\n## )/);
  if (lastSectionMatch && lastSectionMatch.index !== undefined) {
    return (
      normalized.slice(0, lastSectionMatch.index) +
      '\n\n' +
      newSection +
      normalized.slice(lastSectionMatch.index)
    );
  }

  // Last resort: append at end
  return normalized + '\n\n' + newSection + '\n';
}

// Regex to find ## Gate Decisions section
const GATE_DECISIONS_SECTION_REGEX = /## Gate Decisions\n([\s\S]*?)(?=\n## |\n*$)/;

// Regex to parse a table row: | step | choice | time | notes |
const TABLE_ROW_REGEX = /^\|\s*(\d+)\s*\|\s*(continue|revise)\s*\|\s*([^\|]+)\s*\|\s*([^\|]*)\s*\|$/;

/**
 * Parse existing gate decisions from session file
 *
 * @param sessionContent - Session file content
 * @returns Array of gate decisions
 */
export function parseGateDecisions(sessionContent: string): GateDecision[] {
  // Normalize line endings to LF
  const normalized = sessionContent.replace(/\r\n/g, '\n');

  const sectionMatch = normalized.match(GATE_DECISIONS_SECTION_REGEX);
  if (!sectionMatch) {
    return [];
  }

  const sectionContent = sectionMatch[1];
  const lines = sectionContent.split('\n');
  const decisions: GateDecision[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip header row and separator row
    if (trimmed.startsWith('| Step') || trimmed.startsWith('|---')) {
      continue;
    }

    const match = trimmed.match(TABLE_ROW_REGEX);
    if (match) {
      const step = parseInt(match[1], 10);
      const choice = match[2] as 'continue' | 'revise';
      const timestamp = match[3].trim();
      const notesRaw = match[4].trim();
      // Convert '-' back to undefined, unescape pipes
      const notes = notesRaw === '-' || notesRaw === ''
        ? undefined
        : notesRaw.replace(/\\\|/g, '|');

      decisions.push({ step, choice, timestamp, notes });
    }
  }

  return decisions;
}

/**
 * Format gate decisions as markdown table
 *
 * @param decisions - Array of gate decisions
 * @returns Markdown table string
 */
export function formatGateDecisions(decisions: GateDecision[]): string {
  const lines = [
    '## Gate Decisions',
    '| Step | Choice | Time | Notes |',
    '|------|--------|------|-------|',
  ];

  for (const decision of decisions) {
    // Escape pipe characters in notes to prevent table corruption
    const notes = decision.notes
      ? decision.notes.replace(/\|/g, '\\|')
      : '-';
    lines.push(`| ${decision.step} | ${decision.choice} | ${decision.timestamp} | ${notes} |`);
  }

  return lines.join('\n');
}
