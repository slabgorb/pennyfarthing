"""Context checking for Claude Code sessions.

Calculates context window usage from Claude Code transcript files.
Handles stale SESSION_ID detection after /clear commands.
"""

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


@dataclass
class ContextConfig:
    """Configuration for context thresholds."""
    imminent_threshold: int = 65
    warning_threshold: int = 60
    critical_threshold: int = 85
    max_tokens: int = 200000
    permission_mode: str = "manual"
    relay_mode: bool = False


@dataclass
class ContextResult:
    """Result of context check."""
    # Token counts
    tokens: int = 0
    baseline: int = 0
    usable_tokens: int = 0
    available: int = 0

    # Percentages
    percent: int = 0
    usable_percent: int = 0

    # Status
    status: str = "OK"  # OK, HIGH
    warning: str | None = None  # None, High, Critical
    recommendation: str | None = None

    # Mode settings
    permission_mode: str = "manual"
    relay_mode: bool = False
    handoff_mode: str = "ask"  # ask, auto
    is_gui: bool = False

    # Error state
    error: str | None = None

    def to_env_vars(self) -> str:
        """Output as shell environment variables."""
        if self.error:
            return f"CONTEXT_ERROR={self.error}"

        lines = [
            f"CONTEXT_TOKENS={self.tokens}",
            f"CONTEXT_PERCENT={self.percent}",
            f"CONTEXT_BASELINE={self.baseline}",
            f"CONTEXT_USABLE_TOKENS={self.usable_tokens}",
            f"CONTEXT_USABLE_PERCENT={self.usable_percent}",
            f"CONTEXT_AVAILABLE={self.available}",
            f"CONTEXT_STATUS={self.status}",
            f"PERMISSION_MODE={self.permission_mode}",
            f"RELAY_MODE={str(self.relay_mode).lower()}",
            f"HANDOFF_MODE={self.handoff_mode}",
            f"IS_GUI={str(self.is_gui).lower()}",
        ]

        if self.warning:
            lines.append(f"CONTEXT_WARNING={self.warning}")
        if self.recommendation:
            lines.append(f"CONTEXT_RECOMMENDATION='{self.recommendation}'")

        return "\n".join(lines)

    def to_human(self) -> str:
        """Output as human-readable string."""
        if self.error:
            return f"⚠️  Context: unknown ({self.error})"

        if self.status == "HIGH":
            status_line = f"⚠️  Context: {self.usable_percent}% used ({self.usable_tokens} of {self.available} available) - AUTO-HANDOFF"
        else:
            status_line = f"✅ Context: {self.usable_percent}% used ({self.usable_tokens} of {self.available} available)"

        lines = [
            status_line,
            f"   Overhead: {self.baseline} tokens (system prompt + tools)",
            f"   Mode: {self.permission_mode}",
        ]

        if self.warning == "Critical":
            lines.append(f"CONTEXT_WARNING: Critical ({self.usable_percent}%) - checkpoint and handoff recommended")
        elif self.warning == "High":
            lines.append(f"CONTEXT_WARNING: High ({self.usable_percent}%) - consider handoff soon")

        return "\n".join(lines)


def load_config(project_dir: str | None = None) -> ContextConfig:
    """Load context configuration from config files.

    Checks .pennyfarthing/config.local.yaml first, falls back to
    .claude/settings.local.json for legacy support.
    """
    config = ContextConfig()
    project_dir = (
        project_dir or
        os.environ.get("CLAUDE_PROJECT_DIR") or
        os.environ.get("PROJECT_ROOT") or
        os.getcwd()
    )

    # Try .pennyfarthing/config.local.yaml first
    yaml_path = Path(project_dir) / ".pennyfarthing" / "config.local.yaml"
    if HAS_YAML and yaml_path.exists():
        try:
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
                if data:
                    _apply_config(config, data)
                    return config
        except Exception:
            pass

    # Fallback to .claude/settings.local.json
    json_path = Path(project_dir) / ".claude" / "settings.local.json"
    if json_path.exists():
        try:
            with open(json_path) as f:
                data = json.load(f)
                _apply_config(config, data)
        except Exception:
            pass

    return config


def _apply_config(config: ContextConfig, data: dict) -> None:
    """Apply configuration data to config object."""
    if "context_budget" in data:
        cb = data["context_budget"]
        config.imminent_threshold = cb.get("imminent_threshold", config.imminent_threshold)
        config.warning_threshold = cb.get("warning_threshold", config.warning_threshold)
        config.critical_threshold = cb.get("critical_threshold", config.critical_threshold)
        config.max_tokens = cb.get("max_tokens", config.max_tokens)
    if "workflow" in data:
        wf = data["workflow"]
        config.permission_mode = wf.get("permission_mode", config.permission_mode)
        config.relay_mode = wf.get("relay_mode", False) is True


def get_claude_project_path(project_dir: str | None = None) -> Path:
    """Get the Claude Code project path for transcripts.

    Claude Code stores transcripts at ~/.claude/projects/<path-with-dashes>
    The path format is: -Users-name-Projects-project (leading dash, slashes become dashes)
    """
    project_dir = (
        project_dir or
        os.environ.get("CLAUDE_PROJECT_DIR") or
        os.environ.get("PROJECT_ROOT") or
        os.getcwd()
    )
    path_with_dashes = project_dir.replace("/", "-").replace(".", "-")
    return Path.home() / ".claude" / "projects" / path_with_dashes


def find_transcript(
    project_path: Path,
    explicit_session: str | None = None,
    session_id_env: str | None = None,
    stale_threshold_seconds: int = 60,
) -> Path | None:
    """Find the appropriate transcript file.

    Priority:
    1. Explicit session ID (from --session flag)
    2. SESSION_ID env var if transcript is fresh (modified within threshold)
    3. Most recently modified transcript

    Args:
        project_path: Claude project path (~/.claude/projects/...)
        explicit_session: Explicit session ID from --session flag
        session_id_env: SESSION_ID from environment variable
        stale_threshold_seconds: How old a transcript can be before considered stale

    Returns:
        Path to transcript file, or None if not found
    """
    if not project_path.exists():
        return None

    # Helper to find most recent transcript
    def most_recent() -> Path | None:
        transcripts = sorted(
            [f for f in project_path.glob("*.jsonl") if "agent-" not in f.name],
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        return transcripts[0] if transcripts else None

    # 1. Explicit session ID takes precedence
    if explicit_session:
        candidate = project_path / f"{explicit_session}.jsonl"
        return candidate if candidate.exists() else None

    # 2. Check SESSION_ID env var with freshness validation
    if session_id_env:
        candidate = project_path / f"{session_id_env}.jsonl"
        if candidate.exists():
            age = time.time() - candidate.stat().st_mtime
            if age < stale_threshold_seconds:
                return candidate
            # Stale - fall through to most recent
        # Doesn't exist or stale - use most recent
        return most_recent()

    # 3. No session info - use most recent
    return most_recent()


def parse_transcript(transcript_path: Path) -> tuple[int | None, int | None]:
    """Parse transcript for first and last usage totals.

    Returns:
        Tuple of (first_total, last_total) token counts
    """
    first_total = None
    last_total = None

    with open(transcript_path) as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                if "message" in data and "usage" in data["message"]:
                    usage = data["message"]["usage"]
                    total = (
                        usage.get("input_tokens", 0) +
                        usage.get("cache_read_input_tokens", 0) +
                        usage.get("cache_creation_input_tokens", 0)
                    )
                    if first_total is None:
                        first_total = total
                    last_total = total
            except (json.JSONDecodeError, KeyError):
                continue

    return first_total, last_total


def detect_gui(project_dir: str | None = None) -> bool:
    """Detect if running inside a GUI (BikeRack).

    Checks:
    1. PF_GUI env var set to '1' (primary)
    2. .bikerack-port file exists AND port is responding (Web mode)
    """
    # PF_GUI is the primary env var
    if os.environ.get("PF_GUI") == "1":
        return True

    # Port file check - verify BikeRack is actually running
    project_dir = (
        project_dir or
        os.environ.get("WHEELHUB_PROJECT_DIR") or
        os.environ.get("PROJECT_ROOT") or
        os.getcwd()
    )

    port_file = Path(project_dir) / ".bikerack-port"
    if port_file.exists():
        try:
            port = int(port_file.read_text().strip())
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                result = s.connect_ex(("127.0.0.1", port))
                if result == 0:
                    return True
        except (ValueError, OSError):
            pass

    return False


def check_context(
    explicit_session: str | None = None,
    project_dir: str | None = None,
) -> ContextResult:
    """Check current context usage.

    Args:
        explicit_session: Explicit session ID (from --session flag)
        project_dir: Project directory (defaults to cwd)

    Returns:
        ContextResult with all context information
    """
    result = ContextResult()

    # Load configuration
    config = load_config(project_dir)
    result.permission_mode = config.permission_mode
    result.relay_mode = config.relay_mode

    # Find transcript
    project_path = get_claude_project_path(project_dir)
    session_id_env = os.environ.get("SESSION_ID")

    transcript = find_transcript(
        project_path,
        explicit_session=explicit_session,
        session_id_env=session_id_env,
    )

    if not transcript:
        result.error = "no_transcript"
        return result

    # Parse transcript
    first_total, last_total = parse_transcript(transcript)

    if last_total is None:
        result.error = "no_usage_data"
        return result

    # Calculate metrics
    baseline = first_total or 0
    usable_tokens = last_total - baseline
    available = config.max_tokens - baseline
    usable_pct = int((usable_tokens / available * 100) if available > 0 else 0)
    total_pct = int((last_total / config.max_tokens) * 100)

    result.tokens = last_total
    result.baseline = baseline
    result.usable_tokens = usable_tokens
    result.available = available
    result.percent = total_pct
    result.usable_percent = usable_pct

    # Status
    if usable_pct > config.warning_threshold:
        result.status = "HIGH"

    # Handoff mode
    result.handoff_mode = "auto" if config.relay_mode else "ask"

    # GUI detection
    result.is_gui = detect_gui(project_dir)

    # Warnings
    if usable_pct >= config.critical_threshold:
        result.warning = "Critical"
        result.recommendation = "checkpoint and handoff recommended"
    elif usable_pct >= config.warning_threshold:
        result.warning = "High"
        result.recommendation = "consider handoff soon"

    return result


def main() -> None:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Check Claude Code context usage")
    parser.add_argument("--human", action="store_true", help="Human-readable output")
    parser.add_argument("--session", dest="session_id", help="Explicit session ID")
    parser.add_argument("--project-dir", help="Project directory")
    args = parser.parse_args()

    result = check_context(
        explicit_session=args.session_id,
        project_dir=args.project_dir,
    )

    if args.human:
        print(result.to_human())
    else:
        print(result.to_env_vars())


if __name__ == "__main__":
    main()
