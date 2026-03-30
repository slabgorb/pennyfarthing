"""
Shared utilities for Pennyfarthing Claude Code hooks.

Provides common functionality for all hooks:
- Project root detection
- Port file discovery
- Settings loading (relay_mode, permission_mode)
- Context state checking
- HTTP communication with Frame

All hooks should import from this module for consistency.

Story: PROJ-12409 - Hook consistency and relay mode compatibility
"""

import json
import os  # noqa: F401
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

# =============================================================================
# Port File Constants
# =============================================================================

# Frame port file - central coordination server for all communication
# Per ADR-0004: "the hub where all communication converges"
FRAME_PORT_FILE = ".frame-port"

# Default port if file not found (Frame not running)
DEFAULT_FRAME_PORT = 2898

# HTTP timeout for Frame communication
HTTP_TIMEOUT_SECONDS = 120


# =============================================================================
# Project Root Detection
# =============================================================================


def find_project_root(start_dir: Path | None = None) -> Path | None:
    """Find the project root by looking for marker files.

    Searches for (in order):
    1. .frame-port (Frame is running)
    2. .pennyfarthing directory
    3. .claude directory

    Args:
        start_dir: Directory to start search from (defaults to cwd)

    Returns:
        Path to project root, or None if not found
    """
    current = Path(start_dir) if start_dir else Path.cwd()
    current = current.resolve()

    while current != current.parent:
        # Check for port file first (indicates Frame is running)
        if (current / FRAME_PORT_FILE).exists():
            return current
        # Fall back to directory markers
        if (current / ".pennyfarthing").is_dir():
            return current
        if (current / ".claude").is_dir():
            return current
        current = current.parent

    return None


# =============================================================================
# Port File Reading
# =============================================================================


def read_port_file(file_name: str, project_root: Path | None = None) -> int | None:
    """Read a port number from a Frame port file.

    Args:
        file_name: Name of the port file (e.g. .frame-port)
        project_root: Project root directory (auto-detected if not provided)

    Returns:
        Port number, or None if file not found or invalid
    """
    root = project_root or find_project_root()
    if not root:
        return None

    port_file = root / file_name
    if not port_file.exists():
        return None

    try:
        content = port_file.read_text().strip()
        port = int(content)
        if 0 < port < 65536:
            return port
    except (ValueError, OSError):
        pass

    return None


def get_frame_port(project_root: Path | None = None) -> int:
    """Get the Frame server port.

    Frame is the central coordination server for all Pennyfarthing
    communication, including hook requests, OTEL, REST APIs, and WebSocket.

    Args:
        project_root: Project root directory (auto-detected if not provided)

    Returns:
        Port number (default if file not found)
    """
    port = read_port_file(FRAME_PORT_FILE, project_root)
    if port:
        return port

    return DEFAULT_FRAME_PORT


# =============================================================================
# Settings Loading
# =============================================================================


@dataclass
class PennySettings:
    """Pennyfarthing workflow settings from config.local.yaml."""

    permission_mode: str = "manual"  # plan, manual, accept
    relay_mode: bool = False
    git_monitor: bool = False
    statusbar: bool = True
    theme: str | None = None
    discovery_nudge: bool = True
    startup_agent: str = "sm"


def load_settings(project_root: Path | None = None) -> PennySettings:
    """Load Pennyfarthing settings from .pennyfarthing/config.local.yaml.

    Handles legacy setting migrations:
    - permission_mode: 'turbo' -> 'accept' + relay_mode: True
    - handoff_mode: 'auto' -> relay_mode: True
    - auto_handoff: True -> relay_mode: True

    Args:
        project_root: Project root directory (auto-detected if not provided)

    Returns:
        PennySettings with current configuration
    """
    settings = PennySettings()

    root = project_root or find_project_root()
    if not root:
        return settings

    config_path = root / ".pennyfarthing" / "config.local.yaml"
    if not config_path.exists():
        return settings

    try:
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError):
        return settings

    # Extract theme
    settings.theme = config.get("theme")

    # Extract workflow settings
    workflow = config.get("workflow", {})
    if not isinstance(workflow, dict):
        return settings

    # Handle permission_mode
    mode = workflow.get("permission_mode", "manual")
    if mode == "turbo":
        # Migrate turbo -> accept + relay_mode
        settings.permission_mode = "accept"
        settings.relay_mode = True
    elif mode in ("plan", "manual", "accept"):
        settings.permission_mode = mode
    else:
        settings.permission_mode = "manual"

    # Handle explicit relay_mode (overrides migration)
    if "relay_mode" in workflow and isinstance(workflow["relay_mode"], bool):
        settings.relay_mode = workflow["relay_mode"]
    elif not settings.relay_mode:
        # Check legacy settings
        if workflow.get("handoff_mode") == "auto":
            settings.relay_mode = True
        elif workflow.get("auto_handoff") is True:
            settings.relay_mode = True

    # Handle git_monitor
    if "git_monitor" in workflow and isinstance(workflow["git_monitor"], bool):
        settings.git_monitor = workflow["git_monitor"]

    # Handle statusbar
    if "statusbar" in workflow and isinstance(workflow["statusbar"], bool):
        settings.statusbar = workflow["statusbar"]

    # Handle discovery_nudge
    if "discovery_nudge" in workflow and isinstance(workflow["discovery_nudge"], bool):
        settings.discovery_nudge = workflow["discovery_nudge"]

    # Handle startup_agent
    if "startup_agent" in workflow and isinstance(workflow["startup_agent"], str):
        settings.startup_agent = workflow["startup_agent"]

    return settings


def is_relay_mode_enabled(project_root: Path | None = None) -> bool:
    """Check if relay mode (auto-handoff) is enabled.

    Args:
        project_root: Project root directory (auto-detected if not provided)

    Returns:
        True if relay mode is enabled
    """
    return load_settings(project_root).relay_mode


# =============================================================================
# Context State
# =============================================================================


@dataclass
class ContextState:
    """Current context usage state."""

    used_tokens: int = 0
    max_tokens: int = 200000
    percentage: float = 0.0
    is_high: bool = False  # > 60%
    is_critical: bool = False  # > 80%


def get_context_state(project_root: Path | None = None) -> ContextState:
    """Get current context usage from Frame API.

    Calls Frame's /api/context endpoint which runs pf context.

    Args:
        project_root: Project root directory (auto-detected if not provided)

    Returns:
        ContextState with current usage (defaults if Frame not running)
    """
    state = ContextState()

    port = get_frame_port(project_root)
    url = f"http://127.0.0.1:{port}/api/context"

    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            state.used_tokens = data.get("used_tokens", 0)
            state.max_tokens = data.get("max_tokens", 200000)
            if state.max_tokens > 0:
                state.percentage = (state.used_tokens / state.max_tokens) * 100
            state.is_high = state.percentage > 60
            state.is_critical = state.percentage > 80
    except (urllib.error.URLError, json.JSONDecodeError, OSError):
        # Frame not running or error - return defaults
        pass

    return state


# =============================================================================
# Frame HTTP Communication
# =============================================================================


def send_to_frame(
    endpoint: str,
    data: dict[str, Any],
    port: int | None = None,
    project_root: Path | None = None,
    timeout: int = HTTP_TIMEOUT_SECONDS,
) -> dict[str, Any] | None:
    """Send a POST request to Frame.

    All endpoints go through Frame per ADR-0004.

    Args:
        endpoint: API endpoint path (e.g., "/api/hook-request")
        data: JSON data to send
        port: Port to use (auto-detected if not provided)
        project_root: Project root for port discovery
        timeout: Request timeout in seconds

    Returns:
        Response JSON as dict, or None on error
    """
    if port is None:
        port = get_frame_port(project_root)

    url = f"http://127.0.0.1:{port}{endpoint}"
    json_data = json.dumps(data).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=json_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.URLError as e:
        # Connection refused means Frame isn't running
        if "Connection refused" in str(e):
            return None
        raise
    except (json.JSONDecodeError, OSError):
        return None


# =============================================================================
# Hook Response Formatting
# =============================================================================


@dataclass
class HookResponse:
    """Standard hook response for Claude Code."""

    event_name: str
    decision: str | None = None  # allow, deny, ask (for PreToolUse)
    reason: str | None = None
    updated_input: dict[str, Any] | None = None
    additional_context: str | None = None  # For PostToolUse context injection

    def to_json(self) -> str:
        """Format as Claude Code hook JSON output."""
        output: dict[str, Any] = {
            "hookSpecificOutput": {
                "hookEventName": self.event_name,
            }
        }

        hook_output = output["hookSpecificOutput"]

        if self.decision:
            hook_output["permissionDecision"] = self.decision
        if self.reason:
            hook_output["permissionDecisionReason"] = self.reason
        if self.updated_input:
            hook_output["updatedInput"] = self.updated_input
        if self.additional_context:
            hook_output["additionalContext"] = self.additional_context

        return json.dumps(output)


def output_hook_response(response: HookResponse) -> None:
    """Output hook response to stdout for Claude Code."""
    print(response.to_json())


def read_stdin_json() -> dict[str, Any]:
    """Read JSON from stdin (hook input from Claude Code).

    Returns:
        Parsed JSON as dict

    Raises:
        ValueError: If input is not valid JSON
    """
    data = sys.stdin.read()
    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON input: {e}") from e


# =============================================================================
# Hook Execution Utilities
# =============================================================================


def should_auto_approve(settings: PennySettings) -> bool:
    """Check if requests should be auto-approved based on settings.

    Auto-approve when permission_mode is 'accept' (formerly turbo).

    Args:
        settings: Current Pennyfarthing settings

    Returns:
        True if auto-approval is enabled
    """
    return settings.permission_mode == "accept"


def should_auto_handoff(settings: PennySettings) -> bool:
    """Check if handoffs should be automatic based on settings.

    Args:
        settings: Current Pennyfarthing settings

    Returns:
        True if relay_mode is enabled
    """
    return settings.relay_mode
