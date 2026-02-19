"""Tandem awareness validator adapter.

Validates that agent definitions include proper tandem consultation sections
per ADR-0012 and the tandem-consultation protocol.

Story: MSSCI-14499 (86-4)
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.validate import ValidateReport

# Regex to extract <tandem-consultation> section content
_TANDEM_RE = re.compile(
    r"<tandem-consultation>(.*?)</tandem-consultation>", re.DOTALL
)

# Regex to extract role from heading: ## Tandem Consultation (Leader + Partner)
_HEADING_RE = re.compile(r"##\s+Tandem Consultation\s*\(([^)]+)\)")

# Required response format fields for partner agents
_PARTNER_FIELDS = {
    "Recommendation": "**Recommendation:**",
    "Rationale": "**Rationale:**",
    "Watch-Out-For": "**Watch-Out-For:**",
    "Confidence": "**Confidence:**",
}

# ADR-0012 high-value pairings (leader, partner) — directional
ADR_0012_PAIRINGS: list[tuple[str, str]] = [
    ("dev", "architect"),
    ("dev", "tea"),
    ("reviewer", "architect"),
    ("dev", "devops"),
]


def _extract_tandem_section(content: str) -> str | None:
    """Extract content between <tandem-consultation> tags."""
    m = _TANDEM_RE.search(content)
    return m.group(1) if m else None


def classify_tandem_roles(
    agents_dir: Path,
) -> tuple[list[Path], list[Path]]:
    """Classify agent files into leaders and partners based on tandem sections.

    Classification is based on the heading within the tandem-consultation section:
    - "(Leader)" → leader only
    - "(Partner)" → partner only
    - "(Leader + Partner)" → both

    Returns:
        (leaders, partners) — two lists of Path objects. An agent may appear in both.
    """
    leaders: list[Path] = []
    partners: list[Path] = []

    for f in sorted(agents_dir.glob("*.md")):
        if f.name == "README.md":
            continue

        content = f.read_text()
        section = _extract_tandem_section(content)
        if section is None:
            continue

        # Match heading like "## Tandem Consultation (Leader + Partner)"
        heading = _HEADING_RE.search(section)
        if heading:
            role = heading.group(1)
            if "Leader" in role:
                leaders.append(f)
            if "Partner" in role:
                partners.append(f)

    return leaders, partners


def validate_leader_tandem(path: Path) -> tuple[list[str], list[str]]:
    """Validate leader tandem consultation section content.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    section = _extract_tandem_section(content)

    if section is None:
        errors.append("Missing <tandem-consultation> section")
        return errors, warnings

    stripped = section.strip()
    if not stripped:
        errors.append("Empty <tandem-consultation> section — no content")
        return errors, warnings

    # Workflow phase check — must reference tandem.mode
    if "tandem.mode" not in section:
        errors.append(
            "Leader section must reference workflow phase availability (tandem.mode)"
        )

    # Request format template (recommended)
    if "request format" not in section.lower():
        warnings.append("Missing request format template in leader section")

    # Graceful degradation guidance (recommended)
    section_lower = section.lower()
    if not any(term in section_lower for term in ("fail", "degrad", "solo")):
        warnings.append(
            "Missing graceful degradation guidance (what to do if consultation fails)"
        )

    return errors, warnings


def validate_partner_tandem(path: Path) -> tuple[list[str], list[str]]:
    """Validate partner tandem consultation response guidance.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    section = _extract_tandem_section(content)

    if section is None:
        errors.append("Missing <tandem-consultation> section")
        return errors, warnings

    # Check for required response format fields
    missing = [
        name for name, marker in _PARTNER_FIELDS.items() if marker not in section
    ]
    if missing:
        errors.append(
            f"Partner response format missing required fields: {', '.join(missing)}"
        )

    return errors, warnings


def validate_pairings_documented(
    leader_names: set[str],
    partner_names: set[str],
    pairings: list[tuple[str, str]],
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Check which ADR-0012 pairings are covered by agent tandem sections.

    Directional check: verifies the leader agent is classified as a leader
    and the partner agent is classified as a partner.

    Returns:
        (covered, missing) — two lists of (leader, partner) tuples.
    """
    covered: list[tuple[str, str]] = []
    missing: list[tuple[str, str]] = []

    for leader, partner in pairings:
        if leader in leader_names and partner in partner_names:
            covered.append((leader, partner))
        else:
            missing.append((leader, partner))

    return covered, missing


def run(
    root: Path, *, fix: bool = False, strict: bool = False
) -> ValidateReport:
    """Validate agent tandem awareness sections."""
    report = ValidateReport(validator="tandem-awareness")
    agents_dir = root / "pennyfarthing-dist" / "agents"

    if not agents_dir.is_dir():
        report.details.append("[ERROR] agents directory not found")
        report.errors += 1
        return report

    leaders, partners = classify_tandem_roles(agents_dir)

    for path in leaders:
        file_errors, file_warnings = validate_leader_tandem(path)

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

    for path in partners:
        file_errors, file_warnings = validate_partner_tandem(path)

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

    # Validate ADR-0012 pairings (directional)
    leader_names = {f.stem for f in leaders}
    partner_names = {f.stem for f in partners}
    covered, missing_pairings = validate_pairings_documented(
        leader_names, partner_names, ADR_0012_PAIRINGS
    )
    for leader_name, partner_name in missing_pairings:
        report.errors += 1
        report.details.append(
            f"[ERROR] ADR-0012 pairing {leader_name}\u2192{partner_name} not covered "
            f"(leader or partner missing tandem section with correct role)"
        )
    if covered:
        report.passed += 1

    # Detect agents with tandem section but no matching heading
    classified_stems = leader_names | partner_names
    for f in sorted(agents_dir.glob("*.md")):
        if f.name == "README.md":
            continue
        content = f.read_text()
        if _extract_tandem_section(content) is not None and f.stem not in classified_stems:
            report.warnings += 1
            report.details.append(
                f"[WARN] {f.name}: has <tandem-consultation> section but no "
                f"matching '## Tandem Consultation (Role)' heading"
            )

    return report
