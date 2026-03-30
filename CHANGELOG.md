# Changelog

All notable changes to Pennyfarthing are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [13.1.2] - 2026-03-23

### Added

- **Reviewer diff mode discrimination** — `reviewer/diff_mode.py` maps each subagent to full-base or incremental diff mode with base branch resolution (150-7)
- **Subagent file context mode** — `needs_file_context()` and `get_changed_files()` for subagents that need full file contents, not just diffs (150-9)
- **Session append-only validation** — `session/append_only.py` enforces append-only rule for Delivery Findings section (150-10)
- **Sprint status normalization** — `sprint/status_normalize.py` standardizes in_review/in-review spelling across the pipeline (150-12)
- **Reviewer assessment template generator** — `reviewer/template.py` produces gate-compliant assessment scaffolds with all required dispatch tags (150-13)
- **TEA spec traceability audit** — `tea/spec_traceability.py` cross-references test coverage against acceptance criteria (150-14)
- **Spec authority guide and validator** — `spec/authority.py` enforces the spec authority hierarchy (session > story context > epic context > architecture docs) (150-16)
- **Subagent model defaults** — Specialist reviewer subagents default to Sonnet model for analytical capability (150-17)
- **Quality regression ratchet** — `quality/ratchet.py` prevents test count regression across commits (150-19)
- **Finding documentation module** — `reviewer/findings.py` structures reviewer findings with severity, location, and fix guidance (150-20)
- **Rework cycle freshness gate** — Validates that rework cycles produce fresh reviewer assessments (150-8)

### Fixed

- **Sprint status missing archived stories** — `get_archived_stories()` now reads epic shard files from `completed_epics` references

## [13.1.1] - 2026-03-23

### Added

- **Impact Summary enhancement** — `compile_impact_summary()` now includes `### Downstream Effects` (findings grouped by module) and `### Deviation Justifications` (rationale, severity, forward impact from Design Deviations section) (150-1, #1503)
- **PR body Design Deviations section** — `generate_pr_body()` includes deviation count summary, severity, rationale, and breaking deviation highlighting (150-2, #1473)
- **Spec-drift pre-check gate** — `gates/spec_drift_precheck.py` detects specification drift at review phase entry using keyword extraction and similarity scoring (150-3, #1474)
- **Deviation traceability module** — `gates/deviation_traceability.py` builds traceability matrix linking deviations to spec sources and forward-impact story IDs (150-4, #1475)
- **Configurable drift tolerance** — `gates/drift_tolerance.py` loads severity weights and thresholds from `config.local.yaml` for pass/warn/fail drift scoring (150-5, #1476)

### Fixed

- **Peloton skill recursion** — Removed 3 duplicate `<run>` blocks from peloton skill that caused the skill system to loop (148-29, #1504)
- **TEA tmux pane cleanup** — Worker panes spawned during peloton sessions now auto-tagged with `owner="peloton"` so `pf peloton stop` cleans them up (148-25, #1505)
- **Sprint status missing archived stories** — `get_archived_stories()` now reads epic shard files from `completed_epics` references, not just inline `completed_stories`

## [13.1.0] - 2026-03-21

### Added

- **`pf sprint story split`** — Decompose stories into sub-stories with dependency tracking, point redistribution, and parent status transition (150-15, #1498)
- **`pf tmux layout`** — Rearrange tmux panes after team agent spawn: `vertical` (CLI+TUI left, agents right), `grid` (2x2), `stacked` (#1496)
- **Auto-layout hook** — PostToolUse hook reads `peloton.layout` config and auto-applies tmux layout after Agent/TeamCreate (#1496)
- **TUI below CLI in vertical layout** — `apply_layout` detects TUI pane and places it below CLI on the left column (#1497)
- **Reviewer toggle E2E tests** — 41 tests proving the full settings→gate enforcement pipeline for reviewer subagent toggles (150-11, #1494)

### Changed

- **Open-source readiness** — Removed all hardcoded PROJ/slabgorb company references from framework defaults, examples, and test fixtures. Jira project/URL now configurable via `pf init`, user map via `config.local.yaml` (#1499, #1500, #1501)
- **`extract_jira_key`** — Uses generic Jira key regex instead of configured project prefix (#1501)

### Fixed

- **`pyproject.toml` version** — Now included in release version bump (missed in 13.0.0 release)

## [13.0.0] - 2026-03-21

### Added

- **Spec-drift gates** — Pre-check for review phase entry enforces spec-authority hierarchy and quality regression guards (150-3/4/5, #1470, #1474, #1475, #1476)
- **Design Deviations in PR body** — Findings section auto-generated with deviation traceability (#1473)
- **Reviewer sub-agent toggles** — Configurable enable/disable for individual reviewer sub-agents (#1466)
- **`pf sprint story update --jira`** — Sync story updates to Jira inline (#1462)
- **Frame repos API** — Repos endpoints added to WheelHub (#1460)
- **Peloton pre-priming** — Teammates get full agent context before pipeline runs (148-28, #1454)
- **Write-time settings validators** — RED phase tests for settings validation (147-8, #1461)

### Changed

- **Reviewer pipeline upgraded to Opus** — Reviewer subagents use Opus with relaxed constraints (#1448)
- **Frame port assignment** — Replaced hash-based port selection with OS-assigned ports (PROJ-16594, #1456)
- **Release workflow cleanup** — Removed Node/NPM/package.json references; framework is Python-only
- **E2E test suite** — Removed phantom `frame-node24` scenario that had no implementation

### Fixed

- **Consumer shim discovery** — `pf init` for consumer projects now resolves the globally installed pf (pipx/pip/uv), ignoring `PF_BINARY` env var and monorepo walk-up that could bake dev-environment paths into consumer shims (#1493)
- **Session launch command** — Use `pf launch frame` instead of `pf frame start` in start-session hook (#1458)

## [13.0.0-beta.2] - 2026-03-17

### Added

- **Peloton portrait panes** — Split panes beside CLI to show agent portraits during pipeline runs (148-21, #1444)
- **Peloton agent color prompts** — Color instructions injected into teammate prompts for visual differentiation (148-22, #1445)
- **Peloton stale team cleanup** — Auto-cleanup of stale team directories on start and stop (#1443)
- **Git pane collapsible sections** — TUI git pane supports collapsible per-repo sections with carousel toggle (148-4, #1439)
- **Settings page rework** — Explicit SETTINGS_META entries for `jira.project` and `jira.url` (148-7, #1440)
- **Reviewer gate clarity** — Clearer reviewer handoff gate instructions and error messages (148-23, #1441)
- **Peloton two-column layout expansion** — `create_peloton_layout` for two-column pane arrangements (148-15)
- **repos.yaml writer** — `set_repo_field` API for programmatic repos.yaml updates (147-6, #1428)

### Fixed

- **Sprint story finish** — Accept alphanumeric epic IDs in story finish flow (#1437)
- **Reviewer subagent completion** — Accept bold markdown in reviewer subagent completion check (#1438)
- **Pre-commit hook** — Exclude `sprint/demos/` from YAML validation (#1442)
- **Sprint all_story_ids** — Move init outside epics block to avoid `UnboundLocalError`
- **Reviewer assessment error** — Derive agent name dynamically instead of hardcoded (148-23)
- **Tmux session name resolution** — Resolve actual tmux session name in `start_session`

## [13.0.0-beta.1] - 2026-03-16

### Added

- **Peloton full TDD workflow phases** — Wired all TDD workflow phases from YAML definition (#1429)
- **Peloton two-column layout** — CLI/TUI + agent stacking pane layout (148-15, #1430)

### Fixed

- **Peloton pane reuse** — Reuse pre-opened panes and stack TUI below CLI (#1434, #1436)
- **Portrait pane caching** — TUI portrait pane shows image and caches quote per agent (PROJ-16424, #1433)
- **Subagent pane statusbar** — Disabled CLI statusbar for subagent panes (PROJ-16475, #1432)
- **Peloton tmux session leak** — Kill peloton-owned panes on stop to prevent session leaks (PROJ-16474, #1431)
- **Peloton skill cleanup** — Added run tags and removed self-reference in peloton skill (#1435)
- **Context schema path** — Resolve via `get_dist_root` instead of `parents[3]`
- **Init tmux templates** — Copy tmux templates when dist_root is outside target_dir
- **Test isolation** — Block all real tmux calls globally via conftest autouse fixture

## [13.0.0-alpha.3] - 2026-03-15

### Added

- **Peloton team mode** — Native agent teams replace `claude -p` and custom subagent orchestration for pipeline replay benchmarks (148-11, 148-12, #1418, #1419, #1421)
- **Peloton mode orchestration** — Concurrent tmux panes for TEA/Dev/Reviewer with live mode CLI commands (148-8, 148-9)
- **Peloton pane management** — Unified pane management via tmux registry (148-10, #1415)
- **Peloton skill** — CLI skill wrapper for peloton mode discovery and documentation (148-8)
- **pf-handoff skill** — Dedicated skill wrapper for gate resolution and session handoff commands
- **ReposPanel TUI** — Per-repo collapsible sections in TUI dashboard (PROJ-16416, #1407)
- **PPTX assembler** — Slide deck generation for demo artifacts (145-5, #1411)
- **/pf-demo skill wrapper** — Demo generation skill (146-2, #1412)
- **Demo finish hook** — Auto-generate demo artifacts on story_finish (146-3, #1413)
- **Tmux pane discoverability** — Icons, borders, env vars for pane identification (148-1, #1410)
- **Token stats OTLP metrics** — Real-time token consumption wired to debug pane via WebSocket (148-6, #1401)

### Changed

- **Frame rename** — WheelHub/BikeRack renamed to Frame/TUI across entire framework (#1403, #1420, #1424)
- **GUI packages removed** — React packages dropped; Python-only architecture (bd292b7)
- **Tmux auto-start** — `tmux-dev` renamed to `start-session`, auto-starts Frame server (#1426)
- **Agent behavior guide** — Added critical repos.yaml branching rule

### Fixed

- **Double Claude CLI in tmux** — `tmux-dev` launcher used `pf frame start` (server + exec claude) instead of `pf launch frame` (server-only), spawning two CLI instances
- **Portrait pane catchphrase** — Shows catchphrase correctly (PROJ-16424, #1416)
- **CLI startup performance** — Threshold 800ms, tmux/demo added to command registry (#1423)
- **CI cleanup** — Ruff lint, YAML lint, dead GUI shortcut removal (#1422)
- **Frame POLL_CHANNELS** — Removed event-driven channels (#1405)
- **Token stats WebSocket** — Added spans, token-stats, settings, subagent-transitions to POLL_CHANNELS (#1404)
- **Tmux template sync** — Updated stale templates with nesting guard, Frame rename, and double-CLI fix

## [13.0.0-alpha.2] - 2026-03-13

### Added

- **Native subagent infrastructure** — SM spawns subagents via Agent tool; phase-chaining orchestration routes work through TEA→Dev→Reviewer automatically (143-6, 143-7, 143-8, 143-12, PROJ-16364, #1341)
- **Native subagent definitions** — Agent definitions for all 10 roles (Dev, TEA, Reviewer + 7 others) as Claude Code native subagents (#1339, #1340)
- **Subagent-dispatch gate** — Completion gate enforcing all subagents complete before phase exits; per-role tool restriction validation (143-12)
- **Handoff document schema** — Contract schema for inter-agent handoffs in native subagent mode
- **Spec-check and spec-reconcile phases** — Architect validates Dev implementation against story context before review, then produces definitive deviation manifest after review (144-6, 144-7, 144-9, #1386, #1376, #1377)
- **Architect spec-check mismatch taxonomy** — Structured deviation categories for consistent implementation deviation classification (PROJ-16432, #1393)
- **AC-completion gate** — Validates acceptance criteria accountability at Dev exit (144-3, #1377)
- **Deviation format spec and gate** — 6-field deviation format with gate validation (144-1, #1362)
- **Deviation logging** — TEA and Dev log real-time spec deviations; Reviewer audits and stamps entries (144-2, #1383)
- **Spec deviation tracking** — Session output includes spec deviation records (#1331)
- **Saddle mode** — Background observer agent workspace: `pf saddle summon` launches agent in tmux pane (143-17, 143-18, 147-10, #1374, #1379, #1394)
- **Demo pipeline** — `pf demo generate` CLI, DemoOrchestrator pipeline entry point, demo.yaml branding and classification config, PPTX assembler (145-7, 146-1, 146-3, PROJ-16401, PROJ-16409, #1375, #1380, #1385, #1390, #1397)
- **Demo script generator** — Automated reproducible scripts from demo artifacts (145-4)
- **Demo content generator** — ELI5 translation for demo content (145-3)
- **Signal collector** — Captures telemetry signals (agent decisions, findings) during story execution for demo generation (145-1, #1364)
- **Story type classifier** — AI classification of story types for demo context generation (145-2, #1365)
- **Mermaid diagram generation** — Module for architecture diagrams in demo artifacts (145-6, #1384)
- **PreToolUse hook for branch protection** — Branch protection rules enforced before tool execution, respects trunk-based strategy (143-13, #1369)
- **Simplify toggle in repos.yaml** — Projects can disable simplify phase via repos.yaml configuration (144-4, #1368)
- **Assumptions section in story context** — Story context schema supports explicit Assumptions for dependency tracking (144-5)
- **RepoFieldSpec registry** — Typed metadata for repos.yaml fields, enabling TUI rendering of repo settings (147-4)
- **Jira and settings TUI enhancements** — Jira config in DEFAULTS and settings panel (147-1), saddle_mode SettingSpec (147-2)
- **Native subagent support in pf init** — `.claude/agents/` symlink and init support for Claude Code native subagents (#1382)
- **Reviewer-Dev fix round-trip** — Reviewer can reject back to Dev with fix instructions (143-10, #1381)
- **Reviewer subagent completion gate** — Enforces all reviewer subagents complete before final handoff
- **OTEL spans WebSocket channel** — Traces and logs wired to WheelHub spans channel (PROJ-16426, #1392)
- **Tmux pane discoverability** — Icons, borders, and env vars for tmux integration (PROJ-16440, #1391)
- **pf tmux pane management subsystem** — Full pane lifecycle management for tmux integration
- **Subagent transition telemetry** — Event stream tracking agent transitions between subphases (143-16, #1371)
- **Benchmark events-first storage** — Events stored as primary data model, traces derived from events (142-8)
- **Benchmark LLM-narrated trace** — AI-generated narrative explanations of benchmark pipeline runs (142-9)
- **Benchmark event parsing and trace commands** — `pf benchmark trace` and `pf benchmark explain` (142-6)
- **Benchmark buffer_stream_events** — Stream buffering for OTEL event capture (142-4)
- **Benchmark pre-phase scouts** — TEA and Dev pre-phase scanning, including silent failure scan on full codebase
- **Benchmark harness-level reviewer subagent fan-out** — Parallel reviewer subagent execution at harness level
- **Benchmark single-phase replay** — Replay individual phases for targeted debugging
- **Benchmark unified context resolution** — Single `load_scenario()` path for all benchmark operations (#1330)
- **Benchmark subagent-dispatch gate** — Gate enforcement within benchmark pipeline (#1333)
- **Benchmark session continuity and entry gates** — Benchmark pipelines maintain session state across phases (PROJ-16375, #1338)
- **Stacked PR support** — `depends_on` field in sprint schema and Graphite stacked PR health check (ADR-0036)
- **BMAD design deviation sync** — Sync design deviations from session to BMAD story files

### Changed

- **Tandem workflow files removed** — Tandem YAML files consolidated; tandem config now inline in workflow definitions (144-8, #1378)
- **CI simplified** — Removed Node/pnpm jobs, switched to ubuntu-latest (#1305, #1321, #1322)
- **52 low-value persona themes pruned** — harry-potter, sandman, lovecraft-mythos and 49 others removed; remaining themes got benchmark-driven tiers and effectiveness corrections
- **TEA assessment template** — Added simplify report section
- **max_tokens default** — Updated to 1M for Opus 4.6 context window

### Fixed

- **WheelHub portrait pane updates** — Added persona to POLL_CHANNELS so portrait follows agent changes (#1399)
- **Tmux session resolution** — Resolve attached session instead of first alphabetically
- **Settings cleanup** — Removed colorPreset and display.fonts dead config (147-3)
- **Jira label** — Updated from `pennyfarthing` to `product-pennyfarthing` (#1395)
- **Init SameFileError** — Resolve SameFileError when tmux-dev is symlink, add version validator
- **WheelHub port derivation** — Per-project port from path hash; scoped orphan detection to current project
- **Prime TDD cycle validation** — Full e2e validation (143-9, #1361)
- **Benchmark compute_run_dir** — Replace duplicated path logic with single function
- **Benchmark _framework_version** — Made reliable across environments

## [13.0.0-alpha.1] - 2026-03-11

### Added

- **BREAKING: React GUI and Electron app removed** — All JavaScript/TypeScript application code removed; framework is now Python-only (ADR-0034)
- **Reviewer specialist subagents** — 6 specialist subagents (silent-failure, test, comment, type-design, security, simplifier) plus existing preflight and edge-hunter = 8 parallel Haiku subagents (PROJ-16335, #1324)
- **Benchmark pipeline upgrade** — Pipeline replay exercises full Pennyfarthing machinery including workflow phases and gate enforcement (PROJ-16336, #1326)
- **BMAD pipeline replay adapter** — Wire BMAD adapter into pipeline replay harness (142-3)
- **Benchmark analyze command** — `pf benchmark analyze` with theme dimensions display

### Changed

- **Python WheelHub server** — Node.js WheelHub completely replaced with Python FastAPI (48-1, 48-3, 48-4)
- **WebSocket channel manager** — FastAPI implementation with initial data push and periodic broadcast (48-3)
- **TirePump removed** — Context management simplified post-migration
- **WheelHub bundle** — Rebuilt with in_review status mapping

## [13.0.0-alpha.0] - 2026-03-10

### Added

- **pf.benchmark Python package** — Complete Python reimplementation of benchmark system (44-1)
- **Krippendorff and Cronbach Alpha** — Inter-rater agreement calculations for multi-judge scoring (44-2)
- **Finalize-run multi-judge validation** — Post-run validation across multiple judges (44-3)
- **Gold standard judge calibration** — Calibrate judges against gold standard references with variance comparison (45-2, 45-4)
- **Red herring detection** — Benchmark judges detect and flag red herrings in scenarios (43-1, 43-2)
- **Difficulty profile schema** — Validate difficulty profiles in benchmark scenarios (46-1)
- **CV reduction measurement** — Coefficient of variation measurement for benchmark scoring consistency (42-3)
- **Rubric anchors** — Behavioral scales for consistent rubric application (42-1)
- **Reviewer edge-case hunter subagent** — Specialized subagent for adversarial edge-case detection (PROJ-16333, #1323)
- **BMAD simulator template adapter** — Benchmark scenarios can use BMAD templates for story translation (#1320)
- **Startup agent auto-invoke** — Agents auto-invoke on SessionStart hook (PROJ-16331, #1319)
- **Plan mode agent reload** — Agents reload on ExitPlanMode for seamless workflow transitions (PROJ-16323, #1318)
- **OTEL telemetry streaming to disk** — Benchmark telemetry streams to disk instead of requiring BikeRack (PROJ-16322, #1317)
- **FastAPI WheelHub API routes** — Core API routes ported to Python FastAPI WheelHub (PROJ-16314, #1313)
- **Multi-judge benchmark support** — Pipeline replay supports multiple judges for scoring consistency (#1311)
- **CLI delegation for workflow engine** — Python CLI delegates workflow operations replacing TypeScript engine (141-18)
- **Agent-evaluation relocation** — Moved to Python with settings migration (141-21)
- **Perplexity research guidance** — Agents and coordination guide include web-grounded research patterns (136-20, 136-21)
- **File-overlap independence check** — Batch fan-out validates independent file sets (139-1)
- **WebSocket initial data push** — WheelHub pushes initial state on WebSocket connection

### Changed

- **BREAKING: WheelHub migrated from Node.js to Python/uvicorn** — Server-side TypeScript removed entirely; WheelHub now runs on FastAPI/uvicorn (ADR-0034, #1316)
- **Legacy TypeScript CLI removed** — Dead CLI, BMAD, and Jira TypeScript modules deleted in favor of Python pf CLI
- **Subagent-dispatch subgate** — Added to approval gate for native subagent enforcement

### Fixed

- **Node test failures** — Deleted orphaned dist files and fixed test assertions
- **Benchmark empty judge response warning** — Restored detailed warning for empty judge responses
- **Release dry-run** — Reject empty version string in dry-run validation (136-29)

## [12.7.0] - 2026-03-08

### Added

- **Judge versioning and partial-match rubrics** — Benchmark judges support version tracking and partial-match scoring (#1309)
- **Theme YAML schema and git snapshot command** — Structured theme validation plus `pf git snapshot` for point-in-time repo captures (#1308)
- **Pipeline replay framework** — Replay benchmark pipelines from stored results for regression testing (#1307)
- **Kitchen-sink workflow and language-specific review checklists** — Extended gate coverage with per-language review checklists (#1302)

### Changed

- **Theme genre consolidation** — Reduced to 5 genres, added benchmark slicing dimensions, reset tiers to unranked

### Fixed

- **SESSION_ID propagation to WheelHub** — Eliminated CYCLIST_SESSION_ID, set SESSION_ID before WheelHub spawn for correct agent detection (PROJ-16303, #1310)
- **Merge gate docs alignment** — Gate documentation now reflects the in_review exception correctly (#1299)
- **Lint cleanup** — Removed unused type imports, fixed f-string and import sorting

## [12.6.2] - 2026-03-07

### Added

- **Consumer E2E test suite** — 6 scenarios covering fresh-init, re-init preservation, WheelHub Node 24, upgrade safety, orc-ax snapshot, and idempotency (PROJ-16292)
- **WheelHub CJS banner fix** — esbuild bundler auto-patches `createRequire` shim for Node 24 ESM compatibility (PROJ-16292)
- **Scenario discovery workflow** — New stepped workflow for benchmark scenario discovery

### Fixed

- **Hook change confirmation in pf init** — Added confirmation prompt before modifying hooks and fixed WheelHub bundle handling during init

## [12.6.1] - 2026-03-07

### Fixed

- **TUI agent display stuck on ORC** — `getCurrentAgent()` now falls back to most recently modified agent file when `CYCLIST_SESSION_ID` is not set (standalone WheelHub via `just wheelhub`)
- **Ghostty portrait support** — Detect Ghostty terminal as kitty graphics protocol for inline portraits
- **Hook change confirmation in pf init** — Added confirmation prompt for hook changes and fixed WheelHub bundle handling during init

## [12.6.0] - 2026-03-06

### Added

- **Gold standard schema for scenarios** — Benchmark scenarios support gold_standard calibration references (PROJ-16225)
- **Difficulty profile population** — Populate difficulty profiles from baseline benchmark data (PROJ-16230)

### Fixed

- **TUI showing wrong agent persona** — BikeRack TUI launcher now forwards SESSION_ID to WheelHub for correct agent detection
- **Scenario validator test casts** — Use double-cast in scenario-validator tests for type safety

## [12.5.0] - 2026-03-06

### Added

- **Scenario Builder stepped workflow** — Interactive workflow for building benchmark scenarios with code and open-ended modes (PROJ-16234)
- **Perplexity research guidance** — Orchestrator pattern doc for web-grounded research (#1295)
- **Reference anchors in judge prompts** — Benchmark judge prompts now include anchored rubric criteria (PROJ-16220)
- **Sprint panel in-review differentiation** — In-review stories visually distinguished from backlog (#1293)
- **Multi-judge flag for /solo** — `--multi-judge` flag for comparative scoring (PROJ-16215)
- **Output style config wiring** — `output_style` from config piped into agent activation (#1289)
- **TypeScript workflow engine replaced with pf CLI** — BikeLane workflow operations delegated to Python CLI (141-18)
- **Hook audit** — Unexported hooks exported or deleted (#1262)
- **Core API route tests** — Test coverage for agent-load through welcome API routes (PROJ-16132, PROJ-16133, PROJ-16209)

### Fixed

- **WheelHub in_review status mapping** — Rebuilt bundle with correct status mapping and Node 24 ESM shim (#1296, #1297, #1298)
- **CI check failures** — Resolved all 5 failing CI checks for scenario-builder PR
- **Stale and broken tests** — Removed stale tests and fixed broken contract tests (#1291)
- **28 dependency vulnerabilities** — Resolved via dependency updates (#1290)
- **TUI bugfixes** — Context lookup, workflow dots, keybinding, status CLI fixes (#1282)

## [12.4.1] - 2026-03-05

### Added

- **SOUL.md loading in agent bootstrap** — `pf agent start` optionally loads project-level SOUL.md for personality customization
- **Result object conversions in CLI utils** — Converted throw-based error handling to result objects in CLI utility functions (141-9)
- **PR title format configuration** — Configurable PR title format via `repos.yaml` with project-setup wizard step (PROJ-16205)
- **Consumer gate extensions** — Projects can add custom gates via `repos.yaml` configuration (PROJ-16204)
- **In-review story status** — Model story statuses on Jira lifecycle with `in_review` support (PROJ-16200)

### Fixed

- **`pf init` no longer removes custom content** — Stopped `_clean_stale_content` from deleting user-created gates, workflows, and agents from consumer repos during init
- **Stale bootstrap_written reference** — Removed dead reference from init result output

## [12.4.0] - 2026-03-05

### Added

- **TypeScript workflow engine replaced with pf CLI** — BikeLane workflow operations delegated to Python CLI instead of TypeScript engine (141-18)
- **Port display in TUI and CLI statusbar** — BikeRack TUI shows WheelHub port next to "Connected" indicator; CLI statusbar shows OTEL port when telemetry is active
- **Project-level workflow definitions** — `.pennyfarthing/project/workflows/` overrides or extends distributed workflows with priority-ordered multi-dir search (141-25)
- **Homebrew tap and shell installer** — `brew install slabgorb/tap/pennyfarthing` for macOS/Linux (PROJ-16164)
- **Simplify subagents** — Three verify-phase teammates (reuse, quality, efficiency) with structured `SIMPLIFY_RESULT` format and fan-out/fan-in orchestration (138-1, 138-3, 138-4, 138-7)
- **Batch fan-out independence check** — File-overlap validation for parallel agent execution (139-1, 140-4)
- **`pf validate` in CI** — Document type validators wired into continuous integration (PROJ-16146)
- **`--json` output for pf CLI** — Five commands now support `--json` for machine-readable output (141-16)
- **Consolidated agent validation** — `pf validate agent` replaces scattered validation logic (141-20)
- **Fix instructions in validators** — All validators now include actionable fix suggestions (141-23)
- **Step-level tandem/team** — Stepped workflow steps can declare tandem and team blocks (137-5)
- **Finding format validation gate** — Delivery findings validated against ADR-0031 format (133-3)
- **`in_review` story status** — Sprint validator and CLI recognize in-review state
- **Expanded spinner tips and catchphrases** — 36 tips, 30 spinner verbs, 6 catchphrases per S/A tier character

### Fixed

- **Redundant `detect_image_protocol()` calls** — Stored result once in TUI main/dev_main
- **Cyclist imports after story-parser deletion** — Updated CATEGORY_MAP removal
- **OTLP receiver payload types** — Properly typed in core package
- **Deprecated bikerack shim removed** — Stale references cleaned up (141-4)
- **Dead scripts deleted** — Removed duplicates of pf CLI functionality (141-15)
- **Jira transition failures surfaced** — `claim_story` no longer silently swallows errors
- **Handoff datetime mismatch** — Handle naive/aware datetime in phase duration calc
- **Phase name validation** — `complete_phase` rejects agent names passed as phase names
- **Sprint archive filtering** — Filter by name when number field absent; default status to done (136-14, 137-7)
- **Hardcoded npm commands replaced** — Agents use project-agnostic `pf check`
- **Stale npm/uv-era references removed** — Setup workflows and docs cleaned up (136-26)
- **`pf-` prefix in templates** — All skill/agent name references corrected
- **Phantom validate command fixed** — `pf context-docs` replaced with `pf validate context-story/epic`
- **SM agent workflow routing** — Removed hardcoded workflow routing from SM agent definition

### Removed

- **Bootstrap hook removed** — Project initialization no longer requires a bootstrap phase; `pf init` handles setup directly

### Coming Soon

- **Homebrew installs** — `brew install slabgorb/tap/pennyfarthing` will be the primary install path for macOS/Linux

### Changed

- **TypeScript file parsers replaced with pf CLI** — Subprocess calls instead of direct parsing (141-17)
- **`as any` casts removed** — Fixed cyclist tsc errors without type escapes (141-12)
- **Result objects in scripts** — Converted throw to result objects in scripts and generators (141-8)
- **Dependencies unified** — `@types/ws` and `yaml` consolidated; shared UI deps hoisted to root
- **WheelHub max port retries** — Increased from 10 to 16

### Documentation

- **Onboarding rewritten** — Three user journeys with brew-first install path (PROJ-16187)
- **Handoff CLI guide improved** — Missing commands and examples added
- **CLI usage docs regenerated** — All skills updated

---

## [12.3.0] - 2026-03-03

### Added

- **Agent coordination guide** — cross-agent guidance for TEA, Dev, Reviewer, Architect, Tech Writer (136-19)
- **Stepped workflow state detection** — prime now detects and reports stepped workflow state (137-4)
- **Legacy text menu removal** — migrated remaining workflow step files to AskUserQuestion menus (137-6)
- **`pf setup` command** — primary CLI entry point, replaces `pf init` as user-facing command (136-12)
- **`pf launch wheelhub` command** — dedicated WheelHub launcher command
- **Justfile staleness detection** — `pf init` detects and updates stale `justfile.pf` (136-25)
- **TUI color threshold extraction** — shared color thresholds in `colors.py` for consistent status indicators (136-4)

### Changed

- **WheelHub project isolation** — enforce project-scoped discovery, remove port-scanning fallback (136-23)
- **BikeRack naming** — renamed Cyclist → BikeRack GUI across codebase
- **BikeRack TUI settings** — updated layout order, settings meta, and TUI rendering
- **WheelHub pre-start** — tmux-dev now starts WheelHub before launching panes
- **Test cleanup** — removed 183 stale test failures, reduced mock complexity across 14 test files

### Fixed

- **Relay mode handoff** — removed `is_gui` gating from relay mode handoff (PROJ-16066)
- **TUI SGR escape leak** — flush SGR mouse/focus escapes before Textual startup
- **TUI color thresholds** — aligned TUI thresholds with statusline (70/85) (103-23)
- **tmux recipe** — added `exec` to preserve terminal attachment
- **Duplicate GUI recipe** — removed duplicate gui recipe from justfile.pf template
- **Sprint archive filtering** — require number field in sprint YAML for archive filtering
- **Prompt replacement spacing** — fixed missing spaces after "prompt" in stepped workflow migrations (137-6)

---

## [12.2.0] - 2026-03-02

### Added

- **Stepped workflow gate validation** — stepped workflows now validate gate conditions before advancing to the next step (137-3)
- **Interactive AskUserQuestion menus** — stepped workflow static menus migrated to `<switch tool="AskUserQuestion">` tags for native Claude Code integration (137-2)

### Fixed

- **Terminal SGR escape leak** — flush terminal input before Textual startup to prevent raw SGR sequences from leaking into BikeRack TUI (103-22)
- **BikeRack mouse mode leak** — disable mouse mode to prevent raw SGR escape sequences in TUI panels
- **WheelHub port alignment** — align `DEFAULT_CYCLIST_PORT` with WheelHub default (7431 → 2898)
- **Sprint status point totals** — include archived stories in sprint status point calculations (136-15)
- **WheelHub bundle isolation** — exclude benchmark module from bundle to prevent `findMonorepoRoot` crash in consumer environments (PROJ-15933)

---

## [12.1.3] - 2026-03-01

### Added

- **Zero-friction bootstrap** — `pf init` now auto-installs hooks, settings, and shim with dogfooding detection for the framework repo itself
- **WheelHub consumer install** — `pf init` installs the bundled WheelHub server to consumer projects (no npm required)
- **Portrait centralization** — portraits centralized to `~/.local/share/pennyfarthing/portraits/` (XDG shared cache) with stale npm artifact cleanup
- **BikeRack backlog preview** — shows next backlog story when no active story is in progress
- **BikeRack live settings** — `portrait_position` and `tui.toasts` settings apply immediately without restart
- **BikeRack Python fallback** — local Python fallback when WheelHub context API errors
- **Single hook dispatcher** — single dispatcher process replaces per-hook spawning, reducing overhead

### Fixed

- **Hook absolute paths** — `pf init` uses absolute paths for hook commands in `settings.local.json`
- **`pf_launcher` main guard** — added `__main__` guard to prevent double-execution
- **WheelHub Node 24 compat** — patched esbuild shim for Node 24 ESM compatibility
- **Init stale cleanup** — cleans all stale file types from content dirs (not just `.md`), handles settings symlinks, removes broken `.bin` symlinks and pnpm store cache
- **`pf.sh` references removed** — replaced all `pf.sh` references with `pf` across distributed files
- **Stale npm dist_root strategy removed** — no longer attempts npm-based framework resolution
- **Version file sync** — aligned VERSION, package.json, workspace packages, and Python `__version__` which had drifted across 12.1.1/12.1.2 releases

---

## [12.1.2] - 2026-02-28

### Fixed

- **Shim not installed during `pf init`** — `init_project()` now calls `resolve_pf_binary()` and `write_shim()` to create `.pennyfarthing/bin/pf`, fixing broken hooks in consuming repos
- **Duplicate hooks on repeated `pf init`** — `None` vs `""` matcher mismatch caused canonical hooks to be re-added; bare `pf hooks X` commands not recognized as duplicates of `.pennyfarthing/bin/pf hooks X`
- **Shim not executable for .py paths** — `PF_BINARY` env var pointed to `pf_launcher.py` but shim tried to exec it as bash; now detects `.py` paths and prefixes with `python3`

---

## [12.1.1] - 2026-02-28

### Changed

- **Gate recovery extracted to conditional guide** — moved 52-line `<gate-recovery>` procedure from SM agent to `guides/gate-recovery.md`; loads conditionally only when workflow phase gate has `recovery:` config (~512 token reduction for SM agent)
- **Agent behavior guide trimmed** — removed duplicated tandem protocol section (now lives in dedicated guide)
- **WheelHub discovery improvements** — pip install resolution and context API enhancements

---

## [12.1.0] - 2026-02-28

### Added

- **Context engineering system** — schema-driven context documents for epics and stories with validation, templates, and tandem partner selection (`/pf-context create epic`, `/pf-context create story`) (Epics 129, 130)
- **Context gates** — SM-setup exit gate validates context exists; TEA gate checks context before test phase; gate recovery auto-triggers context creation when missing (Epic 131)
- **Session artifacts pipeline** — finding capture during agent exit, Delivery Findings section in session template, Impact Summary compilation, and boss-readable PR body generation (Epics 133, 134)
- **Guided tour workflow** — interactive stepped onboarding with switch gates, deep-dives, practice stories, and setup completion prompt (Epic 132, PROJ-15640)
- **`pf dashboard`** — terminal dashboard command for project status overview (132-11)
- **Discovery nudges** — welcome banner discovery prompt and theme-based spinner verbs with feature tips (PROJ-15748)
- **Frontmatter hooks** — agent and skill files declare their own hooks; integrated into `pf init` pipeline (129-5, 129-6)
- **Stale hook detection** — session start detects deprecated hooks and prompts upgrade
- **OTLP enrichment** — standalone telemetry enrichment for BikeRack TUI mode (132-5)
- **Release workflow enhancements** — package contents verification step, automated changelog comparison link updates (132-2, 132-3)
- **Sprint calculations backend** — moved sprint metric computation to backend (PROJ-15763)
- **tmux overhaul** — CSI u keyboard fix, mouse copy support, integrated status bar, layout templates (PROJ-15736)
- **Portrait bundling** — portraits included in wheel distribution; auto-pull LFS portraits on session start

### Changed

- **Monorepo consolidation** — workspace packages consolidated into single publishable `@pennyfarthing/core` package
- **Doctor modernized** — removed pre-v10 legacy checks and migrations; added fix for missing commands/skills dirs

### Fixed

- **Installation reliability** — `pf_launcher` module included in non-editable installs; TUI dependencies made required; electron type dependencies removed for clean builds
- **Init/upgrade fixes** — content directory copying, npm artifact cleanup, deprecated hook upgrade, justfile template fixes, file-type filtering for `pf-*` prefix matching
- **Sprint metrics** — archive shards and all story sources included in metrics; archived stories counted in done totals; epic promote no longer deletes existing shards
- **Context resolution** — `context.py` resolved via shared dist resolver for npm installs; inlined framework repo handling fixed
- **Agent reload** — active agent correctly reloaded after context clear/compaction
- **Portrait resolution** — symlink handling fixed for git root detection; auto-pull on LFS stub detection in BikeRack
- **Validation** — warning added when no command files found in commands directory

### Documentation

- Rewritten Getting Started guide reconciled with ADR-0028 (PROJ-15617)
- Accuracy and cross-reference fixes across 26 guide files
- Session-artifacts guide updated with Delivery Findings, Impact Summary, and PR body sections

---

## [12.0.0] - 2026-02-24

### Breaking Changes

- **Python-first installation** — `pip install pennyfarthing-scripts` replaces `npm install @pennyfarthing/core` as primary install path. `pf init` replaces `npx pennyfarthing init`. Epic 126 (PROJ-15488).
- **Wrapper chain removed** — `pf.sh`, `run-pf.sh`, and all uv-based invocation removed. All hooks and scripts call `pf` directly (126-4)
- **Node init removed** — `init.ts`, npx entry point, `postinstall.cjs`, `setup-detector.js`, `session-start.js` all removed (126-9)

### Added

- **`pf init` in Python** — full project bootstrap: directory structure, commands/skills, settings, `--dry-run` support (126-2)
- **Auto-setup integration** — `pf init` runs repo discovery, theme selection, git hooks, and Node package install automatically (126-3)
- **`pf upgrade`** — detects npm-based installs and migrates to Python-based structure, preserving custom hooks and config (126-7)
- **`pf upgrade --clean`** — removes npm artifacts and stale symlinks after migration (126-14)
- **`pf doctor --fix`** — reduced to ~10 health checks with interactive repair mode (126-8)
- **Config consolidation** — `preferences.yaml` migrated into `config.local.yaml` as single source of truth (126-5)
- **Frontmatter hooks** — agent .md files and skill directories declare their own hooks; `settings.local.json` reduced to 5 infrastructure hooks (126-6)
- **Setup auto-detection** — session-start hook detects incomplete setup and prompts to run `/pf-setup` (126-12)
- **LFS portrait pull** — `pf init`/`pf-setup` pulls Git LFS portraits for the active theme (126-15)
- **PyPI publishing** — `pf` CLI published to private PyPI with CI pipeline (126-1)
- **BikeRack extraction** — server engine, WebSocket/OTLP, display components extracted into `packages/bikerack` (124-1 through 124-6)
- **DataSource refactor** — `DataSource<T>` pattern for panel data hooks (PROJ-15554)
- **Ordinal IDs in sprint panel** — TUI and GUI show ordinal story IDs (PROJ-15580)
- **Sprint standalone stories** — `pf sprint standalone add` and session archive steps
- **Event-driven Jira sync** — sync triggers on story transitions (125-8)
- **Story lifecycle state machine** — formalized story state transitions (125-7)
- **SprintContext dataclass** — centralized sprint data resolution (125-1, 125-2)
- **Sprint data canonical output** — `pf sprint data --json` for subprocess consumption (125-6)
- **What Is Pennyfarthing** — reference card guide (PROJ-15616)

### Changed

- **Agent activation simplified** — removed redundant `env.sh` sourcing from all command files
- **Shared hook constants** — `_INFRASTRUCTURE_HOOKS` extracted and shared between init and upgrade (126-13)
- **Release workflow updated** — dual npm + PyPI publishing with verification gates
- **CI consumer smoke test** — disabled during Python migration

### Fixed

- **73 broken tests repaired** — across shared, core, and cyclist packages
- **Inline initiative epics** — `pf sprint epic promote` and future commands handle inline epics correctly (126-16)
- **Sprint status filter** — `pf sprint status` filter flag wired up; standalone stories visible in future view
- **ESLint and ruff compliance** — unused vars, import sorting resolved across packages
- **pnpm-lock.yaml sync** — bikerack devDependencies synced
- **Stale init references** — ~30 references to `pennyfarthing init` / `npx pennyfarthing` updated to `pf setup` (126-11)
- **Hook auto-update** — `pf` CLI auto-updates on git pull to prevent cross-repo contamination

---

---

## Earlier Releases (v1.0.0 – v11.5.0-alpha.0)

Versions 1.0 through 11.x covered the initial development of Pennyfarthing from December 2025 through February 2026. Key milestones:

- **v1.0 – v3.x** (Dec 2025) — Initial framework: agent definitions, session files, sprint YAML, basic workflow engine
- **v4.x** (Dec 2025 – Jan 2026) — Persona themes, tandem protocol, workflow gates
- **v5.x – v6.x** (Jan 2026) — BikeLane workflow engine, stepped workflows, hook system, Jira integration
- **v7.x** (Jan 2026) — Relay mode, TirePump context management, output styles, brownfield analysis tools
- **v8.x – v9.x** (Jan – Feb 2026) — Full TDD/BDD workflows, reviewer pipeline, subagent delegation patterns
- **v10.x** (Feb 2026) — Pipeline benchmarking (Peloton/JobFair), persona effectiveness research
- **v11.x** (Feb 2026) — shadcn component migration, dockview panel layout, Electron packaging

For detailed history of these releases, see the git log.

---

[Unreleased]: https://github.com/slabgorb/pennyfarthing/compare/v13.1.2...HEAD
[13.1.2]: https://github.com/slabgorb/pennyfarthing/compare/v13.1.1...v13.1.2
[13.1.1]: https://github.com/slabgorb/pennyfarthing/compare/v13.1.0...v13.1.1
[13.1.0]: https://github.com/slabgorb/pennyfarthing/compare/v13.0.0...v13.1.0
[13.0.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.7.0...v13.0.0
[12.7.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.6.2...v12.7.0
[12.6.2]: https://github.com/slabgorb/pennyfarthing/compare/v12.6.1...v12.6.2
[12.6.1]: https://github.com/slabgorb/pennyfarthing/compare/v12.6.0...v12.6.1
[12.6.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.5.0...v12.6.0
[12.5.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.4.1...v12.5.0
[12.4.1]: https://github.com/slabgorb/pennyfarthing/compare/v12.4.0...v12.4.1
[12.4.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.3.0...v12.4.0
[12.3.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.2.0...v12.3.0
[12.2.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.1.3...v12.2.0
[12.1.3]: https://github.com/slabgorb/pennyfarthing/compare/v12.1.2...v12.1.3
[12.1.2]: https://github.com/slabgorb/pennyfarthing/compare/v12.1.1...v12.1.2
[12.1.1]: https://github.com/slabgorb/pennyfarthing/compare/v12.1.0...v12.1.1
[12.1.0]: https://github.com/slabgorb/pennyfarthing/compare/v12.0.0...v12.1.0
[12.0.0]: https://github.com/slabgorb/pennyfarthing/compare/v11.5.0-alpha.0...v12.0.0
