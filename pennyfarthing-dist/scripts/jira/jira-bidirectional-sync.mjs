#!/usr/bin/env node
/**
 * jira-bidirectional-sync.mjs - Bidirectional sync between sprint YAML and Jira
 *
 * Story: MSSCI-11842
 *
 * Usage: node jira-bidirectional-sync.mjs [options]
 *
 * Options:
 *   --dry-run       Show changes without applying
 *   --yaml-wins     Prefer YAML values on conflict (default: Jira wins)
 *   --status        Sync status field
 *   --points        Sync story points
 *   --all           Sync all fields (status + points)
 *   --sprint <id>   Target specific sprint (default: current)
 */

import {
  mapStatusToJira,
  mapJiraToStatus,
  extractJiraKey
} from './jira-lib.mjs';

/**
 * Parse CLI arguments
 * @param {string[]} argv - Command line arguments (without node and script path)
 * @returns {object} Parsed arguments
 */
export function parseCliArgs(argv) {
  const args = {
    dryRun: false,
    yamlWins: false,
    syncStatus: false,
    syncPoints: false,
    sprintId: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--yaml-wins':
        args.yamlWins = true;
        break;
      case '--status':
        args.syncStatus = true;
        break;
      case '--points':
        args.syncPoints = true;
        break;
      case '--all':
        args.syncStatus = true;
        args.syncPoints = true;
        break;
      case '--sprint':
        args.sprintId = argv[++i];
        break;
    }
  }

  return args;
}

/**
 * Generate a sync plan comparing YAML and Jira stories
 *
 * @param {Array} yamlStories - Stories from sprint YAML [{id, status, points, ...}]
 * @param {Array} jiraStories - Stories from Jira [{key, fields: {status: {name}, customfield_10031, ...}}]
 * @param {object} options - Sync options
 * @param {boolean} options.syncStatus - Whether to sync status field
 * @param {boolean} options.syncPoints - Whether to sync points field
 * @param {string} options.direction - 'yaml-to-jira', 'jira-to-yaml', or 'bidirectional'
 * @param {boolean} options.yamlWins - If true, YAML wins conflicts (default: Jira wins)
 * @param {boolean} options.reportMissing - If true, include detailed reports for missing stories
 * @param {Date} options.lastSyncTime - Last sync timestamp for conflict detection
 * @returns {object} Sync plan with changes, yamlOnly, jiraOnly, both, conflicts, reports
 */
export function generateSyncPlan(yamlStories, jiraStories, options = {}) {
  const {
    syncStatus = false,
    syncPoints = false,
    direction = 'bidirectional',
    yamlWins = false,
    reportMissing = false,
    lastSyncTime = null
  } = options;

  // Build lookup maps
  const yamlByKey = new Map();
  for (const story of yamlStories) {
    yamlByKey.set(story.id, story);
  }

  const jiraByKey = new Map();
  for (const story of jiraStories) {
    jiraByKey.set(story.key, story);
  }

  // Categorize stories
  const yamlKeys = new Set(yamlStories.map(s => s.id));
  const jiraKeys = new Set(jiraStories.map(s => s.key));

  const yamlOnly = [...yamlKeys].filter(k => !jiraKeys.has(k));
  const jiraOnly = [...jiraKeys].filter(k => !yamlKeys.has(k));
  const both = [...yamlKeys].filter(k => jiraKeys.has(k));

  // Generate changes for stories in both systems
  const changes = [];
  const conflicts = [];

  for (const key of both) {
    const yamlStory = yamlByKey.get(key);
    const jiraStory = jiraByKey.get(key);

    const yamlStatus = yamlStory.status;
    const jiraStatus = jiraStory.fields?.status?.name;
    const yamlPoints = yamlStory.points;
    const jiraPoints = jiraStory.fields?.customfield_10031;

    // Normalize statuses for comparison
    const normalizedYamlStatus = mapStatusToJira(yamlStatus);
    const normalizedJiraStatus = jiraStatus;

    // Check status differences
    if (syncStatus && normalizedYamlStatus !== normalizedJiraStatus) {
      // Determine action based on direction and yamlWins flag
      let action;
      let targetStatus;

      if (direction === 'yaml-to-jira') {
        action = 'update-jira';
        targetStatus = normalizedYamlStatus;
      } else if (direction === 'jira-to-yaml') {
        action = 'update-yaml';
        targetStatus = mapJiraToStatus(jiraStatus);
      } else {
        // Bidirectional - use yamlWins flag to determine winner
        if (yamlWins) {
          action = 'update-jira';
          targetStatus = normalizedYamlStatus;
        } else {
          action = 'update-yaml';
          targetStatus = mapJiraToStatus(jiraStatus);
        }
      }

      changes.push({
        key,
        field: 'status',
        action,
        yamlStatus,
        jiraStatus,
        targetStatus
      });
    }

    // Check points differences
    if (syncPoints && yamlPoints !== jiraPoints) {
      let action;
      let targetPoints;

      if (direction === 'yaml-to-jira') {
        action = 'update-jira';
        targetPoints = yamlPoints;
      } else if (direction === 'jira-to-yaml') {
        action = 'update-yaml';
        targetPoints = jiraPoints;
      } else {
        // Bidirectional - use yamlWins flag
        if (yamlWins) {
          action = 'update-jira';
          targetPoints = yamlPoints;
        } else {
          action = 'update-yaml';
          targetPoints = jiraPoints;
        }
      }

      changes.push({
        key,
        field: 'points',
        action,
        yamlPoints,
        jiraPoints,
        targetPoints
      });
    }
  }

  // Build result
  const plan = {
    changes,
    yamlOnly,
    jiraOnly,
    both,
    conflicts
  };

  // Add reports if requested
  if (reportMissing) {
    plan.reports = {
      yamlOnly: yamlOnly.map(key => ({
        key,
        story: yamlByKey.get(key),
        recommendation: 'Create in Jira'
      })),
      jiraOnly: jiraOnly.map(key => ({
        key,
        story: jiraByKey.get(key),
        recommendation: 'Import to YAML'
      }))
    };
  }

  return plan;
}

/**
 * Execute a sync plan
 *
 * @param {object} plan - Sync plan from generateSyncPlan
 * @param {object} options - Execution options
 * @param {boolean} options.dryRun - If true, don't apply changes
 * @returns {Promise<object>} Execution result
 */
export async function executeSyncPlan(plan, options = {}) {
  const { dryRun = false } = options;

  const result = {
    dryRun,
    wouldApply: plan.changes,
    applied: 0,
    yamlModified: false,
    jiraApiCalls: 0
  };

  if (dryRun) {
    // In dry-run mode, don't apply any changes
    return result;
  }

  // Apply changes (actual implementation would go here)
  for (const change of plan.changes) {
    if (change.action === 'update-yaml') {
      // TODO: Update YAML file
      result.yamlModified = true;
    } else if (change.action === 'update-jira') {
      // TODO: Call Jira API
      result.jiraApiCalls++;
    }
    result.applied++;
  }

  return result;
}

/**
 * Format sync plan as human-readable string
 *
 * @param {object} plan - Sync plan from generateSyncPlan
 * @returns {string} Human-readable output
 */
export function formatSyncPlan(plan) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('Bidirectional Sync Plan');
  lines.push('='.repeat(60));
  lines.push('');

  // Summary
  lines.push(`Stories in YAML only: ${plan.yamlOnly.length}`);
  lines.push(`Stories in Jira only: ${plan.jiraOnly.length}`);
  lines.push(`Stories in both: ${plan.both.length}`);
  lines.push(`Changes to apply: ${plan.changes.length}`);
  lines.push('');

  // YAML-only stories
  if (plan.yamlOnly.length > 0) {
    lines.push('--- YAML Only (not in Jira) ---');
    for (const key of plan.yamlOnly) {
      lines.push(`  ${key}`);
    }
    lines.push('');
  }

  // Jira-only stories
  if (plan.jiraOnly.length > 0) {
    lines.push('--- Jira Only (not in YAML) ---');
    for (const key of plan.jiraOnly) {
      lines.push(`  ${key}`);
    }
    lines.push('');
  }

  // Changes
  if (plan.changes.length > 0) {
    lines.push('--- Changes ---');
    for (const change of plan.changes) {
      const direction = change.action === 'update-yaml' ? 'Jira → YAML' : 'YAML → Jira';
      if (change.field === 'status') {
        lines.push(`  ${change.key}: status ${direction}`);
        lines.push(`    YAML: ${change.yamlStatus} | Jira: ${change.jiraStatus} → ${change.targetStatus}`);
      } else if (change.field === 'points') {
        lines.push(`  ${change.key}: points ${direction}`);
        lines.push(`    YAML: ${change.yamlPoints} | Jira: ${change.jiraPoints} → ${change.targetPoints}`);
      }
    }
    lines.push('');
  }

  // Conflicts
  if (plan.conflicts && plan.conflicts.length > 0) {
    lines.push('--- Conflicts (manual resolution needed) ---');
    for (const conflict of plan.conflicts) {
      lines.push(`  ${conflict.key}: ${conflict.field}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
