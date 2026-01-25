#!/usr/bin/env node
/**
 * reflector-check.mjs - CYCLIST reflector marker enforcement hook
 *
 * Story: MSSCI-12393 (questions), extended for all markers
 *
 * EVERY turn end MUST have a CYCLIST reflector marker. This ensures:
 * - Cyclist UI can render appropriate buttons/actions
 * - User always has opportunity to intervene
 * - Workflow handoffs are never silently dropped
 *
 * Valid markers (any one required):
 *   <!-- CYCLIST:HANDOFF:/agent -->        - Workflow handoff to next agent
 *   <!-- CYCLIST:CONTEXT_CLEAR:/agent -->  - Handoff with context clear (TirePump)
 *   <!-- CYCLIST:QUESTION:yesno -->        - Yes/no question
 *   <!-- CYCLIST:QUESTION:open -->         - Open-ended question
 *   <!-- CYCLIST:CHOICES:opt1,opt2,opt3 --> - Multiple choice
 *   <!-- CYCLIST:CONTINUE -->              - Status update, user can continue or redirect
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';

// =============================================================================
// Constants
// =============================================================================

// Marker patterns - ALL valid CYCLIST markers
const QUESTION_MARKER_PATTERN = /<!--\s*CYCLIST:QUESTION:(yesno|open)\s*-->/i;
const CHOICES_MARKER_PATTERN = /<!--\s*CYCLIST:CHOICES:[^>]+\s*-->/i;
const HANDOFF_MARKER_PATTERN = /<!--\s*CYCLIST:HANDOFF:\/\w+\s*-->/i;
const CONTEXT_CLEAR_MARKER_PATTERN = /<!--\s*CYCLIST:CONTEXT_CLEAR:\/\w+\s*-->/i;
const CONTINUE_MARKER_PATTERN = /<!--\s*CYCLIST:CONTINUE\s*-->/i;

// Question patterns - direct (with ?)
// Match: end of line, followed by space+capital (new sentence), or followed by newline
const DIRECT_QUESTION_PATTERN = /\?(\s*$|\s+[A-Z]|\s*\n)/;

// Rhetorical patterns to exclude
const RHETORICAL_PATTERNS = /\b(the question (was|is)|asked whether|wondering if)\b/i;

// Implicit question patterns
const IMPLICIT_PATTERNS = [
  /\bwould you like\b/i,
  /\bshould I\b/i,
  /\bdo you want\b/i,
  /\blet me know if\b/i,
  /\bwhat do you (think|prefer)\b/i,
  /\byour (preference|thoughts)\b/i,
  /\bcould you (clarify|confirm|specify)\b/i,
  /\bwhich (option|approach)\b/i,
  /\bready to proceed\b/i,
];

// Choice offering patterns
const CHOICE_PATTERNS = [
  /\boption [A-D]\b/i,
  /\bchoice [0-9]\b/i,
  /\bwe could (either|do)\b/i,
  /\balternatively\b/i,
  /\bor would you prefer\b/i,
  /\bpick one\b/i,
  /\bchoose between\b/i,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Strip fenced code blocks from text to avoid false positives
 * @param {string} text - The text to process
 * @returns {string} Text with code blocks removed
 */
function stripCodeBlocks(text) {
  // Remove fenced code blocks (```...```)
  let result = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code (`...`)
  result = result.replace(/`[^`]+`/g, '');
  return result;
}

// =============================================================================
// Exported Functions
// =============================================================================

/**
 * Check if enforcement should be skipped based on config
 * @param {object} config - The config object with workflow settings
 * @returns {boolean} True if enforcement should be skipped
 */
export function shouldSkipEnforcement(config) {
  // Never skip enforcement - markers must always be emitted.
  // relay_mode only controls whether Cyclist auto-executes markers
  // vs showing buttons to the user.
  return false;
}

/**
 * Detect if a message contains a question
 * @param {string} message - The message to check
 * @returns {{ detected: boolean, type: string }} Detection result
 */
export function detectQuestion(message) {
  // Strip code blocks first
  const cleanMessage = stripCodeBlocks(message);

  // Check for rhetorical patterns - if found, not a real question
  if (RHETORICAL_PATTERNS.test(cleanMessage)) {
    return { detected: false, type: '' };
  }

  // Check for direct questions (with ?)
  if (DIRECT_QUESTION_PATTERN.test(cleanMessage)) {
    return { detected: true, type: 'direct' };
  }

  // Check for implicit questions
  for (const pattern of IMPLICIT_PATTERNS) {
    if (pattern.test(cleanMessage)) {
      return { detected: true, type: 'implicit' };
    }
  }

  // Check for choice offerings
  for (const pattern of CHOICE_PATTERNS) {
    if (pattern.test(cleanMessage)) {
      return { detected: true, type: 'choices' };
    }
  }

  return { detected: false, type: '' };
}

/**
 * Check if a message has ANY valid CYCLIST reflector marker
 * @param {string} message - The message to check
 * @returns {boolean} True if any marker is present
 */
export function hasReflectorMarker(message) {
  return (
    QUESTION_MARKER_PATTERN.test(message) ||
    CHOICES_MARKER_PATTERN.test(message) ||
    HANDOFF_MARKER_PATTERN.test(message) ||
    CONTEXT_CLEAR_MARKER_PATTERN.test(message) ||
    CONTINUE_MARKER_PATTERN.test(message)
  );
}

/**
 * Extract the last assistant message from a transcript
 * @param {Array} transcript - Array of message objects
 * @returns {string} The last assistant message content
 */
export function extractLastAssistantMessage(transcript) {
  // Find the last assistant message (reverse order)
  // Claude Code transcript format wraps messages: { message: { role, content }, type, ... }
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i];
    // Support both wrapped format (Claude Code JSONL) and direct format (tests)
    const msg = entry.message || entry;
    if (msg.role === 'assistant') {
      // Handle content as string or array
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      if (Array.isArray(msg.content)) {
        // Extract text from text blocks, skip tool_use blocks
        return msg.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');
      }
      return '';
    }
  }
  return '';
}

/**
 * Build the block reason message
 * @param {string} questionType - The type of question detected (or empty for general)
 * @returns {string} The reason message
 */
function buildBlockReason(questionType) {
  let reason = 'Every turn MUST end with a CYCLIST reflector marker. ';

  if (questionType) {
    // Specific question type detected
    switch (questionType) {
      case 'direct':
        reason += 'You asked a question. Add <!-- CYCLIST:QUESTION:yesno --> or <!-- CYCLIST:QUESTION:open --> before your question.';
        break;
      case 'implicit':
        reason += 'You asked an implicit question. Add <!-- CYCLIST:QUESTION:yesno --> before phrases like "would you like" or "should I".';
        break;
      case 'choices':
        reason += 'You offered choices. Add <!-- CYCLIST:CHOICES:option1,option2,option3 --> listing the choices.';
        break;
    }
  } else {
    // No question detected, but still need a marker
    reason += 'Valid markers:\n';
    reason += '  <!-- CYCLIST:HANDOFF:/agent --> - workflow handoff\n';
    reason += '  <!-- CYCLIST:QUESTION:yesno --> - yes/no question\n';
    reason += '  <!-- CYCLIST:QUESTION:open --> - open question\n';
    reason += '  <!-- CYCLIST:CHOICES:a,b,c --> - multiple choice\n';
    reason += '  <!-- CYCLIST:CONTINUE --> - status update, user may continue or redirect';
  }

  return reason;
}

/**
 * Main check for Stop hook - validates ALL turns have reflector markers
 * @param {object} input - Hook input with transcript_path, stop_hook_active
 * @param {object} config - Config with workflow settings
 * @param {string} lastMessage - The last assistant message (pre-extracted for testing)
 * @returns {{ ok: true } | { decision: 'block', reason: string }}
 */
export function checkQuestionReflector(input, config, lastMessage) {
  // Prevent infinite loops
  if (input.stop_hook_active) {
    return { ok: true };
  }

  // Skip enforcement in relay/turbo mode
  if (shouldSkipEnforcement(config)) {
    return { ok: true };
  }

  // If no message, allow (edge case - shouldn't happen)
  if (!lastMessage) {
    return { ok: true };
  }

  // If ANY marker present, allow
  if (hasReflectorMarker(lastMessage)) {
    return { ok: true };
  }

  // No marker found - block
  // Check if it's a question to give more specific guidance
  const detection = detectQuestion(lastMessage);
  return {
    decision: 'block',
    reason: buildBlockReason(detection.detected ? detection.type : ''),
  };
}

/**
 * Check for AskUserQuestion PreToolUse hook
 * @param {object} input - Hook input with tool_name, tool_input
 * @param {object} config - Config with workflow settings
 * @param {string} [recentOutput] - Recent assistant output to check for marker
 * @returns {{ ok: true } | { decision: 'block', reason: string }}
 */
export function checkAskUserQuestion(input, config, recentOutput = '') {
  // Skip enforcement in relay/turbo mode
  if (shouldSkipEnforcement(config)) {
    return { ok: true };
  }

  // If marker present in recent output, allow
  if (recentOutput && hasReflectorMarker(recentOutput)) {
    return { ok: true };
  }

  // Block - AskUserQuestion requires a marker
  return {
    decision: 'block',
    reason: 'AskUserQuestion tool requires a CYCLIST marker. Add <!-- CYCLIST:QUESTION:yesno -->, <!-- CYCLIST:QUESTION:open -->, or <!-- CYCLIST:CHOICES:... --> before using this tool.',
  };
}

// =============================================================================
// CLI Entry Point (for bash wrapper)
// =============================================================================

/**
 * Load config from .pennyfarthing/config.local.yaml
 * @param {string} projectDir - The project directory
 * @returns {object} The config object
 */
function loadConfig(projectDir) {
  try {
    const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
    const content = readFileSync(configPath, 'utf-8');
    // Simple YAML parsing for the fields we need
    const config = { workflow: {} };

    // Extract permission_mode
    const modeMatch = content.match(/permission_mode:\s*(\w+)/);
    if (modeMatch) {
      config.workflow.permission_mode = modeMatch[1];
    }

    // Extract relay_mode
    const relayMatch = content.match(/relay_mode:\s*(true|false)/);
    if (relayMatch) {
      config.workflow.relay_mode = relayMatch[1] === 'true';
    }

    return config;
  } catch {
    // Default config if file doesn't exist
    return { workflow: { permission_mode: 'manual' } };
  }
}

/**
 * Read transcript and extract last assistant message
 * @param {string} transcriptPath - Path to JSONL transcript
 * @returns {string} The last assistant message
 */
function readTranscript(transcriptPath) {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Parse JSONL and build transcript array
    const transcript = [];
    for (const line of lines) {
      try {
        transcript.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return extractLastAssistantMessage(transcript);
  } catch {
    return '';
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  // Read input from stdin
  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let input;
  try {
    input = JSON.parse(inputData);
  } catch {
    // Invalid input - allow to prevent breaking
    console.log(JSON.stringify({ ok: true }));
    process.exit(0);
  }

  // Determine project directory
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Load config
  const config = loadConfig(projectDir);

  // Determine hook type based on input
  if (input.tool_name === 'AskUserQuestion') {
    // PreToolUse hook for AskUserQuestion
    // For PreToolUse, we'd need the recent output - for now, just check config
    const result = checkAskUserQuestion(input, config, '');
    console.log(JSON.stringify(result));
  } else {
    // Stop hook
    const transcriptPath = input.transcript_path || '';
    const lastMessage = transcriptPath ? readTranscript(transcriptPath) : '';
    const result = checkQuestionReflector(input, config, lastMessage);
    console.log(JSON.stringify(result));
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    // On error, allow to prevent breaking
    console.log(JSON.stringify({ ok: true }));
    process.exit(0);
  });
}
