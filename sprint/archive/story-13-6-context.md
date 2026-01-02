# Story 13-6: Build individual profile card pages - Technical Context

## Story Overview
- **Epic:** 13 (Pennyfarthing Showcase Website)
- **Points:** 3 (Standard - TEA flow)
- **Priority:** P1
- **Repos:** pennyfarthing (showcase/)
- **Jira:** https://1898andco.atlassian.net/browse/MSSCI-11300
- **Branch:** feat/13-6-character-profile-pages
- **Worktree:** /Users/keithavery/Projects/pennyfarthing-wt-13-1

## Current State

The showcase site has:
- **Theme detail pages** (`/themes/[theme]`) - Shows all 10 agents per theme
- **ProfileCard component** - Links to `/characters/[theme]/[role]` (routes don't exist yet)
- **SpiderChart component** - OCEAN visualization at various sizes
- **Data loader** (`lib/loader.ts`) - Loads all theme/agent data at build time
- **Type definitions** (`lib/types.ts`) - Agent interface with full details

Missing: Individual character pages at `/characters/[theme]/[role]`

## Technical Approach

### 1. Dynamic Route Setup
Create `/characters/[theme]/[role].astro` using Astro's dynamic routing:
- Nested dynamic params: `[theme]` and `[role]`
- `getStaticPaths()` generates 640 routes (64 themes × 10 agents)
- Find specific agent from theme.agents by role

### 2. Page Structure
```
┌─────────────────────────────────────────────────────┐
│ Character Header                                     │
│ Large emoji/face (text-8xl) + Character name        │
│ Role badge + Theme link                             │
├─────────────────────────────────────────────────────┤
│ Two-column layout                                    │
│ ┌──────────────────┐ ┌────────────────────────────┐ │
│ │ Large Spider     │ │ OCEAN Bars (OceanBadge)    │ │
│ │ Chart (200px)    │ │ O: ████████░░ 4.2          │ │
│ │ with labels      │ │ C: ██████░░░░ 3.1          │ │
│ │                  │ │ E: ██████████ 5.0          │ │
│ │                  │ │ A: ████░░░░░░ 2.0          │ │
│ │                  │ │ N: ██████░░░░ 3.0          │ │
│ └──────────────────┘ └────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ Character Details                                    │
│ Style: "Direct and methodical..."                   │
│ Expertise: "Backend systems, API design..."         │
│ Quote: "The code speaks for itself"                 │
│ Trait: "Quietly competent"                          │
├─────────────────────────────────────────────────────┤
│ Personality Expression                              │
│ Catchphrases: • "Let's see..." • "Interesting..."  │
│ Quirks: • Never uses emojis • Always tests first   │
├─────────────────────────────────────────────────────┤
│ Helper Info                                         │
│ Helper: "The Investigator" - Style description      │
├─────────────────────────────────────────────────────┤
│ Best For (based on OCEAN)                           │
│ High O + Low N = Good for exploratory research      │
├─────────────────────────────────────────────────────┤
│ Related Characters (same role, different themes)    │
│ [Card] [Card] [Card] [Card] (horizontal scroll)    │
├─────────────────────────────────────────────────────┤
│ [♡ Add to Favorites] placeholder button             │
└─────────────────────────────────────────────────────┘
```

### 3. OceanBadge Component (new)
Visual bar representation of OCEAN scores:
- 5 rows, one per dimension
- Label (O/C/E/A/N) + full name
- Progress bar (1-5 scale)
- Numeric value

### 4. Related Characters Section
- Find same role across all themes
- Exclude current character
- Show 4-6 cards with horizontal scroll
- Reuse mini ProfileCard or create RelatedCard

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `showcase/src/pages/characters/[theme]/[role].astro` | CREATE | Individual character page |
| `showcase/src/components/OceanBadge.astro` | CREATE | OCEAN score bars visualization |
| `showcase/src/components/RelatedCharacters.astro` | CREATE | Related characters section |
| `showcase/src/components/FavoriteButton.astro` | CREATE | Placeholder favorite button |
| `showcase/tests/character-profile.test.ts` | CREATE | Tests for character pages |

## Acceptance Criteria

- [ ] AC1: 640 character pages generated (64 themes × 10 roles)
- [ ] AC2: Full character details displayed (name, style, expertise, quote, trait)
- [ ] AC3: OCEAN visualization clear and readable (spider + bars)
- [ ] AC4: Related characters section populated (same role, different themes)
- [ ] AC5: FavoriteButton component placeholder present

## Testing Strategy

1. **Route generation** - Dynamic route file exists with getStaticPaths
2. **Content verification** - Page contains character name, style, expertise, quote
3. **OCEAN display** - Both SpiderChart and OceanBadge present
4. **Related section** - RelatedCharacters component renders
5. **Favorite button** - FavoriteButton placeholder exists

## Dependencies & Risks

- **Depends on:** Story 13-5 (merged) - ProfileCard links, SpiderChart, loader
- **Risk:** 640 pages = longer build time (should still be fast with Astro)
- **Risk:** Related characters query could be expensive if not cached
- **Note:** FavoriteButton is placeholder only (localStorage in story 13-12)

## Agent Data Available

From `types.ts`, each Agent has:
```typescript
{
  role: string;           // sm, tea, dev, reviewer, etc.
  character: string;      // "James Holden"
  ocean: OceanScores;     // { O: 4, C: 3, E: 5, A: 2, N: 3 }
  style: string;          // "Idealistic, transparent..."
  expertise: string;      // "Crew coordination..."
  roleSummary: string;    // "The captain who..."
  quote: string;          // "We need to tell everyone"
  trait: string;          // "Moral compass"
  quirks: string[];       // ["Coffee obsession", ...]
  catchphrases: string[]; // ["Copy that", ...]
  emoji: string;          // "☕"
  helper: AgentHelper;    // { name: "Ship's AI", style: "..." }
}
```

## OCEAN "Best For" Logic

Simple recommendations based on OCEAN scores:
- High O (>4): Creative tasks, exploration, new technologies
- High C (>4): Planning, documentation, code review
- High E (>4): Team coordination, presentations, pairing
- High A (>4): Conflict resolution, mentoring, support
- Low N (<2): High-pressure situations, production issues
