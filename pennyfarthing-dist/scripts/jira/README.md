# Jira Scripts

Scripts for Jira integration, synchronization, and story management.

## Scripts

| Script | Purpose |
|--------|---------|
| `jira-lib.sh` | Shared Jira bash utilities (library) |
| `jira-lib.mjs` | Shared Jira JavaScript utilities (library) |
| `jira-claim-story.sh` | Claim a story (assign and move to In Progress) |
| `jira-reconcile.sh` | Reconcile Jira with sprint YAML |
| `jira-sync.sh` | Sync story to Jira |
| `jira-sync.mjs` | Sync story to Jira (JavaScript) |
| `jira-sync-story.sh` | Sync individual story |
| `jira-sync-story.mjs` | Sync individual story (JavaScript) |
| `create-jira-epic.sh` | Create Jira epic with stories |
| `create-jira-story.sh` | Create individual Jira story |
| `sync-epic-jira.sh` | Sync epic to Jira |
| `sync-epic-to-jira.sh` | Sync epic to Jira (alternate) |
| `jira-bidirectional-sync.mjs` | Bidirectional sync between YAML and Jira |

## Usage

```bash
.pennyfarthing/scripts/run.sh jira/jira-claim-story.sh MSSCI-12345
.pennyfarthing/scripts/run.sh jira/jira-reconcile.sh
```

## Ownership

- **Primary users:** SM agent, `/jira` skill
- **Maintained by:** Core Pennyfarthing team
