#!/usr/bin/env python3
"""
Individual Portrait Generator for Pennyfarthing Themes

Generates 10 individual portraits per theme using Stable Diffusion SDXL on M3 Max (MPS).
Reads visual prompts from theme YAML files in two locations:
  - Built-in: pennyfarthing-dist/personas/themes/
  - Custom:   .claude/pennyfarthing/themes/ (takes precedence)

Output: pennyfarthing-dist/personas/portraits/{theme}/{slug}-{OCEAN}.png (512x512px each)

Usage:
    python3 scripts/generate-portraits.py [--dry-run] [--theme THEME]
    python3 scripts/generate-portraits.py --theme gilligans-island --dry-run
"""

import argparse
import os
import sys
import warnings
from pathlib import Path
from datetime import datetime

# Suppress progress bars before importing torch/diffusers
os.environ["TQDM_DISABLE"] = "1"

# Suppress CUDA warnings on MPS (Apple Silicon)
warnings.filterwarnings("ignore", message=".*CUDA is not available.*")

try:
    import yaml
except ImportError:
    print("Missing PyYAML: pip install pyyaml")
    sys.exit(1)

try:
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    from diffusers.utils import logging as diffusers_logging
    from PIL import Image
    HAS_TORCH = True
    # Suppress diffusers progress bar
    diffusers_logging.disable_progress_bar()
except ImportError as e:
    HAS_TORCH = False
    TORCH_ERROR = str(e)

# CLIP tokenizer for accurate token counting (optional - falls back to word estimate)
try:
    from transformers import CLIPTokenizer
    CLIP_TOKENIZER = CLIPTokenizer.from_pretrained("openai/clip-vit-large-patch14")
    HAS_CLIP_TOKENIZER = True
except Exception:
    CLIP_TOKENIZER = None
    HAS_CLIP_TOKENIZER = False


# Configuration
SCRIPT_DIR = Path(__file__).parent.resolve()

# Find PROJECT_ROOT by walking up until we find pennyfarthing-dist at the expected level
# Script lives at: {PROJECT_ROOT}/pennyfarthing-dist/scripts/portraits/generate-portraits.py
def _find_project_root() -> Path:
    """Find project root by looking for pennyfarthing-dist or .git marker."""
    current = SCRIPT_DIR
    # Walk up from portraits/ -> scripts/ -> pennyfarthing-dist/ -> PROJECT_ROOT
    for _ in range(5):  # Safety limit
        # Check if this looks like the project root
        if (current / "pennyfarthing-dist" / "personas" / "themes").exists():
            return current
        if (current / ".git").exists() and (current / "pennyfarthing-dist").exists():
            return current
        current = current.parent
    # Fallback: assume old structure (script in {root}/scripts/portraits/)
    return SCRIPT_DIR.parent.parent

PROJECT_ROOT = _find_project_root()
BUILTIN_THEMES_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "themes"
CUSTOM_THEMES_DIR = PROJECT_ROOT / ".claude" / "pennyfarthing" / "themes"
OUTPUT_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "portraits"
MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"

# SDXL generates at 1024x1024, we'll resize to 512x512
GENERATION_SIZE = 1024
OUTPUT_SIZE = 512

# Generation parameters
NUM_INFERENCE_STEPS = 30
GUIDANCE_SCALE = 7.5

# CLIP token limit - prompts are truncated beyond this
CLIP_MAX_TOKENS = 77

# Role order for the 11 agents
ROLES = [
    "orchestrator", "sm", "tea", "dev", "reviewer",
    "architect", "pm", "tech-writer", "ux-designer", "devops", "ba"
]

# Default style suffix (visual description comes first for emphasis)
# Themes can override this by setting 'portrait_style' in their theme metadata
DEFAULT_STYLE_SUFFIX = ", traditional woodcut portrait bust, black and white, bold linework, crosshatching, medieval style"


def to_slug(name: str) -> str:
    """Convert a name to URL-safe slug (lowercase kebab-case)."""
    import re
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'^-|-$', '', slug)
    return slug


def count_clip_tokens(text: str) -> int:
    """Count CLIP tokens in text. Uses actual tokenizer if available, else estimates."""
    if HAS_CLIP_TOKENIZER and CLIP_TOKENIZER:
        tokens = CLIP_TOKENIZER.encode(text)
        return len(tokens)
    else:
        # Fallback: estimate ~1.3 tokens per word (empirical average for CLIP)
        return int(len(text.split()) * 1.3)


def truncate_prompt_to_clip_limit(visual: str, style_suffix: str, max_tokens: int = CLIP_MAX_TOKENS) -> tuple[str, bool]:
    """Truncate prompt to fit within CLIP token limit.

    Strategy: Prioritize the visual description over the style suffix.
    If combined prompt exceeds limit, progressively trim the visual description.

    Returns:
        tuple: (truncated_prompt, was_truncated)
    """
    combined = f"{visual}{style_suffix}"
    token_count = count_clip_tokens(combined)

    if token_count <= max_tokens:
        return combined, False

    # Need to truncate - prioritize visual by trimming words from end
    visual_words = visual.split()
    style_tokens = count_clip_tokens(style_suffix)
    available_for_visual = max_tokens - style_tokens - 2  # Buffer for safety

    # Binary search for optimal truncation point
    while visual_words and count_clip_tokens(" ".join(visual_words)) > available_for_visual:
        visual_words = visual_words[:-1]

    truncated_visual = " ".join(visual_words)
    if truncated_visual and not truncated_visual.endswith((",", ".", ";")):
        truncated_visual = truncated_visual.rstrip(",. ")

    return f"{truncated_visual}{style_suffix}", True


def ocean_suffix(ocean: dict) -> str:
    """Generate OCEAN suffix from scores (e.g., '54432' for O=5,C=4,E=4,A=3,N=2)."""
    return f"{ocean['O']}{ocean['C']}{ocean['E']}{ocean['A']}{ocean['N']}"


def generate_portrait_filename(short_name: str, ocean: dict) -> str:
    """Generate portrait filename from shortName and OCEAN scores.

    Format: {shortName-slug}-{OCEAN}.png (e.g., 'yoda-54242.png')
    """
    slug = to_slug(short_name)
    return f"{slug}-{ocean_suffix(ocean)}.png"


def parse_theme_file(theme_path: Path) -> dict:
    """Parse theme YAML file to extract visual prompts for each agent."""
    with open(theme_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    theme_metadata = data.get("theme", {})
    result = {
        "theme": theme_path.stem,
        "source": theme_metadata.get("source", ""),
        "portrait_style": theme_metadata.get("portrait_style", None),
        "characters": {}
    }

    agents = data.get("agents", {})
    for role, agent_data in agents.items():
        if isinstance(agent_data, dict) and "visual" in agent_data:
            # Get shortName, fallback to first word of character name
            character = agent_data.get("character", role)
            short_name = agent_data.get("shortName", character.split()[0])
            ocean = agent_data.get("ocean", {})

            # Generate filename if OCEAN scores are available
            if ocean and all(k in ocean for k in ['O', 'C', 'E', 'A', 'N']):
                filename = generate_portrait_filename(short_name, ocean)
            else:
                # Fallback to role-based name if no OCEAN scores
                filename = f"{role}.png"

            result["characters"][role] = {
                "name": character,
                "shortName": short_name,
                "visual": agent_data["visual"],
                "ocean": ocean,
                "filename": filename
            }

    return result


def build_portrait_prompt(visual: str, style_suffix: str = None) -> tuple[str, bool, int]:
    """Build a prompt for portrait generation with CLIP token limit enforcement.

    Args:
        visual: The character's visual description from theme YAML
        style_suffix: Optional theme-specific style suffix. Falls back to DEFAULT_STYLE_SUFFIX.

    Returns:
        tuple: (prompt, was_truncated, token_count)
    """
    suffix = style_suffix if style_suffix is not None else DEFAULT_STYLE_SUFFIX
    prompt, was_truncated = truncate_prompt_to_clip_limit(visual, suffix)
    token_count = count_clip_tokens(prompt)
    return prompt, was_truncated, token_count


def load_pipeline():
    """Load SDXL pipeline on MPS."""
    print("\nLoading SDXL model on MPS...")
    print("(First run downloads ~6.5GB model)")

    # Use float32 on MPS to avoid NaN issues with float16
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,
        use_safetensors=True,
    )

    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to("mps")
    pipe.enable_attention_slicing()

    print("Model loaded.\n")
    return pipe


def generate_portrait(pipe, prompt: str, seed: int = 42) -> "Image.Image":
    """Generate a single portrait."""
    # Use CPU generator for MPS compatibility
    generator = torch.Generator().manual_seed(seed)

    with torch.no_grad():
        result = pipe(
            prompt=prompt,
            negative_prompt="color, grayscale, photorealistic, blurry, deformed",
            width=GENERATION_SIZE,
            height=GENERATION_SIZE,
            num_inference_steps=NUM_INFERENCE_STEPS,
            guidance_scale=GUIDANCE_SCALE,
            generator=generator,
        )

    image = result.images[0]
    # Resize to output size
    return image.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description="Generate individual portraits from theme YAML files")
    parser.add_argument("--dry-run", action="store_true", help="List without generating")
    parser.add_argument("--theme", type=str, help="Generate only this theme")
    parser.add_argument("--role", type=str, help="Generate only this role (with --theme)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--skip-existing", action="store_true", help="Skip existing files")
    parser.add_argument("--output-dir", type=str, help="Output to different directory (default: pennyfarthing-dist/personas/portraits)")
    args = parser.parse_args()

    # Determine output directory
    output_base = Path(args.output_dir) if args.output_dir else OUTPUT_DIR

    # Find theme files from both built-in and custom directories
    # Custom themes take precedence over built-in themes with same name
    theme_map = {}

    # First add built-in themes
    if BUILTIN_THEMES_DIR.exists():
        for tf in BUILTIN_THEMES_DIR.glob("*.yaml"):
            theme_map[tf.stem] = tf

    # Then add/override with custom themes
    if CUSTOM_THEMES_DIR.exists():
        for tf in CUSTOM_THEMES_DIR.glob("*.yaml"):
            theme_map[tf.stem] = tf

    theme_files = sorted(theme_map.values(), key=lambda p: p.stem)

    if args.theme:
        if args.theme in theme_map:
            theme_files = [theme_map[args.theme]]
        else:
            print(f"Theme '{args.theme}' not found")
            print(f"  Searched: {BUILTIN_THEMES_DIR}")
            print(f"  Searched: {CUSTOM_THEMES_DIR}")
            sys.exit(1)

    print(f"Theme sources:")
    print(f"  Built-in: {BUILTIN_THEMES_DIR}")
    print(f"  Custom:   {CUSTOM_THEMES_DIR}")
    print(f"Found {len(theme_files)} themes")
    print(f"Output: {output_base}/{{theme}}/{{slug}}-{{OCEAN}}.png")

    if args.dry_run:
        print(f"\nCLIP token limit: {CLIP_MAX_TOKENS} tokens")
        print(f"Tokenizer: {'CLIP (accurate)' if HAS_CLIP_TOKENIZER else 'word estimate (fallback)'}")
        print("\nDry run - portraits to generate:")
        truncation_warnings = []
        for tf in theme_files:
            parsed = parse_theme_file(tf)
            theme_dir = output_base / parsed["theme"]
            char_count = len(parsed["characters"])
            style_desc = parsed["portrait_style"][:60] + "..." if parsed["portrait_style"] and len(parsed["portrait_style"]) > 60 else parsed["portrait_style"]
            style_display = style_desc if style_desc else "(default woodcut)"
            print(f"\n  {parsed['theme']}/ ({char_count} characters with visual)")
            print(f"    Style: {style_display}")
            for role in ROLES:
                if role in parsed["characters"]:
                    char = parsed["characters"][role]
                    out_path = theme_dir / char["filename"]
                    status = "EXISTS" if out_path.exists() else "PENDING"

                    # Check token count and truncation
                    prompt, was_truncated, token_count = build_portrait_prompt(char["visual"], parsed["portrait_style"])
                    token_status = f"{token_count}tok"
                    if was_truncated:
                        token_status = f"⚠️ {token_count}tok TRUNCATED"
                        truncation_warnings.append((parsed["theme"], role, char["filename"]))

                    visual_preview = char["visual"][:40] + "..." if len(char["visual"]) > 40 else char["visual"]
                    print(f"    [{status}] {char['filename']} ({token_status}): {visual_preview}")
                else:
                    print(f"    [SKIP] {role}: no visual field")

        if truncation_warnings:
            print(f"\n{'='*60}")
            print(f"⚠️  WARNING: {len(truncation_warnings)} prompts will be truncated!")
            print(f"    CLIP limit is {CLIP_MAX_TOKENS} tokens. Consider shortening:")
            for theme, role, filename in truncation_warnings[:10]:
                print(f"    - {theme}/{filename} ({role})")
            if len(truncation_warnings) > 10:
                print(f"    ... and {len(truncation_warnings) - 10} more")
        return

    # Check for torch
    if not HAS_TORCH:
        print(f"Missing required package: {TORCH_ERROR}")
        print("\nInstall: pip install diffusers transformers accelerate torch pillow")
        sys.exit(1)

    # Load model
    pipe = load_pipeline()

    # Track results
    successful = 0
    failed = []
    truncated = []
    start_time = datetime.now()

    total_themes = len(theme_files)
    for theme_idx, tf in enumerate(theme_files, 1):
        parsed = parse_theme_file(tf)
        theme = parsed["theme"]
        theme_dir = output_base / theme
        theme_dir.mkdir(parents=True, exist_ok=True)

        roles_to_gen = [args.role] if args.role else ROLES
        print(f"\n[{theme_idx}/{total_themes}] Theme: {theme}")

        for role in roles_to_gen:
            if role not in parsed["characters"]:
                continue

            char = parsed["characters"][role]
            out_path = theme_dir / char["filename"]
            if args.skip_existing and out_path.exists():
                print(f"  SKIP (exists): {char['filename']}")
                continue

            prompt, was_truncated, token_count = build_portrait_prompt(char["visual"], parsed["portrait_style"])

            if was_truncated:
                truncated.append((theme, char["filename"], token_count))
                print(f"  WARNING: Truncated {char['filename']} to {token_count} tokens")

            print(f"  Generating: {char['filename']} ({char['name']})...")
            print(f"    Prompt: {prompt}")
            try:
                # Vary seed per character for diversity (base_seed + role_index)
                role_seed = args.seed + ROLES.index(role)
                image = generate_portrait(pipe, prompt, seed=role_seed)
                image.save(out_path, "PNG")
                successful += 1
                print(f"  DONE: {char['filename']}")
            except Exception as e:
                failed.append((theme, char["filename"], str(e)))
                print(f"  FAILED: {char['filename']}: {e}")

    # Summary
    elapsed = datetime.now() - start_time
    print(f"\n{'='*50}")
    print(f"Complete: {successful} portraits in {elapsed}")
    if truncated:
        print(f"Truncated: {len(truncated)} prompts exceeded {CLIP_MAX_TOKENS} token limit")
    if failed:
        print(f"Failed: {len(failed)}")
        for t, r, e in failed:
            print(f"  - {t}/{r}: {e}")


if __name__ == "__main__":
    main()
