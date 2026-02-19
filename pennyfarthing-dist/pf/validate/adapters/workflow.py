"""Workflow YAML schema validator adapter.

Validates workflow definition files in pennyfarthing-dist/workflows/.
Checks common fields, variant-specific structure (phased/stepped/procedural),
and cross-references agent names against agent definitions.

Story: MSSCI-14709 (91-11)
"""

from __future__ import annotations

from pathlib import Path

import yaml

from pf.validate import ValidateReport

# Known workflow types
VALID_TYPES = {"phased", "stepped", "procedural"}

# Known tandem modes for phase tandem blocks
VALID_TANDEM_MODES = {"consultation"}

# Valid model values for tandem partner spawning
VALID_TANDEM_MODELS = {"sonnet", "haiku"}

# Known gate types for phased workflows
VALID_GATE_TYPES = {
    "tests_pass",
    "tests_fail",
    "approval",
    "manual",
    "validation",
    "design_review",
    "quality_pass",
}


def discover_workflow_files(workflows_dir: Path) -> list[Path]:
    """Discover all workflow YAML files.

    Finds root-level *.yaml files and subdirectory workflow.yaml files.
    Excludes non-workflow YAML (e.g., templates).

    Returns:
        Sorted list of Path objects for workflow YAML files.
    """
    files: list[Path] = []

    if not workflows_dir.is_dir():
        return files

    # Root-level *.yaml files
    for f in sorted(workflows_dir.glob("*.yaml")):
        files.append(f)

    # Subdirectory workflow.yaml files
    for f in sorted(workflows_dir.glob("*/workflow.yaml")):
        files.append(f)

    return files


def _get_agent_stems(agents_dir: Path) -> set[str]:
    """Get set of agent file stems from agents directory."""
    if not agents_dir.is_dir():
        return set()
    return {f.stem for f in agents_dir.glob("*.md") if f.name != "README.md"}


def _check_agent_ref(
    agent_name: str, agent_stems: set[str], context: str
) -> list[str]:
    """Check if an agent reference exists. Returns warnings for unknown agents."""
    warnings: list[str] = []
    if agent_name and agent_name not in agent_stems:
        warnings.append(
            f"Agent '{agent_name}' referenced in {context} not found in agents/"
        )
    return warnings


def validate_common(data: dict, path: Path) -> tuple[list[str], list[str]]:
    """Validate common fields present in all workflow types.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    if "name" not in data:
        errors.append("Missing required field: name")

    wtype = data.get("type")
    if wtype is not None and wtype not in VALID_TYPES:
        errors.append(
            f"Invalid type '{wtype}' (must be one of: {', '.join(sorted(VALID_TYPES))})"
        )

    if "description" not in data:
        warnings.append("Missing recommended field: description")

    return errors, warnings


def validate_phased(
    data: dict, path: Path, agents_dir: Path
) -> tuple[list[str], list[str]]:
    """Validate phased workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    agent_stems = _get_agent_stems(agents_dir)

    phases = data.get("phases")

    if phases is None:
        errors.append("Missing required field: phases")
        return errors, warnings

    if not isinstance(phases, list):
        errors.append("Field 'phases' must be a list")
        return errors, warnings

    if len(phases) == 0:
        errors.append("Field 'phases' must not be empty")
        return errors, warnings

    seen_names: set[str] = set()
    next_refs: list[tuple[str, str]] = []  # (phase_name, next_target)

    for i, phase in enumerate(phases):
        if not isinstance(phase, dict):
            errors.append(f"Phase {i} must be a mapping")
            continue

        phase_name = phase.get("name")
        if not phase_name:
            errors.append(f"Phase {i} missing required field: name")
        else:
            if phase_name in seen_names:
                warnings.append(f"Duplicate phase name: '{phase_name}'")
            seen_names.add(phase_name)

        agent = phase.get("agent")
        if not agent:
            errors.append(
                f"Phase {i}{' (' + phase_name + ')' if phase_name else ''} "
                f"missing required field: agent"
            )
        else:
            warnings.extend(
                _check_agent_ref(agent, agent_stems, f"phase '{phase_name or i}'")
            )

        # Gate validation
        gate = phase.get("gate")
        if gate and isinstance(gate, dict):
            gate_type = gate.get("type")
            if gate_type is None:
                errors.append(
                    f"Phase '{phase_name or i}' gate missing required field: type"
                )
            elif gate_type not in VALID_GATE_TYPES:
                warnings.append(
                    f"Phase '{phase_name or i}' has unknown gate type: "
                    f"'{gate_type}'"
                )

        # Tandem validation
        tandem = phase.get("tandem")
        if tandem is not None:
            label = phase_name or i
            if not isinstance(tandem, dict):
                errors.append(
                    f"Phase '{label}' tandem must be a mapping"
                )
            else:
                # partner is required
                partner = tandem.get("partner")
                if not partner:
                    errors.append(
                        f"Phase '{label}' tandem missing required field: partner"
                    )
                else:
                    # Cross-reference partner against known agents
                    warnings.extend(
                        _check_agent_ref(
                            partner, agent_stems, f"phase '{label}' tandem partner"
                        )
                    )

                # mode validation (optional for backward compat)
                mode = tandem.get("mode")
                if mode is not None and mode not in VALID_TANDEM_MODES:
                    errors.append(
                        f"Phase '{label}' tandem has invalid mode: '{mode}' "
                        f"(must be one of: {', '.join(sorted(VALID_TANDEM_MODES))})"
                    )

                # model validation (optional)
                model = tandem.get("model")
                if model is not None and model not in VALID_TANDEM_MODELS:
                    warnings.append(
                        f"Phase '{label}' tandem has unknown model: '{model}' "
                        f"(expected one of: {', '.join(sorted(VALID_TANDEM_MODELS))})"
                    )

                # token_budget validation (must be positive integer)
                token_budget = tandem.get("token_budget")
                if token_budget is not None:
                    if not isinstance(token_budget, int) or isinstance(token_budget, bool):
                        errors.append(
                            f"Phase '{label}' tandem token_budget must be a positive integer"
                        )
                    elif token_budget <= 0:
                        errors.append(
                            f"Phase '{label}' tandem token_budget must be a positive integer"
                        )

                # triggers validation (must be list)
                triggers = tandem.get("triggers")
                if triggers is not None and not isinstance(triggers, list):
                    errors.append(
                        f"Phase '{label}' tandem triggers must be a list"
                    )

        # next: directive (optional, must be string)
        next_target = phase.get("next")
        if next_target is not None:
            if not isinstance(next_target, str):
                errors.append(
                    f"Phase '{phase_name or i}' next must be a string"
                )
            elif phase_name:
                next_refs.append((phase_name, next_target))

    # Cross-validate next: references point to existing phase names
    for source_phase, target_phase in next_refs:
        if target_phase not in seen_names:
            errors.append(
                f"Phase '{source_phase}' next references unknown phase: "
                f"'{target_phase}'"
            )

    return errors, warnings


def validate_stepped(
    data: dict, path: Path, agents_dir: Path
) -> tuple[list[str], list[str]]:
    """Validate stepped workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    agent_stems = _get_agent_stems(agents_dir)

    agent = data.get("agent")
    if not agent:
        errors.append("Missing required field: agent")
    else:
        warnings.extend(_check_agent_ref(agent, agent_stems, "workflow"))

    steps = data.get("steps")
    if steps is None:
        errors.append("Missing required field: steps")
        return errors, warnings

    if not isinstance(steps, dict):
        errors.append("Field 'steps' must be a mapping")
        return errors, warnings

    if "path" not in steps:
        errors.append("Missing required field: steps.path")

    if "pattern" not in steps:
        errors.append("Missing required field: steps.pattern")

    return errors, warnings


def validate_procedural(
    data: dict, path: Path, agents_dir: Path
) -> tuple[list[str], list[str]]:
    """Validate procedural workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    agent_stems = _get_agent_stems(agents_dir)

    agent = data.get("agent")
    if not agent:
        errors.append("Missing required field: agent")
    else:
        warnings.extend(_check_agent_ref(agent, agent_stems, "workflow"))

    if "instructions" not in data and "checklist" not in data:
        warnings.append(
            "Missing recommended field: instructions or checklist"
        )

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all workflow definition files."""
    report = ValidateReport(validator="workflow")
    workflows_dir = root / "pennyfarthing-dist" / "workflows"

    if not workflows_dir.is_dir():
        report.details.append("[ERROR] workflows directory not found")
        report.errors += 1
        return report

    agents_dir = root / "pennyfarthing-dist" / "agents"
    files = discover_workflow_files(workflows_dir)

    for path in files:
        try:
            content = path.read_text()
            raw = yaml.safe_load(content)
        except yaml.YAMLError:
            report.errors += 1
            report.details.append(f"[ERROR] {path.name}: YAML parse error")
            continue

        if not isinstance(raw, dict) or "workflow" not in raw:
            report.errors += 1
            report.details.append(
                f"[ERROR] {path.name}: Missing 'workflow' top-level key"
            )
            continue

        data = raw["workflow"]

        if not isinstance(data, dict):
            report.errors += 1
            report.details.append(
                f"[ERROR] {path.name}: 'workflow' must be a mapping"
            )
            continue

        file_errors: list[str] = []
        file_warnings: list[str] = []

        # Common validation
        common_errors, common_warnings = validate_common(data, path)
        file_errors.extend(common_errors)
        file_warnings.extend(common_warnings)

        # Variant-specific validation
        wtype = data.get("type", "phased")

        if wtype == "phased":
            variant_errors, variant_warnings = validate_phased(
                data, path, agents_dir
            )
        elif wtype == "stepped":
            variant_errors, variant_warnings = validate_stepped(
                data, path, agents_dir
            )
        elif wtype == "procedural":
            variant_errors, variant_warnings = validate_procedural(
                data, path, agents_dir
            )
        else:
            variant_errors, variant_warnings = [], []

        file_errors.extend(variant_errors)
        file_warnings.extend(variant_warnings)

        # Determine display name (use parent/name for subdirectory workflows)
        if path.name == "workflow.yaml":
            display = f"{path.parent.name}/{path.name}"
        else:
            display = path.name

        for e in file_errors:
            report.errors += 1
            report.details.append(f"[ERROR] {display}: {e}")

        for w in file_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] {display}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {display}: {w}")

        if not file_errors:
            report.passed += 1

    return report
