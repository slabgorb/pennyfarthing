"""Sprint YAML validator adapter.

Auto-discovers sprint files and delegates to sprint/validate_cmd.validate_sprint_yaml().
"""

from __future__ import annotations

from pathlib import Path

from pf.validate import ValidateReport


def _discover_files(root: Path) -> list[Path]:
    """Find all validatable YAML in sprint/."""
    sprint_dir = root / "sprint"
    if not sprint_dir.is_dir():
        return []

    files: list[Path] = []

    cs = sprint_dir / "current-sprint.yaml"
    if cs.exists():
        files.append(cs)

    files.extend(sorted(sprint_dir.glob("epic-*.yaml")))
    files.extend(sorted(sprint_dir.glob("initiative-*.yaml")))

    future = sprint_dir / "future.yaml"
    if future.exists():
        files.append(future)

    return files


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all sprint YAML files."""
    from pf.sprint.validate_cmd import validate_sprint_yaml

    report = ValidateReport(validator="sprint")
    files = _discover_files(root)

    for path in files:
        result = validate_sprint_yaml(path, fix=fix)

        if result.errors:
            report.errors += len(result.errors)
            for err in result.errors:
                line_info = f" (line {err.line})" if err.line else ""
                report.details.append(
                    f"[{err.category.upper()}] {path.name}: {err.message}{line_info}"
                )

        if result.format_issues:
            for issue in result.format_issues:
                if strict:
                    report.errors.append("error")
                else:
                    report.warnings += 1
                report.details.append(f"[FORMAT] {path.name}: {issue.message}")

        if result.valid and not result.errors:
            report.passed += 1

        if result.fixed:
            report.fixed = True

    return report
