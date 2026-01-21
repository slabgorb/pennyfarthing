# MSSCI-12124: Skills/commands discovery in sidebar

**Status:** in_progress
**Phase:** SM Finish
**Workflow:** TDD
**Points:** 3
**Epic:** epic-53
**Repos:** pennyfarthing
**Feature Branch:** feat/MSSCI-12124-skills-commands-sidebar

## Story
Enhance sidebar tree view with skills and commands:
- Collapsible "Skills" section listing all available skills
- Collapsible "Commands" section with slash commands
- Click to invoke skill/command in chat
- Search/filter functionality
- Show skill descriptions on hover

## Technical Context

### Architecture Overview
The sidebar is implemented in `packages/vscode-extension/src/providers/sidebar.ts` using the **type-dispatching TreeDataProvider** pattern. The existing `AgentStatusTreeDataProvider` class handles Agent, Sprint, Story, and Quick Actions sections.

### Key Files
| File | Purpose |
|------|---------|
| `providers/sidebar.ts` | Main TreeDataProvider (add Skills/Commands sections) |
| `commands/skill-parser.ts` | Existing skill registry parser (reuse for sidebar) |
| `commands/command-registry.ts` | Slash command definitions |
| `extension.ts` | Command registration |
| `tests/MSSCI-12048-sidebar.test.ts` | Existing test patterns to follow |

### Integration Pattern
```typescript
// Add new item types
type TreeItemType = 'root' | 'agent' | 'sprint' | 'story' | 'actions'
                  | 'skills' | 'commands' | 'skill-category' | 'empty';

// Route in getChildren()
case 'skills': return this.getSkillsChildren();
case 'commands': return this.getCommandsChildren();
case 'skill-category': return this.getSkillCategoryChildren(element);
```

### Skills Data Source
- Registry: `pennyfarthing-dist/skills/skill-registry.yaml`
- Parser: `skill-parser.ts` already provides `SkillMetadata` interface
- Categories: ai-llm, development, documentation, tools, workflow

### Tree Structure
```
Root
├── Agent (existing)
├── Sprint (existing)
├── Story (existing)
├── Quick Actions (existing)
├── Skills (NEW - collapsed by default)
│   ├── AI & LLM
│   │   ├── /agentic-patterns - Core reasoning patterns...
│   │   └── /context-engineering - Context window strategies...
│   ├── Development
│   │   ├── /code-review - Review checklists...
│   │   └── /testing - Test commands and TDD...
│   └── ... (other categories)
└── Commands (NEW - collapsed by default)
    ├── /sm - Start Scrum Master
    ├── /tea - Start Test Engineer
    └── ... (slash commands)
```

### Click-to-Invoke Pattern
```typescript
item.command = {
  command: 'pennyfarthing.invokeSkill',
  arguments: [skillName],
  title: `Run /${skillName}`,
};
```

### Hover/Tooltip Pattern
```typescript
item.tooltip = skill.description;
item.description = skill.category; // Shows inline after label
```

### Search/Filter Consideration
VS Code tree views support filtering via Ctrl+F when focused. Native filtering may suffice for MVP; custom search could be Phase 2.

### Test Patterns
Follow `MSSCI-12048-sidebar.test.ts`:
- Mock `vscode` namespace
- Test `getChildren()` for new sections
- Verify command registration
- Test tooltip content

## Progress Log
- [2026-01-21] SM: Story started, session created
- [2026-01-21] SM: Technical context written, handing off to TEA
- [2026-01-21] TEA: Tests written, RED state confirmed (32 failing, 3 passing)

## SM Assessment
**Ready for TEA.** This is a 3-point standard TDD story. The existing sidebar architecture provides clear patterns for extension. Tywin Lannister should design tests for:
1. Skills section rendering with category grouping
2. Commands section rendering
3. Click-to-invoke command execution
4. Tooltip/description display
5. Integration with existing skill-parser infrastructure

## TEA Assessment
**Tests written: 35 total (32 failing, 3 passing - RED state confirmed)**

Test file: `packages/vscode-extension/tests/MSSCI-12124-sidebar-skills.test.ts`

### Coverage by Acceptance Criteria:

| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 9 | Skills section: collapsible, itemType, icon, count, categories, skills |
| AC2 | 6 | Commands section: collapsible, itemType, icon, agent commands, workflow commands |
| AC3 | 6 | Click-to-invoke: command properties, arguments, command registration |
| AC4 | 5 | Tooltips: skill descriptions, examples, command tooltips, accessibility |
| AC5 | 3 | Search/filter: consistent label format for native tree filtering |
| Integration | 3 | TreeDataProvider routing for new item types |
| Ordering | 2 | Skills/Commands appear after Quick Actions |

### Implementation Requirements for Dev:
1. Add `skills` and `commands` to TreeItemType union
2. Create `createSkillsItem()` and `createCommandsItem()` in getRootChildren()
3. Implement `getSkillsChildren()` returning category items grouped by `skill-registry.yaml` categories
4. Implement `getSkillCategoryChildren(element)` returning skills within a category
5. Implement `getCommandsChildren()` returning slash commands
6. Register `pennyfarthing.invokeSkill` and `pennyfarthing.invokeCommand` in extension.ts
7. Set tooltips with skill descriptions and usage examples
8. Use existing `skill-parser.ts` for skill metadata

**Ready for Dev. Make them GREEN.**

## Dev Assessment
**Implementation Complete:** Yes
**Tests:** 35/35 passing (GREEN)

### Files Changed:
| File | Changes |
|------|---------|
| `providers/sidebar.ts` | Added Skills & Commands sections with category grouping |
| `extension.ts` | Registered `invokeSkill` and `invokeCommand` commands |
| `tests/MSSCI-12124-sidebar-skills.test.ts` | 35 tests covering all ACs |

### Implementation Summary:
1. Extended TreeItemType with `skills`, `commands`, `skill-category`
2. Added category display names mapping (AI & LLM, Development, etc.)
3. Implemented `createSkillsItem()` - collapsed section with lightbulb icon
4. Implemented `getSkillsChildren()` - returns category items with folder icons
5. Implemented `getSkillCategoryChildren()` - returns skill items with tooltips
6. Implemented `createCommandsItem()` - collapsed section with terminal icon
7. Implemented `getCommandsChildren()` - returns slash command items
8. Registered `pennyfarthing.invokeSkill` and `pennyfarthing.invokeCommand` commands

**PR:** #407 - feat(MSSCI-12124): Add skills/commands discovery in VS Code sidebar
**Branch:** feat/MSSCI-12124-skills-commands-sidebar (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #407
**Verdict:** APPROVED

**Code Review Evidence:**

### Data Flow Traced
- **Input:** User clicks skill/command item in sidebar tree → VS Code TreeItem.command triggers
- **Flow:** `pennyfarthing.invokeSkill`/`pennyfarthing.invokeCommand` commands (extension.ts:230-258) → check for activeTerminal → sendText(`/${skillName}`)
- **Fallback:** If no terminal, shows informational message prompting user to run command in Claude terminal
- **Result:** Safe - no user input sanitization issues as skill/command names come from internal registry, not user input

### Wiring Verified
1. **sidebar.ts:131-154** - `loadSkills()` called in constructor, fetches from skill-registry.yaml via `parseSkillRegistry()`
2. **sidebar.ts:131** - Skills cached in `skillsCache` and `skillsByCategory` Map on construction
3. **extension.ts:230-242** - `pennyfarthing.invokeSkill` command registered, properly added to context.subscriptions (line 355)
4. **extension.ts:245-258** - `pennyfarthing.invokeCommand` command registered, properly added to context.subscriptions (line 356)
5. **TreeDataProvider routing** (sidebar.ts:187-192) - `skills`, `commands`, `skill-category` properly routed in `getChildren()`

### Pattern Observed
- Follows existing TreeDataProvider type-dispatching pattern established in sidebar.ts
- Uses same collapsibleState, itemType, iconPath patterns as existing Agent/Sprint/Story sections
- Good use of existing `skill-parser.ts` for metadata (sidebar.ts:59-63) - no code duplication

### Error Handling Verified
- **loadSkills()** (sidebar.ts:140-153): Try-catch with graceful degradation - if workspace unavailable or parsing fails, sets empty arrays
- **getSkillsChildren()** (sidebar.ts:523-526): Null check on skillsByCategory returns empty array
- **getSkillCategoryChildren()** (sidebar.ts:550-559): Null checks on categoryName, skillsByCategory, and skills array
- **invokeSkill/invokeCommand** (extension.ts:234-241, 249-256): Handles missing terminal gracefully with informational message

### Security
- **N/A - No auth changes.** All skill/command names come from internal registries (SLASH_COMMANDS constant and skill-registry.yaml), not from user input
- No injection vectors: terminal.sendText uses template literal with internal data only

### Performance
- Skills loaded once on construction, cached for tree lifetime
- No N+1 - single call to parseSkillRegistry, then Map lookups for category access

**Non-Blocking Observations:**
- [LOW] `SLASH_COMMANDS` hardcoded list (sidebar.ts:89-102) could be out of sync with actual available commands. Consider generating from command-registry.ts in future enhancement.
- [LOW] Skills section shows count like "21 skills" but doesn't auto-refresh if registry changes. Acceptable for MVP - registry changes require extension reload anyway.

**What Passed:**
- All 35 tests pass (289 total for vscode-extension package)
- Lint clean, type check passes
- Follows existing patterns consistently
- Proper null/error handling throughout
- Accessibility labels on all tree items

**Handoff:** To SM for finish-story workflow

## Workflow Tracking

### Phase History
| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| setup | SM | completed | 2026-01-21 |
| red | TEA | completed | 2026-01-21 |
| green | Dev | completed | 2026-01-21 |
| review | Reviewer | completed | 2026-01-21 |
| finish | SM | in_progress | 2026-01-21 |

### Handoff History
| From | To | Gate | Result |
|------|----|----|--------|
| SM → TEA | tests_fail | PASSED | 2026-01-21 |
| TEA → Dev | tests_pass | PASSED | 2026-01-21 |
| Dev → Reviewer | approval | PASSED | 2026-01-21 |
| Reviewer → SM | approval (APPROVED) | PASSED | 2026-01-21 |
