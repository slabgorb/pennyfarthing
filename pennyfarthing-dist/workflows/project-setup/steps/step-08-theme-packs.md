# Step 8: Install Additional Theme Packs (Optional)

<purpose>
Offer the user additional theme packs beyond the 26 base themes that ship with Pennyfarthing. Theme packs are optional npm packages that add themed personas with portraits.
</purpose>

<instructions>
1. Explain the theme pack system
2. Show available packs with descriptions
3. Let user select which packs to install
4. Install selected packs
5. Verify themes are discovered
</instructions>

<output>
- User informed about available theme packs
- Selected packs installed (if any)
- New themes discoverable via `/theme list`
</output>

## THEME PACK SYSTEM

```
🎭 Additional Theme Packs
══════════════════════════

Pennyfarthing ships with 26 base themes. Additional themes are available
as optional packages - install the ones that interest you.

Theme packs are discovered automatically once installed. No configuration
needed beyond `npm install`.
```

## AVAILABLE PACKS

Present the packs with descriptions and theme counts:

```
Available theme packs:

[1] @pennyfarthing/themes-literary (15 themes)
    Classic literature: Dickens, Shakespeare, Austen, Moby Dick,
    Sherlock Holmes, Les Miserables, Great Gatsby, and more.
    Pre-1950 books and author collections.

[2] @pennyfarthing/themes-prestige-tv (17 themes)
    Golden age television: Breaking Bad, The Sopranos, The Wire,
    Mad Men, Deadwood, Succession, Twin Peaks, and more.

[3] @pennyfarthing/themes-comedy (9 themes)
    Comedy TV and film: The Office, Parks & Rec, Futurama,
    The Simpsons, Monty Python, Ted Lasso, and more.

[4] @pennyfarthing/themes-scifi (8 themes)
    Sci-fi and cyberpunk deep cuts: Foundation, Babylon 5,
    Neuromancer, Snow Crash, Star Trek TOS, and more.

[5] @pennyfarthing/themes-realistic (14 themes)
    Historical figures: Renaissance masters, jazz legends,
    scientific revolutionaries, classical composers, and more.
    Realistic portrait style.

[6] @pennyfarthing/themes-superheroes (4 themes)
    Superheroes and animated action: Marvel MCU, Legion of Doom,
    Superfriends, Avatar: The Last Airbender.

[7] @pennyfarthing/themes-mythology-fantasy (4 themes)
    Mythology and fantasy: Greek mythology, Norse mythology,
    His Dark Materials, The Witcher.

(switch prompt presents installation options)
```

## INSTALLATION

Based on user selection, install the chosen packs:

```bash
# Install selected packs (example: literary + prestige-tv)
npm install @pennyfarthing/themes-literary @pennyfarthing/themes-prestige-tv
```

### Install All

```bash
npm install \
  @pennyfarthing/themes-literary \
  @pennyfarthing/themes-prestige-tv \
  @pennyfarthing/themes-comedy \
  @pennyfarthing/themes-scifi \
  @pennyfarthing/themes-realistic \
  @pennyfarthing/themes-superheroes \
  @pennyfarthing/themes-mythology-fantasy
```

## VERIFICATION

After installation, verify themes are discovered:

```bash
# List all themes - should show base + installed packs
pennyfarthing theme list
```

```
✓ Theme packs installed

Themes available:
  Base themes:              26
  {pack_name}:              {count}
  ...
  ─────────────────────────────
  Total:                    {total}

New themes are ready to use. Switch anytime with:
  /theme set {theme-name}
```

## INSTALLING LATER

```
You can install theme packs anytime:

  npm install @pennyfarthing/themes-literary
  npm install @pennyfarthing/themes-prestige-tv
  # etc.

They're automatically discovered - no config changes needed.
To see what's available: /theme list
```

## SUCCESS CRITERIA

- User shown available theme packs
- Selected packs installed (if any)
- New themes verified as discoverable
- User knows how to install more later

## NEXT STEP

After theme packs, proceed to `step-09-jira.md` to configure the Jira project key.

<switch tool="AskUserQuestion">
  <case value="install-all-packs" next="LOOP">
    Install ALL packs (71 additional themes)
  </case>
  <case value="skip" next="step-09-jira">
    Skip — base themes are enough for now
  </case>
</switch>
