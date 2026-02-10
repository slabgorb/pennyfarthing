import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

// Workflow phase with status - used for both dynamic YAML phases and legacy TDD flow
export interface WorkflowPhase {
  name: string;        // Phase name (e.g., 'setup', 'red', 'green', or agent name for legacy)
  agent: string;       // Agent that handles this phase
  label: string;       // Display label
  status: 'done' | 'current' | 'pending';
}

// Legacy alias for backward compatibility (StoryInfo.workflow uses this)
export type WorkflowStep = WorkflowPhase;

// Acceptance criteria item
export interface CriteriaItem {
  text: string;
  completed: boolean;
}

// MSSCI-12475: Sprint story for expandable story section
export interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled';
  jiraKey: string | null;
  jiraUrl: string | null;
}

// MSSCI-12475: Epic context for expandable story section
export interface EpicContext {
  id: string;
  title: string;
  jiraKey: string | null;
  jiraUrl: string | null;
  stories: SprintStory[];
}

// Jira base URL for generating browse links
const JIRA_BASE_URL = 'https://1898andco.atlassian.net/browse';

// Generate Jira URL from key
function generateJiraUrl(jiraKey: string | null): string | null {
  if (!jiraKey || !jiraKey.startsWith('MSSCI-')) {
    return null;
  }
  return `${JIRA_BASE_URL}/${jiraKey}`;
}

// MSSCI-14301: Available workflow summary for discovery panel
export interface AvailableWorkflow {
  name: string;
  type: 'phased' | 'stepped';
  description: string;
  triggers?: {
    types?: string[];
    tags?: string[];
    points?: { min?: number; max?: number };
    default?: boolean;
  };
}

// Story info interface (enhanced with workflow details)
export interface StoryInfo {
  id: string | null;
  title: string | null;
  phase: string | null;
  status: string | null;
  points: number | null;
  sprint: {
    number: number;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string | null;
  } | null;
  nextAgent: string | null;        // Next agent in workflow
  workflow: WorkflowStep[] | null; // TDD flow progress
  pr: string | null;               // PR number (e.g., "32")
  branch: string | null;           // Feature branch name
  criteria: CriteriaItem[] | null; // Acceptance criteria checklist
  workflowType: string | null;    // MSSCI-14300: 'phased' or 'stepped'
  // MSSCI-12475: Expandable story section data
  sprintStories: SprintStory[] | null;  // All stories in current sprint
  epicContext: EpicContext | null;       // Current story's epic with siblings
  jiraUrl: string | null;                // Jira URL for current story
  // MSSCI-14301: Available workflows for discovery panel
  availableWorkflows: AvailableWorkflow[] | null;
}

// Parse session file for story info
// projectDir is optional but required for dynamic workflow phase detection
export function parseSessionFile(content: string, projectDir?: string): Partial<StoryInfo> {
  const result: Partial<StoryInfo> = {};

  // MSSCI-12552: Extract from list-item format FIRST (SM setup session files)
  // This is the most common format: - Story: MSSCI-12552
  // Must be checked before header format to avoid matching documentation examples
  const listStoryMatch = content.match(/^-\s*Story:\s*(.+)$/m);
  if (listStoryMatch) {
    result.id = listStoryMatch[1].trim();
  }

  // Extract title from list-item format: - Title: Some title here
  const listTitleMatch = content.match(/^-\s*Title:\s*(.+)$/m);
  if (listTitleMatch) {
    result.title = listTitleMatch[1].trim();
  }

  // Fall back to header format if list format not found
  // Formats supported:
  //   # Story 15-3: Title (colon separator)
  //   # Story 15-3 Session (with "Story" prefix)
  //   # MSSCI-12552 Session (new format - ID only, no "Story" prefix)
  if (!result.id) {
    const headerMatch = content.match(/^#\s*Story\s+([\w-]+):\s*(.+)$/m) ||
                        content.match(/^#\s*Story\s+([\w-]+)\s+Session$/m) ||
                        content.match(/^#\s+([\w-]+)\s+Session$/m);
    if (headerMatch) {
      result.id = headerMatch[1];
      // For header format with title in same line
      if (!result.title && headerMatch[2]) {
        result.title = headerMatch[2].trim();
      }
    }
  }

  // Fallback: extract ID from **Story:** field if not found in header
  if (!result.id) {
    const storyFieldMatch = content.match(/\*\*Story:\*\*\s*([\w-]+)/);
    if (storyFieldMatch) {
      result.id = storyFieldMatch[1].trim();
    }
  }

  // Try **Title:** field if still no title
  if (!result.title) {
    const boldTitleMatch = content.match(/\*\*Title:\*\*\s*(.+)$/m);
    if (boldTitleMatch) {
      result.title = boldTitleMatch[1].trim();
    }
  }

  // Also extract from table format: | **Story** | MSSCI-12400 |
  if (!result.id) {
    const tableStoryMatch = content.match(/\|\s*\*?\*?Story\*?\*?\s*\|\s*([^|]+)/i);
    if (tableStoryMatch) {
      result.id = tableStoryMatch[1].trim();
    }
  }

  // Extract title from table format: | **Title** | Some title |
  if (!result.title) {
    const tableTitleMatch = content.match(/\|\s*\*?\*?Title\*?\*?\s*\|\s*([^|]+)/i);
    if (tableTitleMatch) {
      result.title = tableTitleMatch[1].trim();
    }
  }

  // Extract phase: **Phase:** dev or **Phase:** TEA (RED complete) -> Dev (GREEN)
  // Also check table format: | Phase | dev | or | **Phase** | dev |
  // Also check list-item format: - Phase: red (MSSCI-12552)
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*(\w+)/i) ||
                     content.match(/\|\s*\*?\*?Phase\*?\*?\s*\|\s*(\w+)/i) ||
                     content.match(/^-\s*Phase:\s*(\w+)/m);
  if (phaseMatch) {
    result.phase = phaseMatch[1].toLowerCase();
  }

  // Extract status: ## Status: IN_PROGRESS
  const statusMatch = content.match(/##\s*Status:\s*(\S+)/i);
  if (statusMatch) {
    result.status = statusMatch[1].toLowerCase();
  }

  // Extract points: **Points:** 3
  const pointsMatch = content.match(/\*\*Points:\*\*\s*(\d+)/);
  if (pointsMatch) {
    result.points = parseInt(pointsMatch[1], 10);
  }

  // Extract next agent from "Current Agent" table or "Handoff:" lines
  // Table format: | Current Agent | Reviewer (handoff to SM) |
  // Or from last "**Handoff:**" line
  const currentAgentMatch = content.match(/\|\s*Current Agent\s*\|\s*([^|]+)/i);
  if (currentAgentMatch) {
    result.nextAgent = currentAgentMatch[1].trim();
  } else {
    // Look for the last "Handoff:" line in the file
    const handoffMatches = content.match(/\*\*Handoff:\*\*\s*(.+)$/gm);
    if (handoffMatches && handoffMatches.length > 0) {
      const lastHandoff = handoffMatches[handoffMatches.length - 1];
      const handoffText = lastHandoff.replace(/\*\*Handoff:\*\*\s*/, '').trim();
      result.nextAgent = handoffText;
    }
  }

  // Extract branch from "## Branch" section, **Branch:** line, **Feature Branch:** line
  // Also check list-item format: - Branch: feature/... (MSSCI-12552)
  const branchMatch = content.match(/^##\s*Branch\s*\n`([^`]+)`/m) ||
                      content.match(/\*\*Feature Branch:\*\*\s*`?([^`\n]+)`?/) ||
                      content.match(/\*\*Branch:\*\*\s*`?([^`\n]+)`?/) ||
                      content.match(/^-\s*Branch:\s*(.+)$/m);
  if (branchMatch) {
    result.branch = branchMatch[1].trim();
  }

  // Extract PR number from **PR:** line
  // Formats: **PR:** #32, **PR:** 32, **PR:** N/A, **PR:** #{number}
  const prMatch = content.match(/\*\*PR:\*\*\s*#?(\d+)/);
  if (prMatch) {
    result.pr = prMatch[1];
  }

  // Parse workflow progress (uses projectDir for dynamic YAML-based phases)
  result.workflow = parseWorkflowProgress(content, projectDir);

  // MSSCI-14300: Detect workflow type from phase names
  if (result.workflow && result.workflow.length > 0) {
    const allStepped = result.workflow.every(p => p.name.startsWith('step-'));
    result.workflowType = allStepped ? 'stepped' : 'phased';
  }

  // Parse acceptance criteria checkboxes
  result.criteria = parseAcceptanceCriteria(content);

  return result;
}

// Parse acceptance criteria checkboxes into structured data
export function parseAcceptanceCriteria(content: string): CriteriaItem[] | null {
  // Look for acceptance criteria section
  const criteriaSection = content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (!criteriaSection) {
    return null;
  }

  const criteria: CriteriaItem[] = [];
  const lines = criteriaSection[1].split('\n');

  for (const line of lines) {
    // Match checkbox items: - [ ] text or - [x] text or - [X] text
    const match = line.match(/^- \[([ xX])\] (.+)$/);
    if (match) {
      const completed = match[1].toLowerCase() === 'x';
      const text = match[2].trim();
      criteria.push({ text, completed });
    }
  }

  return criteria.length > 0 ? criteria : null;
}

// Parse workflow progress checkboxes into structured data
// If projectDir is provided, reads dynamic phases from workflow YAML
// Otherwise falls back to hardcoded TDD flow for backward compatibility
export function parseWorkflowProgress(content: string, projectDir?: string): WorkflowPhase[] | null {
  // Try to extract workflow name from session content
  // Workflow names can contain hyphens (e.g., docs-only, custom-flow)
  // Also check list-item format: - Workflow: tdd (MSSCI-12552)
  const workflowMatch = content.match(/\*\*Workflow:\*\*\s*([\w-]+)/i) ||
                        content.match(/^-\s*Workflow:\s*([\w-]+)/m);
  const workflowName = workflowMatch?.[1]?.toLowerCase();

  // Try to extract current phase from session content
  // Also check list-item format: - Phase: red (MSSCI-12552)
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*(\w+)/i) ||
                     content.match(/^-\s*Phase:\s*(\w+)/m);
  const currentPhase = phaseMatch?.[1]?.toLowerCase();

  // If projectDir provided and workflow specified, use dynamic phases
  if (projectDir && workflowName) {
    const phases = getWorkflowPhases(workflowName, projectDir);
    if (phases) {
      // For stepped workflows, derive status from Current Step and Steps Completed
      const currentStepMatch = content.match(/\*\*Current Step:\*\*\s*(\d+)/i) ||
                               content.match(/^-\s*Current Step:\s*(\d+)/m);
      if (currentStepMatch) {
        const currentStep = parseInt(currentStepMatch[1], 10);
        const completedMatch = content.match(/\*\*Steps Completed:\*\*\s*\[([^\]]*)\]/i) ||
                               content.match(/^-\s*Steps Completed:\s*\[([^\]]*)\]/m);
        const completedSteps = new Set<number>();
        if (completedMatch && completedMatch[1].trim()) {
          completedMatch[1].split(',').forEach(s => {
            const n = parseInt(s.trim(), 10);
            if (!isNaN(n)) completedSteps.add(n);
          });
        }
        return phases.map((phase, index) => {
          const stepNum = index + 1;
          let status: 'done' | 'current' | 'pending';
          if (completedSteps.has(stepNum)) {
            status = 'done';
          } else if (stepNum === currentStep) {
            status = 'current';
          } else if (stepNum < currentStep) {
            // Steps before current are implicitly done
            status = 'done';
          } else {
            status = 'pending';
          }
          return { ...phase, status };
        });
      }
      // Fall back to phased workflow status resolution
      return buildWorkflowWithStatus(phases, content, currentPhase);
    }
  }

  // Fall back to checkbox-based parsing for backward compatibility
  const workflowSection = content.match(/## Workflow Progress\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (!workflowSection) {
    return null;
  }

  // Check for any workflow checkbox patterns (SM: or SM -)
  const checkboxLines = workflowSection[1].match(/- \[\s*[xX\s]\s*\]\s*\w+\s*[:\-]/gi);
  if (!checkboxLines || checkboxLines.length === 0) {
    return null;
  }

  // Define the standard TDD flow agents
  const agentOrder = ['sm', 'tea', 'dev', 'reviewer'];
  const agentLabels: Record<string, string> = {
    sm: 'SM',
    tea: 'TEA',
    dev: 'Dev',
    reviewer: 'Reviewer'
  };

  // Track which agents are done
  const agentStatus: Record<string, 'done' | 'pending'> = {};

  // Parse all checkbox lines to determine completion
  // Supports both formats: "- [x] SM: ..." and "- [x] SM - ..."
  const allLines = workflowSection[1].split('\n');
  for (const line of allLines) {
    const match = line.match(/- \[\s*([xX\s])\s*\]\s*(\w+)\s*[:\-]/i);
    if (match) {
      const isDone = match[1].toLowerCase() === 'x';
      const agent = match[2].toLowerCase();
      // An agent is "done" if ALL their checkboxes are checked
      // For simplicity, mark done if any checkbox is checked
      if (isDone) {
        agentStatus[agent] = 'done';
      } else if (!agentStatus[agent]) {
        agentStatus[agent] = 'pending';
      }
    }
  }

  // Build workflow array with current agent detection
  const workflow: WorkflowPhase[] = [];
  let foundCurrent = false;

  for (const agent of agentOrder) {
    let status: 'done' | 'current' | 'pending';

    if (agentStatus[agent] === 'done') {
      status = 'done';
    } else if (!foundCurrent) {
      // First non-done agent is current
      status = 'current';
      foundCurrent = true;
    } else {
      status = 'pending';
    }

    workflow.push({
      name: agent,  // Use agent as name for backward compat
      agent,
      label: agentLabels[agent],
      status
    });
  }

  return workflow;
}

// Build workflow phases with status based on session content
function buildWorkflowWithStatus(
  phases: Omit<WorkflowPhase, 'status'>[],
  content: string,
  currentPhase?: string
): WorkflowPhase[] {
  // Parse Phase History table to determine which phases are complete
  const completedPhases = new Set<string>();
  const historyMatch = content.match(/### Phase History\n[\s\S]*?\|[\s\S]*?\|[\s\S]*?\|([\s\S]*?)(?=\n##|\n$|$)/);

  if (historyMatch) {
    // Parse table rows to find completed phases (those with end time)
    const rows = historyMatch[1].split('\n').filter(line => line.includes('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim());
      // Format: | phase | started | ended | duration |
      if (cols.length >= 4) {
        const phaseName = cols[1]?.toLowerCase();
        const ended = cols[3];
        // Phase is complete if it has an end time (not '-' or empty)
        if (phaseName && ended && ended !== '-' && ended !== '') {
          completedPhases.add(phaseName);
        }
      }
    }
  }

  // Find current phase index
  let currentPhaseIndex = -1;
  if (currentPhase) {
    // Try to match by phase name first, then by agent name
    currentPhaseIndex = phases.findIndex(
      p => p.name.toLowerCase() === currentPhase || p.agent.toLowerCase() === currentPhase
    );
  }

  // Build workflow with status
  return phases.map((phase, index) => {
    let status: 'done' | 'current' | 'pending';

    if (completedPhases.has(phase.name.toLowerCase())) {
      status = 'done';
    } else if (index === currentPhaseIndex) {
      status = 'current';
    } else if (currentPhaseIndex >= 0 && index < currentPhaseIndex) {
      // Phases before current are done (even if not in history table)
      status = 'done';
    } else {
      status = 'pending';
    }

    return {
      ...phase,
      status
    };
  });
}

// Parse sprint YAML for progress
// Returns done points, remaining points, in-progress points, and end date
export function parseSprintYaml(content: string): StoryInfo['sprint'] | null {
  try {
    const data = parseYaml(content);

    // Extract sprint number (either from sprint.number or sprint.name)
    let sprintNumber = 0;
    if (data?.sprint?.number) {
      sprintNumber = data.sprint.number;
    } else if (data?.sprint?.name) {
      const nameMatch = data.sprint.name.match(/(\d+)/);
      sprintNumber = nameMatch ? parseInt(nameMatch[1], 10) : 0;
    }

    // No valid sprint data
    if (!data?.sprint) {
      return null;
    }

    // Calculate points by iterating over epics/stories
    let donePoints = 0;
    let remainingPoints = 0;
    let inProgressPoints = 0;

    if (data?.epics && Array.isArray(data.epics)) {
      for (const epic of data.epics) {
        if (epic?.stories && Array.isArray(epic.stories)) {
          for (const story of epic.stories) {
            const points = story?.points && typeof story.points === 'number' ? story.points : 0;
            const status = story?.status || 'backlog';

            const isDone = status === 'done' || status === 'completed';
            const isTodo = status === 'backlog' || status === 'ready' || status === null;

            if (isDone) {
              donePoints += points;
            } else if (status === 'in_progress') {
              inProgressPoints += points;
            } else if (isTodo) {
              remainingPoints += points;
            }
          }
        }
      }
    }

    // Stories are the source of truth - calculated values above are authoritative
    // (Summary header values may be stale)

    return {
      number: sprintNumber,
      done: donePoints,
      remaining: remainingPoints,
      inProgress: inProgressPoints,
      endDate: data.sprint.end_date || null,
    };
  } catch {
    // Malformed YAML
  }
  return null;
}

// MSSCI-12475: Parse sprint YAML to get all stories from all epics
export function getSprintStories(sprintContent: string): SprintStory[] | null {
  try {
    const data = parseYaml(sprintContent);
    if (!data?.epics || !Array.isArray(data.epics)) {
      return [];
    }

    const stories: SprintStory[] = [];
    for (const epic of data.epics) {
      if (epic?.stories && Array.isArray(epic.stories)) {
        for (const story of epic.stories) {
          const storyId = story?.id || '';
          // Determine Jira key - use story ID if it looks like a Jira key
          const jiraKey = storyId.startsWith('MSSCI-') ? storyId : null;

          stories.push({
            id: storyId,
            title: story?.title || '',
            points: typeof story?.points === 'number' ? story.points : 0,
            status: normalizeStoryStatus(story?.status),
            jiraKey,
            jiraUrl: generateJiraUrl(jiraKey),
          });
        }
      }
    }
    return stories;
  } catch {
    // Malformed YAML
    return null;
  }
}

// MSSCI-12475: Get epic context for a specific story
export function getEpicContext(sprintContent: string, storyId: string): EpicContext | null {
  try {
    const data = parseYaml(sprintContent);
    if (!data?.epics || !Array.isArray(data.epics)) {
      return null;
    }

    // Find the epic containing this story
    for (const epic of data.epics) {
      if (!epic?.stories || !Array.isArray(epic.stories)) {
        continue;
      }

      const storyInEpic = epic.stories.find((s: { id?: string }) => s?.id === storyId);
      if (storyInEpic) {
        // Found the epic - build context
        const epicJiraKey = epic?.jira || null;
        const stories: SprintStory[] = epic.stories.map((s: { id?: string; title?: string; points?: number; status?: string }) => {
          const sId = s?.id || '';
          const sJiraKey = sId.startsWith('MSSCI-') ? sId : null;
          return {
            id: sId,
            title: s?.title || '',
            points: typeof s?.points === 'number' ? s.points : 0,
            status: normalizeStoryStatus(s?.status),
            jiraKey: sJiraKey,
            jiraUrl: generateJiraUrl(sJiraKey),
          };
        });

        return {
          id: epic?.id || '',
          title: epic?.title || '',
          jiraKey: epicJiraKey,
          jiraUrl: generateJiraUrl(epicJiraKey),
          stories,
        };
      }
    }

    // Story not found in any epic
    return null;
  } catch {
    // Malformed YAML
    return null;
  }
}

// Normalize story status to valid enum values
function normalizeStoryStatus(status: string | undefined | null): 'backlog' | 'in_progress' | 'done' | 'cancelled' {
  if (!status) return 'backlog';
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'done':
    case 'completed':
      return 'done';
    case 'in_progress':
    case 'in-progress':
    case 'active':
      return 'in_progress';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'backlog';
  }
}

// Get workflow phases from workflow YAML definition
// Checks multiple locations: .pennyfarthing/workflows/, .claude/workflows/, pennyfarthing-dist/workflows/
// Supports both flat-file workflows (tdd.yaml) and subdirectory workflows (epics-and-stories/workflow.yaml)
export function getWorkflowPhases(workflowName: string, projectDir: string): Omit<WorkflowPhase, 'status'>[] | null {
  try {
    const workflowDirs = [
      // 1. Runtime via symlinks: .pennyfarthing/workflows/ (orchestrator pattern)
      join(projectDir, '.pennyfarthing', 'workflows'),
      // 2. Legacy: .claude/workflows/
      join(projectDir, '.claude', 'workflows'),
      // 3. Monorepo/dev: pennyfarthing-dist/workflows/
      join(projectDir, 'pennyfarthing-dist', 'workflows'),
    ];

    // Look for workflow YAML: flat file first, then subdirectory pattern
    const searchPaths: string[] = [];
    for (const dir of workflowDirs) {
      searchPaths.push(join(dir, `${workflowName}.yaml`));
      searchPaths.push(join(dir, workflowName, 'workflow.yaml'));
    }

    let workflowPath: string | null = null;
    for (const path of searchPaths) {
      if (existsSync(path)) {
        workflowPath = path;
        break;
      }
    }

    if (!workflowPath) {
      return null;
    }

    const content = readFileSync(workflowPath, 'utf-8');
    const data = parseYaml(content);

    // Support both flat structure (phases:) and nested structure (workflow.phases:)
    const phases = data?.workflow?.phases || data?.phases;
    if (phases && Array.isArray(phases)) {
      // Phased workflow (tdd, trivial, bdd, etc.)
      return phases.map((phase: { name: string; agent: string; label?: string }) => ({
        name: phase.name,
        agent: phase.agent,
        label: phase.label || phase.name,
      }));
    }

    // Stepped workflow (epics-and-stories, prd, research, etc.)
    // Derive phases from step files in the steps/ directory
    const workflowType = data?.workflow?.type || data?.type;
    if (workflowType === 'stepped') {
      const stepsDir = join(workflowPath, '..', 'steps');
      if (existsSync(stepsDir)) {
        const agent = data?.workflow?.agent || data?.agent || 'unknown';
        const stepFiles = readdirSync(stepsDir)
          .filter((f: string) => f.match(/^step-\d+.*\.md$/))
          .sort();

        if (stepFiles.length > 0) {
          return stepFiles.map((file: string) => {
            // Extract step number and name from filename: step-01-validate-prerequisites.md
            const match = file.match(/^step-(\d+)-(.+)\.md$/);
            const stepNum = match ? match[1] : '?';
            const _stepName = match ? match[2].replace(/-/g, ' ') : file;
            return {
              name: `step-${stepNum}`,
              agent,
              label: `Step ${parseInt(stepNum, 10)}`,
            };
          });
        }
      }
    }

    return null;
  } catch {
    // Malformed YAML or read error
    return null;
  }
}

// MSSCI-14301: Enumerate all available workflows from disk
// Searches same 3 directories as getWorkflowPhases, discovers both flat and subdirectory workflows
export function getAvailableWorkflows(projectDir: string): AvailableWorkflow[] {
  const workflows: AvailableWorkflow[] = [];
  const seen = new Set<string>();

  const workflowDirs = [
    join(projectDir, '.pennyfarthing', 'workflows'),
    join(projectDir, '.claude', 'workflows'),
    join(projectDir, 'pennyfarthing-dist', 'workflows'),
  ];

  for (const dir of workflowDirs) {
    if (!existsSync(dir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry);

      try {
        // Flat YAML file (e.g., tdd.yaml)
        if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
          const content = readFileSync(entryPath, 'utf-8');
          const data = parseYaml(content);
          const wf = data?.workflow;
          if (!wf?.name || seen.has(wf.name)) continue;
          seen.add(wf.name);

          const type: 'phased' | 'stepped' = wf.type === 'stepped' ? 'stepped' : 'phased';
          const result: AvailableWorkflow = {
            name: wf.name,
            type,
            description: wf.description ?? '',
          };
          if (wf.triggers) {
            const triggers: AvailableWorkflow['triggers'] = {};
            if (wf.triggers.types) triggers.types = wf.triggers.types;
            if (wf.triggers.tags) triggers.tags = wf.triggers.tags;
            if (wf.triggers.points) triggers.points = wf.triggers.points;
            if (wf.triggers.default !== undefined) triggers.default = wf.triggers.default;
            result.triggers = triggers;
          }
          workflows.push(result);
        }
        // Subdirectory workflow (e.g., architecture/workflow.yaml)
        else if (statSync(entryPath).isDirectory()) {
          const subYaml = join(entryPath, 'workflow.yaml');
          if (!existsSync(subYaml)) continue;

          const content = readFileSync(subYaml, 'utf-8');
          const data = parseYaml(content);
          const wf = data?.workflow;
          if (!wf?.name || seen.has(wf.name)) continue;
          seen.add(wf.name);

          const type: 'phased' | 'stepped' = wf.type === 'stepped' ? 'stepped' : 'phased';
          const result: AvailableWorkflow = {
            name: wf.name,
            type,
            description: wf.description ?? '',
          };
          if (wf.triggers) {
            const triggers: AvailableWorkflow['triggers'] = {};
            if (wf.triggers.types) triggers.types = wf.triggers.types;
            if (wf.triggers.tags) triggers.tags = wf.triggers.tags;
            if (wf.triggers.points) triggers.points = wf.triggers.points;
            if (wf.triggers.default !== undefined) triggers.default = wf.triggers.default;
            result.triggers = triggers;
          }
          workflows.push(result);
        }
      } catch {
        // Skip malformed files
        continue;
      }
    }
  }

  return workflows;
}

// Get story info from session files
export function getStoryInfo(projectDir: string): StoryInfo {
  const nullResult: StoryInfo = {
    id: null,
    title: null,
    phase: null,
    status: null,
    points: null,
    sprint: null,
    nextAgent: null,
    workflow: null,
    pr: null,
    branch: null,
    criteria: null,
    workflowType: null,
    // MSSCI-12475: Expandable story section
    sprintStories: null,
    epicContext: null,
    jiraUrl: null,
    // MSSCI-14301: Available workflows
    availableWorkflows: null,
  };

  try {
    // Find session files
    const sessionDir = join(projectDir, '.session');
    if (!existsSync(sessionDir)) {
      // MSSCI-12475: Try to get sprint stories even without session
      const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
      if (existsSync(sprintPath)) {
        const sprintContent = readFileSync(sprintPath, 'utf-8');
        nullResult.sprint = parseSprintYaml(sprintContent);
        nullResult.sprintStories = getSprintStories(sprintContent);
      }
      nullResult.availableWorkflows = getAvailableWorkflows(projectDir);
      return nullResult;
    }

    const files = readdirSync(sessionDir).filter(f => f.endsWith('-session.md'));
    if (files.length === 0) {
      // No session files, but try to get sprint progress and stories
      const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
      if (existsSync(sprintPath)) {
        const sprintContent = readFileSync(sprintPath, 'utf-8');
        nullResult.sprint = parseSprintYaml(sprintContent);
        nullResult.sprintStories = getSprintStories(sprintContent);
      }
      nullResult.availableWorkflows = getAvailableWorkflows(projectDir);
      return nullResult;
    }

    // Find the most recently modified session file
    let sessionFile = files[0];
    let latestMtime = 0;
    for (const file of files) {
      const filePath = join(sessionDir, file);
      const stat = statSync(filePath);
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        sessionFile = file;
      }
    }
    const sessionPath = join(sessionDir, sessionFile);
    const sessionContent = readFileSync(sessionPath, 'utf-8');
    const storyInfo = parseSessionFile(sessionContent, projectDir);

    // Get sprint progress and MSSCI-12475 expandable data
    const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
    let sprint: StoryInfo['sprint'] = null;
    let sprintStories: SprintStory[] | null = null;
    let epicContext: EpicContext | null = null;
    let sprintContent = '';

    if (existsSync(sprintPath)) {
      sprintContent = readFileSync(sprintPath, 'utf-8');
      sprint = parseSprintYaml(sprintContent);
      sprintStories = getSprintStories(sprintContent);

      // Get epic context if we have a story ID
      if (storyInfo.id) {
        epicContext = getEpicContext(sprintContent, storyInfo.id);
      }
    }

    // Generate Jira URL for current story
    const storyId = storyInfo.id || null;
    const jiraKey = storyId && storyId.startsWith('MSSCI-') ? storyId : null;

    return {
      id: storyInfo.id || null,
      title: storyInfo.title || null,
      phase: storyInfo.phase || null,
      status: storyInfo.status || null,
      points: storyInfo.points || null,
      sprint,
      nextAgent: storyInfo.nextAgent || null,
      workflow: storyInfo.workflow || null,
      workflowType: storyInfo.workflowType || null,
      pr: storyInfo.pr || null,
      branch: storyInfo.branch || null,
      criteria: storyInfo.criteria || null,
      // MSSCI-12475: Expandable story section
      sprintStories,
      epicContext,
      jiraUrl: generateJiraUrl(jiraKey),
      // MSSCI-14301: Available workflows
      availableWorkflows: getAvailableWorkflows(projectDir),
    };
  } catch {
    return nullResult;
  }
}
