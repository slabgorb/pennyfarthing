# Architect Agent Decisions

> Pennyfarthing-specific architecture decisions

## Decision Log

### ADR-001: Cyclist Settings & TDD Flow Integration

**Date:** 2026-01-04
**Status:** Accepted
**Author:** Will Bailey (Architect)

#### Context

Cyclist provides a visual wrapper around Claude Code with sidebar showing persona, stats, story, and git status. As integration with Pennyfarthing deepens, we need:
1. A settings system for user preferences (auto-handoff, display options)
2. TDD flow awareness so users understand where they are in the SM→TEA→Dev→Reviewer cycle

#### Decision

**Settings Storage: Hybrid File-Based**
- User defaults: `~/.cyclist/settings.yaml`
- Project overrides: `{project}/.claude/cyclist.local.yaml` (gitignored)
- Merge behavior: project settings override user defaults (shallow merge per section)
- The `.local.yaml` suffix follows Pennyfarthing's existing convention

**Settings UI: Electron Modal**
- Access via menu: `Cyclist > Settings` or `⌘,`
- Simple checkbox/toggle form
- Shows where settings are saved
- File watchers enable live reload if edited externally

**TDD Flow Display: Minimal Inline**
- Simple text: `Phase: Dev → Reviewer`
- Shows current phase and next agent only
- No elaborate visualization (kanban, rings, etc.)
- Derived from `.session/*-session.md` phase field

**Settings Schema:**
```yaml
workflow:
  auto_handoff: false        # Auto-trigger next agent when phase completes
  handoff_confirm: true      # Show confirmation dialog before handoff

display:
  show_flow: true            # Show current phase + next agent
  show_ocean: false          # Show OCEAN bars in persona section
  sidebar_width: 300         # Pixel width

notifications:
  phase_change: true         # Desktop notification on agent change
  sound: false               # Audio feedback
```

#### Consequences

**Positive:**
- Settings persist across sessions and are human-editable
- Project teams can share base settings while individuals customize
- Simple flow indicator reduces cognitive load without UI complexity
- Follows existing Pennyfarthing patterns (`.local.yaml` convention)

**Negative:**
- Two config file locations to maintain
- No cloud sync of settings (acceptable for dev tool)

#### Implementation Guidance

See: `~/.claude/plans/cyclist-settings-flow.md`

---

### ADR-002: Merge Cyclist into Pennyfarthing Monorepo

**Date:** 2026-01-07
**Status:** Accepted
**Author:** Mimir (Architect)

#### Context

Cyclist (Electron GUI) cannot find portrait assets when running against Pennyfarthing in dogfooding mode due to hardcoded `node_modules/pennyfarthing/...` path resolution. Analysis revealed complete functional coupling - Cyclist has zero standalone value without Pennyfarthing.

#### Decision

Merge Cyclist into Pennyfarthing as a **pnpm workspace monorepo** with three packages:
- `@pennyfarthing/core` - CLI framework (~5MB, lean)
- `@pennyfarthing/cyclist` - Electron GUI (~200MB, optional)
- `@pennyfarthing/shared` - Path resolution, theme loading utilities

Key design: Smart portrait resolution that checks monorepo root first (dogfooding), then npm package locations (production).

#### Consequences

**Positive:**
- Portrait resolution works in all scenarios (dogfooding, npm install, Electron app)
- Single repo enables atomic commits and coordinated releases
- Electron deps are conditional - CLI-only users get lean install
- Follows Pennyfarthing's "single source of truth" principle

**Negative:**
- Requires pnpm for workspace protocol
- One-time migration effort (4 phases)
- Larger clone includes both packages

#### Implementation Guidance

See: `~/.claude/plans/snuggly-bouncing-forest.md`

---

### ADR-003: Command & Skill Expansion Strategy

**Date:** 2026-01-09
**Status:** Accepted
**Author:** Milo Minderbinder (Architect)

#### Context

Analysis of Anthropic's official skills repository (16 skills) and community Claude Code commands revealed gaps in Pennyfarthing's tooling. Question: Should we add a new "skills layer" or use the existing pattern?

#### Decision

**No new layer needed.** The existing command/skill separation is sufficient:
- **Commands** = Workflow steps (do X, then Y)
- **Skills** = Reference documentation (how X works)

**Priority implementation order:**
1. `/check` - Pre-commit quality gate (3 pts)
2. `/prime` - Context loading at agent activation (2 pts)
3. `mermaid` skill - Diagram reference docs (2 pts)
4. `/run-ci` - Thin CI wrapper (2 pts)
5. `changelog` skill - Release enhancement (1 pt)

**Key integration:** `/check` runs AUTOMATICALLY in dev-handoff subagent.

#### Consequences

**Positive:**
- Leverages existing patterns, no architectural changes
- `/check` prevents broken code reaching reviewer
- `/prime` reduces agent cold-start overhead

**Negative:**
- 10 story points of new work (Epic 21)
- `/run-ci` may need `act` dependency for GitHub Actions

#### Implementation Guidance

See: `~/.claude/plans/cached-percolating-dolphin.md`

---

*Add decisions made during architecture work below*
