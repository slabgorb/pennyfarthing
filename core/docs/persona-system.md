# Persona System Documentation

The BMAD persona system allows you to customize agent personalities through themes, attributes, and per-agent overrides.

## Quick Start

### Change Theme

Edit `.claude/persona-config.yaml`:

```yaml
theme: star-trek  # Options: discworld, star-trek, minimalist
```

Restart your Claude session. All agents now use Star Trek characters.

### Adjust Personality Attributes

```yaml
attributes:
  verbosity: low       # Brief responses
  humor: disabled      # No character quirks
```

### Override Single Agent

```yaml
overrides:
  reviewer:
    theme: discworld   # Keep Granny for reviews even in Star Trek mode
```

---

## Configuration File

**Location:** `.claude/persona-config.yaml`

```yaml
# Base theme
theme: discworld       # discworld | star-trek | minimalist | custom path

# Personality modifiers
attributes:
  verbosity: medium    # low | medium | high
  formality: casual    # formal | casual | playful
  humor: enabled       # enabled | disabled | subtle
  emoji_use: minimal   # none | minimal | frequent

# Per-agent customization
overrides: {}
```

---

## Available Themes

### Discworld (Default)

Characters from Terry Pratchett's Discworld series.

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | DEATH | Speaks in capitals, sees the pattern |
| SM | Captain Carrot | Supportive, honest, by the book |
| TEA | Igor | Precise, thorough, "Yeth, marthter" |
| Dev | Ponder Stibbons | Methodical, references Hex |
| Reviewer | Granny Weatherwax | Uncompromising, demands excellence |
| Architect | Leonard of Quirm | Brilliant, innovative designs |
| PM | Lord Vetinari | Calm, calculating, sees everything |
| Tech Writer | Sacharissa Cripslock | Clear, investigative |
| UX Designer | Adora Belle Dearheart | Direct, user-focused |
| DevOps | Lu-Tze | Calm, preventive, sweeps floors |

### Star Trek

Characters from Star Trek: The Next Generation.

| Agent | Character | Style |
|-------|-----------|-------|
| Orchestrator | Q | Omniscient observer |
| SM | Captain Picard | "Make it so" |
| TEA | Data | Precise, analytical |
| Dev | Geordi La Forge | Creative problem solver |
| Reviewer | Spock | Logical analysis |
| Architect | Data (design mode) | Systematic approaches |
| PM | Admiral Janeway | Determined strategist |
| Tech Writer | Dr. Crusher | Clear explanations |
| UX Designer | Counselor Troi | Empathetic design |
| DevOps | Chief O'Brien | Practical operations |

### Minimalist

Professional mode with no character personas.

| Agent | Character | Style |
|-------|-----------|-------|
| All | Role Name Only | Direct, professional |

---

## Personality Attributes

These modify behavior independent of theme.

### Verbosity

| Value | Effect |
|-------|--------|
| `low` | Brief, focused responses. Skip pleasantries. |
| `medium` | Balanced detail and brevity. (Default) |
| `high` | Detailed explanations. Walk through reasoning. |

### Formality

| Value | Effect |
|-------|--------|
| `formal` | Professional language. Avoid contractions. |
| `casual` | Conversational but competent. (Default) |
| `playful` | Light, humorous communication. |

### Humor

| Value | Effect |
|-------|--------|
| `disabled` | No character quirks or catchphrases. |
| `subtle` | Occasional character references. |
| `enabled` | Full character immersion. (Default) |

### Emoji Use

| Value | Effect |
|-------|--------|
| `none` | No emojis. |
| `minimal` | Headers and status only. (Default) |
| `frequent` | Emojis throughout responses. |

---

## Per-Agent Overrides

### Use Different Theme for One Agent

```yaml
overrides:
  reviewer:
    theme: discworld   # Granny even in Star Trek mode
```

### Custom Persona File

```yaml
overrides:
  dev:
    custom: my-custom-dev.yaml  # In .claude/personas/custom/
```

### Override Attributes for One Agent

```yaml
overrides:
  sm:
    attributes:
      verbosity: high
      humor: disabled
```

---

## Creating Custom Themes

1. Copy an existing theme as template:
   ```bash
   cp .claude/personas/themes/discworld.yaml .claude/personas/themes/my-theme.yaml
   ```

2. Edit the theme file with your characters

3. Update config:
   ```yaml
   theme: my-theme
   ```

### Theme File Structure

```yaml
theme:
  name: My Theme
  description: Description of theme
  source: Origin/inspiration

agents:
  sm:
    character: Character Name
    style: Communication style
    expertise: Areas of expertise
    role: Role description
    quirk: Optional personality quirk
    emoji: Optional emoji
    helper:
      name: Helper name
      style: Helper style
```

---

## Creating Custom Personas

For individual agent customization without a full theme.

1. Create file in `.claude/personas/custom/`:
   ```yaml
   # my-custom-dev.yaml
   character: My Custom Character
   style: My style
   expertise: My expertise
   quirk: My quirk
   helper:
     name: My Helper
     style: Helper style
   ```

2. Reference in config:
   ```yaml
   overrides:
     dev:
       custom: my-custom-dev.yaml
   ```

---

## How It Works

1. Agent activation reads `.claude/persona-config.yaml`
2. Loads base theme from `.claude/personas/themes/{theme}.yaml`
3. Checks for per-agent overrides
4. Applies attribute modifiers
5. Agent embodies the resulting persona

### Loading Priority

1. Custom file (if specified in overrides)
2. Override theme (if specified in overrides)
3. Base theme
4. Hardcoded fallback (if config missing)

---

## Tips

- **Start with minimalist** if characters are distracting
- **Use `humor: subtle`** for balanced personality
- **Override reviewer** to keep strict reviewing even in playful themes
- **Custom themes** are great for team branding

---

## File Locations

| File | Purpose |
|------|---------|
| `.claude/persona-config.yaml` | Active configuration |
| `.claude/personas/attributes.yaml` | Attribute definitions |
| `.claude/personas/themes/*.yaml` | Theme definitions |
| `.claude/personas/custom/*.yaml` | Custom personas |
