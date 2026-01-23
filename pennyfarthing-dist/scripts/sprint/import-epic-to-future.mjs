#!/usr/bin/env node
/**
 * import-epic-to-future.mjs - Import epics-and-stories workflow output to future.yaml
 *
 * Transforms the markdown output from the epics-and-stories workflow into
 * the YAML format used by sprint/future.yaml.
 *
 * Usage: node import-epic-to-future.mjs [--dry-run] <epics-md-file> [initiative-name]
 *
 * Example:
 *   node import-epic-to-future.mjs docs/planning/reflector-epics-and-stories.md "Reflector Consolidation"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Colors
// =============================================================================

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};

const log = {
  info: (msg) => console.log(`${colors.blue('INFO')}: ${msg}`),
  success: (msg) => console.log(`${colors.green('SUCCESS')}: ${msg}`),
  warn: (msg) => console.log(`${colors.yellow('WARN')}: ${msg}`),
  error: (msg) => console.error(`${colors.red('ERROR')}: ${msg}`),
};

// =============================================================================
// Find project root
// =============================================================================

function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

// =============================================================================
// Parse epics markdown file
// =============================================================================

function parseEpicsMarkdown(content) {
  const result = {
    title: '',
    description: '',
    totalPoints: 0,
    epicTitle: '',
    epicDescription: '',
    stories: [],
  };

  const lines = content.split('\n');

  // Extract title from first # heading
  const titleMatch = content.match(/^# (.+?)( - Epic Breakdown)?$/m);
  if (titleMatch) {
    result.title = titleMatch[1].replace(' - Epics and Stories', '');
  }

  // Extract description from Overview section
  const overviewMatch = content.match(/## Overview\s*\n\s*\n(.+?)(?=\n\n##|\n##)/s);
  if (overviewMatch) {
    result.description = overviewMatch[1].trim();
  }

  // Extract total points
  const pointsMatch = content.match(/\*\*Points:\*\*\s*(\d+)/);
  if (pointsMatch) {
    result.totalPoints = parseInt(pointsMatch[1], 10);
  } else {
    const effortMatch = content.match(/Total Effort.*?(\d+)\s*story points/i);
    if (effortMatch) {
      result.totalPoints = parseInt(effortMatch[1], 10);
    }
  }

  // Extract epic title
  const epicTitleMatch = content.match(/^## Epic \d+:\s*(.+)$/m);
  if (epicTitleMatch) {
    result.epicTitle = epicTitleMatch[1];
  }

  // Extract epic description (User Outcome)
  const userOutcomeMatch = content.match(/\*\*User Outcome:\*\*\s*(.+)/);
  if (userOutcomeMatch) {
    result.epicDescription = userOutcomeMatch[1];
  }

  // Parse stories
  const storyRegex = /^### Story \d+\.(\d+):\s*(.+)$/gm;
  const iWantRegex = /^I want \*\*(.+?)\*\*,/m;

  let match;
  let storyPositions = [];

  // Find all story positions
  while ((match = storyRegex.exec(content)) !== null) {
    storyPositions.push({
      num: parseInt(match[1], 10),
      title: match[2],
      index: match.index,
    });
  }

  // Extract description for each story
  for (let i = 0; i < storyPositions.length; i++) {
    const story = storyPositions[i];
    const startIndex = story.index;
    const endIndex = i < storyPositions.length - 1
      ? storyPositions[i + 1].index
      : content.length;

    const storyContent = content.slice(startIndex, endIndex);

    // Extract "I want" description
    const iWantMatch = storyContent.match(iWantRegex);
    let description = '';
    if (iWantMatch) {
      description = iWantMatch[1];
    }

    result.stories.push({
      num: story.num,
      title: story.title,
      description: description,
    });
  }

  return result;
}

// =============================================================================
// Get next epic number from future.yaml
// =============================================================================

function getNextEpicNumber(futureYamlPath) {
  if (!fs.existsSync(futureYamlPath)) {
    return 60;
  }

  const content = fs.readFileSync(futureYamlPath, 'utf-8');

  // Look for "Next Available Epic Number: XX"
  const nextMatch = content.match(/Next Available Epic Number:\s*(\d+)/i);
  if (nextMatch) {
    return parseInt(nextMatch[1], 10);
  }

  // Fallback: find highest epic-XX number
  const epicMatches = content.matchAll(/epic-(\d+)/g);
  let maxNum = 59;
  for (const m of epicMatches) {
    const num = parseInt(m[1], 10);
    if (num > maxNum) {
      maxNum = num;
    }
  }

  return maxNum + 1;
}

// =============================================================================
// Generate YAML for initiative
// =============================================================================

function generateYaml(parsed, epicNum, initiativeName, epicsFile) {
  const date = new Date().toISOString().split('T')[0];

  // Indent helper
  const indent = (text, spaces) => {
    return text.split('\n').map(line => ' '.repeat(spaces) + line).join('\n');
  };

  let yaml = `
    # ==========================================================================
    # ${initiativeName}
    # Imported from: ${epicsFile}
    # Date: ${date}
    # ==========================================================================
    - name: "${initiativeName}"
      description: |
        ${parsed.description}
      status: ready
      blocked_by: null
      total_points: ${parsed.totalPoints}
      prd: docs/planning/reflector-prd.md
      epics_doc: ${epicsFile}
      epics:
        - id: epic-${epicNum}
          title: "${parsed.epicTitle || initiativeName}"
          description: |
            ${parsed.epicDescription || parsed.description}
          points: ${parsed.totalPoints}
          priority: P1
          marker: "reflector"
          repos: pennyfarthing
          status: planning
          stories:
`;

  // Add stories
  for (const story of parsed.stories) {
    yaml += `            - id: "${epicNum}-${story.num}"
              title: "${story.title}"
              description: |
                ${story.description || story.title}
              points: 1
              priority: P0
              status: planning
              repos: pennyfarthing
`;
  }

  return yaml;
}

// =============================================================================
// Update future.yaml
// =============================================================================

function updateFutureYaml(futureYamlPath, newContent, nextEpicNum) {
  let content = fs.readFileSync(futureYamlPath, 'utf-8');

  // Update next epic number comment
  content = content.replace(
    /Next Available Epic Number:\s*\d+/i,
    `Next Available Epic Number: ${nextEpicNum + 1}`
  );

  // Find insertion point (before SUMMARY section)
  const summaryIndex = content.indexOf('# =============================================================================\n# SUMMARY');

  if (summaryIndex === -1) {
    // No summary section, append at end
    content += newContent;
  } else {
    // Insert before summary
    content = content.slice(0, summaryIndex) + newContent + '\n' + content.slice(summaryIndex);
  }

  // Update epic numbering comment (append new epic number to the range)
  const epicNumMatch = content.match(/# Epic Numbering Used: ([\d\-,\s]+)\n/);
  if (epicNumMatch) {
    const current = epicNumMatch[1].trim();
    if (!current.includes(nextEpicNum.toString())) {
      // Parse the last range and extend it, or add new number
      const lastRange = current.match(/(\d+)-(\d+)$/);
      let newNumbering;
      if (lastRange && parseInt(lastRange[2], 10) === nextEpicNum - 1) {
        // Extend the range (e.g., 55-59 becomes 55-61)
        newNumbering = current.replace(/(\d+)-(\d+)$/, `$1-${nextEpicNum}`);
      } else {
        // Add new number (e.g., 55-59, 61)
        newNumbering = `${current}, ${nextEpicNum}`;
      }
      content = content.replace(
        /# Epic Numbering Used: [\d\-,\s]+\n/,
        `# Epic Numbering Used: ${newNumbering}\n`
      );
    }
  }

  // Update summary table
  const summaryTableMatch = content.match(/# TOTAL\s+\|\s+(\d+)\s+\|\s+(\d+)/);
  if (summaryTableMatch) {
    const oldEpics = parseInt(summaryTableMatch[1], 10);
    const oldPoints = parseInt(summaryTableMatch[2], 10);
    // We'd need to parse the new points, but for simplicity just note it needs manual update
  }

  return content;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const args = process.argv.slice(2);

  let dryRun = false;
  let epicsFile = '';
  let initiativeName = '';

  // Parse arguments
  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node import-epic-to-future.mjs [--dry-run] <epics-md-file> [initiative-name]

Arguments:
  epics-md-file    Path to the markdown file from epics-and-stories workflow
  initiative-name  Name for the initiative (optional, extracted from file if not provided)

Options:
  --dry-run        Print YAML to stdout instead of updating future.yaml
  --help, -h       Show this help message`);
      process.exit(0);
    } else if (!epicsFile) {
      epicsFile = arg;
    } else if (!initiativeName) {
      initiativeName = arg;
    }
  }

  if (!epicsFile) {
    log.error('No epics markdown file specified');
    console.log('Usage: node import-epic-to-future.mjs [--dry-run] <epics-md-file> [initiative-name]');
    process.exit(1);
  }

  const projectRoot = findProjectRoot();
  const fullEpicsPath = path.isAbsolute(epicsFile)
    ? epicsFile
    : path.join(projectRoot, epicsFile);

  if (!fs.existsSync(fullEpicsPath)) {
    log.error(`File not found: ${fullEpicsPath}`);
    process.exit(1);
  }

  const futureYamlPath = path.join(projectRoot, 'sprint', 'future.yaml');

  // Read and parse epics file
  const content = fs.readFileSync(fullEpicsPath, 'utf-8');
  const parsed = parseEpicsMarkdown(content);

  // Use provided name or extract from file
  if (!initiativeName) {
    initiativeName = parsed.title || 'Imported Initiative';
  }

  // Get next epic number
  const nextEpicNum = getNextEpicNumber(futureYamlPath);

  log.info(`Next epic number: ${nextEpicNum}`);
  log.info(`Initiative name: ${initiativeName}`);
  log.info(`Total points: ${parsed.totalPoints}`);
  log.info(`Epic title: ${parsed.epicTitle}`);
  log.info(`Stories found: ${parsed.stories.length}`);

  // Generate YAML
  const newYaml = generateYaml(parsed, nextEpicNum, initiativeName, epicsFile);

  if (dryRun) {
    console.log(`\n${colors.yellow('=== DRY RUN: Would append to future.yaml ===')}`);
    console.log(newYaml);
    console.log(`${colors.yellow('=== End of YAML ===')}\n`);
    console.log(`${colors.green('To apply, run without --dry-run')}`);
  } else {
    // Update future.yaml
    const updatedContent = updateFutureYaml(futureYamlPath, newYaml, nextEpicNum);
    fs.writeFileSync(futureYamlPath, updatedContent);

    log.success(`Added epic-${nextEpicNum} to ${futureYamlPath}`);
    log.success(`Next available epic number is now: ${nextEpicNum + 1}`);
  }
}

main();
