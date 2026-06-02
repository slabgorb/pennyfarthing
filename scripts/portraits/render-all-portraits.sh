#!/usr/bin/env bash
# =============================================================================
# render-all-portraits.sh
#
# Render every MISSING pennyfarthing portrait via the sidequest Z-Image daemon,
# slice each to its LOD set, then (optionally) STORE the results: commit to git
# LFS, push the blobs to the remote, and sync to the R2 bucket.
#
# Designed to run on a second Mac that has the Z-Image daemon available — the
# render box. It is resumable and idempotent: re-running only does what's left.
#
# QUICK START (on the render Mac):
#   1. Clone/pull this repo and `cd` into it.
#   2. Make sure the Z-Image daemon is running (or pass --daemon-dir, below):
#        cd <sidequest-project> && just daemon --warmup
#   3. Render only:                 scripts/portraits/render-all-portraits.sh
#      Render AND store everywhere: scripts/portraits/render-all-portraits.sh --store
#
# WHAT IT DOES
#   Phase 1  preflight  — verify repo, python deps, and the daemon socket
#   Phase 2  render     — loop regen-from-daemon.py --all until 0 remain,
#                         auto-resuming through daemon OOM crashes (watchdog)
#   Phase 3  store      — (only with --store) feature branch -> git add ->
#                         commit -> git push (LFS upload) -> git lfs checkout ->
#                         R2 variant sync
#
# OPTIONS
#   --store           also commit + push to git LFS and sync to R2 (default: off)
#   --render-only     explicit no-store (the default; kept for clarity)
#   --force           re-render even portraits that already exist
#   --daemon-dir DIR  start the daemon via `just daemon --warmup` in DIR if the
#                     socket is absent, and wait for it (else: SIDEQUEST_DAEMON_DIR)
#   --branch NAME     git branch to commit onto (default: feat/portrait-render-<date>)
#   -h | --help       this help
#
# ENVIRONMENT (all optional; sensible defaults)
#   PF_REPO               path to the pennyfarthing repo (default: auto from script)
#   RENDER_PYTHON         python with PyYAML + Pillow (default: python3)
#   R2_PYTHON             python with boto3 for --store R2 sync (default: RENDER_PYTHON)
#   SIDEQUEST_DAEMON_DIR  fallback for --daemon-dir
#   R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   required for R2 sync
#
# EXIT CODES: 0 ok · 1 preflight failure · 2 render stalled · 3 store failure
# =============================================================================
set -euo pipefail

# --- defaults ----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PF_REPO="${PF_REPO:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
RENDER_PYTHON="${RENDER_PYTHON:-python3}"
R2_PYTHON="${R2_PYTHON:-$RENDER_PYTHON}"
SOCK="/tmp/sidequest-renderer.sock"
DAEMON_DIR="${SIDEQUEST_DAEMON_DIR:-}"
STORE=0
FORCE=""
BRANCH=""
MAX_RENDER_ATTEMPTS=60          # watchdog cap (each attempt = one regen pass)
DAEMON_WAIT_S=240               # how long to wait for the socket after a start

log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[1;33m[%s] WARN:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '\033[1;31m[%s] FATAL:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit "${2:-1}"; }

# --- args --------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --store)       STORE=1 ;;
    --render-only) STORE=0 ;;
    --force)       FORCE="--force" ;;
    --daemon-dir)  DAEMON_DIR="${2:?--daemon-dir needs a path}"; shift ;;
    --branch)      BRANCH="${2:?--branch needs a name}"; shift ;;
    -h|--help)     sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; s/^#//'; exit 0 ;;
    *)             die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

REGEN="$PF_REPO/scripts/portraits/regen-from-daemon.py"
R2SYNC="$PF_REPO/scripts/portraits/r2_sync_portraits.py"
cd "$PF_REPO"

remaining() { "$RENDER_PYTHON" "$REGEN" --all --dry-run 2>/dev/null | grep -c "WOULD GEN" || true; }

# =============================================================================
# Phase 1 — preflight
# =============================================================================
log "Phase 1/3  preflight"
[ -d "$PF_REPO/.git" ]        || die "PF_REPO is not a git repo: $PF_REPO"
[ -f "$REGEN" ]              || die "missing render script: $REGEN"
"$RENDER_PYTHON" -c 'import yaml, PIL' 2>/dev/null \
  || die "RENDER_PYTHON ($RENDER_PYTHON) lacks PyYAML/Pillow. Install: $RENDER_PYTHON -m pip install pyyaml pillow"
log "  repo:   $PF_REPO"
log "  python: $RENDER_PYTHON ($("$RENDER_PYTHON" --version 2>&1))"

# daemon socket — start it if asked and absent
if [ ! -S "$SOCK" ]; then
  if [ -n "$DAEMON_DIR" ]; then
    [ -d "$DAEMON_DIR" ] || die "daemon dir not found: $DAEMON_DIR"
    log "  daemon socket absent — starting via 'just daemon --warmup' in $DAEMON_DIR"
    ( cd "$DAEMON_DIR" && nohup just daemon --warmup >/tmp/sidequest-daemon.boot 2>&1 & )
    for _ in $(seq 1 $((DAEMON_WAIT_S/5))); do [ -S "$SOCK" ] && break; sleep 5; done
  fi
  [ -S "$SOCK" ] || die "Z-Image daemon socket missing: $SOCK
  Start it first:  cd <sidequest-project> && just daemon --warmup
  or pass --daemon-dir <sidequest-project>" 1
fi
log "  daemon: socket live at $SOCK"

PENDING_BEFORE="$(remaining)"
log "  portraits to render: ${PENDING_BEFORE:-0}${FORCE:+ (--force: all)}"
if [ "${PENDING_BEFORE:-0}" -eq 0 ] && [ -z "$FORCE" ]; then
  log "Nothing to render — all portraits already present."
fi

# =============================================================================
# Phase 2 — render (watchdog: resume through daemon OOM crashes)
# =============================================================================
log "Phase 2/3  render"
attempt=0
while :; do
  rem="$(remaining)"
  if [ -z "$FORCE" ] && [ "${rem:-0}" -eq 0 ]; then
    log "  render complete — 0 remaining"; break
  fi
  attempt=$((attempt+1))
  [ "$attempt" -gt "$MAX_RENDER_ATTEMPTS" ] && die "hit $MAX_RENDER_ATTEMPTS render attempts with ${rem} remaining — daemon may be wedged" 2
  if [ ! -S "$SOCK" ]; then
    warn "  daemon socket vanished (OOM?) — waiting 30s for revival"; sleep 30; continue
  fi
  log "  pass $attempt — ${rem:-?} remaining"
  "$RENDER_PYTHON" "$REGEN" --all $FORCE || warn "  regen pass exited non-zero (likely daemon crash) — will retry"
  FORCE=""   # --force only meaningful on the first pass; resume the rest
  sleep 5
done

# =============================================================================
# Phase 3 — store (optional)
# =============================================================================
if [ "$STORE" -eq 0 ]; then
  log "Phase 3/3  store — SKIPPED (run with --store to commit+push+R2)"
  log "Done. Rendered portraits are on disk under pennyfarthing-dist/personas/portraits/"
  log "To store them later, re-run with --store (it skips already-rendered work)."
  exit 0
fi

log "Phase 3/3  store"
command -v git >/dev/null || die "git not found" 3
git lfs version >/dev/null 2>&1 || die "git-lfs not installed (brew install git-lfs && git lfs install)" 3
git lfs install --local --skip-smudge >/dev/null 2>&1 || true

BRANCH="${BRANCH:-feat/portrait-render-$(date +%Y%m%d-%H%M%S)}"
log "  branch: $BRANCH"
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

PORTRAITS="pennyfarthing-dist/personas/portraits"
git add "$PORTRAITS"
STAGED="$(git diff --cached --name-only | wc -l | tr -d ' ')"
if [ "$STAGED" -eq 0 ]; then
  log "  nothing new to commit (already stored)"
else
  log "  staged $STAGED portrait files — committing"
  git commit -m "feat(portraits): render + store missing portrait batch

Rendered via render-all-portraits.sh on $(hostname -s) and stored as LFS
pointers with blobs pushed to the remote.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" \
    || die "commit failed (protected-branch hook? you are on $BRANCH)" 3
  log "  pushing branch + LFS blobs"
  git push -u origin "$BRANCH" || die "git push failed (check remote auth on this Mac)" 3
fi

# R2 sync — needs real PNGs on disk + boto3 + creds
if [ -f "$R2SYNC" ] && [ -n "${R2_S3_ENDPOINT:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  if "$R2_PYTHON" -c 'import boto3' 2>/dev/null; then
    log "  materializing blobs (git lfs checkout) so R2 sees real PNGs"
    git lfs checkout >/dev/null 2>&1 || true
    log "  syncing variants to R2"
    "$R2_PYTHON" "$R2SYNC" --variants || die "R2 sync failed" 3
  else
    warn "  R2 sync skipped: R2_PYTHON ($R2_PYTHON) lacks boto3 (pip install boto3)"
  fi
else
  warn "  R2 sync skipped: r2_sync script or R2_* credentials not present in env"
fi

log "Done. Open a PR from $BRANCH -> develop to land the renders."
