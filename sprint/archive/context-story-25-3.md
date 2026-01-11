# Story 25-3: Detect Handoff & Action Prompts - Technical Context

## Story Overview
- **Epic:** 25 - Smart Question Detection & Quick Actions
- **Points:** 3
- **Priority:** P1
- **Repos:** cyclist
- **Jira:** MSSCI-11533

## Current State

### Existing Quick Actions System
The quick-actions module (`packages/cyclist/src/public/js/components/message-view/quick-actions.js`) currently detects:

1. **Yes/No Questions** (8 patterns in `QUESTION_PATTERNS`):
   - "would you like me to..." → [Yes, proceed / No]
   - "shall I proceed/continue..." → [Yes, proceed / No]
   - "ready to proceed" → [Yes, proceed / Hold on]
   - "should I..." (requires ?) → [Yes / No]
   - Permission prompts → [Yes / No]

2. **Numbered List Choices**:
   - Detects `1. Option`, `1) Option`, `**1.** Option` patterns
   - Requires choice context keywords ("which", "choose", "select")
   - Has false-positive filtering for documentation lists

### What's Missing (Story 25-3 Target)
The system does NOT detect Pennyfarthing agent handoff patterns:
- "invoke /reviewer to continue"
- "run /dev to implement"
- "use /sm to finish"
- "start /tea for tests"
- "ready for review" (should suggest `/reviewer`)
- "Context is high. Start fresh with /tea"

## Technical Approach

### New Detection: Handoff Patterns
Add a new `HANDOFF_PATTERNS` array and `detectHandoffPattern()` function:

```javascript
const HANDOFF_PATTERNS = [
  // Direct agent invocation suggestions
  { pattern: /invoke\s+\/(\w+)/i, type: 'invoke' },
  { pattern: /run\s+\/(\w+)/i, type: 'invoke' },
  { pattern: /use\s+\/(\w+)/i, type: 'invoke' },
  { pattern: /start\s+\/(\w+)/i, type: 'invoke' },
  { pattern: /switch to\s+\/(\w+)/i, type: 'invoke' },

  // Ready-for-phase prompts
  { pattern: /ready for (review|testing|implementation)/i, type: 'ready' },

  // Context warnings with fresh start suggestions
  { pattern: /start fresh with\s+\/(\w+)/i, type: 'fresh' },
  { pattern: /context.*(high|>70%).*\/(\w+)/i, type: 'context' },
];
```

### Agent Mapping
Map phase names to agent commands:
```javascript
const PHASE_TO_AGENT = {
  'review': 'reviewer',
  'testing': 'tea',
  'implementation': 'dev',
  'finish': 'sm'
};
```

### Integration Points

1. **Detection** (`detectHandoffPattern(text)`):
   - Scan last paragraph for handoff patterns
   - Extract agent name from capture group
   - Return `{ type: 'handoff', agent: '/reviewer', responses: ['/reviewer', 'Not yet'] }`

2. **Rendering** (extend `renderQuickActions()`):
   - New case for `type: 'handoff'`
   - Button shows agent command (e.g., "/reviewer")
   - Click submits the command directly

3. **Processing** (extend `processMessageForQuickActions()`):
   - Check handoff patterns BEFORE yes/no patterns
   - Handoff is more specific, should take precedence

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/quick-actions.js` | Add HANDOFF_PATTERNS, detectHandoffPattern(), update renderQuickActions() and processMessageForQuickActions() |
| `packages/cyclist/tests/B-9.6-suggested-prompts.test.ts` | Add test cases for all handoff patterns |

## Acceptance Criteria

- [ ] **AC1:** Detects "invoke /X" patterns and shows button with "/X"
- [ ] **AC2:** Detects "ready for X" patterns and shows appropriate agent button
- [ ] **AC3:** Shows button to invoke the suggested command
- [ ] **AC4:** Works for all Pennyfarthing agents (sm, tea, dev, reviewer, architect, pm, tech-writer, ux-designer, devops, orchestrator)

## Testing Strategy

### Unit Tests (TEA will write)
```javascript
// Handoff detection tests
describe('detectHandoffPattern', () => {
  it('detects "invoke /reviewer" pattern', () => {
    const result = detectHandoffPattern('Please invoke /reviewer to continue');
    expect(result.agent).toBe('/reviewer');
  });

  it('detects "ready for review" pattern', () => {
    const result = detectHandoffPattern('The code is ready for review.');
    expect(result.agent).toBe('/reviewer');
  });

  it('detects "run /dev" pattern', () => {
    const result = detectHandoffPattern('Now run /dev to implement');
    expect(result.agent).toBe('/dev');
  });

  it('detects context warning with agent suggestion', () => {
    const result = detectHandoffPattern('Context is high. Start fresh with /tea');
    expect(result.agent).toBe('/tea');
  });

  it('does not detect partial matches', () => {
    const result = detectHandoffPattern('I will invoke the function');
    expect(result).toBeNull();
  });
});
```

### Manual Testing Scenarios
1. Run `/sm` and observe handoff suggestion to TEA
2. Complete TEA phase, verify Dev handoff button appears
3. Complete Dev phase, verify Reviewer handoff button appears
4. Test with context warning messages

## Dependencies & Risks

### Dependencies
- Story 25-2 (enumeration fix) is complete ✓
- No external dependencies

### Risks
| Risk | Mitigation |
|------|-----------|
| False positives on "invoke" in code discussions | Only check last paragraph, require `/` prefix |
| Missing agent names | Comprehensive pattern list, fallback to raw match |

## Implementation Notes

### Pattern Priority
Detection order should be:
1. Handoff patterns (most specific)
2. List choices
3. Yes/No questions (most general)

### Button Styling
Handoff buttons should be visually distinct - perhaps with a different color or icon to indicate "this will switch context."

### Edge Cases
- Multiple agents mentioned: Take the LAST one (most likely the actionable suggestion)
- Agent name variations: Handle both `/reviewer` and `reviewer`
- Markdown formatting: Strip `**` and backticks from agent names
