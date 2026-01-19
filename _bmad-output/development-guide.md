# Development Guide

## Prerequisites

- Node.js >= 18.0.0
- pnpm 9.0.0+
- Git

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/1898andCo/pennyfarthing.git
cd pennyfarthing
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build All Packages

```bash
npm run build
```

### 4. Verify Installation

```bash
npm test
```

## Development Workflow

### Watch Mode (Recommended)

```bash
# All packages in watch mode
npm run dev

# Or specific package
pnpm --filter @pennyfarthing/core dev
pnpm --filter @pennyfarthing/cyclist dev
```

### Build Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all packages |
| `npm run dev` | Watch mode |
| `npm run clean` | Remove dist/ directories |
| `npm test` | Run all tests |
| `npm run lint` | ESLint check |

### Package-Specific Commands

```bash
# Core package
pnpm --filter @pennyfarthing/core build
pnpm --filter @pennyfarthing/core test

# Cyclist package
pnpm --filter @pennyfarthing/cyclist build
pnpm --filter @pennyfarthing/cyclist test
pnpm --filter @pennyfarthing/cyclist dev:server  # Web server only
pnpm --filter @pennyfarthing/cyclist dev:once    # Electron app

# Shared package
pnpm --filter @pennyfarthing/shared build
```

## Running Cyclist

### Desktop (Electron)

```bash
cd packages/cyclist
npm run dev:once
```

### Web Server Only

```bash
cd packages/cyclist
npm run dev:server
# Access at http://localhost:3000
```

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Package Tests

```bash
# Core (Node.js native)
pnpm --filter @pennyfarthing/core test

# Cyclist (Vitest)
pnpm --filter @pennyfarthing/cyclist test

# Cyclist with watch
cd packages/cyclist && npx vitest
```

### Test Coverage

```bash
cd packages/cyclist
npm run test:coverage
# Report at packages/cyclist/coverage/index.html
```

## Linting

```bash
# Check all packages
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

## Common Development Tasks

### Adding a New CLI Command

1. Create `packages/core/src/cli/commands/{command}.ts`
2. Register in `packages/core/src/cli/index.ts`
3. Add tests in `packages/core/src/cli/commands/{command}.test.ts`
4. Build and test

### Adding a New Skill

1. Create `pennyfarthing-dist/skills/{skill-name}/skill.md`
2. Follow frontmatter format from existing skills
3. Run `./scripts/utils/generate-skill-docs.sh`
4. Verify via Claude Code `/skill-name`

### Adding a New Agent

1. Create `pennyfarthing-dist/agents/{agent}.md`
2. Add to relevant workflow if needed
3. Create sidecar directory in `.pennyfarthing/sidecars/{agent}/`
4. Update docs/AGENTS.md

### Modifying TypeScript Code

1. Edit `.ts` files in `packages/*/src/`
2. Run `npm run build`
3. Run tests
4. Commit both `src/` AND `dist/` changes

## Debugging

### TypeScript Errors

```bash
# Check without emitting
npx tsc --noEmit

# Check specific package
cd packages/core && npx tsc --noEmit
```

### Runtime Errors

```bash
# Run with Node.js debugging
node --inspect packages/cyclist/dist/server.js
```

### Test Debugging

```bash
# Vitest with UI
cd packages/cyclist && npx vitest --ui

# Node.js test with verbose
node --test --test-reporter=spec dist/**/*.test.js
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CYCLIST_PORT` | Web server port | 3000 |
| `CYCLIST_MODE` | Running mode | (auto-detected) |
| `NODE_ENV` | Environment | development |

## Project Structure Quick Reference

```
packages/
├── core/src/
│   ├── cli/commands/     # CLI commands
│   ├── bmad/             # BMAD parsing
│   ├── jira/             # Jira integration
│   └── workflow/         # Workflow routing
├── cyclist/src/
│   ├── server.ts         # Express server
│   ├── main.ts           # Electron main
│   ├── api/              # REST routes
│   └── public/js/        # Frontend
└── shared/src/
    └── index.ts          # Utilities

pennyfarthing-dist/
├── agents/               # Agent definitions
├── commands/             # Slash commands
├── skills/               # Knowledge domains
├── workflows/            # Workflow definitions
└── personas/             # Themed characters
```

## Git Workflow

### Feature Branch

```bash
git checkout develop
git pull
git checkout -b feat/{story-id}-{description}

# Make changes
npm run build
npm test

git add .
git commit -m "feat(story-id): description"
git push -u origin HEAD
```

### Pull Request

1. Push feature branch
2. Create PR to `develop`
3. Wait for CI (build + tests + lint)
4. Request review
5. Merge after approval

## Troubleshooting

### pnpm install fails

```bash
# Clear cache and retry
pnpm store prune
rm -rf node_modules
pnpm install
```

### Build fails

```bash
# Clean and rebuild
npm run clean
npm run build
```

### Symlinks broken

```bash
# Re-run doctor
./packages/core/bin/pennyfarthing.js doctor --fix
```

### Tests fail

```bash
# Check specific failure
npm test -- --reporter=verbose

# Run single test file
cd packages/cyclist
npx vitest run tests/B-server.test.ts
```

## IDE Setup

### VSCode Extensions

- ESLint
- TypeScript and JavaScript Language Features
- Prettier (optional)

### Recommended Settings

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": false,
  "eslint.validate": ["typescript"]
}
```

## Release Process

1. Ensure `develop` is stable
2. Update version in root `package.json`
3. Update `CHANGELOG.md`
4. Create PR to `main`
5. After merge, create GitHub release
6. CI publishes to npm automatically
