#!/usr/bin/env node
/**
 * jira-sync-story.mjs - Sync a single story to Jira
 *
 * Usage: node jira-sync-story.mjs <story_key> [--transition] [--points] [--comment "message"]
 *
 * Options:
 *   --transition   Transition story to match Pennyfarthing status
 *   --points       Sync story points from Pennyfarthing to Jira
 *   --comment      Add a comment to the story
 */

import {
  checkDependencies,
  findProjectRoot,
  loadSprintFile,
  findEpic,
  findStory,
  extractJiraKey,
  mapStatusToJira,
  getIssueJson,
  getJiraField,
  moveIssue,
  getStoryPoints,
  syncStoryPoints,
  addComment,
  parseArgs,
  success,
  info,
  warn,
  error,
  JIRA_URL
} from './jira-lib.mjs';

// Parse arguments
const args = parseArgs(process.argv, {
  'transition': { type: 'boolean' },
  'points': { type: 'boolean' },
  'comment': { type: 'string' }
});

const storyKey = args._positional[0];
const doTransition = args.transition || false;
const doSyncPoints = args.points || false;
const commentText = args.comment || null;

// Show usage if no story key provided
if (!storyKey) {
  error('Story key required');
  console.log(`
Usage: jira-sync-story.mjs <story_key> [--transition] [--points] [--comment "message"]

Examples:
  jira-sync-story.mjs 24-1                      # Show story status
  jira-sync-story.mjs 24-1 --transition         # Sync status to Jira
  jira-sync-story.mjs 24-1 --points             # Sync story points
  jira-sync-story.mjs 24-1 --transition --points
  jira-sync-story.mjs 24-1 --comment "Started development"
`);
  process.exit(2);
}

// Check dependencies (quiet mode - we'll show story info instead)
if (!checkDependencies({ quiet: false })) {
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

// Extract epic number from story key (e.g., "24-1" -> "24")
const epicNum = storyKey.split('-')[0];

// Find epic and story
const epic = findEpic(sprintData, epicNum);
if (!epic) {
  error(`Epic ${epicNum} not found in sprint file`);
  process.exit(1);
}

const story = findStory(epic, storyKey);
if (!story) {
  error(`Story ${storyKey} not found in epic ${epicNum}`);
  process.exit(1);
}

// Get story details from Pennyfarthing
const PennyfarthingStatus = story.status || 'backlog';
const storyJira = story.jira;
const storyBranch = story.branch;
const storyPr = story.pr;
const storyPoints = story.points;

// Check if synced to Jira
if (!storyJira || storyJira === 'null') {
  warn(`Story ${storyKey} not synced to Jira yet`);
  console.log('');
  console.log('To create this story in Jira, use:');
  console.log(`  jira issue create -tStory -s"Story ${storyKey}" -yHigh`);
  process.exit(1);
}

const jiraKey = extractJiraKey(storyJira);

info(`Story: ${storyKey}`);
info(`Jira: ${jiraKey}`);
console.log('');

// Fetch current Jira state
const issueJson = getIssueJson(jiraKey);
if (!issueJson) {
  error(`Could not fetch issue ${jiraKey}`);
  process.exit(2);
}

const jiraStatus = getJiraField(issueJson, 'fields.status.name', 'Unknown');
const jiraAssignee = getJiraField(issueJson, 'fields.assignee.displayName', 'Unassigned');
const jiraSummary = getJiraField(issueJson, 'fields.summary', 'No summary');
const jiraPoints = getStoryPoints(jiraKey, issueJson);

// Display current state
console.log(`   Summary: ${jiraSummary}`);
console.log(`   Jira Status: ${jiraStatus}`);
console.log(`   Assignee: ${jiraAssignee}`);
console.log(`   Pennyfarthing Status: ${PennyfarthingStatus}`);
if (storyPoints) console.log(`   Pennyfarthing Points: ${storyPoints}`);
if (jiraPoints) console.log(`   Jira Points: ${jiraPoints}`);
if (storyBranch) console.log(`   Branch: ${storyBranch}`);
if (storyPr) console.log(`   PR: ${storyPr}`);
console.log('');

// Map Pennyfarthing status to target Jira status
const targetJiraStatus = mapStatusToJira(PennyfarthingStatus);

// Transition if requested
if (doTransition) {
  if (jiraStatus === targetJiraStatus) {
    success(`Already at correct status: ${jiraStatus}`);
  } else {
    info(`Transitioning: ${jiraStatus} -> ${targetJiraStatus}`);
    const result = moveIssue(jiraKey, targetJiraStatus);
    if (result.success) {
      success(`Transitioned to ${targetJiraStatus}`);
    } else {
      warn('Could not transition (status may not be available from current state)');
    }
  }
}

// Sync story points if requested
if (doSyncPoints) {
  info(`Syncing story points: ${jiraPoints || 'unset'} -> ${storyPoints || 'unset'}`);
  const result = await syncStoryPoints(jiraKey, storyPoints, { currentJiraPoints: jiraPoints });
  if (result.success) {
    if (result.alreadySynced) {
      success(`Story points already synced: ${storyPoints}`);
    } else {
      success(`Story points synced: ${storyPoints}`);
    }
  } else {
    warn(`Could not sync story points: ${result.reason}`);
  }
}

// Add comment if provided
if (commentText) {
  info('Adding comment...');
  const result = addComment(jiraKey, commentText);
  if (result.success) {
    success('Comment added');
  } else {
    warn('Could not add comment');
  }
}

// Auto-comment for transitions (if no manual comment provided)
if (doTransition && !commentText) {
  let autoComment = null;

  if (PennyfarthingStatus === 'in-progress' && storyBranch) {
    autoComment = `**Development Started**\n\nBranch: \`${storyBranch}\`\n\nSynced from Pennyfarthing`;
  } else if (PennyfarthingStatus === 'review' && storyPr) {
    autoComment = `**Ready for Review**\n\nPR: ${storyPr}\n\nSynced from Pennyfarthing`;
  } else if (PennyfarthingStatus === 'done') {
    const today = new Date().toISOString().split('T')[0];
    autoComment = `**Completed**\n\nSynced from Pennyfarthing on ${today}`;
  }

  if (autoComment) {
    info('Adding sync comment...');
    const result = addComment(jiraKey, autoComment);
    if (result.success) {
      success('Sync comment added');
    }
  }
}

console.log('');
success(`${JIRA_URL}/browse/${jiraKey}`);
