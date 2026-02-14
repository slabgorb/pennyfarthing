---
description: List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, switching to a different workflow pattern, or managing BikeLane stepped workflows.
---

# /workflow - Workflow Management

Load and follow the workflow skill: `.claude/skills/workflow/skill.md`

Pass any arguments provided by the user to the skill commands.

## Quick Reference

| Command | Action |
|---------|--------|
| `/workflow` | List all available workflows |
| `/workflow list` | List all available workflows |
| `/workflow show [name]` | Show workflow details (current session if no name) |
| `/workflow set <name>` | Switch to a different workflow mid-session |
| `/workflow start <name> [--mode <mode>]` | Start a stepped workflow |
| `/workflow resume [name]` | Resume an interrupted stepped workflow |
| `/workflow status` | Show current stepped workflow progress |
