# Pennyfarthing Showcase Website

Interactive website for browsing themes and character profiles.

**Live Site:** https://animated-meme-3e4494y.pages.github.io/

## Features

- **Theme Gallery** - Browse 102 themes with OCEAN spider charts
- **Theme Detail Pages** - Team overlay visualizations showing all agents
- **Character Profiles** - 1020 character pages with OCEAN spider charts
- **Filters** - Filter by OCEAN dimensions, role, source universe

## Local Development

```bash
cd showcase && npm run dev
```

## Build

```bash
npm run build  # outputs to docs/ for GitHub Pages
```

## URL Structure

| Route | Description |
|-------|-------------|
| `/themes` | Theme gallery |
| `/themes/[theme]` | Theme detail (e.g., `/themes/discworld`) |
| `/characters/[theme]/[role]` | Character profile (e.g., `/characters/discworld/sm`) |

## Data Sources

The showcase reads from:
- `pennyfarthing-dist/personas/themes/*.yaml` - Theme definitions
- Generated `themes.json` - Aggregated theme data for frontend

## See Also

- [Theme Comparison](THEME-COMPARISON.md) - Personality analysis and selection guide
- [OCEAN Benchmarking](../packages/benchmark/docs/OCEAN-BENCHMARKING.md) - Research methodology
- [Personas](PERSONAS.md) - Theme configuration and custom themes
