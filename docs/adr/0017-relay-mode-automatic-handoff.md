# ADR-0017: Relay Mode (Automatic Agent Handoff)

**Status:** Accepted
**Date:** 2026-01-28
**Author:** Architect (Naomi Nagata)

## Context

Pennyfarthing's multi-agent workflows (TDD, BDD, trivial) involve handoffs between agents: SM → TEA → Dev → Reviewer → SM. Each handoff emits a `<!-- CYCLIST:HANDOFF:/agent -->` marker that Cyclist detects and displays as a "Continue with /agent" button.

**Original behavior:** Users manually clicked the handoff button to proceed to the next agent.

**User request:** For trusted workflows, automatically execute handoffs without requiring manual confirmation.

**Original implementation:** A single "turbo mode" that combined auto-accept permissions with auto-handoff. Users couldn't have one without the other.

## Decision

Split auto-handoff into a separate **relay_mode** setting, orthogonal to permission_mode. This allows any combination:

| permission_mode | relay_mode | Behavior |
|-----------------|------------|----------|
| `plan` | `false` | Confirm everything, manual handoff |
| `plan` | `true` | Confirm everything, auto handoff |
| `manual` | `false` | Confirm dangerous ops, manual handoff |
| `manual` | `true` | Confirm dangerous ops, auto handoff |
| `accept` | `false` | Auto-accept all, manual handoff |
| `accept` | `true` | Auto-accept all, auto handoff (= old turbo) |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cyclist UI                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Mode Switch (3 segments)                     │   │
│  │         [PLAN]  [MANUAL]  [ACCEPT]                        │   │
│  │                                                           │   │
│  │              Relay Toggle (separate)                      │   │
│  │         [🔄 Auto-handoff: ON/OFF]                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    settings.ts                            │   │
│  │                                                           │   │
│  │  workflow: {                                              │   │
│  │    permission_mode: 'manual',  // plan | manual | accept  │   │
│  │    relay_mode: true,           // true | false            │   │
│  │  }                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              quick-actions.js                             │   │
│  │                                                           │   │
│  │  On HANDOFF marker detected:                              │   │
│  │    if (relay_mode) {                                      │   │
│  │      autoExecuteHandoff(marker.value)  // e.g., "/dev"    │   │
│  │    } else {                                               │   │
│  │      showHandoffButton(marker.value)   // User clicks     │   │
│  │    }                                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Configuration

Stored in `.pennyfarthing/config.local.yaml`:

```yaml
theme: the-expanse
workflow:
  permission_mode: manual  # plan | manual | accept
  relay_mode: true         # Automatic handoff execution
  bell_mode: false         # Message queue injection (separate)
```

### Migration from Legacy Settings

Old configurations are automatically migrated:

| Old Format | New Format |
|------------|------------|
| `permission_mode: 'turbo'` | `permission_mode: 'accept'` + `relay_mode: true` |
| `handoff_mode: 'auto'` | `relay_mode: true` |
| `handoff_mode: 'manual'` | `relay_mode: false` |
| `auto_handoff: true` | `relay_mode: true` |
| `auto_handoff: false` | `relay_mode: false` |

Migration happens transparently in `migrateSettings()`.

### Marker Detection Flow

```
Agent output contains: <!-- CYCLIST:HANDOFF:/dev -->
                              │
                              ▼
              quick-actions.js detects marker
                              │
                              ▼
                    ┌─────────────────┐
                    │  relay_mode?    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
         relay_mode: true             relay_mode: false
              │                             │
              ▼                             ▼
    Auto-execute "/dev"           Show "Continue with /dev"
    (inject into terminal)              button
              │                             │
              ▼                             ▼
    Next agent activates          User clicks → activates
```

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/settings` | GET | Returns current `workflow.relay_mode` |
| `/api/settings` | PATCH | Update `workflow.relay_mode` |

### UI Controls

**Mode switch segment:** Three buttons for permission_mode (PLAN/MANUAL/ACCEPT)

**Relay toggle:** Separate toggle button with relay icon
- Tooltip: "Auto-handoff: When enabled, agent handoffs execute automatically"
- Visual state: Highlighted when enabled

**Why separate controls?**
- Orthogonal concerns deserve orthogonal controls
- Users can adjust one without affecting the other
- Clearer mental model than "turbo mode"

## Consequences

### Positive

- **Flexibility** - Any combination of permission + handoff behavior
- **Clearer semantics** - "relay" describes the behavior (passing the baton)
- **Backward compatible** - Old configs migrate automatically
- **Simpler UI** - No confusing "turbo" mode that combines unrelated things

### Negative

- **Two settings to manage** - Instead of one "turbo" toggle
- **Migration complexity** - Must handle four legacy formats
- **Documentation** - Need to explain the separation

### Neutral

- **Naming** - "relay_mode" chosen over "auto_handoff" for consistency with cycling theme
- **Default** - `relay_mode: false` to preserve manual control by default

## Alternatives Considered

### 1. Keep Turbo Mode

Single setting that enables both auto-accept and auto-handoff.

**Rejected:** Users wanted auto-handoff with manual permissions (trust the workflow, review the tools).

### 2. Three-State Handoff Setting

`handoff_mode: 'auto' | 'confirm' | 'manual'`

**Rejected:** Boolean is simpler; "confirm" vs "manual" distinction wasn't needed.

### 3. Per-Workflow Relay Setting

Allow relay_mode per workflow type.

**Rejected:** Adds complexity. Users can toggle relay_mode when switching workflows if needed.

### 4. Named Presets

`workflow_preset: 'cautious' | 'balanced' | 'turbo'`

**Considered:** Could simplify UI. Decided against because:
- Hides the actual settings
- Users still need to understand what each preset does
- Custom combinations require "advanced" mode

## References

- Implementation: `packages/cyclist/src/settings.ts`
- UI controls: `packages/cyclist/src/public/js/controls.js`
- Marker handling: `packages/cyclist/src/public/js/components/message-view/quick-actions.js`
- Tests: `packages/cyclist/tests/MSSCI-12395-relay-toggle.test.ts`
- Story: MSSCI-12395 (Relay mode separation from turbo)
- ADR-0011: Reflector Marker Consolidation (HANDOFF marker format)
