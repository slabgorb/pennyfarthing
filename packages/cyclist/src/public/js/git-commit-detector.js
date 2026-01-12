/**
 * Git Commit Detector
 *
 * Watches for git commit Bash tool uses and removes committed files
 * from the Changed Files list after successful commits.
 *
 * Flow:
 * 1. Detect tool_use with Bash + git commit command
 * 2. Track the tool_id
 * 3. On matching tool_result success, get committed files
 * 4. Remove those files from DiffViewer
 */

import { removeDiffsForFiles, getDiffs } from './components/DiffViewer.js';

// Track pending git commit tool IDs
const pendingCommits = new Set();

/**
 * Detect if a tool_use message is a git commit command
 * @param {Object} message - SDK message
 * @returns {boolean}
 */
export function isGitCommitToolUse(message) {
  if (message.type !== 'tool_use') return false;
  if (message.tool_name !== 'Bash') return false;

  const command = message.input?.command || '';
  // Match various git commit patterns
  return /\bgit\s+commit\b/.test(command);
}

/**
 * Extract committed file paths from git commit output
 * Git commit output includes lines like:
 *   1 file changed, 10 insertions(+)
 *   create mode 100644 path/to/file.js
 * Or from git status --porcelain before commit
 *
 * @param {string} output - The tool_result output
 * @returns {string[]} Array of committed file paths
 */
function extractCommittedFiles(output) {
  const files = [];

  // Look for "create mode" or "delete mode" lines which have full paths
  const modeRegex = /(?:create|delete) mode \d+ (.+)/g;
  let match;
  while ((match = modeRegex.exec(output)) !== null) {
    files.push(match[1].trim());
  }

  // Also match file paths from the summary line format:
  // "rename path/from => path/to"
  const renameRegex = /rename (.+) => (.+)/g;
  while ((match = renameRegex.exec(output)) !== null) {
    files.push(match[2].trim());
  }

  return files;
}

/**
 * Handle incoming SDK messages to detect git commits
 * Call this for every message to track commits
 * @param {Object} message - SDK message
 */
export function handleMessage(message) {
  // Track git commit tool_use messages
  if (isGitCommitToolUse(message)) {
    pendingCommits.add(message.tool_id);
    console.log('[GitCommitDetector] Tracking git commit:', message.tool_id);
    return;
  }

  // Check for tool_result matching a tracked commit
  if (message.type === 'tool_result' && pendingCommits.has(message.tool_id)) {
    pendingCommits.delete(message.tool_id);

    // Only process successful commits (not errors)
    if (message.is_error) {
      console.log('[GitCommitDetector] Git commit failed:', message.tool_id);
      return;
    }

    console.log('[GitCommitDetector] Git commit succeeded:', message.tool_id);

    // Get committed files from output
    const committedFiles = extractCommittedFiles(message.output || '');

    if (committedFiles.length > 0) {
      // Remove these specific files from diffs
      const removed = removeDiffsForFiles(committedFiles);
      console.log(`[GitCommitDetector] Removed ${removed} committed files from diff list`);
    } else {
      // Fallback: if we couldn't extract files, remove ALL current diffs
      // since we know a commit happened
      const currentDiffs = getDiffs();
      if (currentDiffs.length > 0) {
        const allPaths = currentDiffs.map(d => d.filePath);
        const removed = removeDiffsForFiles(allPaths);
        console.log(`[GitCommitDetector] Removed all ${removed} files (commit detected, no file list)`);
      }
    }
  }
}

/**
 * Clear pending commit tracking (e.g., on session reset)
 */
export function clearPendingCommits() {
  pendingCommits.clear();
}

export default {
  handleMessage,
  isGitCommitToolUse,
  clearPendingCommits,
};
