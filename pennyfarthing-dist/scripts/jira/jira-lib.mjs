#!/usr/bin/env node
/**
 * jira-lib.mjs - Shared Jira functions for Pennyfarthing
 *
 * Provides utilities for interacting with Jira using the jira CLI
 * and REST API for operations the CLI doesn't support well.
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
export const JIRA_PROJECT = process.env.JIRA_PROJECT || 'MSSCI';
export const JIRA_URL = process.env.JIRA_URL || 'https://1898andco.atlassian.net';

// ANSI colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

/**
 * Output helpers
 */
export function success(msg) {
  console.error(`${colors.green}[OK]${colors.reset} ${msg}`);
}

export function info(msg) {
  console.error(`${colors.blue}[INFO]${colors.reset} ${msg}`);
}

export function warn(msg) {
  console.error(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

export function error(msg) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`);
}

/**
 * Find project root by looking for .claude directory
 */
export function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== '/') {
    if (existsSync(join(dir, '.claude'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error('Could not find project root (no .claude/ directory found)');
}

/**
 * Check if jira CLI and dependencies are available
 */
export function checkDependencies(options = {}) {
  const { quiet = false } = options;
  const missing = [];

  // Check for jira CLI
  try {
    execSync('which jira', { stdio: 'pipe' });
    if (!quiet) success('jira installed');
  } catch {
    missing.push('jira');
    error('jira not found');
    console.error('  Install with: brew install ankitpokhrel/jira-cli/jira-cli');
    console.error('  Then run: jira init');
  }

  // Check for JIRA_API_TOKEN
  if (!process.env.JIRA_API_TOKEN) {
    missing.push('JIRA_API_TOKEN');
    error('JIRA_API_TOKEN not set');
    console.error('  Create token at: https://id.atlassian.com/manage-profile/security/api-tokens');
    console.error('  Then: export JIRA_API_TOKEN="your-token"');
  } else if (!quiet) {
    success('JIRA_API_TOKEN set');
  }

  // Check jira config
  const configPath = join(process.env.HOME, '.config/.jira/.config.yml');
  if (existsSync(configPath)) {
    if (!quiet) success('jira configured');
  } else if (missing.indexOf('jira') === -1) {
    missing.push('jira-config');
    error('jira not configured');
    console.error('  Run: jira init');
  }

  if (missing.length > 0) {
    console.error('');
    error(`Missing: ${missing.join(', ')}`);
    return false;
  }

  console.error('');
  return true;
}

/**
 * Execute jira CLI command and return output
 */
export function jiraExec(args, options = {}) {
  const { silent = false, allowFailure = false } = options;

  try {
    const result = spawnSync('jira', args, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : ['pipe', 'pipe', 'pipe']
    });

    if (result.status !== 0 && !allowFailure) {
      throw new Error(result.stderr || `jira command failed with exit code ${result.status}`);
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status
    };
  } catch (err) {
    if (allowFailure) {
      return { stdout: '', stderr: err.message, status: 1 };
    }
    throw err;
  }
}

/**
 * Get issue as JSON from Jira
 */
export function getIssueJson(issueKey) {
  try {
    const result = jiraExec(['issue', 'view', issueKey, '--raw'], { silent: true, allowFailure: true });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Extract field from Jira issue JSON
 */
export function getJiraField(issueJson, fieldPath, defaultValue = null) {
  if (!issueJson) return defaultValue;

  const parts = fieldPath.replace(/^\./, '').split('.');
  let value = issueJson;

  for (const part of parts) {
    if (value === null || value === undefined) return defaultValue;
    value = value[part];
  }

  return value ?? defaultValue;
}

/**
 * Status mapping: Pennyfarthing -> Jira
 */
export function mapStatusToJira(PennyfarthingStatus) {
  const mapping = {
    'backlog': 'To Do',
    'todo': 'To Do',
    'in-progress': 'In Progress',
    'in_progress': 'In Progress',
    'active': 'In Progress',
    'review': 'In Review',
    'in-review': 'In Review',
    'in_review': 'In Review',
    'done': 'Done',
    'completed': 'Done',
    'closed': 'Done',
    'blocked': 'Blocked'
  };

  return mapping[PennyfarthingStatus?.toLowerCase()] || 'To Do';
}

/**
 * Status mapping: Jira -> Pennyfarthing
 */
export function mapJiraToStatus(jiraStatus) {
  const mapping = {
    'To Do': 'backlog',
    'Open': 'backlog',
    'Backlog': 'backlog',
    'In Progress': 'in-progress',
    'Active': 'in-progress',
    'In Review': 'review',
    'Review': 'review',
    'Done': 'done',
    'Closed': 'done',
    'Resolved': 'done',
    'Blocked': 'blocked'
  };

  return mapping[jiraStatus] || 'backlog';
}

/**
 * Extract Jira key from URL or return as-is
 */
export function extractJiraKey(input) {
  if (!input) return null;

  // Already in key format
  const keyPattern = new RegExp(`^${JIRA_PROJECT}-\\d+$`);
  if (keyPattern.test(input)) {
    return input;
  }

  // Extract from URL
  const urlPattern = new RegExp(`(${JIRA_PROJECT}-\\d+)`);
  const match = input.match(urlPattern);
  return match ? match[1] : input;
}

/**
 * Load sprint YAML file using yq CLI
 */
export function loadSprintFile(projectRoot) {
  const sprintPath = join(projectRoot, 'sprint', 'current-sprint.yaml');
  if (!existsSync(sprintPath)) {
    throw new Error(`Sprint file not found: ${sprintPath}`);
  }

  // Use yq to convert YAML to JSON, then parse
  try {
    const json = execSync(`yq -o json '.' "${sprintPath}"`, { encoding: 'utf-8' });
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to parse sprint file: ${err.message}`);
  }
}

/**
 * Find epic in sprint data (handles "24" and "epic-24" formats)
 */
export function findEpic(sprintData, epicNum) {
  if (!sprintData?.epics) return null;

  return sprintData.epics.find(e =>
    e.id === epicNum ||
    e.id === `epic-${epicNum}` ||
    e.id === epicNum.replace(/^epic-/, '')
  );
}

/**
 * Find story in epic
 */
export function findStory(epic, storyId) {
  if (!epic?.stories) return null;
  return epic.stories.find(s => s.id === storyId);
}

/**
 * Get story field from sprint YAML
 */
export function getStoryField(sprintData, storyKey, fieldName) {
  // Extract epic number from story key (e.g., "24-1" -> "24")
  const epicNum = storyKey.split('-')[0];

  const epic = findEpic(sprintData, epicNum);
  if (!epic) return null;

  const story = findStory(epic, storyKey);
  if (!story) return null;

  return story[fieldName] ?? null;
}

/**
 * Transition issue to new status
 */
export function moveIssue(issueKey, targetStatus, options = {}) {
  const { dryRun = false } = options;

  if (dryRun) {
    warn(`[DRY-RUN] Would move ${issueKey} to: ${targetStatus}`);
    return { success: true, dryRun: true };
  }

  // Check current status first
  const issueJson = getIssueJson(issueKey);
  if (issueJson) {
    const currentStatus = getJiraField(issueJson, 'fields.status.name');
    if (currentStatus?.toLowerCase() === targetStatus.toLowerCase()) {
      return { success: true, alreadyAtStatus: true };
    }
  }

  const result = jiraExec(['issue', 'move', issueKey, targetStatus], { allowFailure: true });
  return {
    success: result.status === 0,
    output: result.stdout + result.stderr
  };
}

/**
 * Get story points from issue
 */
export function getStoryPoints(issueKey, issueJson = null) {
  if (!issueJson) {
    issueJson = getIssueJson(issueKey);
  }
  if (!issueJson) return null;

  // customfield_10031 is Story Points for 1898andco Jira
  return getJiraField(issueJson, 'fields.customfield_10031', null);
}

/**
 * Sync story points via REST API (jira CLI doesn't handle custom fields well)
 */
export async function syncStoryPoints(issueKey, PennyfarthingPoints, options = {}) {
  const { dryRun = false, currentJiraPoints = null } = options;

  if (!PennyfarthingPoints || PennyfarthingPoints === 'null') {
    return { success: false, reason: 'No points in Pennyfarthing' };
  }

  // Compare current points
  const jiraPoints = currentJiraPoints ?? getStoryPoints(issueKey);
  const jiraPointsInt = jiraPoints ? Math.floor(Number(jiraPoints)) : null;

  if (jiraPointsInt === Number(PennyfarthingPoints)) {
    return { success: true, alreadySynced: true };
  }

  if (dryRun) {
    warn(`[DRY-RUN] Would sync points for ${issueKey}: ${jiraPoints} -> ${PennyfarthingPoints}`);
    return { success: true, dryRun: true };
  }

  // Use REST API to update custom field
  const jiraUser = process.env.JIRA_USER || 'keith.avery@1898andco.io';
  const apiUrl = `${JIRA_URL}/rest/api/3/issue/${issueKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${jiraUser}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          customfield_10031: Number(PennyfarthingPoints)
        }
      })
    });

    if (response.ok || response.status === 204) {
      return { success: true };
    } else {
      return { success: false, reason: `HTTP ${response.status}` };
    }
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Add comment to issue
 */
export function addComment(issueKey, comment, options = {}) {
  const { dryRun = false } = options;

  if (dryRun) {
    warn(`[DRY-RUN] Would add comment to ${issueKey}`);
    return { success: true, dryRun: true };
  }

  const result = jiraExec(['issue', 'comment', 'add', issueKey, comment], { allowFailure: true });
  return {
    success: result.status === 0,
    output: result.stdout + result.stderr
  };
}

/**
 * GitHub username to Jira email mapping
 */
export function mapGithubToJira(githubUser) {
  const mapping = {
    'slabgorb': 'keith.avery@1898andco.io',
    'arcaven': 'michael.pursifull@1898andco.io',
    'RoseSecurity': 'michael.rosenfeld@1898andco.io',
    'Zious11': 'jared.richards@1898andco.io',
    'drbothen': 'joshua.magady@1898andco.io'
  };

  return mapping[githubUser] || `${githubUser}@1898andco.io`;
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv, spec) {
  const args = { _positional: [] };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const specEntry = spec[key];

      if (specEntry?.type === 'boolean') {
        args[key] = true;
      } else if (specEntry?.type === 'string') {
        args[key] = argv[++i];
      } else {
        // Unknown flag, treat as boolean
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Short flags
      const key = arg.slice(1);
      args[key] = true;
    } else {
      args._positional.push(arg);
    }
  }

  return args;
}
