# Theme-level `portrait_style` worksheet (SDXL → Z-Image rewrite)

Review target: the **theme-level** prompt only (`theme.portrait_style`), the string
appended to every character's `visual`. Per-character `visual` rewrites come after
this layer is locked (Tier 2 — rules at bottom).

## What we verified by rendering (the learnings driving this worksheet)

1. **A medium anchor is the single highest-leverage fix.** Live test on star-trek-tng:
   changing ONLY `portrait_style` from `Starfleet portrait, Enterprise-D bridge, starfield`
   → `1990s painted science-fiction illustration…` (character `visual` untouched) flipped
   photoreal film-stills into clean painted illustrations. **TNG is tested & approved.**
2. **The medium anchor beats Z-Image's photoreal default even for characters it "knows."**
   Spock still rendered recognizably as Spock, but as a *painting*, not a film still. So the
   model's IP "cheating" is an **asset** once a medium anchor is present: recognizable AND
   on-style. Known-IP themes (⭐ below) therefore need a *firm* medium anchor, not a vague one.
3. **Dropping the setting noun cleaned the background.** Removing `Enterprise-D bridge / starfield`
   gave plain portrait backgrounds instead of cluttered scenes. Confirms the ⤳ relocations.
4. **`poster` is NOT reliably text-safe.** 1984's Soviet poster came out clean, but catch-22's
   WWII "propaganda poster" bled garbled text ("THE W1SHTGENTSI"). Treat any poster/print style
   as text-risky → the centralized safety clause is **mandatory**, and we **verify per render**.
5. **firefly is the lone exception** — its deliberate tarot lettering rendered correctly; keep it
   and exempt it from the no-text clause (see `portrait_allow_text` below).

**Rules applied to every proposal** (from `~/Projects/oq-1/sidequest-content/PROMPTING_Z_IMAGE.md`):
- **Must name an illustration medium** → no photoreal (user directive).
- **Style / medium / palette / technique / lighting-mood ONLY.** No concrete setting
  nouns in the theme layer (they bleed into every portrait) — flagged ⤳ to move into
  per-character `visual`.
- **No literal-text instructions** (lettering, captions, roman numerals, mastheads) — Z-Image
  paints them as garbled text.
- **No publication / masthead / "-cover" references.** Remove named publications
  ("Saturday Evening Post"), and format words implying a title on the artifact
  ("magazine-cover", "novel-cover", "paperback-cover", "album-cover", "dossier").
  **Artist names stay** ("Norman Rockwell", "Drew Struzan", "Tamara de Lempicka",
  "Tenniel"…) — safe style anchors. `poster` is allowed but text-risky (see learning #4):
  lean on the safety clause and verify; `movie-poster`/`comic-poster` softened (title+credits).
- The mandatory safety clause (`no text, no caption, no watermark…` + adult/anatomy)
  is **centralized in `build_prompt()`**, so it is NOT repeated here.

⭐ = **known-IP theme**: the model already knows these faces/designs, so it reproduces the
likeness and (without a firm anchor) defaults to photoreal. Give these the strongest, most
explicit illustration medium — recognizability is desirable, photorealism is not.
⭐ themes: `star-trek-tng`, `star-trek-tos`, `star-wars`, `the-matrix`, `blade-runner`,
`lord-of-the-rings`, `game-of-thrones`, `breaking-bad`, `house-md`, `big-lebowski`, `mash`,
`the-wire`, `west-wing`, `parks-and-rec`, `a-team`, `hogans-heroes`, `gilligans-island`,
`avatar-the-last-airbender` (iconic animated designs). Live-action casts and distinctive
costume/creature designs (droids, Vader, Yoda, Spock, VISOR) pull hardest toward photoreal.

How to review: edit the `Approved:` line for each — paste your final string, or write
`OK` to accept the Proposed as-is, or `KEEP` to retain Current unchanged.

---

## ❌ Group 1 — Photoreal risk (no medium anchor, or names photo/video)

### big-lebowski
- Current: `, bowling alley neon warmth, noir comedy aesthetic`
- Proposed: `, hand-painted illustration in the style of Drew Struzan, gouache and airbrush, warm muted palette of amber teal and dusty neon, soft painterly brushwork, gently caricatured features, cinematic key lighting`  (dropped "movie-poster" → title/credits text)
- Approved:

### control
- Current: `, neutral professional headshot, plain grey background, even studio lighting, minimal styling, corporate stock photo`
- Proposed: `, brutalist institutional poster illustration, flat halftone print, desaturated concrete-grey with hazard-red and ash-black accents, stark institutional graphic aesthetic, hard even lighting, cold bureaucratic mood`  (dropped "redacted-dossier" → implies document text)
- Approved:

### a-team   ← your "'80s tin lunchbox" direction
- Current: `, 1980s action TV, bold primary colors, explosion orange background, vintage VHS aesthetic`
- Proposed: `, 1980s tin lunchbox lithograph, glossy metal-litho print, saturated primary colors, bold airbrushed action illustration, thick black keylines, subtle off-register printing, high-energy heroic comic-book styling`  (softened "comic-poster" → "comic-book")
- Approved:

### game-of-thrones
- Current: `, medieval fantasy,  gritty lighting, ice and fire`
- Proposed: `, painted dark-fantasy illustration, oil on canvas, muted heraldic palette of slate grey ice-blue and blood-red, dramatic chiaroscuro, weathered medieval mood`
- Approved:

### star-trek-tng ⭐  ✅ TESTED & APPROVED (already applied to YAML; Spock+Geordi re-rendered)
- Current: `, Starfleet portrait, Enterprise-D bridge, starship computer accents, 24th century Federation, starfield`  ⤳ move bridge/starfield to `visual`
- Proposed: `, 1990s painted science-fiction illustration, smooth airbrushed rendering, clean cool palette of black teal and brushed silver, optimistic heroic lighting`
- Approved: **YES** — live render flipped photoreal → painted illustration, Spock/Geordi still recognizable, clean backgrounds.

### star-trek-tos
- Current: `, 1960s Starfleet, bold primary uniforms, retro-futuristic lighting, Kirk-era heroic`
- Proposed: `, 1960s pulp science-fiction illustration, bold flat color blocks, painterly retro-futurism, vivid primary palette, dramatic heroic lighting`  (dropped "poster" to avoid pulp title text)
- Approved:

### blade-runner
- Current: `, cyberpunk noir, neon pink and cyan rain-soaked lighting, Voight-Kampff eye closeup, retrofuturist dystopia`  ⤳ drop "Voight-Kampff eye closeup"
- Proposed: `, Syd Mead-style painted concept-art illustration, airbrushed retrofuturism, neon-noir palette of magenta cyan and amber against deep shadow, rain-diffused glow`
- Approved:

### shakespeare
- Current: `, Elizabethan portrait, Tudor court, rich velvet, theatrical candlelight, Globe Theatre`  ⤳ move "Globe Theatre" to `visual`
- Proposed: `, Elizabethan oil-painting portrait, Tudor panel-painting style, rich dark varnished tones with jewel-toned velvets, fine cracked-varnish texture, candlelit chiaroscuro`
- Approved:

---

## ⚠️ Group 2 — Weak / generic anchor (illustrated but vague; will drift)

### discworld
- Current: `, soft washes, visible paper texture, warm muted palette`
- Proposed: `, loose watercolor-and-ink illustration, soft transparent washes, visible cold-press paper texture, warm muted earthy palette, gentle expressive linework`
- Approved:

### lord-of-the-rings
- Current: `, soft washes, visible paper texture, warm muted palette`
- Proposed: `, Alan Lee and John Howe-style watercolor illustration, soft atmospheric washes, visible paper texture, muted earthy palette, delicate pencil underdrawing`
- Approved:

### parks-and-rec
- Current: `, bright cheerful illustrated portrait, warm office lighting, small town aesthetic`
- Proposed: `, bright flat-color gouache illustration, clean cheerful cartoon style, warm saturated palette, soft even lighting, friendly modern editorial look`
- Approved:

---

## ✏️ Group 3 — Good medium, but invites literal text (strip the text bits)

### firefly   ← KEEP (tarot text rendered well per user; do not strip the lettering)
- Current: `, Rider-Waite tarot card illustration by Pamela Colman Smith, square composition, bold black ink outlines, flat hand-colored areas, limited palette of gold yellow red and muted blue on cream background, thin black ruled border with decorative corners, card name text at bottom in ALL CAPS serif font, roman numeral at top center, woodblock print with hand-coloring aesthetic`
- Proposed: KEEP current as-is — Z-Image handled the deliberate tarot lettering/roman numeral correctly, so the text instructions stay. (NOTE: this theme is the one intentional exception to the "no literal text" rule — its central safety clause must therefore NOT include `no text`/`no labels`; see safety-clause note below.)
- Approved:

### the-expanse
- Current: `, russian constructivist style, bold geometric shapes, red and black color palette, propaganda poster aesthetic, angular compositions, industrial typography influence`
- Proposed: `, Russian constructivist illustration, bold angular geometric shapes, red black and cream palette, propaganda-poster aesthetic, dynamic diagonal composition`  (removed: industrial typography influence — caused the glyph smudge)
- Approved:

### hitchhikers-guide
- Current: `, 1970s sci-fi book cover, bold geometric shapes, cosmic absurdist, friendly retro lettering, British vintage`
- Proposed: `, 1970s sci-fi illustration, bold geometric shapes, cosmic absurdist palette, British retro-futurism, flat printed color`  (removed: friendly retro lettering, paperback-cover)
- Approved:

---

## ✅ Group 4 — Strong anchor; proposal = expand for tokens + dedupe setting nouns

### 1984
- Current: `, Soviet propaganda poster, stark red and black, brutalist geometric shapes`
- Proposed: `, Soviet propaganda-poster illustration, stark red black and cream, brutalist geometric shapes, heavy lithographic print texture, high-contrast heroic-worker styling`
- Approved:

### agatha-christie
- Current: `, 1920s Art Deco, muted sepia tones, gaslight atmosphere, mystery novel cover`
- Proposed: `, 1920s Art Deco mystery illustration, muted sepia and jade tones, elegant geometric linework, gaslit atmosphere, fine printed shading`  (dropped "novel-cover" → text)
- Approved:

### alice-in-wonderland
- Current: `, John Tenniel engraving, fine crosshatching, 1865 original edition style`
- Proposed: `, John Tenniel wood-engraving illustration, fine crosshatching and hatched shading, 1865 original-edition style, black ink on cream paper`
- Approved:

### breaking-bad
- Current: `, hand-rubbed etching style, harsh New Mexico desert sunlight, chemical yellow-green hazmat tint`
- Proposed: `, hand-rubbed etching illustration, scratchy intaglio linework, harsh high-contrast light, chemical yellow-green and bleached-sand palette`
- Approved:

### catch-22
- Current: `, WWII allied propaganda poster, no words or text, red white and blue color scheme`
- Proposed: `, WWII Allied propaganda-poster illustration, bold flat shapes, red white and blue palette, heavy printed ink, dramatic upward heroic angle`  ("no words" now in central safety clause)
- Approved:

### dune
- Current: `, ink and watercolor wash, sepia tones, detailed linework`
- Proposed: `, ink-and-watercolor-wash illustration, sepia and dune-gold tones, detailed pen linework, soft graded washes, epic desert-light mood`
- Approved:

### fifth-element
- Current: `, two-thirds portrait, Klimt and Schiele painting space opera`
- Proposed: `, Klimt and Egon Schiele-inspired painting, decorative gold-leaf patterning, bold expressive outlines, vivid space-opera palette`
- Approved:

### gilligans-island
- Current: `, 1960s TV sitcom portrait, black and white, stylized illustration, palm trees lagoon backdrop`  ⤳ move "palm trees lagoon" to `visual`
- Proposed: `, 1960s TV-sitcom title-card illustration, stylized hand-drawn cartoon, black-and-white with cross-hatched shading, playful exaggerated style`
- Approved:

### greek-mythology
- Current: `, ancient Greek vase painting, black-figure pottery, Mount Olympus backdrop, gold and azure`  ⤳ move "Mount Olympus" to `visual`
- Proposed: `, ancient Greek black-figure vase painting, terracotta-orange and black slip, fine incised linework, gold and azure accents, decorative meander border`
- Approved:

### hogans-heroes
- Current: `, WWII military sitcom, barracks illustration, cartoon realism`
- Proposed: `, 1960s cartoon-realism illustration, warm printed comic style, bold inked outlines, flat color fills, lighthearted tone`
- Approved:

### house-md
- Current: `, medical book, anatomy chart, medical illustrations`
- Proposed: `, vintage medical-textbook illustration, anatomical-plate engraving style, fine cross-hatched linework, muted clinical ink-and-wash palette`  (dropped "chart" — invites labels/text)
- Approved:

### jane-austen
- Current: `, Regency era miniature, watercolor on ivory, pastoral countryside, empire waist muslin, Regency romance illustration`
- Proposed: `, Regency-era portrait miniature, watercolor on ivory, soft pastoral palette, delicate stippled brushwork, gentle romantic lighting`
- Approved:

### jazz-legends
- Current: `, vintage jazz album cover, smoky jazz club, high contrast black and white, bebop era, 1950s graphic design`  ⤳ move "smoky jazz club" to `visual`
- Proposed: `, 1950s jazz illustration, bold mid-century graphic design, high-contrast black and white with one spot color, screen-printed texture`  (dropped "album-cover" → text)
- Approved:

### mad-max
- Current: `, movie storyboard art, rough charcoal and sepia sketch, dynamic action lines, dusty wasteland atmosphere`
- Proposed: `, movie-storyboard illustration, rough charcoal and sepia sketch, dynamic gestural action lines, smudged dusty texture, high-contrast harsh light`
- Approved:

### mash
- Current: `, Norman Rockwell Saturday Evening Post illustration, warm nostalgic Americana, soft lighting, idealized realism, painterly brushstrokes, 1950s illustration style`
- Proposed: `, Norman Rockwell-style illustration, warm nostalgic Americana, soft idealized realism, painterly brushstrokes, 1950s American magazine illustration`  (removed "Saturday Evening Post" + "magazine-cover" → text; kept Norman Rockwell)
- Approved: **OK** — applied to YAML + rendered (pilot 2026-06-01, with centralized safety clause).

### moby-dick
- Current: `, maritime oil painting, stormy sea backdrop, dark oceanic tones, scrimshaw details`
- Proposed: `, maritime oil painting, thick impasto brushwork, dark stormy oceanic tones, dramatic seafaring chiaroscuro, scrimshaw-fine detailing`
- Approved:

### monty-python
- Current: `, Victorian cut-out paper collage animation, photograph cutouts with articulated joints, surreal mixed media collage on parchment`
- Proposed: `, Terry Gilliam Victorian cut-out paper-collage animation, engraved cutout figures with articulated joints, surreal mixed-media collage on aged parchment, absurdist composition`
- Approved:

### neuromancer
- Current: `, cyberpunk portrait, neon shadows, glitching artifacts, 1980s retrofuturism illustration, matrix green`
- Proposed: `, 1980s retrofuturist cyberpunk illustration, airbrushed neon shadows, glitching digital artifacts, matrix-green and hot-magenta palette, chrome highlights`
- Approved:

### norse-mythology
- Current: `, Viking Age runestone, weathered textures, northern lights, Celtic knotwork borders`
- Proposed: `, Viking-age runestone-carving illustration, weathered incised stone texture, interlaced knotwork borders, cold northern palette, aurora glow`
- Approved:

### princess-bride
- Current: `, fairy tale storybook watercolor illustration, warm romantic lighting, Renaissance Faire, enchanted forest backdrop`  ⤳ move "enchanted forest" to `visual`
- Proposed: `, fairy-tale storybook watercolor illustration, soft romantic washes, warm golden lighting, gentle linework, classic children's-book charm`
- Approved: **OK** — applied to YAML + rendered (pilot 2026-06-01, with centralized safety clause).

### rome
- Current: `, ancient Roman mosaic portrait, tessera tile fragments, scratched graffito details, Pompeii wall art style, geometric earth tones, stone texture`
- Proposed: `, ancient Roman mosaic portrait, tessera tile fragments, scratched graffito detail, Pompeii wall-fresco palette, earthy stone texture, decorative tile border`
- Approved:

### sherlock-holmes
- Current: `, Victorian detective, gaslight and fog, Baker Street, Victorian pen and ink`  ⤳ move "Baker Street" to `visual`
- Proposed: `, Victorian pen-and-ink illustration, fine cross-hatching, gaslit fog atmosphere, sepia-and-ink wash, 1890s periodical-engraving style`
- Approved:

### snow-crash
- Current: `, Metaverse avatar, franchise nation, 90s cyberpunk, vector-sharp digital, 1990s future-tech`
- Proposed: `, 1990s vector cyberpunk illustration, sharp flat digital shapes, bold neon gradients, glossy avatar styling, hard-edged future-tech palette`
- Approved:

### software-pioneers
- Current: `, woodcut engraving, scientific journal illustration, fine crosshatching, black ink on cream paper`
- Proposed: `, woodcut-engraving illustration, scientific-journal plate style, fine crosshatching, black ink on cream paper, dignified composition`
- Approved:

### star-wars
- Current: `, space opera cinematic, retro sci-fi concept art, art deco, Tamara Lempicka style`
- Proposed: `, Tamara de Lempicka-style Art Deco painting, smooth tubular forms, polished metallic palette, retro space-opera concept-art, dramatic cinematic lighting`
- Approved:

### stephen-king
- Current: `, horror gothic, oil painting, dark atmospheric, New England small town`  ⤳ move "New England small town" to `visual`
- Proposed: `, gothic-horror oil painting, dark atmospheric tones, muted desaturated palette, eerie low-key chiaroscuro, painterly dread`
- Approved:

### the-matrix
- Current: `, cyberpunk, green digital rain overlay, action illustration style`
- Proposed: `, action-illustration style, cyberpunk green digital-rain overlay, high-contrast emerald-and-black palette, dynamic anime-influenced rendering`
- Approved:

### the-wire
- Current: `, gritty urban screenprinted-poster style, Baltimore street scenes`  ⤳ move "Baltimore street scenes" to `visual`
- Proposed: `, gritty urban screen-printed poster illustration, halftone texture, limited high-contrast palette, raw stencil-style rendering`
- Approved:

### vorkosigan-saga
- Current: `, art noveau style, vintage illustration, Klimt-inspired`
- Proposed: `, Art Nouveau vintage illustration, Klimt-inspired decorative patterning, ornate flowing linework, gilded jewel-toned palette`
- Approved:

### west-wing
- Current: `, 19th century political cartoon style, bold ink linework, ink on paper, muted colors`
- Proposed: `, 19th-century political-cartoon illustration, bold pen-and-ink linework, ink-on-paper crosshatching, muted editorial palette, dignified satirical style`
- Approved:

---

## Centralized safety clause (proposed, goes in `build_prompt()` — review separately)

```
. Adult subject, fully clothed, modest, non-sexualized, correct anatomy, natural hands.
No text, no caption, no title, no writing, no signature, no labels, no watermark, no logos.
```

Decision needed: accept this wording, and confirm it lives in the script (one place)
rather than per-theme.

**firefly exception:** because firefly deliberately wants tarot lettering, the global
`no text…` clause would fight it. Proposed mechanism: a per-theme opt-out
(`theme.portrait_allow_text: true`) that makes `build_prompt()` omit the
`no text/caption/labels/writing` portion for that theme (keeps the anatomy/modesty
portion). firefly would be the only theme with the flag set.

---

## Tier 2 — per-character `visual` rewrite rules (next phase, after theme layer locks)

The theme layer sets the *medium*; each character's `visual` describes the *person*. The
governing principle, learned from catch-22 (Orr's literal apple cheeks, Milo painted with
"M&M Enterprises" text and cotton bales) and refined per user:

**Be literal and explicit. Allusions are fine — coyness is not.**

- ✅ **Spell out the visual you actually want.** Want a bale of cotton behind Milo? Write
  "a bale of cotton behind him." Want puffed cheeks? Write "round, puffed-out cheeks." The
  model renders exactly the concrete nouns you name — so name them plainly.
- ❌ **No coy / cute / implicit wordplay.** "apple-stuffed cheeks" (expecting a pun) →
  literal apples. If you don't want apples on the face, don't write apple.
- ❌ **No proper nouns / brands / company names** ("M&M Enterprises", unit numbers, place
  names) — they render as garbled painted **text**. Replace with the literal object you
  want visible ("crates of trade goods", "a folded paper") or drop it.
- ❌ **No impressionistic face language** ("manic", "vapid", "owlish", "knowing eyes") →
  cartoon drift. Describe the physical fact (brow shape, eye color, expression-as-pose).
- ✅ **Scaffold:** adult, build, age, 2–4 physical traits, concrete clothing,
  expression-as-physical-pose, then any spelled-out background props, then lighting.
- Recognizable likenesses are fine (the model knows them) — keep the physical description
  that produces the likeness; let the theme medium anchor style it.

Bottom line: the cleverness is allowed to *appear in the image* if we draw it explicitly;
it must never live as a wink the model has to "get."
