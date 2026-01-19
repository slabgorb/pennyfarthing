#!/usr/bin/env node
/**
 * Cyclist PreToolUse Hook
 *
 * This script is called by Claude Code before each tool execution.
 * It communicates with Cyclist's main process via HTTP to get approval decisions.
 *
 * Flow:
 * 1. Claude Code calls this script with tool info via stdin (JSON)
 * 2. Script reads port from .cyclist-approval-port in project directory
 * 3. Script sends request to Cyclist's approval server (localhost:PORT)
 * 4. Cyclist shows approval modal, user decides
 * 5. Script receives response, outputs JSON decision to stdout
 * 6. Claude Code proceeds or blocks based on decision
 *
 * Multi-instance support: Each Cyclist instance writes its approval server port
 * to .cyclist-approval-port in the project directory. This hook reads that file
 * to connect to the correct instance, preventing cross-project interference.
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
const fs = require('fs');
const path = require('path');

const DEFAULT_APPROVAL_PORT = 7432;
const CYCLIST_APPROVAL_HOST = '127.0.0.1';
const TIMEOUT_MS = 120000; // 2 minutes for user to decide
const APPROVAL_PORT_FILE = '.cyclist-approval-port';

/**
 * Find the project root by looking for .cyclist-approval-port or .claude directory
 * Walks up from cwd until found or reaches filesystem root
 */
function findProjectRoot() {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    // Check for approval port file first (indicates Cyclist is running)
    if (fs.existsSync(path.join(dir, APPROVAL_PORT_FILE))) {
      return dir;
    }
    // Fall back to .claude directory as project marker
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Read the approval server port from .cyclist-approval-port file
 * Returns default port if file not found (Cyclist may not be running)
 */
function getApprovalPort() {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    return DEFAULT_APPROVAL_PORT;
  }

  const portFilePath = path.join(projectRoot, APPROVAL_PORT_FILE);
  if (!fs.existsSync(portFilePath)) {
    return DEFAULT_APPROVAL_PORT;
  }

  try {
    const content = fs.readFileSync(portFilePath, 'utf-8').trim();
    const port = parseInt(content, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      return port;
    }
  } catch (e) {
    // Fall through to default
  }

  return DEFAULT_APPROVAL_PORT;
}

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
    const port = getApprovalPort();

    const options = {
      hostname: CYCLIST_APPROVAL_HOST,
      port: port,
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
