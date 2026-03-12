# BikeRack GUI Guide

Complete guide to using BikeRack GUI, the browser-based visual interface for Claude Code with Pennyfarthing integration.

## What is BikeRack GUI?

BikeRack GUI is a browser-based dashboard that connects to Claude Code via the WheelHub server, providing:

- **Real-time agent personas** - See which character is active with portrait and personality
- **Session statistics** - Token usage, tool calls, context percentage
- **Story tracking** - Workflow progress through SM → TEA → Dev → Reviewer
- **Quick actions** - Smart buttons for common responses
- **Rich text editor** - Formatted input with markdown support

## Getting Started

### Starting BikeRack GUI

**Option 1: One command (recommended)**
```bash
pf bikerack start
```

**Option 2: Manual start**
```bash
# Start the WheelHub server
just gui

# In another terminal, start Claude with OTEL
just claude

# Open browser
open http://localhost:1898
```

### Development Mode

```bash
# Start WheelHub server with GUI
pf bikerack start

# Then open http://localhost:1898
```

## Interface Overview

BikeRack GUI v9.0+ uses **Dockview panels** - all panels are draggable, can be split, floated, or maximized. The default layout:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Menu Bar: Agents | Workflows | View | Help                             │
├─────────────────┬───────────────────────────────────┬───────────────────┤
│                 │                                   │                   │
│  LEFT SIDEBAR   │         MESSAGE PANEL             │   RIGHT SIDEBAR   │
│  (draggable)    │         (sacred center)           │   (draggable)     │
│                 │                                   │                   │
│  ┌───────────┐  │  ┌─────────────────────────────┐  │  ┌─────────────┐  │
│  │ Changed   │  │  │ Persona Header              │  │  │ Sprint      │  │
│  │ Files     │  │  │ [Portrait] Agent Name       │  │  │ Panel       │  │
│  └───────────┘  │  └─────────────────────────────┘  │  └─────────────┘  │
│  ┌───────────┐  │                                   │  ┌─────────────┐  │
│  │ Diffs     │  │  ┌─────────────────────────────┐  │  │ Progress    │  │
│  │ Panel     │  │  │ Conversation Messages       │  │  │ Panel       │  │
│  └───────────┘  │  │                             │  │  └─────────────┘  │
│  ┌───────────┐  │  │ Tool calls with summaries:  │  │  ┌─────────────┐  │
│  │ Debug     │  │  │ ┌─────────────────────────┐ │  │  │ Background  │  │
│  │ Panel     │  │  │ │ 📖 Reading src/foo.ts   │ │  │  │ Tasks       │  │
│  └───────────┘  │  │ │ ▶ Result (42 lines)     │ │  │  └─────────────┘  │
│                 │  │ └─────────────────────────┘ │  │  ┌─────────────┐  │
│                 │  │                             │  │  │ Git         │  │
│                 │  └─────────────────────────────┘  │  │ Panel       │  │
│                 │                                   │  └─────────────┘  │
│                 │  ┌─────────────────────────────┐  │  ┌─────────────┐  │
│                 │  │ Quick Actions               │  │  │ Settings    │  │
│                 │  │ [Yes] [No] [/pf-dev]        │  │  │ Panel       │  │
│                 │  └─────────────────────────────┘  │  └─────────────┘  │
│                 │  ┌─────────────────────────────┐  │                   │
│                 │  │ Editor + Stats Strip        │  │                   │
│                 │  └─────────────────────────────┘  │                   │
└─────────────────┴───────────────────────────────────┴───────────────────┘
```

**Panel Features (v9.0+):**
- **Drag panels** between sidebars or float them as separate windows
- **Split panels** horizontally or vertically within regions
- **Maximize** any panel by double-clicking its tab
- **Restore closed panels** via View menu → Restore Panel
- **MessagePanel is locked** - cannot be closed or moved (sacred center)

## Panel System (v9.0+)

BikeRack GUI uses **Dockview** for panel management. All panels except MessagePanel can be:
- **Dragged** to different locations
- **Floated** as separate windows (pop-out)
- **Split** to show multiple panels side-by-side
- **Maximized** with double-click on tab
- **Closed** and restored via View menu

### Left Sidebar Panels

#### Changed Files Panel
Lists files modified during the session. Click to view diffs.

#### Diffs Panel
Side-by-side diff viewer with syntax highlighting.
- Navigate edits with j/k keys
- Click file paths to open in external editor
- View modes: Partial, Combined, Original, Current

#### Debug Panel
OTEL spans and debugging information for developers.

### Center (Sacred)

#### Message Panel
The conversation view - **cannot be closed or moved**.

**Features:**
- **Persona Header** - Character portrait and name in message header
- **Tool Call Blocks** - Human-readable summaries (e.g., "Reading src/foo.ts")
- **Collapsible Results** - Tool outputs collapsed by default
- **Tool Stacks** - Consecutive tool calls grouped together
- **Quick Actions** - Smart buttons from PF markers
- **Editor** - TipTap rich text input with stats strip

### Right Sidebar Panels

#### Sprint Panel
Current sprint and story tracking.

#### Progress Panel
Workflow phase visualization (SM → TEA → Dev → Reviewer).

#### BikeLane Panel
Stepped workflow UI for PRD, architecture, and research workflows.

#### Acceptance Criteria Panel
Story acceptance criteria checklist with completion tracking.

#### Background Panel
Running background tasks and subagents.

#### Git Panel
Repository status, branch info, sync state.

#### Settings Panel
Theme selection, font settings, configuration.

---

## Quick Actions

BikeRack GUI automatically detects interactive patterns in Claude's responses and shows action buttons.

### Action Types

#### Yes/No Questions

When Claude asks a yes/no question:
```
Would you like me to proceed with the implementation?
```

Buttons appear: `[Yes, proceed]` `[No]`

#### Numbered Choices

When Claude presents options:
```
Which approach do you prefer?

1. Simple implementation
2. Full-featured solution
3. Minimal changes
```

Buttons appear: `[1]` `[2]` `[3]`

#### Agent Handoffs

When ready to switch agents:
```
Ready to hand off to the Caterpillar for test writing.

Invoke /pf-tea to begin the RED phase.
```

Button appears: `[/pf-tea]`

#### Continue Actions

When Claude needs to continue work:
```
<!-- PF:CONTINUE -->
```

Button appears: `[Continue]`

#### Permission Prompts

When Claude needs permission:
```
Allow Bash to run: npm install
```

Buttons appear: `[Yes]` `[No]`

### Detection Patterns

Quick actions are detected from these patterns:

| Pattern | Example | Buttons |
|---------|---------|---------|
| "Would you like me to" | "Would you like me to proceed?" | Yes, No |
| "Shall I proceed/continue" | "Shall I continue?" | Yes, No |
| "Should I" | "Should I create the file?" | Yes, No |
| "Ready to proceed" | "Ready to proceed with testing" | Yes, Hold on |
| "Invoke /agent" | "Invoke /pf-dev to implement" | /pf-dev |
| Numbered list (1. 2. 3.) | Option list with choice context | 1, 2, 3 |

### Confidence Threshold

Quick actions use a confidence threshold (default: 0.6) to avoid false positives. Patterns with higher confidence appear more reliably:

- **1.0** - Explicit markers (`<!-- PF:TYPE:value -->`)
- **0.98** - Direct agent invocation
- **0.85** - Clear yes/no questions
- **0.70** - Numbered lists with context

### Explicit Markers (For Agents)

Agents can emit HTML comment markers for 100% accurate detection:

```html
<!-- PF:HANDOFF:/pf-tea -->
<!-- PF:QUESTION:yesno -->
<!-- PF:CHOICES:1,2,3 -->
<!-- PF:CONTINUE -->
```

These are invisible to users but guarantee button rendering.

## Tab Panel

### Diffs Tab

Shows file changes with syntax highlighting.

**Features:**
- **Split view** - Original vs modified
- **Line numbers** - Click-to-jump line numbers (v6.5+)
- **Clickable file paths** - Click the file path header to open in your editor (v6.5+)
- **Navigation** - Previous/next edit (j/k keys)
- **View modes**:
  - Partial - Single diff between states
  - Combined - All changes original → current
  - Original - Pre-edit state
  - Current - Post-edit state
- **Position indicator** - "Edit 2 of 5"

**Supported editors for clickable paths:**
- VS Code (`code`)
- Cursor (`cursor`)
- Vim/Neovim (`vim`, `nvim`)
- Emacs (`emacs`)
- Sublime Text (`subl`)

Set your preferred editor via `$EDITOR` environment variable.

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| j or ↓ | Next edit |
| k or ↑ | Previous edit |
| Home | First edit |
| End | Last edit |

### Files Tab

Browse project files without leaving BikeRack GUI.

**Features:**
- Directory tree navigation
- File preview with syntax highlighting


### Browser Tab

Embedded web browser for documentation reference.

### Audit Log Tab

Complete record of tool executions in the session.

**Columns:**
- **Timestamp** - When the tool ran
- **Tool** - Tool name (Bash, Edit, Read, etc.)
- **Input** - Command or parameters (truncated, hover for full)
- **Duration** - Execution time
- **Status** - ✓ success or ✗ failed

**Features:**
- Filter by tool type
- Export to JSON or CSV
- Statistics summary
- Clear log with confirmation

## Stats Strip

Compact statistics in the prompt bar area.

**Metrics:**
- **Tokens** - Input/output token counts
- **Context** - Usage percentage (warning at 70%, critical at 85%)
- **Tools** - Number of tool calls
- **Model** - Active model name
- **Cost** - Estimated USD cost
- **Project** - Current project folder (hover for full path)
- **Git** - Repository status badges (multi-repo if configured)

## Rich Text Editor

TipTap-based editor with formatting support.

### Toolbar

| Button | Action |
|--------|--------|
| B | Bold |
| I | Italic |
| `</>` | Code block |
| Link | Insert hyperlink |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+Enter | Send prompt |
| Escape | Stop Claude |
| Cmd/Ctrl+B | Bold |
| Cmd/Ctrl+I | Italic |
| Cmd/Ctrl+Shift+C | Code block |

## Menus

### Agents Menu

Launch agents directly from the menu.

**Tactical Agents:**
- SM (Scrum Master)
- TEA (Test Engineer)
- Dev (Developer)
- Reviewer

**Strategic Agents:**
- PM (Product Manager)
- Architect
- DevOps
- Tech Writer
- UX Designer

### Workflows Menu

- **New Work** - Start a new story (`/pf-work`)
- **Continue Session** - Resume previous work (`/pf-session continue`)
- **Sprint Context** - View sprint status (`/sprint-context`)
- **Work** - Smart work entry (`/pf-work`)

### View Menu

- Toggle sidebar
- Toggle stats strip
- Reset layout

## Settings Panel (v6.5+)

Access settings via the menu bar or keyboard shortcut.

### Font Settings

Customize the BikeRack GUI interface fonts:

**Available Options:**
- **Font Family** - Choose from system fonts (Monaco, SF Mono, Menlo, etc.)
- **Font Size** - Adjust terminal and UI text size
- **Line Height** - Control line spacing

Settings are persisted per-user and applied immediately.

## Configuration

### Project Settings

Located at `.pennyfarthing/config.local.yaml`:

```yaml
theme: "big-lebowski"      # Persona theme

workflow:
  handoff_mode: manual     # 'auto' or 'manual' handoffs
  bell_mode: false         # Bell mode for queued messages

display:
  show_flow: true          # Show workflow visualization
  show_ocean: false        # Show OCEAN personality scores
  sidebar_width: 300       # Sidebar width in pixels

notifications:
  phase_change: true       # Notify on phase changes
  sound: false             # Play sounds
```

> **Note:** User-level settings are deprecated.
> All settings are now project-local in `.pennyfarthing/config.local.yaml`.

### Multi-Repo Configuration

For monorepo or multi-project setups, configure repos in `.claude/project/pennyfarthing-settings.yaml`:

```yaml
repos:
  - path: /path/to/main-repo
    name: main
  - path: /path/to/api-repo
    name: api
```

The stats strip will show status badges for all configured repositories.


## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PF_COMMAND` | Claude CLI path | `claude` |
| `PF_PROJECT_DIR` | Project directory | Folder picker |
| `PF_THEME` | Theme override | From config |
| `PF_GUI_ACTIVE` | Running in BikeRack GUI | Unset |
| `PORT` | Server port | 1898 |

## Session Replay

### Diff History Navigation

When Claude edits files, BikeRack GUI tracks the history for each file.

**Navigate edits:**
```
File: src/utils/helper.ts
Edit 2 of 5                    [◀] [▶]
```

**View modes:**
- **Partial** - One edit at a time
- **Combined** - All edits merged
- **Original** - Before any edits
- **Current** - After all edits

### Audit Log Export

Export session activity for analysis.

1. Open Audit Log tab
2. Click **Export** dropdown
3. Choose format:
   - **JSON** - Structured data
   - **CSV** - Spreadsheet compatible

**Export includes:**
- All tool executions
- Timestamps and durations
- Success/failure status
- Input parameters

## Multi-Instance Support

Run multiple BikeRack GUI instances for different projects simultaneously.

### Opening New Instances

1. **From menu**: File > New Window (Cmd+Shift+N)
2. **From command line**: Launch with different `--project-dir` arguments
3. **From Finder**: Right-click different folders with Quick Action

### How It Works

- Each instance runs on a separate port
- Port files (`.bikerack-port`) prevent conflicts
- Instances are fully isolated with their own state

### Switching Between Instances

Use standard window management (Cmd+` on macOS) to switch between BikeRack GUI windows.

## Troubleshooting

### Persona not loading

1. Check `.session/agents/` directory exists
2. Verify `agent-session.sh` is writing agent files
3. Confirm theme YAML path is correct

### Portrait not showing

1. Verify portrait in `pennyfarthing-dist/personas/sprites/{theme}/`
2. Check OCEAN-slug filename matches character
3. Confirm `@pennyfarthing/shared` resolver works

### Quick actions not appearing

1. Check confidence threshold (default 0.6)
2. Verify pattern matches expected format
3. Look for false positive prevention keywords
4. For guaranteed detection, use explicit markers (`<!-- PF:TYPE:value -->`)

## OpenTelemetry Integration

BikeRack GUI receives telemetry on port 4318.

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

**Metrics captured:**
- Token usage (input/output/cache)
- API request timings
- Tool call events with duration
- Context percentage
- Cost calculations

## Hook Approval

BikeRack GUI handles tool approval through the WheelHub system.

### Auto-Approved Commands

These safe commands are approved automatically:
- `ls`, `pwd`, `echo`
- `cat` on code/text files
- `git status|diff|log|branch`
- `npm run build|test|lint`
- `node|npm --version`

### Manual Approval

Other commands show an approval modal with:
- Tool name and command
- Context percentage indicator
- Accept/Deny buttons

Approval decisions respect permission grants configured in settings.

## Internal Codenames

BikeRack GUI uses bicycle-themed codenames for major subsystems:

### WheelHub

The central coordination server (implemented in `pennyfarthing-dist/src/pf/wheelhub/app.py`, Python FastAPI) where all communication converges:

- API endpoints for stats, personas, git, stories, settings
- WebSocket servers for real-time communication
- OTLP receiver for telemetry ingestion
- Acceptance handling and cache invalidation

### TirePump

The context clearing system that reinflates the session when context runs low:

- Clears the Claude Code session cleanly
- Resets all stats (tokens, tools, context percentage)
- Reloads the current agent (e.g., /pf-dev) automatically
- Preserves workflow state in .session/ files

Triggered by the Compact button (appears at 50% context) or automatically at critical thresholds.

### JobFair

Character benchmarking system that discovers which personas excel at each role:

- Runs every character in a theme against standardized benchmarks
- Produces talent matrices (character x role performance scores)
- Guides theme optimization decisions
- Invoked via `/job-fair <theme>`

Results are saved to `internal/results/job-fair/`.

## See Also

- [BikeRack GUI Architecture](BIKERACK-GUI-ARCHITECTURE.md) - Architecture and IPC details
- [Personas](PERSONAS.md) - Theme customization
- [User Guide](USER-GUIDE.md) - Complete Pennyfarthing documentation
