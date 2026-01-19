# Technology Stack

## Runtime Environment

| Component | Version | Notes |
|-----------|---------|-------|
| **Node.js** | >=18.0.0 | Minimum requirement |
| **pnpm** | 9.0.0 | Workspace package manager |
| **Module System** | ESM | `"type": "module"` in all packages |

## Language & Type System

| Component | Version | Configuration |
|-----------|---------|---------------|
| **TypeScript** | ^5.3.3 | Strict mode enabled |
| **Target** | ES2022 | Modern JavaScript features |
| **Module** | NodeNext | Node.js-aware resolution |

**TypeScript Compiler Options:**
```json
{
  "strict": true,
  "target": "ES2022",
  "module": "NodeNext",
  "declaration": true,
  "declarationMap": true,
  "sourceMap": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "resolveJsonModule": true
}
```

## Package Architecture

### @pennyfarthing/core

| Dependency | Version | Purpose |
|------------|---------|---------|
| commander | ^12.1.0 | CLI argument parsing |
| chalk | ^5.3.0 | Terminal color output |
| inquirer | ^9.2.12 | Interactive prompts |
| yaml | ^2.3.4 | YAML parsing |
| fs-extra | ^11.2.0 | File system utilities |
| open | ^11.0.0 | Cross-platform app launcher |

### @pennyfarthing/cyclist

| Category | Dependency | Version | Purpose |
|----------|-----------|---------|---------|
| **Server** | express | ^4.18.2 | HTTP server |
| **WebSocket** | ws | ^8.14.2 | Real-time communication |
| **Terminal** | node-pty | ^1.1.0 | PTY abstraction |
| **Editor** | @tiptap/core | ^2.27.1 | Rich text editing |
| **Config** | yaml | ^2.8.2 | YAML parsing |
| **Desktop** | electron | ^39.2.7 | Desktop framework |

### @pennyfarthing/shared

No external dependencies (minimal footprint).

## Build Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **tsc** | ^5.3.3 | TypeScript compilation |
| **esbuild** | ^0.27.2 | TipTap bundling (fast) |
| **electron-builder** | ^24.9.1 | Desktop app packaging |
| **concurrently** | ^9.2.1 | Parallel script execution |
| **tsx** | ^4.6.2 | TypeScript execution |

## Testing Framework

| Package | Framework | Configuration |
|---------|-----------|---------------|
| **core** | Node.js native | `node --test dist/**/*.test.js` |
| **shared** | Node.js native | `node --test dist/**/*.test.js` |
| **cyclist** | Vitest 4.0 | `vitest.config.ts` with happy-dom |

**Vitest Configuration:**
```typescript
{
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
}
```

## Linting & Code Quality

| Tool | Version | Configuration |
|------|---------|---------------|
| **ESLint** | 9.x | Flat config (`eslint.config.mjs`) |
| **typescript-eslint** | Latest | TypeScript rules |

**Key ESLint Rules:**
- `@typescript-eslint/no-unused-vars`: warn (ignore `_` prefix)
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-require-imports`: off
- Files: `packages/*/src/**/*.ts` only

## Desktop Application (Cyclist)

| Aspect | Value |
|--------|-------|
| **Framework** | Electron 39.2.7 |
| **App ID** | com.cyclist.app |
| **Product Name** | Cyclist |
| **Mac Targets** | DMG, ZIP |
| **Windows Targets** | NSIS, Portable |
| **Linux Targets** | AppImage, DEB |

## Additional Languages

| Language | Version | Usage |
|----------|---------|-------|
| **Python** | 3.14 | Benchmarking, evaluation scripts |
| **Go** | Latest | Benchmark implementations |
| **Bash** | 3.2+ | 20+ utility scripts |

## Build Pipeline

```bash
npm run build
├── pnpm --filter @pennyfarthing/shared build
│   └── tsc
├── pnpm --filter @pennyfarthing/core build
│   └── tsc
├── pnpm --filter @pennyfarthing/cyclist build
│   ├── npm run build:commands
│   ├── tsc --build
│   ├── tsc -p tsconfig.preload.json
│   └── npm run build:editor (esbuild)
└── ./scripts/utils/generate-skill-docs.sh
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all packages |
| `npm run dev` | Watch mode (all packages) |
| `npm test` | Run all tests |
| `npm run lint` | ESLint check |
| `npm run clean` | Remove dist/ directories |

## CI/CD

| Platform | Workflows |
|----------|-----------|
| **GitHub Actions** | ci.yml (build/test), publish.yml (npm), deploy-showcase.yml |

**CI Pipeline:**
1. Checkout code
2. Setup Node.js 20.x + pnpm 9
3. Install dependencies (cached)
4. Build all packages
5. Run tests (Node.js native + Vitest)
6. Run ESLint

## Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root workspace, scripts, root deps |
| `pnpm-workspace.yaml` | Workspace definition |
| `tsconfig.base.json` | Shared TypeScript options |
| `eslint.config.mjs` | Linting rules |
| `packages/cyclist/vitest.config.ts` | Cyclist test config |
| `.github/workflows/*.yml` | CI/CD pipelines |
