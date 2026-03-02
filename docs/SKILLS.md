# Pennyfarthing Skills Reference

This document is auto-generated from `skill-registry.yaml`. Do not edit manually.

## Table of Contents

- [AI/LLM](#aillm)
  - [pf-agentic-patterns](#pf-agentic-patterns)
  - [pf-context-engineering](#pf-context-engineering)
- [Benchmarking](#benchmarking)
  - [pf-finalize-run](#pf-finalize-run)
  - [pf-judge](#pf-judge)
  - [pf-persona-benchmark](#pf-persona-benchmark)
- [Development](#development)
  - [pf-code-review](#pf-code-review)
  - [pf-systematic-debugging](#pf-systematic-debugging)
  - [pf-testing](#pf-testing)
  - [pf-ux-tandem](#pf-ux-tandem)
- [Documentation](#documentation)
  - [pf-changelog](#pf-changelog)
- [Project Management](#project-management)
  - [pf-context](#pf-context)
  - [pf-jira](#pf-jira)
  - [pf-sprint](#pf-sprint)
  - [pf-workflow](#pf-workflow)
- [Theming](#theming)
  - [pf-theme](#pf-theme)
- [Tools](#tools)
  - [pf-bc](#pf-bc)
  - [pf-gui](#pf-gui)
  - [pf-just](#pf-just)
  - [pf-mermaid](#pf-mermaid)
  - [pf-otel](#pf-otel)
  - [pf-settings](#pf-settings)
  - [pf-yq](#pf-yq)

## AI/LLM

### pf-agentic-patterns

Core reasoning patterns for building effective LLM agents

**Tags:** reasoning, patterns, agents, llm

**Keywords:** react, reflection, planning, tool-use, chain-of-thought

**Examples:**
- Designing agent behavior: `/agentic-patterns`
- Debugging agent failures: `/agentic-patterns troubleshooting`

**Anti-patterns:**
- Don't apply patterns mechanically without understanding context

**Related:** [pf-context-engineering](#pf-context-engineering)

### pf-context-engineering

Strategies for managing context windows in long-running agent sessions

**Tags:** context, optimization, agents

**Keywords:** context-window, tokens, summarization, lazy-loading

**Examples:**
- Approaching context limits: `/context-engineering`
- Designing subagent prompts: `/context-engineering subagent-design`

**Anti-patterns:**
- Don't load unnecessary context upfront
- Don't repeat large code blocks in prompts

**Related:** [pf-agentic-patterns](#pf-agentic-patterns)

## Benchmarking

### pf-finalize-run

Validate and save benchmark run results - single exit point for all runs

**Tags:** benchmark, validation, results

**Keywords:** benchmark, save, validate, guardrail

**Examples:**
- Completing a benchmark run: `/finalize-run`

**Anti-patterns:**
- Never save results without passing through this skill

**Related:** [pf-judge](#pf-judge), [pf-persona-benchmark](#pf-persona-benchmark)

### pf-judge

Evaluate agent responses using standardized rubrics

**Tags:** evaluation, rubrics, scoring

**Keywords:** evaluation, scoring, metrics, grading

**Examples:**
- Evaluating agent response: `/judge evaluate`
- Running benchmark comparison: `/judge compare`

**Anti-patterns:**
- Don't modify rubrics during a benchmark run

**Related:** [pf-finalize-run](#pf-finalize-run), [pf-persona-benchmark](#pf-persona-benchmark)

### pf-persona-benchmark

Run benchmarks to compare persona effectiveness

**Tags:** benchmark, personas, comparison

**Keywords:** benchmark, comparison, personas, testing

**Examples:**
- Testing persona on code review: `/persona-benchmark cr-001 discworld`
- Testing tech writer persona: `/persona-benchmark tw-001 literary-classics`

**Anti-patterns:**
- Don't compare results across different rubric versions

**Related:** [pf-judge](#pf-judge), [pf-finalize-run](#pf-finalize-run), [pf-theme](#pf-theme)

## Development

### pf-code-review

Code review checklists and patterns for quality assurance

**Tags:** review, quality, checklist

**Keywords:** pr, pull-request, quality, linting, security

**Examples:**
- Self-review before commit: `/code-review`
- Reviewing a PR: `/code-review pr-checklist`

**Anti-patterns:**
- Don't skip security considerations in review
- Don't approve without running tests

**Related:** [pf-testing](#pf-testing)

### pf-systematic-debugging

Systematic debugging approach for isolating and fixing issues

**Tags:** debugging, troubleshooting, root-cause

**Keywords:** debugging, bisect, reproduce, isolate, root-cause, regression

**Examples:**
- Debugging test failures: `/systematic-debugging`
- Investigating regressions: `/systematic-debugging bisect`

**Anti-patterns:**
- Don't jump to solutions without reproducing the issue first
- Don't fix symptoms instead of root causes

**Related:** [pf-testing](#pf-testing), [pf-agentic-patterns](#pf-agentic-patterns)

### pf-testing

Test commands and TDD workflow patterns

**Tags:** tdd, testing, quality

**Keywords:** jest, vitest, pytest, unit-test, integration, tdd, red-green

**Examples:**
- Running project tests: `/testing`
- Debugging test failures: `/testing troubleshoot`

**Anti-patterns:**
- Don't run tests directly - use testing-runner subagent
- Don't skip RED phase in TDD workflow

**Related:** [pf-code-review](#pf-code-review)

### pf-ux-tandem

Live UX review tandem — spawn a UX designer to watch a tmux pane and suggest improvements in real time

**Tags:** ux, tandem, review, tmux, collaboration, team

**Keywords:** ux, design, review, tandem, tmux, visual, usability, team

**Examples:**
- Watch a TUI for usability issues: `/pf-ux-tandem`
- Watch a running app in another pane: `/pf-ux-tandem`

**Anti-patterns:**
- Don't use for non-visual targets (use standard tandem-backseat for code review)

**Related:** [pf-code-review](#pf-code-review)

## Documentation

### pf-changelog

Maintain changelogs following Keep a Changelog format with conventional commits

**Tags:** changelog, releases, versioning

**Keywords:** keepachangelog, conventional-commits, semver, release-notes

**Examples:**
- Creating release notes: `/changelog`
- Auto-generating from commits: `/changelog generate`

**Anti-patterns:**
- Don't manually edit CHANGELOG.md entries after generation

## Project Management

### pf-context

Create epic or story context documents from sprint data and planning docs

**Tags:** context, creation, epic, story, sprint

**Keywords:** context, epic, story, template, schema, planning, creation

**Examples:**
- Creating epic context document: `/pf-context create epic 130`
- Creating epic context by Jira key: `/pf-context create epic MSSCI-15685`

**Anti-patterns:**
- Don't hardcode section names — read context-schema.yaml
- Don't create story context without existing parent epic context

**Related:** [pf-sprint](#pf-sprint), [pf-context-engineering](#pf-context-engineering)

### pf-jira

Jira CLI commands for sprint management

**Tags:** jira, issues, sprint

**Keywords:** atlassian, issues, tickets, backlog

**Examples:**
- Viewing sprint issues: `/jira sprint`
- Assigning issues: `/jira assign ISSUE-123`

**Anti-patterns:**
- Don't bypass Jira for sprint tracking

**Related:** [pf-sprint](#pf-sprint)

### pf-sprint

Sprint status, backlog, story, and epic management for Pennyfarthing

**Tags:** sprint, status, backlog, stories, epics

**Keywords:** sprint, backlog, velocity, kanban, stories, epics, sizing, templates

**Examples:**
- Checking sprint status: `/pf-sprint`
- Finding available stories: `/pf-sprint backlog`
- Adding a story: `/pf-sprint story add epic-76 "My story" 3`
- Sizing guidelines: `/pf-sprint story size`
- Adding an epic: `/pf-sprint epic add epic-85 "New epic`

**Anti-patterns:**
- Don't manually edit sprint YAML - use scripts

**Related:** [pf-jira](#pf-jira)

### pf-workflow

Manage workflows - list, show, set, start, resume, and check status

**Tags:** workflow, phases, tdd

**Keywords:** tdd, tdd-tandem, trivial, agent-docs, bdd, bdd-tandem, architecture, bikelane, stepped, phased

**Examples:**
- Listing available workflows: `/pf-workflow`
- Showing current workflow: `/pf-workflow show`
- Starting stepped workflow: `/pf-workflow start architecture`

**Anti-patterns:**
- Don't switch workflows mid-story unless requirements fundamentally changed

**Related:** [pf-sprint](#pf-sprint)

## Theming

### pf-theme

Manage persona themes - list, show, set, create, and interactive maker wizard

**Tags:** personas, themes, customization, creation

**Keywords:** personas, characters, discworld, literary-classics, custom, generation, wizard

**Examples:**
- Listing available themes: `/pf-theme list`
- Showing current theme: `/pf-theme show`
- Setting active theme: `/pf-theme set discworld`
- Creating a new theme: `/pf-theme create my-theme --base discworld`
- Interactive AI-driven theme wizard: `/pf-theme maker`

**Anti-patterns:**
- Don't edit config.local.yaml directly - use skill

## Tools

### pf-bc

Panel focus management for BikeRack — set, clear, save, and load panel layouts

**Tags:** panels, layout, bikerack

**Keywords:** bikerack, panel, focus, layout, dockview

**Examples:**
- Focusing the Sprint panel: `/bc sprint`
- Saving current layout: `/bc save my-layout`
- Resetting panel focus: `/bc reset`

**Anti-patterns:**
- Don't manually edit config.local.yaml to set panel focus — use this skill

**Related:** [pf-gui](#pf-gui)

### pf-gui

BikeRack GUI detection and status for Claude Code monitoring

**Tags:** visual, monitoring, gui, bikerack

**Keywords:** gui, bikerack, visualization, dashboard

**Examples:**
- Checking GUI status: `/gui`
- Debugging sessions: `/gui debug`

**Anti-patterns:**
- Don't run BikeRack GUI in headless environments

### pf-just

Run just recipes for project tasks like dev servers, tests, and databases

**Tags:** tasks, runner, automation

**Keywords:** justfile, make, tasks, automation, command-runner

**Examples:**
- Starting dev servers: `/just dev`
- Running database tasks: `/just db-reset`

**Anti-patterns:**
- Don't create complex recipes - keep them simple and composable

**Related:** [pf-testing](#pf-testing)

### pf-mermaid

Generate diagrams using Mermaid syntax for documentation

**Tags:** diagrams, visualization, documentation

**Keywords:** flowchart, sequence, er-diagram, gantt, class-diagram

**Examples:**
- Creating architecture diagrams: `/mermaid architecture`
- Sequence diagrams: `/mermaid sequence`

**Anti-patterns:**
- Don't create overly complex diagrams - split into multiple if needed

**Related:** [pf-changelog](#pf-changelog)

### pf-otel

Claude Code OTEL telemetry format documentation for span interception and enrichment

**Tags:** telemetry, monitoring, otel

**Keywords:** opentelemetry, spans, traces, enrichment, correlation

**Examples:**
- Working with OTEL spans: `/otel`
- Enriching tool telemetry in BikeRack GUI: `/otel enrichment`

**Anti-patterns:**
- Don't assume fields exist - verify against this documentation

**Related:** [pf-gui](#pf-gui)

### pf-settings

View and manage .pennyfarthing/config.local.yaml settings

**Tags:** configuration, settings, config

**Keywords:** theme, relay, bell, permission, display, config

**Examples:**
- View all settings: `/pf-settings show`
- Get a specific setting: `/pf-settings get workflow.relay_mode`

**Related:** [pf-theme](#pf-theme), [pf-bc](#pf-bc)

### pf-yq

YAML processor for reading, modifying, and querying YAML files

**Tags:** yaml, processing, cli

**Keywords:** yaml, jq, parsing, query, mikefarah

**Examples:**
- Reading YAML values: `/yq read`
- Modifying YAML files: `/yq modify`

**Anti-patterns:**
- Don't use complex expressions without testing first

**Related:** [pf-just](#pf-just)

---

*Generated by `generate-skill-docs`*
