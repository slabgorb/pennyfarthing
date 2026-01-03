#!/usr/bin/env python3
"""
Individual Portrait Generator for Pennyfarthing Themes

Generates 10 individual portraits per theme using Stable Diffusion SDXL on M3 Max (MPS).
Output: showcase/public/sprites/{theme}/{role}.png (100x100px each)

Usage:
    python3 docs/sprite-prompts/generate-sprites.py [--dry-run] [--theme THEME]
"""

import argparse
import re
import os
import sys
from pathlib import Path
from datetime import datetime

try:
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    from PIL import Image
    from tqdm import tqdm
except ImportError as e:
    print(f"Missing required package: {e}")
    print("\nInstall: pip install diffusers transformers accelerate torch pillow tqdm")
    sys.exit(1)


# Configuration
PROMPTS_DIR = Path(__file__).parent
OUTPUT_DIR = Path(__file__).parent.parent.parent / "showcase" / "public" / "sprites"
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

# Files to skip
SKIP_FILES = {"DEVOPS-HANDOFF.md", "generate-prompts.js", "generate-prompts.sh"}

# Style suffix (character comes first for emphasis)
STYLE_SUFFIX = ", traditional woodcut portrait bust, black and white, bold linework, crosshatching, medieval style"


def parse_prompt_file(prompt_path: Path) -> dict:
    """Parse markdown file to extract theme and character descriptions."""
    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read()

    result = {
        "theme": prompt_path.stem,
        "source": "",
        "characters": {}
    }

    # Extract source
    source_match = re.search(r"\*\*Source:\*\*\s*(.+)", content)
    if source_match:
        result["source"] = source_match.group(1).strip()

    # Extract characters - pattern: N. **Role:** Name - Description
    # Use " - " as separator (space-hyphen-space) to handle names with hyphens
    char_pattern = r"\d+\.\s*\*\*([^:]+):\*\*\s*(.+?)\s+-\s+([^\n]+)"
    matches = re.findall(char_pattern, content)

    role_map = {
        "Orchestrator": "orchestrator",
        "SM (Scrum Master)": "sm",
        "SM": "sm",
        "TEA (Test Engineer)": "tea",
        "TEA": "tea",
        "Dev (Developer)": "dev",
        "Dev": "dev",
        "Reviewer": "reviewer",
        "Architect": "architect",
        "PM (Product Manager)": "pm",
        "PM": "pm",
        "Tech Writer": "tech-writer",
        "UX Designer": "ux-designer",
        "DevOps": "devops",
    }

    for role_raw, name, desc in matches:
        role = role_map.get(role_raw.strip(), role_raw.strip().lower())
        result["characters"][role] = {
            "name": name.strip(),
            "description": desc.strip()
        }

    return result


def build_portrait_prompt(char_name: str, char_desc: str, source: str) -> str:
    """Build a short prompt for a single portrait (under 77 tokens)."""
    # char_name now contains visual description, char_desc has personality
    # We primarily use visual description, add personality briefly
    prompt = f"{char_name}"
    # Add style at end
    prompt += STYLE_SUFFIX
    return prompt


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


def generate_portrait(pipe, prompt: str, seed: int = 42) -> Image.Image:
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
    parser = argparse.ArgumentParser(description="Generate individual portraits")
    parser.add_argument("--dry-run", action="store_true", help="List without generating")
    parser.add_argument("--theme", type=str, help="Generate only this theme")
    parser.add_argument("--role", type=str, help="Generate only this role (with --theme)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--skip-existing", action="store_true", help="Skip existing files")
    args = parser.parse_args()

    # Find prompt files
    prompt_files = sorted(PROMPTS_DIR.glob("*.md"))
    prompt_files = [p for p in prompt_files if p.name not in SKIP_FILES]

    if args.theme:
        prompt_files = [p for p in prompt_files if p.stem == args.theme]
        if not prompt_files:
            print(f"Theme '{args.theme}' not found")
            sys.exit(1)

    print(f"Found {len(prompt_files)} themes")
    print(f"Output: {OUTPUT_DIR}/{{theme}}/{{role}}.png")

    if args.dry_run:
        print("\nDry run - portraits to generate:")
        for pf in prompt_files:
            parsed = parse_prompt_file(pf)
            theme_dir = OUTPUT_DIR / parsed["theme"]
            print(f"\n  {parsed['theme']}/ ({len(parsed['characters'])} characters)")
            for role in ROLES:
                if role in parsed["characters"]:
                    char = parsed["characters"][role]
                    out_path = theme_dir / f"{role}.png"
                    status = "EXISTS" if out_path.exists() else "PENDING"
                    print(f"    [{status}] {role}: {char['name']}")
        return

    # Load model
    pipe = load_pipeline()

    # Track results
    successful = 0
    failed = []
    start_time = datetime.now()

    for pf in tqdm(prompt_files, desc="Themes"):
        parsed = parse_prompt_file(pf)
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
            prompt = build_portrait_prompt(char["name"], char["description"], parsed["source"])

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
