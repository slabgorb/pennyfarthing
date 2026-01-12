# Story 25-5: Structured Output Markers (Claude-side) - Technical Context

## Story Overview
- **Epic:** 25 - Smart Question Detection & Quick Actions
- **Story ID:** 25-5
- **Jira:** MSSCI-11537
- **Points:** 3
- **Priority:** P2
- **Repos:** pennyfarthing, cyclist

## Problem Statement

Current quick-action detection in Cyclist relies on regex pattern matching which:
- Has false positives (enumerations mistaken for choices)
- Has false negatives (some handoff patterns missed)
- Varies in reliability based on message formatting

By adding structured HTML comment markers to agent output, we can achieve 100% detection accuracy while maintaining backward compatibility with the existing pattern-based system.

## Technical Approach

### Marker Format Specification

```html
<!-- CYCLIST:QUESTION:yesno -->
<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2,3 -->
<!-- CYCLIST:HANDOFF:/tea -->
<!-- CYCLIST:HANDOFF:/dev -->
<!-- CYCLIST:HANDOFF:/reviewer -->
<!-- CYCLIST:HANDOFF:/sm -->
```

**Design Decisions:**
1. HTML comments are invisible in rendered markdown
2. `CYCLIST:` prefix avoids collision with other comment uses
3. Type field (QUESTION, CHOICES, HANDOFF) enables different handling
4. Value field carries payload (response type, choice numbers, agent name)

### Cyclist-Side Detection (quick-actions.js)

Add marker detection as **highest priority** in `processMessageForQuickActions()`:

```javascript
// NEW: Check for structured markers first (100% confidence)
function detectStructuredMarkers(text) {
  const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+)\s*-->/g;
  const markers = [];
  let match;
  while ((match = markerPattern.exec(text)) !== null) {
    markers.push({
      type: match[1].toLowerCase(),
      value: match[2].trim(),
      source: 'structured_marker'
    });
  }
  return markers.length > 0 ? markers : null;
}

// Modify processMessageForQuickActions to check markers first:
export function processMessageForQuickActions(message) {
  const text = message?.text || '';

  // Priority 1: Structured markers (100% accuracy)
  const markers = detectStructuredMarkers(text);
  if (markers) {
    return processStructuredMarkers(markers);
  }

  // Priority 2-4: Existing pattern detection (unchanged)
  // ... handoff, list, question patterns
}
```

### Pennyfarthing-Side Emission (Agent Files)

#### Where to Emit Markers

| Agent | When | Marker |
|-------|------|--------|
| SM | Handoff to TEA/Dev | `<!-- CYCLIST:HANDOFF:/tea -->` or `/dev` |
| TEA | Handoff to Dev | `<!-- CYCLIST:HANDOFF:/dev -->` |
| Dev | Handoff to Reviewer | `<!-- CYCLIST:HANDOFF:/reviewer -->` |
| Reviewer | Approve → SM | `<!-- CYCLIST:HANDOFF:/sm -->` |
| All | Yes/No questions | `<!-- CYCLIST:QUESTION:yesno -->` |
| All | Numbered choices | `<!-- CYCLIST:CHOICES:1,2,3 -->` |

#### Agent File Updates

**sm.md** - After context-aware handoff section:
```markdown
**Handoff Marker:** When handing off to TEA or Dev, include:
`<!-- CYCLIST:HANDOFF:/tea -->` or `<!-- CYCLIST:HANDOFF:/dev -->`
```

**tea.md** - After handoff section:
```markdown
**Handoff Marker:** When handing off to Dev, include:
`<!-- CYCLIST:HANDOFF:/dev -->`
```

**dev.md** - After handoff section:
```markdown
**Handoff Marker:** When handing off to Reviewer, include:
`<!-- CYCLIST:HANDOFF:/reviewer -->`
```

**reviewer.md** - After approval section:
```markdown
**Handoff Marker:** When approving and handing to SM, include:
`<!-- CYCLIST:HANDOFF:/sm -->`
```

#### shared-behavior.md - Add New Section

```markdown
## Structured Output Markers

Emit HTML comment markers for Cyclist quick-action detection:

### Marker Format
- `<!-- CYCLIST:HANDOFF:/agent -->` - Agent handoff
- `<!-- CYCLIST:QUESTION:yesno -->` - Yes/No confirmation
- `<!-- CYCLIST:CHOICES:1,2,3 -->` - Numbered choices

### When to Emit
- Before asking user to invoke another agent
- Before yes/no confirmation questions
- Before presenting numbered choices

### Example
```
Ready to hand off to the Caterpillar for test writing.
<!-- CYCLIST:HANDOFF:/tea -->
```

Markers are invisible in rendered output but enable 100% accurate button detection.
```

## Files to Modify

### Cyclist Repo
| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Add `detectStructuredMarkers()`, update priority in `processMessageForQuickActions()` |
| `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` | Add test cases for marker detection |

### Pennyfarthing Repo
| File | Changes |
|------|---------|
| `pennyfarthing-dist/agents/sm.md` | Add handoff marker instruction |
| `pennyfarthing-dist/agents/tea.md` | Add handoff marker instruction |
| `pennyfarthing-dist/agents/dev.md` | Add handoff marker instruction |
| `pennyfarthing-dist/agents/reviewer.md` | Add handoff marker instruction |
| `pennyfarthing-dist/guides/shared-behavior.md` | Add marker specification section |

## Acceptance Criteria

- [ ] AC1: Marker format defined and documented in shared-behavior.md
- [ ] AC2: Key agents emit markers for questions (all 4 agents updated)
- [ ] AC3: Cyclist parses markers with 100% accuracy (detectStructuredMarkers function)
- [ ] AC4: Markers hidden from user display (HTML comments invisible)

## Testing Strategy

### Unit Tests (quick-actions.js)
1. `detectStructuredMarkers` extracts single marker correctly
2. `detectStructuredMarkers` extracts multiple markers
3. `detectStructuredMarkers` returns null for no markers
4. `processMessageForQuickActions` prioritizes markers over patterns
5. Marker detection works with surrounding markdown

### Integration Tests
1. Full message with handoff marker renders correct button
2. Full message with question marker renders Yes/No buttons
3. Full message with choices marker renders numbered choices
4. Markers invisible in rendered message content

### Manual Testing
1. Run Pennyfarthing TDD flow with updated agents
2. Verify handoff buttons appear at each transition
3. Verify markers don't appear in visible output
4. Verify backward compatibility with unmarked messages

## Dependencies & Risks

### Dependencies
- Stories 25-1 through 25-4 complete (pattern detection stabilized)
- Cross-repo coordination (pennyfarthing + cyclist)

### Risks
| Risk | Mitigation |
|------|-----------|
| Agents forget to emit markers | Markers are enhancement, not replacement - patterns still work |
| Marker format conflicts | Use `CYCLIST:` prefix, unlikely to conflict |
| Breaking existing detection | Markers add priority path, don't remove pattern path |

## Implementation Notes

### Backward Compatibility
- Existing pattern detection remains as fallback
- Messages without markers work exactly as before
- Markers are optional enhancement for guaranteed accuracy

### Future: Confidence Scoring (25-6)
- Markers will return `confidence: 100`
- Pattern matches will return lower confidence
- Story 25-6 will use this for UI display decisions
