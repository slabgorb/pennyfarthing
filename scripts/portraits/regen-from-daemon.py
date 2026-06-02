#!/usr/bin/env python3
"""Regenerate pennyfarthing portraits via the sidequest Z-Image daemon.

Connects to the sidequest-renderer Unix socket, walks theme YAML files, and
sends one render request per agent using the ``portrait_square`` tier
(1024x1024). Output is downscaled to 512x512 and written to:

    {pennyfarthing-dist}/personas/portraits/{theme}/{slug}-{OCEAN}.png

That 512px render is the *master*. Each render is sliced automatically into the
multi-resolution set — small (64) / medium (128) / large (256) and the 512px
master archived to original/ — so no separate ``scripts/resize-portraits.sh``
pass is needed (``--no-slice`` opts out).

Skips characters that are already rendered (resumable): a real master at the
theme root OR in original/ counts as done. Unresolved git-lfs pointer stubs do
NOT count, so un-rendered themes still render. Use --force to regenerate.

Z-Image daemon notes (vs. the retired Flux daemon this replaces):
  - Same socket: /tmp/sidequest-renderer.sock
  - The daemon pushes ``{"event": "heartbeat", ...}`` frames on connect and on
    render-lock acquire/release. The client skips any frame carrying an
    "event" key and matches the reply by request "id".
  - We send a pre-built ``positive_prompt`` so the daemon SKIPS its genre-pack
    composition pipeline (which needs world/genre/character catalogs that
    pennyfarthing themes do not provide). See sidequest-daemon
    media/daemon.py: the compose block is gated on ``not positive_prompt``.
  - Fidelity (turbo vs high_fidelity) is whatever the daemon was launched with
    (SIDEQUEST_DAEMON_FIDELITY). We do not send a fidelity field — a mismatch
    is rejected by the worker.

Prerequisites:
    sidequest-renderer --warmup        (running in another pane)

Usage:
    python3 regen-from-daemon.py --theme discworld
    python3 regen-from-daemon.py --all
    python3 regen-from-daemon.py --theme discworld --dry-run
    python3 regen-from-daemon.py --all --force
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Missing PyYAML: pip install pyyaml")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Missing Pillow: pip install pillow")
    sys.exit(1)

# --- Configuration -----------------------------------------------------------

SOCKET_PATH = "/tmp/sidequest-renderer.sock"

# Script lives at {PROJECT_ROOT}/scripts/portraits/regen-from-daemon.py
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent
THEMES_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "themes"
PORTRAITS_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "portraits"

OUTPUT_SIZE = 512
TIER = "portrait_square"  # always 1024x1024, fidelity-independent (see zimage_config)

# LOD buckets fanned out from the 512px master (mirrors resize-portraits.sh).
# The master itself is archived into original/.
LOD_SIZES: tuple[tuple[str, int], ...] = (("small", 64), ("medium", 128), ("large", 256))

# Render timeout per portrait. base Z-Image (high_fidelity) is ~108s/render;
# give generous headroom so a slow render is not mistaken for a hang.
RENDER_TIMEOUT_S = 300.0

# Default style suffix when a theme does not define ``portrait_style``.
# Mirrors generate-portraits.py so the two generators stay visually aligned.
DEFAULT_STYLE_SUFFIX = (
    ", traditional woodcut portrait bust, black and white, bold linework, "
    "crosshatching, medieval style"
)

# Centralized safety clause appended to EVERY prompt (Z-Image has no negative
# prompt — constraints must go positive at the end). Split into two parts so a
# theme can opt out of the no-text portion via ``portrait_allow_text: true``
# (firefly deliberately wants tarot lettering). The anatomy/modesty portion is
# never omitted. See THEME_STYLE_WORKSHEET.md.
SAFETY_ANATOMY = (
    ". Adult subject, fully clothed, modest, non-sexualized, correct anatomy, "
    "natural hands."
)
SAFETY_NO_TEXT = (
    " No text, no caption, no title, no writing, no signature, no labels, "
    "no watermark, no logos."
)

# Role order — also the per-role seed offset for deterministic diversity.
ROLES = [
    "orchestrator", "sm", "tea", "dev", "reviewer",
    "architect", "pm", "tech-writer", "ux-designer", "devops", "ba",
]


# --- Theme parsing -----------------------------------------------------------

def to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return re.sub(r"^-|-$", "", slug)


def ocean_suffix(ocean: dict) -> str:
    return f"{ocean['O']}{ocean['C']}{ocean['E']}{ocean['A']}{ocean['N']}"


def parse_theme(theme_path: Path) -> dict:
    """Extract per-agent visual prompts + theme style metadata."""
    with open(theme_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    meta = data.get("theme", {})
    result = {
        "theme": theme_path.stem,
        "prefix": meta.get("portrait_prefix"),
        "style": meta.get("portrait_style"),
        "negative": meta.get("negative_prompt"),
        "allow_text": bool(meta.get("portrait_allow_text", False)),
        "characters": {},
    }

    for role, agent in (data.get("agents") or {}).items():
        if not isinstance(agent, dict) or "visual" not in agent:
            continue
        ocean = agent.get("ocean", {})
        if not (ocean and all(k in ocean for k in ("O", "C", "E", "A", "N"))):
            # No OCEAN scores → no deterministic filename. Skip (matches the
            # generate-portraits.py contract; these never produced portraits).
            continue
        character = agent.get("character", role)
        short_name = agent.get("shortName", character.split()[0])
        result["characters"][role] = {
            "name": character,
            "visual": agent["visual"],
            "filename": f"{to_slug(short_name)}-{ocean_suffix(ocean)}.png",
        }
    return result


def build_prompt(
    visual: str, style: str | None, prefix: str | None, allow_text: bool = False
) -> str:
    """Compose the positive prompt: ``{prefix} {visual}{style}{safety}``.

    No CLIP-style truncation — Z-Image uses a long-context text encoder and we
    bypass the daemon's composer, so the full authored description is sent. The
    safety clause is appended here (one place) rather than in each theme YAML.
    ``allow_text`` drops only the no-text portion (firefly's tarot lettering).
    """
    suffix = style if style is not None else DEFAULT_STYLE_SUFFIX
    body = f"{prefix} {visual}" if prefix else visual
    safety = SAFETY_ANATOMY + ("" if allow_text else SAFETY_NO_TEXT)
    return f"{body}{suffix}{safety}"


# --- Daemon client (heartbeat-aware JSON-line RPC) ---------------------------

async def _rpc(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    method: str,
    params: dict,
    req_id: str,
    timeout: float,
) -> dict:
    """Send one request and return its matching reply frame.

    Skips server-pushed frames (heartbeats carry an ``event`` key, no ``id``)
    and any reply whose ``id`` does not match. Raises on timeout/EOF.
    """
    writer.write(
        (json.dumps({"id": req_id, "method": method, "params": params}) + "\n").encode()
    )
    await writer.drain()

    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"{method} (id={req_id}) timed out after {timeout}s")
        line = await asyncio.wait_for(reader.readline(), timeout=remaining)
        if not line:
            raise ConnectionError(f"daemon closed socket before replying to {method}")
        line_str = line.decode().strip()
        if not line_str:
            continue
        frame = json.loads(line_str)
        if frame.get("event"):  # heartbeat / progress push — not our reply
            continue
        if frame.get("id") != req_id:  # stray reply for another request
            continue
        return frame


async def ping(reader, writer) -> bool:
    frame = await _rpc(reader, writer, "ping", {}, "ping", timeout=10.0)
    if frame.get("error"):
        return False
    # canonical daemon → {"status": "ok"}; tolerate any non-error reply.
    return True


async def render_one(reader, writer, prompt: str, negative: str | None, seed: int) -> Path:
    """Request one portrait render; return the path the daemon wrote."""
    params = {
        "tier": TIER,
        "positive_prompt": prompt,  # bypasses genre-pack composition
        "seed": seed,
    }
    if negative:
        params["negative_prompt"] = negative

    frame = await _rpc(
        reader, writer, "render", params, f"regen-{seed}-{id(prompt)}", RENDER_TIMEOUT_S
    )
    if frame.get("error"):
        err = frame["error"]
        raise RuntimeError(f"{err.get('code', 'ERROR')}: {err.get('message', err)}")
    result = frame.get("result") or {}
    src = result.get("image_url") or result.get("image_path")
    if not src:
        raise RuntimeError(f"no image path in daemon reply: {result}")
    return Path(src)


def downscale_to_square(src: Path, dst: Path, size: int = OUTPUT_SIZE) -> None:
    """Center-crop to square (no-op if already square) and resize to size px."""
    with Image.open(src) as img:
        img = img.convert("RGB")
        w, h = img.size
        if w != h:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
        img = img.resize((size, size), Image.Resampling.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, "PNG", optimize=True)


def _is_lfs_pointer(path: Path) -> bool:
    """True if the file is an unresolved git-lfs pointer stub, not real image data."""
    try:
        with path.open("rb") as f:
            return f.read(44).startswith(b"version https://git-lfs")
    except OSError:
        return False


def already_rendered(out_dir: Path, filename: str) -> Path | None:
    """Return the existing real master, honoring already-sliced output.

    A character is "done" if a real (non-lfs-pointer) PNG exists either at the
    theme root (rendered, not yet sliced) or in original/ (rendered + sliced).
    Pointer stubs return None so un-rendered themes still render.
    """
    for cand in (out_dir / filename, out_dir / "original" / filename):
        if cand.is_file() and not _is_lfs_pointer(cand):
            return cand
    return None


def slice_portrait(master: Path, out_dir: Path) -> None:
    """Fan the 512px master into small/medium/large buckets, archive it to original/.

    Mirrors scripts/resize-portraits.sh: the master is moved (not copied) into
    original/ so the theme root is left clean.
    """
    with Image.open(master) as img:
        img = img.convert("RGB")
        for name, dim in LOD_SIZES:
            dest_dir = out_dir / name
            dest_dir.mkdir(parents=True, exist_ok=True)
            img.resize((dim, dim), Image.Resampling.LANCZOS).save(
                dest_dir / master.name, "PNG", optimize=True
            )
    original_dir = out_dir / "original"
    original_dir.mkdir(parents=True, exist_ok=True)
    master.replace(original_dir / master.name)


# --- Per-theme run -----------------------------------------------------------

async def run_theme(reader, writer, theme_path: Path, args) -> tuple[int, int, int]:
    parsed = parse_theme(theme_path)
    theme = parsed["theme"]
    chars = parsed["characters"]
    if not chars:
        print(f"  {theme}: no agents with OCEAN+visual, skipping")
        return 0, 0, 0

    out_dir = PORTRAITS_DIR / theme
    print(f"\n[{theme}] {len(chars)} agents, output: {out_dir}")

    generated = skipped = failed = 0
    roles = [args.role] if args.role else ROLES
    for role in roles:
        char = chars.get(role)
        if not char:
            continue
        dst = out_dir / char["filename"]
        if not args.force:
            existing = already_rendered(out_dir, char["filename"])
            if existing:
                print(f"  SKIP {char['filename']} (exists: {existing.relative_to(out_dir)})")
                skipped += 1
                continue

        prompt = build_prompt(
            char["visual"], parsed["style"], parsed["prefix"], parsed["allow_text"]
        )
        seed = args.seed if args.seed is not None else 42 + ROLES.index(role)

        if args.dry_run:
            print(f"  WOULD GEN {char['filename']}  seed={seed}")
            print(f"    prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")
            generated += 1
            continue

        print(f"  GEN {char['filename']} ({char['name']}) ...", flush=True)
        started = time.monotonic()
        try:
            src = await render_one(reader, writer, prompt, parsed["negative"], seed)
            downscale_to_square(src, dst)
            if not args.no_slice:
                slice_portrait(dst, out_dir)
            elapsed = time.monotonic() - started
            sliced = "" if args.no_slice else " +sliced(s/m/l/orig)"
            print(f"    OK  {char['filename']} ({elapsed:.1f}s, src={src.name}){sliced}")
            generated += 1
        except Exception as e:
            print(f"    FAIL {char['filename']}: {e}")
            failed += 1

    return generated, skipped, failed


# --- Entry point -------------------------------------------------------------

async def main_async(args) -> int:
    if args.all:
        theme_paths = sorted(THEMES_DIR.glob("*.yaml"))
    else:
        tp = THEMES_DIR / f"{args.theme}.yaml"
        if not tp.exists():
            print(f"ERROR: theme not found: {tp}", file=sys.stderr)
            return 1
        theme_paths = [tp]

    if not theme_paths:
        print(f"ERROR: no theme YAML files in {THEMES_DIR}", file=sys.stderr)
        return 1

    if not Path(SOCKET_PATH).exists():
        print(f"ERROR: daemon socket not found at {SOCKET_PATH}", file=sys.stderr)
        print("Start it with: sidequest-renderer --warmup", file=sys.stderr)
        return 1

    print(f"Themes: {len(theme_paths)}  tier={TIER}  output={OUTPUT_SIZE}px")

    reader, writer = await asyncio.open_unix_connection(SOCKET_PATH)
    try:
        if not args.dry_run and not await ping(reader, writer):
            print("ERROR: daemon ping failed", file=sys.stderr)
            return 1

        total_gen = total_skip = total_fail = 0
        for tp in theme_paths:
            g, s, f = await run_theme(reader, writer, tp, args)
            total_gen += g
            total_skip += s
            total_fail += f
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass

    print(f"\n=== Summary ===")
    print(f"Themes processed: {len(theme_paths)}")
    if args.dry_run:
        print(f"Would generate:   {total_gen} (dry run — no images rendered)")
    else:
        print(f"Generated: {total_gen}")
    print(f"Skipped:   {total_skip}")
    print(f"Failed:    {total_fail}")
    return 1 if total_fail else 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regenerate pennyfarthing portraits via the sidequest Z-Image daemon."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--theme", type=str, help="Single theme slug (e.g. 'discworld')")
    group.add_argument("--all", action="store_true", help="All themes")
    parser.add_argument("--role", type=str, help="Only this role (with --theme)")
    parser.add_argument("--dry-run", action="store_true", help="Don't render, just print")
    parser.add_argument("--force", action="store_true", help="Regenerate even if file exists")
    parser.add_argument("--no-slice", action="store_true",
                        help="Skip auto fan-out; leave the 512px master at the theme root")
    parser.add_argument("--seed", type=int, default=None, help="Fixed seed (default: per-role)")
    args = parser.parse_args()

    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
