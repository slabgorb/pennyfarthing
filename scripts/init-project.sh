#!/bin/bash
# Initialize pennyfarthing in a new project
# Usage: init-project.sh <project-name> [project-root]

set -e

PROJECT_NAME="${1:?Usage: init-project.sh <project-name> [project-root]}"
PROJECT_ROOT="${2:-$(pwd)}"

echo "Initializing pennyfarthing for project: $PROJECT_NAME"
echo "Project root: $PROJECT_ROOT"
echo ""

# Verify we're in a project with .claude/pennyfarthing submodule
if [ ! -d "$PROJECT_ROOT/.claude/pennyfarthing" ]; then
    echo "Error: .claude/pennyfarthing submodule not found"
    echo "First add the submodule:"
    echo "  git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing"
    exit 1
fi

# Create project-specific directories
echo "Creating project-specific directories..."
mkdir -p "$PROJECT_ROOT/.claude/project"/{agents,skills,docs,hooks}

# Create agent sidecars
echo "Creating agent sidecars..."
for agent in dev tea sm reviewer architect pm tech-writer ux-designer devops orchestrator; do
    sidecar_dir="$PROJECT_ROOT/.claude/project/agents/${agent}-sidecar"
    mkdir -p "$sidecar_dir"

    if [ ! -f "$sidecar_dir/patterns.md" ]; then
        cat > "$sidecar_dir/patterns.md" << EOF
# ${PROJECT_NAME^} Patterns - ${agent^} Memory

## Project-Specific Knowledge

Add ${agent}-specific patterns, fixes, and knowledge here.

This file is loaded when the ${agent} agent activates.
EOF
    fi
done

# Create shared-context.md template
echo "Creating shared-context.md template..."
if [ ! -f "$PROJECT_ROOT/.claude/project/docs/shared-context.md" ]; then
    cat > "$PROJECT_ROOT/.claude/project/docs/shared-context.md" << EOF
# Shared Agent Context - $PROJECT_NAME

## Project Overview

- **Name:** $PROJECT_NAME
- **Type:** [Description]
- **Sprint Status:** \`sprint/current-sprint.yaml\`
- **Active Work:** \`.session/current-work.md\`

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

### Useful Scripts
| Script | Purpose |
|--------|---------|
| TODO | TODO |
EOF
fi

# Create agent-scopes.yaml template
echo "Creating agent-scopes.yaml..."
if [ ! -f "$PROJECT_ROOT/.claude/project/docs/agent-scopes.yaml" ]; then
    cat > "$PROJECT_ROOT/.claude/project/docs/agent-scopes.yaml" << EOF
# Agent Scope Configuration - $PROJECT_NAME
# Defines what context each agent type loads

strategic_agents:
  - orchestrator
  - pm
  - sm
  - architect
  - devops

tactical_agents:
  - dev
  - tea
  - reviewer
  - tech-writer
  - ux-designer

context_loading:
  # Strategic agents see both repos
  strategic:
    repos: all
    sprint: true
    session: true

  # Tactical agents focus on target repo
  tactical:
    repos: target_only
    sprint: false
    session: true

# Project-specific file patterns
file_patterns:
  api_repo: "TODO-api"
  ui_repo: "TODO-ui"
  test_patterns:
    api: "**/*_test.go"
    ui: "**/*.test.ts"
EOF
fi

# Create setup-env.sh hook with project variables
echo "Creating setup-env.sh hook..."
if [ ! -f "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh" ]; then
    cat > "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh" << EOF
#!/bin/bash
# Environment setup hook - runs on session start
# These variables are used by pennyfarthing agents and subagents

# Project identification
export PROJECT_ROOT="\${PROJECT_ROOT:-\$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
export PROJECT_NAME="$PROJECT_NAME"
export PROJECT_LABEL="$PROJECT_NAME"  # For Jira labels

# Repository names (used in subagents: \$API_REPO, \$UI_REPO)
export API_REPO="${PROJECT_NAME}-api"
export UI_REPO="${PROJECT_NAME}-ui"

# Test container name
export TEST_CONTAINER="${PROJECT_NAME}-test-postgres"

# Claude project path (for agent-session.sh)
export PROJECT_CLAUDE_PATH="-\$(echo "\$PROJECT_ROOT" | tr '/' '-' | sed 's/^-//')"

# Source .env if exists
[ -f "\$PROJECT_ROOT/.env" ] && set -a && source "\$PROJECT_ROOT/.env" && set +a
EOF
    chmod +x "$PROJECT_ROOT/.claude/project/hooks/setup-env.sh"
fi

# Create symlinks
echo "Creating symlinks..."
cd "$PROJECT_ROOT/.claude"

# Remove existing directories/symlinks if they exist
for target in agents subagents commands personas; do
    [ -e "$target" ] && rm -rf "$target"
done

# Create symlinks
ln -sf pennyfarthing/core/agents agents
ln -sf pennyfarthing/core/subagents subagents
ln -sf pennyfarthing/core/commands commands
ln -sf pennyfarthing/personas personas

# Copy persona-config.yaml if it doesn't exist
if [ ! -f persona-config.yaml ]; then
    cat > persona-config.yaml << 'EOF'
# Persona Configuration
# Controls agent personalities

# Theme: discworld, star-trek, literary-classics, minimalist
theme: discworld

# Personality attributes
attributes:
  verbosity: medium      # low | medium | high
  formality: casual      # formal | casual | playful
  humor: enabled         # enabled | disabled | subtle
  emoji_use: minimal     # none | minimal | frequent

# Per-agent overrides (optional)
overrides: {}
EOF
fi

# Create sprint and session directories at project root
mkdir -p "$PROJECT_ROOT/sprint"
mkdir -p "$PROJECT_ROOT/.session"

echo ""
echo "Done! Pennyfarthing initialized for $PROJECT_NAME"
echo ""
echo "Next steps:"
echo "1. Edit .claude/project/docs/shared-context.md with your project details"
echo "2. Edit .claude/project/docs/agent-scopes.yaml with your repos"
echo "3. Add project-specific skills to .claude/project/skills/"
echo "4. Test with: /sm or /new-work"
