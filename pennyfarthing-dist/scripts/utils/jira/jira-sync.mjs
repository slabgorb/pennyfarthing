#!/usr/bin/env node
/**
 * jira-sync.mjs - Sync Pennyfarthing Epic to Jira
 *
 * Usage: node jira-sync.mjs <epic_number> [--dry-run] [--transition] [--points]
 *
 * Options:
 *   --dry-run      Show what would be done without making changes
 *   --transition   Transition Jira issues to match Pennyfarthing status
 *   --points       Sync story points from Pennyfarthing to Jira
 */

import {
  checkDependencies,
  findProjectRoot,
  loadSprintFile,
  findEpic,
  extractJiraKey,
  mapStatusToJira,
  getIssueJson,
  getJiraField,
  moveIssue,
  getStoryPoints,
  syncStoryPoints,
  parseArgs,
  success,
  info,
  warn,
  error,
  JIRA_URL
} from './jira-lib.mjs';

// Parse arguments
const args = parseArgs(process.argv, {
  'dry-run': { type: 'boolean' },
  'transition': { type: 'boolean' },
  'points': { type: 'boolean' },
  'with-comments': { type: 'boolean' } // Deprecated, ignored
});

const epicNum = args._positional[0];
const dryRun = args['dry-run'] || false;
const doTransition = args.transition || false;
const syncPoints = args.points || false;

// Show usage if no epic provided
if (!epicNum) {
  error('Epic number required');
  console.log(`
Usage: jira-sync.mjs <epic_number> [--dry-run] [--transition] [--points]

Examples:
  jira-sync.mjs 35                     # Show sync status for epic 35
  jira-sync.mjs 35 --dry-run           # Show what would be done
  jira-sync.mjs 35 --transition        # Sync status to Jira
  jira-sync.mjs 35 --transition --points  # Sync status and story points
`);
  process.exit(2);
}

// Check dependencies
if (!checkDependencies()) {
  process.exit(2);
}

// Find project root and load sprint data
let projectRoot;
let sprintData;

try {
  projectRoot = findProjectRoot();
  sprintData = loadSprintFile(projectRoot);
} catch (err) {
  error(err.message);
  process.exit(1);
}

// Find epic
const epic = findEpic(sprintData, epicNum);
if (!epic) {
  error(`Epic ${epicNum} not found in sprint file`);
  process.exit(1);
}

// Display header
console.log('');
info('==========================================');
info(`Epic ${epicNum}: ${epic.title}`);
if (epic.jira) info(`Jira: ${epic.jira}`);
info('==========================================');
console.log('');

if (dryRun) {
  warn('[DRY-RUN MODE] No changes will be made');
  console.log('');
}

// Get stories
const stories = epic.stories || [];
if (stories.length === 0) {
  warn(`No stories found in epic ${epicNum}`);
  process.exit(0);
}

info(`Found ${stories.length} stories to process`);
console.log('');

// Process each story
let synced = 0;
let skipped = 0;
let errors = 0;

for (const story of stories) {
  const storyKey = story.id;
  const storyTitle = story.title || 'Untitled';
  const storyStatus = story.status || 'backlog';
  const storyJira = story.jira;
  const storyPoints = story.points;

  console.log('---');
  info(`Story ${storyKey}: ${storyTitle}`);
  console.log(`  Status: ${storyStatus}`);

  // Check if synced to Jira
  if (!storyJira || storyJira === 'null') {
    warn('  Not synced to Jira - skipping');
    skipped++;
    continue;
  }

  // Extract Jira key
  const jiraKey = extractJiraKey(storyJira);
  console.log(`  Jira: ${jiraKey}`);

  if (dryRun) {
    const actions = [];
    if (doTransition) actions.push('transition');
    if (syncPoints) actions.push('sync points');
    warn(`  [DRY-RUN] Would sync: ${actions.length > 0 ? actions.join(', ') : 'view only'}`);
    synced++;
    continue;
  }

  // Fetch current Jira state
  const issueJson = getIssueJson(jiraKey);
  if (!issueJson) {
    warn(`  Could not fetch Jira issue ${jiraKey}`);
    errors++;
    continue;
  }

  const jiraStatus = getJiraField(issueJson, 'fields.status.name', 'Unknown');
  const jiraPoints = getStoryPoints(jiraKey, issueJson);
  const targetStatus = mapStatusToJira(storyStatus);

  console.log(`  Jira Status: ${jiraStatus} (target: ${targetStatus})`);
  if (storyPoints) console.log(`  Points: Pennyfarthing=${storyPoints}, Jira=${jiraPoints || 'unset'}`);

  // Transition if requested
  if (doTransition) {
    if (jiraStatus === targetStatus) {
      success(`  Already at correct status: ${jiraStatus}`);
    } else {
      info(`  Transitioning: ${jiraStatus} -> ${targetStatus}`);
      const result = moveIssue(jiraKey, targetStatus);
      if (result.success) {
        success(`  Transitioned to ${targetStatus}`);
      } else {
        warn(`  Could not transition (may not be available from current state)`);
      }
    }
  }

  // Sync points if requested
  if (syncPoints && storyPoints) {
    info(`  Syncing story points: ${jiraPoints || 'unset'} -> ${storyPoints}`);
    const result = await syncStoryPoints(jiraKey, storyPoints, { currentJiraPoints: jiraPoints });
    if (result.success) {
      if (result.alreadySynced) {
        success(`  Story points already synced: ${storyPoints}`);
      } else {
        success(`  Story points synced: ${storyPoints}`);
      }
    } else {
      warn(`  Could not sync story points: ${result.reason}`);
    }
  }

  synced++;
}

// Summary
console.log('');
console.log('==========================================');
success(`Summary: ${synced} synced, ${skipped} skipped, ${errors} errors`);
console.log('==========================================');

process.exit(errors > 0 ? 1 : 0);
