# Story MSSCI-12050: Command palette integration

## Story Details
- **ID:** MSSCI-12050
- **Jira:** MSSCI-12050
- **Epic:** VS Code Extension for Pennyfarthing (MSSCI-12042)
- **Points:** 2
- **Priority:** P1
- **Workflow:** tdd
- **Repos:** pennyfarthing
- **Branch:** feat/MSSCI-12050-command-palette-integration

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-21T06:52:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T06:17:25Z | 2026-01-21T06:19:11Z | 1m 46s |
| dev | 2026-01-21T06:19:11Z | 2026-01-21T06:40:00Z | 20m 49s |
| review | 2026-01-21T06:40:00Z | 2026-01-21T06:52:00Z | 12m 0s |
| finish | 2026-01-21T06:52:00Z | - | - |

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|----|----|--------|-----------|
| dev | review | tests_pass | PASSED | 2026-01-21T06:40:00Z |
| review | finish | approval | PASSED | 2026-01-21T06:52:00Z |

## Technical Context

### Current State
The VS Code extension (`packages/vscode-extension/`) has 6 commands registered in `package.json`:
- `pennyfarthing.showStatus` - Basic status message
- `pennyfarthing.switchAgent` - QuickPick for agent switching
- `pennyfarthing.viewBacklog` - Sends `/sprint` to terminal
- `pennyfarthing.startWork` - Sends `/work` to terminal
- `pennyfarthing.refresh` - Refreshes sidebar
- `pennyfarthing.openJira` - Opens Jira issue in browser

These commands are hardcoded in `extension.ts` (lines 53-170). The story requires a dynamic approach that reads skill metadata.

### Data Source
The skill registry at `pennyfarthing-dist/skills/skill-registry.yaml` provides:
- Skill names, descriptions, categories
- Example invocations (e.g., `/sprint status`, `/jira assign`)
- Related skills and keywords

Individual skill files (e.g., `pennyfarthing-dist/skills/sprint/skill.md`) have YAML frontmatter with:
- `name`, `description`, `args` fields
- Can be parsed for command variants

### Technical Approach
1. **Create skill parser module** - `src/commands/skill-parser.ts`
   - Parse `skill-registry.yaml` for high-level metadata
   - Parse individual skill frontmatter for args/variants
   - Export structured command metadata

2. **Create command registry** - `src/commands/command-registry.ts`
   - Register VS Code commands dynamically from parsed skills
   - Use consistent naming: `pennyfarthing.skill.{name}` (e.g., `pennyfarthing.skill.sprint`)
   - Add subcommands for variants: `pennyfarthing.skill.sprint.status`

3. **Update package.json** - Add command contributions dynamically or via build step
   - Option A: Generate commands section at build time
   - Option B: Use dynamic command registration (no package.json entries needed for QuickPick)

4. **QuickPick integration** - Master command for skill search
   - `pennyfarthing.runSkill` - Opens searchable QuickPick with all skills
   - Filters by category, shows descriptions
   - Sends selected skill command to active terminal

### Files to Modify
| File | Changes |
|------|---------|
| `packages/vscode-extension/src/commands/skill-parser.ts` | NEW: Parse skill-registry.yaml and frontmatter |
| `packages/vscode-extension/src/commands/command-registry.ts` | NEW: Dynamic VS Code command registration |
| `packages/vscode-extension/src/extension.ts` | Wire up command registry, add `runSkill` command |
| `packages/vscode-extension/package.json` | Add `pennyfarthing.runSkill` command entry |

### Dependencies
- `yaml` or `js-yaml` package for parsing YAML (or use existing yq-like approach)
- Alternatively, parse at build time with Node's built-in YAML support

## Acceptance Criteria
- [x] AC1: Skills from `skill-registry.yaml` appear in command palette via `pennyfarthing.runSkill`
- [x] AC2: Selecting a skill sends the appropriate `/skill` command to active terminal
- [x] AC3: Skills are searchable by name, description, and keywords
- [x] AC4: Categories are shown in QuickPick for grouping/filtering

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/vscode-extension/src/commands/skill-parser.ts` - Parse skill-registry.yaml, extract metadata, category grouping
- `packages/vscode-extension/src/commands/command-registry.ts` - Register pennyfarthing.runSkill command, QuickPick with categories
- `packages/vscode-extension/src/extension.ts` - Wire up registerSkillCommands on activation
- `packages/vscode-extension/package.json` - Add pennyfarthing.runSkill command contribution

**Tests:** 123/123 passing (GREEN)
**PR:** #394 - feat(vscode): add command palette skill integration (MSSCI-12050)
**Branch:** feat/MSSCI-12050-command-palette-integration (pushed)

**Notes:**
- Uses new WheelHub-free pattern - no dependency on WheelHub adapter
- Direct terminal integration via vscode.window.activeTerminal.sendText()
- Graceful fallback: copies command to clipboard if no terminal available

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #394
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** Skill name from `skill-registry.yaml` (skill-parser.ts:84 regex `[a-z-]+`) → `SkillMetadata.name` → `executeSkillInTerminal` (command-registry.ts:150) → `terminal.sendText()` (command-registry.ts:167). Safe - input constrained to alphanumeric.
- **Wiring verified:** Lazy import at extension.ts:46-48, registered at line 95-96, command accessible via `pennyfarthing.runSkill`
- **Pattern observed:** Follows WheelHub-free pattern - direct terminal integration without adapter layer
- **Error handling:** Graceful fallbacks at skill-parser.ts:56 (missing file → empty array), command-registry.ts:50-54 (no skills → warning), command-registry.ts:171-187 (no terminal → clipboard copy)

**Security:** Path traversal prevented via `path.join()` with workspace root (skill-parser.ts:45-55). No command injection - skill names regex-constrained to `[a-z-]+`.

**Performance:** File read only on command invocation (lazy loading), no startup impact.

**Non-Blocking Observations:**
- [LOW] `registerIndividualSkillCommands` exported but unused (command-registry.ts:194-220) - future feature or dead code
- [LOW] `filterSkills` exported but unused (skill-parser.ts:224-252) - QuickPick handles filtering natively
- [LOW] `skillsToQuickPickItems` could be inlined - only used in one location

**Handoff:** To SM for finish-story workflow

## Testing Strategy
- Unit test skill parser with mock YAML
- Unit test command registry registration
- Integration test QuickPick shows correct skills
- Manual test: Ctrl+Shift+P → "Pennyfarthing: Run Skill" → search → executes in terminal

## Dependencies & Risks
| Risk | Mitigation |
|------|------------|
| YAML parsing adds bundle size | Use native Node YAML or parse at build time |
| Package.json command limit | Use dynamic registration with QuickPick approach |
| Skill files missing frontmatter | Graceful fallback to skill-registry.yaml only |
