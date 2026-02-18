#!/usr/bin/env bash
# Shim: delegates to Python CLI via uv run — no global pf install needed.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf hooks sprint-yaml
