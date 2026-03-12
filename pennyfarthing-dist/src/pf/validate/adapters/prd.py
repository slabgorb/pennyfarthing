"""PRD (Product Requirements Document) structural validator adapter.

Validates PRD files against BMAD-derived structure and quality checks.
Extracts mechanical validation from interactive workflow polish steps.
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.common.config import get_project_root
from pf.validate import ValidateReport

# Required top-level sections (## headings)
REQUIRED_SECTIONS = {
    "Executive Summary",
    "Success Criteria",
    "Product Scope",
    "User Journeys",
    "Domain Requirements",
    "Innovation Analysis",
    "Project-Type Requirements",
    "Functional Requirements",
    "Non-Functional Requirements",
}

_SECTION_RE = re.compile(r"^##\s+(.+)", re.MULTILINE)

# Anti-patterns: conversational filler and wordy phrases
FILLER_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bit is worth noting\b",
        r"\bit should be noted\b",
        r"\bneedless to say\b",
        r"\bas mentioned (?:earlier|above|previously)\b",
        r"\bin order to\b",
        r"\bdue to the fact that\b",
        r"\bat this point in time\b",
        r"\bin the event that\b",
        r"\bfor the purpose of\b",
        r"\bwith regard to\b",
        r"\bin terms of\b",
        r"\bon a going-forward basis\b",
        r"\bit goes without saying\b",
        r"\bbasically\b",
        r"\bobviously\b",
        r"\bclearly\b",
        r"\bsimply put\b",
        r"\bthe reality is\b",
        r"\bthe fact of the matter is\b",
    ]
]

# Subjective adjectives that indicate unmeasurable requirements
SUBJECTIVE_PATTERNS = [
    re.compile(rf"\b{word}\b", re.IGNORECASE)
    for word in [
        "easy",
        "fast",
        "intuitive",
        "simple",
        "user-friendly",
        "seamless",
        "robust",
        "scalable",
        "efficient",
        "elegant",
        "beautiful",
        "nice",
        "good",
        "great",
        "optimal",
        "best",
        "world-class",
    ]
]

# Implementation leakage: technology-specific terms in requirements
IMPLEMENTATION_PATTERNS = [
    re.compile(rf"\b{term}\b", re.IGNORECASE)
    for term in [
        "React",
        "Angular",
        "Vue",
        "Django",
        "Flask",
        "Express",
        "MongoDB",
        "PostgreSQL",
        "MySQL",
        "Redis",
        "Kubernetes",
        "Docker",
        "AWS",
        "Azure",
        "GCP",
        "Lambda",
        "S3",
        "GraphQL",
        "REST API",
        "webpack",
        "npm",
        "pip",
    ]
]


def _extract_sections(content: str) -> dict[str, str]:
    """Extract ## sections and their content."""
    sections: dict[str, str] = {}
    matches = list(_SECTION_RE.finditer(content))
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        sections[name] = content[start:end]
    return sections


def _is_requirements_section(name: str) -> bool:
    """Check if a section name is a requirements section."""
    lower = name.lower()
    return "requirement" in lower or "criteria" in lower


def _validate_prd(path: Path) -> tuple[list[str], list[str]]:
    """Validate a single PRD file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    sections = _extract_sections(content)
    section_names = set(sections.keys())

    # Required sections
    missing = REQUIRED_SECTIONS - section_names
    for section in sorted(missing):
        errors.append(f"Missing required section: ## {section}")

    # Information density: scan for filler
    filler_count = 0
    for pattern in FILLER_PATTERNS:
        filler_count += len(pattern.findall(content))

    if filler_count > 10:
        errors.append(f"Information density: {filler_count} filler phrases found (critical: >10)")
    elif filler_count > 5:
        warnings.append(f"Information density: {filler_count} filler phrases found (warning: 5-10)")

    # Measurability: check requirements sections for subjective language
    for name, body in sections.items():
        if not _is_requirements_section(name):
            continue
        for pattern in SUBJECTIVE_PATTERNS:
            matches = pattern.findall(body)
            for match in matches:
                warnings.append(
                    f"Subjective term '{match}' in '{name}' — prefer measurable criteria"
                )

    # Implementation leakage: technology-specific terms in requirements
    for name, body in sections.items():
        if not _is_requirements_section(name):
            continue
        for pattern in IMPLEMENTATION_PATTERNS:
            matches = pattern.findall(body)
            for match in matches:
                warnings.append(
                    f"Implementation leakage: '{match}' in '{name}' — "
                    "requirements should be technology-agnostic"
                )

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all PRD files."""
    report = ValidateReport(validator="prd")

    try:
        project_root = get_project_root(start_dir=root)
    except FileNotFoundError:
        project_root = root

    # Find PRD files: look for *prd*.md in planning dirs and docs
    prd_files: list[Path] = []
    search_dirs = [
        project_root / "sprint" / "planning",
        project_root / "docs",
    ]

    for search_dir in search_dirs:
        if search_dir.is_dir():
            prd_files.extend(search_dir.rglob("*prd*.md"))

    if not prd_files:
        report.details.append("[WARN] No PRD files found")
        report.warnings += 1
        return report

    for path in sorted(set(prd_files)):
        file_errors, file_warnings = _validate_prd(path)

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
