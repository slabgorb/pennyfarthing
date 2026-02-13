#!/usr/bin/env bash
# size-story.sh - Display story sizing guidelines
# Usage: size-story.sh [points]
#   No args: Show all sizing guidelines
#   points:  Show specific guidance for that point value

set -euo pipefail

POINTS="${1:-}"

print_all() {
    cat << 'EOF'
# Story Sizing Guidelines

| Points | Scale | Complexity | Testing |
|--------|-------|------------|---------|
| 1-2 | Trivial | Single file, config | Minimal/none |
| 3 | Small | Few files, single component | Some tests |
| 5 | Medium | Multiple files, cross-layer | Comprehensive |
| 8 | Large | Significant scope, cross-repo | Extensive |
| 13+ | Epic | **SPLIT THIS** | N/A |

## 1-2 Points (Trivial)
- Single file change
- Config update
- Simple bug fix
- Minimal or no new tests needed

## 3 Points (Small)
- Few files changed
- Single component/handler
- Straightforward implementation
- Some tests needed

## 5 Points (Medium)
- Multiple files across layers
- New feature component
- API + UI changes
- Comprehensive tests

## 8 Points (Large)
- Significant feature
- Multiple components
- Database changes possible
- Cross-repo coordination

## 13+ Points (Epic-level)
- **SPLIT THIS STORY**
- Too complex for single story
- Multiple unknowns
- Break into 3-5 smaller stories
EOF
}

print_specific() {
    local pts="$1"
    case "$pts" in
        1|2)
            cat << 'EOF'
## 1-2 Points (Trivial)

**Characteristics:**
- Single file change
- Config update
- Simple bug fix
- Minimal or no new tests needed

**Examples:**
- Fix typo in documentation
- Update environment variable
- Add missing import
- Simple CSS adjustment

**YAML:**
```yaml
- id: PROJ-XXXXX
  title: "Fix typo in README"
  points: 1
  workflow: trivial
```
EOF
            ;;
        3)
            cat << 'EOF'
## 3 Points (Small)

**Characteristics:**
- Few files changed
- Single component/handler
- Straightforward implementation
- Some tests needed

**Examples:**
- Add validation to existing endpoint
- Fix bug with tests
- Add new utility function

**YAML:**
```yaml
- id: PROJ-XXXXX
  title: "Add input validation"
  points: 3
  workflow: tdd
```
EOF
            ;;
        5)
            cat << 'EOF'
## 5 Points (Medium)

**Characteristics:**
- Multiple files across layers
- New feature component
- API + UI changes
- Comprehensive tests

**Examples:**
- New admin page
- New API endpoint with tests
- Refactor with behavioral tests

**YAML:**
```yaml
- id: PROJ-XXXXX
  title: "Add settings page"
  points: 5
  workflow: tdd
```
EOF
            ;;
        8)
            cat << 'EOF'
## 8 Points (Large)

**Characteristics:**
- Significant feature
- Multiple components
- Database changes possible
- Cross-repo coordination

**Examples:**
- New integration
- Major refactor
- New subsystem

**YAML:**
```yaml
- id: PROJ-XXXXX
  title: "Add notification system"
  points: 8
  workflow: tdd
```

**Consider:** Can this be split into 2-3 smaller stories?
EOF
            ;;
        13|21|*)
            if [[ "$pts" -ge 13 ]]; then
                cat << 'EOF'
## 13+ Points - TOO LARGE

**This story should be SPLIT.**

Stories over 8 points have:
- Multiple unknowns
- High risk of scope creep
- Difficult to estimate accurately
- Hard to review in one PR

**Action:** Break into 3-5 smaller stories:
1. Identify distinct deliverables
2. Create a story per deliverable
3. Size each story 3-5 points
4. Link stories to parent epic

**Example split:**
```
Epic: User Dashboard (13 pts total)
├── Story 1: Dashboard layout (3 pts)
├── Story 2: User stats API (5 pts)
├── Story 3: Activity feed (3 pts)
└── Story 4: Export feature (2 pts)
```
EOF
            else
                echo "Unknown point value: $pts"
                echo "Valid values: 1, 2, 3, 5, 8, 13+"
                exit 1
            fi
            ;;
    esac
}

if [[ -z "$POINTS" ]]; then
    print_all
else
    print_specific "$POINTS"
fi
