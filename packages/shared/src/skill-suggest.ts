/**
 * Skill Suggestions Utility - Story 9-3
 *
 * Provides intelligent skill suggestions based on:
 * - AC1: Session context (story, ACs, phase)
 * - AC2: Keyword extraction and matching
 * - AC3: Non-intrusive presentation (thresholds, limits)
 *
 * Reuses searchSkills() from skill-search.ts for registry access.
 */

import { searchSkills } from './skill-search.js';

/**
 * Session context for story-aware suggestions
 */
export interface SessionContext {
  /** Story identifier (e.g., "9-3") */
  storyId: string;
  /** List of acceptance criteria */
  acceptanceCriteria: string[];
  /** Current workflow phase */
  phase: string;
  /** Optional Jira issue key */
  jiraKey?: string;
}

/**
 * Options for skill suggestions
 */
export interface SuggestOptions {
  /** Minimum confidence score (0-1) to include suggestion. Default: 0.3 */
  confidenceThreshold?: number;
  /** Maximum number of suggestions to return. Default: 5 */
  maxResults?: number;
  /** Skills to exclude from suggestions (already in use) */
  excludeSkills?: string[];
  /** Session context for combined suggestions */
  sessionContext?: SessionContext;
  /** Custom path to registry file (for testing) */
  registryPath?: string;
}

/**
 * A skill suggestion with relevance scoring
 */
export interface SkillSuggestion {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Relevance score (0-1) */
  score: number;
  /** Reason for suggesting this skill */
  reason: string;
  /** What triggered the match (keywords, tags, phase) */
  matchedOn?: string[];
}

/** Phase to skill mappings for session-aware suggestions */
const PHASE_SKILL_MAP: Record<string, string[]> = {
  testing: ['testing'],
  development: ['dev-patterns', 'testing'],
  review: ['code-review'],
  planning: ['story-management', 'sprint-context'],
  deployment: ['just', 'run-ci'],
};

/** Keywords that suggest specific skills */
const SKILL_KEYWORDS: Record<string, string[]> = {
  testing: [
    'test', 'tests', 'testing', 'tdd', 'unit', 'integration', 'jest', 'vitest',
    'mocha', 'pytest', 'coverage', 'spec', 'specs', 'assertion', 'mock', 'stub'
  ],
  'code-review': [
    'review', 'reviewing', 'pr', 'pull request', 'code review', 'approve', 'reject'
  ],
  'dev-patterns': [
    'pattern', 'patterns', 'implement', 'implementation', 'refactor', 'fix', 'bug'
  ],
  jira: [
    'jira', 'ticket', 'issue', 'sprint', 'backlog', 'story', 'epic', 'mssci'
  ],
  just: [
    'just', 'justfile', 'recipe', 'task', 'run', 'build', 'script'
  ],
  'run-ci': [
    'ci', 'cd', 'pipeline', 'deploy', 'deployment', 'production', 'staging'
  ],
  changelog: [
    'changelog', 'release', 'version', 'document', 'documentation', 'docs', 'readme'
  ],
  theme: [
    'theme', 'themes', 'persona', 'character', 'style'
  ],
  mermaid: [
    'diagram', 'flowchart', 'sequence', 'architecture', 'uml', 'mermaid'
  ],
  'story-management': [
    'story', 'stories', 'sizing', 'estimate', 'points', 'planning'
  ],
  'sprint-context': [
    'sprint', 'backlog', 'velocity', 'status', 'current sprint'
  ],
};

/** Tags that map to skills */
const TAG_SKILL_MAP: Record<string, string[]> = {
  quality: ['testing', 'code-review'],
  tdd: ['testing'],
  workflow: ['story-management', 'sprint-context'],
  documentation: ['changelog', 'mermaid'],
};

/**
 * Suggest skills based on session context (story, ACs, phase)
 *
 * @param context - Session context with story details
 * @returns Promise resolving to array of skill suggestions
 */
export async function suggestFromSession(
  context: SessionContext
): Promise<SkillSuggestion[]> {
  // Return empty for missing context
  if (!context.storyId && context.acceptanceCriteria.length === 0) {
    return [];
  }

  const suggestions: SkillSuggestion[] = [];
  const seen = new Set<string>();

  // 1. Phase-based suggestions
  const phaseSkills = PHASE_SKILL_MAP[context.phase] || [];
  for (const skillName of phaseSkills) {
    if (!seen.has(skillName)) {
      seen.add(skillName);
      suggestions.push({
        name: skillName,
        description: await getSkillDescription(skillName),
        score: 0.8,
        reason: `Suggested for ${context.phase} phase of the workflow`,
        matchedOn: [`phase:${context.phase}`],
      });
    }
  }

  // 2. AC-based suggestions - scan for keywords
  const acText = context.acceptanceCriteria.join(' ').toLowerCase();
  for (const [skillName, keywords] of Object.entries(SKILL_KEYWORDS)) {
    if (seen.has(skillName)) continue;

    const matchedKeywords = keywords.filter(kw => acText.includes(kw));
    if (matchedKeywords.length > 0) {
      seen.add(skillName);
      suggestions.push({
        name: skillName,
        description: await getSkillDescription(skillName),
        score: Math.min(0.5 + matchedKeywords.length * 0.1, 1.0),
        reason: `Acceptance criteria mention: ${matchedKeywords.slice(0, 3).join(', ')}`,
        matchedOn: matchedKeywords.map(kw => `keyword:${kw}`),
      });
    }
  }

  // 3. Jira context
  if (context.jiraKey && !seen.has('jira')) {
    seen.add('jira');
    suggestions.push({
      name: 'jira',
      description: await getSkillDescription('jira'),
      score: 0.7,
      reason: `Story has Jira reference: ${context.jiraKey}`,
      matchedOn: [`jira:${context.jiraKey}`],
    });
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions;
}

/**
 * Suggest skills based on keywords in user input
 *
 * @param userInput - User's message or query
 * @returns Promise resolving to array of skill suggestions
 */
export async function suggestFromKeywords(
  userInput: string
): Promise<SkillSuggestion[]> {
  if (!userInput || userInput.trim() === '') {
    return [];
  }

  const inputLower = userInput.toLowerCase();
  const suggestions: SkillSuggestion[] = [];

  // Check keyword matches
  for (const [skillName, keywords] of Object.entries(SKILL_KEYWORDS)) {
    const matchedKeywords = keywords.filter(kw => inputLower.includes(kw));

    if (matchedKeywords.length > 0) {
      // Score based on number of matches, normalized to 0-1
      const score = Math.min(matchedKeywords.length * 0.2, 1.0);

      suggestions.push({
        name: skillName,
        description: await getSkillDescription(skillName),
        score,
        reason: `Matched keywords: ${matchedKeywords.join(', ')}`,
        matchedOn: matchedKeywords.map(kw => `keyword:${kw}`),
      });
    }
  }

  // Check tag matches
  for (const [tag, skillNames] of Object.entries(TAG_SKILL_MAP)) {
    if (inputLower.includes(tag)) {
      for (const skillName of skillNames) {
        // Check if we already have this skill
        const existing = suggestions.find(s => s.name === skillName);
        if (existing) {
          // Boost score and add tag to matchedOn
          existing.score = Math.min(existing.score + 0.15, 1.0);
          existing.matchedOn?.push(`tag:${tag}`);
        } else {
          suggestions.push({
            name: skillName,
            description: await getSkillDescription(skillName),
            score: 0.4,
            reason: `Matched tag: ${tag}`,
            matchedOn: [`tag:${tag}`],
          });
        }
      }
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions;
}

/**
 * Main suggestion function combining session context and keywords
 *
 * @param userInput - User's message or query
 * @param options - Suggestion options (threshold, limits, exclusions)
 * @returns Promise resolving to filtered, limited skill suggestions
 */
export async function suggestSkills(
  userInput: string,
  options: SuggestOptions = {}
): Promise<SkillSuggestion[]> {
  const {
    confidenceThreshold = 0.3,
    maxResults = 5,
    excludeSkills = [],
    sessionContext,
    registryPath,
  } = options;

  // Handle empty input
  if (!userInput || userInput.trim() === '') {
    return [];
  }

  // Handle missing registry gracefully
  if (registryPath) {
    try {
      await searchSkills({ registryPath });
    } catch {
      return [];
    }
  }

  // Get keyword suggestions
  const keywordSuggestions = await suggestFromKeywords(userInput);

  // Get session suggestions if context provided
  let sessionSuggestions: SkillSuggestion[] = [];
  if (sessionContext) {
    sessionSuggestions = await suggestFromSession(sessionContext);
  }

  // Merge suggestions, boosting skills that appear in both
  const merged = new Map<string, SkillSuggestion>();

  for (const suggestion of keywordSuggestions) {
    merged.set(suggestion.name, suggestion);
  }

  for (const suggestion of sessionSuggestions) {
    const existing = merged.get(suggestion.name);
    if (existing) {
      // Strong boost when found in both sources - these are high priority
      existing.score = Math.min(existing.score + suggestion.score, 1.0);
      existing.matchedOn = [
        ...(existing.matchedOn || []),
        ...(suggestion.matchedOn || []),
      ];
      if (suggestion.reason && !existing.reason.includes(suggestion.reason)) {
        existing.reason = `${existing.reason}; ${suggestion.reason}`;
      }
    } else {
      merged.set(suggestion.name, suggestion);
    }
  }

  // Convert to array and filter
  let results = Array.from(merged.values());

  // Exclude already-used skills
  if (excludeSkills.length > 0) {
    const excludeSet = new Set(excludeSkills.map(s => s.toLowerCase()));
    results = results.filter(s => !excludeSet.has(s.name.toLowerCase()));
  }

  // Filter by confidence threshold
  results = results.filter(s => s.score >= confidenceThreshold);

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Limit results
  results = results.slice(0, maxResults);

  return results;
}

/**
 * Get skill description from registry or use fallback
 */
async function getSkillDescription(skillName: string): Promise<string> {
  try {
    const results = await searchSkills({});
    const skill = results.find(
      s => s.name.toLowerCase() === skillName.toLowerCase()
    );
    return skill?.description || `${skillName} skill`;
  } catch {
    return `${skillName} skill`;
  }
}
