"""
XML schema validation for Pennyfarthing files.

Validates files against their respective schemas:
- Session files -> guides/session-schema.md
- Skill files -> guides/skill-schema.md
- Workflow step files -> guides/workflow-step-schema.md
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pf.migration.session import (
    find_session_files,
    is_xml_format,
)
from pf.migration.skill import (
    RECOMMENDED_TAGS as SKILL_RECOMMENDED,
)
from pf.migration.skill import (
    REQUIRED_TAGS as SKILL_REQUIRED,
)
from pf.migration.skill import (
    find_skill_files,
)
from pf.migration.step import (
    RECOMMENDED_TAGS as STEP_RECOMMENDED,
)
from pf.migration.step import (
    REQUIRED_TAGS as STEP_REQUIRED,
)
from pf.migration.step import (
    STEP_META_FIELDS,
    find_step_files,
)


@dataclass
class ValidationResult:
    """Result of validating a single file."""

    file_path: Path
    file_type: Literal["session", "skill", "step"]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    @property
    def status(self) -> str:
        if self.errors:
            return "ERROR"
        if self.warnings:
            return "WARN"
        return "PASS"


def _has_tag(content: str, tag: str) -> bool:
    """Check if content contains a specific XML tag."""
    return f"<{tag}>" in content or f"<{tag} " in content


def validate_session_file(file_path: Path) -> ValidationResult:
    """Validate a session file against the schema.

    Args:
        file_path: Path to session file

    Returns:
        ValidationResult with errors/warnings
    """
    result = ValidationResult(file_path=file_path, file_type="session")
    content = file_path.read_text()

    # Check for XML format
    if not is_xml_format(content):
        result.errors.append("Not in XML format - needs migration")
        return result

    # Validate <session> root with attributes
    if not re.search(r'<session\s+story="[^"]+"', content):
        result.errors.append("Missing story attribute on <session>")

    if not re.search(r'<session[^>]+workflow="[^"]+"', content):
        result.errors.append("Missing workflow attribute on <session>")

    # Validate <meta> section
    if not _has_tag(content, "meta"):
        result.errors.append("Missing <meta> section")
    else:
        if "<jira>" not in content:
            result.errors.append("Missing <jira> in <meta>")
        if "<started>" not in content:
            result.errors.append("Missing <started> in <meta>")

    # Validate <status> element
    if not _has_tag(content, "status"):
        result.errors.append("Missing <status> element")
    else:
        if 'phase="' not in content:
            result.errors.append("Missing phase attribute on <status>")
        if 'next-agent="' not in content:
            result.warnings.append("Missing next-agent attribute on <status>")

    # Validate optional sections
    if not _has_tag(content, "acceptance-criteria"):
        result.warnings.append("Missing <acceptance-criteria> section")

    if not _has_tag(content, "work-log"):
        result.warnings.append("Missing <work-log> section")

    return result


def validate_skill_file(file_path: Path) -> ValidationResult:
    """Validate a skill file against the schema.

    Args:
        file_path: Path to SKILL.md file

    Returns:
        ValidationResult with errors/warnings
    """
    result = ValidationResult(file_path=file_path, file_type="skill")
    content = file_path.read_text()

    # Check YAML frontmatter
    if not content.startswith("---\n"):
        result.errors.append("Missing YAML frontmatter")
    else:
        if "name:" not in content.split("---")[1]:
            result.errors.append("Missing 'name' in frontmatter")
        if "description:" not in content.split("---")[1]:
            result.errors.append("Missing 'description' in frontmatter")

    # Check required tags
    for tag in SKILL_REQUIRED:
        if not _has_tag(content, tag):
            result.errors.append(f"Missing <{tag}> tag (required)")

    # Check recommended tags
    for tag in SKILL_RECOMMENDED:
        if not _has_tag(content, tag):
            result.warnings.append(f"Missing <{tag}> tag (recommended)")

    return result


def validate_step_file(file_path: Path) -> ValidationResult:
    """Validate a workflow step file against the schema.

    Args:
        file_path: Path to step-*.md file

    Returns:
        ValidationResult with errors/warnings
    """
    result = ValidationResult(file_path=file_path, file_type="step")
    content = file_path.read_text()

    # Check required tags
    for tag in STEP_REQUIRED:
        if not _has_tag(content, tag):
            result.errors.append(f"Missing <{tag}> tag")

    # Check step-meta fields if tag exists
    if _has_tag(content, "step-meta"):
        meta_match = re.search(r"<step-meta>(.+?)</step-meta>", content, re.DOTALL)
        if meta_match:
            meta_content = meta_match.group(1)
            for field_name in STEP_META_FIELDS:
                if f"{field_name}:" not in meta_content:
                    result.errors.append(f"Missing '{field_name}' in step-meta")

    # Check recommended tags
    for tag in STEP_RECOMMENDED:
        if not _has_tag(content, tag):
            result.warnings.append(f"Missing <{tag}> tag")

    return result


def validate_file(file_path: Path) -> ValidationResult:
    """Validate a file, auto-detecting its type.

    Args:
        file_path: Path to file

    Returns:
        ValidationResult
    """
    name = file_path.name

    if name.endswith("-session.md"):
        return validate_session_file(file_path)
    elif name == "SKILL.md":
        return validate_skill_file(file_path)
    elif name.startswith("step-") and name.endswith(".md"):
        return validate_step_file(file_path)
    else:
        result = ValidationResult(file_path=file_path, file_type="session")
        result.errors.append(f"Unknown file type: {name}")
        return result


@dataclass
class ValidationSummary:
    """Summary of validation results."""

    results: list[ValidationResult] = field(default_factory=list)
    passed: int = 0
    warnings: int = 0
    errors: int = 0

    def add(self, result: ValidationResult) -> None:
        """Add a result to the summary."""
        self.results.append(result)
        if result.status == "PASS":
            self.passed += 1
        elif result.status == "WARN":
            self.warnings += 1
        else:
            self.errors += 1

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def success(self) -> bool:
        return self.errors == 0


def validate_all(
    root: Path,
    *,
    file_type: Literal["session", "skill", "step", "all"] = "all",
    strict: bool = False,
) -> ValidationSummary:
    """Validate all files of specified type(s).

    Args:
        root: Project root directory
        file_type: Type to validate (session, skill, step, or all)
        strict: If True, treat warnings as errors

    Returns:
        ValidationSummary with all results
    """
    summary = ValidationSummary()

    # Validate sessions
    if file_type in ("session", "all"):
        for file_path in find_session_files(root):
            result = validate_session_file(file_path)
            if strict and result.warnings:
                result.errors.extend(result.warnings)
                result.warnings = []
            summary.add(result)

    # Validate skills
    if file_type in ("skill", "all"):
        for file_path in find_skill_files(root):
            result = validate_skill_file(file_path)
            if strict and result.warnings:
                result.errors.extend(result.warnings)
                result.warnings = []
            summary.add(result)

    # Validate steps
    if file_type in ("step", "all"):
        for file_path in find_step_files(root):
            result = validate_step_file(file_path)
            if strict and result.warnings:
                result.errors.extend(result.warnings)
                result.warnings = []
            summary.add(result)

    return summary
