# Persona Loading (For Command Files)

This block is included in command files to pre-load the agent's persona before the agent file is read.

## Usage in Command Files

Add this block BEFORE `<agent-activation>`:

```markdown
<persona-loading agent="{agent-name}">
Load this agent's persona before activation:
1. Read `.pennyfarthing/config.local.yaml`
2. Get `theme` value (e.g., "discworld")
3. Read `pennyfarthing-dist/personas/themes/{theme}.yaml` (or `.pennyfarthing/personas/themes/`)
4. Extract `agents.{agent-name}` section (character, style, helper, etc.)
5. Apply `attributes` from config (verbosity, formality, humor, emoji_use)
6. Store resolved persona for use during session
</persona-loading>
```

## What Gets Resolved

From theme file (`agents.{agent-name}`):
- `character` - The persona name (e.g., "Captain Carrot")
- `style` - Communication style
- `expertise` - Domain expertise
- `helper` - Helper name and style
- `emoji` - Default emoji

From config (`attributes`):
- `verbosity` - low | medium | high
- `formality` - formal | casual | playful
- `humor` - enabled | disabled | subtle
- `emoji_use` - none | minimal | frequent

## theme_characters Overrides (`str | dict`)

In `.pennyfarthing/config.local.yaml`, `theme_characters` overrides the theme per
role (and can introduce custom roles). Each value is either a **string** or a **dict**.

### String — character name only

```yaml
theme_characters:
  dev: "Ada Lovelace"
```

Only the character name is overridden. Every other field (`style`, `role`,
`quote`, `catchphrases`, `helper`, …) still comes from the theme's
`agents.<role>` block. An empty string is not a name — it falls back to the theme.

### Dict — rich override, merged over the theme

```yaml
theme_characters:
  dev:
    character: "Grace Hopper"
    style: "Direct and precise"
    quote: "First, make it correct."
    helper:
      name: "The Analytical Engine"
      style: "mechanical"
    catchphrases:
      - "Let's be precise"
      - "Correctness first"
```

The dict is shallow-merged **over** the theme's `agents.<role>` block:
keys present in the override win, missing keys fall through to the theme. The
theme dict itself is never mutated. `character` is optional — omit it to keep the
theme's character while overriding other fields.

### Resolution order

`load_persona()` and `get_crew_manifest()` apply the same chain:

1. Dict override's `character`
2. String override (non-empty)
3. Theme `agents.<role>.character`
4. `"Unknown"` — only when the role *is* configured in `theme_characters` but
   nothing resolves a name. Roles with neither an override nor a theme block are
   omitted from the crew manifest entirely.

Any other override shape (list, number) is junk and is ignored — the theme wins.

### Malformed field handling

Both functions degrade instead of crashing on a hand-edited config or theme:

| Field | Bad value | Behavior |
|-------|-----------|----------|
| `helper` | anything not a mapping (`helper: "The Machine"`) | dropped — `helper_name`/`helper_style` are `None` |
| `catchphrases` | a bare string, or any non-sequence (int, dict, object) | ignored — falls back to the `quote` field (a string is never sliced into a one-character quote) |

`catchphrases` must be a YAML list (or tuple) to drive quote selection. Selected
quotes are memoized per `(agent, theme)`; call
`pf.prime.persona.reset_quote_cache()` to clear that cache (the pf test suite
does so via an autouse fixture).

## Agent File Reference

After persona loading, the agent file just needs:

```markdown
## Persona

**Fallback:** {brief description if config unavailable}
```

The agent receives the resolved persona from the command file's loading step.
