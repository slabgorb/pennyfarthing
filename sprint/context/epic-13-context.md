# Epic 13: Pennyfarthing Showcase Website - Technical Context

## Epic Overview
- **ID:** epic-13
- **Title:** Pennyfarthing Showcase Website
- **Points:** 34
- **Priority:** P2
- **Target Sprint:** 6+
- **Repos:** pennyfarthing

## Purpose
Interactive showcase website for browsing Pennyfarthing's 64 themes and 640 agent personas. Features OCEAN personality visualization with spider charts and Chernoff faces, full query builder for comparing characters, and pre-rendered benchmark reports.

## Tech Stack
- **Framework:** Astro (static site generator with partial hydration)
- **Interactivity:** React islands for dynamic features
- **Styling:** Tailwind CSS
- **Hosting:** GitHub Pages (builds to `docs/`)

## Architecture

### Directory Structure
```
pennyfarthing/
├── showcase/                    # Astro project root
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro              # Home/landing
│   │   │   ├── themes/
│   │   │   │   ├── index.astro          # Theme gallery
│   │   │   │   └── [theme].astro        # Theme detail (dynamic)
│   │   │   ├── characters/
│   │   │   │   └── [theme]/[role].astro # Profile cards
│   │   │   ├── compare.astro            # Query builder
│   │   │   ├── favorites.astro          # Saved characters
│   │   │   └── benchmarks/
│   │   │       └── index.astro          # Pre-rendered reports
│   │   ├── components/
│   │   │   ├── ThemeCard.astro          # Theme preview
│   │   │   ├── ProfileCard.astro        # Character profile
│   │   │   ├── SpiderChart.astro        # SVG spider embed
│   │   │   ├── ChernoffFace.astro       # SVG face embed
│   │   │   ├── OceanBadge.astro         # OCEAN score display
│   │   │   ├── TeamOverlay.astro        # Team spider
│   │   │   ├── QueryBuilder.tsx         # React island
│   │   │   ├── CompareGrid.tsx          # React island
│   │   │   └── FavoriteButton.tsx       # React island
│   │   ├── layouts/
│   │   │   └── Base.astro               # Site layout
│   │   ├── data/
│   │   │   └── loader.ts                # Build-time data
│   │   └── styles/
│   │       └── global.css
│   ├── public/
│   │   ├── faces/                       # SVGs from OCEAN work
│   │   └── spiders/
│   ├── astro.config.mjs
│   └── package.json
└── docs/                        # GitHub Pages output
```

## Key Design Decisions

### 1. Static-First with Islands
- All theme/character pages pre-rendered at build time
- React islands only for interactive features (query builder, favorites)
- Minimizes JavaScript bundle for fast page loads

### 2. Data Pipeline
- Build-time loader reads `pennyfarthing-dist/personas/themes/*.yaml`
- Generates `themes.json` (~500KB) for client-side queries
- SVGs copied/symlinked to public directory

### 3. OCEAN Integration
- Reuses existing OCEAN parsing from `generate-report.ts`
- Spider charts and faces from Epic 11 work
- Expression parser ported to browser for client-side filtering

## Dependencies
- **Epic 12:** Story 13-10 (benchmarks) depends on epic-12 completion
- **Epic 11:** OCEAN profiles, faces, and spider charts (complete)

## Stories

| ID | Title | Points | Priority |
|----|-------|--------|----------|
| 13-1 | Initialize Astro project | 3 | P1 |
| 13-2 | Base layout and navigation | 2 | P1 |
| 13-3 | Theme data loader | 3 | P1 |
| 13-4 | Theme gallery page | 3 | P1 |
| 13-5 | Theme detail page | 3 | P1 |
| 13-6 | Profile card pages | 3 | P1 |
| 13-7 | Query builder UI | 3 | P1 |
| 13-8 | OCEAN expression parser | 2 | P1 |
| 13-9 | Comparison view | 3 | P1 |
| 13-10 | Pre-render benchmarks | 3 | P2 |
| 13-11 | Shareable URLs | 2 | P2 |
| 13-12 | localStorage favorites | 2 | P2 |
| 13-13 | Responsive + SEO | 2 | P2 |

## Testing Strategy
- Unit tests for data loader (TypeScript)
- Build verification (all pages generate)
- E2E tests for React islands (optional)
- Lighthouse CI for performance/accessibility

## Plan Reference
Full detailed plan at: `~/.claude/plans/parsed-exploring-crown.md`
