# Persona System Documentation

The Pennyfarthing persona system allows you to customize agent personalities through themes, attributes, and per-agent overrides.

## Quick Start

### Change Theme

Edit `.pennyfarthing/config.local.yaml`:

```yaml
theme: star-trek  # 102 themes available!
```

Or use the `/set-theme` command:
```bash
/set-theme star-trek
```

Restart your Claude session. All agents now use Star Trek characters.

### Discover Themes

```bash
/list-themes              # See all 102 themes
/show-theme alice-in-wonderland  # See theme details
```

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

**Location:** `.pennyfarthing/config.local.yaml` (local, not tracked in git)

```yaml
# Base theme (102 themes available - see /list-themes)
theme: discworld       # See categories below

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

**102 themes available** across categories. Use `/list-themes` to see all, `/show-theme <name>` for details.

### Theme Categories

| Category | Examples | Count |
|----------|----------|-------|
| **TV Series** | `mash`, `star-trek`, `the-office`, `breaking-bad`, `game-of-thrones`, `firefly` | 30+ |
| **Film** | `princess-bride`, `lord-of-the-rings`, `matrix`, `pulp-fiction`, `avengers` | 20+ |
| **Literature** | `alice-in-wonderland`, `discworld`, `shakespeare`, `jane-austen`, `sherlock` | 15+ |
| **Anime** | `one-piece`, `naruto`, `dragon-ball-z`, `death-note`, `cowboy-bebop` | 10+ |
| **Games** | `zelda`, `final-fantasy`, `mass-effect`, `portal`, `elder-scrolls` | 10+ |
| **History/Myth** | `greek-mythology`, `norse-mythology`, `ancient-rome`, `arthurian` | 8+ |
| **Other** | `minimalist`, `sesame-street`, `muppets`, `parks-and-rec` | 10+ |

### Theme Tiers

Themes are rated by persona quality:

| Tier | Description | Examples |
|------|-------------|----------|
| **S** | Top-tier, highly refined | `alice-in-wonderland`, `star-trek`, `discworld` |
| **A** | Excellent quality | `princess-bride`, `office`, `mash` |
| **B** | Good quality | `matrix`, `avengers` |
| **U** | Unrated/new | Recently added themes |

### Featured Themes

**Discworld** - Terry Pratchett characters
- SM: Captain Carrot (supportive, by the book)
- TEA: Igor (precise, thorough)
- Dev: Ponder Stibbons (methodical)
- Reviewer: Granny Weatherwax (uncompromising)

**Star Trek** - The Next Generation crew
- SM: Captain Picard ("Make it so")
- TEA: Data (precise, analytical)
- Dev: Geordi La Forge (creative problem solver)
- Reviewer: Spock (logical analysis)

**Alice in Wonderland** - Carroll's classic
- SM: The White Rabbit (time-conscious)
- TEA: The Caterpillar (methodical questioning)
- Dev: The Mad Hatter (creative solutions)
- Reviewer: The Queen of Hearts (exacting standards)

**Minimalist** - Professional mode
- All agents: Role name only, no personas

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
| `.pennyfarthing/config.local.yaml` | Active configuration (local, not tracked) |
| `pennyfarthing-dist/personas/attributes.yaml` | Attribute definitions |
| `pennyfarthing-dist/personas/themes/*.yaml` | 102 theme definitions |
| `.claude/project/personas/*.yaml` | Custom project personas |

## Theme Commands

| Command | Purpose |
|---------|---------|
| `/list-themes` | List all 102 available themes |
| `/show-theme <name>` | Show theme details and characters |
| `/set-theme <name>` | Set the active theme |
| `/theme-maker` | Interactive wizard to create custom themes |
| `/create-theme` | Create a new custom theme |
| `/job-fair` | Discover which characters excel at each role |
