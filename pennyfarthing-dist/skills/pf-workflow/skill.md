---
name: workflow
description: |
  List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, switching to a different workflow pattern, or managing BikeLane stepped workflows.
args: "[list|show [name]|set <name>|start <name> [--mode <mode>]|resume [name]|status|check|fix-phase]"
---

# /pf-workflow - Workflow Management

Pennyfarthing uses YAML-defined workflows to control agent sequences. The default TDD workflow (SM > TEA > Dev > Reviewer) can be customized or replaced.

## Quick Reference

### Shell Script Commands

| Command | Script | Purpose |
|---------|--------|---------|
| `/pf-workflow` or `/pf-workflow list` | `.pennyfarthing/scripts/workflow/list-workflows.sh` | List all workflows |
| `/pf-workflow show [name]` | `.pennyfarthing/scripts/workflow/show-workflow.sh [name]` | Show workflow details |
| `/pf-workflow set <name>` | Edit session file `**Workflow:**` line | Switch workflow mid-session |
| `/pf-workflow start <name>` | `.pennyfarthing/scripts/workflow/start-workflow.sh <name> [--mode M]` | Start stepped workflow |
| `/pf-workflow resume [name]` | `.pennyfarthing/scripts/workflow/resume-workflow.sh [name]` | Resume interrupted workflow |
| `/pf-workflow status` | `.pennyfarthing/scripts/workflow/workflow-status.sh` | Show stepped workflow progress |
| `/pf-workflow fix-phase <id> <phase>` | `.pennyfarthing/scripts/workflow/fix-session-phase.sh <id> <phase> [--dry-run]` | Repair session phase |

### Python CLI Commands

| Command | CLI | Purpose |
|---------|-----|---------|
| Check workflow state | `pf workflow check [--json]` | Current story, phase, state |
| Check phase owner | `pf workflow phase-check <workflow> <phase>` | Which agent owns a phase |
| Emit handoff marker | `pf workflow handoff <next-agent>` | CYCLIST handoff marker |

### Built-in Workflows

| Workflow | Flow | Triggers |
|----------|------|----------|
| `tdd` (default) | SM > TEA > Dev > Reviewer > SM | features, 3+ points |
| `tdd-tandem` | SM > TEA(+Arch) > Dev(+TEA) > Rev(+PM) > SM | `tandem` tag, 3+ points |
| `trivial` | SM > Dev > Reviewer > SM | chores/fixes, 1-2 points |
| `bdd` | SM > UX > TEA > Dev > Reviewer > SM | UI/UX features |
| `bdd-tandem` | SM > UX(+Arch) > TEA > Dev(+UX) > Rev(+PM) > SM | `bdd-tandem` tag |
| `agent-docs` | SM > Orchestrator > Tech Writer > SM | docs, agent-file label |
| `architecture` | 7 stepped phases with gates | architecture/design/ADR |

---

**Detailed options and behavior:** [usage.md](usage.md)
**Practical examples:** [examples.md](examples.md)
