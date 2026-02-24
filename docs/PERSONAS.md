# Persona System

The persona system allows agents to adopt themed character personalities while maintaining their core expertise.

## Overview

Personas are organized into **themes** (character sets) and modified by **attributes** (behavior settings).

```yaml
# .pennyfarthing/config.local.yaml
theme: discworld           # Which character set to use

attributes:                # How agents behave
  verbosity: medium
  formality: casual
  humor: enabled
  emoji_use: minimal
```

## Available Themes

Pennyfarthing includes **102 persona themes** across diverse universes. Below are the core themes - for the complete list with OCEAN personality analysis, see [THEME-COMPARISON.md](THEME-COMPARISON.md).

### Discworld (Default)

Characters from Terry Pratchett's Discworld series.

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | DEATH | Speaks in capitals, patient but inevitable |
| SM | Captain Carrot | Supportive, honest, by the book |
| TEA | Igor | Precise, thorough, quality-obsessed |
| Dev | Ponder Stibbons | Methodical, patient, quietly competent |
| Reviewer | Granny Weatherwax | Direct, uncompromising, sees through everything |
| Architect | Leonard of Quirm | Brilliant, innovative, sees solutions others can't |
| PM | Lord Vetinari | Calm, calculating, sees the big picture |
| Tech Writer | Sacharissa Cripslock | Clear, direct, investigative |
| UX Designer | Adora Belle Dearheart | Direct, practical, user-focused |
| DevOps | Lu-Tze | Calm, efficient, preventive, wise |

### Star Trek

Characters from Star Trek: The Next Generation (and beyond).

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | Q | Omniscient, playful yet wise |
| SM | Captain Picard | Diplomatic, principled, strategic |
| TEA | Lt. Cmdr. Data | Precise, analytical, thorough |
| Dev | Geordi La Forge | Creative problem solver, optimistic |
| Reviewer | Commander Spock | Logical, thorough, emotionally detached |
| Architect | Data (design mode) | Systematic, considers all possibilities |
| PM | Admiral Janeway | Determined, strategic, pragmatic |
| Tech Writer | Dr. Crusher | Clear, compassionate, educational |
| UX Designer | Counselor Troi | Empathetic, user-focused, intuitive |
| DevOps | Chief O'Brien | Practical, experienced, keeps things running |

### Literary Classics

Characters from classic literature (no fantasy/sci-fi).

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | Stage Manager (Our Town) | Omniscient narrator, gentle authority |
| SM | Jeeves | Impeccable, understated, seamless |
| TEA | Hercule Poirot | Methodical, precise, systematic |
| Dev | Passepartout | Resourceful, loyal, adapts to any situation |
| Reviewer | Lady Bracknell | Withering judgment, high standards |
| Architect | Count of Monte Cristo | Elaborate planning, intricate systems |
| PM | George Smiley | Patient, meticulous, plays long game |
| Tech Writer | Dr. Watson | Clear, accessible, reliable narrator |
| UX Designer | Elizabeth Bennet | Sharp observer, understands real needs |
| DevOps | Stevens (butler) | Consummate professional, dignity |

### Minimalist

Professional mode with no character personas.

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | Process Coordinator | Direct, efficient |
| SM | Scrum Master | Organized, clear |
| TEA | Test Engineer | Thorough, systematic |
| Dev | Developer | Methodical, practical |
| Reviewer | Code Reviewer | Critical, thorough |
| Architect | System Architect | Strategic, systematic |
| PM | Product Manager | Strategic, clear |
| Tech Writer | Technical Writer | Clear, concise |
| UX Designer | UX Designer | User-focused, practical |
| DevOps | DevOps Engineer | Efficient, reliable |

## Personality Attributes

Attributes modify how agents communicate, independent of their character.

### Verbosity

Controls response length and detail.

| Value | Behavior |
|-------|----------|
| `low` | Brief, focused. Skip pleasantries. Essential info only. |
| `medium` | Balanced. Context when helpful. Default mode. |
| `high` | Detailed explanations. Walk through reasoning. Good for learning. |

### Formality

Controls communication style.

| Value | Behavior |
|-------|----------|
| `formal` | Professional, structured. Avoid contractions. Precise. |
| `casual` | Conversational but competent. Natural language. |
| `playful` | Light, humorous. Inject personality. |

### Humor

Controls character expression.

| Value | Behavior |
|-------|----------|
| `disabled` | No humor or character quirks. Professional only. |
| `subtle` | Occasional character references. Work-first focus. |
| `enabled` | Full character immersion. Catchphrases and quirks. |

### Emoji Use

Controls visual expression.

| Value | Behavior |
|-------|----------|
| `none` | No emojis. Pure text. |
| `minimal` | Emojis for headers and status only. |
| `frequent` | Emojis throughout. Visually engaging. |

## Configuration

### Basic Configuration

```yaml
# .pennyfarthing/config.local.yaml
theme: discworld

attributes:
  verbosity: medium
  formality: casual
  humor: enabled
  emoji_use: minimal
```

### Per-Agent Overrides

Override specific agents while keeping theme defaults:

```yaml
theme: discworld

attributes:
  verbosity: medium
  humor: enabled

overrides:
  reviewer:
    humor: disabled      # Granny stays serious during reviews
    verbosity: high      # Detailed feedback on issues

  dev:
    verbosity: low       # Just the code, please
```

### Changing Themes

Simply change the theme value:

```yaml
theme: star-trek         # Switch to Star Trek characters
```

All agents will use the new theme's characters.

## How Personas Load

1. Command file triggers agent activation
2. Agent reads `.pennyfarthing/config.local.yaml`
3. Gets theme value (e.g., `discworld`)
4. Loads `personas/themes/{theme}.yaml`
5. Extracts agent's character section
6. Applies attributes from config
7. Agent activates in character

### Loading Priority

1. **Overrides** (highest) - Per-agent settings in config
2. **Attributes** - Global attribute settings
3. **Theme defaults** - Theme file defaults
4. **System defaults** (lowest) - Built-in fallbacks

## Helper Agents

Each agent has a helper for mechanical tasks:

| Agent | Helper | Role |
|-------|--------|------|
| SM | Nobby | Scanning files, checking Jira |
| TEA | Igor | Running tests (we are all Igor) |
| Dev | Hex | Thinking engine, problem solving |
| Reviewer | Nanny Ogg | Running tests, gathering lint |
| Architect | Modo | Quiet maintenance |
| PM | Drumknott | Efficient clerical work |
| Tech Writer | Otto Chriek | Screenshots and visuals |
| UX Designer | Stanley | Cataloging components |
| DevOps | Lobsang | Health monitoring |

Helpers are Haiku-based subagents that handle routine operations.

## Creating Custom Themes

### Interactive Wizard (Recommended)

Use `/theme-maker` for guided theme creation:

```
/theme-maker
```

Three creation modes:

| Mode | You Provide | AI Generates |
|------|-------------|--------------|
| **AI-Driven** | Universe concept | All 10 agent personas |
| **Guided** | Character selections from AI suggestions | Style, traits, quotes |
| **Manual** | Character, style, quote per agent | Role, expertise, helper |

The wizard handles validation, file creation, and version tracking.

### CLI Command

For quick creation from command line:

```bash
pf theme create noir-detective
```

Creates a skeleton theme file to edit manually.

### Theme File Location

Custom themes are stored in:
```
.claude/pennyfarthing/themes/{name}.yaml
```

### Theme File Structure

```yaml
# Custom theme: noir-detective
# Created by /theme-maker

theme:
  name: Noir Detective
  description: "1940s noir detective fiction"
  source: "Classic noir films and novels"
  default_emoji_use: minimal
  default_humor: enabled
  character_immersion: high
  user_title: Boss
  pennyfarthing_version: "4.0.0"
  created: 2025-01-15

agents:
  sm:
    character: Sam Spade
    style: World-weary, trusts no one, gets the job done
    expertise: Team coordination, solving mysteries
    role: The detective who runs the agency
    trait: Cynical pragmatism, hidden morality
    quote: "When you're slapped, you'll take it and like it."
    emoji: "🎩"
    helper:
      name: Effie
      style: "Efficient, loyal, keeps the office running"

  # ... all 10 agents required
```

### Required Agents

Each theme must define all 10 agents:

| Agent | Role | Character Should Be |
|-------|------|---------------------|
| `orchestrator` | Meta-coordinator | Pattern-seer, guide |
| `sm` | Scrum Master | Leader, coordinator |
| `tea` | Test Engineer | Detail-oriented, finds flaws |
| `dev` | Developer | Builder, practical |
| `reviewer` | Code Reviewer | Critical, high standards |
| `architect` | System Architect | Big-picture thinker |
| `pm` | Product Manager | Strategic planner |
| `tech-writer` | Documentation | Clear communicator |
| `ux-designer` | UX Design | User advocate |
| `devops` | Infrastructure | Reliable operator |

### Version Compatibility

Custom themes include `pennyfarthing_version` to track compatibility. When Pennyfarthing updates, you'll see a warning if your theme was created with an older version. The theme still works, but some fields may be missing or deprecated.

### Theme Guidelines

1. **Consistent tone** - Characters should feel like they belong together
2. **Clear expertise** - Map character traits to agent responsibilities
3. **Distinct voices** - Each agent should be recognizable
4. **Helper rationale** - Helpers should make sense for the character
5. **Appropriate humor** - Match humor level to theme source

## Best Practices

### Choosing a Theme

- **Discworld** - Default. Fun, quotable, distinct voices.
- **Star Trek** - Technical focus, professional but personable.
- **Literary Classics** - Sophisticated, wit, literary references.
- **Minimalist** - When you want no personality, just work.

For detailed personality analysis including Big Five (OCEAN) profiles, visual mapping, and most disparate pairs analysis, see [THEME-COMPARISON.md](THEME-COMPARISON.md).

### Tuning Attributes

For focused work:
```yaml
attributes:
  verbosity: low
  humor: disabled
  emoji_use: none
```

For learning/exploration:
```yaml
attributes:
  verbosity: high
  humor: subtle
  emoji_use: minimal
```

For fun/engagement:
```yaml
attributes:
  verbosity: medium
  humor: enabled
  emoji_use: frequent
```

### Team Considerations

If working with a team, consider:
- Consistent theme across all team members
- Shared attribute preferences
- Minimalist for formal/client contexts
- Themed for internal/fun work

---

## See Also

- [THEME-COMPARISON.md](THEME-COMPARISON.md) - Complete theme list with OCEAN profiles and visual mappings
- [OCEAN Benchmarking Guide](../packages/benchmark/docs/OCEAN-BENCHMARKING.md) - Role recommendations, universe strengths
- [Showcase Website](SHOWCASE.md) - Interactive theme gallery
