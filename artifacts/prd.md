---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
status: completed
completedAt: '2026-01-21'
inputDocuments: []
documentCounts:
  briefs: 0
  research: 1
  brainstorming: 0
  projectDocs: 37
workflowType: 'prd'
mode: 'create'
startedAt: '2026-01-21'
classification:
  projectType: developer_tool
  domain: general
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document: Pennyfarthing VS Code Extension UI

**Author:** Jedi
**Date:** 2026-01-21
**Project Type:** Developer Tool (VS Code Extension)
**Context:** Brownfield - enhancing existing extension

---

## Executive Summary

Bring the Pennyfarthing agent experience to VS Code by replicating essential Cyclist UI components while leveraging native VS Code features where superior.

---

## Project Classification

| Attribute | Value |
|-----------|-------|
| Project Type | Developer Tool (VS Code Extension) |
| Domain | General (Developer Tooling) |
| Complexity | Medium |
| Context | Brownfield - backend working, UI needs implementation |

---

## Current State

**Working:**
- Backend connections (Claude CLI, WheelHub WebSocket, file watchers)
- Chat participant (@pennyfarthing) in VS Code Chat API
- Story/sprint status via file watcher

**Not Working:**
- Status bar items (empty)
- Sidebar presentation (not to spec)
- Persona card with portrait (not implemented)
- Gearshift mode switcher (not visible)
- Context meter (not visible)

---

## Feature Mapping: Cyclist → VS Code

| Cyclist Feature | VS Code Approach | Rationale |
|-----------------|------------------|-----------|
| CHANGED/DIFFS tabs | **Omit** | VS Code Source Control |
| MESSAGE/conversation | **Adapt** | VS Code Chat API ✓ Done |
| SETTINGS tab | **Omit** | VS Code Settings UI |
| Persona Card + Portrait | **Replicate** | Core identity - Webview |
| Story/Sprint Status | **Adapt** | Sidebar tree ✓ Has file watcher |
| Branch Status | **Omit** | VS Code status bar |
| Tasks/Background Tasks | **Adapt** | Tree view |
| Gearshift | **Replicate** | Status bar item |
| Context meter | **Replicate** | Status bar item |
| Rich text toolbar | **Omit** | Plain text sufficient |

---

## Scope

### In Scope

1. **Status Bar Items**
   - Context meter (tokens used, percentage)
   - Gearshift mode (PLAN/MANUAL/ACCEPT/TURBO)
   - Current model indicator (OPUS 4-5)

2. **Sidebar Panel**
   - Persona card with portrait image
   - Agent name, role, theme
   - Story/sprint status (file watcher exists)
   - Workflow progress

### Out of Scope

- Rich text/markdown input toolbar
- Changed files panel (use VS Code Source Control)
- Diffs panel (use VS Code diff viewer)
- Settings panel (use VS Code Settings)

---

## Success Criteria

### User Success

- **Glanceable Status:** User can see context level, current mode, and model without clicking anything
- **Agent Connection:** Persona card creates emotional connection - portrait loads instantly, name is prominent, theme is visible
- **Workflow Awareness:** Sprint/story status visible without switching windows
- **Native Feel:** Experience feels like Cyclist, but native to VS Code

### Technical Success

- **Single Source of Truth:** WheelHub is the sole source for all UI state (context, agent, mode, story)
- **Extension as Thin Client:** Extension renders what WheelHub broadcasts, does not manage independent state
- **Fast Activation:** Extension activates in < 2 seconds with all UI elements populated
- **Portrait Coverage:** Persona portraits load correctly for all 102 themes

### Architecture Principle

> The extension should be a thin UI client to WheelHub, not an independent state manager. WheelHub already knows context level, current agent, story status. The extension renders what WheelHub broadcasts.

### Measurable Outcomes

| Metric | Target |
|--------|--------|
| Activation time | < 2 seconds |
| Status bar update latency | < 1 second from WheelHub event |
| Portrait load success | 100% of 102 themes |
| Connection sources | 1 (WheelHub only for UI state) |

---

## Product Scope

### MVP - Minimum Viable Product

1. **Status Bar Items** (from WheelHub)
   - Context meter showing tokens and percentage
   - Gearshift mode indicator (PLAN/MANUAL/ACCEPT/TURBO)
   - Current model indicator

2. **Persona Card** (Webview)
   - Portrait image from CDN
   - Agent name prominent
   - Theme indicator

3. **Story Status** (Tree View)
   - Current story/sprint info
   - Remaining/in-progress points

### Growth Features (Post-MVP)

- Workflow progress visualization
- Background tasks panel
- Quick-pick for skills/workflows (Ctrl+Shift+P integration)

### Vision (Future)

- Full Cyclist webview panel as optional "dashboard mode"
- Theme preview/switching from VS Code
- Multi-session support

---

## User Journeys

### Journey 1: Keith, the Daily Pennyfarthing User

**Situation:** Keith is a developer who uses Pennyfarthing through Cyclist daily. He's trying VS Code extension for the first time to get a more integrated experience.

**Opening Scene:** Keith opens VS Code on his Pennyfarthing project. He's used to glancing at Cyclist's sidebar to see Mon Mothma's portrait and the sprint status. He wonders if the VS Code extension will feel the same.

**Rising Action:**
- Extension activates - status bar populates: `CONTEXT: 54k (31%)` | `TURBO` | `OPUS 4-5`
- Sidebar shows Mon Mothma's portrait with "Star Wars" theme badge
- Story status shows: "No active story | 31 pts remaining | Feb 1"
- Keith opens @pennyfarthing chat and types "start work on the sidebar story"

**Climax:** Keith glances at the status bar during a long coding session and sees context climbing to 78%. He knows he'll need to handoff soon - no surprise context exhaustion.

**Resolution:** Keith works a full session without switching to Cyclist. The VS Code experience delivers the same awareness he had before, but without leaving his editor.

---

### Journey 2: Alex, the New Pennyfarthing User

**Situation:** Alex heard about Pennyfarthing and installed the VS Code extension. They've never used Cyclist.

**Opening Scene:** Alex installs the extension and opens a project. The sidebar shows "No Pennyfarthing project detected" with a helpful "Initialize Pennyfarthing" button.

**Rising Action:**
- Alex clicks initialize, extension creates `.pennyfarthing/` structure
- Welcome view explains agents: "SM manages stories, TEA writes tests, Dev implements..."
- Default theme loads - Alex sees their first agent persona in the sidebar

**Climax:** Alex types "@pennyfarthing help me start a new feature" and gets guided through the TDD workflow by the SM agent.

**Resolution:** Alex understands the agent system and can see workflow progress in the sidebar. The extension made Pennyfarthing approachable.

---

### Journey 3: Keith, Context Running Low

**Situation:** Keith is deep in a Dev session. Context is climbing.

**Opening Scene:** Keith is implementing a feature. Status bar shows `CONTEXT: 72%`. He's focused on code, not watching the meter.

**Rising Action:**
- Context hits 80% - status bar item changes color (yellow warning)
- Keith notices the color change while typing
- Context hits 90% - Gearshift blinks or shows alert indicator

**Climax:** Keith sees the warning, finishes his thought, and tells the agent "wrap up and prepare handoff to Reviewer"

**Resolution:** Smooth handoff occurs before context exhaustion. No lost work, no surprise truncation.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| Daily User | Status bar (context, mode, model), Persona card, Story status |
| New User | Welcome view, Initialize action, Agent explainer |
| Context Warning | Status bar color states, Visual alerts at thresholds |

---

## VS Code Extension Technical Requirements

### Project-Type Overview

This is a **VS Code Extension** that serves as a thin UI client to the WheelHub server. The extension renders state broadcast by WheelHub rather than managing its own state.

### VS Code API Surface

| API | Usage | Priority |
|-----|-------|----------|
| **Status Bar API** | Context meter, Gearshift mode, Model indicator | MVP |
| **Tree View API** | Story/sprint status, Skills list, Workflows | MVP |
| **Webview API** | Persona card with portrait | MVP |
| **Chat Participant API** | @pennyfarthing conversation | ✓ Done |
| **Commands API** | pennyfarthing.* commands | Exists |
| **Settings API** | Extension configuration | Exists |

### Data Flow Architecture

```
WheelHub Server (Single Source of Truth)
    │
    ├── WebSocket Channel: /context
    │   └── → Status Bar: Context meter
    │
    ├── WebSocket Channel: /agent
    │   └── → Sidebar Webview: Persona card
    │
    ├── WebSocket Channel: /gearshift
    │   └── → Status Bar: Mode indicator
    │
    └── WebSocket Channel: /story
        └── → Tree View: Sprint/story status
```

### Status Bar Items Specification

| Item | Format | Source | Update Trigger |
|------|--------|--------|----------------|
| Context Meter | `CONTEXT: 54k (31%)` | WheelHub /context | On each Claude turn |
| Gearshift Mode | `TURBO` / `ACCEPT` / `MANUAL` / `PLAN` | WheelHub /gearshift | On mode change |
| Model | `OPUS 4-5` | WheelHub /model | On session start |

**Color States for Context Meter:**
- Green (default): < 60%
- Yellow (warning): 60-80%
- Red (critical): > 80%

### Sidebar Panel Specification

**Persona Card (Webview):**
- Portrait image: Load from CDN `https://cdn.pennyfarthing.dev/portraits/{theme}/{agent}.png`
- Agent name: Large, prominent text
- Theme badge: Small indicator showing current theme
- Role badges: PM, O4, C5, etc. (optional, matches Cyclist)

**Story Status (Tree View):**
- Current story title or "No active story"
- Points: Remaining / In Progress
- Sprint end date
- Branch status with CLEAN/DIRTY indicator

### Installation Methods

| Method | Target |
|--------|--------|
| VS Code Marketplace | Primary distribution |
| VSIX sideload | Development/testing |
| Open VSX Registry | VS Code alternatives (optional) |

### Extension Commands

| Command | Description |
|---------|-------------|
| `pennyfarthing.activate` | Manually activate extension |
| `pennyfarthing.switchAgent` | Switch to different agent |
| `pennyfarthing.switchTheme` | Change persona theme |
| `pennyfarthing.showDashboard` | Open full Cyclist webview (future) |

### Implementation Considerations

1. **WheelHub Connection:** Extension connects to WheelHub on activation, subscribes to relevant channels
2. **Graceful Degradation:** If WheelHub unavailable, show "Connecting..." state, retry with backoff
3. **Portrait Caching:** Cache portrait images locally after first load
4. **Settings Sync:** Respect VS Code settings sync for extension preferences

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP - deliver the core awareness features that make Cyclist valuable, adapted for VS Code.

**Rationale:** Users need glanceable context awareness (context meter, mode, agent identity) to work effectively with Pennyfarthing. Everything else can wait.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Daily User: Full status bar awareness, persona visibility
- Context Warning: Color-coded alerts at thresholds

**Must-Have Capabilities:**

| Feature | Justification |
|---------|---------------|
| Context Meter (status bar) | Core value - prevents surprise context exhaustion |
| Gearshift Mode (status bar) | Shows current permission mode at a glance |
| Model Indicator (status bar) | Confirms which model is active |
| Persona Card (webview) | Emotional connection to agent, core identity |
| Story Status (tree view) | Sprint awareness, already has file watcher |

### Post-MVP Features

**Phase 2 (Growth):**
- Workflow progress visualization in sidebar
- Background tasks panel
- Quick-pick for skills/workflows (Ctrl+Shift+P)
- Welcome view with onboarding for new users

**Phase 3 (Vision):**
- Full Cyclist webview panel ("dashboard mode")
- Theme preview and switching from VS Code
- Multi-session support
- Initialize Pennyfarthing from extension

### Risk Mitigation Strategy

| Risk | Mitigation |
|------|------------|
| **Technical:** WheelHub connection reliability | Graceful degradation with "Connecting..." state, 2s fixed reconnect |
| **Technical:** Portrait loading for 102 themes | CDN with local caching, fallback to default portrait |
| **Resource:** Multiple VS Code APIs to learn | Incremental delivery - status bar first (simplest), then sidebar |
| **Scope:** Feature creep | Strict MVP boundaries - status bar + persona card only |

---

## Functional Requirements

### Status Bar Awareness

- **FR1:** User can view current context usage (tokens and percentage) in the VS Code status bar
- **FR2:** User can see context meter change color based on usage thresholds (green < 60%, yellow 60-80%, red > 80%)
- **FR3:** User can view current Gearshift mode (PLAN/MANUAL/ACCEPT/TURBO) in the status bar
- **FR4:** User can view current Claude model (e.g., OPUS 4-5) in the status bar
- **FR5:** Status bar items update automatically when WheelHub broadcasts state changes

### Agent Identity

- **FR6:** User can view the current agent's persona portrait in the sidebar
- **FR7:** User can view the current agent's character name prominently displayed
- **FR8:** User can view the current theme name/badge alongside the agent
- **FR9:** Persona card updates automatically when agent changes (via WheelHub)
- **FR10:** Persona portraits load for all 102 available themes

### Sprint & Story Status

- **FR11:** User can view current story title or "No active story" indicator
- **FR12:** User can view remaining points and in-progress points for the sprint
- **FR13:** User can view sprint end date
- **FR14:** User can view current branch status (CLEAN/DIRTY indicator)
- **FR15:** Story status updates automatically via file watcher when session files change

### WheelHub Integration

- **FR16:** Extension connects to WheelHub WebSocket on activation
- **FR17:** Extension subscribes to relevant WheelHub channels (/context, /agent, /gearshift, /story)
- **FR18:** Extension displays "Connecting..." state when WheelHub is unavailable
- **FR19:** Extension automatically reconnects to WheelHub with retry logic

### Chat Integration (Existing)

- **FR20:** User can invoke Pennyfarthing via @pennyfarthing in VS Code Chat
- **FR21:** User can use slash commands (/sm, /tea, /dev, /reviewer) in chat

---

## Non-Functional Requirements

### Performance

- **NFR1:** Status bar items update within 1 second of WheelHub event
- **NFR2:** Extension activates and displays initial state within 2 seconds
- **NFR3:** Persona portrait loads within 1 second (cached after first load)
- **NFR4:** Color state changes (context thresholds) apply immediately without flicker

### Integration

- **NFR5:** Extension connects to WheelHub within 2 seconds of activation
- **NFR6:** Extension retries WheelHub connection with 2-second fixed interval on failure
- **NFR7:** Extension gracefully degrades to "Connecting..." state when WheelHub unavailable
- **NFR8:** File watcher detects session changes within 500ms

### Reliability

- **NFR9:** Extension handles WheelHub disconnection without crashing VS Code
- **NFR10:** Extension recovers automatically when WheelHub becomes available
- **NFR11:** Portrait loading failures fall back to default image without error
