# Cyclist Validation Checklist

This checklist enables distributed testing across team members with different system configurations. Use it to verify Cyclist works correctly in your environment.

## Test Matrix

| Scenario | Fresh System | Dev System | Post-Upgrade |
|----------|--------------|------------|--------------|
| Fresh install | Test A1 | Test B1 | N/A |
| Clean checkout | Test A2 | Test B2 | N/A |
| Upgrade from previous | N/A | Test B3 | Test C1 |

### System Configuration Categories

**Fresh System:** No Node.js, pnpm, or dev tools installed
**Dev System:** Has Node.js, pnpm, build tools already installed
**Post-Upgrade:** Had Cyclist installed, upgrading to new version

## Prerequisites Checklist

Before testing, document your system configuration:

```
System Configuration Report
===========================
macOS Version: _____________ (e.g., Sequoia 15.2, Sonoma 14.x, Ventura 13.x)
Node.js Version: ___________ (e.g., 18.x, 20.x, 22.x, or "not installed")
pnpm Version: ______________ (e.g., 9.x, or "not installed")
just Version: ______________ (e.g., 1.x, or "not installed")
Python 3: __________________ (e.g., 3.12, or "not installed")
Xcode CLI Tools: ___________ (yes/no)
Previous Cyclist: __________ (yes/no, if yes: version)
```

## Test Scenarios

### Scenario A: Fresh Install (No Prior Cyclist)

For users who have never installed Cyclist before.

#### A1: Fresh System (Minimal Prerequisites)

1. **Start with minimal system** (only macOS, no dev tools)

2. **Install prerequisites**
   ```bash
   # Install Xcode CLI tools
   xcode-select --install

   # Install Homebrew (if not present)
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

   # Install just
   brew install just

   # Install Node.js
   brew install node

   # Enable pnpm via corepack
   corepack enable
   ```

3. **Clone and setup**
   ```bash
   git clone <pennyfarthing-repo>
   cd pennyfarthing
   pnpm install
   just cyclist-setup
   ```

4. **Run doctor**
   ```bash
   just cyclist-doctor
   ```

5. **Test Electron app**
   ```bash
   just cyclist-electron
   ```

6. **Test web mode**
   ```bash
   just cyclist-web /path/to/pennyfarthing-project
   ```

**Expected Results:**
- [ ] `pnpm install` completes without errors
- [ ] `just cyclist-setup` completes successfully
- [ ] `just cyclist-doctor` shows all checks passing
- [ ] Electron app opens folder picker, can select project
- [ ] Web mode starts, accessible at http://localhost:1898

#### A2: Clean Checkout (Dev System)

For developers with existing tools who clone fresh.

1. **Verify prerequisites**
   ```bash
   node --version    # Should be >= 18
   pnpm --version    # Should be >= 9
   just --version    # Should be >= 1
   ```

2. **Clone fresh**
   ```bash
   git clone <pennyfarthing-repo>
   cd pennyfarthing
   ```

3. **Setup**
   ```bash
   pnpm install
   just cyclist-setup
   ```

4. **Validate**
   ```bash
   just cyclist-doctor
   just cyclist-electron
   ```

**Expected Results:**
- [ ] `pnpm install` completes without workspace errors
- [ ] `just cyclist-setup` completes in under 2 minutes
- [ ] `just cyclist-doctor` shows all checks passing
- [ ] Electron app launches successfully

### Scenario B: Upgrade Path

For users upgrading from a previous Cyclist version.

#### B3: Upgrade on Dev System

1. **Document current state**
   ```bash
   # Check current Cyclist version
   cat packages/cyclist/package.json | grep version

   # Check for existing artifacts
   ls -la packages/cyclist/dist/
   ls -la /Applications/Cyclist.app 2>/dev/null
   which cyclist
   ```

2. **Pull latest**
   ```bash
   git pull origin develop
   ```

3. **Run upgrade path**
   ```bash
   just cyclist-setup        # Cleans old artifacts, rebuilds
   just cyclist-doctor --fix # Diagnose and auto-fix
   ```

4. **Reinstall app (if using installed version)**
   ```bash
   just cyclist-install
   ```

5. **Validate**
   ```bash
   just cyclist-doctor
   just cyclist-electron
   ```

**Expected Results:**
- [ ] `just cyclist-setup` cleans stale artifacts before rebuilding
- [ ] `just cyclist-doctor --fix` resolves any issues
- [ ] No "module not found" errors after upgrade
- [ ] Electron app launches with new version

#### C1: Post-Upgrade Validation

After upgrading, verify these specific areas:

1. **Native module compatibility**
   ```bash
   # Should load without errors
   node -e "require('./packages/cyclist/node_modules/node-pty')"
   ```

2. **Workspace symlinks**
   ```bash
   # Should show valid symlinks
   ls -la packages/cyclist/node_modules/@pennyfarthing/
   ```

3. **CLI wrapper (if installed)**
   ```bash
   # Should point to current repo
   cyclist --version 2>/dev/null || echo "CLI not installed"
   ```

**Expected Results:**
- [ ] node-pty loads without ABI mismatch errors
- [ ] @pennyfarthing/core and @pennyfarthing/shared symlinks valid
- [ ] CLI wrapper points to correct location (or intentionally not installed)

## Known Issues

### macOS Sequoia (15.x)

- **Issue:** First-time Xcode CLI tools install may require restart
- **Workaround:** Restart terminal after `xcode-select --install`

### Node.js 22.x

- **Issue:** Some native module prebuilds may not exist for Node 22
- **Workaround:** Use `just cyclist-rebuild` to compile from source

### Without `just` Command Runner

If testing without `just`:

```bash
# Equivalent commands without just
cd packages/cyclist
npm run build                           # instead of just cyclist-build
npx electron-rebuild                    # instead of just cyclist-rebuild
npm run dev                             # instead of just cyclist-electron
WHEELHUB_PROJECT_DIR=/path pf bikerack start  # instead of just cyclist-web
./scripts/cyclist-doctor.sh             # instead of just cyclist-doctor
```

### Port Conflicts

- **Issue:** Port 1898 in use by another process
- **Expected Behavior:** Cyclist auto-selects next available port (1899, 1900, etc.)
- **Verify:** Check console output for actual port

## Results Reporting

After completing validation, report results using this format:

```
Cyclist Validation Report
=========================
Date: YYYY-MM-DD
Tester: [Your Name]
Scenario: [A1/A2/B3/C1]

System Configuration:
- macOS: [version]
- Node.js: [version]
- pnpm: [version]
- just: [version or "not used"]
- Previous Cyclist: [yes/no, version if yes]

Results:
- [ ] Prerequisites installed successfully
- [ ] pnpm install completed
- [ ] cyclist-setup completed
- [ ] cyclist-doctor passed
- [ ] Electron app launched
- [ ] Web mode accessible

Issues Encountered:
[Describe any issues, errors, or unexpected behavior]

Notes:
[Any additional observations]
```

Submit reports via:
1. Slack in #pennyfarthing-dev channel
2. GitHub issue on pennyfarthing repo
3. Direct message to project maintainer

## Quick Reference

| Task | Command |
|------|---------|
| Full setup | `just cyclist-setup` |
| Diagnose issues | `just cyclist-doctor` |
| Auto-fix issues | `just cyclist-doctor --fix` |
| Run Electron | `just cyclist-electron` |
| Run web mode | `just cyclist-web /path` |
| Rebuild native | `just cyclist-rebuild` |
| Install app | `just cyclist-install` |
