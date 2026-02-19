"""
Backward-compatibility shim — hooks utilities moved to hooks/ subpackage.

All exports are re-imported from pf.hooks (the package).
Existing code that does `from hooks import ...` or
`from pf.hooks import ...` continues to work.

This file will be removed in a future version.
"""

# Re-export everything from the hooks package
from pf.hooks import (  # noqa: F401
    CYCLIST_PORT_FILE,
    DEFAULT_CYCLIST_PORT,
    HTTP_TIMEOUT_SECONDS,
    ContextState,
    CyclistSettings,
    HookResponse,
    find_project_root,
    get_context_state,
    get_cyclist_port,
    is_bell_mode_enabled,
    is_cyclist_running,
    is_relay_mode_enabled,
    load_settings,
    output_hook_response,
    read_port_file,
    read_stdin_json,
    send_to_cyclist,
    should_auto_approve,
    should_auto_handoff,
)
