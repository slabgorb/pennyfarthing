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

*Add decisions made during architecture work below*
