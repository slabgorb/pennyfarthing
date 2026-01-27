# Sidebar Modules Refactor Plan

## Current State (Chaos)

Sidebar-related code is scattered across multiple files:
- `story.js` - Story, Sprint, Workflow, Git, Acceptance Criteria (too much!)
- `persona.js` - Persona display + popup
- `portrait.js` - Portrait image loading
- `todos.js` - Todo list
- `bikelane-section.js` - BikeLane workflow visualization
- `components/BackgroundTasksPanel.js` - Background tasks
- `stats-strip.js` - Was also managing git sidebar (already moved)

## Proposed Structure

```
packages/cyclist/src/public/js/sidebar/
├── index.js              # Coordinator: init all modules, shared WebSocket
├── portrait.js           # Portrait image loading (move from ../portrait.js)
├── story.js              # Story title, sprint progress, PR link
├── git.js                # Multi-repo git status (extract from story.js)
├── acceptance-criteria.js # AC checklist (extract from story.js)
├── tasks.js              # Todo list (move from ../todos.js)
├── background-tasks.js   # Background tasks (move from components/)
└── bikelane.js           # Workflow visualization (move from ../bikelane-section.js)
```

## Module Responsibilities

### 1. `sidebar/index.js` - Coordinator
- Initialize all sidebar modules
- Manage shared WebSocket connections (`/ws/story`, `/ws/git`)
- Export `initSidebar()` for HTML to call
- Route WebSocket messages to appropriate modules

### 2. `sidebar/portrait.js`
- Load character portrait with theme/fallback logic
- Handle portrait errors and placeholders
- Listen for theme changes
- **HTML**: `#portrait`
- **Existing**: Move from `portrait.js` (minimal changes)

### 3. `sidebar/story.js`
- Display story title, phase, PR link
- Display sprint progress (done/remaining/percent/end date)
- **HTML**: `#story-title`, `#story-phase`, `#story-details`, `#next-agent`, `#story-pr`, `#sprint-*`
- **Data**: Story object from WebSocket/IPC

### 4. `sidebar/git.js`
- Multi-repo git status display
- Build summary (collapsed) and detail (expanded) views
- **HTML**: `#git-repos`, `#git-section-summary`, `#git-section-badge`
- **Data**: `repos[]` from WebSocket/IPC

### 5. `sidebar/acceptance-criteria.js`
- AC checklist with progress
- Collapse state persistence
- **HTML**: `#ac-section`, `#ac-list`, `#ac-progress`
- **Data**: `criteria[]` from story object

### 6. `sidebar/tasks.js`
- Todo list from Claude's TodoWrite
- Auto-collapse when empty
- Status indicators (✓/●/○)
- **HTML**: `#todo-section`, `#todo-list`, `#todo-progress`
- **IPC**: `electronAPI.todos`

### 7. `sidebar/background-tasks.js`
- Running/completed background tasks
- Elapsed time display
- Dismiss functionality
- **HTML**: `#background-tasks-section`, `#background-tasks-container`
- **WebSocket**: `/ws/background-tasks`
- **Existing**: Move from `components/BackgroundTasksPanel.js`

### 8. `sidebar/bikelane.js`
- Workflow type badge
- Phase progress visualization
- Phase history timeline
- **HTML**: `#bikelane-section`, `.workflow-type-badge`, `.phase-progress`, `.phase-history-list`
- **Data**: `workflow` object from story
- **Existing**: Move from `bikelane-section.js`

## Data Flow

```
WebSocket/IPC
     │
     ▼
sidebar/index.js (coordinator)
     │
     ├──▶ story.js.update(storyData)
     │         └──▶ Updates story/sprint HTML
     │
     ├──▶ git.js.update(repos)
     │         └──▶ Updates git section HTML
     │
     ├──▶ acceptanceCriteria.js.update(criteria)
     │         └──▶ Updates AC checklist HTML
     │
     └──▶ bikelane.js.update(workflow)
               └──▶ Updates workflow HTML
```

## Module Interface Pattern

Each module exports:
```javascript
export function init() { }      // Set up DOM listeners, collapse handlers
export function update(data) { }  // Update display from data
export function destroy() { }   // Clean up (optional)
```

## Migration Steps

1. Create `sidebar/` directory
2. Create `sidebar/index.js` coordinator
3. Move `portrait.js` → `sidebar/portrait.js`
4. Extract story/sprint from `story.js` → `sidebar/story.js`
5. Extract git from `story.js` → `sidebar/git.js`
6. Extract AC from `story.js` → `sidebar/acceptance-criteria.js`
7. Move `todos.js` → `sidebar/tasks.js`
8. Move `components/BackgroundTasksPanel.js` → `sidebar/background-tasks.js`
9. Move `bikelane-section.js` → `sidebar/bikelane.js`
10. Update HTML imports
11. Delete old files
12. Test all sections

## Breaking Changes

- Old `story.js` will be deleted (functionality split)
- Old `portrait.js` location changes
- Old `todos.js` location changes
- Old `bikelane-section.js` location changes
- Old `components/BackgroundTasksPanel.js` location changes

## Window Exports

Keep minimal window exports for cross-module communication:
- `window.sidebar.git.update(repos)` - For story.js WebSocket handler
- `window.sidebar.bikelane.update(workflow)` - For story.js WebSocket handler

Or better: Have index.js handle all WebSocket routing internally.
