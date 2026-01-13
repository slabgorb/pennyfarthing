# Story 33-2: /permissions Skill - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 33 - Runtime Permission Management |
| Points | 2 |
| Priority | P0 |
| Repos | pennyfarthing |
| Depends On | 33-1 (Permission Request Protocol) - DONE |

## Current State

Story 33-1 established the foundation:
- `PermissionRequest` interface - tool, reason, scope, grant_type
- `PermissionGrant` interface - tool, scope, grant_type, granted_at, uses_remaining?
- `GrantType` - 'once' | 'session' | 'always'
- `validatePermissionRequest()` - multi-error validation
- `createGrant()` - factory with ISO timestamp

These types export from `@pennyfarthing/core`. The protocol is documented in `pennyfarthing-dist/guides/permission-protocol.md`.

## Technical Approach

Create a skill that provides CLI commands for permission management. Skills in Pennyfarthing are markdown files with YAML frontmatter that define commands and behavior.

**Storage:** Active grants stored in `.claude/settings.local.json` under a `permissions.grants` key (array of `PermissionGrant` objects).

**Commands:**
1. `/permissions` - List all active grants in table format
2. `/permissions grant <tool> "<scope>"` - Add a grant (default: session)
3. `/permissions revoke <tool>` - Remove all grants for a tool
4. `/permissions show <tool>` - Detailed view of grants for a tool

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `pennyfarthing-dist/skills/permissions/skill.md` | CREATE | Skill definition and documentation |
| `pennyfarthing-dist/skills/skill-registry.yaml` | MODIFY | Register new skill for discovery |

## Acceptance Criteria

- [ ] AC1: `/permissions` lists active grants with tool, scope, type, and when granted
- [ ] AC2: `/permissions grant <tool> "<scope>"` adds a permission grant
- [ ] AC3: `/permissions revoke <tool>` removes grants for a tool
- [ ] AC4: Skill registered in skill-registry.yaml and discoverable

## Testing Strategy

Test the skill by:
1. Verifying skill.md has valid YAML frontmatter
2. Checking all commands are documented with examples
3. Verifying registry entry has required fields
4. Manual invocation to confirm skill loads

## Dependencies & Risks

**Dependencies:**
- 33-1 schema types (available via `@pennyfarthing/core`)
- Existing skill structure (`pennyfarthing-dist/skills/theme/skill.md` as template)

**Risks:**
- LOW: Settings.local.json may not exist - skill should handle gracefully
- LOW: Grant expiry logic for 'once' type needs clear documentation

## Implementation Notes

Follow the pattern from `/theme` skill:
- YAML frontmatter with name, description
- Quick reference table
- Detailed command sections with examples
- Clear error handling guidance
