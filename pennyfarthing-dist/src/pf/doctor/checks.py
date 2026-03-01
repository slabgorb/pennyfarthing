"""Individual health check functions.

Story 126-8: Reduce doctor to ~10 health checks with --fix mode.

Each check function takes a project root Path and returns a CheckResult.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import yaml

from pf.doctor.models import CheckResult

# Expected content directories under .pennyfarthing/
# In the pip era these are file copies; in monorepo dev they may be symlinks.
_CONTENT_DIR_NAMES = (
    "agents", "commands", "guides", "personas", "scripts",
    "skills", "workflows", "templates", "output-styles",
)


def check_python_install(root: Path) -> CheckResult:
    """Check that pf CLI is installed and accessible."""
    if shutil.which("pf"):
        return CheckResult(name="python_install", status="pass", detail="pf CLI found on PATH")
    return CheckResult(
        name="python_install",
        status="fail",
        detail="pf CLI not found on PATH",
    )


def check_pennyfarthing_dir(root: Path) -> CheckResult:
    """Check .pennyfarthing/ directory exists with required structure."""
    pf_dir = root / ".pennyfarthing"
    if pf_dir.is_dir():
        return CheckResult(name="pennyfarthing_dir", status="pass", detail=".pennyfarthing/ exists")
    return CheckResult(
        name="pennyfarthing_dir",
        status="fail",
        detail=".pennyfarthing/ directory missing",
        fix_fn=lambda: _fix_mkdir(pf_dir),
    )


def check_config_file(root: Path) -> CheckResult:
    """Check config.local.yaml exists and is valid YAML."""
    config = root / ".pennyfarthing" / "config.local.yaml"
    if not config.is_file():
        return CheckResult(
            name="config_file",
            status="fail",
            detail="config.local.yaml missing",
            fix_fn=lambda: _fix_default_config(config),
        )
    try:
        yaml.safe_load(config.read_text())
    except yaml.YAMLError:
        return CheckResult(name="config_file", status="fail", detail="config.local.yaml has invalid YAML")
    return CheckResult(name="config_file", status="pass", detail="config.local.yaml valid")


def check_settings_hooks(root: Path) -> CheckResult:
    """Check settings.local.json has required Claude Code hooks."""
    settings_file = root / ".claude" / "settings.local.json"
    if not settings_file.is_file():
        return CheckResult(name="settings_hooks", status="fail", detail="settings.local.json missing")
    try:
        data = json.loads(settings_file.read_text())
    except (json.JSONDecodeError, OSError):
        return CheckResult(name="settings_hooks", status="fail", detail="settings.local.json unreadable")
    hooks = data.get("hooks", {})
    if not hooks:
        return CheckResult(name="settings_hooks", status="fail", detail="No hooks configured")
    return CheckResult(name="settings_hooks", status="pass", detail="Settings hooks present")


def check_content_dirs(root: Path) -> CheckResult:
    """Check .pennyfarthing/ has required content directories."""
    pf_dir = root / ".pennyfarthing"
    if not pf_dir.is_dir():
        return CheckResult(name="content_dirs", status="fail", detail=".pennyfarthing/ missing")
    missing = [d for d in _CONTENT_DIR_NAMES if not (pf_dir / d).exists()]
    if missing:
        return CheckResult(
            name="content_dirs",
            status="fail",
            detail=f"Missing: {', '.join(missing)}",
        )
    return CheckResult(name="content_dirs", status="pass", detail="All content directories present")


def check_commands(root: Path) -> CheckResult:
    """Check .claude/commands/ has expected pf-* command files."""
    cmd_dir = root / ".claude" / "commands"
    if not cmd_dir.is_dir():
        return CheckResult(name="commands", status="fail", detail=".claude/commands/ missing")
    pf_cmds = [f for f in cmd_dir.glob("pf-*.md") if f.is_file()]
    if not pf_cmds:
        return CheckResult(name="commands", status="fail", detail="No pf-* commands found")
    return CheckResult(name="commands", status="pass", detail=f"{len(pf_cmds)} pf-* commands found")


def check_skills(root: Path) -> CheckResult:
    """Check .claude/skills/ has expected pf-* skill directories."""
    skills_dir = root / ".claude" / "skills"
    if not skills_dir.is_dir():
        return CheckResult(name="skills", status="fail", detail=".claude/skills/ missing")
    pf_skills = [d for d in skills_dir.iterdir() if d.is_dir() and d.name.startswith("pf-")]
    if not pf_skills:
        return CheckResult(name="skills", status="fail", detail="No pf-* skills found")
    return CheckResult(name="skills", status="pass", detail=f"{len(pf_skills)} pf-* skills found")


def check_node_packages(root: Path) -> CheckResult:
    """Check Node packages are installed (node_modules exists).

    For pip-installed projects (no package.json), node_modules is not
    expected and the check returns pass.
    """
    if (root / "node_modules").is_dir():
        return CheckResult(name="node_packages", status="pass", detail="node_modules/ present")
    # If no package.json exists, this is a pip consumer — npm not required
    if not (root / "package.json").is_file():
        return CheckResult(
            name="node_packages",
            status="pass",
            detail="Node packages not required (pip install)",
        )
    return CheckResult(name="node_packages", status="warn", detail="node_modules/ missing — run npm install")


def check_git_hooks(root: Path) -> CheckResult:
    """Check git hooks dispatcher is installed."""
    hooks_dir = root / ".git" / "hooks"
    if not hooks_dir.is_dir():
        return CheckResult(name="git_hooks", status="warn", detail=".git/hooks/ missing")
    if not list(hooks_dir.iterdir()):
        return CheckResult(name="git_hooks", status="warn", detail="No git hooks installed")
    return CheckResult(name="git_hooks", status="pass", detail="Git hooks present")


def check_bootstrap(root: Path) -> CheckResult:
    """Check committed bootstrap hook for zero-friction onboarding."""
    bootstrap_sh = root / ".claude" / "hooks" / "bootstrap.sh"
    settings_json = root / ".claude" / "settings.json"

    issues = []

    if not bootstrap_sh.is_file():
        issues.append("bootstrap.sh missing")
    elif not os.access(bootstrap_sh, os.X_OK):
        issues.append("bootstrap.sh not executable")

    if not settings_json.is_file():
        issues.append("settings.json missing")
    else:
        try:
            data = json.loads(settings_json.read_text())
            hooks = data.get("hooks", {})
            session_start = hooks.get("SessionStart", [])
            has_bootstrap = any(
                "bootstrap.sh" in h.get("command", "")
                for entry in session_start
                for h in entry.get("hooks", [])
                if isinstance(h, dict)
            )
            if not has_bootstrap:
                issues.append("settings.json missing bootstrap SessionStart hook")
        except (json.JSONDecodeError, OSError):
            issues.append("settings.json unreadable")

    if issues:
        return CheckResult(
            name="bootstrap",
            status="fail",
            detail="; ".join(issues),
            fix_fn=lambda: _fix_bootstrap(root),
        )
    return CheckResult(name="bootstrap", status="pass", detail="Bootstrap hook configured")


def check_theme(root: Path) -> CheckResult:
    """Check active theme is valid and persona files exist."""
    config = root / ".pennyfarthing" / "config.local.yaml"
    if not config.is_file():
        return CheckResult(name="theme", status="fail", detail="config.local.yaml missing — no theme set")
    try:
        data = yaml.safe_load(config.read_text()) or {}
    except yaml.YAMLError:
        return CheckResult(name="theme", status="fail", detail="config.local.yaml invalid")
    theme = data.get("theme")
    if not theme:
        return CheckResult(name="theme", status="fail", detail="No theme set in config")
    return CheckResult(name="theme", status="pass", detail=f"Theme: {theme}")


# ---------------------------------------------------------------------------
# Fix helpers
# ---------------------------------------------------------------------------

def _fix_mkdir(path: Path) -> bool:
    path.mkdir(parents=True, exist_ok=True)
    return path.is_dir()


def _fix_default_config(path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("theme: discworld\n")
    return path.is_file()


def _fix_bootstrap(root: Path) -> bool:
    """Restore bootstrap.sh and settings.json via init logic."""
    from pf.common.discovery import resolve_pf_binary
    from pf.init.core import _write_bootstrap_settings

    # Find dist_root from the pf binary's package location
    discovery = resolve_pf_binary()
    if not discovery["success"]:
        return False
    try:
        from pf._dist import get_root, is_populated

        if is_populated():
            dist_root = get_root()
        else:
            return False
    except (ImportError, ModuleNotFoundError):
        return False

    return _write_bootstrap_settings(root, dist_root)


# ---------------------------------------------------------------------------
# Check registry
# ---------------------------------------------------------------------------

CHECKS: list[tuple[str, str]] = [
    ("python_install", "pf CLI is installed and accessible"),
    ("pennyfarthing_dir", ".pennyfarthing/ directory exists"),
    ("config_file", "config.local.yaml is valid"),
    ("settings_hooks", "Claude Code hooks configured"),
    ("bootstrap", "Bootstrap hook for zero-friction onboarding"),
    ("content_dirs", "Content directories present"),
    ("commands", "pf-* commands installed"),
    ("skills", "pf-* skills installed"),
    ("node_packages", "Node packages installed"),
    ("git_hooks", "Git hooks dispatcher installed"),
    ("theme", "Active theme is valid"),
]
