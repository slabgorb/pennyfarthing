"""
Session stop hook — save checkpoint for cross-session continuity.

Writes session state (agent, story, phase, git SHA, session ID) to
checkpoints.log so the next session can detect drift.

Replaces session-stop.sh + checkpoint.sh logic.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


def _checkpoint_save(project_dir: Path, label: str, data: str) -> None:
    """Save a checkpoint entry to checkpoints.log."""
    try:
        checkpoint_file = project_dir / ".session" / "checkpoints.log"
        checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(checkpoint_file, "a") as f:
            f.write(f"{timestamp}|{label}|{data}\n")
    except OSError:
        pass


def main() -> None:
    """Main entry point for session stop hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            input_data = {}

        session_id = input_data.get("session_id", "unknown")
        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        # Get current agent
        agent = ""
        agent_file = project_dir / ".session" / "agents" / session_id
        if agent_file.is_file():
            try:
                agent = agent_file.read_text().strip()
            except OSError:
                pass

        # Find active story from session files
        story = ""
        phase = ""
        session_dir = project_dir / ".session"
        if session_dir.is_dir():
            session_files = sorted(
                session_dir.glob("*-session.md"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            if session_files:
                session_file = session_files[0]
                # Extract story ID from filename (e.g., 8-3-session.md -> 8-3)
                story = re.sub(r"-session\.md$", "", session_file.name)
                # Extract phase from session file
                try:
                    content = session_file.read_text()
                    phase_match = re.search(
                        r"^- Phase:\s*(\S+)", content, re.MULTILINE | re.IGNORECASE
                    )
                    if phase_match:
                        phase = phase_match.group(1)
                except OSError:
                    pass

        # Get current git SHA
        git_sha = ""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                cwd=str(project_dir),
                timeout=5,
            )
            git_sha = result.stdout.strip()
        except (subprocess.TimeoutExpired, OSError):
            pass

        # Build and save checkpoint
        checkpoint_data = (
            f"agent={agent};story={story};phase={phase};sha={git_sha};session={session_id}"
        )
        _checkpoint_save(project_dir, "session_state", checkpoint_data)

        # Log session end
        try:
            timestamp = datetime.now(UTC).isoformat()
            log_file = session_dir / "session-log.txt"
            with open(log_file, "a") as f:
                f.write(f"{timestamp} | Session end: {session_id} (agent={agent}, story={story})\n")
        except OSError:
            pass

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
