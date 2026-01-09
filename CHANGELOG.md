# Changelog

All notable changes to Pennyfarthing are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes*

---

## [6.0.4] - 2026-01-09

### Fixed

#### Cyclist Bug Fixes
- **Clear Stale Data** - `/clear` now properly resets tool events, tool stats, and context percentage
- **Focus Stealing** - Changed Files panel no longer steals focus when new diffs arrive
- **Panel Resizers** - Fixed resizers not allowing panel expansion (main-content min-width issue)

### Added

#### Cyclist Enhancements
- **Open in Editor** - Click file path in diff header to open file in `$EDITOR`
  - Supports VS Code, Cursor, Vim, Neovim, Emacs, Sublime
  - Falls back to generic editor launch
- **Diff Panel Resize** - Diff panel now supports drag-to-resize (matching file panel)
- **CSS Variables** - Standardized panel dimensions via `--sidebar-width`, `--panel-min-width`, `--panel-default-width`

---

## [6.0.3] - 2026-01-09

### Fixed
- **Changed Files Panel** - Fixed SDK message structure parsing for Edit/Write tools
- **SDK Message Gotcha** - Documented Claude SDK message structure in dev sidecar

---

## [6.0.0] - 2026-01-08

### Major Release: Monorepo Consolidation & Cyclist Integration

This release restructures Pennyfarthing as a **pnpm workspace monorepo** and integrates Cyclist as the official GUI companion.

### BREAKING CHANGES

- **Monorepo Structure** - Project converted from single package to pnpm workspace
  - Root package is now `pennyfarthing-monorepo` (private)
  - Core functionality in `packages/core` (published as `pennyfarthing`)
  - Cyclist GUI in `packages/cyclist` (published as `@pennyfarthing/cyclist`)
  - Shared utilities in `packages/shared` (published as `@pennyfarthing/shared`)

### Added

#### Epic 11: Cyclist-Pennyfarthing Monorepo Consolidation
- **Story 11-1: @pennyfarthing/shared Package**
  - Portrait resolver with multi-environment support (monorepo, npm, Electron)
  - `resolvePortraitPath(theme, agent)` - finds portrait files across all install scenarios
  - `resolvePennyfarthingDist()` - locates pennyfarthing-dist directory
- **Story 11-2: pnpm Workspace Structure**
  - Three-package architecture with proper cross-references
  - Workspace-level scripts: `pnpm build`, `pnpm test`, `pnpm dev`
  - ADR-002 documents architectural decision
- **Story 11-3: Cyclist Migration**
  - Cyclist integrated as `@pennyfarthing/cyclist`
  - Preserves all existing Cyclist functionality
  - Uses shared portrait resolver for sidebar persona display

#### New Themes (3)
- **Arthurian Mythos** - Knights of the Round Table (Arthur, Lancelot, Merlin, Morgan le Fay)
- **Greek Mythology** - Olympian gods and heroes (Zeus, Athena, Hephaestus, Hermes)
- **Lovecraft Mythos** - Cosmic horror entities (Nyarlathotep, Yog-Sothoth, Elder Things)

### Changed
- **Portrait Filenames** - Now use OCEAN-slug format (`arthur-45452.png` instead of `sm.png`)
  - Generation script updated to extract shortName and OCEAN scores
  - Cyclist resolves portraits using character slugs for theme consistency
- **Package Manager** - Switched from npm to pnpm for workspace support

### Fixed
- **Cyclist Portrait Display** - Portraits now appear correctly in sidebar for all themes
- **TypeScript Compilation** - Explicit Express types for pnpm workspace compatibility

### Summary
| Metric | Value |
|--------|-------|
| Epic Completed | 1 (Epic 11 - partial) |
| Stories Completed | 3 |
| Points Delivered | 13 |
| New Themes | 3 (94 total) |
| New Characters | 30 |
| Packages | 3 (@pennyfarthing/core, @pennyfarthing/cyclist, @pennyfarthing/shared) |

---

## [5.3.0] - 2026-01-06

### Context Circuit Breaker & Choreography Patterns

This release completes Epic 3 (Context Management) and Epic 10 (Choreography Patterns), adding robust context overflow protection and comprehensive multi-agent coordination documentation.

### Added

#### Epic 3: Context Management & Circuit Breaker (Complete)
- **`/continue-session` Command** (Story 3-4) - Resume work after context circuit breaker triggers
  - Scans `.session/checkpoints.log` for saved checkpoints
  - Interactive checkpoint selection with timestamps
  - Restores phase, context summary, and file references
  - Routes to appropriate agent (TEA, Dev, or Reviewer) based on saved phase
  - Handles edge cases: no checkpoints, stale checkpoints (>24h), multiple options
- **Context Circuit Breaker Hook** (Story 3-3) - Hard stop at 85% context usage
  - PreToolUse hook blocks further tool calls when threshold exceeded
  - Provides clear recovery instructions pointing to `/continue-session`
  - Checkpoint conventions documented: `phase:{story-id}`, `context:{story-id}`, `files:{story-id}`

#### Epic 10: Multi-Agent Choreography Patterns (Complete)
- **TDD Flow Pattern** (Story 10-1) - `guides/patterns/tdd-flow-pattern.md`
  - SM → TEA → Dev → Reviewer state machine
  - Handoff triggers and error recovery paths
  - 402 lines of comprehensive documentation
- **Helper Delegation Pattern** (Story 10-2) - `guides/patterns/helper-delegation-pattern.md`
  - Opus → Haiku delegation criteria
  - Prompt construction and result handling
  - Anti-patterns and best practices (488 lines)
- **Fan-Out/Fan-In Pattern** (Story 10-3) - `guides/patterns/fan-out-fan-in-pattern.md`
  - Parallel agent execution with Task tool
  - Result aggregation strategies
  - Error handling for partial failures (574 lines)
- **Approval Gates Pattern** (Story 10-4) - `guides/patterns/approval-gates-pattern.md`
  - Human-in-the-loop approval mechanisms
  - Plan mode vs AskUserQuestion decision tree
  - Integration with TDD flow (746 lines)

### Summary
| Metric | Value |
|--------|-------|
| Epics Completed | 2 (Epic 3, Epic 10) |
| Stories Completed | 6 |
| Points Delivered | 15 |
| New Commands | 1 (`/continue-session`) |
| Pattern Guides | 4 (2,210 lines total) |

---

## [5.2.0] - 2026-01-05

### Job Fair: Data-Driven Role Optimization

This release introduces systematic character-to-role benchmarking and applies optimizations across 53 themes.

### Added

#### Job Fair Benchmarking Infrastructure
- **Cross-role testing** - `--as` flag for `/solo` command to run any character as any role
- **`/job-fair` command** - Systematic evaluation of all characters in a theme against all roles
- **Model/cost tracking** - Per-run metrics for better observability
- **Cohen's d effect sizes** - Statistical comparison in leaderboards
- **Leaderboard persona column** - Show character names alongside role performance

#### Developer Experience
- **`--dogfood` flag** - `pennyfarthing doctor --dogfood` runs internal health checks for framework developers
- **Git branch protection** - Pre-commit and pre-push hooks prevent direct main commits
- **Sprint 6 documentation** - Retro and Cyclist API docs added

### Changed

#### Theme Optimizations (53 themes)
Role reassignments based on benchmark performance data. Notable improvements:
- **lord-of-the-rings**: Gandalf→dev (+8.12), Aragorn→orchestrator, Gollum→reviewer
- **princess-bride**: Inigo Montoya→dev (+7.50), Fezzik→tea
- **marvel-mcu**: Phil Coulson→dev (+6.25), Tony Stark→sm
- **breaking-bad**: Walter White→tea, Jesse Pinkman→dev, Hank→sm
- And 49 more themes with `JOB FAIR OPTIMIZED` markers and delta scores

#### Maintenance
- **Portrait reorganization** - Renamed and realigned after role swaps
- **shortName standardization** - Consistent across all 91 theme files

### Fixed
- Shell command patterns to avoid zsh parse errors
- Bash permission prefix matching with correct colon syntax
- Test path updates for relocated showcase in `internal/`

### Summary
| Metric | Value |
|--------|-------|
| Themes Optimized | 53 |
| New Commands | 1 (`/job-fair`) |
| New Flags | 2 (`--as`, `--dogfood`) |

---

## [5.1.1] - 2026-01-04

### Added

#### Epic 8: Automatic State Reconciliation (Complete)
- **Git Hook for PR Merge Detection** (Story 8-1)
  - Post-merge hook detects when PR branches are merged
  - Automatically archives completed story sessions
  - Updates sprint YAML status to done
  - Cleans up stale session files on branch switch

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 1 |
| Points Delivered | 3 |

---

## [5.1.0] - 2026-01-04

### Sprint 6 Complete: Showcase Website, TRAIL-OCEAN Research, Cyclist Integration

This release completes three major epics with 65 story points delivered.

### Added

#### Epic 13: Pennyfarthing Showcase Website (Complete)
- **Query Builder** - Interactive OCEAN expression parser for filtering characters
- **Comparison View** - Side-by-side character comparisons with overlay spider charts
- **Benchmark Reports** - Pre-rendered performance data from Epic 12
- **Shareable URLs** - Comparison state encoded in URL parameters
- **Favorites System** - localStorage persistence for saved characters
- **Character Portraits** - Woodcut-style sprite sheets for all 91 themes

#### Epic 14: TRAIL-OCEAN Correlation Research (Complete)
- **OCEAN x Error-Type Heat Map** - Visualization of personality-error correlations
- **Debugging Scenarios Complete** - All 5 TRAIL-tagged scenarios implemented

#### Epic 15: Cyclist-Pennyfarthing Integration (Complete)
- **`pennyfarthing cyclist` Command** - Launch Cyclist with Pennyfarthing context
- **Metadata Module** - Real-time persona, story, and git status in Cyclist sidebar
- **Sprite Symlinks** - Shared portrait assets between showcase and Cyclist
- **Statusbar Detection** - Automatically disabled when running in Cyclist

### Changed
- **Dev assets relocated** - `showcase/` and `results/` moved to `internal/` folder
- **npm package cleaner** - `.npmignore` excludes `internal/` from distribution
- **Theme count** - Now 91 themes (up from 63)

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 26 |
| Points Delivered | 65 |
| Themes | 91 |
| Characters | 910 |
| Showcase Pages | 1006 |

---

## [5.0.1] - 2026-01-02

### Changed
- **Benchmark commands moved to user level** - `/solo`, `/benchmark`, `/benchmark-control` now available globally via `~/.claude/commands/`
- **Benchmark skills moved to user level** - `judge` and `finalize-run` skills now at `~/.claude/skills/`

### Removed
- Project-level benchmark commands (`.claude/project/commands/`) - superseded by user-level

---

## [5.0.0] - 2026-01-02

### Major Release: Scientific Benchmarking & Showcase Website

This release marks a significant milestone with two major additions:
1. **Scientific Benchmarking System** - Complete persona evaluation framework migrated from Thunderdome
2. **Showcase Website** - Interactive website for browsing themes and personality profiles

### Added

#### Epic 12: Scientific Benchmarking Migration
- **`/solo` Command** - Single agent evaluation against scenarios
  - Runs agents on standardized challenges
  - Supports theme:role specification (e.g., `discworld:reviewer`)
  - Configurable runs with `--runs N`
  - Results saved to `results/solo/`
- **`/benchmark-control` Command** - Create control baselines
  - Run 10+ iterations to establish statistical baseline
  - Required before comparing personas
  - Results saved to `results/baselines/`
- **`/benchmark` Command** - Compare persona against baseline
  - Statistical analysis with Cohen's d effect size
  - 95% confidence intervals
  - Results saved to `results/benchmarks/`
- **`/judge` Skill** - Evaluation rubrics for scoring responses
  - Generic rubric (correctness, depth, quality, persona)
  - Checklist rubric for scenarios with expected issues
  - `--mode error-detection` for TRAIL-aware scoring
- **`/finalize-run` Skill** - Result validation and persistence
  - Proof-of-work fields (timestamps, token counts)
  - Data integrity validation
- **Scenarios Library** - 24+ standardized challenges
  - Categories: architecture, code-review, dev, sm, tea, debugging
  - Schema validation for scenario format
  - SWE-bench integration for ground-truth evaluation
- **BENCHMARKING.md** - Comprehensive documentation

#### Epic 13: Pennyfarthing Showcase Website (Partial)
- **Astro Project** - Static site generator with React islands
  - Tailwind CSS styling
  - TypeScript strict mode
  - Build output to `docs/` for GitHub Pages
- **Theme Data Loader** - Build-time YAML → JSON pipeline
  - All 63 themes loaded at build time
  - Type-safe TypeScript interfaces
  - `themes.json` (~600KB) for client queries
- **Theme Gallery Page** - Browse all 64 themes
  - Team overlay spider chart thumbnails
  - Filter by source type, search, sort
  - Responsive grid layout
- **Theme Detail Pages** - 64 generated pages
  - Full-size team overlay spider chart
  - 10 ProfileCard components per theme
- **Character Profile Pages** - 640 generated pages
  - Large Chernoff face + spider chart
  - OCEAN scores with visual bars
  - Character details, quotes, catchphrases

#### Epic 14: TRAIL-Inspired OCEAN Correlation Research
- **Error Type Taxonomy** - Extended scenario schema
  - `error_type` field: reasoning, planning, execution
  - Based on TRAIL benchmark categories
- **TRAIL-OCEAN Hypothesis Mapping** - Research document
  - A priori predictions for OCEAN → error detection
  - Testable hypotheses for each TRAIL category
- **Debugging Scenarios** - 10 new challenges
  - Tagged with TRAIL error types
  - Mix of single-type and mixed-type scenarios
  - 61 baseline issues across scenarios
- **Error-Detection Mode** - Enhanced `/judge` skill
  - Per-type detection rates
  - Strengths/weaknesses by error type

### Changed
- **Benchmark Integration Module** - Now reads from local `results/` directory
  - Configurable via `BENCHMARK_PATH` environment variable
  - Graceful fallback for missing paths
- **Sprint Tracking** - Split completed.yaml from current-sprint.yaml
  - Sprints 2-5 archived to `sprint/completed.yaml`
  - Current sprint file reduced from ~1900 to ~250 lines

### Summary
| Metric | Value |
|--------|-------|
| New Commands | 3 (`/solo`, `/benchmark`, `/benchmark-control`) |
| New Skills | 2 (`/judge`, `/finalize-run`) |
| Scenarios | 24+ (6 categories) |
| Showcase Pages | 768 (64 themes + 64 detail + 640 characters) |
| TRAIL Hypotheses | 9 (3 error types × 3 predictions) |
| Debugging Scenarios | 10 (61 tagged issues) |

---

## [4.3.0] - 2026-01-01

### Sprint 4 Release: OCEAN Personality Visualization

This release completes Epic 11 - a comprehensive personality visualization system for all 630 Pennyfarthing characters across 63 themes.

### Added
- **Report Generators** (11-7, 11-12)
  - `src/scripts/generate-report.ts` - Chernoff face report generator with filtering
  - `src/scripts/generate-spider-report.ts` - Spider chart report generator
  - Filter by role, theme, or OCEAN dimension
  - Comparison mode for side-by-side character analysis
- **Benchmark Integration** (11-8)
  - `src/scripts/benchmark-integration.ts` - OCEAN-performance correlation analysis
  - `correlateWithBenchmark()`, `findOptimalProfiles()`, `analyzeRolePerformance()`
  - Identifies personality traits that predict task success
- **Local Theme Settings** (BL-1)
  - Theme preference stored in `.claude/persona-config.local.yaml`
  - Multiple developers can use different themes on same project
  - Project-level theme serves as team default

### Fixed
- **Gitignore for Local Config** (BL-2) - `pennyfarthing init` now adds `persona-config.local.yaml` to `.gitignore`

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 14 |
| Points Delivered | 40 |
| OCEAN Profiles | 630 |
| SVG Faces | 630 |
| Spider Charts | 693 (630 individual + 63 team overlays) |
| Tests | 588 |

---

## [4.2.3] - 2026-01-01

### Added
- **OCEAN Spider Chart Generator** (11-10) - Pentagon radar charts for OCEAN visualization
  - `src/scripts/generate-spider.ts` - Creates 5-axis spider chart SVGs
  - Overlay mode compares 2-3 characters on same chart
  - Complementary view to Chernoff faces for analytical comparison

### Changed
- **Spider Chart Design Refinements** (11-11)
  - Black background with role-specific colors (10 colors for 10 agent types)
  - Team overlay charts showing all 10 agents per theme (63 overlays)
  - Tactical agent emphasis with thicker strokes (SM, TEA, Dev, Reviewer)
  - Centered layout with vertical markdown indices
- **Face Chart Layout** - Updated to vertical markdown indices to match spider charts

---

## [4.2.2] - 2026-01-01

### Fixed
- **Statusline Character Name Parsing** - Smarter extraction of character names
  - Removes parenthetical content: "Breq (Justice of Toren)" → "Breq"
  - Strips common titles: "Captain Kirk" → "Kirk", "Translator Zeiat" → "Zeiat"
  - Single-word names used directly instead of taking last word

---

## [4.2.1] - 2026-01-01

### Fixed
- **Statusline Agent Display** - Fixed session_id mismatch between hooks causing agent not to display
  - Added fallback to most recent agent file when session_id lookup fails
  - Statusline now shows character name (e.g., "Bullock") instead of theme name

---

## [4.2.0] - 2026-01-01

### Added
- **OCEAN Personality Visualization (Epic 11)** - Chernoff face visualization for agent personality profiles
  - OCEAN → facial feature mapping specification (`pennyfarthing-dist/personas/OCEAN-TO-FACE.md`)
  - Chernoff face generator (`src/scripts/generate-face.ts`) - converts OCEAN scores to SVG
  - ASCII face generator (`src/scripts/generate-ascii-face.ts`) - terminal-friendly visualization
  - Full 630-face matrix across all 63 themes (10 agents each)
  - OCEAN profiles added to all theme character definitions
  - `/theme-maker` now generates OCEAN profiles in all creation modes
- **Context Warning Hook** - Automatic warning at 70% context usage threshold
  - PreToolUse hook monitors context budget
  - Actionable suggestions for context management
  - Configurable thresholds in settings

### Fixed
- **Session Isolation (BUG-1)** - Eliminated shared `.session/current-agent` file causing cross-session pollution
  - Each Claude Code session now shows only its own agent in statusline
  - Removed shared state workaround that caused agent bleed between sessions

---

## [4.1.0] - 2026-01-01

### Added
- **Mega Persona Pack** - 50+ new themes with OCEAN personality standardization
  - Breaking Bad, The Wire, Firefly, Fargo, MASH, The Office, The Good Place
  - Star Wars, Dune, Foundation, Mass Effect, Blade Runner, Neuromancer
  - Game of Thrones, The Crown, Succession, West Wing, Rome
  - Marvel MCU, Watchmen, Sandman, Doctor Who, The Witcher
  - And many more - see `pennyfarthing theme list` for full catalog
- **OCEAN Benchmarking** - All themes now include Big Five personality profiles for character consistency
- **ADR Documentation** - Architecture Decision Records in `docs/adr/`
  - ADR-0001: Code duplication consolidation strategy

### Changed
- **CLI Refactoring** - Consolidated duplicate code in init/update/doctor commands
  - New `src/cli/utils/constants.ts` for shared paths and patterns
  - New `src/cli/utils/node-modules.ts` for package resolution
  - Simplified symlink utilities
- **Bash Utilities** - Added `pennyfarthing-dist/scripts/utils/common.sh` with shared functions
  - `find_project_root()`, `log_info/warn/error()`, `require_command()`
  - Eliminates duplication across shell scripts

---

## [4.0.6] - 2025-12-31

*No unreleased changes*

---

## [4.0.5] - 2025-12-31

### Fixed
- **Session Isolation (BUG-1)** - Eliminated shared `.session/current-agent` file that caused cross-session pollution. Each Claude Code session now only sees its own agent in the statusline. This script had a 52% bug fix rate (15 fixes out of 29 commits) - this fix removes the root cause rather than adding another workaround.

### Changed
- `statusline.sh` - Only reads per-session agent file, no fallback to shared state
- `agent-session.sh` - Removed all writes to `current-agent`
- `session-start.sh` - Removed aggressive cleanup that wiped all agent files on session start

---

## [4.0.4] - 2025-12-31

### Fixed
- **Dogfooding Scripts Symlink** - Added `.claude/scripts` symlink to git for the pennyfarthing repo itself. This was the root cause of recurring script resolution failures - the symlink was never tracked, so every fresh clone or clean broke agent commands.

### Removed
- **Copy Mode Deprecated** - Removed copy mode installation from `init` and `update` commands. All installations now require `npm install pennyfarthing` first. Legacy copy mode installs are automatically migrated to symlink mode on update.

---

## [4.0.3] - 2025-12-31

### Fixed
- **Agent Commands Path** - All agent activation commands now use `$d/.claude/scripts/run.sh` instead of `$d/scripts/run.sh`. The old path only worked in dogfooding; npm-installed projects only have `.claude/scripts/`.

---

## [4.0.2] - 2025-12-31

### Fixed
- **Scripts Path Resolution (Complete)** - `run.sh` now tries both `.claude/scripts/` (npm-installed projects) and `.claude/pennyfarthing/scripts/` (dogfooding). v4.0.1 only tried the former, breaking the pennyfarthing repo itself.

---

## [4.0.1] - 2025-12-31

### Fixed
- **Scripts Path Resolution** - `run.sh` was hardcoded to look for scripts at `.claude/pennyfarthing/scripts/` which only worked in dogfooding setup. Fixed to use `.claude/scripts/` which is the canonical path created by `pennyfarthing init` (symlinked to node_modules or copy-mode location). *(Note: Incomplete fix, see 4.0.2)*

---

## [4.0.0] - 2025-12-31

### Changed
- **BREAKING: Link-based Installation** - `pennyfarthing init` now creates symlinks to `node_modules/pennyfarthing/pennyfarthing-dist/` instead of copying files into the project
  - Reduces codespace pollution (no more 100+ copied files)
  - Updates propagate automatically via `npm update`
  - Requires `npm install pennyfarthing` before `pennyfarthing init`
  - `.claude/pennyfarthing/` now symlinks to package location

### Migration from 3.x
1. Run `pennyfarthing uninstall` to remove copied files
2. Run `npm install pennyfarthing` (or add to devDependencies)
3. Run `pennyfarthing init` to create new symlink structure
4. Your `.claude/project/` customizations are preserved

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

[Unreleased]: https://github.com/1898andCo/pennyfarthing/compare/v6.0.0...HEAD
[6.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v5.3.0...v6.0.0
[5.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v5.1.1...v5.2.0
[5.1.1]: https://github.com/1898andCo/pennyfarthing/compare/v5.1.0...v5.1.1
[5.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v5.0.1...v5.1.0
[5.0.1]: https://github.com/1898andCo/pennyfarthing/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v4.3.0...v5.0.0
[4.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v4.2.3...v4.3.0
[4.2.3]: https://github.com/1898andCo/pennyfarthing/compare/v4.2.2...v4.2.3
[4.2.2]: https://github.com/1898andCo/pennyfarthing/compare/v4.2.1...v4.2.2
[4.2.1]: https://github.com/1898andCo/pennyfarthing/compare/v4.2.0...v4.2.1
[4.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.6...v4.1.0
[4.0.6]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.5...v4.0.6
[4.0.5]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.4...v4.0.5
[4.0.4]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.3...v4.0.4
[4.0.3]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.2...v4.0.3
[4.0.2]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.1...v4.0.2
[4.0.1]: https://github.com/1898andCo/pennyfarthing/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v3.8.0...v4.0.0
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
