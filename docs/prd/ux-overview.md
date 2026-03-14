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
inputDocuments:
  - docs/FRAME-GUI-GUIDE.md
  - docs/FRAME-GUI-ARCHITECTURE.md
  - docs/USER-GUIDE.md
  - docs/CONFIGURATION.md
  - docs/BIKELANE.md
  - packages/cyclist/src/public/js/components/MessageView.js
  - packages/cyclist/src/public/js/components/SettingsPanel.js
  - packages/cyclist/src/public/js/components/ChangedFilesList.js
  - packages/cyclist/src/public/index.html
documentCounts:
  briefs: 0
  research: 0
  projectDocs: 9
workflowType: 'prd'
workflowMode: 'create'
classification:
  projectType: Developer Tool / IDE Extension
  domain: AI-Assisted Development
  complexity: High
  projectContext: brownfield
---

# Product Requirements Document - Pennyfarthing UX Overview

**Author:** Bossmang
**Date:** 2026-01-27

## Success Criteria

### User Success

#### 1. DIFFS/CHANGED Panel Improvements
| Current Pain | Success Criteria |
|--------------|------------------|
| Line numbers show diff position, not file position | Line numbers reflect actual file lines |
| Combined diff view lacks utility | Combined view clearly shows original → final state with context |
| File opener broken | Clicking file path opens in configured editor (`$EDITOR`) reliably |

#### 2. Stats Strip Redesign
| Current | Success Criteria |
|---------|------------------|
| PWD + model + context tokens + context % + usage limits | PWD (responsive: short/narrow, long/wide) → Jira email → GitHub username → spacer → Claude model → Context % |
| Missing identity context | Developer sees their Jira + GitHub identity at a glance |

#### 3. Sidebar - Story Section Expansion
| Current | Success Criteria |
|---------|------------------|
| Story title, phase, basic sprint stats | Expandable story section with full sprint & epic context |
| Must open sprint YAML to see details | Sprint details accessible in-UI: all stories, points, status, backlog |
| No epic context visible | Epic details: parent epic, sibling stories, Jira links (clickable) |

#### 4. Sidebar - BikeLane Section Visibility
| Current | Success Criteria |
|---------|------------------|
| BikeLane section exists but marked `hidden` | BikeLane section visible when a workflow is active |
| No workflow status at a glance | Shows: workflow name, type badge, current step/phase, progress |
| Phase history exists but not shown | Phase history timeline visible with timestamps |

#### 5. Sidebar - Background Tasks
| Current | Success Criteria |
|---------|------------------|
| Section exists but not functional | Background tasks (subagents, long-running Bash) visible and trackable |
| No visibility into running subagents | Shows: task name, agent type, status (running/completed/failed), duration |
| No completion notification | Real-time updates + completion notification + output preview |

#### 6. Sidebar - Persona Section Redesign
| Current | Success Criteria |
|---------|------------------|
| Mixed: some themes use `quote`, others use `catchphrases` | Single field: `catchphrases` array only |
| OCEAN scores displayed | Remove OCEAN scores |
| Helper real-time updates | Remove helper updates |
| Vertical sprawl | Tighter, more compact layout |
| Static quote display | Random catchphrase selected on agent activation |

#### 7. Tab Bar - Indicator Sync Bug
| Current | Success Criteria |
|---------|------------------|
| Message + Sidebar open on startup but no indicator shown | Startup state reflects actual panel state (underlined) |
| First click doesn't toggle - must click twice to sync | Click behavior works on first click |

#### 8. Stale Data on Fresh Load
| Current | Success Criteria |
|---------|------------------|
| Panels show stale data on fresh load | All panels show clean/empty state on fresh start |
| Indicators have leftover state | All indicators reset to defaults |
| Confusing dirty reads across UI | Clear, consistent "fresh session" state |

### Technical Success

- All panels have explicit `clear()`/`reset()` methods
- Fresh start states audited and fixed across all components
- Reset called on: app start, Clear button, TirePump (context clear)
- No localStorage/sessionStorage pollution between sessions

## Product Scope

### MVP - Minimum Viable Product

1. **DIFFS Panel Fixes**
   - File line numbers (not diff-relative)
   - Fix file opener for `$EDITOR`
   - Improved combined diff view

2. **Stats Strip Redesign**
   - PWD (responsive width)
   - Jira email + GitHub username display
   - Keep model + context %

3. **Tab Bar Bug Fix**
   - Sync indicators to panel state on startup

4. **Fresh Start State Audit**
   - Identify all stateful components
   - Add `clear()`/`reset()` methods
   - Call on app start, Clear, TirePump

5. **Persona Section Cleanup**
   - Remove OCEAN scores
   - Remove helper updates
   - Random catchphrase on activation
   - Tighter layout

### Growth Features (Post-MVP)

1. **Story Section Expansion**
   - Full sprint details in expandable view
   - Epic context and sibling stories
   - Clickable Jira links

2. **BikeLane Section**
   - Visible when workflow active
   - Progress visualization
   - Phase history timeline

3. **Background Tasks**
   - Subagent visibility
   - Status indicators
   - Output preview

### Vision (Future)

1. **Theme Schema Rationalization**
   - Migration script: consolidate `quote` → `catchphrases`
   - Remove `quote` field from all 102 themes
   - Update theme validation

## User Journeys

*Skipped for this focused improvement PRD. Primary user is the developer using Frame GUI for AI-assisted development. All improvements target their daily workflow.*

