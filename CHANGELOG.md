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

- **Open-source readiness** — Removed all hardcoded MSSCI/1898andCo company references from framework defaults, examples, and test fixtures. Jira project/URL now configurable via `pf init`, user map via `config.local.yaml` (#1499, #1500, #1501)
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
- **Frame port assignment** — Replaced hash-based port selection with OS-assigned ports (MSSCI-16594, #1456)
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
- **Portrait pane caching** — TUI portrait pane shows image and caches quote per agent (MSSCI-16424, #1433)
- **Subagent pane statusbar** — Disabled CLI statusbar for subagent panes (MSSCI-16475, #1432)
- **Peloton tmux session leak** — Kill peloton-owned panes on stop to prevent session leaks (MSSCI-16474, #1431)
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
- **ReposPanel TUI** — Per-repo collapsible sections in TUI dashboard (MSSCI-16416, #1407)
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
- **Portrait pane catchphrase** — Shows catchphrase correctly (MSSCI-16424, #1416)
- **CLI startup performance** — Threshold 800ms, tmux/demo added to command registry (#1423)
- **CI cleanup** — Ruff lint, YAML lint, dead GUI shortcut removal (#1422)
- **Frame POLL_CHANNELS** — Removed event-driven channels (#1405)
- **Token stats WebSocket** — Added spans, token-stats, settings, subagent-transitions to POLL_CHANNELS (#1404)
- **Tmux template sync** — Updated stale templates with nesting guard, Frame rename, and double-CLI fix

## [13.0.0-alpha.2] - 2026-03-13

### Added

- **Native subagent infrastructure** — SM spawns subagents via Agent tool; phase-chaining orchestration routes work through TEA→Dev→Reviewer automatically (143-6, 143-7, 143-8, 143-12, MSSCI-16364, #1341)
- **Native subagent definitions** — Agent definitions for all 10 roles (Dev, TEA, Reviewer + 7 others) as Claude Code native subagents (#1339, #1340)
- **Subagent-dispatch gate** — Completion gate enforcing all subagents complete before phase exits; per-role tool restriction validation (143-12)
- **Handoff document schema** — Contract schema for inter-agent handoffs in native subagent mode
- **Spec-check and spec-reconcile phases** — Architect validates Dev implementation against story context before review, then produces definitive deviation manifest after review (144-6, 144-7, 144-9, #1386, #1376, #1377)
- **Architect spec-check mismatch taxonomy** — Structured deviation categories for consistent implementation deviation classification (MSSCI-16432, #1393)
- **AC-completion gate** — Validates acceptance criteria accountability at Dev exit (144-3, #1377)
- **Deviation format spec and gate** — 6-field deviation format with gate validation (144-1, #1362)
- **Deviation logging** — TEA and Dev log real-time spec deviations; Reviewer audits and stamps entries (144-2, #1383)
- **Spec deviation tracking** — Session output includes spec deviation records (#1331)
- **Saddle mode** — Background observer agent workspace: `pf saddle summon` launches agent in tmux pane (143-17, 143-18, 147-10, #1374, #1379, #1394)
- **Demo pipeline** — `pf demo generate` CLI, DemoOrchestrator pipeline entry point, demo.yaml branding and classification config, PPTX assembler (145-7, 146-1, 146-3, MSSCI-16401, MSSCI-16409, #1375, #1380, #1385, #1390, #1397)
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
- **OTEL spans WebSocket channel** — Traces and logs wired to WheelHub spans channel (MSSCI-16426, #1392)
- **Tmux pane discoverability** — Icons, borders, and env vars for tmux integration (MSSCI-16440, #1391)
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
- **Benchmark session continuity and entry gates** — Benchmark pipelines maintain session state across phases (MSSCI-16375, #1338)
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
- **Reviewer specialist subagents** — 6 specialist subagents (silent-failure, test, comment, type-design, security, simplifier) plus existing preflight and edge-hunter = 8 parallel Haiku subagents (MSSCI-16335, #1324)
- **Benchmark pipeline upgrade** — Pipeline replay exercises full Pennyfarthing machinery including workflow phases and gate enforcement (MSSCI-16336, #1326)
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
- **Reviewer edge-case hunter subagent** — Specialized subagent for adversarial edge-case detection (MSSCI-16333, #1323)
- **BMAD simulator template adapter** — Benchmark scenarios can use BMAD templates for story translation (#1320)
- **Startup agent auto-invoke** — Agents auto-invoke on SessionStart hook (MSSCI-16331, #1319)
- **Plan mode agent reload** — Agents reload on ExitPlanMode for seamless workflow transitions (MSSCI-16323, #1318)
- **OTEL telemetry streaming to disk** — Benchmark telemetry streams to disk instead of requiring BikeRack (MSSCI-16322, #1317)
- **FastAPI WheelHub API routes** — Core API routes ported to Python FastAPI WheelHub (MSSCI-16314, #1313)
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

- **SESSION_ID propagation to WheelHub** — Eliminated CYCLIST_SESSION_ID, set SESSION_ID before WheelHub spawn for correct agent detection (MSSCI-16303, #1310)
- **Merge gate docs alignment** — Gate documentation now reflects the in_review exception correctly (#1299)
- **Lint cleanup** — Removed unused type imports, fixed f-string and import sorting

## [12.6.2] - 2026-03-07

### Added

- **Consumer E2E test suite** — 6 scenarios covering fresh-init, re-init preservation, WheelHub Node 24, upgrade safety, orc-ax snapshot, and idempotency (MSSCI-16292)
- **WheelHub CJS banner fix** — esbuild bundler auto-patches `createRequire` shim for Node 24 ESM compatibility (MSSCI-16292)
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

- **Gold standard schema for scenarios** — Benchmark scenarios support gold_standard calibration references (MSSCI-16225)
- **Difficulty profile population** — Populate difficulty profiles from baseline benchmark data (MSSCI-16230)

### Fixed

- **TUI showing wrong agent persona** — BikeRack TUI launcher now forwards SESSION_ID to WheelHub for correct agent detection
- **Scenario validator test casts** — Use double-cast in scenario-validator tests for type safety

## [12.5.0] - 2026-03-06

### Added

- **Scenario Builder stepped workflow** — Interactive workflow for building benchmark scenarios with code and open-ended modes (MSSCI-16234)
- **Perplexity research guidance** — Orchestrator pattern doc for web-grounded research (#1295)
- **Reference anchors in judge prompts** — Benchmark judge prompts now include anchored rubric criteria (MSSCI-16220)
- **Sprint panel in-review differentiation** — In-review stories visually distinguished from backlog (#1293)
- **Multi-judge flag for /solo** — `--multi-judge` flag for comparative scoring (MSSCI-16215)
- **Output style config wiring** — `output_style` from config piped into agent activation (#1289)
- **TypeScript workflow engine replaced with pf CLI** — BikeLane workflow operations delegated to Python CLI (141-18)
- **Hook audit** — Unexported hooks exported or deleted (#1262)
- **Core API route tests** — Test coverage for agent-load through welcome API routes (MSSCI-16132, MSSCI-16133, MSSCI-16209)

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
- **PR title format configuration** — Configurable PR title format via `repos.yaml` with project-setup wizard step (MSSCI-16205)
- **Consumer gate extensions** — Projects can add custom gates via `repos.yaml` configuration (MSSCI-16204)
- **In-review story status** — Model story statuses on Jira lifecycle with `in_review` support (MSSCI-16200)

### Fixed

- **`pf init` no longer removes custom content** — Stopped `_clean_stale_content` from deleting user-created gates, workflows, and agents from consumer repos during init
- **Stale bootstrap_written reference** — Removed dead reference from init result output

## [12.4.0] - 2026-03-05

### Added

- **TypeScript workflow engine replaced with pf CLI** — BikeLane workflow operations delegated to Python CLI instead of TypeScript engine (141-18)
- **Port display in TUI and CLI statusbar** — BikeRack TUI shows WheelHub port next to "Connected" indicator; CLI statusbar shows OTEL port when telemetry is active
- **Project-level workflow definitions** — `.pennyfarthing/project/workflows/` overrides or extends distributed workflows with priority-ordered multi-dir search (141-25)
- **Homebrew tap and shell installer** — `brew install 1898andCo/tap/pennyfarthing` for macOS/Linux (MSSCI-16164)
- **Simplify subagents** — Three verify-phase teammates (reuse, quality, efficiency) with structured `SIMPLIFY_RESULT` format and fan-out/fan-in orchestration (138-1, 138-3, 138-4, 138-7)
- **Batch fan-out independence check** — File-overlap validation for parallel agent execution (139-1, 140-4)
- **`pf validate` in CI** — Document type validators wired into continuous integration (MSSCI-16146)
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

- **Homebrew installs** — `brew install 1898andCo/tap/pennyfarthing` will be the primary install path for macOS/Linux

### Changed

- **TypeScript file parsers replaced with pf CLI** — Subprocess calls instead of direct parsing (141-17)
- **`as any` casts removed** — Fixed cyclist tsc errors without type escapes (141-12)
- **Result objects in scripts** — Converted throw to result objects in scripts and generators (141-8)
- **Dependencies unified** — `@types/ws` and `yaml` consolidated; shared UI deps hoisted to root
- **WheelHub max port retries** — Increased from 10 to 16

### Documentation

- **Onboarding rewritten** — Three user journeys with brew-first install path (MSSCI-16187)
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

- **Relay mode handoff** — removed `is_gui` gating from relay mode handoff (MSSCI-16066)
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
- **WheelHub bundle isolation** — exclude benchmark module from bundle to prevent `findMonorepoRoot` crash in consumer environments (MSSCI-15933)

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
- **Guided tour workflow** — interactive stepped onboarding with switch gates, deep-dives, practice stories, and setup completion prompt (Epic 132, MSSCI-15640)
- **`pf dashboard`** — terminal dashboard command for project status overview (132-11)
- **Discovery nudges** — welcome banner discovery prompt and theme-based spinner verbs with feature tips (MSSCI-15748)
- **Frontmatter hooks** — agent and skill files declare their own hooks; integrated into `pf init` pipeline (129-5, 129-6)
- **Stale hook detection** — session start detects deprecated hooks and prompts upgrade
- **OTLP enrichment** — standalone telemetry enrichment for BikeRack TUI mode (132-5)
- **Release workflow enhancements** — package contents verification step, automated changelog comparison link updates (132-2, 132-3)
- **Sprint calculations backend** — moved sprint metric computation to backend (MSSCI-15763)
- **tmux overhaul** — CSI u keyboard fix, mouse copy support, integrated status bar, layout templates (MSSCI-15736)
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

- Rewritten Getting Started guide reconciled with ADR-0028 (MSSCI-15617)
- Accuracy and cross-reference fixes across 26 guide files
- Session-artifacts guide updated with Delivery Findings, Impact Summary, and PR body sections

---

## [12.0.0] - 2026-02-24

### Breaking Changes

- **Python-first installation** — `pip install pennyfarthing-scripts` replaces `npm install @pennyfarthing/core` as primary install path. `pf init` replaces `npx pennyfarthing init`. Epic 126 (MSSCI-15488).
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
- **DataSource refactor** — `DataSource<T>` pattern for panel data hooks (MSSCI-15554)
- **Ordinal IDs in sprint panel** — TUI and GUI show ordinal story IDs (MSSCI-15580)
- **Sprint standalone stories** — `pf sprint standalone add` and session archive steps
- **Event-driven Jira sync** — sync triggers on story transitions (125-8)
- **Story lifecycle state machine** — formalized story state transitions (125-7)
- **SprintContext dataclass** — centralized sprint data resolution (125-1, 125-2)
- **Sprint data canonical output** — `pf sprint data --json` for subprocess consumption (125-6)
- **What Is Pennyfarthing** — reference card guide (MSSCI-15616)

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

## [11.5.0-alpha.0] - 2026-02-21

### Added

- **BikeRack TUI auto-reload** — dev-mode auto-reload for BikeRack TUI panels (120-11)
- **Story details enrichment** — story details and progress page enrichment with native Textual widgets (120-8)
- **Jira search** — plain text and JQL search support (MSSCI-15405)
- **Sprint panel completed epics** — show completed epics section in TUI (120-8)
- **Kitty graphics passthrough** — wrap Kitty graphics in tmux DCS passthrough for terminal image support (MSSCI-15389)
- **Debug panel refresh** — improved refresh rate for real-time token tracking (121-1)
- **SettingsPanel read-only** — convert SettingsPanel to read-only display with CLI reference (122-1, 122-2)
- **Consumer install smoke test** — CI job to verify consumer npm install works (123-6)
- **Package contents gate** — assertion test and npm pack gate for package integrity (123-1)
- **Release CLI tools** — `pf release dry-run` and `pf release deprecate` commands
- **Changelog automation** — automate comparison link updates in CHANGELOG.md (123-2)
- **Portrait freeform prompt** — freeform prompt mode for generate-portraits
- **Sprint canonical ordering** — add refs to STORY_KEY_ORDER for canonical positioning
- **`get_dist_root()` migration** — refactor all call sites to use centralized dist root resolution (120-7)
- **npm path resolution fix** — resolve path resolution assuming monorepo layout (MSSCI-15401)

### Changed

- **BackgroundPanel removed** — killed BackgroundPanel and fixed stale tests (MSSCI-15348)
- **Dead interactive components removed** — removed unused interactive components after SettingsPanel conversion (122-3)
- **BikeRack footer** — consolidated footer into unified status bar
- **Portrait images** — excluded portrait images from npm tarballs; moved tandem watermark out of persona portraits

### Fixed

- **Sprint provenance** — add sprint provenance indicator to React and Python TUI (120-6)
- **Settings display** — show default values in italics when not explicitly set
- **Cyclist CLI entry** — point CLI command at bikerack.js entry instead of server.js
- **Cyclist settings** — read display and workflow settings from config.local.yaml
- **Doctor checks** — fix persona-config false negative when config.local.yaml missing (117-10); detect orchestrator repo layout in checkGitHooks
- **CLI fixes** — respect repos.yaml symlink targets in init/update/doctor; use getPackageVersion() for --version flag
- **Context resolution** — replace dots in username when resolving transcript path
- **Sprint panel** — filter archived epics from active sprint view
- **CI fixes** — resolve Ruff lint errors and relax startup benchmark threshold
- **Build** — add react-dom peer dependency extension for dockview

---

## [11.4.0] - 2026-02-20

### Added

- **Git panel consolidation** — merged Changed panel into Git panel with diff drill-through (MSSCI-15347)
- **Sprint Panel future initiatives** — show future epics and children in BikeRack TUI Sprint Panel (MSSCI-15345)
- **Stale artifact cleanup** — detect and remove stale build/session artifacts (117-3)
- **Hook migration** — migrate bare `pf` hook commands to `pf.sh` wrapper path (117-2)
- **Settings visibility** — `pf settings show` now displays all settings with defaults
- **PR merge setting** — `workflow.pr_merge` option for human-reviewed PRs

### Fixed

- **npm packaging** — add `src/public/`, express, and ws dependencies to package files
- **Hook permissions** — ensure project hook scripts have execute permission on install
- **Portrait resolver** — add cyclist package fallback for consumer installs
- **Sprint validator** — accept generic Jira project keys and optional sprint fields
- **Epic shard paths** — strip `epic-` prefix to prevent double-prefix in merge
- **pnpm virtual store** — resolve path correctly; fix BMAD sub-story ID collapse
- **Test suite** — resolve ruff, core test, and cyclist test failures

---

## [11.3.8] - 2026-02-19

### Fixed

- **Release workflow** — use `pnpm publish` to resolve `workspace:*` dependencies; `npm publish` leaked literal `workspace:*` refs to registry (11.3.7 cyclist affected, deprecated)

---

## [11.3.7] - 2026-02-19 [DEPRECATED]

### Fixed

- **Portrait resolution** — resolve portraits from `@pennyfarthing/cyclist` in consumer installs

---

## [11.3.6] - 2026-02-19

*No unreleased changes*

---

## [11.3.5] - 2026-02-19

*No unreleased changes*

---

## [11.3.4] - 2026-02-19

### Added

- **Cross-entity reference validation** — validate references across sprint entities (91-15)

### Changed

- **Python package path migration** — `pennyfarthing_scripts` references updated to `pennyfarthing-dist/pf` package path (MSSCI-15339)

---

## [11.3.3] - 2026-02-19

### Added

- **Configurable Jira project** — `pf setup` now includes Jira project key step; stored in config (MSSCI-15336)

### Fixed

- **Discworld theme** — fix character-body misalignment in theme definition

---

## [11.3.2] - 2026-02-19

### Added

- **BMAD adapter** — bidirectional sprint sync between BMAD markdown and PF YAML (MSSCI-15332)
  - `pf bmad import` — initial import from BMAD project
  - `pf bmad sync --pull/--push/--both` — bidirectional status sync
  - `pf bmad status` — drift report
  - Parser, importer, sync engine modeled on Jira adapter pattern

---

## [11.3.1] - 2026-02-19

### Added

- **Explicit gate files** — migrate agent inline checklists to standalone gate definitions (MSSCI-15307)
- **Split-pane layouts** — workflow-aware split-pane presets for BikeRack TUI (110-4)
- **Team-mode protocol docs** — add team-mode protocol to agent-behavior guide

### Fixed

- **bc focus panels** — add `progress` to VALID_PANELS in bc/focus.py (110-4)

---

## [11.3.0] - 2026-02-19

### Added

- **Doctor category filtering** — `doctor` command supports `--category` filtering and installation-check workflow (MSSCI-15327)
- **pf.sh hook migration** — bare `pf` hook commands migrated to `pf.sh` wrapper path (117-2)
- **pyproject.toml shipping** — ship `pyproject.toml` for consumer Python hooks (117-1)
- **Settings CLI** — `pf settings` CLI and `/pf-settings` skill for runtime config management (MSSCI-15309)
- **Context meter refresh** — periodic refresh and throttling for BikeRack context meter footer (110-12)

### Fixed

- **getDistDir() path resolution** — resolve wrong path in npm-installed mode (core)
- **Skill count in tests** — update hardcoded skill count from 21 to 22 (shared)
- **Cyclist WebSocket settings** — re-init settings in `setupWebSocketServers` and fix 12 stale tests
- **find-root.sh** — resolve to orchestrator root correctly in dogfooding layout (scripts)
- **Panel switch redraw** — fix initial state issue in panel switch redraw test

---

## [11.2.2] - 2026-02-18

*No unreleased changes*

---

## [11.2.1] - 2026-02-17

### Added

- **2pTDD workflow** — two-party TDD workflow with review/PR lifecycle (epic-92)
- **BikeRack audit log panel** — real-time audit log panel for TUI (110-8)
- **BikeRack context meter** — ContextMeterFooter showing context usage in TUI footer (110-5)
- **BikeRack story drill-through** — story dossier detail screen with drill-through navigation (110-2)
- **BikeRack cross-panel event bus** — Changed-to-Diffs navigation with event bus (110-1)
- **Cyclist Tandem dialogue panel** — WebSocket-based tandem observation display (86-11)
- **BikeRack portrait rendering** — Kitty TGP portrait images in agent header (110-3)
- **Phase-scoped team lifecycle** — team block validation and phase-scoped lifecycle in Python (86-9, 86-10)
- **Team block validation** — workflow schema parsing for team blocks (86-9)

### Changed

- **BikeRack sprint panel** — improved layout and story detail context (MSSCI-15235)
- **BikeRack tab bar and sprint panel** — migrated to native Textual widgets
- **Agent handoff** — CLI relay mode fixed and bash scripts ported to Python (MSSCI-15228)

### Fixed

- **Gates missing from npm package** — added `pennyfarthing-dist/gates/` to `files` array so end users receive gate definitions after `npm install`
- **Tandem handoff** — write tandem line to session during phase transitions
- **BikeRack WebSocket updates** — route through Textual message system for reliable redraws
- **Sprint data totals** — include archived epics and standalone stories in sprint totals
- **CLI assets path** — use assetsPath for commands/skills source resolution
- **Agent load stub** — return cachedAt to prevent Invalid Date

---

## [11.2.0] - 2026-02-16

### Added

- **Tandem protocol suite** — awareness validator, workflow templates, metrics/token tracking, portrait branding with theme variations, dialogue manager Python port (86-4, 86-5, 86-6, 86-16, 86-17)
- **Native teams support** — capability detection for Claude Code native teams feature (86-7)
- **Teammate activation** — spawn prompt builder for teammate activation flows (86-8)
- **Agent activation heatmap** — diagnostic tool for visualizing agent activation patterns (MSSCI-15176)
- **WheelHub namespace unification** — port/pid files consolidated under wheelhub namespace (MSSCI-15174)
- **BikeRack TUI feature parity** — enhanced panels, ProgressPanel, interactive epics (MSSCI-15166)
- **OTLP integrations** — real OpenTelemetry integrations replacing core server stubs (98-23)
- **Lock-free git status** — read-only git status checks and improved cache invalidation (MSSCI-15125)
- **Electron release workflow** — GitHub Actions CI/CD for standalone Electron distribution (98-21)

### Changed

- **Git scripts migrated to Python CLI** — bash git scripts replaced by `pf git` Python commands
- **Workflow scripts migrated to Python CLI** — bash workflow scripts replaced by `pf workflow` Python commands

### Fixed

- **Stale port file references** — remaining references updated to wheelhub namespace (MSSCI-15174)
- **Handoff assessment guard** — moved from resolve-gate to complete-phase for correct sequencing

---

## [11.1.1] - 2026-02-16

### Fixed

- **BikeRack start idempotency** — `pf bikerack start` no longer errors when already running; reuses existing WheelHub and execs Claude
- **BikeRack stop idempotency** — `pf bikerack stop` exits 0 when not running instead of erroring
- **BikeRack project dir resolution** — Use `CYCLIST_PROJECT_DIR` env var in `bikerack.ts`; save PID to `.wheelhub-pid` file; launch Claude with `cd` instead of `--project-dir`
- **Missing `ba` agent in CORE_AGENTS** — Added Business Analyst to `constants.ts` and migration `005-migrate-sidecars.js` so sidecars are created and migrated correctly

---

## [11.1.0] - 2026-02-15

### Added

- **Gate system** — File-based gate definitions with schema validation, subagent runner with GATE_RESULT contract, gate file discovery and resolution, SM confidence gate (106-1, 106-2, 106-3, 106-4, 107-1, 90-2, 90-3)
- **Handoff CLI** — `pf handoff` commands (resolve-gate, complete-phase, marker) replacing bash scripts, with e2e smoke tests (105-1, 105-4)
- **Tandem protocol** — Workflow schema tandem block validation and consultation protocol (86-1, 86-2)
- **Unified CLI groups** — Consolidated deprecated commands into `/pf-git`, `/pf-session`, `/pf-epic`, `/pf-docs`, `/pf-ci` groups (MSSCI-15113)
- **Electron extraction** — Extracted Electron shell to `packages/electron` for cleaner separation (98-20)
- **v11 migration automation** — Auto-detect and remove old packages and backward-compat symlinks (98-22, 98-13)
- **DebugPanel** — BikeRack TUI debug log viewer (103-17)
- **Large diff handling** — Truncation, pagination, and temp file support for oversized diffs (103-19)
- **Layout persistence** — Server endpoints for Cyclist and BikeRack layout save/restore

### Changed

- Agent definitions deduplicated — exit protocol consolidated, ghost references removed
- BikeRack defaults to hot-reload mode, launches Chrome and Claude after backgrounding server
- Portrait generation supports `--engine` flag for multi-engine output

### Fixed

- Panel data flow issues in BikeRack mode
- Changed tab crash, Debug auto-fetch, and theme-agents `/full` route in Cyclist
- CI failures (lockfile sync, ruff lint, sprint panel cancelled-as-completed)
- Stale `.pennyfarthing/scripts/core/` path prefix in agent exit sequences
- Theme `quote` → `catchphrases` migration and YAML lint errors
- Markdown trailing newline (MD047) and Python import sort (I001) lint errors

### Documentation

- Full documentation sweep with 5 new guides and v11 README update
- Agent exit protocol updated to script-first flow (105-2)

---

## [11.0.0] - 2026-02-14

### Added

- **BikeRack TUI** — Full terminal-native dashboard replacing browser-based panels, built with Textual. Includes scaffold (103-1), WheelHub WebSocket client with auto-reconnect (103-2), `pf bikerack` launcher command (103-3), connection status indicator (103-4), BasePanel channel subscription with Rich rendering (103-5), SprintPanel (103-6), panel focus via `/ws/focus` (103-7), panel persistence for ERB and TUI (103-8), panel header chrome with Nerd Font icons (103-9), GitPanel multi-repo status (103-10), ChangedPanel file list with status icons (103-14), AuditLogPanel with auto-scroll and manual override (103-15), BackgroundPanel task status display (103-16), DiffsPanel with Rich diff rendering and syntax highlighting (103-18), TUI launcher entry point (103-20), git fetch cooldown to prevent frequent network calls (103-21)
- **Panel focus system** — `pf bc` CLI command and `/bc` skill for controlling which panel BikeRack focuses on (104-1), WheelHub config file watch with panel focus broadcast (104-2), `useFocusPanel` React hook for layout stash/restore (104-3), named layout save/load/list/clear (104-4)
- **Core consolidation** — Absorbed `@pennyfarthing/shared` and benchmark packages into core (98-16), extracted WheelHub server from Cyclist into `packages/core/src/server/` (98-17), moved React UI build pipeline and static assets to core (98-18). Cyclist is now a thin wrapper adding WebSocket + OTLP
- **Namespace isolation** — Prefixed all built-in skills and commands with `pf-` (98-4), updated agent definitions and docs for new references (98-7), sprint shard migration as versioned migration (98-5), protective symlink pre-flight checks (98-6)
- **Settings merge model** — Shared merge model for `settings.local.json` so Cyclist and CLI don't overwrite each other's settings (98-11)
- **Git hook chaining** — `.d/` dispatcher pattern lets multiple hooks coexist without overwriting (98-12)
- **ProgressPanel** — At-a-glance story dashboard showing sprint progress in Cyclist (103-11)
- **New persona themes** — Hogan's Heroes and Stephen King theme packs (MSSCI-15087)
- **CLI normalization** — Lowercase choices, unified `--json` flag, sugar shortcuts across all `pf` commands (91-28)
- **Validate-refs CI** — CI job and pre-commit warning for broken file references, per-check reference counters, plugin skill discovery (validate-refs)
- **Party mode roleplay** — Multi-round agent discussion variant for brainstorming sessions
- **Release workflow** — Alpha/beta/rc prerelease support with channel graduation
- **Sprint CLI** — Epic update command (`pf sprint epic update`), `--workflow` option for story update
- **Archive sharding** — Migration and loader for sharded completed-story archives (td-4)
- **Mid-session launch** — `pf gui` and `pf tui` commands to launch Cyclist or BikeRack without restarting (MSSCI-15072)
- **Orphan shard discovery** — Sprint loader automatically finds and includes orphaned epic shards (MSSCI-14990)
- **Copy-to-clipboard** — Sprint Panel story/epic ID copy button in Cyclist (MSSCI-15030)
- **Quick-spec workflow** — New stepped workflow for rapid specification with architecture domain data
- **PRD domains** — Process control and building automation domain data for PRD workflow
- **Skill docs** — Restructured into staggered discovery with CLI index (91-28)
- **BikeRack panel state persistence** — Panels remember their state across TUI restarts (td-3)

### Changed

- **Cyclist/BikeRack unified serving** — Both modes now serve from `/` via environment discriminator instead of separate paths
- **Monty Python theme** — Reworked to Flying Circus focus, moved to core themes package; Star Trek TNG moved to scifi package
- **Cyclist thins out** — Dropped `@pennyfarthing/shared` dependency, removed dead copy-mode code paths (98-14)

### Removed

- **TTY panel** — Removed TTY panel and `node-pty` dependency entirely (98-15). Terminal emulation replaced by TUI panels
- **pf-dev-patterns skill** — Removed unused skill and stale references

### Fixed

- **Uninstall safety** — `pennyfarthing uninstall` no longer destroys user-created commands and skills (98-9)
- **Sprint shard bugs** — Stopped auto-merging orphan epic shards into current sprint, fixed epic shard deletion on promote, wired `_canonicalize` into `validate --fix`, fixed `completed_stories` population when archiving epics
- **Layout corruption** — Prevented empty layout persistence and restore corruption in both Cyclist and BikeRack, fixed config corruption on YAML roundtrip in `/bc`
- **Settings symlink crash** — Handle existing real file in `ensureSettingsSymlink` instead of crashing
- **Settings panel** — Wired theme list API, OTLP provider pattern, and general settings cleanup (#894)
- **Monorepo paths** — Added monorepo path resolution for public and dist dirs, enabled workspace linking for package resolution, replaced `workspace:` protocol refs with npm version ranges for publishing
- **Port binding** — `findAvailablePort` now binds to `127.0.0.1` instead of all interfaces

### Security

- Addressed security issues #888, #890, #891, #892

---

## [10.4.0] - 2026-02-12

### Added

- **Versioned migration runner** — Infrastructure for running numbered migration scripts with state tracking (98-2), extracted inline migrations from `update.ts` into versioned migration files (98-3): manifest migration, legacy directory cleanup, template file migration, sidecar migration, settings file migration
- **Version sentinel** — Automatic version detection via sentinel file for triggering migrations on update (98-1)

### Fixed

- **Sprint panel next-up** — Next-up section now honors `assigned_to` field, showing only stories assigned to the current user (100-8)
- **Just recipes** — Replaced `.venv/bin/python` with system `python3 + PYTHONPATH` for broader compatibility

---

## [10.3.1] - 2026-02-12

### Fixed

- **BA agent mappings** — Added BA agent to all color, abbreviation, and label mappings across statusline, Cyclist UI components (PersonaHeader, AgentPopup, MessageView, TandemPortrait), message filters, and spider report scripts
- **Fifth Element theme** — Removed stray `shortName` from devops agent definition

### Added

- **BikeRack settings panel** — Added settings panel to BikeRack standalone viewer panel list
- **BikeRack env port** — Allow `BIKERACK_PORT` env var to override default port (2898)

---

## [10.3.0] - 2026-02-12

### Added

- **BikeRack Dockview migration** — Migrated BikeRack from index page to proper Dockview layout with `isBikeRackMode()` gate and `bikerack.ts` entry point (101-1), StandalonePanel wrapper with `?panel=X` routing (101-2), BikeRackIndex panel listing page (101-3), SettingsPanel in BikeRack standalone routes (102-2)
- **BikeRack launcher CLI** — `--project-dir` flag for decoupled launch, allowing BikeRack to run against any project directory (101-5)
- **PortraitPanel with tandem support** — Portrait panel component for Cyclist with tandem agent display (101-4), anchored above Dockview tab bar (102-6)
- **BikeRack integration verification** — Runtime verification tests for BikeRack integration correctness (101-6)
- **Repos topology system** — `repos.yaml` schema validation (87-1) and topology wired into agent prime context for multi-repo awareness (87-2)
- **Output path normalizer** — Normalize output paths in workflow YAML to use `sprint/planning/` paths (91-27), updated all workflow YAML files
- **Sprint metrics** — Sprint metrics from completed/current/future added to SprintData (100-6)
- **Business Analyst (BA) agent** — New agent for requirements discovery and stakeholder analysis, with persona entries across all 27 core themes

### Changed

- **BikeRack UX sweep** — Single group layout, visible sashes, removed TTY and BikeLane panels from BikeRack mode (102-7)
- **Workflow skill keywords** — Added `tdd-tandem` and `bdd-tandem` to workflow skill keyword list

### Fixed

- **BikeRack provider context** — Wrapped BikeRackWorkspace in ClaudeProvider, set explicit viewport dimensions, use no-op ClaudeContext for BikeRack mode (102-1)
- **Lint cleanup** — Resolved unused imports and variables across test files

---

## [10.2.0] - 2026-02-11

### Added

- **Tandem backseat protocol** — Background observer agents watch primary agent work and inject observations via PostToolUse hook. Full pipeline: observation file writer (95-3), file-watch scope (95-4), tool-watch scope (95-5), backseat spawn/lifecycle (95-2), bell mode injection (95-7, MSSCI-14672), shared agent behavior wiring
- **Tandem workflows** — `tdd-tandem` (97-2) and `bdd-tandem` (MSSCI-14791) workflow definitions with automatic backseat pairing per phase
- **TandemPortrait component** — Cyclist UI for tandem mode: backseat thinking animation (MSSCI-14675), observation pulse on primary portrait (MSSCI-14676), responsive behavior and accessibility (MSSCI-14677)
- **CLI statusline tandem indicator** — Shows active tandem partner in CLI status bar (97-1)
- **Plugin system** — Plugin discovery for commands and skills (93-3), plugin router loader for Cyclist (93-6)
- **Benchmark package** — Extracted `@pennyfarthing/benchmark` package with migrated modules (93-1), commands/skills/scripts (93-2), docs/results/showcase (93-4)
- **CI quality gates** — ESLint enforcement across all packages (91-7), Ruff linting for Python (91-8, MSSCI-14706), markdownlint (91-9, MSSCI-14707), yamllint (91-10, MSSCI-14708)
- **Schema validation** — Workflow YAML validation (91-11), agent definition structural validation (91-12), skill registry and command schema validation (91-13), sprint shard write-time validation (91-24), tandem field in WorkflowPhase schema
- **Cyclist enhancements** — Quick agent picker in control bar (MSSCI-14762), closed epics section in SprintPanel, ACPanel Tufte treatment (100-3), sparkline bar chart with token-based color coding (MSSCI-14639), health gauge wired to tool dialogs (84-3), `@deprecated` detection and caller cross-reference (80-2), permission mode changes sent to running Claude process
- **PersonaHeader streaming** — `usePersona` hook with streaming state (94-1, MSSCI-14660), thinking throbber on portrait (94-2, MSSCI-14661)
- **Fifth Element theme** — New persona theme with 10 agent portraits and Cyclist-served resized images
- **Sprint enhancements** — `pf sprint info` with full header fields (91-26, MSSCI-14720), non-string epic ID detection in sprint YAML validator
- **Health score probes** — Missing probes implemented, PyDriller churn integration, parallelized on-demand analysis

### Changed

- **Bell mode hook decoupled from Cyclist** — Tandem injection runs unconditionally; bell queue only fires when Cyclist is running with `bell_mode: true`
- **Benchmark extracted from core** — `feat!: remove benchmark exports and API from core` — benchmark functionality moved to dedicated `@pennyfarthing/benchmark` package
- **Persona name removed from quick picker** — Agent quick picker shows role only, not persona name (100-4)
- **Cyclist detection** — Uses `CYCLIST` env var instead of port file for more reliable detection (98-8)

### Fixed

- **Tandem observation injection** — Decoupled from bell_mode config and Cyclist detection to prevent silent failures in CLI-only tandem workflows
- **PersonaHeader CSS** — Layout overflow and clipping fixes, explicit widths on flex children, overflow hidden on persona-info
- **Health score** — `useHealthScore` abort-on-unmount, missing probes, PyDriller integration
- **Plugin loading** — Plugin router loading in Electron mode with strengthened tests (93-6)
- **Story lifecycle** — Preserve `assigned_to` field through story lifecycle (MSSCI-14719), sprint CLI import name fix
- **Doctor and uninstall** — 5 data-loss bugs in uninstall and `doctor --fix` (MSSCI-14587)
- **Cyclist UI** — Muted sprint priority indicators, resizable editor, project root as cwd for Python API routes, debug panel refactors restored
- **Scripts** — Use `sys.executable` instead of hardcoded `python` in story_finish, deprecate `finish-story.sh`
- **Fifth Element theme** — Resolve conflict markers, correct Pacoli helper to Aziz

---

## [10.1.0] - 2026-02-08

### Added

- **Health score gauge and API** — Composite 0-100 codebase health score with scoring algorithm, caching, formatters, and Cyclist gauge component (84-2, MSSCI-14470)
- **Dead code analysis** — Stale file detection (81-1), unused TypeScript export detection via ts-prune (MSSCI-14459), and dead code API with dialog in Cyclist (81-3)
- **Code markers API and dialog** — Scan for TODO, FIXME, HACK, XXX comments with Python grep+git-blame module and Cyclist dialog (80-3)
- **Complexity and dependencies APIs** — Python complexity module (83-1), dependencies module (83-2), and Cyclist dialogs with Express routers (83-3)
- **Agent load monitoring** — Agent-load API endpoint (82-1), sidecar pruning endpoint (82-2), and useAgentLoad hook with AgentLoadDialog (82-3)
- **Tool dialogs** — Shared ToolDialog component (79-1), HotspotsPanel migrated to HotspotsDialog (79-2), tool launcher row in DebugPanel (79-3)
- **Hotspot enhancements** — Expand artifact exclusions and client-side filters (79-5), `--skip-type` option for hotspots CLI and UI (79-4)
- **2party-tdd workflow** — New workflow definition (v2.0.0) for two-party TDD with story refinement and review rejection loops (92-1)
- **Cross-file reference validator** — Validates internal references across pennyfarthing-dist with 4 reference check types and test suite
- **Sprint enhancements** — `--initiative` flag for `pf sprint story add`, `assigned_to` tracking for stories, epic archive step in finish-story
- **Theme CLI** — New `pf theme` command group for theme management (MSSCI-14565)
- **Agent activation blocks** — All command files now include agent-activation blocks
- **Auto-load SM** — SessionStart hook automatically loads Scrum Master agent

### Changed

- **Cyclist dialog standardization** — Standardized dialogs and panels on inline Tailwind with theme variables
- **Sprint panel enrichment** — Sprint panel now shows priority, workflow, and dates
- **Message view** — Skill content replaced with labels, badge/timestamp reordered
- **Theme commands consolidated** — All theme commands unified under `/theme` skill
- **Finish-story rewritten** — Finish story script rewritten as Python module with shard-based epic archiving

### Fixed

- **Jira bidirectional sync** — Wire `--assignee` flag and fix shard-aware YAML writes in bidirectional sync
- **Cyclist UI** — AC panel styling aligned with shared CSS, Jira links open in system browser, epic collapse fixed, git panel sync icon and dialog scroll overflow, maxBuffer for code-markers API, git cache invalidation regex for -C flag
- **Doctor improvements** — Handle worktrees and remove symlink chmod no-op, detect stale git hooks and missing symlinks
- **Stale references fixed** — 8 broken references across skills, workflows, guides, and commands (MSSCI-14517 through MSSCI-14554)
- **Hooks** — `find-root.sh` fallback for copied git hooks, exclude `sprint/context/archived/` from YAML validation
- **Agent activation** — Use `pf` CLI instead of broken PYTHONPATH dance
- **Welcome screen** — Fix centering and color scheme detection

---

## [10.0.5] - 2026-02-07

### Added

- **Jira standalone story creation** — New `pf jira create standalone` CLI command for wrapping ad-hoc changes into tracked Jira stories (MSSCI-14491)

### Changed

- **Sprint scripts migrated to Python CLI** — All bash sprint scripts replaced with `pf sprint` Python CLI commands for consistency and testability (MSSCI-14490)

### Fixed

- **Epic promote leaves stale initiative references** — `pf sprint epic promote` now removes empty initiative shards and cleans up `future.yaml` when the last epic in an initiative is promoted
- **Deleted sprint script references** — Updated all agent docs, guides, and workflow files to reference `pf` CLI commands instead of removed bash scripts

---

## [10.0.4] - 2026-02-07

### Fixed

- **Missing @pennyfarthing/shared dependency** — Published `@pennyfarthing/core` package now declares `@pennyfarthing/shared` as a dependency, fixing "Dependencies not installed" errors for all npm consumers (MSSCI-14482)
- **4 pre-existing test failures** — Regenerated `pnpm-lock.yaml` to fix missing `yaml` symlink in `packages/shared/node_modules`, resolving `ERR_MODULE_NOT_FOUND` in `theme-loader`, `migrate-theme-schema`, `ocean-profiles`, and `theme-maker` tests (MSSCI-14483)

---

## [10.0.3] - 2026-02-07

### Added

- **Doctor file layout validation** — `pennyfarthing doctor` now validates that distributed files (agents, guides, scripts, etc.) are present and correctly structured under `.pennyfarthing/` (MSSCI-14372)
- **Legacy sidecar cleanup** — `pennyfarthing update` removes old sidecar directories during migration to `.pennyfarthing/` layout (MSSCI-14369)
- **Project hooks consolidation** — Project hooks moved into `.pennyfarthing/project/` for cleaner separation from framework hooks (MSSCI-14368)
- **Helper verb inflection** — Subagent display messages now use correct is/are verb forms (MSSCI-14416)
- **PreToolUse hook support** — `cyclist-pretooluse-hook` added to `init` and `update` commands

### Fixed

- **Jira CLI migration** — Fixed Jira CLI integration issues and updated Jira skill for new `pf jira` commands (MSSCI-14451)

### Changed

- **Reflector replaces AskUserQuestion** — Removed AskUserQuestionBlock in favor of Reflector `<!-- CYCLIST:CHOICES -->` markers for agent-to-UI communication
- **Window title** — Cyclist window title now shows the project directory name

---

## [10.0.2] - 2026-02-06

### Fixed

- **npm publish includes pennyfarthing-dist/** - Added `pennyfarthing-dist/` to `packages/core/package.json` `files` array with symlinks to monorepo root. Previously only `dist/` and `bin/` were published, causing `pennyfarthing update` to fail with "Package directory not found"
- **npm publish compatibility** - Replaced `workspace:*` with `workspace:^` in internal package dependencies. `workspace:*` was left as-is by pnpm during publish, causing npm consumers to fail with `EUNSUPPORTEDPROTOCOL` error when installing `@pennyfarthing/core`

---

## [10.0.0] - 2026-02-06

### Added

- **Clean Install Consolidation (Epic-85)** - All Pennyfarthing-managed files consolidated under `.pennyfarthing/` instead of scattered across `.claude/`, `.git/hooks/`, and `.session/`
  - `init` command creates consolidated layout (MSSCI-14370)
  - `update` command migrates legacy `.claude/`-based installs to `.pennyfarthing/` (MSSCI-14371)
  - `settings.local.json` canonical location moved to `.pennyfarthing/` with symlink compat (MSSCI-14366)
  - `persona-config.yaml` consolidated to `.pennyfarthing/` exclusively (MSSCI-14367)
  - E2E test for fresh repo install (MSSCI-14373)
  - E2E test for existing repo upgrade with migration validation (MSSCI-14374)
  - Audit of all files Pennyfarthing produces outside `.pennyfarthing/` (MSSCI-14365)
- **Tool Use Approval System** - Full hook-based permission flow replacing legacy IPC
  - PreToolUse hook update and registration (MSSCI-14320)
  - Grant checking integrated into WheelHub hook router (MSSCI-14321)
  - ApprovalModal mounted in App.tsx component tree (MSSCI-14322)
  - Severity classification for hook requests (MSSCI-14323)
  - Grant persistence with session scoping and shutdown cleanup (MSSCI-14324)
  - `/permissions` skill connected to grant store (MSSCI-14325)
  - Workflow permission presets integration (MSSCI-14326)
  - Agent-level permission scoping (MSSCI-14392)
  - Legacy IPC approval path removed (MSSCI-14318)
- **Smooth Plan Mode Exit** - Tirepump choice UI for plan mode exit (MSSCI-14327)
- **PostToolUse Hooks** - Added to settings template for hook-based workflows (MSSCI-14373)
- **Doctor Cyclist Health Checks** - node-pty spawn-helper validation
- **Context Cleared Indicator** - Light/dark icon support in Cyclist
- **Click-to-Sort Markdown Tables** - Sortable columns in message content
- **Workflow Start Button** - Available workflows panel has direct start action
- **Subagent Naming** - Persona output includes subagent naming instructions

### Changed

- **BREAKING: Install Layout** - New installs use `.pennyfarthing/` as root instead of `.claude/`. Existing installs migrated via `pennyfarthing update`
- **Subagent Tab Renamed** - "Subagents" instead of previous label, with completion tracking

### Fixed

- **Subagent Span Cleanup** - Extract `tool_result` from user SDK messages to clear completed spans
- **Persona Config References** - All remaining `.claude/persona-config.yaml` paths updated
- **PreToolUse Hook** - No longer returns 'ask' when Cyclist not running
- **Sprint YAML Compat** - Detect single-quoted multiline strings that break Node yaml parser
- **Markdown Table Styles** - Proper table rendering in message content
- **Color Preset Startup** - Saved color preset applied correctly on startup
- **Background Task Completion** - Tasks completed via OTEL with panel toggles and UX fixes
- **Sprint Panel Updates** - Broadcast sprint update on session file changes
- **User Message Alignment** - Left-aligned with removed unused notifications
- **Completed Subagent Messages** - Removed from message view after completion

---

## [9.4.0] - 2026-02-05

### Added

- **Tufte-Inspired Message Redesign** - Stripped chat bubbles, messages flow as typographic content with turn-based grouping, speaker labels, and indented left-border tool calls (Cyclist)
- **Per-Message Persona Identity** - Agent messages stamped with persona at creation time; avatar, name, and role badge persist even after persona switches (Cyclist)
- **Message View Identity Labels** - Turn labels show persona character name + GitHub username instead of generic "Agent"/"You", with colored role badges (Cyclist)
- **SubagentSpan Tufte Redesign** - Subagent blocks match indented left-border style, default collapsed with truncated prompts and persistent collapse state across remounts (Cyclist)
- **Full File Tree in Changed Panel** - Replaced flat FileTree with full directory tree using `/api/files` for lazy directory listing (Cyclist)
- **Available Workflows Panel** - WorkflowPanel shows available workflows with stepped workflow display (MSSCI-14301)
- **Subdirectory Workflow Lookup** - Workflows discovered from subdirectory `.pennyfarthing/workflows/` paths (MSSCI-14300)
- **Stepped Workflow State Advancement** - BikeLane stepped workflow session state wired up via `complete-step` CLI (MSSCI-14299)
- **Sprint YAML Toolchain** - `yaml_io` module with deterministic serialization, `sprint validate --fix`, `sprint story add`, `sprint story update` commands (76-1 through 76-4)
- **Pre-Commit YAML Validation** - Sprint YAML validated in pre-commit hook
- **Git Hotspot Detector** - Identifies frequently-changed files via git history analysis (MSSCI-14283)

### Changed

- **Enlarged Persona Portrait** - Portrait enlarged from 40px to 100px with collapsible compact mode (Cyclist)
- **Abbreviated Role Badges** - Role badges show compact abbreviations (DEV, SM, TEA, REV, etc.) instead of full names
- **Relay Mode Icon** - Changed from bicycle emoji to hand-raise emoji
- **User Message Alignment** - User messages right-aligned with right-side blockquote border to visually differentiate from agent messages (Cyclist)
- **Tool Call Spacing** - Increased vertical margin between tool blocks and messages for better readability (Cyclist)
- **Phase Name Standardization** - Renamed `impl` to `implement` across codebase
- **complete-step CLI** - Rewritten from bash to Python

### Fixed

- **Settings Persistence** - Color preset and font choices now survive restart; `GET /api/settings` reads `display` and `notifications` from config.local.yaml (Cyclist)
- **Font Picker Overflow** - Constrained dropdown to max-height, rewrote monospace detection via OpenType `post` table instead of broken canvas hack, cached results in localStorage
- **Monospace Font Detection** - OpenType `isFixedPitch` field used instead of unreliable canvas width comparison
- **SubagentSpan Re-Expanding** - Collapse state persisted via ref across React remounts caused by turn-group key changes (Cyclist)
- **Single Tool Call Grouping** - Single tool calls now grouped into stacks for consistent rendering
- **Discworld Persona ShortNames** - Aligned shortNames with characters after Job Fair audit

---

## [9.3.0] - 2026-02-05

### Added

- **Release Workflow** - Interactive 11-step BikeLane workflow replacing fire-and-forget deploy.sh, with verification gates at every destructive point
- **Changelog Step** - Release workflow generates entries from conventional commits using `/changelog` skill
- **README/CLAUDE.md Steps** - Release workflow audits and updates documentation before committing
- **Optional Retro Step** - Release workflow offers `/retro` before cutting the release

### Changed

- **ToolStack Display** - Redesigned ToolStack display with ThemePalette fixes
- **Audit Log** - Tufte-inspired audit log with enriched detail rows
- **deploy.sh** - Version bump loop and staging now auto-discover all workspace packages including theme packs
- **Package Publishing** - npm publish step covers all workspace packages (core, cyclist, shared, 7 theme packs)

### Fixed

- **Invisible Switches** - Fixed invisible toggle switches and aligned settings toggles in Cyclist
- **deploy.sh Staging Bug** - `git add` used `2>/dev/null || true` which silently swallowed staging failures, causing VERSION and root package.json to stay at 9.1.2 through two releases
- **Version Drift** - Aligned all package versions to match npm published version; `packages/shared` was stuck at 9.0.2, core/cyclist at 9.1.3
- **Missing shared in Version Bump** - deploy.sh only bumped core and cyclist, leaving shared behind

---

## [9.2.0] - 2026-02-05

### Added

- **TTY Panel** - Terminal panel with xterm.js and WebSocket PTY backend (MSSCI-14211)
- **Git-Based Diffs** - Real-time git diff panel replacing OTEL extraction (MSSCI-14238)
- **Panel Visibility Toggles** - Settings panel controls for showing/hiding panels (MSSCI-14243)
- **shadcn/ui Migration** - Adopted shadcn/ui component library across entire Cyclist UI (MSSCI-14268)
- **Theme Packs** - Extracted themes into optional installable packages (MSSCI-14270)
- **Workspace Version Parity Checks** - Release and doctor scripts detect stale pnpm workspace links

### Changed

- **TTY Panel Architecture** - Migrated from Electron IPC to WebSocket PTY for cross-platform support
- **DebugPanel** - Removed Tool Calls section (superseded by tool stack in message view)

### Fixed

- **White Screen on Electron Launch** - Stale pnpm workspace links broke tsc build, preventing Vite from running
- **Multi-Repo Diffs** - Diffs panel now supports multiple repositories
- **Background Task Completion** - Tasks now complete via tool_result messages
- **Panel Visibility Race Condition** - Prevented toggle state race in Settings panel
- **Multi-Repo /chore** - Made /chore command multi-repo aware
- **Todo Panel Styles** - Added missing .todo-panel CSS selectors

---

## [9.1.2] - 2026-02-04

*No unreleased changes*

---

## [9.1.1] - 2026-02-04

*No unreleased changes*

---

## [9.1.0] - 2026-02-03

### Fixed

- **Tool Stack Count Clipping** - Fixed overflow:hidden causing text clipping in tool completion summaries

---

## [9.0.3] - 2026-02-03

### Added

- **SpanTimeline Component** - Visual timeline for subagent spans
- **ConfirmDialog Component** - Reusable confirmation dialog
- **AuditLogPanel** - Panel for viewing system audit logs
- **AgentPopup Component** - Popup for agent details
- **TirePump Button** - Context clearing button in ControlBar
- **Bell Mode Queue UI** - Visual queue for messages during agent work
- **Tool Display Badges** - Humanized tool summaries with badges
- **Image Paste Support** - Paste images directly with develop-behind detection
- **XML Schema Migration** - Tools and validation hooks for schema migration
- **useSyntaxHighlighter Hook** - React hook for code syntax highlighting
- **CDP Debugging Support** - Chrome DevTools Protocol support for Playwright MCP
- **Command Typeahead Sorting** - Frequency-based sorting for slash command suggestions
- **Todos WebSocket** - Replaced REST polling with WebSocket for todos
- **useMarkdownParser Hook** - React hook for markdown rendering
- **Tool Use Stack Grouping** - Consecutive tool calls grouped visually
- **Collapsible Tool Results** - Expandable/collapsible tool output display

### Changed

- **Type Consolidation** - Consolidated types and eliminated js/ folder
- **Dockview Migration** - Replaced DockingWorkspace with Dockview library

### Fixed

- **Git Cache Invalidation** - Smarter cache invalidation logic
- **Token Stats WebSocket** - Fixed broadcast and nested scrollbar issues
- **Panel Refresh Bugs** - Fixed changed files and sprint tab refresh (75-6)
- **Cyclist UI Bugs** - Multiple UI fixes for story 75-5
- **Themes API Path** - Fixed .pennyfarthing symlink path resolution
- **Panel Restore Menu** - Added restore menu, hide message panel close button
- **Sidebar Toggle Buttons** - Collapsed sidebar toggle buttons now visible
- **Sidebar Visibility** - Fixed visibility not restoring on refresh
- **Typeahead Commands** - Fixed missing commands and z-index issues
- **WebSocket Claude Bridge** - Added image support and Electron mode bridging

---

## [9.0.2] - 2026-02-02

### Added

- **Tool Intent Summarizer** (Story 74-1) - Human-readable summaries for tool use display
  - `generateToolIntentSummary()` utility for converting tool name + input to readable text
  - Smart detection for Bash commands (install, test, build, lint, format)
  - Graceful fallback for unknown tools with truncated JSON
  - 59 unit tests covering all acceptance criteria

### Fixed

- **Agent Change Restart Loop** - Removed `setSystemPrompt()` from agent watcher that was killing the Claude process on every agent change, causing a SIGKILL restart loop especially after context clear

---

## [9.0.1] - 2026-02-02

### Cyclist IPC to WebSocket Migration

This patch release completes the migration from Electron IPC to WebSocket-based communication, enabling full web mode support for Cyclist.

### Added

- **Git Status Cache** - New caching layer (`git-cache.ts`) prevents `.git/index` lock conflicts during frequent polling
  - Deduplicates concurrent git status requests
  - Invalidates on PostToolUse events (Edit, Write, Bash) with 1.5s debounce
  - Force refresh on branch switches via `.git/HEAD` watcher
- **REST API Fallbacks** - Web mode support for panels that previously required Electron IPC
  - `/api/settings` endpoint for Settings panel
  - `/api/todos` endpoint for Todos panel
  - ControlBar bell/relay mode sync via REST
- **WebSocket Endpoints** - New real-time data channels
  - `/ws/settings` - Bidirectional settings sync
  - `/ws/context` - Context usage percentage updates
  - `/ws/diffs` - Edit/Write tool diff streaming
- **Interactive Debug Workflow** - New stepped workflow for debugging sessions
- **ClaudeContext Provider** - React context for Claude service state management

### Changed

- **IPC to WebSocket Migration** - All React hooks now use WebSocket with IPC fallback
  - `useStatsStrip`, `useGitStatus`, `useStory`, `usePersona`, `useTodos`
  - `useBackgroundTasks`, `useDiffs`, `useLayoutPersistence`
- **Tiered Context Injection** - Wired up backoff tiers for reduced token usage

### Fixed

- **Git Lock Conflicts** - Replaced problematic `.git/index` file watcher with event-driven cache invalidation
- **IPC Subscription Cleanup** - Added proper cleanup functions to prevent memory leaks
- **Skill/Doctor Script Paths** - Fixed statusline detection paths
- **Toggle Button Animations** - Removed distracting throb animation

---

## [9.0.0] - 2026-02-02

### Sprint 12 Release - Cyclist React Migration & VS Code Deprecation

This major release completes the Cyclist React migration, delivering a modern UI with docking panels, accessibility compliance, and tiered context injection. The VS Code extension has been deprecated in favor of the superior Cyclist experience.

### Breaking Changes

- **VS Code Extension Removed** - The `pennyfarthing-vscode` package has been deprecated and completely removed
  - Cyclist (Electron app) is now the sole UI for Pennyfarthing
  - All VS Code extension source code, tests, and configuration deleted
  - Monorepo structure changed from 4 packages to 3 packages
  - See ADR-0019 for full rationale

### Added

#### Cyclist React Migration (Epics 69-73)
- **React + Tailwind Build Pipeline** (MSSCI-12697) - Modern React 18 with Tailwind CSS v4
- **MessageView Component** (MSSCI-12698) - Streaming messages with markdown, syntax highlighting, and subagent spans
- **Docking System** (MSSCI-12704) - FlexLayout-based panels with drag-and-drop
- **Panel Drag-and-Drop** (MSSCI-12705) - Reorder tabs, move between sidebars
- **Layout Persistence** (MSSCI-12706) - Save/restore workspace layouts
- **Command Palette** (MSSCI-12721) - Cmd+Shift+P searchable command palette
- **Stop/Reset Controls** (MSSCI-12729) - Escape key stops Claude, visible Stop/Reset buttons

#### New Components
- **FileTree** (MSSCI-12710) - Hierarchical file browser for Changed panel
- **DiffViewer** (MSSCI-12711) - Side-by-side and unified diff views
- **ContextIndicator** (MSSCI-12712) - Visual context usage meter
- **ApprovalModal** (MSSCI-12713) - Permission request dialogs
- **PersonaHeader** (MSSCI-12700) - Agent portrait, name, and catchphrase
- **StatsStrip** (MSSCI-12699/12779) - PWD, Jira email, GitHub username, model, context %
- **ModeSwitch** (MSSCI-12773) - 3-way Plan/Manual/Accept toggle

#### Visual Customization & Accessibility (Epic 73)
- **Color Palette System** (MSSCI-12768) - 8 presets: Midnight, Daylight, High Contrast, etc.
- **Font Customization** (MSSCI-12769) - UI and code font selection
- **Responsive Breakpoints** (MSSCI-12770) - Auto-collapse sidebars at narrow widths
- **WCAG AA Compliance** (MSSCI-12771) - ARIA labels, focus indicators, 4.5:1 contrast
- **Theme-Aware Subagent Messages** (MSSCI-12776) - Helper personas for subagents
- **User Avatar** (MSSCI-12777) - GitHub/Gravatar profile pictures
- **ThemePalette UI** (MSSCI-12817) - Visual color preset picker in Settings

#### Tiered Context Injection (Epic MSSCI-12793)
- **Session State Tracking** (MSSCI-12795) - Track lastAgent, turnCount, injectedComponents
- **Tier Selection Logic** (MSSCI-12796) - FULL/REFRESH/HANDOFF/MINIMAL tiers
- **Python Prime Tier Support** (MSSCI-12797) - `--tier` argument with compressed personas
- **TypeScript Tier Integration** (MSSCI-12798) - Wire tier selection into message flow
- **Debug Panel Tier Display** (MSSCI-12799) - Show current tier with color coding
- **Component Token Tracking** (MSSCI-12800) - Per-component token breakdown

#### Cyclist UX Polish (Epic 64)
- **DIFFS Panel Line Numbers** (MSSCI-12466) - Show actual file line numbers
- **DIFFS File Opener** (MSSCI-12467) - Click to open in $EDITOR
- **Combined Diff View** (MSSCI-12468) - Original → final state visualization
- **Stats Strip Redesign** (MSSCI-12469) - Responsive PWD, identity context
- **Tab Bar Sync** (MSSCI-12470) - Fix indicator state on startup
- **Fresh Start Audit** (MSSCI-12471) - Clean state on app start/clear/TirePump
- **Persona Section Cleanup** (MSSCI-12472-12474) - Remove OCEAN scores, random catchphrases
- **Expandable Story Section** (MSSCI-12475/64-19) - Sprint and epic context display
- **BikeLane Section** (MSSCI-12476/12551) - Workflow status visualization
- **Background Tasks Visibility** (MSSCI-12477) - Subagent and task monitoring
- **CYCLIST Marker Parsing** (MSSCI-12787) - Handoff/Question/Choices action buttons
- **AC & BikeLane Panels** (MSSCI-12849) - Acceptance criteria checklist

#### Patch Mode Workflow
- **Patch Mode** (MSSCI-12848) - Interrupt-driven bugfix workflow: branch from feature, fix, merge back

### Changed

- **Monorepo Structure** - Now 3 packages: `@pennyfarthing/core`, `@pennyfarthing/shared`, `@pennyfarthing/cyclist`
- **Panel Architecture** - Migrated from vanilla JS sidebar to React docking panels
- **Message Rendering** - React components replace DOM manipulation

### Fixed

- **Test Suite** (MSSCI-12856) - Fixed 81 pre-existing broken test files from React migration
- **Panel Resize** (MSSCI-12778) - Functional resize handles
- **Progress Panel** (MSSCI-12780) - Show task content instead of raw markers
- **Git Panel** (MSSCI-12781) - Multi-repo support with file dropdowns
- **Debug Panel** (MSSCI-12782) - OTEL telemetry display with formatted stats
- **Skill Content Display** (MSSCI-12783) - Filter skill content from user messages
- **Background Task Timer** (MSSCI-12784) - Real-time updates while viewing

### Removed

- `packages/vscode-extension/` directory (49 files, ~21,000 lines)
- VS Code Chat participant integration
- Legacy vanilla JS sidebar modules
- TipTap editor (replaced with native textarea)

### Migration

If you were using the VS Code extension:
1. Install Cyclist: `npm install @pennyfarthing/cyclist`
2. Run Cyclist: `npx cyclist` or use the `just cyclist` recipe
3. All agent workflows, personas, and features work identically in Cyclist

### Summary

| Metric | Value |
|--------|-------|
| Stories Completed | 116 |
| Points Delivered | 254 |
| Epics Completed | 17 |
| New React Components | 15+ |
| Token Savings (Tiered Context) | 84% |

---

## [8.1.0] - 2026-01-30

### Python CLI Migration (Epic 67)

This release delivers the Python CLI for Pennyfarthing, providing a faster and more maintainable command interface.

### Added

#### Python CLI
- **Click-based CLI Entry Point** (MSSCI-12656) - `pf` command with lazy-loaded subgroups for <200ms startup
- **Agent Start Command** (MSSCI-12659) - `pf agent start <name>` with session management
- **Sprint CLI Migration** (MSSCI-12662) - `pf sprint story <id>` command with JSON output
- **Workflow Check Command** (MSSCI-12657) - `pf workflow check` with state detection
- **Bash/Python Parity Tests** (MSSCI-12665) - 24 integration tests verifying CLI parity with bash scripts

#### Cyclist Enhancements
- **Editor Mode Toggle** (67-1) - Switch between rich text and plaintext editor modes
- **Background Tasks Helper Persona** - Show helper character in background tasks section
- **Rome Theme Portraits** - Updated character portraits for Rome persona theme

### Changed
- **Agent Commands** (MSSCI-12660) - Agent activation commands now use Python CLI (`pf agent start`)
- **Startup Benchmark CI** (MSSCI-12661) - Python CLI startup time monitored in CI pipeline

### Fixed
- **Workflow Merge Gate** - Enforce story completion before merge
- **Session File Parsing** - Parse list-format session files in `get_workflow_state()`
- **find-root.sh** - Support `.pennyfarthing/scripts/` path for consumer projects
- **find-root.sh** - Check node_modules path before pennyfarthing-dist
- **Uninstall** - Add `.pennyfarthing` symlinks and `.claude/commands` to cleanup
- **Cyclist Editor** - Plaintext mode slash completion and resize behavior
- **Cyclist Imports** - Update imports from `editor.js` to `editor-textarea.js`
- **Git Status Polling** - Convert to async with mutex lock for reliability

### Performance
- **TipTap Removal** - Removed TipTap editor for better input responsiveness
- **Debouncing** - Added debouncing and optimized rendering for input

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 7 |
| New CLI Commands | 4 (`pf agent start`, `pf sprint story`, `pf workflow check`, `pf workflow phase-check`) |
| Integration Tests | 24 |
| Bug Fixes | 8 |

---

## [8.0.0] - 2026-01-29

### Breaking Changes
- **Script Path Resolution** - Scripts now use `BASH_SOURCE`-based self-location instead of `run.sh` bootstrap
  - All existing installations must re-run `pennyfarthing init` to update symlinks
  - The `.pennyfarthing/scripts/core/run.sh` pattern is deprecated
  - Scripts derive `PROJECT_ROOT` from their own location in the directory tree

### Changed
- **Environment Variable** - Use `PENNYFARTHING_ROOT` instead of `PROJECT_ROOT` for explicit override
  - Avoids conflicts when pennyfarthing repo is nested inside an orchestrator
  - `PROJECT_ROOT` from parent environment no longer affects script behavior

### Fixed
- **Nested Repo Support** - `findMonorepoRoot()` now correctly identifies the pennyfarthing repo root when nested inside an orchestrator by checking for `pennyfarthing-dist/` + `packages/` combo
- **Build in Orchestrator** - Scripts correctly find `pennyfarthing-dist/` assets when run from orchestrator context

---

## [7.9.5] - 2026-01-29

### Fixed
- **npm Publish** - Include `pennyfarthing-dist/` assets in published package (was symlink, now actual directory)
- **npm Package Size** - Exclude `portraits/` and `spiders/` directories (605MB) from package - these are optional and can be downloaded separately

## [7.9.4] - 2026-01-29 [YANKED]

Yanked due to package size (636MB) - portraits directory was accidentally included.

---

## [7.9.3] - 2026-01-29

### Fixed
- **npm Publish** - Replace `workspace:*` dependency with explicit version for `@pennyfarthing/shared` to allow npm install outside of pnpm workspaces

---

## [7.9.2] - 2026-01-29

### Changed
- **Script Organization** (MSSCI-12603) - Clean separation between meta scripts (framework development) and distributed scripts (orchestrator use)
  - `scripts/` - Meta scripts only (deploy, benchmarks, job-fair)
  - `pennyfarthing-dist/scripts/` - Distributed bash/JS for orchestrators
  - `pennyfarthing_scripts/` - Distributed Python utilities

### Fixed
- **Workflow Type Lookup** - `get-workflow-type.py` now looks in `.pennyfarthing/workflows/` (correct path for orchestrator repos)
- **CI Build** - `generate-skill-docs.sh` now works in both framework repo and orchestrator repos by checking for `pennyfarthing-dist/` fallback
- **CI Tests** - Skip bell-mode hook tests in CI environment; use bash instead of zsh for check-context.sh

---

## [7.9.1] - 2026-01-28

### Fixed
- **Shell Script Permissions** - `pennyfarthing init` now creates shell script templates (e.g., `setup-env.sh`) with executable permissions (mode 0755)
- **Statusline Config Search** - Added `.claude/persona-config.local.yaml` to config file search order in statusline.sh

### Changed
- **Gitignore Updates** - Added runtime state file patterns (*.pid, *-pid, *-port, .cyclist-*)

---

## [7.9.0] - 2026-01-28

### Cyclist UI Improvements & Prime v2 Bootstrap

This release delivers significant Cyclist UI enhancements including expandable story sections, improved stats display, and the new Prime v2 unified agent bootstrap system.

### Added

#### Cyclist Enhancements
- **Expandable Story Section UI** (MSSCI-12475) - Collapsible story details in sidebar with rich data display
- **Redesigned Stats Strip** (MSSCI-12469) - Identity-focused stats display with agent context
- **System Banner on Context Clear** (MSSCI-12471) - Visual feedback when context is cleared
- **Random Catchphrase on Activation** - Agent-themed catchphrases displayed on activation
- **Improved Combined Diff View** (MSSCI-12468) - Context lines around changes for better readability
- **Real-Time OTEL Debug Panel** - Live debugging panel for viewing OTEL spans
- **Background Task Subagent Visibility** (MSSCI-12477) - Track subagent tasks in sidebar

#### Infrastructure
- **Prime v2 Unified Agent Bootstrap** - Streamlined agent activation with Python-based context loading
- **Theme Catchphrase Consolidation** (MSSCI-12478) - Unified `quote` field into `catchphrases` array

### Changed
- **Persona Section Simplified** (MSSCI-12472) - Removed OCEAN scores and helper task line for cleaner display
- **Workflow Display Removed** (MSSCI-12551) - Removed redundant workflow display from story panel

### Fixed

#### Cyclist Fixes
- **Sprint Points Calculation** - Use calculated sprint points instead of stale summary values
- **Background Task Completion** - Detect task completion from message stream correctly
- **Persona Display Preservation** - Preserve persona display on session clear
- **Task Tool Detection** - Detect Task tools from message stream instead of OTEL
- **Session File Format** - Support new list-item session file format in parseSessionFile
- **BikeLane Panel Detection** (MSSCI-12552) - Correctly detect list-item session format
- **Panel State Sync** (MSSCI-12470) - Sync panel state to PanelManager on startup
- **Testing Mode Directory** (MSSCI-12510) - Handle testing mode in getProjectDirectory

#### Scripts & Build
- **Party-Mode Theme** - Use current theme instead of hardcoded value
- **Archive Story Script** - Support `jira_sprint_name` field in archive-story.sh
- **Validation Script** - Fix grep -c zsh arithmetic error
- **Agent Paths** - Replace $CLAUDE_PROJECT_DIR with relative paths for portability
- **Stop Hook Migration** - Migrate Stop hook paths from legacy locations
- **Jira ID Corrections** - Fixed 5 mismatched Jira IDs in sprint YAML

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 12+ |
| Features | 8 |
| Bug Fixes | 16 |
| Cyclist Improvements | 7 |

---

## [7.8.5] - 2026-01-27

*No unreleased changes*

---

## [7.8.2] - 2026-01-27

### Fixed

- **npm Package** - Include `pennyfarthing_scripts/` in npm package and set `PYTHONPATH` in `prime.sh` so agent context loads correctly after `npm install`

### Added

#### Cyclist
- **DIFFS Panel File Opener** - Click file path to open in `$EDITOR` (falls back to `$VISUAL` then `code`)

---

## [7.8.1] - 2026-01-27

### Fixed

- **Agent Activation** - Fixed incorrect path to `prime.sh` in `agent-session.sh` that caused agent definitions to not load on activation

---

## [7.8.0] - 2026-01-27

### Changed

#### Cyclist
- **Sidebar Modularization** - Refactored scattered sidebar code into 8 focused modules (`sidebar/index.js`, `portrait.js`, `story.js`, `git.js`, `acceptance-criteria.js`, `tasks.js`, `background-tasks.js`, `bikelane.js`)
- **Multi-repo Git WebSocket** - Export `getAllReposGitInfo` for real-time multi-repo status updates

#### Scripts
- **Prime Script Migration** - Replaced complex shell script with thin Python wrapper for better maintainability

---

## [7.7.0] - 2026-01-26

*No unreleased changes*

---

## [7.6.1] - 2026-01-24

*No unreleased changes*

---

## [7.6.0] - 2026-01-24

### Cyclist Standalone & Infrastructure Improvements

This release delivers standalone Electron builds for Cyclist, real-time debugging tools, and significant infrastructure hardening.

### Added

#### Cyclist Enhancements
- **Real-Time Debug Panel** (MSSCI-12387) - Live debugging panel with E2E test infrastructure
- **Web Mode Detection** (MSSCI-12386) - Automatic UI improvements when running in web context
- **Standalone Electron Build** - Bundled personas for distribution without npm dependencies

#### Infrastructure
- **Content Copy Installation** (MSSCI-12391) - Copy pennyfarthing content instead of symlinking to node_modules for better reliability
- **Legacy File Detection** (MSSCI-12346) - Doctor command detects and cleans up legacy files
- **Zeitgeist Measurement Framework** (MSSCI-12343) - Measure persona cultural relevance and recognition
- **Agent Workflow Phase Ownership** (MSSCI-12385) - Improved handoff and phase ownership tracking

#### Documentation
- **Tandem Agent Pairing ADR** - Architecture decision record for pair programming patterns
- **Benchmark Methodology Guide** - Comprehensive documentation for persona benchmarking

### Fixed

#### Cyclist Fixes
- **Stop Button Reliability** - Resolve pending promises on interrupt() to unblock stop button
- **GUI App PATH** - Augment PATH for GUI apps and add NPM theme paths
- **Dev Mode Themes** - Add dev mode theme resolution path
- **Bell Mode Queue** - Sync dequeue with browser state
- **Electron Builder** - Disable npmRebuild for cleaner builds

#### Build & Deployment
- **Deploy Script** - Add --no-verify to version bump commit
- **Release Script** - Correct deploy.sh path resolution
- **Shared Module** - Export VALID_MARKER_TYPES and fix test discovery

#### Benchmarking
- **Role Normalization** - Normalize dev roles for fair cross-format comparison
- **Tier Computation** - Rewrite tier computation with better methodology

### Changed
- **Agent Commands** - Slim agent commands to minimal loaders for faster activation

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 8+ |
| Features | 7 |
| Bug Fixes | 10 |
| Cyclist Improvements | 4 |

---

## [7.5.0] - 2026-01-23

### VS Code Agent Identity & Cyclist Enhancements

This release delivers the Agent Identity epic for VS Code, Bell mode for Cyclist, new sprint management commands, and significant infrastructure improvements.

### Added

#### Epic 57: Agent Identity & Emotional Connection
- **Persona Card Webview** (MSSCI-12191) - Enhanced persona card with prominent character name and theme badge
- **Portrait Caching Service** (MSSCI-12192) - Efficient portrait image caching for VS Code sidebar
- **Real-Time Agent Updates** (MSSCI-12193) - WebSocket-based live updates when agents change

#### Epic 56: Cyclist Bell Mode & Queue Improvements
- **Bell Mode** (MSSCI-12275) - Inject queued messages after tool use for smoother workflows
- **Image Queue Support** (MSSCI-12274) - Support images in queued messages with proper UI handling

#### Epic 58: Sprint Metrics & Session Monitoring
- **Session File Watcher** (MSSCI-12237) - Story status tree view updates from session file changes
- **Sprint Metrics Display** (MSSCI-12238) - Show sprint points and end date in VS Code sidebar

#### Commands & Skills
- **`/sprint` Command** (MSSCI-12336) - Wrapper command for sprint management operations
- **`/standalone` Command** (MSSCI-12326) - Quick tracked commits for small changes without full ceremony

#### Infrastructure
- **Marker Parsing Consolidation** (MSSCI-12315) - Shared module for CYCLIST marker parsing across packages
- **Agent Behavior Drift Detection** (MSSCI-12325) - Health check detects when agent files diverge from templates
- **VS Code Model Indicator** (MSSCI-12228) - Status bar item showing current Claude model
- **Context Channel Migration** - StatusBarManager uses dedicated `/context` IPC channel
- **Automatic Future Import** - Epics-and-stories workflow auto-imports to future.yaml
- **BMAD Compatibility Suite** (MSSCI-12146) - Validation suite for BMAD format interoperability

#### Documentation
- **AI Agent Implementation Guide** - Comprehensive guide for building AI agents
- **Measurement Framework Guide** - Research-backed framework from ICML 2025

### Fixed
- **Statusline PROJECT_ROOT** - Use CLAUDE_PROJECT_DIR for reliable path resolution
- **Doctor Dogfood Path** - Correct script path detection in dogfood mode
- **Bell Mode Hook** - UI refinements and hook reliability improvements
- **Queue Message Handling** - QueuedMessage treated as object not string
- **StatusLine Misc Path** - Include misc/ subdirectory in path resolution
- **Handoff Marker Generation** - Consolidate into single script for consistency
- **Monorepo Path Lookup** - Support pennyfarthing-monorepo path in node_modules
- **Image Queue Wiring** - Proper connection to editor submission flow
- **Test Isolation** - Improved Cyclist test isolation with forks pool
- **Script Invocation** - Scripts now self-locate via BASH_SOURCE (direct invocation)

### Changed
- **Electron Updated** - Bumped from 33.4.11 to 35.7.5

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 15+ |
| Epics Delivered | 4 (Epic 56, 57, 58, Reflector Consolidation) |
| Features | 16 |
| Bug Fixes | 10 |
| New Commands | 2 (`/sprint`, `/standalone`) |

---

## [7.4.0] - 2026-01-21

### Maintenance Release

Minor improvements and documentation updates.

### Added
- **ADR-0006** - Architecture Decision Record for CDN portrait storage
- **VS Code extension management** - `just vscode` command for extension tasks
- **MASH theme optimization** - Job fair benchmark results with optimized character assignments

### Changed
- **Package versions synced** - All workspace packages aligned to 7.3.0 → 7.4.0

---

## [7.3.0] - 2026-01-21

### VS Code Extension & Stepped Workflows

This release delivers the initial VS Code extension for Pennyfarthing, stepped workflow execution, and significant skill consolidation.

### Added

#### Epic 50: VS Code Extension
- **Extension Scaffolding** (MSSCI-12045) - Initial VS Code extension structure with activation
- **Terminal Provider** (MSSCI-12046) - Claude Code session management in VS Code terminal
- **WheelHub Adapter** (MSSCI-12047) - Connect VS Code to Cyclist's central coordination server
- **Sidebar Panel with Agent Status** (MSSCI-12048) - Real-time agent information in VS Code sidebar
- **Reflector Protocol Adapter** (MSSCI-12049) - Bridge Cyclist's Reflector signals to VS Code UI
- **Command Palette Integration** (MSSCI-12050) - Pennyfarthing commands accessible via Cmd+Shift+P
- **VS Code Chat API Integration** (MSSCI-12097) - Claude CLI as VS Code chat participant with streaming
- **Claude CLI Chat Participant** - Native chat integration with streaming responses

#### Epic 51: Stepped Workflow Engine
- **Stepped Workflow Schema** (MSSCI-12078) - YAML schema for multi-step workflow definitions
- **Step File Parser** (MSSCI-12079) - Parse step files into executable workflow steps
- **Workflow Executor** (MSSCI-12084) - `/workflow start`, `/workflow resume`, `/workflow status` commands
- **Workflow Type Indicator** (MSSCI-12083) - Show workflow type in `/workflow list` output
- **Gate Detection & Approval Flow** (MSSCI-12085) - Approval gates for stepped workflows
- **Tri-modal BikePaths Support** (MSSCI-12086) - Plan/Manual/Auto modes in stepped workflows
- **Session State Tracking** (MSSCI-12082) - Track workflow state across session boundaries
- **Variable Resolver** - Priority chain for resolving variables in step files

#### Skill Consolidation
- **`/sprint` Skill Rewrite** - Comprehensive sprint management with YAML restructure
- **`/story` Skill Rewrite** (MSSCI-12035) - Consolidated story management commands
- **`/workflow` Skill Rewrite** - Prescriptive scripts for workflow operations
- **Removed `/backlog`** (MSSCI-12038) - Consolidated into `/sprint` skill
- **Removed `/new-work`** - Consolidated into `/sprint work --next`
- **Epic Management Commands** - `/sprint epic` commands for epic lifecycle
- **`finish-story.sh` Script** - Automated story completion with PR merge and archival

#### Cyclist Enhancements
- **Event-Driven Badge Updates** (MSSCI-11944) - Real-time badge counts without polling
- **LocalStorage Cross-Tab Sync** (MSSCI-11946) - Settings sync across Cyclist windows
- **Allowed-Tools in Skills** (MSSCI-11954) - Context-sensitive tool permissions per skill
- **Workflow Permission Exports** (MSSCI-11710) - Reusable permission checking functions

### Fixed
- **Gearshift Mode Reliability** (MSSCI-12052) - Fixed mode switch flakiness in Cyclist
- **VS Code Activation Failure** - Resolved extension not activating on startup
- **Ready Status in Points** - Include 'ready' stories in sprint remaining points calculation
- **CYCLIST:CHOICES Labels** - Support text labels in reflector choice markers
- **Per-Project Window State** - Cyclist remembers window state per project
- **Settings Test Isolation** - Prevent tests from corrupting user config
- **Project Root Detection** - Use project root for settings, not working directory
- **WebSocket Fallback** - BackgroundTasksPanel gracefully handles connection failures
- **Jira Epic/Story Scripts** - Improved `promote-epic.sh` and `create-jira-epic.sh`

### Changed
- **Sprint YAML Structure** - Added `jira_sprint_name` and `in_sprint` fields for bidirectional sync
- **Suggestion Pill Removed** - Removed ghost text suggestion feature (too distracting)

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 20+ |
| Epics Delivered | 2 (Epic 50, Epic 51) |
| Features | 26 |
| Bug Fixes | 14 |
| Skills Consolidated | 4 |

---

## [7.2.0] - 2026-01-19

*Maintenance release with minor fixes*

---

## [7.1.0] - 2026-01-19

### Cyclist Observability & Jira Integration

This release delivers enriched OTEL span visualization, bidirectional Jira synchronization, and significant Cyclist UI improvements.

### Added

#### Epic 36: OTEL Span Enrichment (Continued)
- **Enriched Span Export** (MSSCI-11734) - Export enriched OTEL spans with tool metadata
  - SpanTimeline visualization component for span hierarchy
  - REST API endpoints for span querying (`/api/spans`)
  - Span filtering by type, time range, and attributes
- **Task/Subagent Span Enrichment** (MSSCI-11733, 36-5) - Track subagent invocations in telemetry
  - Parent-child span correlation for Task tool calls
  - Subagent type and model tracking

#### Epic 47: Jira Deep Integration
- **Jira Epic Auto-Creation** (47-1) - SM setup creates Jira epics automatically when missing
- **Jira Sprint Sync** (47-2) - Sync sprint membership and velocity metrics
- **Jira-Only Story Detection** (47-3) - Detect stories in Jira but missing from sprint YAML
- **Bidirectional Sync Script** (MSSCI-11842) - `jira-bidirectional-sync.mjs` syncs status, points, and stories

#### Cyclist Enhancements
- **Background Tasks Sidebar Panel** (35-16) - Real-time status for background agents
- **Collapsible Bash Output** (MSSCI-11851) - Expandable tool output in message stream
- **Resizable Sidebar Panel** (35-17) - Drag handle for sidebar width adjustment
- **Theme Switcher Consolidation** (35-8) - Theme switching moved to SettingsPanel only
- **Auto-Mode Context Clear** (MSSCI-11840) - Automatic reload on handoff when context high

#### Workflow Improvements
- **Permission Presets** (MSSCI-11847) - Pre-configured permission sets for workflows
- **Handoff Mode Preference** (MSSCI-11914) - Honor `handoff_mode: auto|manual` setting
- **Trivial Workflow Phase Naming** (31-17) - Correct phase names in SM handoff

### Fixed
- **Copy Mode Migration** - Removed deprecated copy mode migration code (MSSCI-11815)
- **Theme Project-Level Only** - Themes now scoped to project, not global
- **SM Finish Workflow** - Added PR merge and branch cleanup steps
- **List Themes Performance** - Optimized from 1.27s to 0.19s (6.8x faster)
- **Parallel Reviewer Pre-flight** - Enable parallel execution for faster reviews

### Changed
- **Persona Config Deprecation** - Removed `persona-config.local.yaml` deprecation warnings (MSSCI-11819)
- **Session Archive Format** - Archives now use Jira key as filename

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 15+ |
| Features | 12 |
| Bug Fixes | 8 |
| Performance Improvements | 2 |

---

## [7.0.2] - 2026-01-17

### Fixed

- **Subagent Compatibility** - Updated all agent definitions to use `subagent_type: "general-purpose"` with `model: "haiku"` for Claude Code compatibility. Custom subagent types were failing with "not available in this context" errors.
- **Cyclist Project Detection** - Fixed `detectPennyfarthingProject()` to check `.pennyfarthing/` directory first, and updated Electron entry point configuration.

### Changed

- **Build Output** - Removed `dist/` directories from version control. Build output is now delivered via npm only.

---

## [7.0.1] - 2026-01-17

### Fixed

- **Dogfood Doctor** - Updated `doctor-dogfood.sh` to check new directory structure (`.pennyfarthing/` for agents/guides/personas/scripts, `.claude/` for commands/skills only)
- **Symlink Structure** - Converted `.claude/commands` and `.claude/skills` from directories to symlinks pointing to `pennyfarthing-dist/`
- **Build Path** - Fixed doctor to check `packages/core/dist/` instead of root `dist/` for monorepo structure

---

## [7.0.0] - 2026-01-17

### Major Release: npm Publishing & Directory Restructure

This release marks Pennyfarthing's transition to npm public registry with a cleaner package structure and improved installation experience.

### BREAKING CHANGES

- **Package Renamed** - `pennyfarthing` → `@pennyfarthing/core`
  - Update your `package.json`: `npm install --save-dev @pennyfarthing/core`
  - CLI remains `npx pennyfarthing` (unchanged)
- **Directory Restructure** - Content moved from `.claude/` to `.pennyfarthing/`
  - Agents, guides, personas, and scripts now in `.pennyfarthing/`
  - Commands and skills remain in `.claude/` for Claude Code discovery
  - Run `pennyfarthing update` to migrate existing installations
- **Cyclist Split Out** - Visual terminal is now a separate optional package
  - Install with: `npm install --save-dev @pennyfarthing/cyclist`
  - Reduces core package from 160MB to 1.1MB
  - Portraits bundled only with Cyclist

### Migration from 6.x

```bash
# Uninstall old package
npm uninstall pennyfarthing

# Install new scoped package
npm install --save-dev @pennyfarthing/core

# Update symlinks (handles .claude/ → .pennyfarthing/ migration)
npx pennyfarthing update

# Verify
npx pennyfarthing doctor
```

### Added

#### Epic 31: Customizable Workflow Engine
- **Workflow Definition Schema** (31-1) - YAML-based workflow definitions with states, transitions, and agents
- **Workflow Loader** (31-2) - Load and validate workflow definitions at runtime
- **Story-to-Workflow Routing** (31-3) - Route stories to workflows based on `workflow:` tag
- **TDD Flow Migration** (31-4) - Built-in TDD flow now uses workflow definition
- **`/workflow` Skill** (31-5) - List workflows, show current, switch mid-session
- **Session Tracking** (31-6) - Current workflow tracked in session files
- **Generic Handoff Subagent** (31-7) - Workflow-driven handoffs for any transition
- **Test Deduplication** (31-8) - Eliminate redundant test runs across subagents
- **Turn Optimization** (31-9) - Patterns for reducing API round-trips
- **Background Task Tracking** (31-14, 31-15) - Track and notify on background task completion

#### Epic 32: BMAD Format Interoperability
- **Story Parser** (32-2) - Parse BMAD story files into Pennyfarthing format
- **Epics Parser** (32-3) - Parse BMAD epics files
- **Context Reader** (32-4) - Parse BMAD project-context.md files
- **Session Exporter** (32-5) - Export sessions back to BMAD format
- **Sprint Sync** (32-6) - Sync sprint status with BMAD

#### Epic 33: Runtime Permission Management
- **Permission Request Protocol** (33-1) - Structured permission request handling
- **`/permissions` Skill** (33-2) - View and manage runtime permission grants
- **Generic Permission UI** (33-3) - Universal approval modal for any tool
- **Spot Permission Grants** (33-4) - Once/session/always grant scopes
- **Approval Gate Wiring** (33-7) - PreToolUse hook for actual tool execution control

#### Epic 34: Cyclist Developer Experience
- **First-Run Setup** (34-1) - Documentation and tooling for first-time setup
- **`cyclist-doctor` Command** (34-2) - Health check for Cyclist installation
- **Port Conflict Detection** (34-3) - Detect and message when port 3456 is in use
- **Upgrade Path Handling** (34-4) - Smooth upgrades between Cyclist versions

#### Epic 35: Cyclist UI/UX Improvements
- **Settings Placement** (35-1) - Contextual settings with iOS-style toggles
- **User Email Display** (35-2) - Show authenticated user in status bar
- **Workflow Visualization** (35-3) - Dynamic workflow phase indicator
- **Three-Way Mode Switch** (35-4) - Plan/Manual/Accept mode selector
- **Collapsible Portrait Panel** (35-5) - Unified vertical panel pattern
- **Font Face Selector** (35-6) - Choose fonts in settings panel
- **Custom Styling Themes** (35-7) - CSS theming system for Cyclist
- **Settings Panel Expansion** (35-9) - Additional settings and fixes
- **Line Numbers in Diffs** (35-10) - Show line numbers in file diff view
- **Clickable File Paths** (35-11) - Click file paths to open in editor
- **Skill Invocations Panel** (35-12) - Track skill usage in session
- **Window State Persistence** (35-13) - Remember window size/position
- **Settings Architecture** (35-14) - VerticalPanel-based settings

#### Epic 36: OTEL Tool Enrichment
- **Span Interception** (36-1) - Unified OTEL span processing pipeline
- **File Enrichment** (36-2) - Read/Edit spans include path and content
- **Bash Enrichment** (36-3) - Bash spans include command details
- **Search Enrichment** (36-4) - Grep/Glob spans include search context
- **Write Enrichment** (36-11) - File write operations tracked

#### Epic 38: Agent File Modernization
- **Status Tags** (38-2) - Production/stable/experimental status on all agents
- **Agent Modernization** (38-3, 38-4, 38-5, 38-8) - PM, Architect, DevOps, Orchestrator updated
- **Workflow Routing** (38-9) - SM routes stories to workflows based on tags
- **Shared Behavior** (38-10) - Consolidate duplicated instructions to shared-agent-behavior.md

#### Other Features
- **Precision/Recall Scoring** - Enhanced `/judge` skill with detection scoring v2
- **Matrix Theme Optimization** - Job fair results with The Architect integration
- **Horizontal Tab Bar** - Replace vertical panel buttons with tabs
- **Slash Command Popup** - Show suggestions on "/" immediately
- **Typeahead Filtering** - Better filtering as user types

### Fixed

#### Epic 37: Technical Debt & Bug Fixes
- **37-1** - Clean up stale TODO comments
- **37-2** - Fix flaky timestamp test in background notifications
- **37-4** - Evaluate and clean up skipped test suites
- **37-5** - Implement file reading in loadJobFairBaselines
- **37-6** - Remove dead pattern-based detection tests
- **37-8** - Return complete persona object from IPC handler
- **37-14** - Fix handoff buttons showing wrong theme characters
- **37-15** - Make workflow indicator dynamic based on active workflow
- **37-16** - Enable context circuit breaker and align UI thresholds
- **37-17** - Include pennyfarthing-dist markdown files in npm distribution

#### Other Fixes
- OTEL race condition in tool correlation (36-10)
- OTEL enrichment blocked by missing trace/span IDs (36-9)
- JIRA key format validation to prevent wrong ticket transitions
- Redundant story card elements in Cyclist
- Dynamic port for multi-instance isolation
- O'Brien and all-stars portrait slugs

### Changed
- **Handoff Mode** - Agents honor `handoff_mode` setting (auto/manual) from cyclist.yaml
- **Epic Context Gate** - SM workflow validates epic context before story selection
- **Settings Panel** - Converted to VerticalPanel architecture

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 50+ |
| Epics Delivered | 7 (Epic 31, 32, 33, 34, 35, 36, 38) |
| Bug Fixes | 25+ |
| New Skills | 2 (`/workflow`, `/permissions`) |
| Themes | 102 |

---

## [6.5.0] - 2026-01-16

### Sprint 11: Agent Modernization & Cyclist Polish

This release delivers agent file modernization, OTEL tool enrichment, and significant Cyclist UI improvements including font customization and clickable file paths.

### Added

#### Epic 35: Cyclist UI Polish
- **Font Face Selector** (35-6) - Choose fonts for the Cyclist interface via settings panel
- **Clickable File Paths** (35-11) - File paths in diff view now open in your configured editor
- **Window State Persistence** (35-13) - Remember window size and position across sessions
- **Custom Styling Themes** (35-7) - CSS theming system for Cyclist appearance
- **Unified Vertical Panel Pattern** (35-5) - Consistent panel behavior across all sidebars
- **Line Numbers in Diffs** (35-10) - Show line numbers in file diff view
- **Three-way Mode Switch** (35-4) - Replace cycling button with explicit mode selection
- **User Email Display** (35-2) - Show authenticated user in status bar
- **Compact Button Warning** (35-3) - Button turns red when auto-compact is imminent

#### Epic 36: OTEL Tool Enrichment
- **Bash Tool Spans** (36-3) - Enrich OTEL spans with bash command details
- **Write Tool Spans** (36-11) - File write operations tracked in telemetry
- **Search Tool Spans** (36-4) - Grep/Glob operations enriched with search context
- **Read/Edit File Spans** (36-2) - File operations include path and content metadata
- **Span Interception & Correlation** (36-1) - Unified OTEL span processing pipeline

#### Epic 37: Bug Fixes & Stability
- **Context Circuit Breaker** (37-16) - Enable circuit breaker and align UI thresholds
- **Dynamic Workflow Indicator** (37-15) - Indicator updates based on active workflow
- **Persona Object Fix** (37-8) - Return complete persona from IPC handler
- **Handoff Theme Fix** (37-14) - Correct character names in handoff buttons
- **Pattern Detection Cleanup** (37-6) - Remove dead pattern-based detection tests
- **Test Suite Cleanup** (37-4) - Evaluate and clean up skipped test suites

#### Epic 38: Agent File Modernization
- **Status Tags** (38-2) - Add production/stable/experimental status to all agent files
- **Agent Modernization** (38-3) - Update PM, Architect, DevOps, Orchestrator agents
- **Shared Behavior Consolidation** (38-10) - Consolidate duplicated instructions to shared-agent-behavior.md
- **SM Workflow Routing** (38-9) - Route stories to workflows based on story tags
- **Stale Reference Cleanup** (38-1) - Fix stale references across agent files

#### Other Enhancements
- **Background Task Notifications** (31-15) - Notification when background tasks complete
- **Permission Request Protocol** (33-1) - Structured permission request handling
- **Job Fair Benchmarks** - Added Matrix theme optimization results

### Fixed
- OTEL race condition in tool correlation (36-10)
- JIRA key format validation to prevent wrong ticket transitions
- Redundant story card elements in Cyclist
- OTEL enrichment blocked by missing trace/span IDs (36-9)
- Flaky timestamp test in background notifications (37-2)

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 30+ |
| Epics Delivered | 4 (Epic 35, 36, 37, 38) |
| Features | 29 |
| Bug Fixes | 20+ |
| Themes | 102 |

---

## [6.4.0] - 2026-01-13

### Sprint 10: Customizable Workflow Engine & BMAD Integration

This release delivers a flexible workflow definition system, BMAD artifact parsers, and significant Cyclist developer experience improvements.

### Added

#### Epic 31: Customizable Workflow Engine
- **Workflow Definition Schema** (31-1) - YAML-based workflow definitions with states, transitions, and agents
- **Workflow Loader** (31-2) - Load and validate workflow definitions at runtime
- **Story-to-Workflow Routing** (31-3) - Route stories to appropriate workflows based on type
- **TDD Flow Migration** (31-4) - Migrate built-in TDD flow to workflow definition
- **`/workflow` Skill** (31-5) - List available workflows, show current, switch mid-session
- **Workflow Session Tracking** (31-6) - Track current workflow in session files
- **Generic Handoff Subagent** (31-7) - Workflow-driven handoff subagent for any transition
- **Turn Optimization Patterns** (31-9) - Documentation for reducing agent turns

#### Epic 32: BMAD Format Interoperability
- **BMAD Formats Documentation** (32-1) - Document BMAD artifact formats (stories, epics, context)
- **BMAD Story Parser** (32-2) - Parse BMAD story files into Pennyfarthing format
- **BMAD Epics Parser** (32-3) - Parse BMAD epics files
- **BMAD Context Reader** (32-4) - Parse BMAD project-context.md files

#### Epic 33: Skill & Permission Management
- **`/permissions` Skill** (33-2) - View and manage runtime permission grants

#### Epic 34: Cyclist Developer Experience
- **First-Run Setup** (34-1) - Documentation and tooling for first-time Cyclist setup
- **`cyclist-doctor` Command** (34-2) - Health check command for Cyclist installation
- **Port Conflict Detection** (34-3) - Detect and message when port 3456 is in use
- **Upgrade Path Handling** (34-4) - Smooth upgrades between Cyclist versions
- **Team Validation Checklist** (34-5) - Checklist for validating Cyclist on team machines

#### Cyclist Enhancements
- **Horizontal Tab Bar** - Replace vertical panel buttons with horizontal tabs
- **Slash Command Popup** - Show command suggestions immediately on "/" at start
- **Tool Panel** - Vertical panel for tool execution log
- **Quick Action Button Labels** - Improved button labels for quick actions
- **Typeahead Filtering** - Better filtering as user types
- **Inline Queue** - Inject buttons in queue UI

#### Release Automation
- **GitHub Release Creation** - `/release --bump` now creates GitHub releases via `gh` CLI

### Fixed
- **Portrait Slugs** - Correct O'Brien and all-stars portrait slugs
- **Sprite Paths** - Update showcase portrait paths for multi-resolution images
- **OTEL Config** - Full OTEL config for Claude Code telemetry
- **Theme Config Path** - Support `.pennyfarthing/config.local.yaml`

### Changed
- **Config Directory** - Theme config moved to `.pennyfarthing/config.local.yaml`
- **ESLint Config** - Added ESLint configuration and cleaned up lint warnings

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 20+ |
| Epics Delivered | 4 (Epic 31, 32, 33, 34) |
| New Skills | 2 (`/workflow`, `/permissions`) |
| New Commands | 1 (`cyclist-doctor`) |
| Themes | 102 |

---

## [6.3.0] - 2026-01-12

### Configuration & Theme Management

This release delivers the Cyclist settings panel with theme management, along with showcase improvements for theme discovery.

### Added

#### Epic 24: Configuration & Theme Switcher Panels
- **Settings Panel Infrastructure** (24-1) - New settings window with section-based navigation
- **Theme Selector** (24-2) - Browse and switch themes from Cyclist settings
- **Diff History Navigation** (24-3) - Navigate through diff history with keyboard shortcuts
- **Theme Browser with Search** (24-5) - Searchable theme browser with filtering
- **Theme Preview Panel** (24-6) - Preview theme personas before switching

#### Epic 30: Developer Workflow Documentation
- **Quick Commit Command** (30-2) - `/chore` command for small commits without ceremony

#### Showcase Improvements
- **Theme Tiers Page** - Quality tier breakdown for all themes
- **OCEAN Analysis Page** - Personality profile visualization across themes

#### Persona Optimization
- **Mad Max Theme** - Optimized based on job fair benchmark results

### Fixed
- **Quick Actions** - Disable pattern detection for markers-only quick actions
- **ESM Settings** - Resolve require error in settings window
- **Diff Panel** - Fix state management and Combined view indicator
- **Keybinds** - Ignore j/k navigation in contenteditable elements
- **Diff History** - Wire DiffHistoryManager into diff panel UI
- **Button Layout** - Fix expand button layout and message margins
- **Agent Sidecars** - Move outside .claude/ for dogfooding compatibility
- **Settings Debug** - Add debugging and use centralized paths
- **Process Persistence** - Keep Claude process alive for background agents

---

## [6.2.0] - 2026-01-12

### Sprint 9: Multimodal Images & Smart Detection

This release delivers multimodal image support for Cyclist, intelligent question detection with confidence scoring, and robust session management with structured output markers.

### Added

#### Epic 28: Image Paste & Screenshot Support (14 pts)
- **Clipboard Image Paste** (28-1) - Paste images directly into Cyclist editor from clipboard
  - Supports PNG, JPEG, GIF, WebP formats
  - Automatic base64 encoding for Claude API
  - Preview thumbnail with remove button
- **Image Size Validation** (28-5) - Validate and warn on large images
  - Block images over 20MB
  - Warning indicator for images over 5MB
  - Tooltip showing file size
- **Multiple Image Support** (28-6) - Attach multiple images to a single message
  - Flex-wrap thumbnail grid
  - Individual remove buttons with correct index handling
  - "Clear All" button when 2+ images attached

#### Epic 25: Smart Question Detection (13 pts)
- **Universal Yes/Proceed Detection** (25-4) - Detect common confirmation prompts
- **Handoff and Action Prompts** (25-3) - Recognize agent transitions and suggested actions
- **Structured Output Markers** (25-5) - Machine-readable markers for quick-action UI
  - `<!-- CYCLIST:YES_NO:... -->` for confirmations
  - `<!-- CYCLIST:HANDOFF:... -->` for agent transitions
  - `<!-- CYCLIST:ACTION:... -->` for clickable actions
- **Confidence Scoring** (25-6) - Score detection patterns for accuracy
  - High/medium/low confidence levels
  - Threshold-based filtering

#### Epic 23: Cyclist Command Integration (8 pts)
- **Command Abstraction Layer** (23-2) - IPC bridge for Claude Code commands
- **Clear Session Reset** (23-2) - Full state reset including tool events and context
- **Compact Button** (23-4) - Context-aware UI for space-constrained displays

#### Epic 8: State Reconciliation (8 pts)
- **Git Hook PR Detection** - Automatic PR state tracking
- **Startup Drift Detection** (8-2) - Detect session/reality mismatches on launch
- **Session Boundary Breadcrumbs** (8-3) - Track context across session boundaries

#### Epic 9: Skill Discovery & Documentation (13 pts)
- **Skill Registry Schema** (9-1) - YAML-based skill metadata catalog
- **Skill Search Utility** (9-2) - Find skills by keyword and category
- **Skill Documentation Generator** (9-3) - Auto-generate skill docs from schema
- **Skill Usage Analytics** (9-4) - Track skill invocation patterns

#### Other Enhancements
- **OTEL Web Mode** (20-1) - Auto-configure telemetry for web environments
- **Tool Execution Audit Log** (22-1) - Track all tool executions for debugging
- **Usage Limits Display** - Real-time usage stats via ccusage integration

### Fixed
- **Dogfood Structure Migration** (26-1) - Align .claude/ with fresh init structure
- **UX Polish** (27-1) - Editor focus, diff panel scroll behavior
- **Markdown Parser** - Strip CYCLIST markers before HTML escape
- **Usage Display Accuracy** - Correct polling and display logic
- **Clear State Reset** - Properly reset all session state on /clear
- **Diff Panel Scroll** - Enable horizontal scroll for long lines

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 28 |
| Points Delivered | 38 |
| Sprint Velocity Target | 22 pts |
| Actual Delivery | 173% of target |

---

## [6.1.0] - 2026-01-10

### Rich Telemetry, Tool Visibility & Command Expansion

This release adds comprehensive agent telemetry, real-time tool visibility in Cyclist, and expands the command/skill library.

### Added

#### Epic 19: Rich Agent Telemetry (Stories 19-1 through 19-7, 19-9)
- **OTEL Event Parsing** (19-1) - Parse claude_code.tool_result and user_prompt events from OTEL logs
- **Telemetry Types** (19-2) - TypeScript interfaces following gen_ai.* semantic conventions
- **Span Hierarchy Builder** (19-3) - Reconstruct parent/child relationships from flat OTEL events
- **Agent Context Telemetry** (19-4) - Track which Pennyfarthing agent (SM/TEA/Dev/Reviewer) is active
- **Story Context Telemetry** (19-5) - Tag telemetry with story ID for cost attribution
- **TDD Phase Metrics** (19-6) - Measure time in RED/GREEN/REVIEW phases
- **Telemetry Dashboard API** (19-7) - REST endpoints for session, tool, agent, story, and TDD metrics
- **Agent Evaluation Framework** (19-9) - Performance tracking across agents and personas

#### Epic 21: Command & Skill Expansion (Stories 21-1 through 21-3, 21-5, 21-6)
- **`/check` Command** (21-1) - Pre-commit quality gate running lint, type check, and tests
  - Integrated with dev-handoff subagent for automatic validation
  - `--skip-check` flag for bypassing when needed
- **`/prime` Command** (21-2) - Load essential project context at agent activation
  - Auto-invoked by agent-session.sh on start
- **Mermaid Skill** (21-3) - Diagram generation reference with templates
  - Flowcharts, sequence diagrams, ER diagrams, state diagrams
  - GitHub/GitLab native rendering support
- **Changelog Skill** (21-5) - Keep a Changelog format with conventional commits parsing
- **`/help` Command** (21-6) - Context-aware help for all Pennyfarthing commands and agents

#### Epic 22: Verbose Mode - Tool Visibility (Stories 22-1 through 22-3, 22-5)
- **Tool Activity Bar** (22-1) - Sticky bar showing current tool execution with elapsed time
- **Abort Button** (22-2) - Stop long-running operations with SIGINT to PTY
- **Bash Command Approval Gate** (22-3) - Optional pre-execution confirmation for shell commands
  - Approve/Reject/Always Allow workflow
  - Pattern-based allowlist
- **Verbose Mode Toggle** (22-5) - Expand tool blocks by default (Cmd+Shift+V)

#### Epic 7: Agent Performance Benchmarking (Stories 7-1, 7-4)
- **Benchmark Runner Framework** (7-1) - `scripts/benchmark-runner.sh` for systematic testing
  - Loads scenarios from YAML
  - Structured result output
- **Job-Fair Statistics Aggregation** (7-4) - Aggregate results into benchmark statistics

#### Cyclist Enhancements
- **Popup Profile View** (17-4) - Click persona to see full character details in modal

### Fixed
- **TypeScript Property Access** (19-7) - Correct property access in telemetry API
- **Stats Module Consolidation** - stats.js → stats-strip.js with updated tests
- **Context IPC Channel** - Dedicated channel for meter updates
- **Vestigial Context Field** - Removed stale state from stats

### Summary
| Metric | Value |
|--------|-------|
| Stories Completed | 17 |
| Points Delivered | 44 |
| New Commands | 3 (`/check`, `/prime`, `/help`) |
| New Skills | 2 (mermaid, changelog) |
| Telemetry Endpoints | 5 (session, tools, agents, stories, tdd) |

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
- **Agent Commands Path** - All agent activation commands updated to use direct script invocation. Scripts now self-locate via BASH_SOURCE instead of relying on a bootstrap wrapper.

---

## [4.0.2] - 2025-12-31

### Fixed
- **Scripts Path Resolution (Complete)** - Scripts now derive `PROJECT_ROOT` from their position in directory tree using BASH_SOURCE and `find-root.sh`, eliminating dependency on bootstrap wrapper.

---

## [4.0.1] - 2025-12-31

### Fixed
- **Scripts Path Resolution** - Scripts now self-locate using BASH_SOURCE and find-root.sh instead of relying on run.sh bootstrap, providing direct path resolution.

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
  - jira, just, dev-patterns, persona-benchmark
- **TDD Workflow:** SM → TEA → Dev → Reviewer → SM
- Session file system (`.session/current_work.md`)
- Sprint tracking (`sprint/current-sprint.yaml`)
- Project initialization script (`scripts/init-project.sh`)
- Agent session management (`scripts/agent-session.sh`)

---

[Unreleased]: https://github.com/1898andCo/pennyfarthing/compare/v13.1.0...HEAD
[13.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0...v13.1.0
[13.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-beta.2...v13.0.0
[13.0.0-beta.2]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-beta.1...v13.0.0-beta.2
[13.0.0-beta.1]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-alpha.3...v13.0.0-beta.1
[13.0.0-alpha.3]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-alpha.2...v13.0.0-alpha.3
[13.0.0-alpha.2]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-alpha.1...v13.0.0-alpha.2
[13.0.0-alpha.1]: https://github.com/1898andCo/pennyfarthing/compare/v13.0.0-alpha.0...v13.0.0-alpha.1
[13.0.0-alpha.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.7.0...v13.0.0-alpha.0
[12.7.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.6.2...v12.7.0
[12.6.2]: https://github.com/1898andCo/pennyfarthing/compare/v12.6.1...v12.6.2
[12.6.1]: https://github.com/1898andCo/pennyfarthing/compare/v12.6.0...v12.6.1
[12.6.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.5.0...v12.6.0
[12.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.4.1...v12.5.0
[12.4.1]: https://github.com/1898andCo/pennyfarthing/compare/v12.4.0...v12.4.1
[12.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.3.0...v12.4.0
[12.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.2.0...v12.3.0
[12.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.1.3...v12.2.0
[12.1.3]: https://github.com/1898andCo/pennyfarthing/compare/v12.1.2...v12.1.3
[12.1.2]: https://github.com/1898andCo/pennyfarthing/compare/v12.1.1...v12.1.2
[12.1.1]: https://github.com/1898andCo/pennyfarthing/compare/v12.1.0...v12.1.1
[12.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v12.0.0...v12.1.0
[12.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.5.0-alpha.0...v12.0.0
[11.5.0-alpha.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.4.0...v11.5.0-alpha.0
[11.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.8...v11.4.0
[11.3.8]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.7...v11.3.8
[11.3.7]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.6...v11.3.7
[11.3.6]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.5...v11.3.6
[11.3.5]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.4...v11.3.5
[11.3.4]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.3...v11.3.4
[11.3.3]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.2...v11.3.3
[11.3.2]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.1...v11.3.2
[11.3.1]: https://github.com/1898andCo/pennyfarthing/compare/v11.3.0...v11.3.1
[11.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.2.2...v11.3.0
[11.2.2]: https://github.com/1898andCo/pennyfarthing/compare/v11.2.1...v11.2.2
[11.2.1]: https://github.com/1898andCo/pennyfarthing/compare/v11.2.0...v11.2.1
[11.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.1.1...v11.2.0
[11.1.1]: https://github.com/1898andCo/pennyfarthing/compare/v11.1.0...v11.1.1
[11.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v11.0.0...v11.1.0
[11.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v10.4.0...v11.0.0
[10.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v10.3.1...v10.4.0
[10.3.1]: https://github.com/1898andCo/pennyfarthing/compare/v10.3.0...v10.3.1
[10.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v10.2.0...v10.3.0
[10.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v10.1.0...v10.2.0
[10.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v10.0.5...v10.1.0
[10.0.5]: https://github.com/1898andCo/pennyfarthing/compare/v10.0.4...v10.0.5
[10.0.4]: https://github.com/1898andCo/pennyfarthing/compare/v10.0.3...v10.0.4
[10.0.3]: https://github.com/1898andCo/pennyfarthing/compare/v10.0.2...v10.0.3
[10.0.2]: https://github.com/1898andCo/pennyfarthing/compare/v10.0.0...v10.0.2
[10.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v9.4.0...v10.0.0
[9.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v9.3.0...v9.4.0
[9.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v9.2.0...v9.3.0
[9.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v9.1.2...v9.2.0
[9.1.2]: https://github.com/1898andCo/pennyfarthing/compare/v9.1.1...v9.1.2
[9.1.1]: https://github.com/1898andCo/pennyfarthing/compare/v9.1.0...v9.1.1
[9.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v9.0.3...v9.1.0
[9.0.3]: https://github.com/1898andCo/pennyfarthing/compare/v9.0.2...v9.0.3
[9.0.2]: https://github.com/1898andCo/pennyfarthing/compare/v9.0.1...v9.0.2
[9.0.1]: https://github.com/1898andCo/pennyfarthing/compare/v9.0.0...v9.0.1
[9.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v8.1.0...v9.0.0
[8.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.5...v8.0.0
[7.9.5]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.4...v7.9.5
[7.9.4]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.3...v7.9.4
[7.9.3]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.2...v7.9.3
[7.9.2]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.1...v7.9.2
[7.9.1]: https://github.com/1898andCo/pennyfarthing/compare/v7.9.0...v7.9.1
[7.9.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.8.5...v7.9.0
[7.8.5]: https://github.com/1898andCo/pennyfarthing/compare/v7.8.2...v7.8.5
[7.8.2]: https://github.com/1898andCo/pennyfarthing/compare/v7.8.1...v7.8.2
[7.8.1]: https://github.com/1898andCo/pennyfarthing/compare/v7.8.0...v7.8.1
[7.8.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.7.0...v7.8.0
[7.7.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.6.1...v7.7.0
[7.6.1]: https://github.com/1898andCo/pennyfarthing/compare/v7.6.0...v7.6.1
[7.6.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.5.0...v7.6.0
[7.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.4.0...v7.5.0
[7.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.3.0...v7.4.0
[7.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.2.0...v7.3.0
[7.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.1.0...v7.2.0
[7.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v7.0.2...v7.1.0
[7.0.2]: https://github.com/1898andCo/pennyfarthing/compare/v7.0.1...v7.0.2
[7.0.1]: https://github.com/1898andCo/pennyfarthing/compare/v7.0.0...v7.0.1
[7.0.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.5.0...v7.0.0
[6.5.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.4.0...v6.5.0
[6.4.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.3.0...v6.4.0
[6.3.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.2.0...v6.3.0
[6.2.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/1898andCo/pennyfarthing/compare/v6.0.4...v6.1.0
[6.0.4]: https://github.com/1898andCo/pennyfarthing/compare/v6.0.3...v6.0.4
[6.0.3]: https://github.com/1898andCo/pennyfarthing/compare/v6.0.0...v6.0.3
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
