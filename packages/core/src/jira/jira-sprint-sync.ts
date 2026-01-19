/**
 * Jira Sprint Sync Functions
 *
 * Story 47-2: Sync sprint numbers with Jira sprint IDs
 *
 * These functions enable bidirectional sprint tracking between
 * Pennyfarthing's local sprint YAML and Jira's sprint system.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify } from 'yaml';

// Types for sprint sync operations

export interface JiraSprintInfo {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
}

export interface SprintIssue {
  key: string;
  summary: string;
  status: string;
  points?: number;
  labels?: string[];
}

export interface SprintVelocityMetrics {
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
  velocityPercentage?: number;
  issueCount?: number;
  completedCount?: number;
  byStatus?: Record<string, { count: number; points: number }>;
}

export interface SprintSyncResult {
  success: boolean;
  error?: string;
  warning?: string;
}

// ============================================
// AC1: Sprint YAML references Jira sprint ID
// ============================================

export interface AddJiraSprintIdOptions {
  sprintPath: string;
  jiraSprintId: number;
  force?: boolean;
}

export interface AddJiraSprintIdResult extends SprintSyncResult {
  previousId?: number;
}

/**
 * Add or update jira_sprint_id field in sprint YAML
 */
export async function addJiraSprintIdToYaml(
  options: AddJiraSprintIdOptions
): Promise<AddJiraSprintIdResult> {
  const { sprintPath, jiraSprintId, force = true } = options;

  // Check if file exists
  if (!existsSync(sprintPath)) {
    return {
      success: false,
      error: `Sprint file not found: ${sprintPath}`
    };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as { sprint?: { jira_sprint_id?: number } };

    // Check for existing jira_sprint_id
    if (yaml.sprint?.jira_sprint_id !== undefined && !force) {
      return {
        success: false,
        error: `Sprint already has jira_sprint_id: ${yaml.sprint.jira_sprint_id}`,
        previousId: yaml.sprint.jira_sprint_id
      };
    }

    const previousId = yaml.sprint?.jira_sprint_id;

    // Update the YAML
    if (yaml.sprint) {
      yaml.sprint.jira_sprint_id = jiraSprintId;
    }

    // Write back, preserving order by inserting after 'number'
    const updatedContent = stringify(yaml, {
      lineWidth: 0,
      singleQuote: false
    });

    writeFileSync(sprintPath, updatedContent);

    return {
      success: true,
      previousId
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update sprint YAML: ${(err as Error).message}`
    };
  }
}

// ============================================
// AC2: Status check queries Jira sprint for membership
// ============================================

export interface GetJiraSprintInfoOptions {
  sprintId: number;
  _mockResponse?: JiraSprintInfo | null;
  _mockError?: string;
}

export interface GetJiraSprintInfoResult extends SprintSyncResult {
  sprint?: JiraSprintInfo;
}

/**
 * Get sprint details from Jira
 */
export async function getJiraSprintInfo(
  options: GetJiraSprintInfoOptions
): Promise<GetJiraSprintInfoResult> {
  const { sprintId, _mockResponse, _mockError } = options;

  // Handle mock error
  if (_mockError) {
    return {
      success: false,
      error: _mockError
    };
  }

  // Handle mock response
  if (_mockResponse !== undefined) {
    if (_mockResponse === null) {
      return {
        success: false,
        error: `Sprint ${sprintId} not found`
      };
    }
    return {
      success: true,
      sprint: _mockResponse
    };
  }

  // Real implementation would call Jira CLI
  // jira sprint view {sprintId}
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockResponse for testing'
  };
}

export interface GetSprintIssuesOptions {
  sprintId: number;
  label?: string;
  _mockResponse?: SprintIssue[];
  _mockError?: string;
}

export interface GetSprintIssuesResult extends SprintSyncResult {
  issues?: SprintIssue[];
}

/**
 * Get all issues in a Jira sprint
 */
export async function getSprintIssues(
  options: GetSprintIssuesOptions
): Promise<GetSprintIssuesResult> {
  const { _mockResponse, _mockError } = options;

  // Handle mock error
  if (_mockError) {
    return {
      success: false,
      error: _mockError
    };
  }

  // Handle mock response
  if (_mockResponse !== undefined) {
    return {
      success: true,
      issues: _mockResponse
    };
  }

  // Real implementation would call Jira CLI
  // jira issue list --jql "sprint = {sprintId}"
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockResponse for testing'
  };
}

export interface IsStoryInJiraSprintOptions {
  jiraKey: string;
  sprintId: number;
  _mockResponse?: boolean;
  _mockError?: string;
}

export interface IsStoryInJiraSprintResult extends SprintSyncResult {
  inSprint?: boolean;
}

/**
 * Check if a specific story is in a Jira sprint
 */
export async function isStoryInJiraSprint(
  options: IsStoryInJiraSprintOptions
): Promise<IsStoryInJiraSprintResult> {
  const { _mockResponse, _mockError } = options;

  // Handle mock error
  if (_mockError) {
    return {
      success: false,
      error: _mockError
    };
  }

  // Handle mock response
  if (_mockResponse !== undefined) {
    return {
      success: true,
      inSprint: _mockResponse
    };
  }

  // Real implementation would call Jira CLI
  // jira issue view {jiraKey} and check sprint field
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockResponse for testing'
  };
}

// ============================================
// AC3: Sprint velocity pulls from Jira sprint metrics
// ============================================

export interface GetSprintVelocityOptions {
  sprintId: number;
  _mockResponse?: SprintVelocityMetrics;
  _mockError?: string;
}

export interface GetSprintVelocityResult extends SprintSyncResult {
  metrics?: SprintVelocityMetrics;
}

/**
 * Get velocity metrics from Jira sprint
 */
export async function getSprintVelocityFromJira(
  options: GetSprintVelocityOptions
): Promise<GetSprintVelocityResult> {
  const { _mockResponse, _mockError } = options;

  // Handle mock error
  if (_mockError) {
    return {
      success: false,
      error: _mockError
    };
  }

  // Handle mock response
  if (_mockResponse !== undefined) {
    // Calculate velocity percentage if not provided
    const metrics = { ..._mockResponse };
    if (metrics.velocityPercentage === undefined) {
      if (metrics.totalPoints === 0) {
        metrics.velocityPercentage = 0;
      } else {
        metrics.velocityPercentage = Math.round(
          (metrics.completedPoints / metrics.totalPoints) * 100
        );
      }
    }
    return {
      success: true,
      metrics
    };
  }

  // Real implementation would call Jira CLI
  // jira issue list --jql "sprint = {sprintId}" and aggregate points
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockResponse for testing'
  };
}

// ============================================
// AC4: Local sprint number matches Jira sprint
// ============================================

export interface ValidateSprintAlignmentOptions {
  sprintPath: string;
  _mockJiraSprint?: JiraSprintInfo | null;
  _mockError?: string;
}

export interface ValidateSprintAlignmentResult extends SprintSyncResult {
  aligned?: boolean;
  localNumber?: number;
  jiraSprintId?: number;
  extractedNumber?: number;
}

/**
 * Extract sprint number from Jira sprint name
 * Handles formats like "Sprint 11", "MSSCI Sprint 11", etc.
 */
function extractSprintNumber(name: string): number | null {
  const match = name.match(/Sprint\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validate that local sprint number matches Jira sprint
 */
export async function validateSprintAlignment(
  options: ValidateSprintAlignmentOptions
): Promise<ValidateSprintAlignmentResult> {
  const { sprintPath, _mockJiraSprint, _mockError } = options;

  // Handle mock error
  if (_mockError) {
    return {
      success: false,
      error: _mockError
    };
  }

  // Read local sprint YAML
  if (!existsSync(sprintPath)) {
    return {
      success: false,
      error: `Sprint file not found: ${sprintPath}`
    };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as {
      sprint?: {
        number?: number;
        jira_sprint_id?: number;
        status?: string;
      };
    };

    const localNumber = yaml.sprint?.number;
    const jiraSprintId = yaml.sprint?.jira_sprint_id;
    const localStatus = yaml.sprint?.status;

    // Check if jira_sprint_id is configured
    if (jiraSprintId === undefined) {
      return {
        success: false,
        error: 'Sprint jira_sprint_id not configured',
        localNumber
      };
    }

    // Get Jira sprint info (mock or real)
    let jiraSprint: JiraSprintInfo | null = null;
    if (_mockJiraSprint !== undefined) {
      jiraSprint = _mockJiraSprint;
    } else {
      // Would call real API
      return {
        success: false,
        error: 'Real Jira API not yet implemented - use _mockJiraSprint for testing'
      };
    }

    if (!jiraSprint) {
      return {
        success: false,
        error: `Jira sprint ${jiraSprintId} not found`,
        localNumber,
        jiraSprintId
      };
    }

    // Extract sprint number from Jira sprint name
    const extractedNumber = extractSprintNumber(jiraSprint.name);

    // Check for state mismatch (local active but Jira closed)
    if (localStatus === 'active' && jiraSprint.state === 'closed') {
      return {
        success: true,
        aligned: false,
        localNumber,
        jiraSprintId,
        extractedNumber: extractedNumber ?? undefined,
        warning: `Sprint mismatch: local is active but Jira sprint is closed`
      };
    }

    // Check for number mismatch
    if (extractedNumber !== null && extractedNumber !== localNumber) {
      return {
        success: true,
        aligned: false,
        localNumber,
        jiraSprintId,
        extractedNumber,
        warning: `Sprint number mismatch: local is ${localNumber}, Jira is ${extractedNumber}`
      };
    }

    // All checks passed - aligned
    return {
      success: true,
      aligned: true,
      localNumber,
      jiraSprintId,
      extractedNumber: extractedNumber ?? undefined
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read sprint YAML: ${(err as Error).message}`
    };
  }
}

// ============================================
// Story 47-3: Detect Jira-only stories missing from sprint YAML
// ============================================

// Types for 47-3

export interface MissingStory extends SprintIssue {
  storyId: string;
}

export interface GetYamlStoryIdsOptions {
  sprintPath: string;
}

export interface GetYamlStoryIdsResult extends SprintSyncResult {
  storyIds?: string[];
}

export interface FindJiraOnlyStoriesOptions {
  jiraIssues: SprintIssue[];
  yamlStoryIds: string[];
  filterLabel?: string;
}

export interface FindJiraOnlyStoriesResult extends SprintSyncResult {
  missingStories?: MissingStory[];
}

export interface FormatMissingStoriesReportOptions {
  missingStories: MissingStory[];
  jiraBaseUrl?: string;
}

export interface FormatMissingStoriesReportResult extends SprintSyncResult {
  report?: string;
}

export interface ImportMissingStoriesToYamlOptions {
  sprintPath: string;
  missingStories: MissingStory[];
  targetEpicId: string;
  dryRun?: boolean;
}

export interface ImportMissingStoriesToYamlResult extends SprintSyncResult {
  importedCount?: number;
  wouldImport?: MissingStory[];
}

// ============================================
// AC1 + AC2: Extract story IDs from sprint YAML
// ============================================

/**
 * Extract all story IDs from sprint YAML file
 */
export async function getYamlStoryIds(
  options: GetYamlStoryIdsOptions
): Promise<GetYamlStoryIdsResult> {
  const { sprintPath } = options;

  if (!existsSync(sprintPath)) {
    return {
      success: false,
      error: `Sprint file not found: ${sprintPath}`
    };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as {
      epics?: Array<{
        id: string;
        stories?: Array<{ id: string }>;
      }>;
    };

    const storyIds: string[] = [];

    if (yaml.epics) {
      for (const epic of yaml.epics) {
        if (epic.stories) {
          for (const story of epic.stories) {
            if (story.id) {
              storyIds.push(String(story.id));
            }
          }
        }
      }
    }

    return {
      success: true,
      storyIds
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse sprint YAML: ${(err as Error).message}`
    };
  }
}

// ============================================
// AC2: Compare Jira issues with YAML stories
// ============================================

/**
 * Extract story ID from Jira summary
 * Handles formats like "47-1: Title", "Story 47-1: Title", etc.
 */
function extractStoryIdFromSummary(summary: string): string | null {
  // Match patterns like "47-1:", "Story 47-1:", "31-5:" etc.
  const match = summary.match(/(?:Story\s+)?(\d+-\d+):/i);
  return match ? match[1] : null;
}

/**
 * Find stories that are in Jira but not in the sprint YAML
 */
export async function findJiraOnlyStories(
  options: FindJiraOnlyStoriesOptions
): Promise<FindJiraOnlyStoriesResult> {
  const { jiraIssues, yamlStoryIds, filterLabel } = options;

  const missingStories: MissingStory[] = [];

  for (const issue of jiraIssues) {
    // Filter by label if provided
    if (filterLabel && (!issue.labels || !issue.labels.includes(filterLabel))) {
      continue;
    }

    // Extract story ID from summary
    const storyId = extractStoryIdFromSummary(issue.summary);
    if (!storyId) {
      continue;
    }

    // Check if this story is missing from YAML
    if (!yamlStoryIds.includes(storyId)) {
      missingStories.push({
        ...issue,
        storyId
      });
    }
  }

  return {
    success: true,
    missingStories
  };
}

// ============================================
// AC3: Format report of missing stories
// ============================================

/**
 * Generate a human-readable report of missing stories
 */
export async function formatMissingStoriesReport(
  options: FormatMissingStoriesReportOptions
): Promise<FormatMissingStoriesReportResult> {
  const { missingStories, jiraBaseUrl } = options;

  if (missingStories.length === 0) {
    return {
      success: true,
      report: '✓ All synced - 0 stories missing from sprint YAML'
    };
  }

  const lines: string[] = [];
  lines.push(`Found ${missingStories.length} stories in Jira but not in sprint YAML:\n`);

  for (const story of missingStories) {
    const title = story.summary.replace(/^\d+-\d+:\s*/, '').replace(/^Story\s+\d+-\d+:\s*/i, '');
    let line = `  - ${story.storyId}: ${title}`;
    line += ` [${story.key}]`;
    line += ` (${story.status})`;

    if (jiraBaseUrl) {
      line += `\n    ${jiraBaseUrl}/browse/${story.key}`;
    }

    lines.push(line);
  }

  return {
    success: true,
    report: lines.join('\n')
  };
}

// ============================================
// AC4: Import missing stories to YAML
// ============================================

/**
 * Map Jira status to YAML status
 */
function mapJiraStatusToYaml(jiraStatus: string): string {
  const normalized = jiraStatus.toLowerCase();
  if (normalized === 'done') {
    return 'done';
  }
  if (normalized === 'in progress') {
    return 'in_progress';
  }
  // To Do, Open, Backlog, etc. → backlog
  return 'backlog';
}

/**
 * Import missing stories from Jira into sprint YAML
 */
export async function importMissingStoriesToYaml(
  options: ImportMissingStoriesToYamlOptions
): Promise<ImportMissingStoriesToYamlResult> {
  const { sprintPath, missingStories, targetEpicId, dryRun = false } = options;

  if (!existsSync(sprintPath)) {
    return {
      success: false,
      error: `Sprint file not found: ${sprintPath}`
    };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as {
      sprint?: Record<string, unknown>;
      epics?: Array<{
        id: string;
        title?: string;
        stories?: Array<{
          id: string;
          title?: string;
          status?: string;
          jira?: string;
          points?: number;
        }>;
      }>;
    };

    // Find target epic
    const targetEpic = yaml.epics?.find(e => e.id === targetEpicId);
    if (!targetEpic) {
      return {
        success: false,
        error: `Target epic '${targetEpicId}' not found in sprint YAML`
      };
    }

    // Dry run: just return what would be imported
    if (dryRun) {
      return {
        success: true,
        importedCount: missingStories.length,
        wouldImport: missingStories
      };
    }

    // Ensure stories array exists
    if (!targetEpic.stories) {
      targetEpic.stories = [];
    }

    // Add missing stories
    for (const story of missingStories) {
      const title = story.summary.replace(/^\d+-\d+:\s*/, '').replace(/^Story\s+\d+-\d+:\s*/i, '');
      targetEpic.stories.push({
        id: story.storyId,
        title,
        status: mapJiraStatusToYaml(story.status),
        jira: story.key,
        ...(story.points !== undefined && { points: story.points })
      });
    }

    // Write back
    const updatedContent = stringify(yaml, {
      lineWidth: 0,
      singleQuote: false
    });

    writeFileSync(sprintPath, updatedContent);

    return {
      success: true,
      importedCount: missingStories.length
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update sprint YAML: ${(err as Error).message}`
    };
  }
}
