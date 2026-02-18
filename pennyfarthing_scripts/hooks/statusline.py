"""
Claude Code statusline hook — render the status bar.

Format: [ROLE] Theme | repo | branch | model [progress] pct%

Reads JSON from stdin with workspace, model, session_id, context_window info.
Outputs ANSI-colored status line to stdout.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from pennyfarthing_scripts.hooks import load_settings

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# =============================================================================
# ANSI Colors
# =============================================================================

RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
REVERSE = "\033[7m"
FG_CYAN = "\033[36m"
FG_GREEN = "\033[32m"
FG_YELLOW = "\033[33m"
FG_RED = "\033[31m"
FG_MAGENTA = "\033[35m"
FG_BLUE = "\033[34m"
FG_WHITE = "\033[97m"
FG_GRAY = "\033[38;5;245m"
FG_ORANGE = "\033[38;5;208m"
FG_PINK = "\033[38;5;213m"
FG_TEAL = "\033[38;5;43m"
FG_PURPLE = "\033[38;5;141m"
FG_LIME = "\033[38;5;154m"

# =============================================================================
# Agent Maps
# =============================================================================

AGENT_ABBREVS = {
    "pm": "PM",
    "sm": "SM",
    "dev": "DEV",
    "tea": "TEA",
    "reviewer": "REV",
    "architect": "ARC",
    "devops": "OPS",
    "ux-designer": "UX",
    "tech-writer": "DOC",
    "orchestrator": "ORC",
    "ba": "BA",
}

AGENT_COLORS = {
    "pm": f"{FG_PURPLE}{BOLD}",
    "sm": f"{FG_BLUE}{BOLD}",
    "dev": f"{FG_GREEN}{BOLD}",
    "tea": f"{FG_TEAL}{BOLD}",
    "reviewer": f"{FG_RED}{BOLD}",
    "architect": f"{FG_ORANGE}{BOLD}",
    "devops": f"{FG_CYAN}{BOLD}",
    "ux-designer": f"{FG_PINK}{BOLD}",
    "tech-writer": f"{FG_WHITE}{BOLD}",
    "orchestrator": f"{FG_MAGENTA}{BOLD}",
    "ba": f"{FG_LIME}{BOLD}",
}

# Title patterns to strip from character names
TITLE_PATTERN = re.compile(
    r'^(Captain|Lieutenant|Dr\.|Doc|Mr\.|Mrs\.|Ms\.|Admiral|Commander|'
    r'Chief|Ensign|Translator|Agent|Colonel|Major|Sergeant|Professor|'
    r'Lord|Lady|Sir|The)\s+',
    re.IGNORECASE,
)


# =============================================================================
# Helpers
# =============================================================================


def _get_agent_abbrev(name: str) -> str:
    return AGENT_ABBREVS.get(name, "???")


def _get_agent_color(name: str) -> str:
    return AGENT_COLORS.get(name, f"{FG_MAGENTA}{BOLD}")


def _clean_character_name(full_name: str) -> str:
    """Extract short display name from full character name."""
    # Remove parenthetical: "Breq (Justice of Toren)" → "Breq"
    clean = re.sub(r'\s*\([^)]*\)', '', full_name).strip()
    # Strip titles
    clean = TITLE_PATTERN.sub('', clean).strip()
    words = clean.split()
    if len(words) <= 1:
        return clean
    return words[-1]


def _parse_input() -> dict:
    """Read and parse JSON from stdin."""
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return data
    except (json.JSONDecodeError, ValueError):
        return {}


def _get_model_name(data: dict) -> str:
    """Extract and clean model name from input."""
    model_raw = data.get("model", "claude")
    if isinstance(model_raw, dict):
        model = model_raw.get("id") or model_raw.get("name") or "claude"
    elif isinstance(model_raw, str):
        model = model_raw
    else:
        model = "claude"

    if not model or model == "null":
        model = "claude"

    # Clean: remove "claude-" prefix and trailing version number
    model = re.sub(r'^claude-', '', model)
    model = re.sub(r'-\d+$', '', model)
    return model[:10]


def _get_git_info(cwd: str) -> tuple[str, str]:
    """Get git branch and dirty indicator."""
    branch = ""
    dirty = ""
    try:
        result = subprocess.run(
            ["git", "-C", cwd, "branch", "--show-current"],
            capture_output=True, text=True, timeout=3,
        )
        branch = result.stdout.strip()
        if not branch:
            result = subprocess.run(
                ["git", "-C", cwd, "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=3,
            )
            branch = result.stdout.strip()

        # Check dirty (using diff-index to avoid index.lock issues)
        result = subprocess.run(
            ["git", "-C", cwd, "diff-index", "--quiet", "HEAD", "--"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode != 0:
            dirty = "*"
        else:
            # Check for untracked files
            result = subprocess.run(
                ["git", "-C", cwd, "ls-files", "--others", "--exclude-standard"],
                capture_output=True, text=True, timeout=3,
            )
            if result.stdout.strip():
                dirty = "*"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass

    return branch, dirty


def _get_context_pct(data: dict) -> str | int:
    """Calculate context usage percentage from input data."""
    usage = data.get("context_window", {}).get("current_usage")
    if not usage or not isinstance(usage, dict):
        return "--"

    current = (
        usage.get("input_tokens", 0) +
        usage.get("cache_creation_input_tokens", 0) +
        usage.get("cache_read_input_tokens", 0)
    )
    size = data.get("context_window", {}).get("context_window_size", 0)

    if not current or not size or size <= 0:
        return "--"

    return current * 100 // size


def _resolve_agent(project_root: str, session_id: str) -> str:
    """Resolve agent name from session files."""
    if session_id:
        agent_file = Path(project_root) / ".session" / "agents" / session_id
        if agent_file.is_file():
            try:
                return agent_file.read_text().strip()
            except OSError:
                pass

    agents_dir = Path(project_root) / ".session" / "agents"
    if agents_dir.is_dir():
        try:
            files = sorted(
                (f for f in agents_dir.iterdir() if f.is_file()),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            if files:
                return files[0].read_text().strip()
        except OSError:
            pass

    return ""


def _get_character_display(project_root: str, agent_name: str) -> tuple[str, str | None]:
    """Get character display name and theme file path.

    Returns:
        Tuple of (character_display, theme_file_path)
    """
    if not HAS_YAML or not agent_name:
        return "", None

    config_file = None
    for name in ("config.local.yaml", "persona-config.yaml"):
        candidate = Path(project_root) / ".pennyfarthing" / name
        if candidate.is_file():
            config_file = candidate
            break

    if not config_file:
        return "", None

    try:
        with open(config_file) as f:
            config = yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError):
        return "", None

    theme = config.get("theme")
    if not theme:
        return "", None

    theme_file = Path(project_root) / ".pennyfarthing" / "personas" / "themes" / f"{theme}.yaml"
    if not theme_file.is_file():
        # Capitalize theme name as fallback
        return theme[0].upper() + theme[1:] if theme else "", str(theme_file)

    try:
        with open(theme_file) as f:
            theme_data = yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError):
        return theme[0].upper() + theme[1:] if theme else "", str(theme_file)

    full_name = (theme_data.get("agents", {}).get(agent_name, {}) or {}).get("character")
    if full_name:
        return _clean_character_name(full_name), str(theme_file)

    return theme[0].upper() + theme[1:] if theme else "", str(theme_file)


def _get_tandem_partner_display(project_root: str, theme_file: str | None) -> str:
    """Find active tandem partner and return display name."""
    session_dir = Path(project_root) / ".session"
    if not session_dir.is_dir():
        return ""

    tandem_files = list(session_dir.glob("*-tandem-*.md"))
    if not tandem_files:
        return ""

    tandem_file = tandem_files[0]
    match = re.search(r'-tandem-([a-zA-Z_-]+)\.md$', tandem_file.name)
    if not match:
        return ""

    partner_name = match.group(1)

    if HAS_YAML and theme_file and Path(theme_file).is_file():
        try:
            with open(theme_file) as f:
                theme_data = yaml.safe_load(f) or {}
            full_name = (theme_data.get("agents", {}).get(partner_name, {}) or {}).get("character")
            if full_name:
                return _clean_character_name(full_name)
        except (OSError, yaml.YAMLError):
            pass

    return _get_agent_abbrev(partner_name)


def _build_progress_bar(pct: str | int) -> tuple[str, str]:
    """Build progress bar and pct display with ANSI colors.

    Returns:
        Tuple of (progress_bar, pct_display)
    """
    bar_width = 10

    if pct == "--" or not isinstance(pct, int):
        bar = f"{DIM}{'░' * bar_width}{RESET}"
        pct_str = f"{FG_GRAY}--%{RESET}"
        return bar, pct_str

    filled = max(0, min(bar_width, pct * bar_width // 100))

    if pct > 95:
        color = f"{FG_RED}{BOLD}"
    elif pct > 85:
        color = FG_RED
    elif pct > 70:
        color = FG_YELLOW
    else:
        color = FG_GREEN

    bar = f"{color}{'▓' * filled}{RESET}{DIM}{'░' * (bar_width - filled)}{RESET}"
    pct_str = f"{color}{pct}%{RESET}"
    return bar, pct_str


# =============================================================================
# Entry Point
# =============================================================================


def main() -> None:
    """Main entry point for statusline hook."""
    try:
        data = _parse_input()
        if not data:
            print("⚠ invalid input", end="")
            sys.exit(0)

        cwd = data.get("workspace", {}).get("current_dir", "")
        dir_name = Path(cwd).name if cwd else "?"
        project_root = os.environ.get("CLAUDE_PROJECT_DIR", cwd)
        session_id = data.get("session_id", "")

        model = _get_model_name(data)

        # Check git_monitor setting — skip git calls when disabled
        _settings = load_settings(Path(project_root) if project_root else None)
        if cwd and _settings.git_monitor:
            branch, branch_dirty = _get_git_info(cwd)
        else:
            branch, branch_dirty = "", ""

        pct = _get_context_pct(data)

        agent_name = _resolve_agent(project_root, session_id)
        agent_abbrev = _get_agent_abbrev(agent_name) if agent_name else ""
        theme_display, theme_file = _get_character_display(project_root, agent_name)
        tandem_display = _get_tandem_partner_display(project_root, theme_file)

        # Build progress bar
        progress_bar, pct_display = _build_progress_bar(pct)

        # Branch color
        branch_color = FG_YELLOW if branch_dirty else FG_GREEN

        # Fixed-width formatting
        repo_fmt = f"{dir_name:<14}"
        branch_fmt = f"{branch}{branch_dirty}"[:12]
        branch_fmt = f"{branch_fmt:<12}"
        model_fmt = f"{model:<10}"

        # Tandem suffix
        tandem_suffix = ""
        tandem_suffix_len = 0
        if tandem_display:
            partner_color = _get_agent_color(tandem_display) if tandem_display in AGENT_ABBREVS else _get_agent_color("")
            tandem_suffix = f" {DIM}+{RESET} {partner_color}{tandem_display}{RESET}"
            tandem_suffix_len = 3 + len(tandem_display)

        # Agent section
        if agent_abbrev:
            agent_color = _get_agent_color(agent_name)
            if theme_display:
                agent_section = f"{agent_color}{REVERSE} {agent_abbrev} {RESET} {DIM}{theme_display}{RESET}{tandem_suffix}"
                pad_len = max(0, 18 - len(agent_abbrev) - len(theme_display) - tandem_suffix_len)
                agent_section += " " * pad_len
            else:
                agent_section = f"{agent_color}{REVERSE} {agent_abbrev} {RESET}{tandem_suffix}"
                pad_len = max(0, 17 - len(agent_abbrev) - tandem_suffix_len)
                agent_section += " " * pad_len
        elif theme_display:
            agent_section = f"{DIM}{theme_display}{RESET}{tandem_suffix}"
            pad_len = max(0, 20 - len(theme_display) - tandem_suffix_len)
            agent_section += " " * pad_len
        else:
            agent_section = " " * 20

        # Build output
        output = (
            f"{agent_section}"
            f"{DIM}│{RESET} "
            f"{FG_CYAN}{repo_fmt}{RESET}"
            f"{DIM}│{RESET} "
            f"{branch_color}{branch_fmt}{RESET}"
            f"{DIM}│{RESET} "
            f"{FG_GRAY}{model_fmt}{RESET}"
            f"{progress_bar} "
            f"{pct_display}"
        )

        print(output, end="")

    except Exception:
        print("⚠ error", end="")

    sys.exit(0)


if __name__ == "__main__":
    main()
