"""models.yaml structural validator adapter.

Checks: every tier maps to a valid Claude Code alias (or explicit claude-*
name); every agents/subagents/judges assignment and native_agents references
a defined tier.

Spec: docs/superpowers/specs/2026-07-02-model-tiering-design.md (orchestrator).
"""

from __future__ import annotations

from pathlib import Path

from pf.model_tiers import VALID_ALIASES, load_model_map
from pf.validate import ValidateReport


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    report = ValidateReport(validator="models")
    loaded = load_model_map(root)
    if not loaded["success"]:
        report.errors.append(loaded["error"])
        report.details.append(f"[ERROR] {loaded['error']}")
        return report
    m = loaded["data"]

    tiers = m.get("tiers") or {}
    if not tiers:
        err = "models.yaml has no 'tiers' section"
        report.errors.append(err)
        report.details.append(f"[ERROR] {err}")
        return report

    for tier, alias in tiers.items():
        alias_s = str(alias)
        if alias_s not in VALID_ALIASES and not alias_s.startswith("claude-"):
            err = (
                f"tiers.{tier}: '{alias_s}' is not a valid alias "
                f"(valid: {sorted(VALID_ALIASES)}) or claude-* model name"
            )
            report.errors.append(err)
            report.details.append(f"[ERROR] {err}")

    for section in ("agents", "subagents", "judges"):
        for name, tier in (m.get(section) or {}).items():
            if str(tier) not in tiers:
                err = f"{section}.{name}: unknown tier '{tier}' (valid: {sorted(tiers)})"
                report.errors.append(err)
                report.details.append(f"[ERROR] {err}")

    native = m.get("native_agents")
    if native is None:
        err = "models.yaml missing 'native_agents'"
        report.errors.append(err)
        report.details.append(f"[ERROR] {err}")
    elif str(native) not in tiers:
        err = f"native_agents: unknown tier '{native}' (valid: {sorted(tiers)})"
        report.errors.append(err)
        report.details.append(f"[ERROR] {err}")

    if not report.errors:
        report.passed = 1

    return report
