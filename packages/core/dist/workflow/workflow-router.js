/**
 * Workflow Router
 *
 * Routes stories to appropriate workflows based on explicit tags,
 * trigger rules, and defaults.
 *
 * Priority algorithm:
 * 1. Explicit workflow: tag on story
 * 2. Trigger tag match (story tags intersect workflow trigger tags)
 * 3. Type match (story type in workflow trigger types)
 * 4. Points match (story points within workflow trigger range)
 * 5. Default workflow fallback
 */
/**
 * Helper to check if a trigger's constraints are satisfied by a story
 * This ensures ALL constraints in a trigger must match (AND logic within a trigger)
 */
function doesStoryMatchTrigger(story, triggers, matchType) {
    if (!triggers) {
        return false;
    }
    // For explicit tag and default, we don't need to check other constraints
    if (matchType === 'explicit-tag' || matchType === 'default') {
        return true;
    }
    // For other match types, we need to verify all constraints are met
    // If story has a type, check type constraint if it exists
    if (story.type && triggers.types && triggers.types.length > 0) {
        if (!triggers.types.includes(story.type)) {
            return false;
        }
    }
    // Check points constraint if it exists
    if (triggers.points) {
        if (story.points === undefined) {
            return false;
        }
        const { min, max } = triggers.points;
        const hasMin = min !== undefined;
        const hasMax = max !== undefined;
        if (hasMin && story.points < min) {
            return false;
        }
        if (hasMax && story.points > max) {
            return false;
        }
    }
    return true;
}
/**
 * Route a story to the appropriate workflow
 *
 * @param story - Story metadata for routing decisions
 * @param workflows - Available workflow definitions
 * @returns Routing result with matched workflow and reason, or null if no match
 *
 * @example
 * ```typescript
 * const story = { id: '31-3', type: 'feature', points: 3 };
 * const result = routeStoryToWorkflow(story, workflows);
 * if (result) {
 *   console.log(`Using workflow: ${result.workflow.name}`);
 *   console.log(`Reason: ${result.reason}`);
 * }
 * ```
 */
export function routeStoryToWorkflow(story, workflows) {
    if (workflows.length === 0) {
        return null;
    }
    // Priority 1: Explicit workflow:xyz tag
    const explicitMatch = findExplicitTagMatch(story, workflows);
    if (explicitMatch) {
        return explicitMatch;
    }
    // Priority 2: Trigger tag match
    const tagMatch = findTriggerTagMatch(story, workflows);
    if (tagMatch) {
        return tagMatch;
    }
    // Priority 3: Type match
    const typeMatch = findTypeMatch(story, workflows);
    if (typeMatch) {
        return typeMatch;
    }
    // Priority 4: Points match
    const pointsMatch = findPointsMatch(story, workflows);
    if (pointsMatch) {
        return pointsMatch;
    }
    // Priority 5: Default fallback
    const defaultMatch = findDefaultWorkflow(workflows);
    if (defaultMatch) {
        return defaultMatch;
    }
    return null;
}
/**
 * Find workflow by explicit workflow:xyz tag
 */
function findExplicitTagMatch(story, workflows) {
    if (!story.tags || story.tags.length === 0) {
        return null;
    }
    // Find first workflow: tag
    for (const tag of story.tags) {
        if (tag.startsWith('workflow:')) {
            const workflowName = tag.slice('workflow:'.length);
            const workflow = workflows.find(w => w.name === workflowName);
            if (workflow) {
                return {
                    workflow,
                    reason: `Matched explicit tag 'workflow:${workflowName}' to workflow '${workflow.name}'`
                };
            }
            // Explicit tag didn't match any workflow - continue to other matching rules
        }
    }
    return null;
}
/**
 * Find workflow by trigger tags (story tags intersect workflow trigger.tags)
 */
function findTriggerTagMatch(story, workflows) {
    if (!story.tags || story.tags.length === 0) {
        return null;
    }
    // Filter out workflow: tags (those are handled by explicit match)
    const storyTags = story.tags.filter(t => !t.startsWith('workflow:'));
    if (storyTags.length === 0) {
        return null;
    }
    for (const workflow of workflows) {
        const triggerTags = workflow.triggers?.tags;
        if (!triggerTags || triggerTags.length === 0) {
            continue;
        }
        // Check if any story tag matches any trigger tag
        const matchingTag = storyTags.find(t => triggerTags.includes(t));
        if (matchingTag) {
            // Verify all other constraints are met
            if (doesStoryMatchTrigger(story, workflow.triggers, 'trigger-tag')) {
                return {
                    workflow,
                    reason: `Matched tag '${matchingTag}' to workflow '${workflow.name}'`
                };
            }
        }
    }
    return null;
}
/**
 * Find workflow by type match (story.type in workflow.triggers.types)
 *
 * When multiple workflows match by type, prefer the one with more specific
 * constraints (e.g., points ranges). This ensures that "refactor with 2 points"
 * matches "trivial" (which has points.max: 2) rather than "agent-docs"
 * (which has no points constraint).
 */
function findTypeMatch(story, workflows) {
    if (!story.type) {
        return null;
    }
    // Collect all type matches, sorted by specificity
    // Specificity: workflows with points constraints > workflows without
    const typeMatches = [];
    for (const workflow of workflows) {
        const triggerTypes = workflow.triggers?.types;
        if (!triggerTypes || triggerTypes.length === 0) {
            continue;
        }
        if (triggerTypes.includes(story.type)) {
            // Verify all constraints are met (including points if specified)
            if (doesStoryMatchTrigger(story, workflow.triggers, 'type')) {
                // Calculate specificity: workflows with points constraints are more specific
                const hasPointsConstraint = workflow.triggers?.points !== undefined;
                const specificity = hasPointsConstraint ? 1 : 0;
                typeMatches.push({ workflow, specificity });
            }
        }
    }
    // Sort by specificity descending, then return the first match
    if (typeMatches.length > 0) {
        typeMatches.sort((a, b) => b.specificity - a.specificity);
        const match = typeMatches[0];
        return {
            workflow: match.workflow,
            reason: `Matched type '${story.type}' to workflow '${match.workflow.name}'`
        };
    }
    return null;
}
/**
 * Find workflow by points range (story.points within workflow.triggers.points min/max)
 */
function findPointsMatch(story, workflows) {
    if (story.points === undefined) {
        return null;
    }
    for (const workflow of workflows) {
        const triggerPoints = workflow.triggers?.points;
        if (!triggerPoints) {
            continue;
        }
        const { min, max } = triggerPoints;
        const hasMin = min !== undefined;
        const hasMax = max !== undefined;
        // Must have at least one constraint
        if (!hasMin && !hasMax) {
            continue;
        }
        // Check constraints
        const meetsMin = !hasMin || story.points >= min;
        const meetsMax = !hasMax || story.points <= max;
        if (meetsMin && meetsMax) {
            // Verify all constraints are met
            if (doesStoryMatchTrigger(story, workflow.triggers, 'points')) {
                const rangeDesc = hasMin && hasMax
                    ? `${min}-${max}`
                    : hasMin
                        ? `>=${min}`
                        : `<=${max}`;
                return {
                    workflow,
                    reason: `Matched points ${story.points} (range: ${rangeDesc}) to workflow '${workflow.name}'`
                };
            }
        }
    }
    return null;
}
/**
 * Find default workflow (triggers.default: true)
 */
function findDefaultWorkflow(workflows) {
    const defaultWorkflow = workflows.find(w => w.triggers?.default === true);
    if (defaultWorkflow) {
        return {
            workflow: defaultWorkflow,
            reason: `Using default workflow '${defaultWorkflow.name}'`
        };
    }
    return null;
}
//# sourceMappingURL=workflow-router.js.map