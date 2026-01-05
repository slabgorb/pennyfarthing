#!/usr/bin/env python3
"""
Individual Portrait Generator for Pennyfarthing Themes

Generates 10 individual portraits per theme using Stable Diffusion SDXL on M3 Max (MPS).
Reads visual prompts from theme YAML files (pennyfarthing-dist/personas/themes/).
Output: internal/showcase/public/portraits/{theme}/{role}.png (100x100px each)

Usage:
    python3 scripts/generate-portraits.py [--dry-run] [--theme THEME]
"""

import argparse
import os
import sys
from pathlib import Path
from datetime import datetime

try:
    import yaml
except ImportError:
    print("Missing PyYAML: pip install pyyaml")
    sys.exit(1)

try:
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    from PIL import Image
    from tqdm import tqdm
    HAS_TORCH = True
except ImportError as e:
    HAS_TORCH = False
    TORCH_ERROR = str(e)


# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
THEMES_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "themes"
OUTPUT_DIR = PROJECT_ROOT / "internal" / "showcase" / "public" / "portraits"
MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"

# SDXL generates at 1024x1024, we'll resize to 100x100
GENERATION_SIZE = 1024
OUTPUT_SIZE = 100

# Generation parameters
NUM_INFERENCE_STEPS = 30
GUIDANCE_SCALE = 7.5

# Role order for the 10 agents
ROLES = [
    "orchestrator", "sm", "tea", "dev", "reviewer",
    "architect", "pm", "tech-writer", "ux-designer", "devops"
]

# Style suffix (visual description comes first for emphasis)
STYLE_SUFFIX = ", traditional woodcut portrait bust, black and white, bold linework, crosshatching, medieval style"


def parse_theme_file(theme_path: Path) -> dict:
    """Parse theme YAML file to extract visual prompts for each agent."""
    with open(theme_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    result = {
        "theme": theme_path.stem,
        "source": data.get("theme", {}).get("source", ""),
        "characters": {}
    }

    agents = data.get("agents", {})
    for role, agent_data in agents.items():
        if isinstance(agent_data, dict) and "visual" in agent_data:
            result["characters"][role] = {
                "name": agent_data.get("character", role),
                "visual": agent_data["visual"]
            }

    return result


def build_portrait_prompt(visual: str) -> str:
    """Build a prompt for portrait generation."""
    return f"{visual}{STYLE_SUFFIX}"


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
    args = parser.parse_args()

    # Find theme files
    theme_files = sorted(THEMES_DIR.glob("*.yaml"))

    if args.theme:
        theme_files = [t for t in theme_files if t.stem == args.theme]
        if not theme_files:
            print(f"Theme '{args.theme}' not found")
            sys.exit(1)

    print(f"Reading from: {THEMES_DIR}")
    print(f"Found {len(theme_files)} themes")
    print(f"Output: {OUTPUT_DIR}/{{theme}}/{{role}}.png")

    if args.dry_run:
        print("\nDry run - portraits to generate:")
        for tf in theme_files:
            parsed = parse_theme_file(tf)
            theme_dir = OUTPUT_DIR / parsed["theme"]
            char_count = len(parsed["characters"])
            print(f"\n  {parsed['theme']}/ ({char_count} characters with visual)")
            for role in ROLES:
                if role in parsed["characters"]:
                    char = parsed["characters"][role]
                    out_path = theme_dir / f"{role}.png"
                    status = "EXISTS" if out_path.exists() else "PENDING"
                    visual_preview = char["visual"][:50] + "..." if len(char["visual"]) > 50 else char["visual"]
                    print(f"    [{status}] {role}: {visual_preview}")
                else:
                    print(f"    [SKIP] {role}: no visual field")
        return

    # Check for torch
    if not HAS_TORCH:
        print(f"Missing required package: {TORCH_ERROR}")
        print("\nInstall: pip install diffusers transformers accelerate torch pillow tqdm")
        sys.exit(1)

    # Load model
    pipe = load_pipeline()

    # Track results
    successful = 0
    failed = []
    start_time = datetime.now()

    for tf in tqdm(theme_files, desc="Themes"):
        parsed = parse_theme_file(tf)
        theme = parsed["theme"]
        theme_dir = OUTPUT_DIR / theme
        theme_dir.mkdir(parents=True, exist_ok=True)

        roles_to_gen = [args.role] if args.role else ROLES

        for role in roles_to_gen:
            if role not in parsed["characters"]:
                continue

            out_path = theme_dir / f"{role}.png"
            if args.skip_existing and out_path.exists():
                continue

            char = parsed["characters"][role]
            prompt = build_portrait_prompt(char["visual"])

            try:
                # Vary seed per character for diversity (base_seed + role_index)
                role_seed = args.seed + ROLES.index(role)
                image = generate_portrait(pipe, prompt, seed=role_seed)
                image.save(out_path, "PNG")
                successful += 1
                tqdm.write(f"  {theme}/{role}: {char['name']}")
            except Exception as e:
                failed.append((theme, role, str(e)))
                tqdm.write(f"  FAILED {theme}/{role}: {e}")

    # Summary
    elapsed = datetime.now() - start_time
    print(f"\n{'='*50}")
    print(f"Complete: {successful} portraits in {elapsed}")
    if failed:
        print(f"Failed: {len(failed)}")
        for t, r, e in failed:
            print(f"  - {t}/{r}: {e}")


if __name__ == "__main__":
    main()
