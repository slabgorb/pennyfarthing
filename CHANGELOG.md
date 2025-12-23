# Changelog

All notable changes to Pennyfarthing are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/1898andCo/pennyfarthing/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/1898andCo/pennyfarthing/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/1898andCo/pennyfarthing/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/1898andCo/pennyfarthing/releases/tag/v1.0.0
