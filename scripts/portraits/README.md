# Portrait generation

Pennyfarthing agent portraits are rendered by the **sidequest Z-Image daemon**,
not by a local Stable Diffusion / Flux install. There is no torch/diffusers
environment in this repo — do not go looking for one. Rendering happens in the
`sidequest-daemon` process (lives in `~/Projects/oq-1`); this repo only ships a
thin client that talks to it over a Unix socket.

## Two scripts in this directory

| Script | Engine | Status | Use |
|--------|--------|--------|-----|
| `regen-from-daemon.py` | sidequest Z-Image daemon (socket) | **current** | day-to-day regeneration |
| (`../../pennyfarthing-dist/scripts/portraits/generate-portraits.py`) | local SDXL/Flux via `~/.venvs/*` | legacy | only if you have a torch venv |

`generate-portraits.py` is the older local-GPU generator. It still works if a
torch venv exists, but the maintained path is the daemon client below.

## Prerequisites

The Z-Image daemon must be running and have created its socket:

```
/tmp/sidequest-renderer.sock
```

Start it from the sidequest workspace (separate pane), not from here:

```bash
cd ~/Projects/oq-1 && just daemon      # runs `sidequest-renderer --warmup`
```

`just daemon` requires the R2 env vars (`R2_S3_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`) in the shell. Check it's alive:

```bash
ls -l /tmp/sidequest-renderer.sock
cd ~/Projects/oq-1/sidequest-daemon && uv run sidequest-renderer --status
```

Client-side deps are only `pyyaml` + `pillow` — the system `python3`
(`/opt/homebrew/bin/python3`) already has them. No torch needed on this side.

## Usage

Run from the **pennyfarthing repo root** (`PROJECT_ROOT` is resolved as two
levels up from the script):

```bash
cd ~/Projects/orc-penny/pennyfarthing

# One theme
python3 scripts/portraits/regen-from-daemon.py --theme the-matrix

# Preview prompts/filenames without rendering
python3 scripts/portraits/regen-from-daemon.py --theme mash --dry-run

# Every theme under pennyfarthing-dist/personas/themes/
python3 scripts/portraits/regen-from-daemon.py --all

# Force re-render existing files (default skips them — runs are resumable)
python3 scripts/portraits/regen-from-daemon.py --theme dune --force

# Single role only
python3 scripts/portraits/regen-from-daemon.py --theme dune --role dev
```

Batch of several specific themes — use a **literal list** in the loop. The
interactive shell here is zsh, which does *not* word-split an unquoted
`$VAR`, so `for t in $THEMES` would treat the whole string as one theme name:

```bash
for t in the-expanse mash alice-in-wonderland the-matrix; do
  python3 scripts/portraits/regen-from-daemon.py --theme "$t"
done
```

A render takes ~110–165s each (fidelity-dependent), so a full 11-agent theme is
~20–30 min; budget accordingly and prefer running in the background with a log.

## What it does

1. Walks `pennyfarthing-dist/personas/themes/{theme}.yaml`, reading each agent's
   `visual`, plus theme-level `portrait_prefix` / `portrait_style` /
   `negative_prompt`.
2. Composes a positive prompt `{prefix} {visual}{style}` and sends it to the
   daemon with `tier="portrait_square"` (1024×1024). Sending a pre-built
   `positive_prompt` makes the daemon **skip its genre-pack composition
   pipeline** (which needs world/character catalogs pennyfarthing has no part
   of).
3. Downscales the returned image to a **512×512 master** at:
   ```
   pennyfarthing-dist/personas/portraits/{theme}/{slug}-{OCEAN}.png
   ```
   `{slug}` is from the agent's `shortName`; `{OCEAN}` is the 5-digit OCEAN
   score (e.g. `neo-53243.png`). Agents without full OCEAN scores are skipped.

## After generating: fan out resolutions

The 512px file is the master the multi-resolution pipeline consumes. Produce the
`small/medium/large/original` variants with:

```bash
scripts/resize-portraits.sh
```

## Notes & gotchas

- **Fidelity is fixed at daemon launch** (`SIDEQUEST_DAEMON_FIDELITY`,
  turbo vs high_fidelity). The client does not send a fidelity field — sending a
  mismatched one is rejected by the worker.
- The daemon pushes `{"event": "heartbeat", ...}` frames on connect and on
  render-lock acquire/release. The client ignores any frame with an `event` key
  and matches replies by request `id`.
- Some theme YAMLs map two roles to the same character with the same OCEAN
  suffix (e.g. `the-expanse` → `naomi-55343.png` twice). They share one filename,
  so the later render overwrites the earlier. That's authored in the theme YAML,
  not a bug here.
- Per-role deterministic seed is `42 + ROLES.index(role)` unless `--seed` is
  given.
- `regen-from-daemon.py` and this README live under `scripts/` (framework dev
  only — **not** distributed in `pennyfarthing-dist/`).
