"""Core doctor logic — run checks, apply fixes.

Story 126-8: Reduce doctor to ~10 health checks with --fix mode.
"""

from __future__ import annotations

from pathlib import Path

from pf.doctor.checks import (
    CHECKS,
    check_bootstrap,
    check_commands,
    check_config_file,
    check_git_hooks,
    check_node_packages,
    check_pennyfarthing_dir,
    check_python_install,
    check_settings_hooks,
    check_skills,
    check_content_dirs,
    check_theme,
)
from pf.doctor.models import DoctorReport

# Map check names to their functions
_CHECK_FNS = {
    "python_install": check_python_install,
    "pennyfarthing_dir": check_pennyfarthing_dir,
    "config_file": check_config_file,
    "settings_hooks": check_settings_hooks,
    "bootstrap": check_bootstrap,
    "content_dirs": check_content_dirs,
    "commands": check_commands,
    "skills": check_skills,
    "node_packages": check_node_packages,
    "git_hooks": check_git_hooks,
    "theme": check_theme,
}


def run_doctor(root: Path, *, fix: bool = False) -> DoctorReport:
    """Run all health checks and optionally apply fixes.

    Args:
        root: Project root directory.
        fix: If True, attempt to fix failed checks.

    Returns:
        DoctorReport with results of all checks.
    """
    report = DoctorReport()
    fixed_count = 0

    for name, _desc in CHECKS:
        fn = _CHECK_FNS[name]
        result = fn(root)
        if fix and result.status == "fail" and result.fix_fn is not None:
            result.fix_fn()
            fixed_count += 1
        report.checks.append(result)

    report.fixed = fixed_count
    report.success = all(c.status != "fail" for c in report.checks)
    return report
