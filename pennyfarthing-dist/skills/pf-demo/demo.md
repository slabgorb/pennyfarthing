---
name: demo
description: |
  Generate demo artifacts for completed stories. Produces slide content, diagrams,
  and demo scripts from story session data. Use when creating demos, presentations,
  or showcasing completed work.
args: "[generate] [STORY_ID] [--dry-run] [--corrections TEXT]"
---

# /demo - Demo Artifact Generator

Generate presentation-ready demo artifacts from completed story data.

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/demo generate 42-1` | `pf demo generate 42-1` | Generate demo artifacts for story 42-1 |
| `/demo generate 42-1 --dry-run` | `pf demo generate 42-1 --dry-run` | Preview what would be generated |
| `/demo generate 42-1 --corrections "focus on API changes"` | `pf demo generate 42-1 --corrections "..."` | Regenerate with developer feedback |

## Pipeline

The generator runs a sequential pipeline:

1. **Collector** — gathers signals from session file, git diff, PR, Jira
2. **Classifier** — categorizes the story (feature, bugfix, refactor, etc.)
3. **Generator** — produces slide content and talking points
4. **Mermaid** — generates architecture/flow diagrams
5. **ScriptGenerator** — creates a demo walkthrough script

Output is written to `sprint/demos/{story_id}/`.

## Options

| Option | Description |
|--------|-------------|
| `STORY_ID` | Required. Story identifier (e.g., `42-1`) |
| `--dry-run` | Show what would be generated without writing files |
| `--corrections TEXT` | Developer feedback for regeneration passes |

## Examples

```bash
# Generate demo for a completed story
pf demo generate 148-2

# Preview without writing files
pf demo generate 148-2 --dry-run

# Regenerate with corrections
pf demo generate 148-2 --corrections "emphasize the polling mechanism fix"
```

## Output

Generated artifacts are written to `sprint/demos/{story_id}/`:
- Slide content (title, bullets, talking points)
- Mermaid diagrams (architecture, data flow)
- Demo script (walkthrough steps)
- Metadata YAML (classification, signals summary)
