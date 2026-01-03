# DevOps Handoff: Sprite Sheet Generation

## Task
Generate 63 sprite sheet images (one per theme) using Stable Diffusion SDXL locally on M3 Max.

## Context
- Prompts already exist in `docs/sprite-prompts/*.md` (63 files)
- Each prompt describes a 5×2 grid of character portraits (500×200px)
- Style: woodcut illustration, black and white, crosshatching
- Output destination: `showcase/public/sprites/{theme}.png`

## Technical Requirements

### Hardware
- Apple M3 Max (confirmed available)
- Uses MPS (Metal Performance Shaders) for GPU acceleration

### Software Setup
```bash
# Create virtual environment
python3 -m venv ~/.venvs/sd
source ~/.venvs/sd/bin/activate

# Install dependencies
pip install diffusers transformers accelerate torch pillow

# Model will auto-download on first run (~6.5GB for SDXL)
```

### Script Requirements
Create `docs/sprite-prompts/generate-sprites.py`:

1. **Load SDXL model** with MPS device
   - Model: `stabilityai/stable-diffusion-xl-base-1.0`
   - Use `torch.float16` for memory efficiency

2. **For each prompt file** in `docs/sprite-prompts/*.md`:
   - Read the markdown content as the prompt
   - Generate image at 1024×512 (SDXL native, will crop/resize)
   - Or generate at 512×256 and upscale

3. **Post-process**:
   - Resize to 500×200px
   - Save as PNG to `showcase/public/sprites/{theme}.png`

4. **Progress tracking**:
   - Print status for each theme
   - Handle errors gracefully (some prompts may fail content filters)
   - Save successful outputs even if some fail

### Expected Performance
- ~45-60 seconds per image on M3 Max
- Total time: ~45-60 minutes for all 63 themes

### Sample Prompt Structure
```markdown
Create a sprite sheet of 10 character portrait busts in a 5×2 grid...

**Style:** Traditional woodcut illustration, black and white only...

**Theme:** Discworld
**Source:** Terry Pratchett's Discworld novels

**Row 1 (left to right):**
1. **Orchestrator:** DEATH - Speaks IN CAPITALS...
...
```

## Output Integration
After generation, the sprites are used by:
- `showcase/src/pages/themes/[theme].astro` - Theme detail pages
- Accessed via `/sprites/{theme}.png` URL

## Verification
```bash
# Check generated files
ls -la showcase/public/sprites/*.png | wc -l  # Should be 63

# Rebuild showcase to include new assets
cd showcase && npm run build
```

## Notes
- SDXL may struggle with specific copyrighted characters (Harry Potter, Marvel, etc.)
- If a prompt fails, log it and continue - can retry those manually
- Woodcut style should help avoid photorealistic content filters
