"""Theme persona YAML structural validator adapter.

Validates theme files in pennyfarthing-dist/personas/themes/ against
the expected schema: required keys, agent roles, OCEAN scores, dimensions.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from pf.common.config import get_dist_root
from pf.validate import ValidateReport

# Required agent roles (all 11)
REQUIRED_ROLES = {
    "sm",
    "tea",
    "dev",
    "reviewer",
    "architect",
    "pm",
    "tech-writer",
    "ux-designer",
    "devops",
    "ba",
    "orchestrator",
}

# Required fields in the theme: top-level block
REQUIRED_THEME_FIELDS = {"name", "description", "source", "tier", "user_title", "portrait_style", "dimensions"}

# Required dimension keys
REQUIRED_DIMENSIONS = {"tone", "era", "genre", "energy"}

# Required fields per agent
REQUIRED_AGENT_FIELDS = {"character", "style", "role", "trait"}

# OCEAN personality trait keys
OCEAN_KEYS = {"O", "C", "E", "A", "N"}


def _validate_theme(path: Path) -> tuple[list[str], list[str]]:
    """Validate a single theme YAML file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    try:
        with open(path) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as exc:
        errors.append(f"YAML parse error: {exc}")
        return errors, warnings

    if not isinstance(data, dict):
        errors.append("Theme file must be a YAML mapping")
        return errors, warnings

    # Required top-level keys
    if "theme" not in data:
        errors.append("Missing required top-level key: 'theme'")
    if "agents" not in data:
        errors.append("Missing required top-level key: 'agents'")
        return errors, warnings  # Can't validate agents without the key

    if "zeitgeist" not in data:
        warnings.append("Missing recommended top-level key: 'zeitgeist'")

    # Theme block validation
    theme = data.get("theme", {})
    if isinstance(theme, dict):
        missing_fields = REQUIRED_THEME_FIELDS - set(theme.keys())
        for field in sorted(missing_fields):
            errors.append(f"Missing required theme field: '{field}'")

        # Dimensions sub-block
        dimensions = theme.get("dimensions", {})
        if isinstance(dimensions, dict):
            missing_dims = REQUIRED_DIMENSIONS - set(dimensions.keys())
            for dim in sorted(missing_dims):
                errors.append(f"Missing required dimension: '{dim}'")
        elif dimensions is not None:
            errors.append("'dimensions' must be a mapping")

    # Agents block validation
    agents = data.get("agents", {})
    if not isinstance(agents, dict):
        errors.append("'agents' must be a mapping")
        return errors, warnings

    # Check all 11 roles present
    missing_roles = REQUIRED_ROLES - set(agents.keys())
    for role in sorted(missing_roles):
        errors.append(f"Missing required agent role: '{role}'")

    # Warn on unexpected keys in agents block
    unexpected_keys = set(agents.keys()) - REQUIRED_ROLES
    for key in sorted(unexpected_keys):
        warnings.append(f"Unexpected key in agents block: '{key}'")

    # Validate each agent
    for role, agent_data in agents.items():
        if role not in REQUIRED_ROLES:
            continue  # Skip non-role keys (e.g., misplaced spinner_verbs)

        if not isinstance(agent_data, dict):
            errors.append(f"Agent '{role}' must be a mapping")
            continue

        # Required fields
        missing_agent_fields = REQUIRED_AGENT_FIELDS - set(agent_data.keys())
        for field in sorted(missing_agent_fields):
            errors.append(f"Agent '{role}': missing required field '{field}'")

        # OCEAN scores
        ocean = agent_data.get("ocean")
        if ocean is None:
            errors.append(f"Agent '{role}': missing OCEAN personality scores")
        elif isinstance(ocean, dict):
            missing_ocean = OCEAN_KEYS - set(ocean.keys())
            for key in sorted(missing_ocean):
                errors.append(f"Agent '{role}': missing OCEAN key '{key}'")

            for key in OCEAN_KEYS & set(ocean.keys()):
                val = ocean[key]
                if not isinstance(val, int) or val < 1 or val > 5:
                    errors.append(
                        f"Agent '{role}': OCEAN '{key}' must be integer 1-5, got {val!r}"
                    )
        else:
            errors.append(f"Agent '{role}': 'ocean' must be a mapping")

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all theme YAML files."""
    report = ValidateReport(validator="theme")
    dist_root = get_dist_root(project_root=root)

    if dist_root is None:
        report.details.append("[ERROR] pennyfarthing-dist directory not found")
        report.errors += 1
        return report

    themes_dir = dist_root / "personas" / "themes"
    if not themes_dir.is_dir():
        report.details.append("[ERROR] personas/themes/ directory not found")
        report.errors += 1
        return report

    theme_files = sorted(themes_dir.glob("*.yaml"))
    if not theme_files:
        report.warnings += 1
        report.details.append("[WARN] No theme YAML files found")
        return report

    for path in theme_files:
        file_errors, file_warnings = _validate_theme(path)

        for e in file_errors:
            report.errors += 1
            report.details.append(f"[ERROR] {path.name}: {e}")

        for w in file_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] {path.name}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {path.name}: {w}")

        if not file_errors:
            report.passed += 1

    return report
