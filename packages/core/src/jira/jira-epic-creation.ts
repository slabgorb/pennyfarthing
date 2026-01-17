/**
 * jira-epic-creation.ts - Jira Epic Auto-Creation for Story 47-1
 *
 * This module provides functions to automatically create Jira epics
 * when SM setup detects an epic without a jira field in sprint YAML.
 *
 * Acceptance Criteria:
 * 1. SM setup detects new epic without jira field
 * 2. Automatically creates Jira epic with matching title/description
 * 3. Updates sprint YAML with new Jira key
 * 4. Epic number derived from Jira ticket number
 *
 * NOTE: This is a stub implementation. Dev will fill in the actual logic.
 */

export interface CreateEpicParams {
  title: string;
  description?: string;
  epicNumber?: number;
  labels?: string[];
  dryRun?: boolean;
  // Test mocking support
  _mockResponse?: { key: string; url?: string };
  _mockError?: string;
}

export interface CreateEpicResult {
  success: boolean;
  jiraKey?: string;
  url?: string;
  formattedTitle?: string;
  labels?: string[];
  error?: string;
  dryRun?: boolean;
}

export interface EnsureEpicParams {
  epic: {
    id: string;
    title: string;
    description?: string;
    jira?: string | null;
  };
  _mockResponse?: { key: string };
}

export interface EnsureEpicResult {
  success: boolean;
  jiraKey?: string;
  created: boolean;
  formattedTitle?: string;
  description?: string;
  error?: string;
}

export interface UpdateYamlParams {
  sprintPath: string;
  epicId: string;
  jiraKey: string;
  force?: boolean;
}

export interface UpdateYamlResult {
  success: boolean;
  error?: string;
}

export interface CheckEpicJiraParams {
  storyId: string;
  sprintPath: string;
}

export interface CheckEpicJiraResult {
  epicNeedsJira: boolean;
  epicId?: string;
  epicTitle?: string;
}

/**
 * Create an epic in Jira with the given title and description.
 *
 * @param params - Epic creation parameters
 * @returns Result with Jira key on success
 */
export async function createEpicInJira(params: CreateEpicParams): Promise<CreateEpicResult> {
  const { title, description, epicNumber, labels = ['pennyfarthing'], dryRun, _mockResponse, _mockError } = params;

  // Format title with epic number if provided
  const formattedTitle = epicNumber ? `Epic ${epicNumber}: ${title}` : title;

  // Ensure pennyfarthing label is always included
  const finalLabels = labels.includes('pennyfarthing') ? labels : ['pennyfarthing', ...labels];

  // Handle mock error for testing
  if (_mockError) {
    return {
      success: false,
      error: _mockError,
      formattedTitle,
      labels: finalLabels
    };
  }

  // Handle dry-run mode
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      formattedTitle,
      labels: finalLabels
    };
  }

  // Handle mock response for testing
  if (_mockResponse) {
    return {
      success: true,
      jiraKey: _mockResponse.key,
      url: _mockResponse.url,
      formattedTitle,
      labels: finalLabels
    };
  }

  // Real Jira CLI invocation
  try {
    const { execFileSync } = await import('node:child_process');

    // Build the jira CLI args as array to prevent command injection
    const args = [
      'issue', 'create',
      '--project', 'MSSCI',
      '--type', 'Epic',
      '-s', formattedTitle,
      '-b', description || '',
      '-y', 'Medium',
      '--no-input'
    ];

    // Add label args (each -l with its value as separate args)
    for (const label of finalLabels) {
      args.push('-l', label);
    }

    const output = execFileSync('jira', args, { encoding: 'utf-8' });

    // Parse the Jira key from output (format: "OK Issue MSSCI-12345 created")
    const keyMatch = output.match(/([A-Z]+-\d+)/);
    if (!keyMatch) {
      return {
        success: false,
        error: `Could not parse Jira key from output: ${output}`,
        formattedTitle,
        labels: finalLabels
      };
    }

    const jiraKey = keyMatch[1];
    return {
      success: true,
      jiraKey,
      url: `https://1898andco.atlassian.net/browse/${jiraKey}`,
      formattedTitle,
      labels: finalLabels
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      formattedTitle,
      labels: finalLabels
    };
  }
}

/**
 * Ensure an epic has a Jira key, creating one if missing.
 *
 * @param params - Epic to check/create
 * @returns Result with Jira key (existing or newly created)
 */
export async function ensureEpicHasJiraKey(params: EnsureEpicParams): Promise<EnsureEpicResult> {
  const { epic, _mockResponse } = params;

  // Check if epic already has a valid jira key
  if (epic.jira && epic.jira.trim() !== '') {
    return {
      success: true,
      jiraKey: epic.jira,
      created: false
    };
  }

  // Extract epic number from ID (e.g., "epic-47" -> 47)
  const epicNumberMatch = epic.id.match(/(\d+)/);
  const epicNumber = epicNumberMatch ? parseInt(epicNumberMatch[1], 10) : undefined;

  // Format the title with epic number
  const formattedTitle = epicNumber ? `Epic ${epicNumber}: ${epic.title}` : epic.title;

  // Create epic in Jira
  const createResult = await createEpicInJira({
    title: epic.title,
    description: epic.description,
    epicNumber,
    labels: ['pennyfarthing'],
    _mockResponse
  });

  if (!createResult.success) {
    return {
      success: false,
      created: false,
      error: createResult.error
    };
  }

  return {
    success: true,
    jiraKey: createResult.jiraKey,
    created: true,
    formattedTitle,
    description: epic.description
  };
}

/**
 * Extract the numeric portion from a Jira key.
 *
 * @param jiraKey - Jira key like "MSSCI-11796"
 * @returns Numeric portion (11796) or null if invalid
 */
export function extractEpicNumberFromJiraKey(jiraKey: string): number | null {
  if (!jiraKey || typeof jiraKey !== 'string') {
    return null;
  }

  // Trim whitespace before matching to handle trailing newlines etc.
  const trimmed = jiraKey.trim();

  // Match pattern: PROJECT-NUMBER (e.g., MSSCI-11796, TEST-123)
  const match = trimmed.match(/^[A-Z]+-(\d+)$/);
  if (!match) {
    return null;
  }

  return parseInt(match[1], 10);
}

/**
 * Update sprint YAML to add/update the jira field for an epic.
 *
 * @param params - Update parameters
 * @returns Success/failure result
 */
export async function updateSprintYamlWithJiraKey(params: UpdateYamlParams): Promise<UpdateYamlResult> {
  const { sprintPath, epicId, jiraKey, force } = params;

  const { readFileSync, writeFileSync, renameSync } = await import('node:fs');
  const { parse, stringify } = await import('yaml');
  const { join, dirname } = await import('node:path');

  try {
    const content = readFileSync(sprintPath, 'utf-8');
    const sprint = parse(content);

    // Normalize epic ID for comparison (handle both "epic-47" and "47")
    const normalizedEpicId = epicId.replace('epic-', '');

    // Find the epic
    let epicFound = false;
    for (const epic of sprint.epics || []) {
      const currentEpicId = String(epic.id).replace('epic-', '');

      if (currentEpicId === normalizedEpicId) {
        epicFound = true;

        // Check if epic already has jira key
        if (epic.jira && !force) {
          return {
            success: false,
            error: `Epic ${epicId} already has jira key: ${epic.jira}`
          };
        }

        // Add/update the jira field
        epic.jira = jiraKey;
        break;
      }
    }

    if (!epicFound) {
      return {
        success: false,
        error: `Epic ${epicId} not found in sprint YAML`
      };
    }

    // Atomic write: write to temp file, then rename
    const updatedContent = stringify(sprint, { lineWidth: 0 });
    const tempPath = join(dirname(sprintPath), `.sprint-yaml-${Date.now()}.tmp`);
    writeFileSync(tempPath, updatedContent);
    renameSync(tempPath, sprintPath);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if an epic needs a Jira key during story setup.
 *
 * @param params - Story and sprint path
 * @returns Whether epic needs Jira key and epic details
 */
export async function checkEpicJiraRequired(params: CheckEpicJiraParams): Promise<CheckEpicJiraResult> {
  const { storyId, sprintPath } = params;

  // Read and parse sprint YAML
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('yaml');

  const content = readFileSync(sprintPath, 'utf-8');
  const sprint = parse(content);

  // Extract epic number from story ID (e.g., "48-1" -> "48")
  const epicNumber = storyId.split('-')[0];

  // Find the epic containing this story
  for (const epic of sprint.epics || []) {
    const epicId = String(epic.id);
    // Match "epic-48" or "48"
    const epicNum = epicId.replace('epic-', '');

    if (epicNum === epicNumber) {
      // Check if epic has jira field
      const hasJira = epic.jira && epic.jira.trim() !== '';

      return {
        epicNeedsJira: !hasJira,
        epicId: epicId,
        epicTitle: epic.title
      };
    }
  }

  // Epic not found - shouldn't happen but return safe default
  return {
    epicNeedsJira: false
  };
}
