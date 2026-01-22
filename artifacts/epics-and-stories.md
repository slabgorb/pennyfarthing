---
stepsCompleted:
  - step-01-requirements
  - step-02-epic-design
  - step-03-create-stories
  - step-04-final-validation
status: completed
completedAt: '2026-01-21'
inputDocuments:
  - artifacts/prd.md
---

# Pennyfarthing VS Code Extension - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Pennyfarthing VS Code Extension, decomposing the requirements from the PRD into implementable stories.

## Requirements Inventory

### Functional Requirements

**Status Bar Awareness**
- FR1: User can view current context usage (tokens and percentage) in the VS Code status bar
- FR2: User can see context meter change color based on usage thresholds (green < 60%, yellow 60-80%, red > 80%)
- FR3: User can view current Gearshift mode (PLAN/MANUAL/ACCEPT/TURBO) in the status bar
- FR4: User can view current Claude model (e.g., OPUS 4-5) in the status bar
- FR5: Status bar items update automatically when WheelHub broadcasts state changes

**Agent Identity**
- FR6: User can view the current agent's persona portrait in the sidebar
- FR7: User can view the current agent's character name prominently displayed
- FR8: User can view the current theme name/badge alongside the agent
- FR9: Persona card updates automatically when agent changes (via WheelHub)
- FR10: Persona portraits load for all 102 available themes

**Sprint & Story Status**
- FR11: User can view current story title or "No active story" indicator
- FR12: User can view remaining points and in-progress points for the sprint
- FR13: User can view sprint end date
- FR14: User can view current branch status (CLEAN/DIRTY indicator)
- FR15: Story status updates automatically via file watcher when session files change

**WheelHub Integration**
- FR16: Extension connects to WheelHub WebSocket on activation
- FR17: Extension subscribes to relevant WheelHub channels (/context, /agent, /gearshift, /story)
- FR18: Extension displays "Connecting..." state when WheelHub is unavailable
- FR19: Extension automatically reconnects to WheelHub with retry logic

**Chat Integration**
- FR20: User can invoke Pennyfarthing via @pf in VS Code Chat
- FR21: User can use all Pennyfarthing slash commands (agents, skills, workflows) in chat via @pf

### NonFunctional Requirements

**Performance**
- NFR1: Status bar items update within 1 second of WheelHub event
- NFR2: Extension activates and displays initial state within 2 seconds
- NFR3: Persona portrait loads within 1 second (cached after first load)
- NFR4: Color state changes (context thresholds) apply immediately without flicker

**Integration**
- NFR5: Extension connects to WheelHub within 2 seconds of activation
- NFR6: Extension retries WheelHub connection with 2-second fixed interval on failure
- NFR7: Extension gracefully degrades to "Connecting..." state when WheelHub unavailable
- NFR8: File watcher detects session changes within 500ms

**Reliability**
- NFR9: Extension handles WheelHub disconnection without crashing VS Code
- NFR10: Extension recovers automatically when WheelHub becomes available
- NFR11: Portrait loading failures fall back to default image without error

### Additional Requirements

**Architecture Principles**
- Extension is a thin UI client to WheelHub - no independent state management
- WheelHub is the single source of truth for all UI state

**Portrait System**
- CDN URL pattern: `https://cdn.pennyfarthing.dev/portraits/{theme}/{agent}.png`
- Must support all 102 themes
- Cache portraits locally after first load
- Fallback to default portrait on load failure

**Graceful Degradation**
- Show "Connecting..." state when WheelHub unavailable
- Use 2-second fixed reconnect interval

**VS Code APIs Required**
- Status Bar API (context meter, gearshift, model)
- Tree View API (story/sprint status)
- Webview API (persona card with portrait)
- Chat Participant API (@pf conversation)
- Commands API (pennyfarthing.* commands)
- Settings API (extension configuration)

**Extension Commands**
- `pennyfarthing.activate` - Manually activate extension
- `pennyfarthing.switchAgent` - Switch to different agent
- `pennyfarthing.switchTheme` - Change persona theme
- `pennyfarthing.showDashboard` - Open full Cyclist webview (future)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 56 | Context usage in status bar |
| FR2 | Epic 56 | Context meter color thresholds |
| FR3 | Epic 56 | Gearshift mode in status bar |
| FR4 | Epic 56 | Model indicator in status bar |
| FR5 | Epic 56 | Auto-update from WheelHub |
| FR6 | Epic 57 | Persona portrait in sidebar |
| FR7 | Epic 57 | Agent character name display |
| FR8 | Epic 57 | Theme name/badge display |
| FR9 | Epic 57 | Auto-update on agent change |
| FR10 | Epic 57 | Support 102 themes |
| FR11 | Epic 58 | Story title display |
| FR12 | Epic 58 | Sprint points display |
| FR13 | Epic 58 | Sprint end date display |
| FR14 | Epic 58 | Branch status indicator |
| FR15 | Epic 58 | File watcher updates |
| FR16 | Epic 56 | WheelHub WebSocket connection |
| FR17 | Epic 56 | Channel subscriptions |
| FR18 | Epic 56 | "Connecting..." state |
| FR19 | Epic 56 | Auto-reconnect logic |
| FR20 | Epic 59 | @pf chat participant |
| FR21 | Epic 59 | All slash commands in chat |

## Epic List

### Epic 56: Glanceable Status Awareness
Users can monitor their Pennyfarthing session at a glance without clicking anything - context level, permission mode, and active model are always visible in the status bar. Includes WheelHub connection infrastructure.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR16, FR17, FR18, FR19

### Epic 57: Agent Identity & Emotional Connection
Users can see and connect with their current agent persona - portrait, name, and theme visible in the sidebar, creating the emotional connection that makes Pennyfarthing engaging.

**FRs covered:** FR6, FR7, FR8, FR9, FR10

### Epic 58: Sprint & Story Awareness
Users can see their current story, sprint status, and branch health without leaving VS Code - full workflow awareness via the sidebar tree view.

**FRs covered:** FR11, FR12, FR13, FR14, FR15

### Epic 59: Chat Integration
Users can invoke Pennyfarthing agents and all slash commands directly from VS Code Chat using @pf.

**FRs covered:** FR20, FR21

---

## Epic 56: Glanceable Status Awareness

Users can monitor their Pennyfarthing session at a glance without clicking anything - context level, permission mode, and active model are always visible in the status bar.

### Story 59.1: WheelHub Connection Infrastructure

As a VS Code user,
I want the extension to automatically connect to WheelHub on activation,
So that I receive real-time updates about my Pennyfarthing session.

**Acceptance Criteria:**

**Given** VS Code opens a Pennyfarthing project
**When** the extension activates
**Then** it establishes a WebSocket connection to WheelHub within 2 seconds
**And** subscribes to /context, /agent, /gearshift, and /story channels

**Given** WheelHub is not running or unavailable
**When** the extension attempts to connect
**Then** it displays "Connecting..." in the status bar
**And** retries the connection every 2 seconds

**Given** WheelHub disconnects unexpectedly
**When** the connection drops
**Then** the extension does not crash VS Code
**And** automatically attempts to reconnect with 2-second intervals
**And** recovers state when WheelHub becomes available

**FRs:** FR16, FR17, FR18, FR19 | **NFRs:** NFR5, NFR6, NFR7, NFR9, NFR10

---

### Story 59.2: Context Meter Status Bar Item

As a VS Code user,
I want to see my current context usage in the status bar,
So that I know when I'm approaching context limits and can plan handoffs.

**Acceptance Criteria:**

**Given** the extension is connected to WheelHub
**When** WheelHub broadcasts context data on /context channel
**Then** the status bar displays format: `CONTEXT: 54k (31%)`
**And** updates within 1 second of receiving the event

**Given** context usage is below 60%
**When** displaying the context meter
**Then** the status bar item shows green (default) color

**Given** context usage is between 60% and 80%
**When** displaying the context meter
**Then** the status bar item shows yellow (warning) color

**Given** context usage is above 80%
**When** displaying the context meter
**Then** the status bar item shows red (critical) color

**Given** color thresholds change
**When** context crosses a threshold boundary
**Then** the color updates immediately without flicker

**FRs:** FR1, FR2, FR5 | **NFRs:** NFR1, NFR4

---

### Story 59.3: Gearshift Mode Status Bar Item

As a VS Code user,
I want to see the current permission mode in the status bar,
So that I know what level of autonomy the agent currently has.

**Acceptance Criteria:**

**Given** the extension is connected to WheelHub
**When** WheelHub broadcasts mode data on /gearshift channel
**Then** the status bar displays one of: `PLAN`, `MANUAL`, `ACCEPT`, or `TURBO`
**And** updates within 1 second of receiving the event

**Given** the gearshift mode changes
**When** the user or system changes the mode
**Then** the status bar item updates to reflect the new mode immediately

**FRs:** FR3, FR5 | **NFRs:** NFR1

---

### Story 59.4: Model Indicator Status Bar Item

As a VS Code user,
I want to see which Claude model is active in the status bar,
So that I know the capabilities of my current session.

**Acceptance Criteria:**

**Given** the extension is connected to WheelHub
**When** WheelHub broadcasts model data on /model channel
**Then** the status bar displays the model identifier (e.g., `OPUS 4-5`)
**And** updates within 1 second of receiving the event

**Given** a new session starts with a different model
**When** the model information is broadcast
**Then** the status bar item updates to show the new model

**FRs:** FR4, FR5 | **NFRs:** NFR1

---

## Epic 57: Agent Identity & Emotional Connection

Users can see and connect with their current agent persona - portrait, name, and theme visible in the sidebar, creating the emotional connection that makes Pennyfarthing engaging.

### Story 59.1: Persona Card Webview

As a VS Code user,
I want to see the current agent's persona in a sidebar panel,
So that I feel connected to who I'm working with and can identify the agent at a glance.

**Acceptance Criteria:**

**Given** the extension is activated in a Pennyfarthing project
**When** the sidebar panel is visible
**Then** it displays a webview with the agent's portrait image
**And** the agent's character name is prominently displayed below the portrait
**And** the current theme name appears as a badge or indicator

**Given** the sidebar panel loads
**When** agent data is available from WheelHub
**Then** the persona card populates within 2 seconds of extension activation

**FRs:** FR6, FR7, FR8 | **NFRs:** NFR2

---

### Story 59.2: Portrait Loading with Caching

As a VS Code user,
I want portraits to load quickly and reliably,
So that I always see the agent's face without delays or broken images.

**Acceptance Criteria:**

**Given** an agent is active with a known theme
**When** the persona card needs to display the portrait
**Then** it loads from CDN: `https://cdn.pennyfarthing.dev/portraits/{theme}/{agent}.png`
**And** the portrait loads within 1 second

**Given** a portrait has been loaded previously
**When** the same portrait is needed again
**Then** it loads from local cache instead of CDN

**Given** a portrait fails to load from CDN
**When** the load error occurs
**Then** a default fallback portrait is displayed
**And** no error is shown to the user

**Given** any of the 102 available themes
**When** an agent from that theme is active
**Then** the correct portrait loads successfully

**FRs:** FR10 | **NFRs:** NFR3, NFR11

---

### Story 59.3: Real-time Agent Updates

As a VS Code user,
I want the persona card to update when the agent changes,
So that I always know who I'm currently working with.

**Acceptance Criteria:**

**Given** the extension is connected to WheelHub
**When** WheelHub broadcasts a new agent on /agent channel
**Then** the persona card updates to show the new agent's portrait
**And** the character name updates to the new agent
**And** the theme badge updates if the theme changed

**Given** an agent handoff occurs (e.g., SM → TEA)
**When** the new agent takes over
**Then** the persona card reflects the change within 1 second

**FRs:** FR9 | **NFRs:** NFR1

---

## Epic 58: Sprint & Story Awareness

Users can see their current story, sprint status, and branch health without leaving VS Code - full workflow awareness via the sidebar tree view.

### Story 59.1: Story Status Tree View

As a VS Code user,
I want to see the current story title in the sidebar,
So that I know what I'm working on without checking other tools.

**Acceptance Criteria:**

**Given** an active story exists in `.session/{story-id}-session.md`
**When** the sidebar tree view loads
**Then** it displays the current story title (e.g., "MSSCI-12345: Implement sidebar")

**Given** no active story exists
**When** the sidebar tree view loads
**Then** it displays "No active story" indicator

**FRs:** FR11

---

### Story 59.2: Sprint Metrics Display

As a VS Code user,
I want to see sprint progress in the sidebar,
So that I understand how the sprint is tracking without leaving VS Code.

**Acceptance Criteria:**

**Given** sprint data is available from `sprint/current-sprint.yaml`
**When** the sidebar tree view loads
**Then** it displays remaining points (e.g., "31 pts remaining")
**And** it displays in-progress points (e.g., "5 pts in progress")

**Given** sprint has an end date
**When** the sidebar tree view loads
**Then** it displays the sprint end date (e.g., "Feb 1")

**FRs:** FR12, FR13

---

### Story 59.3: Branch Status Indicator

As a VS Code user,
I want to see if my branch has uncommitted changes,
So that I know whether I need to commit before handoff.

**Acceptance Criteria:**

**Given** the current git branch has no uncommitted changes
**When** the sidebar tree view loads
**Then** it displays a CLEAN indicator

**Given** the current git branch has uncommitted changes
**When** the sidebar tree view loads
**Then** it displays a DIRTY indicator

**FRs:** FR14

---

### Story 59.4: File Watcher Integration

As a VS Code user,
I want the story status to update automatically,
So that I see changes without refreshing manually.

**Acceptance Criteria:**

**Given** the extension is watching `.session/` directory
**When** a session file is created, modified, or deleted
**Then** the tree view updates within 500ms

**Given** `sprint/current-sprint.yaml` changes
**When** the file is saved
**Then** the sprint metrics in the tree view update within 500ms

**Given** git status changes (commit, checkout, etc.)
**When** the change occurs
**Then** the branch status indicator updates

**FRs:** FR15 | **NFRs:** NFR8

---

## Epic 59: Chat Integration

Users can invoke Pennyfarthing agents and all slash commands directly from VS Code Chat using @pf.

### Story 59.1: @pf Chat Participant

As a VS Code user,
I want to invoke Pennyfarthing via @pf in VS Code Chat,
So that I can interact with agents without leaving the editor.

**Acceptance Criteria:**

**Given** the extension is activated
**When** the user types `@pf` in VS Code Chat
**Then** the Pennyfarthing chat participant is available for selection

**Given** the user sends a message to @pf
**When** the message is submitted
**Then** it is routed to the Pennyfarthing agent system
**And** the response appears in the chat

**FRs:** FR20

---

### Story 59.2: Slash Command Integration

As a VS Code user,
I want to use all Pennyfarthing slash commands via @pf,
So that I have full access to agents, skills, and workflows from chat.

**Acceptance Criteria:**

**Given** the user is chatting with @pf
**When** they type a slash command (e.g., `/sm`, `/tea`, `/dev`, `/reviewer`)
**Then** the command is recognized and invokes the corresponding agent

**Given** the user types a skill command (e.g., `/workflow`, `/sprint`, `/theme`)
**When** the command is submitted
**Then** the skill is executed and results appear in chat

**Given** the user types a workflow command (e.g., `/workflow start tdd`)
**When** the command is submitted
**Then** the workflow is initiated through the chat interface

**Given** any valid Pennyfarthing slash command
**When** used via @pf
**Then** it behaves identically to using it in Claude Code terminal

**FRs:** FR21
