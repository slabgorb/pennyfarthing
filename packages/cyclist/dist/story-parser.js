import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
// Parse session file for story info
export function parseSessionFile(content) {
    const result = {};
    // Extract story ID and title from header: # Story 15-3: Title or # Story E1-1: Title
    const headerMatch = content.match(/^#\s*Story\s+([\w-]+):\s*(.+)$/m);
    if (headerMatch) {
        result.id = headerMatch[1];
        result.title = headerMatch[2].trim();
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
    }
    else {
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
    // Parse workflow progress from checkboxes
    result.workflow = parseWorkflowProgress(content);
    // Parse acceptance criteria checkboxes
    result.criteria = parseAcceptanceCriteria(content);
    return result;
}
// Parse acceptance criteria checkboxes into structured data
export function parseAcceptanceCriteria(content) {
    // Look for acceptance criteria section
    const criteriaSection = content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n##|\n$|$)/);
    if (!criteriaSection) {
        return null;
    }
    const criteria = [];
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
export function parseWorkflowProgress(content) {
    // Look for workflow progress section
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
    const agentLabels = {
        sm: 'SM',
        tea: 'TEA',
        dev: 'Dev',
        reviewer: 'Reviewer'
    };
    // Track which agents are done
    const agentStatus = {};
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
            }
            else if (!agentStatus[agent]) {
                agentStatus[agent] = 'pending';
            }
        }
    }
    // Build workflow array with current agent detection
    const workflow = [];
    let foundCurrent = false;
    for (const agent of agentOrder) {
        let status;
        if (agentStatus[agent] === 'done') {
            status = 'done';
        }
        else if (!foundCurrent) {
            // First non-done agent is current
            status = 'current';
            foundCurrent = true;
        }
        else {
            status = 'pending';
        }
        workflow.push({
            agent,
            label: agentLabels[agent],
            status
        });
    }
    return workflow;
}
// Parse sprint YAML for progress
export function parseSprintYaml(content) {
    try {
        const data = parseYaml(content);
        if (data?.sprint?.number && data?.summary) {
            return {
                number: data.sprint.number,
                completed: data.summary.completed_points || 0,
                total: data.summary.total_points || 0,
            };
        }
    }
    catch {
        // Malformed YAML
    }
    return null;
}
// Get story info from session files
export function getStoryInfo(projectDir) {
    const nullResult = {
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
        const storyInfo = parseSessionFile(sessionContent);
        // Get sprint progress
        const sprintPath = join(projectDir, 'sprint', 'current-sprint.yaml');
        let sprint = null;
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
    }
    catch {
        return nullResult;
    }
}
//# sourceMappingURL=story-parser.js.map