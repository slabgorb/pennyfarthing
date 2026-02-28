"""BikeRack TUI — Terminal-native dashboard built on Textual.

Story 103-1: Textual app scaffold with basic layout.
Story 103-4: Connection status indicator in TUI header.
Story 103-6: SprintPanel as default panel on launch.
Story 103-7: /bc TUI panel focus — subscribe to /ws/focus, switch panels.
Story 103-9: Panel header chrome — icon + name indicator for active panel.
Panel navigation: Mount all panels, tab bar, keyboard switching, command palette.
"""

from __future__ import annotations

import os
from functools import partial
from pathlib import Path
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.command import Hit, Hits, Provider
from textual.containers import Horizontal, VerticalScroll
from textual.message import Message
from textual.reactive import reactive
from textual.widgets import Header, Static, Tab, Tabs

from pf.bc.focus import get_last_panel, save_last_panel
from pf.bikerack import layout_order as _layout_order
from pf.bikerack.audit_log_panel import AuditLogPanel
from pf.bikerack.base_panel import get_panel_icon
from pf.bikerack.context_meter_footer import StatusFooter
from pf.bikerack.debug_panel import DebugPanel
from pf.bikerack.diffs_panel import DiffsPanel
from pf.bikerack.git_panel import GitPanel
from pf.bikerack.progress_panel import ProgressPanel
from pf.bikerack.settings_panel import SettingsPanel
from pf.bikerack.sprint_panel import SprintPanel
from pf.bikerack.ws_client import ConnectionState, WheelHubClient

STATE_DISPLAY: dict[ConnectionState, str] = {
    ConnectionState.CONNECTED: "[green]● Connected[/green]",
    ConnectionState.DISCONNECTED: "[red]● Disconnected[/red]",
    ConnectionState.RECONNECTING: "[yellow]● Reconnecting…[/yellow]",
    ConnectionState.CONNECTING: "[yellow]● Connecting…[/yellow]",
}

# Agent role colors for Rich markup (mapped from React AGENT_COLORS)
AGENT_ROLE_COLORS: dict[str, str] = {
    "pm": "purple",
    "sm": "blue",
    "dev": "green",
    "tea": "cyan",
    "reviewer": "red",
    "architect": "dark_orange",
    "devops": "bright_cyan",
    "ux-designer": "magenta",
    "tech-writer": "white",
    "orchestrator": "bright_magenta",
    "ba": "bright_green",
}

AGENT_ABBREV: dict[str, str] = {
    "pm": "PM",
    "sm": "SM",
    "dev": "DEV",
    "tea": "TEA",
    "reviewer": "REV",
    "architect": "ARC",
    "devops": "OPS",
    "ux-designer": "UX",
    "tech-writer": "TW",
    "orchestrator": "ORC",
    "ba": "BA",
}

# Ordered panel registry: (key, display_name, widget_class)
# Only panels with implemented widget classes are included.
PANEL_REGISTRY: list[tuple[str, str]] = [
    ("sprint", "Sprint"),
    ("git", "Git"),
    ("diffs", "Diffs"),
    ("audit-log", "Audit Log"),
    ("debug", "Debug"),
    ("progress", "Progress"),
    ("settings", "Settings"),
]

# Human-readable display names for panels (full set for external focus messages)
PANEL_DISPLAY_NAMES: dict[str, str] = {
    "sprint": "Sprint",
    "git": "Git",
    "diffs": "Diffs",
    "todo": "Todo",
    "workflow": "Workflow",
    "audit-log": "Audit Log",
    "ac": "Acceptance Criteria",
    "debug": "Debug",
    "progress": "Progress",
    "settings": "Settings",
    "tty": "TTY",
}

# Keys from PANEL_REGISTRY for fast lookup
_PANEL_KEYS = [key for key, _ in PANEL_REGISTRY]

# Split-pane layout presets: name → (left_panel, right_panel)
# Story 110-4: Named presets for common side-by-side views.
SPLIT_PRESETS: dict[str, tuple[str, str]] = {
    "sprint+diffs": ("sprint", "diffs"),
    "git+diffs": ("git", "diffs"),
    "progress+debug": ("progress", "debug"),
}


def _build_panel_tabs() -> list[Tab]:
    """Build Tab widgets for each panel in the registry."""
    tabs: list[Tab] = []
    for panel_key, display_name in PANEL_REGISTRY:
        icon = get_panel_icon(panel_key)
        label = f"{icon} {display_name}" if icon else display_name
        tabs.append(Tab(label, id=f"tab-{panel_key}"))
    return tabs


# Portrait size configuration: setting → (image_preference, width, height, row_height)
PORTRAIT_SIZE_CONFIG: dict[str, tuple[str, int, int, int]] = {
    "large": ("large", 20, 10, 10),
    "medium": ("medium", 10, 5, 5),
    "small": ("small", 6, 3, 3),
}

PORTRAIT_SKELETON = """\
[dim]┌────────┐
│░░░░░░░░│
│░░░▓▓░░░│
│░░░░░░░░│
└────────┘[/dim]"""


class AgentHeader(Static):
    """Displays current agent persona from WheelHub /ws/persona channel.

    When a portrait image is available (resolved locally or provided via
    portraitPath in persona data), mounts a Horizontal layout container.
    Shows a skeleton placeholder while the image loads.
    Falls back to text-only when no portrait is found.
    """

    class PortraitLayoutUpdate(Message):
        """Internal message to update portrait layout asynchronously."""

        def __init__(self, portrait_path: Path | None) -> None:
            super().__init__()
            self.has_portrait = portrait_path is not None
            self.portrait_path = portrait_path

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._is_streaming: bool = False
        self._persona_data: dict[str, Any] = {}
        self._header_text: str = ""
        self._current_portrait: Path | None = None

        # Read portrait_size setting from config
        from pf.common.config import load_pennyfarthing_config

        try:
            config = load_pennyfarthing_config()
        except Exception:
            config = {}
        self._portrait_size: str = config.get("portrait_size", "auto")
        self._portrait_position: str = config.get("portrait_position", "left")
        self._last_effective_size: str | None = None

    def on_resize(self) -> None:
        """Re-evaluate portrait size on terminal resize (auto mode only)."""
        if self._portrait_size != "auto":
            return
        effective = self._resolve_effective_size()
        if effective != self._last_effective_size and self._persona_data:
            self._current_portrait = None  # force full layout rebuild
            self._render_header()

    # Cycle order for portrait size stepping
    _SIZE_CYCLE = ["small", "medium", "large"]

    def _cycle_portrait_size(self) -> str:
        """Step through portrait sizes: small → medium → large → small."""
        try:
            idx = self._SIZE_CYCLE.index(self._portrait_size)
        except ValueError:
            # auto or off — resolve effective then step from there
            effective = self._resolve_effective_size()
            try:
                idx = self._SIZE_CYCLE.index(effective)
            except ValueError:
                idx = -1
        new_idx = (idx + 1) % len(self._SIZE_CYCLE)
        self._portrait_size = self._SIZE_CYCLE[new_idx]
        self._last_effective_size = None
        self._current_portrait = None  # force full layout rebuild
        self._render_header()
        # Persist to config.local.yaml
        try:
            from pf.bc.focus import _read_config, _write_config

            config_path, config = _read_config()
            config["portrait_size"] = self._portrait_size
            _write_config(config_path, config)
        except Exception:
            pass
        return self._portrait_size

    def _toggle_portrait_position(self) -> None:
        """Flip portrait between left and right, persist to config."""
        self._portrait_position = "right" if self._portrait_position == "left" else "left"
        self._current_portrait = None  # force full layout rebuild
        self._render_header()
        # Persist to config.local.yaml
        try:
            from pf.bc.focus import _read_config, _write_config

            config_path, config = _read_config()
            config["portrait_position"] = self._portrait_position
            _write_config(config_path, config)
        except Exception:
            pass

    def _apply_persona(self, data: dict[str, Any]) -> None:
        """Render persona data into the header."""
        if data.get("type") == "streaming":
            self._is_streaming = bool(data.get("isStreaming", False))
            self._render_header()
            return

        self._persona_data = data
        self._is_streaming = bool(data.get("isStreaming", False))
        self._render_header()

    def _resolve_effective_size(self) -> str:
        """Resolve the effective portrait size.

        For ``auto``, maps terminal row count to a size bucket.
        For explicit values, returns as-is.
        Updates ``_last_effective_size`` so resize can detect changes.
        """
        setting = self._portrait_size
        if setting != "auto":
            self._last_effective_size = setting
            return setting
        try:
            rows = os.get_terminal_size().lines
        except OSError:
            effective = "medium"
        else:
            if rows >= 40:
                effective = "large"
            elif rows >= 25:
                effective = "medium"
            elif rows >= 15:
                effective = "small"
            else:
                effective = "off"
        self._last_effective_size = effective
        return effective

    def _resolve_portrait(self, data: dict[str, Any]) -> Path | None:
        """Get portrait path from persona data or resolve locally."""
        effective = self._resolve_effective_size()
        if effective == "off":
            return None
        portrait_path = data.get("portraitPath")
        if portrait_path:
            p = Path(portrait_path)
            if p.exists():
                return p
        theme = data.get("theme", "")
        role = data.get("role", "")
        if theme and role:
            from pf.bikerack import portrait_resolver

            preferred = PORTRAIT_SIZE_CONFIG.get(effective, (effective,))[0]
            return portrait_resolver.resolve_portrait_path(
                theme, role, preferred_size=preferred
            )
        return None

    def _render_header(self) -> None:
        """Re-render the header from stored state."""
        data = self._persona_data
        char = data.get("character", "")
        role = data.get("role", "")
        role_desc = data.get("roleDescription", "")
        quote = data.get("quote", "")
        theme = data.get("theme", "")

        if not char:
            self.update("[dim]Waiting for agent...[/dim]")
            self.post_message(self.PortraitLayoutUpdate(portrait_path=None))
            return

        parts: list[str] = []

        # Role badge — escape brackets so Rich doesn't eat them as tags
        if role:
            abbrev = AGENT_ABBREV.get(role, role.upper()[:3])
            color = AGENT_ROLE_COLORS.get(role, "bright_magenta")
            parts.append(f"[bold {color}]\\[{abbrev}][/bold {color}]")

        # Character name
        parts.append(f"[bold]{char}[/bold]")

        # Theme name
        if theme:
            from pf.bikerack.base_panel import humanize_theme

            parts.append(f"[dim]{humanize_theme(theme)}[/dim]")

        # Streaming indicator
        if self._is_streaming:
            parts.append("[bold yellow]⚡[/bold yellow]")

        line = "  ".join(parts)

        # Catchphrase subtitle
        if quote:
            line += f"\n[italic dim]\"{quote}\"[/italic dim]"
        elif role_desc:
            line += f"\n[dim]{role_desc}[/dim]"

        self._header_text = line

        # Always attempt portrait
        portrait = self._resolve_portrait(data)
        self.post_message(self.PortraitLayoutUpdate(portrait_path=portrait))

    async def on_agent_header_portrait_layout_update(
        self, event: PortraitLayoutUpdate
    ) -> None:
        """Mount or remove Horizontal portrait layout with text beside image.

        Shows a skeleton placeholder immediately while the real image loads
        to avoid a visible blank gap during image decode/render.
        """
        if event.has_portrait and event.portrait_path:
            if self._current_portrait == event.portrait_path:
                # Same portrait — just update text label if it exists
                try:
                    text_widget = self.query_one("#agent-text", Static)
                    text_widget.update(self._header_text)
                except Exception:
                    pass
                return

            # New portrait or first time — full layout rebuild
            for child in list(self.query("Horizontal")):
                await child.remove()

            # Mount skeleton + text immediately so there's no blank gap
            self.update("")
            self._current_portrait = event.portrait_path
            skeleton = Static(PORTRAIT_SKELETON, id="portrait-skeleton")
            text = Static(self._header_text, id="agent-text")
            if self._portrait_position == "right":
                row = Horizontal(text, skeleton, id="portrait-row")
            else:
                row = Horizontal(skeleton, text, id="portrait-row")
            await self.mount(row)

            # Now try to load the real image and swap it in
            try:
                from pf.bikerack.portrait_resolver import (
                    detect_image_protocol,
                )

                protocol = detect_image_protocol()
                if protocol is None:
                    # No image protocol — remove skeleton, fall back to text-only
                    self._current_portrait = None
                    for child in list(self.query("Horizontal")):
                        await child.remove()
                    self.update(self._header_text)
                    return

                if protocol == "kitty":
                    from textual_image.widget import TGPImage as ImageWidget
                elif protocol == "sixel":
                    from textual_image.widget import SixelImage as ImageWidget
                else:
                    from textual_image.widget import HalfcellImage as ImageWidget

                img = ImageWidget(str(event.portrait_path), id="portrait-img")
                try:
                    skel = self.query_one("#portrait-skeleton")
                    await skel.remove()
                except Exception:
                    pass
                if self._portrait_position == "right":
                    await row.mount(img)  # append after text
                    img.styles.margin = (0, 0, 0, 1)
                else:
                    await row.mount(img, before=0)
                    # CSS default margin (0 1 0 0) handles left position

                # Apply dynamic size from portrait_size config
                effective = self._resolve_effective_size()
                size_cfg = PORTRAIT_SIZE_CONFIG.get(effective)
                if size_cfg:
                    _, w, h, rh = size_cfg
                    img.styles.width = w
                    img.styles.height = h
                    row.styles.height = rh
            except (ImportError, Exception):
                # Image mount failed — reset cache so next update retries
                self._current_portrait = None
                for child in list(self.query("Horizontal")):
                    await child.remove()
                self.update(self._header_text)
        else:
            # No portrait — text-only
            for child in list(self.query("Horizontal")):
                await child.remove()
            self._current_portrait = None
            self.update(self._header_text)


class ConnectionStatus(Static):
    """Displays WheelHub connection state with colored indicator."""

    connection_state: reactive[ConnectionState] = reactive(
        ConnectionState.DISCONNECTED
    )

    def watch_connection_state(self, state: ConnectionState) -> None:
        """Update display when connection state changes."""
        self.update(STATE_DISPLAY.get(state, "● Unknown"))


class PanelCommands(Provider):
    """Command palette provider for panel switching."""

    async def search(self, query: str) -> Hits:
        matcher = self.matcher(query)
        for panel_key, display_name in PANEL_REGISTRY:
            icon = get_panel_icon(panel_key)
            label = f"{icon} {display_name}" if icon else display_name
            score = matcher.match(display_name)
            if score > 0:
                yield Hit(
                    score,
                    matcher.highlight(label),
                    partial(self.app.action_switch_panel, panel_key),
                    help=f"Switch to {display_name} panel",
                )


class BikeRackApp(App):
    """BikeRack TUI application shell."""

    class PersonaUpdate(Message, bubble=False):
        """Persona data from WS — routed through Textual message system."""

        def __init__(self, data: dict[str, Any]) -> None:
            super().__init__()
            self.data = data

    class FocusUpdate(Message, bubble=False):
        """Focus change from WS — routed through Textual message system."""

        def __init__(self, focus: str | None, split_config: dict | None = None) -> None:
            super().__init__()
            self.focus = focus
            self.split_config = split_config

    class WsStateUpdate(Message, bubble=False):
        """WS connection state change — routed through Textual message system."""

        def __init__(self, state: ConnectionState) -> None:
            super().__init__()
            self.state = state

    TITLE = "BikeRack"

    CSS = """
    #agent-header {
        height: auto;
        max-height: 12;
        padding: 0 1;
        border-bottom: solid $accent;
    }
    #portrait-row {
        height: 5;
        width: 100%;
    }
    #portrait-img {
        width: 10;
        height: 5;
        margin: 0 1 0 0;
    }
    #agent-text {
        height: auto;
        width: 1fr;
    }
    Tabs {
        dock: top;
    }
    Tab.-active {
        color: $text;
    }
    Tab {
        color: $text-muted;
    }
    #connection-status {
        height: 1;
    }
    StatusFooter {
        height: 1;
        dock: bottom;
    }
    #split-container {
        display: none;
        height: 1fr;
    }
    #split-left {
        width: 1fr;
    }
    #split-right {
        width: 1fr;
    }
    """

    COMMANDS = App.COMMANDS | {PanelCommands}

    BINDINGS = [
        Binding("q", "quit", "Quit", show=False),
        Binding("p", "toggle_portrait_position", "Portrait", show=False),
        Binding("P", "cycle_portrait_size", "Portrait Size", show=False),
        Binding("S", "toggle_split", "Split", show=False),
        Binding("1", "switch_panel('sprint')", "Sprint", show=False),
        Binding("2", "switch_panel('git')", "Git", show=False),
        Binding("3", "switch_panel('diffs')", "Diffs", show=False),
        Binding("4", "switch_panel('audit-log')", "Audit Log", show=False),
        Binding("5", "switch_panel('debug')", "Debug", show=False),
        Binding("6", "switch_panel('progress')", "Progress", show=False),
        Binding("bracketright", "next_panel", "Next panel", show=False),
        Binding("bracketleft", "prev_panel", "Prev panel", show=False),
        Binding("tab", "next_panel", show=False, priority=True),
        Binding("shift+tab", "prev_panel", show=False, priority=True),
        Binding("j", "nav_down", show=False),
        Binding("down", "nav_down", show=False),
        Binding("k", "nav_up", show=False),
        Binding("up", "nav_up", show=False),
        Binding("h", "nav_left", show=False),
        Binding("left", "nav_left", show=False),
        Binding("l", "nav_right", show=False),
        Binding("right", "nav_right", show=False),
        Binding("e", "toggle_epic", show=False),
        Binding("c", "copy_selected_id", show=False),
        # Story 121-2: Code quality tool triggers (debug panel)
        Binding("d", "debug_deadcode", "Dead Code", show=False),
        Binding("s", "debug_healthscore", "Health Score", show=False),
        Binding("escape", "debug_back", "Back", show=False),
        Binding("t", "toggle_toasts", "Toasts", show=False),
    ]

    def _get_dom_base(self):
        """Query the active screen so app.query() finds pushed screen widgets."""
        return self.screen

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
        self._focused_panel: str = "sprint"
        self._previous_panel: str | None = None
        self._programmatic_tab_count: int = 0
        self._status_footer: StatusFooter | None = None
        # Split-pane state (Story 110-4)
        self._split_mode: bool = False
        self._active_split_pane: str = "left"
        self._split_left_key: str = "sprint"
        self._split_right_key: str = "diffs"
        try:
            from pf.settings.settings import get_setting
            self._toasts_enabled: bool = bool(get_setting("tui.toasts"))
        except Exception:
            self._toasts_enabled: bool = False

    def _build_layout_regions(self) -> list[str]:
        """Return the ordered list of region names to render.

        Reads layout_order from config.local.yaml via the layout_order module.
        """
        from pf.common.config import load_pennyfarthing_config

        try:
            config = load_pennyfarthing_config()
        except Exception:
            config = {}
        return _layout_order.get_layout_order(config)

    def compose(self) -> ComposeResult:
        project_dir_name = Path(
            os.environ.get("CYCLIST_PROJECT_DIR", os.getcwd())
        ).name
        self._status_footer = StatusFooter(
            project_dir=project_dir_name,
            client=self._client,
        )

        for region in self._build_layout_regions():
            if region == "menu":
                yield Header()
            elif region == "profile":
                yield AgentHeader(id="agent-header")
                yield Tabs(*_build_panel_tabs(), id="tab-bar")
                yield ConnectionStatus(
                    STATE_DISPLAY[ConnectionState.DISCONNECTED],
                    id="connection-status",
                )
            elif region == "content":
                with VerticalScroll(id="main-content"):
                    yield SprintPanel(client=self._client, id="panel-sprint")
                    yield GitPanel(client=self._client, id="panel-git")
                    yield DiffsPanel(client=self._client, id="panel-diffs")
                    yield AuditLogPanel(client=self._client, id="panel-audit-log")
                    yield DebugPanel(client=self._client, id="panel-debug")
                    yield ProgressPanel(client=self._client, id="panel-progress")
                    yield SettingsPanel(id="panel-settings")
                with Horizontal(id="split-container"):
                    yield VerticalScroll(id="split-left")
                    yield VerticalScroll(id="split-right")
            elif region == "status":
                yield self._status_footer

    async def on_mount(self) -> None:
        # Restore last panel or default to sprint
        result = get_last_panel()
        initial = "sprint"
        if result.get("success") and result.get("last_panel"):
            last = result["last_panel"]
            if last in _PANEL_KEYS:
                initial = last

        self._focused_panel = initial

        # Hide all panels except the active one
        for panel_key in _PANEL_KEYS:
            widget_id = f"panel-{panel_key}"
            try:
                widget = self.query_one(f"#{widget_id}")
                widget.display = (panel_key == initial)
            except Exception:
                pass

        # Set tab bar active state and focus initial panel
        self._update_tab_bar(initial)
        try:
            initial_widget = self.query_one(f"#panel-{initial}")
            initial_widget.focus()
        except Exception:
            pass

        if self._client is not None:
            self._client.on_state_change(self._on_ws_state_change)
            self._client.subscribe("focus", self._handle_focus_message)
            self._client.subscribe("persona", self._handle_persona_message)
            self.run_worker(self._client.connect(), exclusive=True, name="ws-client")

    def _toast(self, message: str, timeout: float = 2) -> None:
        """Show a toast notification if toasts are enabled."""
        if self._toasts_enabled:
            self.notify(message, timeout=timeout)

    def action_toggle_toasts(self) -> None:
        """Toggle toast notifications on/off."""
        self._toasts_enabled = not self._toasts_enabled
        try:
            from pf.settings.settings import set_setting_typed
            set_setting_typed("tui.toasts", self._toasts_enabled)
        except Exception:
            pass
        # Always show this one so user knows the state
        self.notify(
            f"Toasts {'on' if self._toasts_enabled else 'off'}",
            timeout=2,
        )

    def action_switch_panel(self, key: str) -> None:
        """Switch to a panel by key."""
        if key not in _PANEL_KEYS:
            return
        if key == self._focused_panel:
            return

        # Hide current panel
        try:
            current = self.query_one(f"#panel-{self._focused_panel}")
            current.display = False
        except Exception:
            pass

        # Show target panel and focus it
        try:
            target = self.query_one(f"#panel-{key}")
            target.display = True
            target.focus()
        except Exception:
            pass

        self._previous_panel = self._focused_panel
        self._focused_panel = key
        save_last_panel(key, project_dir=None)
        self._update_tab_bar(key)
        display = PANEL_DISPLAY_NAMES.get(key, key)
        self._toast(f"Panel: {display}")

        # Refresh status footer on panel switch
        if self._status_footer is not None:
            self._status_footer.request_refresh()

    def action_next_panel(self) -> None:
        """Cycle to the next panel, or toggle pane focus in split mode."""
        if self._split_mode:
            # In split mode, Tab toggles between left and right pane
            if self._active_split_pane == "left":
                self._active_split_pane = "right"
                try:
                    self.query_one("#split-right").focus()
                except Exception:
                    pass
            else:
                self._active_split_pane = "left"
                try:
                    self.query_one("#split-left").focus()
                except Exception:
                    pass
            return
        try:
            idx = _PANEL_KEYS.index(self._focused_panel)
        except ValueError:
            idx = 0
        next_idx = (idx + 1) % len(_PANEL_KEYS)
        self.action_switch_panel(_PANEL_KEYS[next_idx])

    def action_prev_panel(self) -> None:
        """Cycle to the previous panel."""
        try:
            idx = _PANEL_KEYS.index(self._focused_panel)
        except ValueError:
            idx = 0
        prev_idx = (idx - 1) % len(_PANEL_KEYS)
        self.action_switch_panel(_PANEL_KEYS[prev_idx])

    # ------------------------------------------------------------------
    # Panel-aware vi/arrow navigation
    # ------------------------------------------------------------------

    def _scroll_active_panel(self, direction: str) -> None:
        """Scroll the active panel's content area."""
        try:
            container = self.query_one("#main-content")
            if direction == "down":
                container.scroll_down()
            else:
                container.scroll_up()
        except Exception:
            pass

    def action_nav_down(self) -> None:
        """j/down — next item in current panel."""
        if self._focused_panel == "diffs":
            try:
                self.query_one("#panel-diffs", DiffsPanel).next_file()
                self._toast("Next file")
            except Exception:
                pass
        elif self._focused_panel == "sprint":
            try:
                self.query_one("#panel-sprint", SprintPanel).next_epic()
                self._toast("Next epic")
            except Exception:
                pass
        elif self._focused_panel in ("audit-log", "progress"):
            self._scroll_active_panel("down")
            self._toast("Scroll down")

    def action_nav_up(self) -> None:
        """k/up — prev item in current panel."""
        if self._focused_panel == "diffs":
            try:
                self.query_one("#panel-diffs", DiffsPanel).prev_file()
                self._toast("Prev file")
            except Exception:
                pass
        elif self._focused_panel == "sprint":
            try:
                self.query_one("#panel-sprint", SprintPanel).prev_epic()
                self._toast("Prev epic")
            except Exception:
                pass
        elif self._focused_panel in ("audit-log", "progress"):
            self._scroll_active_panel("up")
            self._toast("Scroll up")

    def action_nav_left(self) -> None:
        """h/left — prev in diffs, hotspots in debug."""
        if self._focused_panel == "diffs":
            try:
                self.query_one("#panel-diffs", DiffsPanel).prev_file()
                self._toast("Prev file")
            except Exception:
                pass
        elif self._focused_panel == "debug":
            self._toast("Hotspots")
            self.action_debug_hotspots()

    def action_nav_right(self) -> None:
        """l/right — next in diffs."""
        if self._focused_panel == "diffs":
            try:
                self.query_one("#panel-diffs", DiffsPanel).next_file()
                self._toast("Next file")
            except Exception:
                pass

    def action_toggle_epic(self) -> None:
        """Toggle expand/collapse on selected epic in sprint panel."""
        if self._focused_panel == "sprint":
            try:
                panel = self.query_one("#panel-sprint", SprintPanel)
                panel.toggle_epic()
                self._toast("Toggle epic")
            except Exception:
                pass

    def action_copy_selected_id(self) -> None:
        """Copy Jira key of selected story/epic to clipboard."""
        if self._focused_panel == "sprint":
            try:
                panel = self.query_one("#panel-sprint", SprintPanel)
                panel.copy_selected_id()
                self._toast("Copied to clipboard")
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Story 121-2: Code quality tool triggers (debug panel)
    # ------------------------------------------------------------------

    def action_debug_hotspots(self) -> None:
        """Trigger hotspots analysis from debug panel."""
        if self._focused_panel != "debug":
            return
        try:
            debug_panel = self.query_one("#panel-debug", DebugPanel)
            self.run_worker(debug_panel.run_hotspots_analysis(), exclusive=True)
            self._toast("Running hotspots analysis")
        except Exception:
            pass

    def action_debug_deadcode(self) -> None:
        """Trigger dead code analysis from debug panel."""
        if self._focused_panel != "debug":
            return
        try:
            debug_panel = self.query_one("#panel-debug", DebugPanel)
            self.run_worker(debug_panel.run_dead_code_analysis(), exclusive=True)
            self._toast("Running dead code analysis")
        except Exception:
            pass

    def action_debug_healthscore(self) -> None:
        """Trigger health score analysis from debug panel."""
        if self._focused_panel != "debug":
            return
        try:
            debug_panel = self.query_one("#panel-debug", DebugPanel)
            self.run_worker(debug_panel.run_health_score_analysis(), exclusive=True)
            self._toast("Running health score analysis")
        except Exception:
            pass

    def action_debug_back(self) -> None:
        """Return to normal debug view from tool results."""
        if self._focused_panel != "debug":
            return
        try:
            debug_panel = self.query_one("#panel-debug", DebugPanel)
            debug_panel.show_normal_view()
            self._toast("Back to debug")
        except Exception:
            pass

    def action_toggle_portrait_position(self) -> None:
        """Toggle portrait between left and right side of header."""
        try:
            header = self.query_one("#agent-header", AgentHeader)
            header._toggle_portrait_position()
            self._toast(f"Portrait: {header._portrait_position}")
        except Exception:
            pass

    def action_cycle_portrait_size(self) -> None:
        """Cycle portrait size: small → medium → large → small."""
        try:
            header = self.query_one("#agent-header", AgentHeader)
            new_size = header._cycle_portrait_size()
            self._toast(f"Portrait size: {new_size}")
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Live settings updates
    # ------------------------------------------------------------------

    def on_settings_panel_setting_changed(
        self, event: SettingsPanel.SettingChanged
    ) -> None:
        """Apply setting changes immediately without restart."""
        key, value = event.key, event.value
        try:
            header = self.query_one("#agent-header", AgentHeader)
        except Exception:
            header = None

        if key == "portrait_size" and header is not None:
            header._portrait_size = str(value)
            header._last_effective_size = None
            header._current_portrait = None
            header._render_header()
        elif key == "portrait_position" and header is not None:
            header._portrait_position = str(value)
            header._current_portrait = None
            header._render_header()
        elif key == "tui.toasts":
            self._toasts_enabled = bool(value)
        elif key == "workflow.tui_statusbar":
            try:
                footer = self.query_one(StatusFooter)
                footer.display = bool(value)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Split-pane layout (Story 110-4)
    # ------------------------------------------------------------------

    def _sync_reparent(self, widget: Any, new_parent: Any) -> None:
        """Move widget from current parent to new parent synchronously.

        Uses internal Textual DOM API so the move is visible immediately
        without awaiting an async mount/remove cycle.
        """
        old_parent = widget._parent
        if old_parent is not None:
            try:
                old_parent._nodes._remove(widget)
            except (ValueError, AttributeError):
                # Fallback: remove from internal list directly
                try:
                    old_parent._nodes._nodes.remove(widget)
                except Exception:
                    pass
        try:
            new_parent._nodes._append(widget)
        except AttributeError:
            new_parent._nodes._nodes.append(widget)
        widget._parent = new_parent

    def _enter_split(self, left_key: str, right_key: str) -> None:
        """Activate split mode with specified panels (synchronous)."""
        if left_key not in _PANEL_KEYS or right_key not in _PANEL_KEYS:
            return
        if left_key == right_key:
            return

        self._split_mode = True
        self._split_left_key = left_key
        self._split_right_key = right_key
        self._active_split_pane = "left"

        try:
            main_content = self.query_one("#main-content")
            split_container = self.query_one("#split-container")
            split_left = self.query_one("#split-left")
            split_right = self.query_one("#split-right")
        except Exception:
            return

        # Move left panel to split-left pane
        try:
            left_panel = self.query_one(f"#panel-{left_key}")
            left_panel.display = True
            self._sync_reparent(left_panel, split_left)
        except Exception:
            pass

        # Move right panel to split-right pane
        try:
            right_panel = self.query_one(f"#panel-{right_key}")
            right_panel.display = True
            self._sync_reparent(right_panel, split_right)
        except Exception:
            pass

        # Hide all other panels remaining in main-content
        for panel_key in _PANEL_KEYS:
            if panel_key not in (left_key, right_key):
                try:
                    p = self.query_one(f"#panel-{panel_key}")
                    p.display = False
                except Exception:
                    pass

        main_content.display = False
        split_container.display = True

    def _exit_split(self) -> None:
        """Deactivate split mode, return panels to main-content."""
        self._split_mode = False

        try:
            main_content = self.query_one("#main-content")
            split_container = self.query_one("#split-container")
            split_left = self.query_one("#split-left")
            split_right = self.query_one("#split-right")
        except Exception:
            return

        # Move panels back from split panes to main-content
        for pane in (split_left, split_right):
            for child in list(pane.children):
                self._sync_reparent(child, main_content)

        split_container.display = False
        main_content.display = True

        # Restore single-panel visibility
        for panel_key in _PANEL_KEYS:
            try:
                p = self.query_one(f"#panel-{panel_key}")
                p.display = (panel_key == self._focused_panel)
            except Exception:
                pass

    def action_toggle_split(self) -> None:
        """Toggle split mode on/off (Shift+S keybinding)."""
        if self._split_mode:
            self._exit_split()
            self._toast("Split off")
        else:
            # Default: current panel left, next panel right
            left_key = self._focused_panel
            try:
                idx = _PANEL_KEYS.index(left_key)
            except ValueError:
                idx = 0
            right_key = _PANEL_KEYS[(idx + 1) % len(_PANEL_KEYS)]
            self._enter_split(left_key, right_key)
            self._toast(f"Split: {left_key} | {right_key}")

    def action_apply_split_preset(self, name: str) -> None:
        """Apply a named split preset (synchronous)."""
        if name not in SPLIT_PRESETS:
            return
        left_key, right_key = SPLIT_PRESETS[name]
        if self._split_mode:
            self._exit_split()
        self._enter_split(left_key, right_key)

    def _update_tab_bar(self, panel_key: str) -> None:
        """Update the tab bar widget with the given panel key.

        Increments _programmatic_tab_count so the async TabActivated
        handler knows to ignore the event (prevents infinite ping-pong).
        """
        try:
            tab_bar = self.query_one("#tab-bar", Tabs)
            tab_id = f"tab-{panel_key}"
            if tab_bar.active != tab_id:
                self._programmatic_tab_count += 1
                tab_bar.active = tab_id
        except Exception:
            pass

    def on_tabs_tab_activated(self, event: Tabs.TabActivated) -> None:
        """Handle tab activation from the Tabs widget.

        Programmatic tabs.active changes fire TabActivated asynchronously.
        We use a counter to skip those and only react to genuine user clicks.
        """
        if self._programmatic_tab_count > 0:
            self._programmatic_tab_count -= 1
            return
        tab_id = event.tab.id or ""
        panel_key = tab_id.removeprefix("tab-")
        if panel_key in _PANEL_KEYS and panel_key != self._focused_panel:
            self.action_switch_panel(panel_key)

    def _handle_focus_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming focus channel messages.

        Expected format:
          Single panel: {type: 'update', focus: '<panel>'}
          Split layout:  {type: 'update', focus: 'split', split: {left: ..., right: ...}}
          Split preset:  {type: 'update', focus: 'split:<preset-name>'}
        Only 'update' messages trigger panel switches (matching React hook).
        Routes through Textual message system via post_message for proper repaint.
        """
        if message is None or not isinstance(message, dict):
            return
        if message.get("type") != "update":
            return
        if "focus" not in message:
            return
        split_config = message.get("split")
        self.post_message(self.FocusUpdate(message["focus"], split_config=split_config))

    def _handle_persona_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming persona channel messages.

        Routes through Textual message system via post_message for proper repaint.
        """
        if message is None or not isinstance(message, dict):
            return
        self.post_message(self.PersonaUpdate(message))

    def _on_ws_state_change(self, state: ConnectionState) -> None:
        """Handle WheelHub connection state changes.

        Routes through Textual message system via post_message for proper repaint.
        """
        self.post_message(self.WsStateUpdate(state))

    def on_bike_rack_app_persona_update(self, event: PersonaUpdate) -> None:
        """Apply persona data in Textual message context."""
        try:
            header = self.query_one("#agent-header", AgentHeader)
            header._apply_persona(event.data)
        except Exception:
            pass

    def on_bike_rack_app_focus_update(self, event: FocusUpdate) -> None:
        """Apply focus change in Textual message context."""
        focus = event.focus
        split_config = event.split_config

        if focus == "split" and split_config:
            # Explicit split layout: {focus: "split", split: {left: ..., right: ...}}
            left = split_config.get("left", "sprint")
            right = split_config.get("right", "diffs")
            if self._split_mode:
                self._exit_split()
            self._enter_split(left, right)
        elif focus is not None and focus.startswith("split:"):
            # Preset reference: {focus: "split:progress+debug"}
            preset_name = focus[len("split:"):]
            self.action_apply_split_preset(preset_name)
        elif focus is not None and focus in _PANEL_KEYS:
            # Single panel focus — exit split if active
            if self._split_mode:
                self._exit_split()
            self.action_switch_panel(focus)
        elif focus is not None:
            self._previous_panel = self._focused_panel
            self._focused_panel = focus
            save_last_panel(focus, project_dir=None)

    def on_bike_rack_app_ws_state_update(self, event: WsStateUpdate) -> None:
        """Apply connection state in Textual message context."""
        try:
            widget = self.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = event.state
        except Exception:
            pass


DEFAULT_PORT = 2898


def get_watch_paths() -> list[Path]:
    """Return directories to watch for Python file changes in dev mode."""
    base = Path(__file__).resolve().parent.parent  # pf/
    return [
        base / "bikerack",
        base / "bc",
    ]


def watch_filter(change: str, path: str) -> bool:
    """Filter file change events — only accept .py files, ignore caches."""
    if "__pycache__" in path:
        return False
    if path.endswith(".pyc"):
        return False
    if not path.endswith(".py"):
        return False
    return True


def _run_with_reload(app: BikeRackApp, watch_paths: list[Path], filter_func) -> None:
    """Run the app with file watching and auto-reload via watchfiles."""
    import sys

    from watchfiles import run_process

    # Build the command that launches the TUI normally
    cmd = [sys.executable, "-m", "pf.bikerack.tui"]
    if hasattr(app, "_client") and app._client is not None:
        cmd.extend(["--port", str(app._client._port)])

    run_process(
        *watch_paths,
        target=" ".join(cmd),
        target_type="command",
        callback=lambda changes: None,
        watch_filter=filter_func,
    )


def _patch_tgp_for_tmux() -> None:
    """Monkey-patch textual-image for tmux compatibility.

    Two patches:
    1. Wrap Kitty APC escapes in tmux DCS passthrough sequences.
    2. Force image re-upload on every render cycle. tmux pane redraws
       re-send the Unicode diacritics but the image data reference gets
       orphaned — resetting terminal_image_id forces a fresh upload each
       time Textual repaints the widget.
    """
    try:
        import textual_image.renderable.tgp as tgp
    except ImportError:
        return

    # Patch 1: DCS passthrough wrapper
    def _tmux_send(*, payload: str | None = None, **kwargs: int | str | None) -> None:
        import sys

        if not sys.__stdout__:
            return

        inner = [
            tgp._TGP_MESSAGE_START,
            ",".join(f"{k}={v}" for k, v in kwargs.items() if v is not None),
            f";{payload}" if payload else "",
            tgp._TGP_MESSAGE_END,
        ]
        sequence = "".join(inner)

        # Wrap in tmux DCS passthrough: double any ESC inside the payload
        wrapped = "\x1bPtmux;" + sequence.replace("\x1b", "\x1b\x1b") + "\x1b\\"
        sys.__stdout__.write(wrapped)
        sys.__stdout__.flush()

    tgp._send_tgp_message = _tmux_send

    # Patch 2: Force re-upload every render (image data gets lost on tmux redraws)
    _original_rich_console = tgp.Image.__rich_console__

    def _reupload_rich_console(self, console, options):
        self.terminal_image_id = None
        yield from _original_rich_console(self, console, options)

    tgp.Image.__rich_console__ = _reupload_rich_console


def main(
    port: int | None = None,
    project_dir: Path | None = None,
) -> None:
    """Launch BikeRack TUI as a standalone application.

    Args:
        port: Explicit WheelHub port. If None, reads from .bikerack-port file.
        project_dir: Project directory for port file discovery. Defaults to cwd.
    """
    # Detect terminal image protocol BEFORE App.run() claims the terminal
    from pf.bikerack import portrait_resolver

    portrait_resolver.detect_image_protocol()

    # Patch textual-image to wrap Kitty graphics escapes in tmux passthrough.
    # tmux doesn't natively forward Kitty's APC graphics escapes — they must
    # be wrapped in DCS passthrough sequences (\x1bPtmux;...\x1b\\).
    # See: https://github.com/tmux/tmux/wiki/FAQ
    if os.environ.get("TMUX") and portrait_resolver.detect_image_protocol() == "kitty":
        _patch_tgp_for_tmux()

    if port is None:
        if project_dir is not None:
            port_file = project_dir / ".bikerack-port"
            if port_file.exists():
                try:
                    port = int(port_file.read_text().strip())
                except (ValueError, OSError):
                    port = DEFAULT_PORT
            else:
                port = DEFAULT_PORT
        else:
            port = DEFAULT_PORT

    client = WheelHubClient(port=port)
    app = BikeRackApp(client=client)
    app.run()


def dev_main(
    port: int | None = None,
    project_dir: Path | None = None,
) -> None:
    """Launch BikeRack TUI in dev mode with auto-reload on Python file changes.

    Sets TEXTUAL env var for CSS hot-reload and uses watchfiles for Python reload.
    """
    os.environ["TEXTUAL"] = "devtools"

    from pf.bikerack import portrait_resolver

    portrait_resolver.detect_image_protocol()

    if os.environ.get("TMUX") and portrait_resolver.detect_image_protocol() == "kitty":
        _patch_tgp_for_tmux()

    if port is None:
        if project_dir is not None:
            port_file = project_dir / ".bikerack-port"
            if port_file.exists():
                try:
                    port = int(port_file.read_text().strip())
                except (ValueError, OSError):
                    port = DEFAULT_PORT
            else:
                port = DEFAULT_PORT
        else:
            port = DEFAULT_PORT

    client = WheelHubClient(port=port)
    app = BikeRackApp(client=client)

    watch_paths = get_watch_paths()
    _run_with_reload(app, watch_paths, watch_filter)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BikeRack TUI")
    parser.add_argument("--port", type=int, default=None, help="WheelHub port")
    parser.add_argument("--project-dir", type=str, default=None, help="Project directory")
    args = parser.parse_args()

    project_dir = Path(args.project_dir) if args.project_dir else None
    main(port=args.port, project_dir=project_dir)
