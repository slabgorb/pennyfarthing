---
name: jira
description: Jira CLI commands for sprint management. Use when viewing, assigning, or updating Jira issues from the command line.
args: "[view|check|claim|move|assign|create|sync|bidirectional|reconcile|link|search|sprint]"
---

# /pf-jira - Jira Issue Management

<critical>
Never fabricate or guess Jira IDs. Valid keys follow `MSSCI-XXXXX`. Old-style IDs like `31-18` are local sprint YAML placeholders.
</critical>

<run>
pf.sh jira <command> [args]
</run>

<output>
Command-specific output. Most commands print status messages. Use `--dry-run` on mutating commands to preview changes.
</output>

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-jira view <key>` | `pf.sh jira view <key>` | View issue details |
| `/pf-jira check <key>` | `pf.sh jira check <key>` | Check availability |
| `/pf-jira claim <key>` | `pf.sh jira claim <key> [--dry-run]` | Assign to self + In Progress |
| `/pf-jira move <key> <status>` | `pf.sh jira move <key> "<status>" [--dry-run]` | Transition status |
| `/pf-jira assign <key> <user>` | `pf.sh jira assign <key> <user> [--dry-run]` | Assign to user |
| `/pf-jira link <p> <c> [type]` | `pf.sh jira link <parent> <child> [type] [--dry-run]` | Link two issues |
| `/pf-jira search "<jql>"` | `pf.sh jira search "<jql>"` | Search by JQL |
| `/pf-jira create epic <id>` | `pf.sh jira create epic <id> [--dry-run]` | Create epic + stories |
| `/pf-jira create story <ek> <sid>` | `pf.sh jira create story <epic-key> <story-id> [--dry-run]` | Create single story |
| `/pf-jira create standalone` | `pf.sh jira create standalone "<title>" [opts]` | Create standalone story |
| `/pf-jira sync <epic>` | `pf.sh jira sync <epic> [--transition] [--points] [--all] [--dry-run]` | Sync epic to Jira |
| `/pf-jira bidirectional` | `pf.sh jira bidirectional [opts]` | Bidirectional sync |
| `/pf-jira reconcile` | `pf.sh jira reconcile [--fix]` | Reconciliation report |
| `/pf-jira sprint add <sid> <key>` | `pf.sh jira sprint add <sprint-id> <issue-key> [--dry-run]` | Add issue to sprint |

### GitHub to Jira User Mapping

| GitHub | Jira Email |
|--------|------------|
| slabgorb | keith.avery@1898andco.io |
| arcaven | michael.pursifull@1898andco.io |
| RoseSecurity | michael.rosenfeld@1898andco.io |
| Zious11 | jared.richards@1898andco.io |
| drbothen | joshua.magady@1898andco.io |

### Prerequisites

```bash
brew install ankitpokhrel/jira-cli/jira-cli
jira init
export JIRA_API_TOKEN='your-token'
```

---

**Detailed options and behavior:** [usage.md](usage.md)
**Practical examples:** [examples.md](examples.md)
