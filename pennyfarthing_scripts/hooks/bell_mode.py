"""
PostToolUse Hook — Bell Mode + Tandem Injection.

Called by Claude Code after each tool execution. Handles two independent
injection systems:

1. Bell queue (Cyclist only) — injects queued user messages when Cyclist
   is running and bell_mode is enabled. In CLI sessions this is a no-op.
2. Tandem observations (always active) — injects backseat agent observations
   when tandem observation files exist. No configuration required.

Bell queue takes precedence: if a queued message exists, tandem is
deferred to the next hook invocation.

Consolidates bellmode_hook.py into the hooks subpackage.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pennyfarthing_scripts.hooks import (
    CYCLIST_PORT_FILE,
    HookResponse,
    find_project_root,
    is_bell_mode_enabled,
    output_hook_response,
    read_port_file,
    send_to_cyclist,
)

# =============================================================================
# Bell Queue
# =============================================================================


def _read_bell_queue(project_root: Path) -> list[dict]:
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


def _dequeue_message(project_root: Path) -> None:
    queue_path = project_root / ".pennyfarthing" / "bell-queue.json"
    if not queue_path.exists():
        return
    try:
        with open(queue_path) as f:
            queue = json.load(f)
        if isinstance(queue, list) and len(queue) > 0:
            queue = queue[1:]
            with open(queue_path, "w") as f:
                json.dump(queue, f)
    except (json.JSONDecodeError, OSError):
        pass


def _notify_cyclist(project_root: Path, message_text: str) -> None:
    try:
        send_to_cyclist(
            endpoint="/api/bell-consumed",
            data={"text": message_text},
            project_root=project_root,
            timeout=5,
        )
    except Exception:
        pass


# =============================================================================
# Tandem Observations
# =============================================================================


def _read_tandem_observations(project_root: Path) -> list[Path]:
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return []
    return sorted(session_dir.glob("*-tandem-*.md"))


def _get_latest_observation(file_content: str) -> dict | None:
    persona_match = re.search(r"\*\*Observer:\*\*\s*\w+\s*\(([^)]+)\)", file_content)
    persona = persona_match.group(1) if persona_match else "Unknown"

    entries = re.split(r"## \[\d{1,2}:\d{2}\] Observation\n", file_content)
    if len(entries) < 2:
        return None

    last_entry = entries[-1].strip()
    last_entry = re.sub(r"\n---\s*$", "", last_entry).strip()
    lines = last_entry.split("\n")
    text_lines = [line for line in lines if not line.startswith("**Trigger:**")]
    text = "\n".join(text_lines).strip()

    if not text:
        return None

    return {"persona": persona, "text": text}


def _get_tandem_mtime(project_root: Path, agent: str) -> float:
    sidecar = project_root / ".session" / f".tandem-mtime-{agent}"
    if not sidecar.exists():
        return 0.0
    try:
        return float(sidecar.read_text().strip())
    except (ValueError, OSError):
        return 0.0


def _save_tandem_mtime(project_root: Path, agent: str, mtime: float) -> None:
    sidecar = project_root / ".session" / f".tandem-mtime-{agent}"
    try:
        sidecar.write_text(str(mtime))
    except OSError:
        pass


def _check_tandem_files(project_root: Path) -> list[dict]:
    tandem_files = _read_tandem_observations(project_root)
    if not tandem_files:
        return []

    results = []
    for obs_file in tandem_files:
        agent_match = re.search(r"-tandem-(\w+)\.md$", obs_file.name)
        if not agent_match:
            continue
        agent = agent_match.group(1)

        try:
            file_mtime = obs_file.stat().st_mtime
        except OSError:
            continue
        saved_mtime = _get_tandem_mtime(project_root, agent)
        if file_mtime == saved_mtime:
            continue

        try:
            content = obs_file.read_text()
        except OSError:
            continue
        obs = _get_latest_observation(content)
        if not obs:
            _save_tandem_mtime(project_root, agent, file_mtime)
            continue

        message = f"[Tandem] {obs['persona']}: {obs['text']}"
        results.append({"agent": agent, "message": message})
        _save_tandem_mtime(project_root, agent, file_mtime)

    return results


# =============================================================================
# Entry Point
# =============================================================================


def main() -> None:
    """Main entry point for PostToolUse hook."""
    try:
        # Read and discard stdin (required by hook protocol)
        sys.stdin.read()

        project_root = find_project_root()
        if not project_root:
            sys.exit(0)

        # --- Bell queue (Cyclist only, requires bell_mode: true) ---
        is_cyclist = read_port_file(CYCLIST_PORT_FILE, project_root) is not None
        if is_cyclist and is_bell_mode_enabled(project_root):
            queue = _read_bell_queue(project_root)
            if queue:
                first_message = queue[0]
                message_text = first_message.get("text", "")
                if message_text:
                    output_hook_response(HookResponse(
                        event_name="PostToolUse",
                        additional_context=f"User feedback: {message_text}",
                    ))
                    _dequeue_message(project_root)
                    _notify_cyclist(project_root, message_text)
                    sys.exit(0)

        # --- Tandem observations (always active) ---
        tandem_results = _check_tandem_files(project_root)
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
