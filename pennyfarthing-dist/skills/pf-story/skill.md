---
name: story
description: |
  DEPRECATED: Use /pf-sprint story instead.
  Story commands have been consolidated under /pf-sprint.
args: "[size|template|create|finish] [options]"
deprecated: true
redirect: sprint
---

# /pf-story - DEPRECATED

Story commands have been consolidated into `/pf-sprint`. Use the new commands:

| Old Command | New Command |
|-------------|-------------|
| `/story size [points]` | `/pf-sprint story size [points]` |
| `/story template [type]` | `/pf-sprint story template [type]` |
| `/story create <epic-id> ...` | `/pf-sprint story add <epic-id> ...` |
| `/story finish <story-id>` | `/pf-sprint story finish <story-id>` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/pf-sprint` | All sprint, story, and epic operations |
| `/pf-jira` | Jira operations (create, sync, claim) |
