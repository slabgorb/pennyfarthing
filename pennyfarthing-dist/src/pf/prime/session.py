"""
Session registration for Prime v2.

Manages agent session files in .session/agents/ for multi-session support.
"""

from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

from pf.common.config import get_project_root
from pf.prime.models import SessionInfo


def get_agents_dir(project_root: Path) -> Path:
    """Get the agents session directory.

    Args:
        project_root: Project root path

    Returns:
        Path to .session/agents/
    """
    return project_root / ".session" / "agents"


def _purge_stale_agents(agents_dir: Path, max_age_seconds: int = 3600) -> int:
    """Remove agent files older than max_age_seconds.

    Called on every register_session to keep the directory clean and prevent
    stale files from polluting mtime-based agent resolution.
    """
    if not agents_dir.is_dir():
        return 0
    cutoff = time.time() - max_age_seconds
    removed = 0
    for f in agents_dir.iterdir():
        if f.is_file():
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    removed += 1
            except OSError:
                pass
    return removed


def register_session(
    agent_name: str,
    session_id: str | None = None,
    project_root: Path | None = None,
) -> SessionInfo:
    """Register an agent session.

    Creates a session file in .session/agents/{session_id} containing
    the agent name. If no session_id is provided, generates a new UUID.

    Args:
        agent_name: Name of the agent to register
        session_id: Optional session ID (generated if not provided)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        SessionInfo with session details
    """
    root = project_root or get_project_root()
    agents_dir = get_agents_dir(root)

    # Create agents directory if needed
    agents_dir.mkdir(parents=True, exist_ok=True)

    # Purge stale agent files (older than 1 hour) to prevent mtime pollution
    _purge_stale_agents(agents_dir, max_age_seconds=3600)

    # Generate session ID if not provided
    if not session_id:
        # Check SESSION_ID environment variable first
        session_id = os.environ.get("SESSION_ID")
        if not session_id:
            session_id = str(uuid.uuid4())

    # Write agent file
    session_file = agents_dir / session_id
    session_file.write_text(agent_name)

    return SessionInfo(
        session_id=session_id,
        agent_name=agent_name,
        file_path=str(session_file),
    )


def cleanup_old_sessions(project_root: Path | None = None, max_age_days: int = 7) -> int:
    """Remove stale session files.

    Deletes session files older than max_age_days.

    Args:
        project_root: Project root path (auto-detected if not provided)
        max_age_days: Maximum age in days before cleanup

    Returns:
        Number of files removed
    """
    root = project_root or get_project_root()
    agents_dir = get_agents_dir(root)

    if not agents_dir.is_dir():
        return 0

    cutoff = time.time() - (max_age_days * 86400)
    removed = 0

    for session_file in agents_dir.iterdir():
        if session_file.is_file():
            try:
                if session_file.stat().st_mtime < cutoff:
                    session_file.unlink()
                    removed += 1
            except OSError:
                pass

    return removed


def get_session_agent(
    session_id: str,
    project_root: Path | None = None,
) -> str | None:
    """Get the agent name for a session.

    Args:
        session_id: Session ID to look up
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Agent name, or None if session not found
    """
    root = project_root or get_project_root()
    session_file = get_agents_dir(root) / session_id

    if not session_file.is_file():
        return None

    return session_file.read_text().strip()


def unregister_session(
    session_id: str,
    project_root: Path | None = None,
) -> bool:
    """Unregister an agent session.

    Removes the session file.

    Args:
        session_id: Session ID to unregister
        project_root: Project root path (auto-detected if not provided)

    Returns:
        True if session was removed, False if not found
    """
    root = project_root or get_project_root()
    session_file = get_agents_dir(root) / session_id

    if not session_file.is_file():
        return False

    try:
        session_file.unlink()
        return True
    except OSError:
        return False


def list_sessions(project_root: Path | None = None) -> list[SessionInfo]:
    """List all active sessions.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        List of SessionInfo for all active sessions
    """
    root = project_root or get_project_root()
    agents_dir = get_agents_dir(root)

    if not agents_dir.is_dir():
        return []

    sessions = []
    for session_file in agents_dir.iterdir():
        if session_file.is_file():
            try:
                agent_name = session_file.read_text().strip()
                sessions.append(SessionInfo(
                    session_id=session_file.name,
                    agent_name=agent_name,
                    file_path=str(session_file),
                ))
            except OSError:
                pass

    return sessions
