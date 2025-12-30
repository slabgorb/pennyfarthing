# Changelog

All notable changes to Pennyfarthing are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes*

---

## [3.8.0] - 2025-12-30

### Added
- **Theme Version Tracking** - Custom themes now include `pennyfarthing_version` metadata
  - `agent-session.sh` warns when theme was created with older Pennyfarthing version
  - Compares major.minor only (ignores patch versions)
  - Warning displayed but doesn't block theme usage
- **Theme-maker Documentation** - Comprehensive user docs in COMMANDS.md and PERSONAS.md
  - All three creation modes documented with examples
  - Mode comparison tables and workflow examples

---

## [3.7.1] - 2025-12-30

### Added
- **Guided Mode for Theme-maker** - Story 6-3 delivered step-by-step character selection
  - AI suggests 3-4 character options per agent
  - Users choose or provide custom names
  - Go-back capability for editing previous selections
  - Preview before finalizing

### Fixed
- **Multi-repo Config** - `git-status-all` and `git-cleanup` now honor `repos.yaml` configuration

---

## [3.7.0] - 2025-12-29

### Added
- **Interactive Theme Wizard** (`/theme-maker`) - Epic 6 Stories 6-1 and 6-2
  - Mode selection: AI-Driven, Guided, Manual
  - AI-Driven mode generates all 10 agent personas from concept description
  - Theme schema validation with `validateThemeSchema()`
  - Preview and regenerate workflow
- **Agent Permission Scopes** - Story 4-4 adds agent-specific tool allowlists
  - Each agent can define custom permission scopes
  - Documented in PERMISSIONS.md
- **Hooks Configuration** - Story 4-3 adds hooks section to configuration
  - Session hooks documented with examples
- **Configurable Context Thresholds** - Story 4-2 adds `context_budget` settings
  - Customizable warning/critical thresholds for context usage

### Changed
- **Scripts Isolation** - Story 4-6 isolates Pennyfarthing scripts from project `/scripts`
  - Scripts now in `.claude/pennyfarthing/scripts/`
  - Standardized `PROJECT_ROOT` detection across all scripts

### Fixed
- **Misplaced File Warnings** - CLI now warns about custom files in managed directories during update

---

## [3.6.1] - 2025-12-28

### Added
- **Release Automation** - `deploy.sh` now auto-updates CHANGELOG.md during releases
  - Adds version header with date
  - Updates version comparison links
  - Warns if `[Unreleased]` section is empty
  - Includes CHANGELOG.md in version bump commit

---

## [3.6.0] - 2025-12-28

### Added
- **Crew Manifest** - Agents now see all character names in their theme during session start, enabling in-universe addressing during handoffs (e.g., "Naomi, the tests are yours" instead of "hand off to TEA")
- **Sprint 3 Planning** - Epic 6 (Interactive Theme Wizard) added with Jira sync

### Changed
- **License** - Changed from MIT to All Rights Reserved (Copyright 2025 1898 & Co.)

---

## [3.5.3] - 2025-12-28

### Fixed
- **Session Hook Logging** - Session start hook now logs actual event source (started, clear, etc.) instead of hardcoding "Session started" for all events

---

## [3.5.2] - 2025-12-28

### Fixed
- **Statusline Agent Cleanup** - Moved agent cleanup from Stop hook to SessionStart hook for more reliable state reset between sessions

---

## [3.5.1] - 2025-12-28

### Added
- **User Preferences** - New `.claude/pennyfarthing/preferences.yaml` for customizing agent behavior
  - `character_voice`: Enable/disable persona flavor text
  - `explain_decisions`: Show reasoning in output
  - `auto_commit`: Auto-commit on story completion
- **Output Styles** - Three styles shipped in `pennyfarthing-dist/output-styles/`
  - `verbose.md` - Detailed explanations
  - `terse.md` - Minimal output
  - `teaching.md` - Educational with alternatives

### Changed
- `agent-session.sh` respects `character_voice` preference
- `pennyfarthing init` creates preferences file with defaults

---

## [3.5.0] - 2025-12-28

### Added
- **Sidecar Templates** - New templates in `pennyfarthing-dist/templates/sidecar/`
  - `patterns.md.template`, `gotchas.md.template`, `decisions.md.template`
  - Templates have section headers and placeholder prompts
- `pennyfarthing init` now installs templated sidecar content instead of empty files

### Fixed
- **Statusline Installation** - Fixed incorrect source path in `init.ts` and `update.ts`
  - Now correctly copies from `pennyfarthing-dist/scripts/statusline.sh`
  - Legacy locations cleaned up during update
  - Hook path in settings.local.json points to correct location

---

## [3.4.0] - 2025-12-27

### Added
- **Theme CLI Commands** - Full theme management from command line
  - `pennyfarthing theme list` - Shows available themes with current marked
  - `pennyfarthing theme set <name>` - Changes active theme
  - `pennyfarthing theme show [name]` - Displays theme details
  - `pennyfarthing theme create <name>` - Creates custom theme from template

---

## [3.3.0] - 2025-12-26

### Added
- **Sprint Metrics Script** - `scripts/utils/sprint-metrics.sh` displays sprint stats
  - Points completed/remaining/percentage
  - Days remaining in sprint
- **Auto-PR Flag** - `--auto-pr` flag in finish-story flow triggers automatic PR creation

---

## [3.2.0] - 2025-12-25

### Changed
- **Subagent Format Migration** - All 13 subagents converted to Claude Code's official YAML frontmatter format
  - Each has `name`, `description`, `tools`, `model` fields in `---` delimited header
  - Auto-discovered by Claude Code from `.claude/agents/`

---

## [3.1.0] - 2025-12-25

### Changed
- **Sidecar Pruning** - Reduced sidecar content by 82% (4,157 → 755 lines)
  - Each agent sidecar now has 5-15 relevant entries
  - Standardized to patterns/gotchas/decisions format
  - Original content archived to `sprint/archive/sidecar-archive/`

---

## [3.0.0] - 2025-12-24

### Added
- **Official Subagents** - All 12 subagents migrated to Claude Code's official agent format
  - SM: `workflow-status-check`, `sm-work-research`, `sm-file-summary`, `sm-story-setup`, `sm-finish-bookkeeping`, `sm-finish-execution`
  - TEA: `tea-handoff`, `testing-runner`
  - Dev: `dev-handoff`
  - Reviewer: `reviewer-preflight`, `reviewer-handoff-approve`, `reviewer-handoff-reject`
- **Centralized Error Handling** - Error recovery protocol in `tactical-agent-behavior.md`
  - Subagents return `status: success|blocked` with structured data
  - Callers handle retries (max 2) and escalation
  - Common failures table for quick diagnosis
- **Markdownlint Config** - `.markdownlint.json` for consistent documentation style
- **Automated Jira Sync** - SM finish workflow automatically transitions Jira issues to Done

### Changed
- **BREAKING: Session File Naming** - Renamed from `current_work.md` to `{story-id}-session.md`
  - Files now named after story ID: `2-1-session.md`, `5-3a-session.md`
  - Enables parallel work with multiple active stories
  - Agents scan `.session/*-session.md` and check Phase field
  - Worktree info stored inside session file, not in filename
- **Scripts Structure** - `scripts/` now symlinks to `pennyfarthing-dist/scripts/`
  - Single source of truth eliminates sync issues
  - Removed legacy scripts (`health-check.sh`, `init-project.sh`) - use CLI instead
  - Only `deploy.sh` remains as pennyfarthing-specific script
- **CLI Scripts Path** - Scripts now install to `.claude/pennyfarthing/scripts/`
  - Previously installed to `scripts/` directly
  - Projects can symlink `scripts/` to `.claude/pennyfarthing/scripts/` for single source
  - Hooks path updated: `.claude/pennyfarthing/scripts/hooks/session-start.sh`
- **Subagent Invocation** - Changed from template files to `subagent_type: "{name}"` format
- **Agent Files Updated** - `dev.md`, `tea.md`, `sm.md`, `reviewer.md` use official subagents
- **Documentation Updated** - AGENTS.md, ARCHITECTURE.md, USER-GUIDE.md, README.md reflect new structure

### Fixed
- **Statusline PROJECT_ROOT** - Fixed path calculation after v2.2.0 restructure
  - Now uses `$CLAUDE_PROJECT_DIR` (available in statusLine context)
  - Fallback to script-based detection for edge cases
- **Permissions Documentation** - PERMISSIONS.md documents all current allowlist entries

---

## [2.2.0] - 2025-12-24

### Changed
- **BREAKING:** Restructured installation paths for clarity and single source of truth
  - Source directory renamed from `assets/` to `pennyfarthing-dist/`
  - Flattened structure: removed nested `core/` directory
  - Install location changed from `.claude/core/` to `.claude/pennyfarthing/`
  - Symlinks now point from `.claude/*` to `.claude/pennyfarthing/*`
- StatusLine path automatically migrates from old to new location on update

### Removed
- All submodule migration code (deprecated, no consumers)
  - Deleted `migrate.ts` and related functions
  - Removed `--migrate` CLI option
  - Removed submodule detection from doctor command

### Fixed
- Update command now runs settings merge before "already up to date" check
- `hasSubmodule` detection no longer incorrectly flags new installation structure

---

## [2.1.3] - 2025-12-24

### Fixed
- YAML syntax errors in `discworld.yaml` theme - 8 helper style strings with quotes followed by unquoted text now properly escaped
- Status line path in USER-GUIDE.md - corrected to `$CLAUDE_PROJECT_DIR/.claude/statusline.sh`

---

## [1.5.1] - 2025-12-23

### Added
- `/release` command for merge-and-push workflow
- `scripts/release.sh` - Release script with optional version bump

### Changed
- Switched default theme to Star Trek TOS
- Simplified persona definitions (consolidated catchphrases/quirks into trait/quote fields)

---

## [1.5.0] - 2025-12-22

### Changed
- **Story 1-4a Complete:** Integrated `repo-scan.sh` into `workflow-status-check.md` subagent
- Reduced `workflow-status-check.md` from 255 lines to <200 lines

### Added
- Jira keys synced for split stories 1-4b, 1-4c, 1-4d

---

## [1.4.1] - 2025-12-22

### Added
- **Story 1-3 Complete:** Resilience utilities for robust agent workflows
  - `scripts/utils/retry.sh` - Exponential backoff with `retry_with_backoff` and `command_with_fallback`
  - `scripts/utils/checkpoint.sh` - Session state persistence with save/restore/rotate functions
- **Story 1-4a Started:** `scripts/utils/repo-scan.sh` - Cross-repo git status scanning
- Shakespeare theme (`literary-classics` enhanced with Hamlet characters)

### Fixed
- Session environment variables now use `CLAUDE_ENV_FILE` correctly

---

## [1.4.0] - 2025-12-22

### Added
- Star Trek TOS theme (Kirk, Spock, McCoy, Scotty)
- Jane Austen theme (literary-classics expansion)
- Enhanced all existing themes with richer character definitions

### Fixed
- Deploy script simplified to always use main branch
- Branch detection no longer produces error output

---

## [1.3.0] - 2025-12-22

### Added
- **Story 1-1 Complete:** Expanded 10 agent command files with XML directive pattern
  - `dev.md`, `tea.md`, `reviewer.md`, `sm.md`, `pm.md`
  - `architect.md`, `orchestrator.md`, `devops.md`, `tech-writer.md`, `ux-designer.md`
  - Each file now 51-69 lines with consistent structure
- **Story 1-2 Complete:** Strategic agent behavior guide (349 lines)
  - PM ↔ Architect coordination patterns
  - Approval gates and escalation rules
  - Sprint planning ceremony workflow
- **Story 1-5 Complete:** Epic context guardrail
  - `/new-work` validates epic context exists before story selection
  - Integrated into `workflow-status-check.md` subagent
- Deploy script for version bumping and releases (`scripts/deploy.sh`)

---

## [1.2.0] - 2025-12-22

### Added
- Automatic persona loading via `agent-session.sh`
- Flexible multi-repo configuration system
- `/parallel-work` command for worktree mode
- Behavior hierarchy and prompt patterns documentation
- Active sidecar memory system for agent learning

### Changed
- Renamed `core/docs` to `core/guides`
- Simplified agent command files structure
- Converted agent core sections to XML tags

---

## [1.1.0] - 2025-12-21

### Added
- VERSION file for tracking releases
- Comprehensive framework documentation
- Missing skills: `testing`, `just`, `dev-patterns`
- Reference integrity checker (test infrastructure)

### Changed
- Generalized framework and renamed from BMAD to Pennyfarthing

---

## [1.0.0] - 2025-12-21

### Added
- Initial Pennyfarthing framework release
- **Core Agents** (11 agents)
  - Strategic: Orchestrator, PM, SM, Architect, DevOps
  - Tactical: TEA, Dev, Reviewer
  - Support: Tech Writer, UX Designer
- **Subagents** (13 Haiku-based handoff coordinators)
- **Commands** (23 slash commands)
- **Persona System**
  - Discworld theme
  - Star Trek TNG theme
  - Literary Classics theme
  - Minimalist theme
- **Skills** (10 project-agnostic knowledge domains)
  - agentic-patterns, context-engineering, code-review
  - testing, story-management, sprint-context
  - jira-cli, just, dev-patterns, persona-benchmark
- **TDD Workflow:** SM → TEA → Dev → Reviewer → SM
- Session file system (`.session/current_work.md`)
- Sprint tracking (`sprint/current-sprint.yaml`)
- Project initialization script (`scripts/init-project.sh`)
- Agent session management (`scripts/agent-session.sh`)

---

[Unreleased]: https://github.com/1898andCo/pennyfarthing/compare/v3.8.0...HEAD
[3.8.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.7.1...v3.8.0
[3.7.1]: https://github.com/1898andCo/pennyfarthing/compare/v3.7.0...v3.7.1
[3.7.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.6.1...v3.7.0
[3.6.1]: https://github.com/1898andCo/pennyfarthing/compare/v3.6.0...v3.6.1
[3.6.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.5.3...v3.6.0
[3.5.3]: https://github.com/1898andCo/pennyfarthing/compare/v3.5.2...v3.5.3
[3.5.2]: https://github.com/1898andCo/pennyfarthing/compare/v3.5.1...v3.5.2
[3.5.1]: https://github.com/1898andCo/pennyfarthing/compare/v3.5.0...v3.5.1
[3.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v2.2.0...v3.0.0
[2.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v2.1.3...v2.2.0
[2.1.3]: https://github.com/1898andCo/pennyfarthing/compare/v1.5.1...v2.1.3
[1.5.1]: https://github.com/1898andCo/pennyfarthing/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/1898andCo/pennyfarthing/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/1898andCo/pennyfarthing/releases/tag/v1.0.0
