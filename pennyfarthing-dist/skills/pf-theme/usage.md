# Theme — Detailed Usage

## Commands

### List Themes

```bash
pf theme list
```

No arguments. Shows all available themes with:
- Current theme marked with `*`
- Tier in brackets: `[S]` elite, `[A]` excellent, `[B]` strong, `[C]` good, `[D]` below average, `[U]` unbenchmarked

Copy output into response text — Bash tool output may be collapsed in the UI.

### Show Theme

```bash
pf theme show [NAME] [--full]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | No | Theme name. Defaults to current theme. |
| `--full` | No | Include OCEAN scores, quirks, catchphrases, helpers |

Copy output into response text.

### Set Theme

```bash
pf theme set <NAME> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | Yes | Theme name to activate |
| `--dry-run` | No | Preview without making changes |

Updates `.pennyfarthing/config.local.yaml` with theme name and character map.

After setting, refresh agent persona:
```bash
pf agent start "sm"
```
Adopt the new character immediately.

### Create Theme

```bash
pf theme create <NAME> [--base <THEME>] [--user] [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | Yes | New theme name (lowercase, hyphens allowed) |
| `--base` | No | Base theme to copy from (defaults to current theme) |
| `--user` | No | Create as user-level theme (`~/.claude/pennyfarthing/themes/`) |
| `--dry-run` | No | Preview without making changes |

Validation rules for name:
- Lowercase letters and numbers only
- Must start with a letter
- Hyphens allowed (no underscores or spaces)
- No conflicts with existing themes

Creates file at:
- Project-level: `.claude/pennyfarthing/themes/{name}.yaml`
- User-level (with `--user`): `~/.claude/pennyfarthing/themes/{name}.yaml`

### Theme Maker (Interactive)

`/theme maker` is an interactive wizard — no CLI command. It walks through:

1. **Theme name** — validated per rules above
2. **Mode selection** — AI-Driven, Guided, or Manual
3. **Character generation** — all 10 agent personas

For each agent, generates: `character`, `shortName`, `visual`, `ocean`, `style`, `expertise`, `role`, `trait`, `quote`, `emoji`, `helper`.

---

## Agent Roles Reference

| Agent | Role | Character Should Be |
|-------|------|---------------------|
| orchestrator | Meta-coordinator | Pattern-seer, guide |
| sm | Scrum Master | Leader, coordinator |
| tea | Test Engineer | Analyst, detail-oriented |
| dev | Developer | Builder, practical |
| reviewer | Code Reviewer | Critical, high standards |
| architect | System Architect | Big-picture thinker |
| pm | Product Manager | Strategic, stakeholder manager |
| tech-writer | Documentation | Clear communicator |
| ux-designer | UX Design | User advocate |
| devops | Infrastructure | Reliable, systems runner |
| ba | Business Analyst | Requirements discovery |

## OCEAN Profile Guidelines

| Agent | Profile | Rationale |
|-------|---------|-----------|
| orchestrator | High O (4-5), Moderate C (3-4) | Pattern-seer needs openness |
| sm | High A (4-5), Moderate C (3-4) | Coordination requires agreeableness |
| tea | High C (4-5), High O (4-5) | Testing needs conscientiousness + creativity |
| dev | High C (4-5), Moderate O (3-4) | Building needs discipline |
| reviewer | High C (4-5), Low A (2-3) | Critical review prioritizes standards |
| architect | High O (4-5), High C (4-5) | Design needs vision + structure |
| pm | High E (4-5), High A (4-5) | Stakeholder mgmt needs sociability |
| tech-writer | High C (4-5), Low N (1-2) | Documentation needs precision |
| ux-designer | High A (4-5), High O (4-5) | User advocacy needs empathy |
| devops | High C (4-5), Low N (1-2) | Operations needs reliability |

## Theme File Structure

```yaml
theme:
  name: theme-name
  description: "Brief description"
  source: "Source universe"
  pennyfarthing_version: "10.4.0"
  created: 2026-01-01

agents:
  sm:
    character: Character Name
    shortName: Short
    visual: "Portrait prompt description"
    ocean: { O: 3, C: 4, E: 2, A: 3, N: 2 }
    style: Communication style
    expertise: Areas of expertise
    role: Role in universe
    trait: Key trait
    quote: "Signature quote"
    emoji: "X"
    helper:
      name: Helper Name
      style: "Helper communication style"
```

## Theme Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/personas/themes/` | Built-in themes (96+) |
| `.claude/pennyfarthing/themes/` | Project-level custom |
| `~/.claude/pennyfarthing/themes/` | User-level custom |
| `.pennyfarthing/config.local.yaml` | Active theme selection |
