# Reflector

> **Deprecated.** The Reflector marker protocol is removed. This guide is parked for reference only. Do not use these markers in new integrations.

<info>
Agent-to-UI communication protocol. Agents embed HTML comment markers (`<!-- PF:TYPE:value -->`) in their output; BikeRack GUI detects them and renders interactive UI elements (buttons, choices, auto-handoffs).
</info>

<critical>
**Every agent turn MUST end with a reflector marker.** The stop hook (`question_reflector_check.py`) enforces this in BikeRack GUI mode. Turns without markers are blocked.
</critical>

## Marker Types

| Type | Format | UI Action |
|------|--------|-----------|
| `HANDOFF` | `<!-- PF:HANDOFF:/agent -->` | "Continue with /agent" button (auto-executes in relay mode) |
| `CONTEXT_CLEAR` | `<!-- PF:CONTEXT_CLEAR:/agent -->` | TirePump: clears context, reloads next agent |
| `INVOKE` | `<!-- PF:INVOKE:/agent -->` | Auto-executes immediately (no button shown) |
| `QUESTION:yesno` | `<!-- PF:QUESTION:yesno -->` | "Yes" / "No" buttons |
| `QUESTION:open` | `<!-- PF:QUESTION:open -->` | Pre-fills editor for open-ended response |
| `CHOICES` | `<!-- PF:CHOICES:a,b,c -->` | Numbered choice buttons (extracts labels from message) |
| `CONTINUE` | `<!-- PF:CONTINUE -->` | "Continue" button |

## Detection

```
Marker pattern: /<!--\s*PF:(\w+)(?::([^>]+?))?\s*-->/gi
```

- Markers inside code blocks (triple-backtick) are **ignored** — stripped before detection
- Case-insensitive for prefix and type, case-preserved for value
- Choice labels extracted from message content (`1. Option`, `1) Option`, `**1.** Option`)

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/shared/marker/detect.ts` | `detectMarkers()` — parses markers from text |
| `packages/core/src/shared/marker/strip.ts` | `stripMarkers()`, `stripCodeBlocks()` |
| `packages/core/src/shared/marker/types.ts` | `MarkerType`, `Marker` interface |
| `packages/core/src/shared/marker/constants.ts` | `MARKER_PATTERN`, `MARKER_TYPES` |
| `packages/cyclist/src/public/components/QuickActions.tsx` | Renders action buttons from detected markers |
| `packages/cyclist/src/public/hooks/useMarkerActions.ts` | Detects markers, builds action metadata |
| `pennyfarthing-dist/scripts/hooks/question_reflector_check.py` | Stop hook — enforces marker presence |
| `pf hooks reflector-check` | CLI entry point for stop hook |

## Enforcement Hook

The stop hook (`question_reflector_check.py`) runs at end of every agent turn in BikeRack GUI mode:

1. Skips if not in BikeRack GUI mode
2. Detects questions (direct `?`, implicit "would you like", choice-offering)
3. Detects handoff phrases ("handing off to...", "passing to...")
4. Validates Task tool usage if handoff language found
5. **Blocks turns without any valid reflector marker** — provides guidance on which marker to add

<info>
**ADR:** `docs/adr/0011-reflector-marker-consolidation.md`
</info>
