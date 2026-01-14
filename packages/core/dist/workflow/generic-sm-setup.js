/**
 * Generic SM Setup - Combines story-setup + work-research
 *
 * Story 31-11: Consolidate SM bookkeeping subagents
 *
 * This module provides two modes:
 * 1. Research mode: Scan backlog, batch Jira query, recommend stories
 * 2. Setup mode: Claim Jira, create branches, write session file
 *
 * TODO: Dev will implement the logic to pass the tests
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Parse YAML manually (simple parser for sprint YAML structure)
 * This avoids external dependencies like js-yaml
 */
function parseSprintYaml(content) {
    const lines = content.split('\n');
    // Extract sprint section
    let sprintNumber;
    let sprintGoal;
    let completedPoints;
    let totalPoints;
    const stories = [];
    let currentEpicId;
    let inStoriesSection = false;
    let currentStory = null;
    let storyIndent = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const indent = line.length - line.trimStart().length;
        // Sprint metadata (any indent)
        if (trimmed.startsWith('number:') && !inStoriesSection) {
            sprintNumber = parseInt(trimmed.replace('number:', '').trim(), 10);
        }
        else if (trimmed.startsWith('goal:') && !inStoriesSection) {
            sprintGoal = trimmed.replace('goal:', '').trim().replace(/^["']|["']$/g, '');
        }
        else if (trimmed.startsWith('completed_points:')) {
            completedPoints = parseInt(trimmed.replace('completed_points:', '').trim(), 10);
        }
        else if (trimmed.startsWith('total_points:')) {
            totalPoints = parseInt(trimmed.replace('total_points:', '').trim(), 10);
        }
        // Epic detection: "  - id: 31" at indent 2
        else if (trimmed.startsWith('- id:') && indent === 2) {
            const epicId = parseInt(trimmed.replace('- id:', '').trim(), 10);
            if (!isNaN(epicId)) {
                currentEpicId = epicId;
                inStoriesSection = false;
            }
        }
        // Stories section marker
        else if (trimmed === 'stories:') {
            inStoriesSection = true;
        }
        // Story item: "      - id: ..." at indent 6 or more (after stories:)
        else if (inStoriesSection && trimmed.startsWith('- id:')) {
            // Save previous story
            if (currentStory && currentStory.id) {
                stories.push({
                    id: currentStory.id,
                    title: currentStory.title || '',
                    status: currentStory.status || 'backlog',
                    points: currentStory.points,
                    priority: currentStory.priority,
                    epic: currentEpicId,
                    assigned_to: currentStory.assigned_to
                });
            }
            // Start new story
            storyIndent = indent;
            const storyId = trimmed.replace('- id:', '').trim().replace(/^["']|["']$/g, '');
            currentStory = { id: storyId, epic: currentEpicId };
        }
        // Story properties (must be indented more than story item)
        else if (currentStory && indent > storyIndent) {
            if (trimmed.startsWith('title:')) {
                currentStory.title = trimmed.replace('title:', '').trim().replace(/^["']|["']$/g, '');
            }
            else if (trimmed.startsWith('status:')) {
                currentStory.status = trimmed.replace('status:', '').trim();
            }
            else if (trimmed.startsWith('points:')) {
                currentStory.points = parseInt(trimmed.replace('points:', '').trim(), 10);
            }
            else if (trimmed.startsWith('priority:')) {
                currentStory.priority = trimmed.replace('priority:', '').trim();
            }
            else if (trimmed.startsWith('assigned_to:')) {
                currentStory.assigned_to = trimmed.replace('assigned_to:', '').trim().replace(/^["']|["']$/g, '');
            }
        }
        // Exit stories section when we hit something at lower indent
        else if (inStoriesSection && trimmed && indent <= 2 && !trimmed.startsWith('-')) {
            // Save last story before exiting
            if (currentStory && currentStory.id) {
                stories.push({
                    id: currentStory.id,
                    title: currentStory.title || '',
                    status: currentStory.status || 'backlog',
                    points: currentStory.points,
                    priority: currentStory.priority,
                    epic: currentEpicId,
                    assigned_to: currentStory.assigned_to
                });
                currentStory = null;
            }
            inStoriesSection = false;
        }
    }
    // Don't forget the last story
    if (currentStory && currentStory.id) {
        stories.push({
            id: currentStory.id,
            title: currentStory.title || '',
            status: currentStory.status || 'backlog',
            points: currentStory.points,
            priority: currentStory.priority,
            epic: currentEpicId,
            assigned_to: currentStory.assigned_to
        });
    }
    return {
        sprint: { number: sprintNumber, goal: sprintGoal },
        summary: { completed_points: completedPoints, total_points: totalPoints },
        stories
    };
}
/**
 * Research backlog for available stories
 *
 * Scans sprint YAML and returns available (unassigned, backlog) stories
 * sorted by priority then points.
 *
 * @param params - Research parameters
 * @returns Research result with available stories
 */
export async function researchBacklog(params) {
    const { sprintPath } = params;
    // Check if file exists
    if (!existsSync(sprintPath)) {
        return {
            success: false,
            availableStories: [],
            error: `Sprint file not found: ${sprintPath}`
        };
    }
    try {
        const content = readFileSync(sprintPath, 'utf-8');
        const parsed = parseSprintYaml(content);
        const sprint = parsed.sprint;
        const summary = parsed.summary;
        const allStories = parsed.stories || [];
        // Filter: only backlog stories without assigned_to
        const availableStories = allStories.filter(story => {
            const hasAssignee = 'assigned_to' in story && story.assigned_to;
            const isBacklog = story.status === 'backlog';
            return isBacklog && !hasAssignee;
        });
        // Sort by priority (P1 < P2 < undefined) then by points ascending
        const priorityOrder = { 'P1': 1, 'P2': 2, 'P3': 3 };
        availableStories.sort((a, b) => {
            const aPriority = priorityOrder[a.priority || ''] || 99;
            const bPriority = priorityOrder[b.priority || ''] || 99;
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            return (a.points || 0) - (b.points || 0);
        });
        return {
            success: true,
            availableStories,
            sprintNumber: sprint?.number,
            sprintGoal: sprint?.goal,
            completedPoints: summary?.completed_points,
            totalPoints: summary?.total_points
        };
    }
    catch (error) {
        return {
            success: false,
            availableStories: [],
            error: `Failed to parse sprint YAML: ${error}`
        };
    }
}
/**
 * Convert title to kebab-case slug for branch naming
 */
function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Setup a story for development
 *
 * Creates session file with story context, calculates branch name,
 * initializes workflow tracking with Phase History table.
 *
 * @param params - Setup parameters
 * @returns Setup result with session file path and branch name
 */
export async function setupStory(params) {
    const { storyId, title, points, epic, repos, sessionDir, workflow, assignee, jiraKey, acceptanceCriteria } = params;
    // Calculate branch name
    const slug = slugify(title);
    const branchName = `feat/${storyId}-${slug}`;
    // Session file path
    const sessionPath = join(sessionDir, `${storyId}-session.md`);
    // Check if session file already exists
    if (existsSync(sessionPath)) {
        return {
            success: false,
            error: `Session file already exists: ${sessionPath}`
        };
    }
    // Generate ISO timestamp
    const now = new Date().toISOString();
    // Build session file content
    const lines = [
        `# Story ${storyId} Session`,
        '',
        `**Story ID:** ${storyId}`,
        `**Title:** ${title}`,
        `**Points:** ${points}`,
        `**Epic:** ${epic}`,
        `**Repos:** ${repos}`,
        `**Status:** in_progress`
    ];
    if (assignee) {
        lines.push(`**Assignee:** ${assignee}`);
    }
    if (jiraKey) {
        lines.push(`**Jira:** ${jiraKey}`);
    }
    // Acceptance criteria section
    if (acceptanceCriteria && acceptanceCriteria.length > 0) {
        lines.push('');
        lines.push('## Acceptance Criteria');
        lines.push('');
        for (const ac of acceptanceCriteria) {
            lines.push(`- [ ] ${ac}`);
        }
    }
    // Workflow tracking section
    lines.push('');
    lines.push('## Workflow Tracking');
    lines.push('');
    lines.push(`**Workflow:** ${workflow}`);
    lines.push(`**Phase:** setup`);
    lines.push(`**Phase Started:** ${now}`);
    lines.push('');
    lines.push('### Phase History');
    lines.push('| Phase | Started | Ended | Duration |');
    lines.push('|-------|---------|-------|----------|');
    lines.push(`| setup | ${now} | - | - |`);
    lines.push('');
    // Write file
    try {
        writeFileSync(sessionPath, lines.join('\n'));
        return {
            success: true,
            sessionFile: sessionPath,
            branchName
        };
    }
    catch (error) {
        return {
            success: false,
            error: `Failed to write session file: ${error}`
        };
    }
}
//# sourceMappingURL=generic-sm-setup.js.map