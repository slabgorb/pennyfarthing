# ADR-0010: ESM Module Requirements

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

Node.js supports two module systems:
1. **CommonJS (CJS)** - `require()` and `module.exports`
2. **ES Modules (ESM)** - `import` and `export`

The JavaScript ecosystem is transitioning from CJS to ESM. Modern tools and libraries increasingly require or prefer ESM. TypeScript with ESM requires specific configuration to work correctly with Node.js.

## Decision

Pennyfarthing uses ES Modules exclusively with strict TypeScript configuration.

### Package Configuration

```json
{
  "type": "module"
}
```

All packages in the monorepo declare `"type": "module"` in their `package.json`.

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### Critical Rule: .js Extensions Required

**All relative imports must include the `.js` extension.**

```typescript
// CORRECT
import { parseStatus } from './utils.js';
import type { Config } from './types.js';
import { logger } from '../shared/logger.js';

// WRONG - will fail at runtime
import { parseStatus } from './utils';
import type { Config } from './types';
import { logger } from '../shared/logger';
```

This is required because:
1. Node.js ESM requires explicit file extensions
2. TypeScript compiles `.ts` → `.js`, so imports must reference `.js`
3. `moduleResolution: "NodeNext"` enforces this at compile time

### Import Organization

```typescript
// 1. Node.js built-ins (no extension)
import { fileURLToPath } from 'url';
import { join } from 'path';

// 2. Third-party packages (no extension)
import express, { Express } from 'express';
import yaml from 'yaml';

// 3. Project imports (with .js extension)
import { publicDir } from './paths.js';
import type { StoryMetadata } from './types.js';
```

### Type-Only Imports

Use `import type` for type-only imports to enable tree-shaking:

```typescript
// Value import (included in bundle)
import { parseStory } from './parser.js';

// Type-only import (removed at compile time)
import type { StoryData } from './types.js';
```

## Consequences

### Positive

- **Modern ecosystem** - Compatible with latest tools and libraries
- **Tree-shaking** - Better bundle optimization with ESM
- **Static analysis** - Imports are statically analyzable
- **Future-proof** - ESM is the standard going forward
- **Top-level await** - Supported in ESM

### Negative

- **Extension verbosity** - Every import needs `.js`
- **Migration friction** - CJS dependencies may need wrapping
- **IDE confusion** - Some IDEs don't auto-complete with `.js`
- **Learning curve** - Developers used to CJS need adjustment

### Constraints

- **Always use .js extension** - For all relative imports
- **No require()** - Use `import` exclusively
- **Check runtime** - TypeScript compile success doesn't guarantee runtime success
- **Verify after refactoring** - Import paths easily break during refactoring

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module './file'` | Missing .js extension | Add `.js` to import |
| `ERR_MODULE_NOT_FOUND` | Extension missing at runtime | Add `.js` extension |
| `ERR_REQUIRE_ESM` | Using require() with ESM | Convert to import |
| `SyntaxError: Cannot use import` | CJS file trying to use import | Add `"type": "module"` or use `.mjs` |

## Alternatives Considered

### 1. CommonJS

Stick with traditional require/exports.

**Rejected:** Many modern packages are ESM-only. CJS is legacy. Would limit library choices.

### 2. Dual CJS/ESM

Support both module systems.

**Rejected:** Complexity of maintaining two builds. Configuration headaches. Not worth the effort for a new project.

### 3. Bundle to CJS

Use ESM in source but bundle to CJS for distribution.

**Rejected:** Adds build complexity. Hides the actual runtime behavior. Better to use ESM throughout.

### 4. extensionless Imports with Bundler

Use a bundler that handles extension resolution.

**Rejected:** Adds bundler dependency. Breaks debuggability. Node.js can run ESM directly.

## Implementation Notes

ESM was adopted from the initial project setup. The `.js` extension requirement has been the most common source of developer confusion.

Linting rules help catch missing extensions:
```javascript
// eslint.config.mjs
rules: {
  'import/extensions': ['error', 'always', { ignorePackages: true }]
}
```

## References

- BMAD Architecture Review (2026-01-19)
- Node.js ESM Documentation
- TypeScript Module Documentation
- https://nodejs.org/api/esm.html
