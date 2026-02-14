# Epic 103: BikeRack TUI — Terminal-Native Dashboard

## Overview
Replace the browser-based Cyclist dashboard with a terminal-native TUI companion built on Rich/Textual (Python). Connects to WheelHub over WebSocket, renders panels, switches via `/bc` slash command. Consumes existing WebSocket channels unchanged — zero server-side modifications.

**Jira:** MSSCI-14951
**Repos:** pennyfarthing
**PRD:** sprint/planning/prd.md

## Completed Stories
- 103-1: Textual app scaffold with basic layout (2pts)
- 103-2: WheelHub WebSocket client with auto-reconnect (3pts)
- 103-3: `pf bikerack` launcher command (2pts)
- 103-4: Connection status indicator in TUI header (1pt)
- 103-5: Base panel abstraction (channel subscription + Rich rendering) (3pts)
- 103-6: SprintPanel implementation (2pts)
- 103-7: `/bc` slash command skill registration (2pts)

## Architecture
- Python-based TUI using Textual framework
- Connects to WheelHub via WebSocket
- Panels switchable via `/bc` command
- Port discovery via `.bikerack-port` file
- Existing ERB (Electron React Browser) version uses dockview-react panels

## Key Directories
- `pennyfarthing/packages/cyclist/` — Electron/React BikeRack (ERB version)
- `pennyfarthing/packages/cyclist/src/server.ts` — WheelHub server
- `pennyfarthing/pennyfarthing-dist/commands/` — CLI commands including `/bc`
