# Multi-Account Claude Code Setup

A guide for developers who use multiple Claude Max Pro accounts and need to keep their data separate.

## The Problem

Claude Code stores all configuration and data in `~/.claude` regardless of which account you're logged into. If you have multiple accounts (personal + work, or multiple client accounts), this creates issues:

- Conversation history mixes between accounts
- Usage tracking conflates all accounts
- Settings from one account affect another
- No way to see per-account usage statistics

## The Solution

Use a symlink-based switching system:

1. Create separate directories for each account
2. Use `~/.claude` as a symlink pointing to the active account
3. Shell functions to switch between accounts
4. Startup notification showing which account is active

## Setup

### Step 1: Create Account Directories

Create a directory for each account you use:

```bash
# Stop Claude Code if running
# Then create account-specific directories

# For personal account
mv ~/.claude ~/.claude-personal

# For work account
mkdir ~/.claude-work

# Create initial symlink to personal
ln -s ~/.claude-personal ~/.claude
```

If you're starting fresh (no existing `~/.claude`):

```bash
mkdir ~/.claude-personal
mkdir ~/.claude-work
ln -s ~/.claude-personal ~/.claude
```

### Step 2: Add Shell Functions

Add these functions to your `~/.zshrc` (or `~/.bashrc` for bash):

```bash
# Claude Code Multi-Account Management
# -----------------------------------

# Switch to personal Claude account
claude-personal() {
  rm -f ~/.claude
  ln -s ~/.claude-personal ~/.claude
  echo "Switched to personal Claude account"
}

# Switch to work Claude account
claude-work() {
  rm -f ~/.claude
  ln -s ~/.claude-work ~/.claude
  echo "Switched to work Claude account"
}

# Show which Claude account is active
claude-which() {
  if [[ -L ~/.claude ]]; then
    local target=$(readlink ~/.claude)
    local account=${target##*/.claude-}
    echo "Active Claude account: $account"
  else
    echo "~/.claude is not a symlink (single account mode)"
  fi
}
```

For additional accounts (e.g., client projects):

```bash
# Switch to client-x Claude account
claude-clientx() {
  rm -f ~/.claude
  ln -s ~/.claude-clientx ~/.claude
  echo "Switched to client-x Claude account"
}
```

### Step 3: Reload Shell Configuration

```bash
source ~/.zshrc
```

## Daily Workflow

### Switching Accounts

Before starting work, switch to the appropriate account:

```bash
# Start of workday - switch to work account
claude-work

# Evening - switch to personal projects
claude-personal
```

### Checking Active Account

Verify which account is active:

```bash
claude-which
# Output: Active Claude account: work
```

### Starting Claude Code

After switching accounts, start Claude Code normally:

```bash
claude
```

All data (conversations, settings, cache) will be stored in the active account's directory.

## Usage Tracking with ccusage

The `ccusage` tool shows Claude API usage statistics. With multi-account setup, you can check usage per account.

### Installing ccusage

```bash
npm install -g ccusage
```

### Checking Usage for Active Account

```bash
ccusage
```

This shows usage for whichever account `~/.claude` currently points to.

### Checking Usage for a Specific Account

To check a different account without switching:

```bash
# Temporarily point to another account's data
CLAUDE_CONFIG_DIR=~/.claude-work ccusage

# Or check personal account
CLAUDE_CONFIG_DIR=~/.claude-personal ccusage
```

### Usage Output

```
Claude Code Usage Report
========================
Period: Last 30 days

Total tokens: 1,234,567
  - Input:  456,789
  - Output: 777,778

Conversations: 42
Average tokens/conversation: 29,394
```

## Conditional Startup Message

Show which account is active when opening a new terminal.

### Basic Notification

Add to your `~/.zshrc` (at the end):

```bash
# Show active Claude account on shell startup
if [[ -L ~/.claude ]]; then
  local target=$(readlink ~/.claude)
  local account=${target##*/.claude-}
  echo "Claude account: $account"
fi
```

### Conditional Display (Only for Configured Users)

To only show the message when multi-account is set up:

```bash
# Show Claude account only if multi-account is configured
if [[ -L ~/.claude ]] && [[ -d ~/.claude-personal || -d ~/.claude-work ]]; then
  local target=$(readlink ~/.claude)
  local account=${target##*/.claude-}
  echo "Claude account: $account"
fi
```

### Color-Coded Display

```bash
# Color-coded Claude account indicator
if [[ -L ~/.claude ]]; then
  local target=$(readlink ~/.claude)
  local account=${target##*/.claude-}
  case $account in
    personal) echo "\033[0;32mClaude: personal\033[0m" ;;  # Green
    work)     echo "\033[0;34mClaude: work\033[0m" ;;      # Blue
    *)        echo "\033[0;33mClaude: $account\033[0m" ;;  # Yellow
  esac
fi
```

## Troubleshooting

### "~/.claude is not a symlink"

You're in single-account mode. Follow the setup steps to create account directories and the symlink.

### Claude Code doesn't see the switch

Claude Code reads `~/.claude` at startup. If you switch accounts while Claude is running, restart Claude Code for changes to take effect.

### Permissions errors

Ensure the symlink and directories have correct ownership:

```bash
ls -la ~/.claude
# Should show: lrwxr-xr-x ... .claude -> .claude-personal

ls -la ~/.claude-personal
# Should show: drwx------ ... .claude-personal
```

### Symlink points to wrong location

Fix with:

```bash
rm ~/.claude
ln -s ~/.claude-work ~/.claude  # or whichever account
```

## Directory Structure

After setup, your home directory includes:

```
~/
├── .claude -> .claude-personal    # Symlink to active account
├── .claude-personal/              # Personal account data
│   ├── settings.json
│   ├── conversations/
│   └── ...
├── .claude-work/                  # Work account data
│   ├── settings.json
│   ├── conversations/
│   └── ...
└── .zshrc                         # Shell functions
```

## Security Notes

- Each account directory contains API credentials and conversation history
- Keep directories private: `chmod 700 ~/.claude-*`
- Don't commit these directories to version control
- Consider different settings per account (e.g., stricter permissions for work)

## Related

- [Getting Started](GETTING-STARTED.md) - Initial Pennyfarthing setup
- [Configuration](CONFIGURATION.md) - Project configuration options
- [Permissions](PERMISSIONS.md) - Claude Code permission settings
