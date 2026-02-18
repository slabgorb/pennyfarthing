#!/usr/bin/env bash
# Shim: delegates to Python CLI via uv run (dogfooding) or global pf (consumer).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf hooks bell-mode
