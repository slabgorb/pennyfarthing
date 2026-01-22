# Story 4-4 Summary: Agent-Specific Permission Scopes

## Overview
Implemented a three-tier permission model for Pennyfarthing agents.

## What Was Built

### Files Created
- `pennyfarthing-dist/guides/AGENT-SCOPES.md` - Comprehensive documentation
- `pennyfarthing-dist/templates/agent-scopes.yaml.template` - Configuration template

### Three-Tier Model
1. **Strategic Agents** (Opus) - Full project scope
   - Orchestrator, PM, SM, Architect, DevOps
   - Broad permissions for planning and coordination

2. **Tactical Agents** (Opus) - Story-scoped
   - Dev, TEA, Reviewer, Tech-Writer, UX
   - Focused permissions for implementation

3. **Helper Subagents** (Haiku) - Task-scoped
   - testing-runner, workflow-status-check, handoff agents
   - Minimal permissions for mechanical tasks

## Key Decisions
- Permission inheritance reduces configuration duplication
- Template approach allows per-project customization
- Strategic/Tactical/Helper tiers align with agent responsibility levels

## Release Info
- Version: 3.7.0
- Branch: feat/4-4-agent-scopes
- PR: #23
- Released: 2025-12-29

## Additional Fixes in Release
- deploy.sh and release.sh PROJECT_ROOT detection for dogfooding setup
- DOGFOODING.md documentation explaining dual-path architecture
