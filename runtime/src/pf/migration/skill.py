"""
Skill file auditing tools.

Audits skill files for conformance to schemas/skill-schema.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from pf.common.config import get_dist_root

# Tag requirements
REQUIRED_TAGS = ["run", "output"]
RECOMMENDED_TAGS = ["args", "example", "when"]
OPTIONAL_TAGS = ["critical", "agent-activation"]


@dataclass
class SkillAuditResult:
    """Result of auditing a skill file."""

    skill_name: str
    file_path: Path
    has_frontmatter: bool = False
    missing_required: list[str] = field(default_factory=list)
    missing_recommended: list[str] = field(default_factory=list)
    present_tags: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        """Check if skill passes validation (has all required)."""
        return len(self.missing_required) == 0

    @property
    def status(self) -> str:
        """Get status string."""
        if not self.is_valid:
            return "NEEDS UPDATE"
        if self.missing_recommended:
            return "PARTIAL"
        return "OK"


def _has_frontmatter(content: str) -> bool:
    """Check if file has YAML frontmatter."""
    return content.startswith("---\n")


def _has_tag(content: str, tag: str) -> bool:
    """Check if content contains a specific XML tag."""
    return f"<{tag}>" in content or f"<{tag} " in content


def _get_present_tags(content: str) -> list[str]:
    """Get list of XML tags present in content."""
    # Find all opening tags
    tags = re.findall(r"<([a-z][a-z0-9-]*)(?:\s|>)", content)
    return list(set(tags))


def audit_skill_file(file_path: Path) -> SkillAuditResult:
    """Audit a single skill file.

    Args:
        file_path: Path to SKILL.md file

    Returns:
        SkillAuditResult with findings
    """
    skill_name = file_path.parent.name
    content = file_path.read_text()

    result = SkillAuditResult(skill_name=skill_name, file_path=file_path)

    # Check frontmatter
    result.has_frontmatter = _has_frontmatter(content)
    if not result.has_frontmatter:
        result.missing_required.append("frontmatter")

    # Check required tags
    for tag in REQUIRED_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)
        else:
            result.missing_required.append(tag)

    # Check recommended tags
    for tag in RECOMMENDED_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)
        else:
            result.missing_recommended.append(tag)

    # Check optional tags (just track presence)
    for tag in OPTIONAL_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)

    return result


def find_skill_files(root: Path) -> list[Path]:
    """Find all skill files in a project.

    Args:
        root: Project root directory

    Returns:
        List of SKILL.md file paths
    """
    # Try multiple locations
    _dist = get_dist_root()
    skill_dirs = [
        *([_dist / "skills"] if _dist is not None else []),
        root / ".pennyfarthing" / "skills",
        root / "pennyfarthing" / "pennyfarthing-dist" / "skills",
        root / "pennyfarthing-dist" / "skills",
    ]

    for skills_dir in skill_dirs:
        if skills_dir.exists():
            return sorted(skills_dir.glob("*/SKILL.md"))

    return []


def audit_skills(
    root: Path, *, skill_name: str | None = None
) -> dict[str, SkillAuditResult | list[SkillAuditResult] | dict]:
    """Audit skill files in a project.

    Args:
        root: Project root directory
        skill_name: Optional specific skill to audit

    Returns:
        Dict with 'results', 'summary' keys
    """
    if skill_name:
        # Find specific skill
        _dist = get_dist_root()
        skill_dirs = [
            *([_dist / "skills" / skill_name / "SKILL.md"] if _dist is not None else []),
            root / ".pennyfarthing" / "skills" / skill_name / "SKILL.md",
            root / "pennyfarthing" / "pennyfarthing-dist" / "skills" / skill_name / "SKILL.md",
            root / "pennyfarthing-dist" / "skills" / skill_name / "SKILL.md",
        ]

        for skill_path in skill_dirs:
            if skill_path.exists():
                result = audit_skill_file(skill_path)
                return {
                    "results": [result],
                    "summary": {
                        "total": 1,
                        "valid": 1 if result.is_valid else 0,
                        "partial": 1 if result.status == "PARTIAL" else 0,
                        "needs_update": 1 if not result.is_valid else 0,
                        "missing_required": len(result.missing_required),
                        "missing_recommended": len(result.missing_recommended),
                    },
                }

        return {
            "results": [],
            "summary": {"total": 0, "error": f"Skill not found: {skill_name}"},
        }

    # Audit all skills
    skill_files = find_skill_files(root)
    results = [audit_skill_file(f) for f in skill_files]

    # Calculate summary
    valid = sum(1 for r in results if r.is_valid and not r.missing_recommended)
    partial = sum(1 for r in results if r.is_valid and r.missing_recommended)
    needs_update = sum(1 for r in results if not r.is_valid)
    total_missing_required = sum(len(r.missing_required) for r in results)
    total_missing_recommended = sum(len(r.missing_recommended) for r in results)

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "valid": valid,
            "partial": partial,
            "needs_update": needs_update,
            "missing_required": total_missing_required,
            "missing_recommended": total_missing_recommended,
        },
    }
