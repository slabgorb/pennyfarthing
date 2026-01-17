#!/usr/bin/env node
/**
 * Cyclist PreToolUse Hook
 *
 * This script is called by Claude Code before each tool execution.
 * It communicates with Cyclist's main process via HTTP to get approval decisions.
 *
 * Flow:
 * 1. Claude Code calls this script with tool info via stdin (JSON)
 * 2. Script sends request to Cyclist's approval server (localhost:7432)
 * 3. Cyclist shows approval modal, user decides
 * 4. Script receives response, outputs JSON decision to stdout
 * 5. Claude Code proceeds or blocks based on decision
 *
 * Install: Add to ~/.claude/settings.json or project .claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Bash",
 *       "hooks": [{ "type": "command", "command": "node /path/to/cyclist-pretooluse-hook.js" }]
 *     }]
 *   }
 * }
 */

const http = require('http');

const CYCLIST_APPROVAL_PORT = 7432;
const CYCLIST_APPROVAL_HOST = '127.0.0.1';
const TIMEOUT_MS = 120000; // 2 minutes for user to decide

/**
 * Read all stdin as JSON
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error(`Invalid JSON input: ${e.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Send approval request to Cyclist and wait for response
 */
async function requestApproval(toolData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(toolData);

    const options = {
      hostname: CYCLIST_APPROVAL_HOST,
      port: CYCLIST_APPROVAL_PORT,
      path: '/approval-request',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: TIMEOUT_MS,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(new Error(`Invalid response from Cyclist: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      // If Cyclist server isn't running, allow by default (don't block user)
      if (e.code === 'ECONNREFUSED') {
        resolve({ decision: 'allow', reason: 'Cyclist approval server not running' });
      } else {
        reject(e);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Approval request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Output decision in Claude Code hook format
 */
function outputDecision(decision, reason, updatedInput = null) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision, // 'allow', 'deny', or 'ask'
      permissionDecisionReason: reason,
    },
  };

  if (updatedInput) {
    output.hookSpecificOutput.updatedInput = updatedInput;
  }

  console.log(JSON.stringify(output));
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Read tool data from Claude Code
    const toolData = await readStdin();

    // Extract relevant fields
    const { tool_name, tool_input, tool_use_id, session_id } = toolData;

    // Send to Cyclist for approval
    const response = await requestApproval({
      toolName: tool_name,
      toolId: tool_use_id,
      input: tool_input,
      sessionId: session_id,
    });

    // Output decision
    if (response.decision === 'allow') {
      outputDecision('allow', response.reason || 'Approved by user');
      process.exit(0);
    } else if (response.decision === 'deny') {
      outputDecision('deny', response.reason || 'Rejected by user');
      process.exit(0);
    } else if (response.decision === 'ask') {
      // Fall through to Claude Code's built-in permission dialog
      outputDecision('ask', response.reason || 'Deferred to Claude Code');
      process.exit(0);
    } else {
      // Unknown decision, allow by default
      process.exit(0);
    }
  } catch (error) {
    // On error, output to stderr and exit with code that allows the tool
    // We don't want hook failures to block the user
    console.error(`[cyclist-hook] Error: ${error.message}`);
    process.exit(0); // Exit 0 allows the tool to proceed
  }
}

main();
