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

// Story info interface (enhanced with workflow details)
export interface StoryInfo {
  id: string | null;
  title: string | null;
  phase: string | null;
  status: string | null;
  points: number | null;
  sprint: {
    number: number;
    remaining: number;
    inProgress: number;
    endDate: string | null;
  } | null;
  nextAgent: string | null;        // Next agent in workflow
  workflow: WorkflowStep[] | null; // TDD flow progress
  pr: string | null;               // PR number (e.g., "32")
  branch: string | null;           // Feature branch name
  criteria: CriteriaItem[] | null; // Acceptance criteria checklist
}

// Parse session file for story info
// projectDir is optional but required for dynamic workflow phase detection
export function parseSessionFile(content: string, projectDir?: string): Partial<StoryInfo> {
  const result: Partial<StoryInfo> = {};

  // Extract story ID and title from header
  // Formats supported:
  //   # Story 15-3: Title (colon separator)
  //   # Story 15-3 Session (with "Session" suffix)
  const headerMatch = content.match(/^#\s*Story\s+([\w-]+):\s*(.+)$/m) ||
                      content.match(/^#\s*Story\s+([\w-]+)\s+Session$/m);
  if (headerMatch) {
    result.id = headerMatch[1];
    // For "Session" format, try to get title from **Title:** field
    if (headerMatch[2]) {
      result.title = headerMatch[2].trim();
    } else {
      // Look for **Title:** field in Story Details section
      const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)$/m);
      if (titleMatch) {
        result.title = titleMatch[1].trim();
      }
    }
  }

  // Extract phase: **Phase:** dev or **Phase:** TEA (RED complete) -> Dev (GREEN)
  // Also check table format: | Phase | dev |
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*(\w+)/i) ||
                     content.match(/\|\s*Phase\s*\|\s*(\w+)/i);
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

  // Extract branch from "## Branch" section or **Branch:** line
  const branchMatch = content.match(/^##\s*Branch\s*\n`([^`]+)`/m) ||
                      content.match(/\*\*Branch:\*\*\s*`?([^`\n]+)`?/);
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
  const workflowMatch = content.match(/\*\*Workflow:\*\*\s*([\w-]+)/i);
  const workflowName = workflowMatch?.[1]?.toLowerCase();

  // Try to extract current phase from session content
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*(\w+)/i);
  const currentPhase = phaseMatch?.[1]?.toLowerCase();

  // If projectDir provided and workflow specified, use dynamic phases
  if (projectDir && workflowName) {
    const phases = getWorkflowPhases(workflowName, projectDir);
    if (phases) {
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
// Returns remaining points, in-progress points, and end date
export function parseSprintYaml(content: string): StoryInfo['sprint'] | null {
  try {
    const data = parseYaml(content);

    // Old format: sprint.number - convert to new format
    if (data?.sprint?.number && data?.summary) {
      return {
        number: data.sprint.number,
        remaining: data.summary.total_points - data.summary.completed_points || 0,
        inProgress: 0,
        endDate: null,
      };
    }

    // New format: sprint.name with end_date
    if (data?.sprint?.name) {
      // Extract sprint number from name (e.g., "TO Sprint 2604" -> 2604)
      const nameMatch = data.sprint.name.match(/(\d+)/);
      const sprintNumber = nameMatch ? parseInt(nameMatch[1], 10) : 0;

      // Calculate points by status
      let remainingPoints = 0;
      let inProgressPoints = 0;

      if (data?.epics && Array.isArray(data.epics)) {
        for (const epic of data.epics) {
          if (epic?.stories && Array.isArray(epic.stories)) {
            for (const story of epic.stories) {
              const points = story?.points && typeof story.points === 'number' ? story.points : 0;
              const status = story?.status || 'backlog';

              if (status === 'in_progress') {
                inProgressPoints += points;
              } else if (status === 'backlog' || status === null) {
                remainingPoints += points;
              }
              // done stories are not counted (they're in the archive)
            }
          }
        }
      }

      return {
        number: sprintNumber,
        remaining: remainingPoints,
        inProgress: inProgressPoints,
        endDate: data.sprint.end_date || null,
      };
    }
  } catch {
    // Malformed YAML
  }
  return null;
}

// Get workflow phases from workflow YAML definition
// Checks multiple locations: .claude/workflows/, pennyfarthing-dist/workflows/
export function getWorkflowPhases(workflowName: string, projectDir: string): Omit<WorkflowPhase, 'status'>[] | null {
  try {
    // Look for workflow YAML in multiple locations (in priority order)
    const searchPaths = [
      join(projectDir, '.claude', 'workflows', `${workflowName}.yaml`),
      join(projectDir, 'pennyfarthing-dist', 'workflows', `${workflowName}.yaml`),
    ];

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
    if (!phases || !Array.isArray(phases)) {
      return null;
    }

    // Map phases to WorkflowPhase objects (without status - that's determined at runtime)
    return phases.map((phase: { name: string; agent: string; label?: string }) => ({
      name: phase.name,
      agent: phase.agent,
      label: phase.label || phase.name,  // Default label to name if not provided
    }));
  } catch {
    // Malformed YAML or read error
    return null;
  }
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
  };

  try {
    // Find session files
    const sessionDir = join(projectDir, '.session');
    if (!existsSync(sessionDir)) {
      return nullResult;
    }

    const files = readdirSync(sessionDir).filter(f => f.endsWith('-session.md'));
    if (files.length === 0) {
      // No session files, but try to get sprint progress
      const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
      if (existsSync(sprintPath)) {
        const sprintContent = readFileSync(sprintPath, 'utf-8');
        nullResult.sprint = parseSprintYaml(sprintContent);
      }
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

    // Get sprint progress
    const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
    let sprint: StoryInfo['sprint'] = null;
    if (existsSync(sprintPath)) {
      const sprintContent = readFileSync(sprintPath, 'utf-8');
      sprint = parseSprintYaml(sprintContent);
    }

    return {
      id: storyInfo.id || null,
      title: storyInfo.title || null,
      phase: storyInfo.phase || null,
      status: storyInfo.status || null,
      points: storyInfo.points || null,
      sprint,
      nextAgent: storyInfo.nextAgent || null,
      workflow: storyInfo.workflow || null,
      pr: storyInfo.pr || null,
      branch: storyInfo.branch || null,
      criteria: storyInfo.criteria || null,
    };
  } catch {
    return nullResult;
  }
}
