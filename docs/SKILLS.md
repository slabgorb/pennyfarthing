# Pennyfarthing Skills Reference

This document is auto-generated from `skill-registry.yaml`. Do not edit manually.

## Table of Contents

- [AI/LLM](#aillm)
  - [agentic-patterns](#agentic-patterns)
  - [context-engineering](#context-engineering)
- [Benchmarking](#benchmarking)
  - [finalize-run](#finalize-run)
  - [judge](#judge)
  - [persona-benchmark](#persona-benchmark)
- [Development](#development)
  - [code-review](#code-review)
  - [dev-patterns](#dev-patterns)
  - [testing](#testing)
- [Documentation](#documentation)
  - [changelog](#changelog)
- [Project Management](#project-management)
  - [jira](#jira)
  - [sprint-context](#sprint-context)
  - [story-management](#story-management)
- [Theming](#theming)
  - [theme](#theme)
  - [theme-creation](#theme-creation)
- [Tools](#tools)
  - [cyclist](#cyclist)
  - [just](#just)
  - [mermaid](#mermaid)
  - [yq](#yq)

## AI/LLM

### agentic-patterns

Core reasoning patterns for building effective LLM agents

**Tags:** reasoning, patterns, agents, llm

**Keywords:** react, reflection, planning, tool-use, chain-of-thought

**Examples:**
- Designing agent behavior: `/agentic-patterns`
- Debugging agent failures: `/agentic-patterns troubleshooting`

**Anti-patterns:**
- Don't apply patterns mechanically without understanding context

**Related:** [context-engineering](#context-engineering)

### context-engineering

Strategies for managing context windows in long-running agent sessions

**Tags:** context, optimization, agents

**Keywords:** context-window, tokens, summarization, lazy-loading

**Examples:**
- Approaching context limits: `/context-engineering`
- Designing subagent prompts: `/context-engineering subagent-design`

**Anti-patterns:**
- Don't load unnecessary context upfront
- Don't repeat large code blocks in prompts

**Related:** [agentic-patterns](#agentic-patterns)

## Benchmarking

### finalize-run

Validate and save benchmark run results - single exit point for all runs

**Tags:** benchmark, validation, results

**Keywords:** benchmark, save, validate, guardrail

**Examples:**
- Completing a benchmark run: `/finalize-run`

**Anti-patterns:**
- Never save results without passing through this skill

**Related:** [judge](#judge), [persona-benchmark](#persona-benchmark)

### judge

Evaluate agent responses using standardized rubrics

**Tags:** evaluation, rubrics, scoring

**Keywords:** evaluation, scoring, metrics, grading

**Examples:**
- Evaluating agent response: `/judge evaluate`
- Running benchmark comparison: `/judge compare`

**Anti-patterns:**
- Don't modify rubrics during a benchmark run

**Related:** [finalize-run](#finalize-run), [persona-benchmark](#persona-benchmark)

### persona-benchmark

Run benchmarks to compare persona effectiveness

**Tags:** benchmark, personas, comparison

**Keywords:** benchmark, comparison, personas, testing

**Examples:**
- Testing persona on code review: `/persona-benchmark cr-001 discworld`
- Testing tech writer persona: `/persona-benchmark tw-001 literary-classics`

**Anti-patterns:**
- Don't compare results across different rubric versions

**Related:** [judge](#judge), [finalize-run](#finalize-run), [theme](#theme)

## Development

### code-review

Code review checklists and patterns for quality assurance

**Tags:** review, quality, checklist

**Keywords:** pr, pull-request, quality, linting, security

**Examples:**
- Self-review before commit: `/code-review`
- Reviewing a PR: `/code-review pr-checklist`

**Anti-patterns:**
- Don't skip security considerations in review
- Don't approve without running tests

**Related:** [testing](#testing), [dev-patterns](#dev-patterns)

### dev-patterns

Common development patterns, fixes, and gotchas

**Tags:** patterns, debugging, implementation

**Keywords:** implementation, debugging, fixes, best-practices

**Examples:**
- Implementing features: `/dev-patterns`
- Avoiding known pitfalls: `/dev-patterns gotchas`

**Anti-patterns:**
- Don't apply patterns from other frameworks blindly

**Related:** [code-review](#code-review), [testing](#testing)

### testing

Test commands and TDD workflow patterns

**Tags:** tdd, testing, quality

**Keywords:** jest, vitest, pytest, unit-test, integration, tdd, red-green

**Examples:**
- Running project tests: `/testing`
- Debugging test failures: `/testing troubleshoot`

**Anti-patterns:**
- Don't run tests directly - use testing-runner subagent
- Don't skip RED phase in TDD workflow

**Related:** [dev-patterns](#dev-patterns), [code-review](#code-review)

## Documentation

### changelog

Maintain changelogs following Keep a Changelog format with conventional commits

**Tags:** changelog, releases, versioning

**Keywords:** keepachangelog, conventional-commits, semver, release-notes

**Examples:**
- Creating release notes: `/changelog`
- Auto-generating from commits: `/changelog generate`

**Anti-patterns:**
- Don't manually edit CHANGELOG.md entries after generation

## Project Management

### jira

Jira CLI commands for sprint management

**Tags:** jira, issues, sprint

**Keywords:** atlassian, issues, tickets, backlog

**Examples:**
- Viewing sprint issues: `/jira sprint`
- Assigning issues: `/jira assign ISSUE-123`

**Anti-patterns:**
- Don't bypass Jira for sprint tracking

**Related:** [sprint-context](#sprint-context), [story-management](#story-management)

### sprint-context

Sprint status, backlog, and story management context

**Tags:** sprint, status, backlog

**Keywords:** sprint, backlog, velocity, kanban

**Examples:**
- Checking sprint status: `/sprint-context`
- Finding available stories: `/sprint-context available`

**Anti-patterns:**
- Don't manually edit sprint YAML - use skills

**Related:** [story-management](#story-management), [jira](#jira)

### story-management

Story creation, sizing, and sprint workflow patterns

**Tags:** stories, sizing, workflow

**Keywords:** user-stories, estimation, points, acceptance-criteria

**Examples:**
- Creating new stories: `/story-management create`
- Sizing stories: `/story-management size`

**Anti-patterns:**
- Don't create stories without acceptance criteria

**Related:** [sprint-context](#sprint-context), [jira](#jira)

## Theming

### theme

Manage persona themes - list, show, and set active theme

**Tags:** personas, themes, customization

**Keywords:** personas, characters, discworld, literary-classics

**Examples:**
- Listing available themes: `/list-themes`
- Showing current theme: `/show-theme`
- Setting active theme: `/set-theme discworld`

**Anti-patterns:**
- Don't edit persona-config.local.yaml directly - use skill

**Related:** [theme-creation](#theme-creation)

### theme-creation

Create custom persona themes with AI-driven generation

**Tags:** personas, themes, creation

**Keywords:** personas, custom, generation, wizard

**Examples:**
- Creating new theme: `/theme-maker`
- Interactive theme wizard: `/create-theme`

**Anti-patterns:**
- Don't create incomplete themes missing required agents

**Related:** [theme](#theme)

## Tools

### cyclist

Launch Cyclist visual terminal for Claude Code monitoring

**Tags:** visual, monitoring, terminal

**Keywords:** tui, terminal, visualization, dashboard

**Examples:**
- Starting visual monitor: `/cyclist`
- Debugging sessions: `/cyclist debug`

**Anti-patterns:**
- Don't run Cyclist in headless environments

### just

Run just recipes for project tasks like dev servers, tests, and databases

**Tags:** tasks, runner, automation

**Keywords:** justfile, make, tasks, automation, command-runner

**Examples:**
- Starting dev servers: `/just dev`
- Running database tasks: `/just db-reset`

**Anti-patterns:**
- Don't create complex recipes - keep them simple and composable

**Related:** [testing](#testing)

### mermaid

Generate diagrams using Mermaid syntax for documentation

**Tags:** diagrams, visualization, documentation

**Keywords:** flowchart, sequence, er-diagram, gantt, class-diagram

**Examples:**
- Creating architecture diagrams: `/mermaid architecture`
- Sequence diagrams: `/mermaid sequence`

**Anti-patterns:**
- Don't create overly complex diagrams - split into multiple if needed

**Related:** [changelog](#changelog)

### yq

YAML processor for reading, modifying, and querying YAML files

**Tags:** yaml, processing, cli

**Keywords:** yaml, jq, parsing, query, mikefarah

**Examples:**
- Reading YAML values: `/yq read`
- Modifying YAML files: `/yq modify`

**Anti-patterns:**
- Don't use complex expressions without testing first

**Related:** [just](#just)

---

*Generated by `generate-skill-docs`*
