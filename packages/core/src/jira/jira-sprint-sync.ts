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
// AC4: Local sprint name matches Jira sprint
// ============================================

export interface ValidateSprintAlignmentOptions {
  sprintPath: string;
  _mockJiraSprint?: JiraSprintInfo | null;
  _mockError?: string;
}

export interface ValidateSprintAlignmentResult extends SprintSyncResult {
  aligned?: boolean;
  localSprintName?: string;
  jiraSprintId?: number;
  jiraSprintName?: string;
}

/**
 * Validate that local sprint name matches Jira sprint name
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
        name?: string;
        jira_sprint_id?: number;
        jira_sprint_name?: string;
        status?: string;
      };
    };

    const localSprintName = yaml.sprint?.jira_sprint_name || yaml.sprint?.name;
    const jiraSprintId = yaml.sprint?.jira_sprint_id;
    const localStatus = yaml.sprint?.status;

    // Check if jira_sprint_id is configured
    if (jiraSprintId === undefined) {
      return {
        success: false,
        error: 'Sprint jira_sprint_id not configured',
        localSprintName
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
        localSprintName,
        jiraSprintId
      };
    }

    // Check for state mismatch (local active but Jira closed)
    if (localStatus === 'active' && jiraSprint.state === 'closed') {
      return {
        success: true,
        aligned: false,
        localSprintName,
        jiraSprintId,
        jiraSprintName: jiraSprint.name,
        warning: `Sprint mismatch: local is active but Jira sprint is closed`
      };
    }

    // Check for name mismatch
    if (localSprintName && jiraSprint.name !== localSprintName) {
      return {
        success: true,
        aligned: false,
        localSprintName,
        jiraSprintId,
        jiraSprintName: jiraSprint.name,
        warning: `Sprint name mismatch: local is "${localSprintName}", Jira is "${jiraSprint.name}"`
      };
    }

    // All checks passed - aligned
    return {
      success: true,
      aligned: true,
      localSprintName,
      jiraSprintId,
      jiraSprintName: jiraSprint.name
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

// ============================================
// Story Sprint Membership Sync (Bidirectional)
// ============================================

export interface StorySprintMembership {
  storyId: string;
  jiraKey: string;
  inSprint: boolean;
  jiraSprintId?: number;
}

export interface SyncStorySprintMembershipOptions {
  sprintPath: string;
  jiraSprintId: number;
  _mockJiraIssues?: SprintIssue[];
  _mockError?: string;
}

export interface SyncStorySprintMembershipResult extends SprintSyncResult {
  updated?: number;
  added?: string[];
  removed?: string[];
  unchanged?: number;
}

/**
 * Sync story sprint membership between YAML and Jira
 *
 * Direction: Jira → YAML
 * - Stories in Jira sprint get in_sprint: true
 * - Stories not in Jira sprint get in_sprint: false
 */
export async function syncStorySprintMembershipFromJira(
  options: SyncStorySprintMembershipOptions
): Promise<SyncStorySprintMembershipResult> {
  const { sprintPath, jiraSprintId, _mockJiraIssues, _mockError } = options;

  if (_mockError) {
    return { success: false, error: _mockError };
  }

  if (!existsSync(sprintPath)) {
    return { success: false, error: `Sprint file not found: ${sprintPath}` };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as {
      sprint?: { jira_sprint_id?: number };
      epics?: Array<{
        id: string;
        stories?: Array<{
          id: string;
          jira?: string;
          in_sprint?: boolean;
        }>;
      }>;
    };

    // Get issues in Jira sprint
    let jiraIssueKeys: Set<string>;
    if (_mockJiraIssues !== undefined) {
      jiraIssueKeys = new Set(_mockJiraIssues.map(i => i.key));
    } else {
      // Real implementation would call: jira sprint list {sprintId} --plain
      return {
        success: false,
        error: 'Real Jira API not yet implemented - use _mockJiraIssues for testing'
      };
    }

    const added: string[] = [];
    const removed: string[] = [];
    let unchanged = 0;

    // Update in_sprint for each story
    if (yaml.epics) {
      for (const epic of yaml.epics) {
        if (epic.stories) {
          for (const story of epic.stories) {
            const jiraKey = story.jira || story.id;
            const inJiraSprint = jiraIssueKeys.has(jiraKey);
            const wasInSprint = story.in_sprint === true;

            if (inJiraSprint && !wasInSprint) {
              story.in_sprint = true;
              added.push(jiraKey);
            } else if (!inJiraSprint && wasInSprint) {
              story.in_sprint = false;
              removed.push(jiraKey);
            } else {
              unchanged++;
            }
          }
        }
      }
    }

    // Write back if changes were made
    if (added.length > 0 || removed.length > 0) {
      const updatedContent = stringify(yaml, {
        lineWidth: 0,
        singleQuote: false
      });
      writeFileSync(sprintPath, updatedContent);
    }

    return {
      success: true,
      updated: added.length + removed.length,
      added,
      removed,
      unchanged
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to sync sprint membership: ${(err as Error).message}`
    };
  }
}

export interface AddStoryToJiraSprintOptions {
  jiraKey: string;
  sprintId: number;
  _mockSuccess?: boolean;
  _mockError?: string;
}

export interface AddStoryToJiraSprintResult extends SprintSyncResult {
  added?: boolean;
}

/**
 * Add a story to a Jira sprint
 *
 * Direction: YAML → Jira
 * Uses: jira sprint add {sprintId} {jiraKey}
 */
export async function addStoryToJiraSprint(
  options: AddStoryToJiraSprintOptions
): Promise<AddStoryToJiraSprintResult> {
  const { jiraKey, sprintId, _mockSuccess, _mockError } = options;

  if (_mockError) {
    return { success: false, error: _mockError };
  }

  if (_mockSuccess !== undefined) {
    return { success: _mockSuccess, added: _mockSuccess };
  }

  // Real implementation would call: jira sprint add {sprintId} {jiraKey}
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockSuccess for testing'
  };
}

export interface RemoveStoryFromJiraSprintOptions {
  jiraKey: string;
  _mockSuccess?: boolean;
  _mockError?: string;
}

export interface RemoveStoryFromJiraSprintResult extends SprintSyncResult {
  removed?: boolean;
}

/**
 * Remove a story from its current Jira sprint (move to backlog)
 *
 * Direction: YAML → Jira
 * Uses: jira issue edit {jiraKey} --sprint "" or move to backlog
 */
export async function removeStoryFromJiraSprint(
  options: RemoveStoryFromJiraSprintOptions
): Promise<RemoveStoryFromJiraSprintResult> {
  const { jiraKey, _mockSuccess, _mockError } = options;

  if (_mockError) {
    return { success: false, error: _mockError };
  }

  if (_mockSuccess !== undefined) {
    return { success: _mockSuccess, removed: _mockSuccess };
  }

  // Real implementation would move story to backlog
  return {
    success: false,
    error: 'Real Jira API not yet implemented - use _mockSuccess for testing'
  };
}

export interface SyncStorySprintMembershipToJiraOptions {
  sprintPath: string;
  jiraSprintId: number;
  dryRun?: boolean;
  _mockAddSuccess?: boolean;
  _mockRemoveSuccess?: boolean;
  _mockError?: string;
}

export interface SyncStorySprintMembershipToJiraResult extends SprintSyncResult {
  toAdd?: string[];
  toRemove?: string[];
  added?: string[];
  removed?: string[];
  failed?: string[];
}

/**
 * Sync story sprint membership from YAML to Jira
 *
 * Direction: YAML → Jira
 * - Stories with in_sprint: true are added to Jira sprint
 * - Stories with in_sprint: false are removed from Jira sprint
 */
export async function syncStorySprintMembershipToJira(
  options: SyncStorySprintMembershipToJiraOptions
): Promise<SyncStorySprintMembershipToJiraResult> {
  const {
    sprintPath,
    jiraSprintId,
    dryRun = false,
    _mockAddSuccess,
    _mockRemoveSuccess,
    _mockError
  } = options;

  if (_mockError) {
    return { success: false, error: _mockError };
  }

  if (!existsSync(sprintPath)) {
    return { success: false, error: `Sprint file not found: ${sprintPath}` };
  }

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const yaml = parse(content) as {
      sprint?: { jira_sprint_id?: number };
      epics?: Array<{
        id: string;
        stories?: Array<{
          id: string;
          jira?: string;
          in_sprint?: boolean;
        }>;
      }>;
    };

    const toAdd: string[] = [];
    const toRemove: string[] = [];

    // Collect stories that need sprint membership changes
    if (yaml.epics) {
      for (const epic of yaml.epics) {
        if (epic.stories) {
          for (const story of epic.stories) {
            const jiraKey = story.jira || story.id;
            // Only process stories with explicit in_sprint field
            if (story.in_sprint === true) {
              toAdd.push(jiraKey);
            } else if (story.in_sprint === false) {
              toRemove.push(jiraKey);
            }
          }
        }
      }
    }

    // Dry run: just return what would be done
    if (dryRun) {
      return {
        success: true,
        toAdd,
        toRemove
      };
    }

    // Execute changes
    const added: string[] = [];
    const removed: string[] = [];
    const failed: string[] = [];

    for (const jiraKey of toAdd) {
      const result = await addStoryToJiraSprint({
        jiraKey,
        sprintId: jiraSprintId,
        _mockSuccess: _mockAddSuccess
      });
      if (result.success) {
        added.push(jiraKey);
      } else {
        failed.push(jiraKey);
      }
    }

    for (const jiraKey of toRemove) {
      const result = await removeStoryFromJiraSprint({
        jiraKey,
        _mockSuccess: _mockRemoveSuccess
      });
      if (result.success) {
        removed.push(jiraKey);
      } else {
        failed.push(jiraKey);
      }
    }

    return {
      success: failed.length === 0,
      toAdd,
      toRemove,
      added,
      removed,
      failed: failed.length > 0 ? failed : undefined
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to sync sprint membership to Jira: ${(err as Error).message}`
    };
  }
}
