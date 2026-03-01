"""
PreCompact hook — save context checkpoint before compaction.

Fires before Claude Code compresses the conversation. Writes a
compaction marker to the session file and checkpoints.log so the
agent can detect post-compaction state on resume.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path


def _write_compaction_checkpoint(project_dir: Path, session_id: str) -> None:
    """Write a pre_compact checkpoint entry."""
    try:
        checkpoint_file = project_dir / ".session" / "checkpoints.log"
        checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(checkpoint_file, "a") as f:
            f.write(f"{timestamp}|pre_compact|session={session_id}\n")
    except OSError:
        pass


def _save_session_snapshot(project_dir: Path) -> None:
    """Save key session state before compaction wipes context."""
    session_dir = project_dir / ".session"
    if not session_dir.is_dir():
        return

    session_files = sorted(
        session_dir.glob("*-session.md"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    if not session_files:
        return

    session_file = session_files[0]
    try:
        content = session_file.read_text()
    except OSError:
        return

    # Extract key fields
    story = re.sub(r"-session\.md$", "", session_file.name)
    phase = ""
    agent = ""
    phase_match = re.search(r"^- Phase:\s*(\S+)", content, re.MULTILINE | re.IGNORECASE)
    if phase_match:
        phase = phase_match.group(1)
    agent_match = re.search(r"^- Agent:\s*(\S+)", content, re.MULTILINE | re.IGNORECASE)
    if agent_match:
        agent = agent_match.group(1)

    # Write snapshot
    snapshot_file = session_dir / "pre-compact-snapshot.json"
    snapshot = {
        "story": story,
        "phase": phase,
        "agent": agent,
        "session_file": session_file.name,
        "saved_at": datetime.now(UTC).isoformat(),
    }
    try:
        snapshot_file.write_text(json.dumps(snapshot, indent=2) + "\n")
    except OSError:
        pass


def main() -> None:
    """Main entry point for PreCompact hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            input_data = {}

        session_id = input_data.get("session_id", "unknown")
        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        _write_compaction_checkpoint(project_dir, session_id)
        _save_session_snapshot(project_dir)

    except Exception:
        pass  # Fail open

    sys.exit(0)


if __name__ == "__main__":
    main()
