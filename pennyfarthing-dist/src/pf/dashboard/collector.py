"""Dashboard data collectors.

Story 132-11: Build pf status dashboard command.

Each collector gathers data from one subsystem and returns
a dict with 'display' (str) and 'data' (dict) keys.
Collectors must be non-fatal: missing subsystems return
graceful fallback values.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import yaml


def collect_all(project_root: Path) -> dict[str, Any]:
    """Collect all dashboard fields from subsystems."""
    return {
        "theme": collect_theme(project_root),
        "workflow": collect_workflow(project_root),
        "sprint": collect_sprint(project_root),
        "story": collect_story(project_root),
        "hooks": collect_hooks(project_root),
        "tui": collect_tui(project_root),
        "repos": collect_repos(project_root),
        "health": collect_health(project_root),
    }


def collect_theme(project_root: Path) -> dict[str, Any]:
    """Collect theme name and tier."""
    config_path = project_root / ".pennyfarthing" / "config.local.yaml"
    if not config_path.exists():
        return {"display": "not configured", "data": {"name": None, "tier": None}}

    try:
        config = yaml.safe_load(config_path.read_text()) or {}
    except Exception:
        return {"display": "not configured", "data": {"name": None, "tier": None}}

    name = config.get("theme")
    if not name:
        return {"display": "not configured", "data": {"name": None, "tier": None}}

    tier = _get_theme_tier(project_root, name)
    tier_display = f" (Tier {tier})" if tier else ""
    return {
        "display": f"{name}{tier_display}",
        "data": {"name": name, "tier": tier or "unknown"},
    }


def _get_theme_tier(project_root: Path, theme_name: str) -> str | None:
    """Look up theme tier from theme YAML files."""
    locations = [
        project_root / ".pennyfarthing" / "personas" / "themes" / f"{theme_name}.yaml",
        project_root / "pennyfarthing-dist" / "personas" / "themes" / f"{theme_name}.yaml",
        project_root
        / "pennyfarthing"
        / "pennyfarthing-dist"
        / "personas"
        / "themes"
        / f"{theme_name}.yaml",
    ]
    for path in locations:
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text())
                if data and "theme" in data:
                    return data["theme"].get("tier")
            except Exception:
                continue
    return None


def collect_workflow(project_root: Path) -> dict[str, Any]:
    """Collect active workflow status."""
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return {"display": "none active", "data": {"name": None, "phase": None}}

    for f in session_dir.iterdir():
        if f.suffix == ".md" and f.name.endswith("-session.md"):
            try:
                content = f.read_text()
                workflow = None
                phase = None
                for line in content.splitlines():
                    if "**Workflow:**" in line:
                        workflow = line.split("**Workflow:**")[-1].strip()
                    if "**Phase:**" in line:
                        phase = line.split("**Phase:**")[-1].strip()
                if workflow:
                    phase_display = f" ({phase})" if phase else ""
                    return {
                        "display": f"{workflow}{phase_display}",
                        "data": {"name": workflow, "phase": phase},
                    }
            except Exception:
                continue

    return {"display": "none active", "data": {"name": None, "phase": None}}


def collect_sprint(project_root: Path) -> dict[str, Any]:
    """Collect current sprint info."""
    sprint_path = project_root / "sprint" / "current-sprint.yaml"
    if not sprint_path.exists():
        return {"display": "no sprint loaded", "data": {"number": None, "title": None}}

    try:
        data = yaml.safe_load(sprint_path.read_text()) or {}
    except Exception:
        return {"display": "no sprint loaded", "data": {"number": None, "title": None}}

    sprint = data.get("sprint", {})
    number = sprint.get("number")
    title = sprint.get("title")

    if number is None:
        return {"display": "no sprint loaded", "data": {"number": None, "title": None}}

    display = f"{number}"
    if title:
        display += f" \u2014 {title}"

    return {"display": display, "data": {"number": number, "title": title}}


def collect_story(project_root: Path) -> dict[str, Any]:
    """Collect active story info."""
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return {"display": "none assigned", "data": {"id": None}}

    for f in session_dir.iterdir():
        if f.suffix == ".md" and f.name.endswith("-session.md"):
            try:
                content = f.read_text()
                for line in content.splitlines():
                    if "**ID:**" in line:
                        story_id = line.split("**ID:**")[-1].strip()
                        title = None
                        for hline in content.splitlines():
                            if hline.startswith("# Story") and ":" in hline:
                                title = hline.split(":", 1)[-1].strip()
                                break
                        display = story_id
                        if title:
                            display += f" \u2014 {title}"
                        return {
                            "display": display,
                            "data": {"id": story_id, "title": title},
                        }
            except Exception:
                continue

    return {"display": "none assigned", "data": {"id": None}}


def collect_hooks(project_root: Path) -> dict[str, Any]:
    """Collect Claude Code hooks status."""
    settings_path = project_root / ".claude" / "settings.local.json"
    if not settings_path.exists():
        return {"display": "none configured", "data": {"count": 0, "names": []}}

    try:
        settings = json.loads(settings_path.read_text())
    except Exception:
        return {"display": "none configured", "data": {"count": 0, "names": []}}

    hooks = settings.get("hooks", {})
    count = 0
    names: list[str] = []

    for _event_type, entries in hooks.items():
        if isinstance(entries, list):
            for entry in entries:
                hook_list = entry.get("hooks", [])
                for hook in hook_list:
                    cmd = hook.get("command", "")
                    if cmd:
                        count += 1
                        short = cmd.split()[-1] if cmd else ""
                        names.append(short)

    if count == 0:
        return {"display": "none configured", "data": {"count": 0, "names": []}}

    preview = ", ".join(names[:4])
    if len(names) > 4:
        preview += ", ..."

    return {
        "display": f"{count} active ({preview})",
        "data": {"count": count, "names": names},
    }


def collect_tui(project_root: Path) -> dict[str, Any]:
    """Collect TUI/Frame running status."""
    import os

    pid_file = project_root / ".pennyfarthing" / "frame.pid"
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 0)
            return {"display": "running", "data": {"running": True, "pid": pid}}
        except (ValueError, OSError):
            pass

    return {"display": "not running", "data": {"running": False}}


def collect_repos(project_root: Path) -> dict[str, Any]:
    """Collect repo branch and clean/dirty status."""
    repos_path = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_path.exists():
        return {"display": "unavailable", "data": {}}

    try:
        repos_config = yaml.safe_load(repos_path.read_text()) or {}
    except Exception:
        return {"display": "unavailable", "data": {}}

    repos = repos_config.get("repos", {})
    if not repos:
        return {"display": "unavailable", "data": {}}

    parts = []
    repo_data = {}
    for name, info in repos.items():
        repo_path = project_root / info.get("path", ".")
        branch = _get_git_branch(repo_path)
        clean = _is_git_clean(repo_path)
        state = "clean" if clean else "dirty"
        parts.append(f"{name} ({branch}, {state})")
        repo_data[name] = {"branch": branch, "clean": clean}

    return {
        "display": " | ".join(parts),
        "data": repo_data,
    }


def _get_git_branch(repo_path: Path) -> str:
    """Get current git branch name."""
    head_file = repo_path / ".git" / "HEAD"
    if not head_file.exists():
        return "unknown"
    try:
        content = head_file.read_text().strip()
        if content.startswith("ref: refs/heads/"):
            return content[len("ref: refs/heads/") :]
        return content[:8]
    except Exception:
        return "unknown"


def _is_git_clean(repo_path: Path) -> bool:
    """Check if git working tree is clean."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() == ""
    except Exception:
        return True


def collect_health(project_root: Path) -> dict[str, Any]:
    """Collect doctor health check summary."""
    # Import self-module to resolve run_doctor through sys.modules.
    # This ensures test patches take effect even after module identity
    # splits caused by the performance test reimporting pf.dashboard.cli.
    import pf.dashboard.collector as _self

    try:
        report = _self.run_doctor(project_root)
    except Exception:
        return {"display": "unavailable", "data": {"status": "error"}}

    if report.success:
        return {
            "display": "all green",
            "data": {"status": "pass", "checks": len(report.checks)},
        }

    fails = sum(1 for c in report.checks if c.status == "fail")
    warns = sum(1 for c in report.checks if c.status == "warn")

    parts = []
    if fails:
        parts.append(f"{fails} failed")
    if warns:
        parts.append(f"{warns} warnings")

    return {
        "display": ", ".join(parts) if parts else "issues detected",
        "data": {
            "status": "fail",
            "failed": fails,
            "warnings": warns,
            "checks": len(report.checks),
        },
    }


def format_dashboard(data: dict[str, Any]) -> str:
    """Format collected data into aligned text output."""
    fields = ["Theme", "Workflow", "Sprint", "Story", "Hooks", "TUI", "Repos", "Health"]
    lines = ["Pennyfarthing Status"]

    for field in fields:
        key = field.lower()
        entry = data.get(key, {})
        display = entry.get("display", "unavailable") if isinstance(entry, dict) else str(entry)
        label = f"{field}:"
        lines.append(f"  {label:<11}{display}")

    return "\n".join(lines)
