"""Architecture document structural validator adapter.

Validates architecture documentation against expected structure,
ensuring required sections, diagrams, and cross-references are present.
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.common.config import get_project_root
from pf.validate import ValidateReport

# Required sections (flexible matching — case-insensitive substring)
REQUIRED_SECTIONS = [
    "System Overview",
    "Component Architecture",
    "Data Flow",
    "API",  # matches "API Contracts", "API/Interface Contracts", etc.
    "Technology Stack",
    "Deployment",  # matches "Deployment Architecture", "Deployment Strategy", etc.
    "Security",  # matches "Security Considerations", "Security Architecture", etc.
]

_SECTION_RE = re.compile(r"^##\s+(.+)", re.MULTILINE)
_MERMAID_RE = re.compile(r"```mermaid", re.MULTILINE)
_ADR_REF_RE = re.compile(r"ADR[-\s]?\d{4}", re.IGNORECASE)
_NFR_KEYWORDS = re.compile(
    r"\b(?:performance|scalability|availability|reliability|latency|throughput|SLA|SLO)\b",
    re.IGNORECASE,
)


def _validate_architecture(path: Path) -> tuple[list[str], list[str]]:
    """Validate a single architecture document.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    # Extract section headings
    section_headings = [m.group(1).strip() for m in _SECTION_RE.finditer(content)]
    headings_lower = [h.lower() for h in section_headings]

    # Required sections (case-insensitive substring match)
    for required in REQUIRED_SECTIONS:
        found = any(required.lower() in h for h in headings_lower)
        if not found:
            errors.append(f"Missing required section containing '{required}'")

    # Mermaid diagrams
    if not _MERMAID_RE.search(content):
        warnings.append(
            "No Mermaid diagrams found — architecture docs should include visual diagrams"
        )

    # ADR references
    if not _ADR_REF_RE.search(content):
        warnings.append("No ADR references found — architecture decisions should reference ADRs")

    # Non-functional requirements coverage
    if not _NFR_KEYWORDS.search(content):
        warnings.append(
            "No non-functional requirement keywords found "
            "(performance, scalability, availability, etc.)"
        )

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all architecture documents."""
    report = ValidateReport(validator="architecture")

    try:
        project_root = get_project_root(start_dir=root)
    except FileNotFoundError:
        project_root = root

    # Find architecture docs
    arch_files: list[Path] = []
    search_dirs = [
        project_root / "docs",
        project_root / "sprint" / "planning",
    ]

    for search_dir in search_dirs:
        if search_dir.is_dir():
            arch_files.extend(search_dir.rglob("*architect*"))

    # Filter to .md files only
    arch_files = [f for f in arch_files if f.suffix == ".md" and f.is_file()]

    if not arch_files:
        report.details.append("[WARN] No architecture documents found")
        report.warnings += 1
        return report

    for path in sorted(set(arch_files)):
        file_errors, file_warnings = _validate_architecture(path)

        for e in file_errors:
            report.errors.append(f"{path.name}: {e}")
            report.details.append(f"[ERROR] {path.name}: {e}")

        for w in file_warnings:
            if strict:
                report.errors.append(f"{path.name}: {w}")
                report.details.append(f"[ERROR] {path.name}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {path.name}: {w}")

        if not file_errors:
            report.passed += 1

    return report
