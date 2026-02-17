"""BikeRack TUI — Terminal-native dashboard built on Textual.

Story 103-1: Textual app scaffold with basic layout.
Story 103-4: Connection status indicator in TUI header.
Story 103-6: SprintPanel as default panel on launch.
Story 103-7: /bc TUI panel focus — subscribe to /ws/focus, switch panels.
Story 103-9: Panel header chrome — icon + name indicator for active panel.
Panel navigation: Mount all panels, tab bar, keyboard switching, command palette.
"""

from __future__ import annotations

from functools import partial
from pathlib import Path
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.command import Hit, Hits, Provider
from textual.containers import Horizontal, VerticalScroll
from textual.message import Message
from textual.reactive import reactive
from textual.widgets import Footer, Header, Static, Tab, Tabs

from pennyfarthing_scripts.bc.focus import get_last_panel, save_last_panel
from pennyfarthing_scripts.bikerack.audit_log_panel import AuditLogPanel
from pennyfarthing_scripts.bikerack.background_panel import BackgroundPanel
from pennyfarthing_scripts.bikerack.base_panel import get_panel_icon
from pennyfarthing_scripts.bikerack.changed_panel import ChangedPanel
from pennyfarthing_scripts.bikerack.context_meter_footer import ContextMeterFooter
from pennyfarthing_scripts.bikerack.debug_panel import DebugPanel
from pennyfarthing_scripts.bikerack.diffs_panel import DiffsPanel
from pennyfarthing_scripts.bikerack.events import NavigateToFile
from pennyfarthing_scripts.bikerack.git_panel import GitPanel
from pennyfarthing_scripts.bikerack.progress_panel import ProgressPanel
from pennyfarthing_scripts.bikerack.sprint_panel import SprintPanel
from pennyfarthing_scripts.bikerack.ws_client import ConnectionState, WheelHubClient

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
    ("changed", "Changed"),
    ("background", "Background"),
    ("audit-log", "Audit Log"),
    ("debug", "Debug"),
    ("progress", "Progress"),
]

# Human-readable display names for panels (full set for external focus messages)
PANEL_DISPLAY_NAMES: dict[str, str] = {
    "sprint": "Sprint",
    "git": "Git",
    "diffs": "Diffs",
    "todo": "Todo",
    "workflow": "Workflow",
    "background": "Background",
    "audit-log": "Audit Log",
    "changed": "Changed",
    "ac": "Acceptance Criteria",
    "debug": "Debug",
    "progress": "Progress",
    "settings": "Settings",
    "tty": "TTY",
}

# Keys from PANEL_REGISTRY for fast lookup
_PANEL_KEYS = [key for key, _ in PANEL_REGISTRY]


class BindingFooter(Footer):
    """Footer subclass that exposes active binding text via render().

    Textual's Footer uses compose() for visual content, so render() returns
    Blank. This override makes binding descriptions available through
    str(footer.render()) for programmatic inspection.
    """

    def render(self) -> Any:
        try:
            bindings = self.screen.active_bindings
            parts: list[str] = []
            for _, binding, _enabled, _tooltip in bindings.values():
                if binding.show:
                    parts.append(f"{binding.key}:{binding.description}")
            if parts:
                return " ".join(parts)
        except Exception:
            pass
        return super().render()


def _build_panel_tabs() -> list[Tab]:
    """Build Tab widgets for each panel in the registry."""
    tabs: list[Tab] = []
    for panel_key, display_name in PANEL_REGISTRY:
        icon = get_panel_icon(panel_key)
        label = f"{icon} {display_name}" if icon else display_name
        tabs.append(Tab(label, id=f"tab-{panel_key}"))
    return tabs


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

    def _apply_persona(self, data: dict[str, Any]) -> None:
        """Render persona data into the header."""
        if data.get("type") == "streaming":
            self._is_streaming = bool(data.get("isStreaming", False))
            self._render_header()
            return

        self._persona_data = data
        self._is_streaming = bool(data.get("isStreaming", False))
        self._render_header()

    def _resolve_portrait(self, data: dict[str, Any]) -> Path | None:
        """Get portrait path from persona data or resolve locally."""
        portrait_path = data.get("portraitPath")
        if portrait_path:
            p = Path(portrait_path)
            if p.exists():
                return p
        theme = data.get("theme", "")
        role = data.get("role", "")
        if theme and role:
            from pennyfarthing_scripts.bikerack import portrait_resolver

            return portrait_resolver.resolve_portrait_path(theme, role)
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
            from pennyfarthing_scripts.bikerack.base_panel import humanize_theme

            parts.append(f"[dim]{humanize_theme(theme)}[/dim]")

        # Streaming indicator
        if self._is_streaming:
            parts.append("[bold yellow]⚡[/bold yellow]")

        line = "  ".join(parts)

        # Catchphrase subtitle (quote is a random catchphrase from the theme)
        if quote:
            line += f"\n[italic dim]\"{quote}\"[/italic dim]"
        elif role_desc:
            line += f"\n[dim]{role_desc}[/dim]"

        self._header_text = line

        # Check portrait and schedule layout update
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
            row = Horizontal(skeleton, text, id="portrait-row")
            await self.mount(row)

            # Now try to load the real image and swap it in
            try:
                from pennyfarthing_scripts.bikerack.portrait_resolver import (
                    detect_image_protocol,
                )

                protocol = detect_image_protocol()
                if protocol is None:
                    # No image protocol — remove skeleton, fall back to text-only
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
                await row.mount(img, before=0)
            except (ImportError, Exception):
                # textual-image not available — remove skeleton, text-only
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

        def __init__(self, focus: str | None) -> None:
            super().__init__()
            self.focus = focus

    class WsStateUpdate(Message, bubble=False):
        """WS connection state change — routed through Textual message system."""

        def __init__(self, state: ConnectionState) -> None:
            super().__init__()
            self.state = state

    TITLE = "BikeRack"

    CSS = """
    #agent-header {
        height: auto;
        max-height: 7;
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
    ContextMeterFooter {
        height: 1;
    }
    """

    COMMANDS = App.COMMANDS | {PanelCommands}

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("1", "switch_panel('sprint')", "Sprint", show=False),
        Binding("2", "switch_panel('git')", "Git", show=False),
        Binding("3", "switch_panel('diffs')", "Diffs", show=False),
        Binding("4", "switch_panel('changed')", "Changed", show=False),
        Binding("5", "switch_panel('background')", "Background", show=False),
        Binding("6", "switch_panel('audit-log')", "Audit Log", show=False),
        Binding("7", "switch_panel('debug')", "Debug", show=False),
        Binding("8", "switch_panel('progress')", "Progress", show=False),
        Binding("bracketright", "next_panel", "]Next"),
        Binding("bracketleft", "prev_panel", "[Prev"),
        Binding("tab", "next_panel", show=False),
        Binding("shift+tab", "prev_panel", show=False),
        Binding("n", "next_diff_file", "Next file", show=False),
        Binding("p", "prev_diff_file", "Prev file", show=False),
        Binding("j", "next_epic", show=False),
        Binding("k", "prev_epic", show=False),
        Binding("e", "toggle_epic", show=False),
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

    def compose(self) -> ComposeResult:
        yield Header()
        yield AgentHeader(id="agent-header")
        yield Tabs(*_build_panel_tabs(), id="tab-bar")
        yield ConnectionStatus(
            STATE_DISPLAY[ConnectionState.DISCONNECTED],
            id="connection-status",
        )
        with VerticalScroll(id="main-content"):
            yield SprintPanel(client=self._client, id="panel-sprint")
            yield GitPanel(client=self._client, id="panel-git")
            yield DiffsPanel(client=self._client, id="panel-diffs")
            yield ChangedPanel(client=self._client, id="panel-changed")
            yield BackgroundPanel(client=self._client, id="panel-background")
            yield AuditLogPanel(client=self._client, id="panel-audit-log")
            yield DebugPanel(client=self._client, id="panel-debug")
            yield ProgressPanel(client=self._client, id="panel-progress")
        yield ContextMeterFooter(client=self._client)
        yield BindingFooter()

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

    def on_navigate_to_file(self, event: NavigateToFile) -> None:
        """Handle NavigateToFile — switch to diffs and navigate to file."""
        self.action_switch_panel("diffs")
        try:
            diffs = self.query_one("#panel-diffs", DiffsPanel)
            diffs.navigate_to_file(event.path)
        except Exception:
            pass

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

    def action_next_panel(self) -> None:
        """Cycle to the next panel."""
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

    def action_next_diff_file(self) -> None:
        """Advance to next file in diffs panel."""
        if self._focused_panel == "diffs":
            try:
                panel = self.query_one("#panel-diffs", DiffsPanel)
                panel.next_file()
            except Exception:
                pass

    def action_prev_diff_file(self) -> None:
        """Go to previous file in diffs panel."""
        if self._focused_panel == "diffs":
            try:
                panel = self.query_one("#panel-diffs", DiffsPanel)
                panel.prev_file()
            except Exception:
                pass

    def action_next_epic(self) -> None:
        """Move to next epic in sprint panel."""
        if self._focused_panel == "sprint":
            try:
                panel = self.query_one("#panel-sprint", SprintPanel)
                panel.next_epic()
            except Exception:
                pass

    def action_prev_epic(self) -> None:
        """Move to previous epic in sprint panel."""
        if self._focused_panel == "sprint":
            try:
                panel = self.query_one("#panel-sprint", SprintPanel)
                panel.prev_epic()
            except Exception:
                pass

    def action_toggle_epic(self) -> None:
        """Toggle expand/collapse on selected epic in sprint panel."""
        if self._focused_panel == "sprint":
            try:
                panel = self.query_one("#panel-sprint", SprintPanel)
                panel.toggle_epic()
            except Exception:
                pass

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

        Expected format: {type: 'init'|'update', focus: '<panel>'|null}
        Only 'update' messages trigger panel switches (matching React hook).
        Routes through Textual message system via post_message for proper repaint.
        """
        if message is None or not isinstance(message, dict):
            return
        if message.get("type") != "update":
            return
        if "focus" not in message:
            return
        self.post_message(self.FocusUpdate(message["focus"]))

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
        if focus is not None and focus in _PANEL_KEYS:
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


def main(
    port: int | None = None,
    project_dir: Path | None = None,
) -> None:
    """Launch BikeRack TUI as a standalone application.

    Args:
        port: Explicit WheelHub port. If None, reads from .wheelhub-port file.
        project_dir: Project directory for port file discovery. Defaults to cwd.
    """
    # Detect terminal image protocol BEFORE App.run() claims the terminal
    from pennyfarthing_scripts.bikerack import portrait_resolver

    portrait_resolver.detect_image_protocol()

    if port is None:
        if project_dir is not None:
            port_file = project_dir / ".wheelhub-port"
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


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BikeRack TUI")
    parser.add_argument("--port", type=int, default=None, help="WheelHub port")
    parser.add_argument("--project-dir", type=str, default=None, help="Project directory")
    args = parser.parse_args()

    project_dir = Path(args.project_dir) if args.project_dir else None
    main(port=args.port, project_dir=project_dir)
