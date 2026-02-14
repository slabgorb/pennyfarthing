#!/usr/bin/env bash
# story-template.sh - Show story templates by type
# Usage: story-template.sh [bug|feature|refactor|chore]
#   No args: Show all templates
#   type:    Show specific template

set -euo pipefail

TYPE="${1:-}"

print_bug() {
    cat << 'EOF'
## Bug Fix Story Template

```yaml
- id: PROJ-XXXXX
  title: "[Component] Bug description"
  description: |
    **Symptom:** What user sees
    **Error:** Error message or behavior
    **Affected:** Pages/endpoints impacted
  points: 2-3
  priority: P1
  status: backlog
  workflow: tdd
  acceptance_criteria:
    - Bug no longer occurs under [conditions]
    - Regression test added covering the bug
    - Related code audited for same issue
```

**Sizing hints:**
- Simple fix with clear cause: 2 pts
- Investigation needed: 3 pts
- Multiple components affected: 5 pts
EOF
}

print_feature() {
    cat << 'EOF'
## Feature Story Template

```yaml
- id: PROJ-XXXXX
  title: "[Action verb] [what] for [who/where]"
  description: |
    User can [action] to [benefit].
    [Additional context if needed]
  points: 3-8
  priority: P2
  status: backlog
  workflow: tdd
  acceptance_criteria:
    - Feature works as specified
    - UI matches design (if applicable)
    - API documented (if applicable)
    - Tests cover happy path and edge cases
    - Error handling implemented
```

**Sizing hints:**
- Single component: 3 pts
- API + UI: 5 pts
- Cross-repo/complex: 8 pts
EOF
}

print_refactor() {
    cat << 'EOF'
## Refactor Story Template

```yaml
- id: PROJ-XXXXX
  title: "Refactor [component] to [improvement]"
  description: |
    Current: [what exists now]
    Target: [what it should become]
    Why: [reason for change]
  points: 3-5
  priority: P2
  status: backlog
  workflow: tdd
  acceptance_criteria:
    - All existing tests pass
    - No behavior changes (unless explicitly scoped)
    - Code follows new pattern
    - Documentation updated
```

**Sizing hints:**
- Extract/rename: 2-3 pts
- Restructure module: 5 pts
- Architecture change: 8 pts (consider splitting)
EOF
}

print_chore() {
    cat << 'EOF'
## Chore Story Template

```yaml
- id: PROJ-XXXXX
  title: "[Action] [what]"
  description: |
    [What needs to be done and why]
  points: 1-2
  priority: P2
  status: backlog
  workflow: trivial
  acceptance_criteria:
    - Task completed
    - No regressions introduced
```

**Examples:**
- Update dependencies
- Fix typo in docs
- Remove dead code
- Update config values

**Note:** Chores typically use a lightweight workflow.
EOF
}

print_all() {
    cat << 'EOF'
# Story Templates

Use these templates when adding stories to sprint YAML.

EOF
    print_bug
    echo ""
    print_feature
    echo ""
    print_refactor
    echo ""
    print_chore
}

case "$TYPE" in
    bug)
        print_bug
        ;;
    feature)
        print_feature
        ;;
    refactor)
        print_refactor
        ;;
    chore)
        print_chore
        ;;
    "")
        print_all
        ;;
    *)
        echo "Unknown type: $TYPE"
        echo "Valid types: bug, feature, refactor, chore"
        exit 1
        ;;
esac
