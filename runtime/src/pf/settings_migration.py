"""Settings migration — apply legacy workflow config transforms.

Story 141-21: Python equivalent of migrateSettings() from
packages/core/src/server/settings.ts (lines 192-240).

Migration paths:
  1. permission_mode: 'turbo' -> permission_mode: 'accept' + relay_mode: true
  2. handoff_mode: 'auto' -> relay_mode: true
  3. handoff_mode: 'manual' -> relay_mode: false
  4. auto_handoff: true/false -> relay_mode: true/false
"""

from __future__ import annotations

import copy


def migrate_settings(raw: dict) -> dict:
    """Migrate legacy settings to current schema.

    Takes a parsed YAML dict and returns a new dict with legacy workflow
    keys transformed to the current format. Does not write to disk.

    Args:
        raw: Parsed config dict (e.g. from config.local.yaml)

    Returns:
        New dict with legacy keys migrated
    """
    result = copy.deepcopy(raw)

    workflow = result.get("workflow")
    if not isinstance(workflow, dict):
        return result

    # Track whether relay_mode was explicitly set
    has_explicit_relay = "relay_mode" in workflow and isinstance(
        workflow["relay_mode"], bool
    )

    # Handle permission_mode migration
    permission_mode = workflow.get("permission_mode")

    if permission_mode == "turbo":
        workflow["permission_mode"] = "accept"
        if not has_explicit_relay:
            workflow["relay_mode"] = True

    # Migrate relay_mode from legacy handoff settings (only if not explicitly set)
    if not has_explicit_relay and workflow.get("relay_mode") is not True:
        handoff_mode = workflow.get("handoff_mode")
        if handoff_mode == "auto":
            workflow["relay_mode"] = True
        elif handoff_mode == "manual":
            workflow["relay_mode"] = False
        elif "auto_handoff" in workflow:
            workflow["relay_mode"] = workflow["auto_handoff"] is True

    # Clean up legacy keys
    workflow.pop("handoff_mode", None)
    workflow.pop("auto_handoff", None)

    return result
