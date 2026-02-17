"""AuditLogPanel — Real-time tool event audit log for BikeRack TUI.

Story 110-8: Subscribes to /ws/spans, displays tool events in a native
Textual DataTable with timestamp, tool name, input excerpt, and result.

Uses native Textual widgets (DataTable) instead of Rich renderables.
"""

from __future__ import annotations

from typing import Any

from textual.widgets import DataTable, Static

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS


class AuditLogPanel(Static):
    """Audit log panel — stub for TDD RED phase.

    Will be implemented to use native Textual DataTable widget
    for displaying tool events from the /ws/spans WebSocket channel.
    """

    channel: str = ""
    panel_name: str = ""
    icon: str = ""

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
