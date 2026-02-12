#!/usr/bin/env python3
"""
PostToolUse Hook — Bell Mode + Tandem Injection (Python)

Called by Claude Code after each tool execution. Handles two independent
injection systems:

1. Bell queue (Cyclist only) — injects queued user messages when Cyclist
   is running and bell_mode is enabled. In CLI sessions this is a no-op.
2. Tandem observations (always active) — injects backseat agent observations
   when tandem observation files exist. No configuration required.

Bell queue takes precedence: if a queued message exists, tandem is
deferred to the next hook invocation.

Story: MSSCI-12409 - Hook consistency and WheelHub consolidation
"""

import json
import re
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from hooks import (
    CYCLIST_PORT_FILE,
    HookResponse,
    find_project_root,
    is_bell_mode_enabled,
    output_hook_response,
    read_port_file,
    send_to_cyclist,
)


def read_bell_queue(project_root: Path) -> list[dict]:
    """Read the bell message queue.

    Args:
        project_root: Project root directory

    Returns:
        List of queued messages, or empty list if none
    """
    queue_path = project_root / ".pennyfarthing" / "bell-queue.json"
    if not queue_path.exists():
        return []

    try:
        with open(queue_path) as f:
            queue = json.load(f)
            if isinstance(queue, list):
                return queue
    except (json.JSONDecodeError, OSError):
        pass

    return []


def dequeue_message(project_root: Path) -> None:
    """Remove the first message from the queue.

    Args:
        project_root: Project root directory
    """
    queue_path = project_root / ".pennyfarthing" / "bell-queue.json"
    if not queue_path.exists():
        return

    try:
        with open(queue_path) as f:
            queue = json.load(f)

        if isinstance(queue, list) and len(queue) > 0:
            queue = queue[1:]  # Remove first item
            with open(queue_path, "w") as f:
                json.dump(queue, f)
    except (json.JSONDecodeError, OSError):
        pass


def notify_cyclist(project_root: Path, message_text: str) -> None:
    """Notify Cyclist browser that a queued message was consumed.

    Args:
        project_root: Project root directory
        message_text: The message text that was consumed
    """
    try:
        send_to_cyclist(
            endpoint="/api/bell-consumed",
            data={"text": message_text},
            project_root=project_root,
            timeout=5,
        )
    except Exception:
        # Ignore errors - don't block hook
        pass


# =============================================================================
# Tandem Observation Injection (Story 95-7 / MSSCI-14672)
# =============================================================================
# Stubs for tandem observation injection. Dev will implement.


def read_tandem_observations(project_root: Path) -> list[Path]:
    """Find tandem observation files in .session/ directory.

    Looks for files matching .session/*-tandem-*.md pattern.

    Args:
        project_root: Project root directory

    Returns:
        List of Path objects for tandem observation files
    """
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return []
    return sorted(session_dir.glob("*-tandem-*.md"))


def get_latest_observation(file_content: str) -> dict | None:
    """Extract the latest observation entry from a tandem observation file.

    Parses the markdown format to extract the most recent ## [HH:MM] Observation
    block, including the observer persona name from the file header.

    Args:
        file_content: Full text content of the tandem observation file

    Returns:
        Dict with 'persona' and 'text' keys, or None if no observations found
    """
    # Extract persona from header: **Observer:** agent (Persona Name)
    persona_match = re.search(r"\*\*Observer:\*\*\s*\w+\s*\(([^)]+)\)", file_content)
    persona = persona_match.group(1) if persona_match else "Unknown"

    # Split on observation headers: ## [HH:MM] Observation
    entries = re.split(r"## \[\d{1,2}:\d{2}\] Observation\n", file_content)
    if len(entries) < 2:
        return None

    # Last entry is the most recent observation
    last_entry = entries[-1].strip()
    # Remove trailing --- separator
    last_entry = re.sub(r"\n---\s*$", "", last_entry).strip()
    # Remove the **Trigger:** line
    lines = last_entry.split("\n")
    text_lines = [line for line in lines if not line.startswith("**Trigger:**")]
    text = "\n".join(text_lines).strip()

    if not text:
        return None

    return {"persona": persona, "text": text}


def format_tandem_message(persona_name: str, observation_text: str) -> str:
    """Format a tandem observation as a bell mode injection message.

    Args:
        persona_name: The backseat agent's persona name
        observation_text: The observation summary text

    Returns:
        Formatted string: [Tandem] {persona_name}: {observation_text}
    """
    return f"[Tandem] {persona_name}: {observation_text}"


def get_tandem_mtime(project_root: Path, agent: str) -> float:
    """Read the last-checked mtime for a tandem agent's observation file.

    Args:
        project_root: Project root directory
        agent: Agent name (e.g. 'reviewer', 'tea')

    Returns:
        Last-checked mtime as float, or 0.0 if no sidecar exists
    """
    sidecar = project_root / ".session" / f".tandem-mtime-{agent}"
    if not sidecar.exists():
        return 0.0
    try:
        return float(sidecar.read_text().strip())
    except (ValueError, OSError):
        return 0.0


def save_tandem_mtime(project_root: Path, agent: str, mtime: float) -> None:
    """Save the mtime for a tandem agent's observation file.

    Writes to .session/.tandem-mtime-{agent} sidecar file.

    Args:
        project_root: Project root directory
        agent: Agent name (e.g. 'reviewer', 'tea')
        mtime: The mtime value to save
    """
    sidecar = project_root / ".session" / f".tandem-mtime-{agent}"
    try:
        sidecar.write_text(str(mtime))
    except OSError:
        pass


def check_tandem_files(project_root: Path) -> list[dict]:
    """Check for new tandem observations and return injection messages.

    Main entry point for tandem injection in the PostToolUse hook.
    Always active — no configuration required. The presence of tandem
    observation files in .session/ is the only signal needed.

    Args:
        project_root: Project root directory

    Returns:
        List of dicts with 'agent', 'message' keys for each new observation
    """
    tandem_files = read_tandem_observations(project_root)
    if not tandem_files:
        return []

    results = []
    for obs_file in tandem_files:
        # Extract agent name from filename: *-tandem-{agent}.md
        agent_match = re.search(r"-tandem-(\w+)\.md$", obs_file.name)
        if not agent_match:
            continue
        agent = agent_match.group(1)

        # Compare mtime
        try:
            file_mtime = obs_file.stat().st_mtime
        except OSError:
            continue
        saved_mtime = get_tandem_mtime(project_root, agent)
        if file_mtime == saved_mtime:
            continue

        # Read and parse
        try:
            content = obs_file.read_text()
        except OSError:
            continue
        obs = get_latest_observation(content)
        if not obs:
            # Update mtime even for unparseable files to avoid re-checking
            save_tandem_mtime(project_root, agent, file_mtime)
            continue

        message = format_tandem_message(obs["persona"], obs["text"])
        results.append({"agent": agent, "message": message})

        # Update mtime sidecar
        save_tandem_mtime(project_root, agent, file_mtime)

    return results


def main() -> None:
    """Main entry point for PostToolUse hook."""
    try:
        # Read and discard stdin (required by hook protocol)
        sys.stdin.read()

        # Find project root
        project_root = find_project_root()
        if not project_root:
            sys.exit(0)

        # --- Bell queue (Cyclist only, requires bell_mode: true) ---
        # Takes precedence over tandem when active.
        is_cyclist = read_port_file(CYCLIST_PORT_FILE, project_root) is not None
        if is_cyclist and is_bell_mode_enabled(project_root):
            queue = read_bell_queue(project_root)
            if queue:
                first_message = queue[0]
                message_text = first_message.get("text", "")
                if message_text:
                    output_hook_response(HookResponse(
                        event_name="PostToolUse",
                        additional_context=f"User feedback: {message_text}",
                    ))
                    dequeue_message(project_root)
                    notify_cyclist(project_root, message_text)
                    sys.exit(0)

        # --- Tandem observations (always active, no config required) ---
        tandem_results = check_tandem_files(project_root)
        if tandem_results:
            output_hook_response(HookResponse(
                event_name="PostToolUse",
                additional_context=tandem_results[0]["message"],
            ))

        sys.exit(0)

    except Exception as e:
        print(f"[bellmode-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
