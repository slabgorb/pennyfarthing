# Story 13-5: Build theme detail page with team view - Technical Context

## Story Overview
- **Epic:** 13 (Pennyfarthing Showcase Website)
- **Points:** 3 (Standard - TEA flow)
- **Priority:** P1
- **Repos:** pennyfarthing (showcase/)
- **Jira:** https://1898andco.atlassian.net/browse/MSSCI-11299
- **Branch:** feat/13-5-theme-detail-page
- **Worktree:** /Users/keithavery/Projects/pennyfarthing-wt-13-1

## Current State

The showcase site has:
- **Theme gallery** (`/themes/index.astro`) - Grid of 64 themes with filtering
- **ThemeCard component** - Shows thumbnail spider, name, source, 3 agent previews
- **SpiderChart component** - SVG radar chart averaging OCEAN scores
- **Data loader** (`lib/loader.ts`) - Loads theme YAMLs at build time
- **Type definitions** (`lib/types.ts`) - Theme, Agent, OceanScores interfaces

Missing: Individual theme detail pages at `/themes/[theme]`

## Technical Approach

### 1. Dynamic Route Setup
Create `/themes/[theme].astro` using Astro's dynamic routing:
- `getStaticPaths()` generates routes for all 64 themes
- Theme ID from URL slug matches theme.id from loader

### 2. Page Structure
```
┌─────────────────────────────────────────┐
│ Theme Header                            │
│ Name, Description, Source, Settings     │
├─────────────────────────────────────────┤
│ Team Overlay Spider (full-size ~300px)  │
│ All 10 agents averaged together         │
├─────────────────────────────────────────┤
│ Agent Grid (2x5)                        │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│ │ SM │ │TEA │ │Dev │ │Rev │ │Arch│     │
│ └────┘ └────┘ └────┘ └────┘ └────┘     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│ │ PM │ │ TW │ │ UX │ │ DO │ │Orch│     │
│ └────┘ └────┘ └────┘ └────┘ └────┘     │
├─────────────────────────────────────────┤
│ [Compare this team] button              │
└─────────────────────────────────────────┘
```

### 3. ProfileCard Component (new)
Each agent card shows:
- Character face/avatar (placeholder or emoji for now)
- Individual spider chart (~80px)
- Character name and quote
- Link to `/characters/[theme]/[role]` (story 13-6)

### 4. Team Spider Chart
- Reuse existing SpiderChart component with larger size prop
- Pass all 10 agents for team average display
- Add optional "overlay" mode showing individual traces

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `showcase/src/pages/themes/[theme].astro` | CREATE | Dynamic theme detail page |
| `showcase/src/components/ProfileCard.astro` | CREATE | Individual agent card |
| `showcase/src/components/AgentGrid.astro` | CREATE | 2x5 responsive grid layout |
| `showcase/tests/theme-detail.test.ts` | CREATE | Tests for detail page |

## Acceptance Criteria

- [ ] AC1: 64 theme detail pages generated (one per theme)
- [ ] AC2: Team overlay spider displayed prominently (300px+)
- [ ] AC3: All 10 agents shown with face + spider + quote
- [ ] AC4: Links to individual profile pages work (href structure ready for 13-6)

## Testing Strategy

1. **Build verification** - All 64 pages generate without error
2. **Content verification** - Page contains theme name, description, all agents
3. **Component rendering** - ProfileCard shows required elements
4. **Link structure** - Profile links follow `/characters/[theme]/[role]` pattern
5. **Spider chart** - Team chart renders with correct size

## Dependencies & Risks

- **Depends on:** Story 13-4 (merged) - ThemeCard, SpiderChart, loader patterns
- **Risk:** Character faces/avatars - may need placeholders initially (emoji fallback)
- **Risk:** 10-agent grid responsiveness on mobile - need careful breakpoint design

## Patterns from 13-4

- Use `loadThemes()` in `getStaticPaths()` for dynamic routes
- SpiderChart accepts `size` prop for different dimensions
- Tailwind responsive grid pattern from ThemeGrid
- Data attributes for future filtering hooks
