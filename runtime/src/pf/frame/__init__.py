"""Frame server — FastAPI application server for Pennyfarthing.

Replaces Frame as the primary server package name.
"""

from pf.frame.app import broadcast, create_app
from pf.frame.launcher import (
    build_otel_env,
    exec_claude,
    find_free_port,
    is_already_running,
    poll_for_port_file,
    register_cleanup,
    resolve_project_dir,
    start_frame,
    stop_frame,
    write_pid_file,
)

__all__ = [
    "broadcast",
    "build_otel_env",
    "create_app",
    "exec_claude",
    "find_free_port",
    "is_already_running",
    "poll_for_port_file",
    "register_cleanup",
    "resolve_project_dir",
    "start_frame",
    "stop_frame",
    "write_pid_file",
]
