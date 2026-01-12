# Story 30-1: Multi-account Claude Code setup guide - Technical Context

## Story Overview
- **Epic:** 30 (Developer Workflow Documentation)
- **Points:** 2
- **Priority:** P3
- **Repos:** pennyfarthing
- **Type:** Documentation

## Problem Statement

Claude Code stores all configuration and data in `~/.claude` regardless of which Claude account is being used. Developers who have multiple Claude Max Pro accounts (personal + work, or multiple clients) need a way to:
- Keep data separate between accounts
- Switch contexts cleanly
- Track usage per account

## Solution Approach

A symlink-based switching system:
1. Create separate directories for each account (e.g., `~/.claude-personal`, `~/.claude-work`)
2. Use `~/.claude` as a symlink pointing to the active account's directory
3. Shell functions to switch the symlink target
4. Conditional startup messages to show which account is active

## Documentation Scope

### Sections to Write

1. **Introduction & Problem**
   - Why multi-account support matters
   - Current limitation in Claude Code

2. **Setup Instructions**
   - Directory structure creation
   - Initial symlink setup
   - Shell function code for `~/.zshrc`

3. **Shell Functions**
   ```bash
   # Example structure (tech writer to refine):
   claude-personal() { ... }
   claude-work() { ... }
   claude-which() { ... }
   ```

4. **Daily Workflow**
   - Switching accounts
   - Verifying active account
   - Starting Claude Code

5. **Usage Tracking with ccusage**
   - Running reports per account
   - Understanding the output

6. **Conditional Startup Message**
   - How to show which account is active on shell startup
   - Only show for users who have this configured

## Acceptance Criteria

- [ ] Guide covers problem and solution clearly
- [ ] Shell setup code provided and explained
- [ ] Daily workflow documented step-by-step
- [ ] ccusage per-account usage documented
- [ ] Conditional startup logic explained

## Output Location

Create documentation in an appropriate location within the pennyfarthing repo. Consider:
- `docs/guides/multi-account-setup.md`
- Or integrate into existing developer documentation

## Notes for Tech Writer

- This is a power-user guide - assume readers are comfortable with shell configuration
- Provide copy-paste-ready code blocks
- Include troubleshooting tips for common issues
- Keep it practical and concise
