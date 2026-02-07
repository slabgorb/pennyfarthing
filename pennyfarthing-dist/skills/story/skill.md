---
name: story
description: |
  DEPRECATED: Use /sprint story instead.
  Story commands have been consolidated under /sprint.
args: "[size|template|create|finish] [options]"
deprecated: true
redirect: sprint
---

# /story - DEPRECATED

Story commands have been consolidated into `/sprint`. Use the new commands:

| Old Command | New Command |
|-------------|-------------|
| `/story size [points]` | `/sprint story size [points]` |
| `/story template [type]` | `/sprint story template [type]` |
| `/story create <epic-id> ...` | `/sprint story add <epic-id> ...` |
| `/story finish <story-id>` | `/sprint story finish <story-id>` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/sprint` | All sprint, story, and epic operations |
| `/jira` | Jira operations (create, sync, claim) |
