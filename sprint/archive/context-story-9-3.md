# Story 9-3: Add Skill Suggestions to Agents - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Story ID | 9-3 |
| Title | Add skill suggestions to agents |
| Jira | MSSCI-11518 |
| Points | 3 (standard TDD flow) |
| Epic | Epic 9: Skill Discovery & Documentation Hub |
| Repos | pennyfarthing |

## Acceptance Criteria

- [ ] AC1: Agents suggest skills when relevant (session-aware + keyword-triggered)
- [ ] AC2: Suggestions based on task analysis (keyword extraction and registry matching)
- [ ] AC3: Non-intrusive presentation (contextual, not every message)

## Scope Definition

Three suggestion modes to implement:

### 1. Session-Aware Suggestions
When there's an active story, suggest skills relevant to that story's domain:
- Story about testing → suggest `/testing`
- Story about documentation → suggest `/changelog`, `/mermaid`
- Story about infrastructure → suggest `/devops`, `/just`

**Trigger:** Agent activation when session file exists with story context

### 2. Keyword-Triggered Suggestions
After user describes a task, parse their input and suggest matching skills:
- User mentions "commit" or "changelog" → suggest `/changelog`
- User mentions "diagram" or "architecture" → suggest `/mermaid`
- User mentions "jira" or "sprint" → suggest `/jira`, `/sprint-context`

**Trigger:** Analyzing user message content

### 3. Proactive In-Conversation Suggestions
Detect moments during work when a skill would help:
- About to write tests → mention `/testing` if not already used
- Discussing code patterns → mention `/dev-patterns`
- Reviewing code → mention `/code-review`

**Trigger:** Context cues during agent work

## Current State

### What Already Exists

1. **Skill Registry** (`pennyfarthing-dist/skills/skill-registry.yaml`):
   - 19 skills with keywords, tags, categories
   - Each skill has `keywords` array for matching
   - Each skill has `related_skills` for chain suggestions

2. **Search Utility** (`packages/shared/src/skill-search.ts`):
   - `searchSkills({ keyword, tag, query, category })` function
   - Returns `SkillResult[]` with name, description, tags, keywords
   - Already supports AND logic for multiple filters

3. **Agent-Skill Affinities** (in agent definitions):
   - SM: `/sprint-context`, `/story-management`
   - TEA: `/testing`
   - Dev: `/dev-patterns`, `/testing`
   - Reviewer: `/code-review`

### What's Missing

1. **Keyword extraction** from user input/story context
2. **Suggestion scoring** to rank relevance (not just filter)
3. **Presentation format** that's helpful but not noisy
4. **Integration points** in agent workflow

## Technical Approach

### New Files to Create

1. **`pennyfarthing-dist/guides/skill-suggestions.md`**
   - Guide for agents on when/how to suggest skills
   - Keyword-to-skill mapping rules
   - Presentation format examples
   - Frequency guidelines (don't spam suggestions)

2. **`packages/shared/src/skill-suggest.ts`**
   - `suggestSkills(context: SuggestionContext): Promise<SkillSuggestion[]>`
   - Extracts keywords from text
   - Scores skills by relevance (keyword matches + related skills)
   - Returns top 3 suggestions with confidence scores

3. **`packages/shared/src/skill-suggest.test.ts`**
   - Tests for keyword extraction
   - Tests for scoring algorithm
   - Tests for context-aware suggestions

### Interface Design

```typescript
interface SuggestionContext {
  userMessage?: string;        // Current user input
  storyTitle?: string;         // Active story title
  storyDescription?: string;   // Active story description
  currentAgent?: string;       // Which agent is active
  usedSkills?: string[];       // Skills already used this session
}

interface SkillSuggestion {
  name: string;
  description: string;
  reason: string;              // Why this was suggested
  confidence: number;          // 0-1 score
  invocation: string;          // e.g., "/testing"
}
```

### Scoring Algorithm

1. **Keyword matches** (weight: 3) - User text contains skill keywords
2. **Tag matches** (weight: 2) - User text contains skill tags
3. **Agent affinity** (weight: 2) - Skill is natural for current agent
4. **Story context** (weight: 1) - Story description matches skill domain
5. **Not yet used** (weight: 1) - Boost skills not used this session

### Presentation Format

Non-intrusive, contextual suggestions:

```
💡 Skills that might help:
   /testing - TDD patterns and test framework guidance
   /dev-patterns - Common implementation patterns
```

Only shown when:
- Confidence score > 0.5 for at least one skill
- Not already suggested in last 3 agent turns
- Skill hasn't been used in current session

## Files to Modify

| File | Changes |
|------|---------|
| `pennyfarthing-dist/guides/shared-behavior.md` | Add skill suggestion protocol |
| `packages/shared/src/index.ts` | Export suggestSkills, SuggestionContext, SkillSuggestion |

## Testing Strategy

### AC1: Agents suggest skills when relevant
- Test: Session with testing story → suggests `/testing`
- Test: Session with docs story → suggests `/changelog`
- Test: No session → uses only user message context

### AC2: Suggestions based on task analysis
- Test: "help me write tests" → suggests `/testing`
- Test: "update the changelog" → suggests `/changelog`
- Test: "create a diagram" → suggests `/mermaid`
- Test: Multiple keywords → ranks by combined score
- Test: No matching keywords → returns empty array

### AC3: Non-intrusive presentation
- Test: Low confidence scores → no suggestions returned
- Test: Already-used skills → excluded from suggestions
- Test: Max 3 suggestions returned even if more match

## Dependencies

- Story 9-2 (skill-search.ts) - COMPLETE
- Story 9-1 (skill-registry.yaml) - COMPLETE

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Suggestions feel spammy | Confidence threshold + frequency limit |
| Keyword matching too broad | Require multiple keyword matches for high confidence |
| Performance overhead | Cache registry parsing, lazy load |

## Out of Scope

- Automatic skill invocation (user must explicitly invoke)
- Learning from user preferences (future story)
- Custom skill suggestions (only built-in skills for now)

---

*Generated by SM (Captain Carrot) for Story 9-3 - 2026-01-11*
