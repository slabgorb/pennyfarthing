/**
 * Dialogue File Management for Story 86-3
 *
 * Persistence layer for tandem agent consultation exchanges.
 * Creates, appends, and archives dialogue files following the format
 * defined in ADR-0012 (lines 156-195).
 *
 * All functions are pure or use simple file I/O — no external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Types
// =============================================================================

export type Outcome = 'applied' | 'deferred' | 'rejected';

export interface DialogueHeader {
  storyId: string;
  workflow: string;
  leader: string;
  leaderCharacter?: string;
  partner: string;
  partnerCharacter?: string;
  startedAt: string;
}

export interface DialogueExchange {
  number: number;
  timestamp: string; // HH:MM
  leader: string;
  partner: string;
  question: string;
  recommendation: string;
  confidence: string;
  outcome?: Outcome;
  outcomeNote?: string;
}

export interface DialogueResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface ArchiveParams {
  dialoguePath: string;
  archiveDir: string;
  jiraKey?: string;
  storyId?: string;
}

// =============================================================================
// Constants
// =============================================================================

const SUMMARY_MARKER = '## Summary';
const EXCHANGE_RE = /^## Exchange (\d+)/;
const OUTCOME_RE = /^\*\*Outcome:\*\*\s+(.+)/;
const DIRECTION_RE = /^\*\*\[(\d{2}:\d{2})\]\s+(\S+)\s+→\s+(\S+)\*\*/;
const PARTNER_RESP_RE = /^\*\*\[(\d{2}:\d{2})\]\s+(\S+):\*\*/;
const CONFIDENCE_RE = /^\*\*Confidence:\*\*\s+(\S+)/;

// =============================================================================
// Pure Functions
// =============================================================================

/**
 * Create initial dialogue file content with header and empty summary.
 */
export function createDialogueContent(header: DialogueHeader): string {
  const leaderLabel = header.leaderCharacter
    ? `${header.leader} (${header.leaderCharacter})`
    : header.leader;
  const partnerLabel = header.partnerCharacter
    ? `${header.partner} (${header.partnerCharacter})`
    : header.partner;

  return `# Tandem Dialogue: ${header.storyId}

**Workflow:** ${header.workflow}
**Leader:** ${leaderLabel} | **Partner:** ${partnerLabel}
**Started:** ${header.startedAt}

---

${SUMMARY_MARKER}
- **Total exchanges:** 0
- **Key decisions:** None
- **Time in tandem:** 0m
`;
}

/**
 * Format a single exchange as markdown block.
 */
export function formatExchange(exchange: DialogueExchange): string {
  const outcomeText = exchange.outcome
    ? `**Outcome:** ${exchange.outcome}${exchange.outcomeNote ? ` - ${exchange.outcomeNote}` : ''}`
    : '**Outcome:** _pending_';

  return `## Exchange ${exchange.number}
**[${exchange.timestamp}] ${exchange.leader} → ${exchange.partner}**

> ${exchange.question}

**[${exchange.timestamp}] ${exchange.partner}:**

${exchange.recommendation}

**Confidence:** ${exchange.confidence}

${outcomeText}

---
`;
}

/**
 * Parse exchanges from dialogue file content.
 */
export function parseDialogueExchanges(content: string): DialogueExchange[] {
  const exchanges: DialogueExchange[] = [];
  const lines = content.split('\n');

  let current: Partial<DialogueExchange> | null = null;
  let inQuestion = false;
  let inRecommendation = false;
  let questionLines: string[] = [];
  let recLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New exchange starts
    const exchangeMatch = line.match(EXCHANGE_RE);
    if (exchangeMatch) {
      if (current && current.number !== undefined) {
        current.question = questionLines.join('\n');
        current.recommendation = recLines.join('\n');
        exchanges.push(current as DialogueExchange);
      }
      current = { number: parseInt(exchangeMatch[1], 10) };
      questionLines = [];
      recLines = [];
      inQuestion = false;
      inRecommendation = false;
      continue;
    }

    if (!current) continue;

    // Leader → Partner direction line
    const dirMatch = line.match(DIRECTION_RE);
    if (dirMatch) {
      current.timestamp = dirMatch[1];
      current.leader = dirMatch[2];
      current.partner = dirMatch[3];
      inQuestion = true;
      inRecommendation = false;
      continue;
    }

    // Partner response line
    const partnerMatch = line.match(PARTNER_RESP_RE);
    if (partnerMatch) {
      inQuestion = false;
      inRecommendation = true;
      continue;
    }

    // Confidence line
    const confMatch = line.match(CONFIDENCE_RE);
    if (confMatch) {
      current.confidence = confMatch[1];
      inRecommendation = false;
      continue;
    }

    // Outcome line
    const outcomeMatch = line.match(OUTCOME_RE);
    if (outcomeMatch) {
      const outcomeRaw = outcomeMatch[1].trim();
      if (outcomeRaw === '_pending_') {
        // No outcome yet
      } else {
        const dashIdx = outcomeRaw.indexOf(' - ');
        if (dashIdx >= 0) {
          current.outcome = outcomeRaw.substring(0, dashIdx).trim() as Outcome;
          current.outcomeNote = outcomeRaw.substring(dashIdx + 3).trim();
        } else {
          current.outcome = outcomeRaw as Outcome;
        }
      }
      inRecommendation = false;
      continue;
    }

    // Collect question text (blockquote lines)
    if (inQuestion) {
      const stripped = line.startsWith('> ') ? line.substring(2) : line;
      if (stripped.trim()) {
        questionLines.push(stripped);
      }
      continue;
    }

    // Collect recommendation text
    if (inRecommendation) {
      if (line.trim()) {
        recLines.push(line);
      }
      continue;
    }
  }

  // Push last exchange
  if (current && current.number !== undefined) {
    current.question = questionLines.join('\n');
    current.recommendation = recLines.join('\n');
    exchanges.push(current as DialogueExchange);
  }

  return exchanges;
}

/**
 * Generate summary markdown section from exchanges.
 */
export function generateSummary(exchanges: DialogueExchange[], _startedAt: string): string {
  const total = exchanges.length;

  // Key decisions from applied outcomes
  const applied = exchanges.filter(e => e.outcome === 'applied' && e.outcomeNote);
  const decisionsText = applied.length > 0
    ? applied.map(e => `  - ${e.outcomeNote}`).join('\n')
    : 'None';

  // Time in tandem: span between first and last exchange timestamps
  let duration = '0m';
  if (exchanges.length > 0) {
    const first = parseTime(exchanges[0].timestamp);
    const last = parseTime(exchanges[exchanges.length - 1].timestamp);
    if (first !== null && last !== null) {
      const mins = last - first;
      duration = mins > 0 ? `${mins}m` : '0m';
    }
  }

  return `${SUMMARY_MARKER}
- **Total exchanges:** ${total}
- **Key decisions:**
${decisionsText}
- **Time in tandem:** ${duration}
`;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Append an exchange to a dialogue file. Creates the file if missing.
 */
export async function appendExchangeToFile(
  dialoguePath: string,
  exchange: DialogueExchange,
  header?: DialogueHeader,
): Promise<DialogueResult> {
  try {
    if (!fs.existsSync(dialoguePath)) {
      if (!header) {
        return { success: false, error: 'Header required for new dialogue file' };
      }
      const initial = createDialogueContent(header);
      fs.mkdirSync(path.dirname(dialoguePath), { recursive: true });
      fs.writeFileSync(dialoguePath, initial, 'utf-8');
    }

    const content = fs.readFileSync(dialoguePath, 'utf-8');
    const formatted = formatExchange(exchange);

    // Insert exchange before summary section
    const summaryIdx = content.indexOf(SUMMARY_MARKER);
    if (summaryIdx < 0) {
      // No summary marker — append at end
      fs.writeFileSync(dialoguePath, content + '\n' + formatted, 'utf-8');
    } else {
      const before = content.substring(0, summaryIdx);
      const after = content.substring(summaryIdx);
      fs.writeFileSync(dialoguePath, before + formatted + '\n' + after, 'utf-8');
    }

    return { success: true, data: { exchangeNumber: exchange.number } };
  } catch (err) {
    return { success: false, error: `Failed to append exchange: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Update the outcome of a specific exchange in the dialogue file.
 */
export async function updateOutcomeInFile(
  dialoguePath: string,
  exchangeNum: number,
  outcome: Outcome,
  note?: string,
): Promise<DialogueResult> {
  try {
    if (!fs.existsSync(dialoguePath)) {
      return { success: false, error: `Dialogue file not found: ${dialoguePath}` };
    }

    const content = fs.readFileSync(dialoguePath, 'utf-8');
    const lines = content.split('\n');

    // Find the exchange section
    let inTargetExchange = false;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const exchangeMatch = lines[i].match(EXCHANGE_RE);
      if (exchangeMatch) {
        inTargetExchange = parseInt(exchangeMatch[1], 10) === exchangeNum;
      }

      if (inTargetExchange && OUTCOME_RE.test(lines[i])) {
        const outcomeText = note
          ? `**Outcome:** ${outcome} - ${note}`
          : `**Outcome:** ${outcome}`;
        lines[i] = outcomeText;
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: `Exchange ${exchangeNum} not found in dialogue file` };
    }

    fs.writeFileSync(dialoguePath, lines.join('\n'), 'utf-8');
    return { success: true, data: { exchangeNum, outcome } };
  } catch (err) {
    return { success: false, error: `Failed to update outcome: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Regenerate the summary section in an existing dialogue file.
 */
export async function refreshSummary(dialoguePath: string): Promise<DialogueResult> {
  try {
    if (!fs.existsSync(dialoguePath)) {
      return { success: false, error: `Dialogue file not found: ${dialoguePath}` };
    }

    const content = fs.readFileSync(dialoguePath, 'utf-8');
    const exchanges = parseDialogueExchanges(content);

    // Extract startedAt from header
    const startedMatch = content.match(/\*\*Started:\*\*\s+(.+)/);
    const startedAt = startedMatch ? startedMatch[1].trim() : new Date().toISOString();

    const newSummary = generateSummary(exchanges, startedAt);

    // Replace existing summary section
    const summaryIdx = content.indexOf(SUMMARY_MARKER);
    if (summaryIdx < 0) {
      // Append summary at end
      fs.writeFileSync(dialoguePath, content + '\n' + newSummary, 'utf-8');
    } else {
      const before = content.substring(0, summaryIdx);
      fs.writeFileSync(dialoguePath, before + newSummary, 'utf-8');
    }

    return { success: true, data: { totalExchanges: exchanges.length } };
  } catch (err) {
    return { success: false, error: `Failed to refresh summary: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Copy dialogue file to archive directory.
 */
export async function archiveDialogue(params: ArchiveParams): Promise<DialogueResult> {
  const { dialoguePath, archiveDir, jiraKey, storyId } = params;

  try {
    if (!fs.existsSync(dialoguePath)) {
      return { success: false, error: `Dialogue file not found: ${dialoguePath}` };
    }

    fs.mkdirSync(archiveDir, { recursive: true });

    const prefix = jiraKey || storyId || 'unknown';
    const archiveName = `${prefix}-dialogue.md`;
    const archivePath = path.join(archiveDir, archiveName);

    fs.copyFileSync(dialoguePath, archivePath);

    return { success: true, data: { archivePath } };
  } catch (err) {
    return { success: false, error: `Failed to archive dialogue: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse HH:MM timestamp to minutes since midnight.
 */
function parseTime(timestamp: string): number | null {
  const parts = timestamp.split(':');
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}
