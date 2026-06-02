"""SettingsPanel — Settings editor panel for Frame TUI TUI.

Renders all settings from DEFAULTS as native Textual form widgets
(Switch, Select, Input) grouped by category. Auto-adapts to new
settings added to the DEFAULTS registry.
"""

from __future__ import annotations

from typing import Any

from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.message import Message
from textual.timer import Timer
from textual.widget import Widget
from textual.widgets import Collapsible, Input, Label, Select, Static, Switch

from pf.settings.settings import set_setting, set_setting_typed
from pf.tui.settings_meta import SettingSpec, build_setting_specs


def _key_to_id(key: str) -> str:
    """Convert a dot-path setting key to a valid Textual widget ID."""
    return f"setting-{key.replace('.', '-')}"


SETTINGS_CSS = """
SettingsPanel {
    height: 1fr;
}
SettingsPanel .setting-row {
    height: auto;
    min-height: 3;
    max-height: 5;
    padding: 0 1;
}
SettingsPanel .setting-label {
    width: 24;
    min-width: 16;
    height: 1;
    content-align: left middle;
}
SettingsPanel .setting-desc {
    width: 1fr;
    height: 1;
    color: $text-muted;
    content-align: left middle;
}
SettingsPanel Switch {
    width: auto;
    height: auto;
}
SettingsPanel Select {
    width: 28;
    height: 3;
}
SettingsPanel Input {
    width: 28;
    height: 3;
}
SettingsPanel #settings-status {
    dock: bottom;
    height: 1;
    padding: 0 1;
}
"""


class SettingsPanel(Widget):
    """Settings editor panel with native Textual form widgets."""

    class SettingChanged(Message):
        """Posted when a setting value changes so the app can react."""

        def __init__(self, key: str, value: Any) -> None:
            super().__init__()
            self.key = key
            self.value = value

    DEFAULT_CSS = SETTINGS_CSS

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._specs: list[SettingSpec] = []
        self._status_timer: Timer | None = None

    def compose(self) -> ComposeResult:
        self._specs = build_setting_specs()

        groups: dict[str, list[SettingSpec]] = {}
        for spec in self._specs:
            groups.setdefault(spec.group, []).append(spec)

        with VerticalScroll():
            for group_name, group_specs in groups.items():
                with Collapsible(title=group_name, collapsed=False):
                    for spec in group_specs:
                        yield from self._compose_setting_row(spec)

        yield Static("", id="settings-status")

    def _compose_setting_row(self, spec: SettingSpec) -> ComposeResult:
        """Yield widgets for a single setting row."""
        current = self._get_current_value(spec.key)

        with Horizontal(classes="setting-row"):
            yield Label(spec.label, classes="setting-label")

            if spec.widget_type == "switch":
                value = bool(current) if current is not None else False
                yield Switch(
                    value=value,
                    id=_key_to_id(spec.key),
                )
            elif spec.widget_type == "select":
                options = spec.get_options()
                select_options = [(label, value) for label, value in options]
                current_val = current if current is not None else ""
                valid_values = [v for _, v in select_options]
                if current_val not in valid_values:
                    current_val = select_options[0][1] if select_options else Select.BLANK
                yield Select(
                    select_options,
                    value=current_val,
                    id=_key_to_id(spec.key),
                    allow_blank=False,
                )
            elif spec.widget_type == "input":
                value_str = str(current) if current is not None else ""
                yield Input(
                    value=value_str,
                    id=_key_to_id(spec.key),
                )

    def _get_current_value(self, key: str) -> Any:
        """Get the current value of a setting, returning None on failure."""
        try:
            from pf.settings.settings import get_setting

            return get_setting(key)
        except (KeyError, Exception):
            try:
                from pf.settings.settings import DEFAULTS, _get_by_path

                return _get_by_path(DEFAULTS, key)
            except (KeyError, Exception):
                return None

    def _find_spec_for_widget(self, widget_id: str) -> SettingSpec | None:
        """Find the SettingSpec matching a widget ID."""
        for spec in self._specs:
            if _key_to_id(spec.key) == widget_id:
                return spec
        return None

    def _show_status(self, message: str) -> None:
        """Show a status message that auto-clears after 2 seconds."""
        try:
            status = self.query_one("#settings-status", Static)
            status.update(message)
        except Exception:
            return

        if self._status_timer is not None:
            self._status_timer.stop()

        self._status_timer = self.set_timer(2.0, self._clear_status)

    def _clear_status(self) -> None:
        """Clear the status message."""
        try:
            status = self.query_one("#settings-status", Static)
            status.update("")
        except Exception:
            pass
        self._status_timer = None

    def _save_and_notify(self, spec: SettingSpec, value: Any, coerce: bool = False) -> None:
        """Save a setting and post a SettingChanged message."""
        try:
            if coerce:
                set_setting(spec.key, value)
            else:
                set_setting_typed(spec.key, value)
            self._show_status(f"[green]Saved {spec.key}[/green]")
            self.post_message(self.SettingChanged(spec.key, value))
        except Exception as exc:
            self._show_status(f"[red]Error: {exc}[/red]")

    def on_switch_changed(self, event: Switch.Changed) -> None:
        """Handle toggle switch changes."""
        if event.switch.id is None:
            return
        spec = self._find_spec_for_widget(event.switch.id)
        if spec is None:
            return
        self._save_and_notify(spec, event.value)

    def on_select_changed(self, event: Select.Changed) -> None:
        """Handle dropdown selection changes."""
        if event.select.id is None:
            return
        spec = self._find_spec_for_widget(event.select.id)
        if spec is None:
            return
        self._save_and_notify(spec, event.value)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle text input submission (Enter key)."""
        if event.input.id is None:
            return
        spec = self._find_spec_for_widget(event.input.id)
        if spec is None:
            return
        self._save_and_notify(spec, event.value, coerce=True)
