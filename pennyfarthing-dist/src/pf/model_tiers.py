"""Model tier map — single source of truth for model policy.

Loads pennyfarthing-dist/models.yaml, applies the optional ``models:``
override section from .pennyfarthing/config.local.yaml (shallow merge per
section key), and resolves agent/subagent/judge names to Claude Code model
ALIASES (best/opus/sonnet/haiku). Alias→model resolution is Claude Code's
job — never pin claude-* IDs here.

Not to be confused with pf.prime.tiers (context tiers).

Spec: docs/superpowers/specs/2026-07-02-model-tiering-design.md (orchestrator).
"""

from __future__ import annotations

from fnmatch import fnmatch
from pathlib import Path
from typing import Any

import yaml

from pf.common.config import get_dist_root, load_pennyfarthing_config, load_yaml_config

VALID_ALIASES = {"haiku", "sonnet", "opus", "fable", "best", "inherit"}


def load_model_map(project_root: Path | None = None) -> dict[str, Any]:
    """Load models.yaml merged with the config.local.yaml ``models:`` override."""
    dist_root = get_dist_root(project_root)
    if dist_root is None:
        return {"success": False, "error": "pennyfarthing-dist root not found"}
    path = dist_root / "models.yaml"
    try:
        base = load_yaml_config(path)
    except yaml.YAMLError as e:
        return {"success": False, "error": f"models.yaml is not valid YAML: {e}"}
    if base is None:
        return {"success": False, "error": f"models.yaml not found at {path}"}
    if not isinstance(base, dict):
        return {
            "success": False,
            "error": f"models.yaml must be a YAML mapping, got {type(base).__name__}",
        }
    merged = dict(base)
    override = load_pennyfarthing_config(project_root).get("models") or {}
    for section, values in override.items():
        if isinstance(values, dict) and isinstance(merged.get(section), dict):
            merged[section] = {**merged[section], **values}
        else:
            merged[section] = values
    return {"success": True, "data": merged}


def resolve_tier_alias(tier: str, model_map: dict[str, Any]) -> dict[str, Any]:
    """Map a tier name to its model alias."""
    tiers = model_map.get("tiers") or {}
    alias = tiers.get(tier)
    if alias is None:
        return {
            "success": False,
            "error": f"Unknown tier '{tier}' (valid: {sorted(tiers)})",
        }
    return {"success": True, "data": str(alias)}


def _subagent_tier(name: str, subagents: dict[str, Any]) -> dict[str, Any]:
    if name in subagents:
        return {"success": True, "data": subagents[name]}
    globs = [k for k in subagents if "*" in k and fnmatch(name, k)]
    if len(globs) > 1:
        return {
            "success": False,
            "error": f"Subagent '{name}' matches multiple globs: {sorted(globs)}",
        }
    if not globs:
        return {"success": False, "error": f"No subagent tier mapping for '{name}'"}
    return {"success": True, "data": subagents[globs[0]]}


def resolve_model(kind: str, name: str, project_root: Path | None = None) -> dict[str, Any]:
    """Resolve a name to {tier, alias}. kind: agent | subagent | judge | native."""
    loaded = load_model_map(project_root)
    if not loaded["success"]:
        return loaded
    m = loaded["data"]

    if kind == "native":
        tier = m.get("native_agents")
        if tier is None:
            return {"success": False, "error": "models.yaml missing 'native_agents'"}
    elif kind == "subagent":
        found = _subagent_tier(name, m.get("subagents") or {})
        if not found["success"]:
            return found
        tier = found["data"]
    elif kind in ("agent", "judge"):
        section = "agents" if kind == "agent" else "judges"
        tier = (m.get(section) or {}).get(name)
        if tier is None:
            return {"success": False, "error": f"No {kind} tier mapping for '{name}'"}
    else:
        return {"success": False, "error": f"Unknown kind '{kind}'"}

    alias = resolve_tier_alias(str(tier), m)
    if not alias["success"]:
        return alias
    return {"success": True, "data": {"tier": str(tier), "alias": alias["data"]}}


def judge_alias(name: str, project_root: Path | None = None) -> str:
    """Judge model alias from the map, falling back to 'opus'. Infallible."""
    resolved = resolve_model("judge", name, project_root)
    if resolved["success"]:
        return resolved["data"]["alias"]
    return "opus"


def subagent_alias(name: str, project_root: Path | None = None) -> str:
    """Subagent model alias from the map, falling back to 'sonnet'. Infallible."""
    resolved = resolve_model("subagent", name, project_root)
    if resolved["success"]:
        return resolved["data"]["alias"]
    return "sonnet"
