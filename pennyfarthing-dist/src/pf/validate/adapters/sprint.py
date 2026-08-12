"""Sprint YAML validator adapter.

Auto-discovers sprint files and delegates to sprint/validate_cmd.validate_sprint_yaml().
"""

from __future__ import annotations

from pathlib import Path

from pf.validate import ValidateReport


def _discover_files(root: Path) -> list[Path]:
    """Find all validatable YAML in sprint/."""
    # Local import: mirrors run()'s deferred pf.sprint import so the validate
    # package stays importable without pulling in the sprint CLI (162-30).
    from pf.sprint.shard_merge import safe_shards

    sprint_dir = root / "sprint"
    if not sprint_dir.is_dir():
        return []

    files: list[Path] = []

    cs = sprint_dir / "current-sprint.yaml"
    if cs.exists():
        files.append(cs)

    # Guarded globs: a name-matching symlink pointing outside sprint/ would
    # otherwise be handed to the validator and read (with content excerpts in
    # the report) — an out-of-bounds read (CWE-22, 162-44).
    files.extend(safe_shards(sprint_dir, "epic-*.yaml"))
    files.extend(safe_shards(sprint_dir, "initiative-*.yaml"))

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
            for err in result.errors:
                line_info = f" (line {err.line})" if err.line else ""
                msg = f"[{err.category.upper()}] {path.name}: {err.message}{line_info}"
                report.errors.append(msg)
                report.details.append(msg)

        if result.format_issues:
            for issue in result.format_issues:
                fmt_msg = f"[FORMAT] {path.name}: {issue.message}"
                if strict:
                    report.errors.append(fmt_msg)
                else:
                    report.warnings += 1
                report.details.append(fmt_msg)

        if result.valid and not result.errors:
            report.passed += 1

        if result.fixed:
            report.fixed = True

    return report
