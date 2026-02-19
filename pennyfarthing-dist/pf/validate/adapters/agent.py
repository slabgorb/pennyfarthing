"""Agent definition structural validator adapter.

Validates agent definition files in pennyfarthing-dist/agents/.
Checks required sections, model values, and subagent references.

Story: MSSCI-14710 (91-12)
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from pf.validate import ValidateReport

VALID_MODELS = {"haiku", "sonnet", "opus"}
BUILTIN_AGENTS = {"Explore", "Plan"}

# Regex to find XML-like tags in markdown: <tagname> or <tag-name>
_TAG_RE = re.compile(r"<([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^>]*)?>", re.MULTILINE)

# Regex to extract **Model:** value from helpers section
_MODEL_RE = re.compile(r"\*\*Model:\*\*\s+(\S+)", re.IGNORECASE)

# Regex to extract subagent names from markdown table rows: | `name` | purpose |
_HELPER_TABLE_RE = re.compile(r"^\s*\|\s*`?([^`|]+)`?\s*\|", re.MULTILINE)


def _has_frontmatter(content: str) -> bool:
    """Check if content starts with YAML frontmatter (--- delimited)."""
    return content.startswith("---\n")


def _parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from content."""
    if not _has_frontmatter(content):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    fm_text = content[4:end]
    try:
        return yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return {}


def _find_tags(content: str) -> set[str]:
    """Find all XML-like tag names in content."""
    return {m.group(1) for m in _TAG_RE.finditer(content)}


def _extract_section(content: str, tag: str) -> str | None:
    """Extract content between <tag> and </tag>."""
    pattern = re.compile(rf"<{re.escape(tag)}[^>]*>(.*?)</{re.escape(tag)}>", re.DOTALL)
    m = pattern.search(content)
    return m.group(1) if m else None


def classify_agent_files(
    agents_dir: Path,
) -> tuple[list[Path], list[Path], list[Path]]:
    """Classify agent files into main agents, subagents, and skipped.

    Returns:
        (main_agents, subagents, skipped) — three lists of Path objects.
    """
    main: list[Path] = []
    sub: list[Path] = []
    skipped: list[Path] = []

    for f in sorted(agents_dir.glob("*.md")):
        if f.name == "README.md":
            skipped.append(f)
            continue

        content = f.read_text()
        if _has_frontmatter(content):
            sub.append(f)
        else:
            main.append(f)

    return main, sub, skipped


def validate_main_agent(
    path: Path, agents_dir: Path
) -> tuple[list[str], list[str]]:
    """Validate a main agent definition file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    tags = _find_tags(content)

    # Required sections
    if "role" not in tags:
        errors.append("Missing required <role> section")
    if "critical" not in tags:
        errors.append("Missing required <critical> section")
    if "helpers" not in tags:
        errors.append("Missing required <helpers> section")
    if "skills" not in tags:
        errors.append("Missing required <skills> section")

    # Model validation (only if helpers exists)
    if "helpers" in tags:
        helpers_content = _extract_section(content, "helpers")
        if helpers_content:
            model_match = _MODEL_RE.search(helpers_content)
            if model_match:
                model_val = model_match.group(1).lower()
                if model_val not in VALID_MODELS:
                    errors.append(
                        f"Invalid model '{model_match.group(1)}' in <helpers> "
                        f"(must be one of: {', '.join(sorted(VALID_MODELS))})"
                    )

            # Subagent reference validation
            existing_files = {f.stem for f in agents_dir.glob("*.md") if f.name != "README.md"}
            # Parse table rows — skip header/separator rows
            for line in helpers_content.splitlines():
                m = _HELPER_TABLE_RE.match(line)
                if not m:
                    continue
                name = m.group(1).strip().strip("`")
                # Skip table header and separator
                if name.lower() in ("subagent", "---", "") or name.startswith("-"):
                    continue
                if name in BUILTIN_AGENTS:
                    continue
                if name not in existing_files:
                    warnings.append(
                        f"Helper references '{name}' but no matching agent file not found in agents/"
                    )

    # Recommended sections (warnings)
    if "on-activation" not in tags:
        warnings.append("Missing recommended <on-activation> section")
    if "exit" not in tags and "exit-sequence" not in tags:
        warnings.append("Missing recommended <exit> or <exit-sequence> section")

    return errors, warnings


def validate_subagent(path: Path) -> tuple[list[str], list[str]]:
    """Validate a subagent definition file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    # Frontmatter validation
    fm = _parse_frontmatter(content)
    if not fm:
        errors.append("Missing or invalid YAML frontmatter")
        return errors, warnings

    for field in ("name", "description", "tools", "model"):
        if field not in fm:
            errors.append(f"Missing required frontmatter field: {field}")

    # Model must be haiku for subagents
    if "model" in fm:
        model_val = str(fm["model"]).lower()
        if model_val != "haiku":
            errors.append(
                f"Subagent model must be 'haiku', got '{fm['model']}'"
            )

    # Required tags
    tags = _find_tags(content)
    if "output" not in tags:
        errors.append("Missing required <output> section")

    # Recommended tags
    if "arguments" not in tags:
        warnings.append("Missing recommended <arguments> section")

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all agent definition files."""
    report = ValidateReport(validator="agent")
    agents_dir = root / "pennyfarthing-dist" / "agents"

    if not agents_dir.is_dir():
        report.details.append("[ERROR] agents directory not found")
        report.errors += 1
        return report

    main_agents, subagents, _skipped = classify_agent_files(agents_dir)

    for path in main_agents:
        file_errors, file_warnings = validate_main_agent(path, agents_dir)

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

    for path in subagents:
        file_errors, file_warnings = validate_subagent(path)

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
