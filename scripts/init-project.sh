#!/bin/bash
# Initialize pennyfarthing in a new project
# Usage: init-project.sh <project-name> [project-root]
#
# Copies pennyfarthing files directly into the target project.
# For updates, use: pennyfarthing update

set -e

PROJECT_NAME="${1:?Usage: init-project.sh <project-name> [project-root]}"
PROJECT_ROOT="${2:-$(pwd)}"

# Define paths
CLAUDE_DIR="$PROJECT_ROOT/.claude"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PENNYFARTHING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Initializing pennyfarthing for project: $PROJECT_NAME"
echo "Project root: $PROJECT_ROOT"
echo "Source: $PENNYFARTHING_DIR"
echo ""

# Verify pennyfarthing source
if [ ! -f "$PENNYFARTHING_DIR/core/agents/sm.md" ]; then
    echo "Error: Cannot find pennyfarthing source at $PENNYFARTHING_DIR"
    echo "Run this script from the pennyfarthing repository."
    exit 1
fi

# Check for old submodule installation
if [ -d "$PROJECT_ROOT/.claude/pennyfarthing" ]; then
    echo "Error: Old submodule installation detected at .claude/pennyfarthing"
    echo ""
    echo "Please migrate first:"
    echo "  1. Run: pennyfarthing migrate"
    echo "  2. Or manually: rm -rf .claude/pennyfarthing && git rm .claude/pennyfarthing"
    echo ""
    exit 1
fi

# Create .claude directory
mkdir -p "$CLAUDE_DIR"

# Create project-specific directories
echo "Creating project directories..."
mkdir -p "$CLAUDE_DIR/project"/{agents,skills,docs,hooks}

# Create agent sidecars with three knowledge files
echo "Creating agent sidecars..."
for agent in dev tea sm reviewer architect pm tech-writer ux-designer devops orchestrator; do
    sidecar_dir="$CLAUDE_DIR/project/agents/${agent}-sidecar"
    mkdir -p "$sidecar_dir"

    # patterns.md - Implementation patterns discovered
    if [ ! -f "$sidecar_dir/patterns.md" ]; then
        cat > "$sidecar_dir/patterns.md" << 'EOF'
# Patterns

Implementation patterns discovered during work. Loaded when agent activates.

## Entry Format

```markdown
---
## [YYYY-MM-DD] [Story-ID] Pattern Title

**Context:** What situation triggered this
**Learning:** What we discovered
**Apply When:** When to use this knowledge
```

---
EOF
    fi

    # gotchas.md - Common mistakes and pitfalls
    if [ ! -f "$sidecar_dir/gotchas.md" ]; then
        cat > "$sidecar_dir/gotchas.md" << 'EOF'
# Gotchas

Things that bite you. Mistakes made so they're not repeated.

---
EOF
    fi

    # decisions.md - Past architectural decisions
    if [ ! -f "$sidecar_dir/decisions.md" ]; then
        cat > "$sidecar_dir/decisions.md" << 'EOF'
# Decisions

Past decisions that constrain future work. "We chose X because Y."

---
EOF
    fi
done

# Create shared-context.md template
echo "Creating shared-context.md..."
if [ ! -f "$CLAUDE_DIR/project/docs/shared-context.md" ]; then
    cat > "$CLAUDE_DIR/project/docs/shared-context.md" << EOF
# Shared Agent Context - $PROJECT_NAME

## Project Overview

- **Name:** $PROJECT_NAME
- **Type:** [Description]
- **Sprint Status:** \`sprint/current-sprint.yaml\`
- **Active Work:** \`.session/{story-id}-session.md\`

## Tech Stack

| Repo | Language | Framework |
|------|----------|-----------|
| TODO | TODO | TODO |

## Repository Structure

\`\`\`
$PROJECT_ROOT/
├── [your repos here]
└── .claude/
\`\`\`

## Git Branch Strategy

- **Branch from:** \`develop\`
- **PRs target:** \`develop\`
- **Main branch:** \`main\`

## Commands

### Development
\`\`\`bash
# Start dev servers
TODO

# Run tests
TODO
\`\`\`
EOF
fi

# Create repos.yaml
echo "Creating repos.yaml..."
if [ ! -f "$CLAUDE_DIR/project/repos.yaml" ]; then
    cat > "$CLAUDE_DIR/project/repos.yaml" << EOF
# Pennyfarthing Repository Configuration
version: "1.0"

repos:
  ${PROJECT_NAME}-api:
    path: "${PROJECT_NAME}-api"
    type: api
    language: go
    test_command: "just test"
    build_command: "just build"

  ${PROJECT_NAME}-ui:
    path: "${PROJECT_NAME}-ui"
    type: ui
    language: typescript
    test_command: "npm run test -- --run"
    build_command: "npm run build"

build_order:
  - ${PROJECT_NAME}-api
  - ${PROJECT_NAME}-ui
EOF
fi

# Create setup-env.sh hook
echo "Creating setup-env.sh hook..."
if [ ! -f "$CLAUDE_DIR/project/hooks/setup-env.sh" ]; then
    cat > "$CLAUDE_DIR/project/hooks/setup-env.sh" << EOF
#!/bin/bash
# Environment setup hook - runs on session start

# Project identification
export PROJECT_ROOT="\${PROJECT_ROOT:-\$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
export PROJECT_NAME="$PROJECT_NAME"
export PROJECT_LABEL="$PROJECT_NAME"

# Repository names
export API_REPO="${PROJECT_NAME}-api"
export UI_REPO="${PROJECT_NAME}-ui"

# Test container
export TEST_CONTAINER="${PROJECT_NAME}-test-postgres"

# Source .env if exists
[ -f "\$PROJECT_ROOT/.env" ] && set -a && source "\$PROJECT_ROOT/.env" && set +a
EOF
    chmod +x "$CLAUDE_DIR/project/hooks/setup-env.sh"
fi

# Copy core files
echo "Installing core files..."
mkdir -p "$CLAUDE_DIR/core"
cp -r "$PENNYFARTHING_DIR/core/agents" "$CLAUDE_DIR/core/"
cp -r "$PENNYFARTHING_DIR/core/subagents" "$CLAUDE_DIR/core/"
cp -r "$PENNYFARTHING_DIR/core/commands" "$CLAUDE_DIR/core/"
cp -r "$PENNYFARTHING_DIR/core/guides" "$CLAUDE_DIR/core/"
cp -r "$PENNYFARTHING_DIR/personas" "$CLAUDE_DIR/"
cp -r "$PENNYFARTHING_DIR/skills" "$CLAUDE_DIR/"

# Copy statusline
if [ -f "$PENNYFARTHING_DIR/core/statusline.sh" ]; then
    cp "$PENNYFARTHING_DIR/core/statusline.sh" "$CLAUDE_DIR/core/"
    cp "$PENNYFARTHING_DIR/core/statusline.sh" "$CLAUDE_DIR/statusline.sh"
    chmod +x "$CLAUDE_DIR/statusline.sh" "$CLAUDE_DIR/core/statusline.sh"
fi

# Create convenience symlinks in .claude/
cd "$CLAUDE_DIR"
ln -sf core/agents agents
ln -sf core/subagents subagents
ln -sf core/commands commands
ln -sf core/guides guides

# Create persona-config.yaml
if [ ! -f persona-config.yaml ]; then
    cat > persona-config.yaml << 'EOF'
# Persona Configuration
theme: discworld

attributes:
  verbosity: medium
  formality: casual
  humor: enabled
  emoji_use: minimal

overrides: {}
EOF
fi

# Create sprint and session directories
cd "$PROJECT_ROOT"
mkdir -p sprint .session
touch sprint/.gitkeep .session/.gitkeep

# Update .gitignore
echo "Updating .gitignore..."
GITIGNORE="$PROJECT_ROOT/.gitignore"
GITIGNORE_ENTRIES="
# Pennyfarthing session files
.session/*
!.session/.gitkeep

# Claude Code settings
.claude/settings.local.json
.claude/settings.json
"

if ! grep -q "Pennyfarthing session files" "$GITIGNORE" 2>/dev/null; then
    echo "$GITIGNORE_ENTRIES" >> "$GITIGNORE"
fi

# Install scripts
echo "Installing scripts..."
mkdir -p scripts/hooks scripts/utils

# Copy key scripts
for script in check-context.sh agent-session.sh repo-utils.sh worktree-manager.sh; do
    if [ -f "$PENNYFARTHING_DIR/scripts/$script" ]; then
        cp "$PENNYFARTHING_DIR/scripts/$script" "scripts/$script"
        chmod +x "scripts/$script"
    fi
done

# Copy hooks
if [ -d "$PENNYFARTHING_DIR/scripts/hooks" ]; then
    cp -r "$PENNYFARTHING_DIR/scripts/hooks/"* scripts/hooks/
    chmod +x scripts/hooks/*.sh 2>/dev/null || true
fi

# Copy utils
if [ -d "$PENNYFARTHING_DIR/scripts/utils" ]; then
    cp -r "$PENNYFARTHING_DIR/scripts/utils/"* scripts/utils/
    chmod +x scripts/utils/*.sh 2>/dev/null || true
fi

# Create settings.local.json
echo "Creating settings.local.json..."
if [ ! -f "$CLAUDE_DIR/settings.local.json" ]; then
    cat > "$CLAUDE_DIR/settings.local.json" << 'EOF'
{
  "statusLine": {
    "type": "command",
    "command": "$CLAUDE_PROJECT_DIR/.claude/statusline.sh"
  },
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "Edit(.claude/**)",
      "Edit(sprint/**)",
      "Edit(.session/**)",
      "Write(.claude/**)",
      "Write(sprint/**)",
      "Write(.session/**)",
      "Skill(sm)",
      "Skill(tea)",
      "Skill(dev)",
      "Skill(reviewer)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/session-start.sh"
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/project/hooks/setup-env.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/pre-edit-check.sh"
          }
        ]
      }
    ]
  }
}
EOF
else
    # Check for broken paths in existing settings
    if grep -q '\.claude/pennyfarthing/' "$CLAUDE_DIR/settings.local.json" 2>/dev/null; then
        echo ""
        echo "WARNING: settings.local.json has old .claude/pennyfarthing/ paths!"
        echo "Update to use: \$CLAUDE_PROJECT_DIR/scripts/hooks/"
    fi
fi

# Create manifest
echo "Creating manifest..."
VERSION=$(cat "$PENNYFARTHING_DIR/VERSION" 2>/dev/null || echo "0.0.0")
cat > "$CLAUDE_DIR/manifest.json" << EOF
{
  "version": "$VERSION",
  "installedAt": "$(date -Iseconds)",
  "projectName": "$PROJECT_NAME",
  "installMethod": "direct"
}
EOF

echo ""
echo "Done! Pennyfarthing initialized for $PROJECT_NAME"
echo ""
echo "Next steps:"
echo "1. Edit .claude/project/repos.yaml with your repository structure"
echo "2. Edit .claude/project/docs/shared-context.md with project details"
echo "3. Test with: /sm or /new-work"
echo ""
echo "To update pennyfarthing later: pennyfarthing update"
