---
name: electron-build
description: Electron build and distribution patterns for Cyclist. Use when building releases, configuring electron-builder, handling native modules, or setting up auto-updates.
---

# Electron Build Skill

## When to Use This Skill

- Building Cyclist for distribution
- Configuring electron-builder
- Handling native module compilation
- Setting up code signing
- Configuring auto-updates
- Troubleshooting build issues

## Build Process Overview

```
1. TypeScript compilation → dist/
2. Asset preparation → public/, assets/
3. electron-builder packaging → release/
```

## Quick Reference

```bash
# Development
cd packages/cyclist
pnpm dev              # Watch mode with hot reload

# Production build
pnpm build            # Compile TypeScript
pnpm package          # Create distributable (no installer)
pnpm build:mac        # macOS DMG/ZIP
pnpm build:win        # Windows NSIS/Portable
pnpm build:linux      # Linux AppImage/DEB
```

## electron-builder Configuration

### electron-builder.json

```json
{
  "appId": "com.pennyfarthing.cyclist",
  "productName": "Cyclist",
  "directories": {
    "output": "release",
    "buildResources": "assets"
  },
  "files": [
    "dist/**/*",
    "public/**/*",
    "node_modules/**/*"
  ],
  "asarUnpack": [
    "node_modules/**/*.node",
    "node_modules/**/*.wasm"
  ],
  "extraResources": ["assets/**"]
}
```

### Platform-Specific Settings

#### macOS

```json
{
  "mac": {
    "category": "public.app-category.developer-tools",
    "target": ["dmg", "zip"],
    "icon": "assets/icon.png",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "assets/entitlements.mac.plist",
    "entitlementsInherit": "assets/entitlements.mac.plist"
  }
}
```

**Required files:**
- `assets/icon.png` - 1024x1024 PNG
- `assets/entitlements.mac.plist` - macOS permissions

#### Windows

```json
{
  "win": {
    "target": ["nsis", "portable"],
    "icon": "assets/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

**Required files:**
- `assets/icon.ico` - 256x256 ICO

#### Linux

```json
{
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Development",
    "icon": "assets/icon.png"
  }
}
```

## Native Module Handling

### Problem: Native modules compiled for wrong Node version

**Solution 1: electron-rebuild**

```bash
pnpm rebuild:native
# or specifically:
npx electron-rebuild -f -w node-pty
```

**Solution 2: asarUnpack**

```json
{
  "asarUnpack": [
    "node_modules/**/*.node",
    "node_modules/**/*.wasm",
    "node_modules/better-sqlite3/**/*"
  ]
}
```

## Auto-Update Configuration

### electron-updater Setup

```typescript
// main.ts
import { autoUpdater } from 'electron-updater';

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
});

autoUpdater.on('update-downloaded', (info) => {
  // Prompt user to restart
  autoUpdater.quitAndInstall();
});
```

### Publish Configuration

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "cyclist"
  }
}
```

## Icon Generation

### Requirements

| Platform | Format | Size |
|----------|--------|------|
| macOS | PNG | 1024x1024 |
| Windows | ICO | 256x256 |
| Linux | PNG | 512x512 |

### Generation Script

```javascript
const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs').promises;

async function buildIcons() {
  const source = 'assets/icon-source.png';
  
  // macOS/Linux
  await sharp(source).resize(1024, 1024).toFile('assets/icon.png');
  
  // Windows
  const buf = await sharp(source).resize(256, 256).png().toBuffer();
  const ico = await toIco([buf]);
  await fs.writeFile('assets/icon.ico', ico);
}
```

## Build Optimization

### Exclude Unnecessary Files

```json
{
  "files": [
    "dist/**/*",
    "public/**/*",
    "node_modules/**/*",
    "!node_modules/**/*.md",
    "!node_modules/**/test/**/*",
    "!node_modules/**/*.test.js"
  ]
}
```

### TypeScript Optimization

```json
// tsconfig.json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "incremental": true
  }
}
```

## Troubleshooting

### ASAR-Related Errors

**Symptom:** `Cannot find module` at runtime

**Fix:** Add to `asarUnpack`:

```json
{
  "asarUnpack": ["node_modules/problematic-module/**/*"]
}
```

### Native Module Version Mismatch

**Symptom:** `The module was compiled against a different Node.js version`

**Fix:** Run electron-rebuild:

```bash
npx electron-rebuild -f -w <module-name>
```

### macOS "App is damaged" Error

**Symptom:** App won't open on macOS

**Fix:** Check entitlements.mac.plist:

```xml
<key>com.apple.security.cs.allow-jit</key>
<true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<true/>
```

### Build Size Too Large

**Fix:** Audit and exclude unnecessary files:

```bash
# Check what's included
npx asar list release/mac/Cyclist.app/Contents/Resources/app.asar | head -100
```

## Code Signing

### macOS

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=password
pnpm build:mac
```

### Windows

```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=password
pnpm build:win
```

## CI/CD Example

### GitHub Actions

```yaml
name: Build

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm build
      
      - name: Build (macOS)
        if: matrix.os == 'macos-latest'
        run: pnpm build:mac
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-\${{ matrix.os }}
          path: release/*
```

## Pre-Release Checklist

- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] Version bumped in package.json
- [ ] Native modules rebuilt
- [ ] Icons generated for all platforms
- [ ] Test on each target platform

## See Also

- `packages/cyclist/electron-builder.json` - Build configuration
- `packages/cyclist/package.json` - Build scripts
- `packages/cyclist/assets/` - Icons and resources
- electron-builder docs: https://www.electron.build/
