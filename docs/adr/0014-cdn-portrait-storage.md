# ADR-0014: CDN-Based Portrait Storage

## Status

Proposed

## Context

The `pennyfarthing-dist/personas/portraits/` directory contains approximately 606MB of PNG images across 102 themes (~1,000 images total). This causes several problems:

1. **Repository bloat**: Every clone downloads 600MB+ of images
2. **Slow CI/CD**: Build pipelines must fetch the full repo
3. **Git history**: Portrait additions/changes bloat history permanently
4. **Developer friction**: Long clone times for new contributors

The portraits are used by:
- Cyclist UI (displays active agent persona)
- Showcase site (character gallery)
- Documentation

### Constraints

- Must work offline for some users (local development)
- No budget for expensive CDN services
- Minimal infrastructure complexity
- Cannot degrade user experience
- Must support 102 themes with ~10 characters each

## Decision

We will adopt a **hybrid CDN + separate repository** approach:

### 1. Create Separate Portraits Repository

Create `pennyfarthing-portraits` repository containing only portrait images:

```
pennyfarthing-portraits/
├── mash/
│   ├── hawkeye.webp
│   ├── radar.webp
│   └── ...
├── game-of-thrones/
│   └── ...
└── ...
```

### 2. Serve via jsDelivr CDN

jsDelivr provides free, fast CDN for GitHub repositories:

```
https://cdn.jsdelivr.net/gh/[org]/pennyfarthing-portraits@v1/[theme]/[character].webp
```

Benefits:
- Free, no bandwidth limits
- Global edge network
- Automatic cache invalidation on release tags
- No infrastructure to maintain

### 3. Convert to WebP Format

Convert all PNG portraits to WebP format:
- 50-70% smaller file sizes
- Supported by all modern browsers
- Keep PNG as fallback for edge cases

### 4. Update Theme File Schema

```yaml
# Before
agents:
  sm:
    visual: "Description..."
    # Portrait path implicit: portraits/{theme}/{character}.png

# After
agents:
  sm:
    visual: "Description..."
    portrait:
      cdn: "https://cdn.jsdelivr.net/gh/org/pennyfarthing-portraits@v1/mash/hawkeye.webp"
      local: "~/.pennyfarthing/portraits/mash/hawkeye.webp"
```

### 5. Portrait Resolution Logic

```typescript
function resolvePortrait(agent: AgentConfig): string {
  // 1. Check local override (offline/development)
  if (agent.portrait?.local && existsSync(expandPath(agent.portrait.local))) {
    return agent.portrait.local;
  }

  // 2. Use CDN URL
  if (agent.portrait?.cdn) {
    return agent.portrait.cdn;
  }

  // 3. Fallback to legacy path (backwards compatibility)
  return `portraits/${theme}/${agent.shortName.toLowerCase()}.png`;
}
```

### 6. Optional Local Cache

For offline development, provide install script:

```bash
# Optional: Download portraits locally
pennyfarthing portraits install [--theme mash]
```

This clones/downloads portraits to `~/.pennyfarthing/portraits/`.

## Consequences

### Positive

- **Main repo shrinks from ~750MB to ~100MB** (85% reduction)
- **Clone time drops from minutes to seconds**
- **CI/CD builds significantly faster**
- **Global CDN delivers portraits quickly worldwide**
- **Version-tagged releases enable cache busting**
- **WebP conversion further reduces bandwidth**

### Negative

- **Two repositories to maintain** (mitigated: portraits change rarely)
- **Requires internet for first portrait load** (mitigated: local cache option)
- **Theme files need migration** (one-time script)
- **jsDelivr dependency** (mitigated: fallback to local, jsDelivr is very stable)

### Neutral

- Portrait generation workflow unchanged (just different destination)
- Showcase site needs URL updates (automated via build)

## Implementation Plan

1. **Phase 1: Repository Setup**
   - Create `pennyfarthing-portraits` repo
   - Convert existing PNGs to WebP
   - Upload with directory structure
   - Tag v1.0.0 release

2. **Phase 2: Schema Migration**
   - Update theme YAML schema to support portrait object
   - Write migration script for existing themes
   - Update Cyclist UI portrait resolver

3. **Phase 3: Cleanup**
   - Remove `pennyfarthing-dist/personas/portraits/` from main repo
   - Update `.gitignore`
   - Document local cache installation

4. **Phase 4: Verification**
   - Test Cyclist UI with CDN portraits
   - Test offline mode with local cache
   - Verify showcase site
   - Monitor jsDelivr performance

## Alternatives Considered

### Git LFS

- Pros: Keeps "one repo" model
- Cons: Adds clone complexity, GitHub LFS bandwidth limits, still bloats working directory

### Cloudflare R2 / S3

- Pros: More control, custom domain
- Cons: Infrastructure to maintain, account setup, overkill for static images

### npm Package

- Pros: Standard tooling
- Cons: 100MB package limit (portraits exceed this)

### GitHub Releases Assets

- Pros: Simple, no extra repo
- Cons: Harder to version individual images, manual upload process

## References

- jsDelivr GitHub integration: https://www.jsdelivr.com/github
- WebP format: https://developers.google.com/speed/webp
- Current portrait count: ~1,000 images across 102 themes
