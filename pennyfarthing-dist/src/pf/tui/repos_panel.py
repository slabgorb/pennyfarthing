"""ReposPanel — Repo configuration panel for BikeRack TUI.

Renders per-repo settings from repos.yaml with collapsible sections,
using the RepoFieldSpec registry from repos_meta.py.

Story 147-5.
"""

from __future__ import annotations

from typing import Any

from textual.app import ComposeResult
from textual.message import Message
from textual.timer import Timer
from textual.widget import Widget
from textual.widgets import Collapsible, Input, Label, Select, Static, Switch

from pf.git.repos import load_repos_config, load_repos_yaml_raw
from pf.tui.repos_meta import REPO_FIELDS_META, RepoFieldSpec, build_repo_field_specs


# Placeholder for set_repo_field (147-6 dependency)
def set_repo_field(repo_name: str, field: str, value: Any) -> dict[str, Any]:
    """Stub — will be replaced by 147-6 implementation in pf.git.repos."""
    return {"success": False, "error": "not implemented"}


def _field_to_widget_id(repo_name: str, field: str) -> str:
    """Convert repo name and field name to a Textual widget ID."""
    return f"repo-{repo_name}-{field.replace('_', '-')}"


def _parse_widget_id(widget_id: str) -> tuple[str, str] | None:
    """Parse a widget ID back to (repo_name, field_name).

    Matches field names from REPO_FIELDS_META against the ID suffix
    to handle repo names that may contain dashes.
    """
    if not widget_id or not widget_id.startswith("repo-"):
        return None
    rest = widget_id[5:]  # strip "repo-"
    for field_name in REPO_FIELDS_META:
        field_dashed = field_name.replace("_", "-")
        suffix = f"-{field_dashed}"
        if rest.endswith(suffix):
            repo_name = rest[: -len(suffix)]
            if repo_name:
                return repo_name, field_name
    return None


class _Section(Collapsible):
    """Collapsible section that stores children for compose-based traversal.

    Standard Textual Collapsible.compose() uses context managers that require
    an active app lifecycle. This subclass stores children and yields them
    directly from compose(), enabling widget tree inspection in tests.
    """

    def __init__(self, *children: Widget, **kwargs: Any) -> None:
        self._section_children = list(children)
        super().__init__(*children, **kwargs)

    def compose(self) -> ComposeResult:
        try:
            yield from super().compose()
        except (IndexError, Exception):
            # Outside app context — yield children directly
            yield from self._section_children


REPOS_CSS = """
ReposPanel {
    height: 1fr;
}
ReposPanel .setting-row {
    height: auto;
    min-height: 3;
    max-height: 5;
    padding: 0 1;
}
ReposPanel .setting-label {
    width: 24;
    min-width: 16;
    height: 1;
    content-align: left middle;
}
ReposPanel .readonly-value {
    width: 1fr;
    height: auto;
    color: $text-muted;
}
ReposPanel Switch {
    width: auto;
    height: auto;
}
ReposPanel Select {
    width: 28;
    height: 3;
}
ReposPanel Input {
    width: 28;
    height: 3;
}
ReposPanel #repos-status {
    dock: bottom;
    height: 1;
    padding: 0 1;
}
"""


class ReposPanel(Widget):
    """Repo configuration panel with per-repo collapsible sections."""

    class RepoFieldChanged(Message):
        """Posted when a repo field value changes."""

        def __init__(self, repo_name: str, field: str, value: Any) -> None:
            super().__init__()
            self.repo_name = repo_name
            self.field = field
            self.value = value

    DEFAULT_CSS = REPOS_CSS

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._status_timer: Timer | None = None

    def compose(self) -> ComposeResult:
        repos = load_repos_config()
        raw = load_repos_yaml_raw()
        specs = build_repo_field_specs()

        # Group specs by group name
        groups: dict[str, list[RepoFieldSpec]] = {}
        for spec in specs:
            groups.setdefault(spec.group, []).append(spec)

        # Project section (global fields)
        project_children = list(self._compose_global_section(raw))
        yield _Section(*project_children, title="Project", collapsed=False)

        # Per-repo sections
        for name, config in repos.items():
            repo_children: list[Widget] = []
            for group_name, group_specs in groups.items():
                field_widgets: list[Widget] = []
                for spec in group_specs:
                    field_widgets.extend(self._compose_field_row(name, config, spec))
                repo_children.append(
                    _Section(*field_widgets, title=group_name, collapsed=False)
                )
            yield _Section(*repo_children, title=name, collapsed=False)

        yield Static("", id="repos-status")

    def _compose_global_section(self, raw: dict[str, Any]) -> list[Widget]:
        """Compose widgets for the global Project section."""
        pr_format = raw.get("pr_title_format", "")
        return [
            Label("PR Title Format", classes="setting-label"),
            Input(value=str(pr_format), id="global-pr-title-format"),
        ]

    def _compose_field_row(
        self, repo_name: str, config: Any, spec: RepoFieldSpec
    ) -> list[Widget]:
        """Compose widgets for a single field row."""
        value = getattr(config, spec.field, None)
        wid = _field_to_widget_id(repo_name, spec.field)

        if spec.read_only or spec.widget_type == "readonly":
            if isinstance(value, list):
                display = ", ".join(str(v) for v in value)
            elif isinstance(value, dict):
                display = ", ".join(f"{k} → {v}" for k, v in value.items())
            else:
                display = str(value) if value else ""
            value_label = Label(display, classes="readonly-value")
            value_label.renderable = display
            return [
                Label(spec.label, classes="setting-label"),
                value_label,
            ]
        elif spec.widget_type == "switch":
            return [
                Label(spec.label, classes="setting-label"),
                Switch(
                    value=bool(value) if value is not None else False,
                    id=wid,
                ),
            ]
        elif spec.widget_type == "select":
            options = spec.options or []
            select_options = [(label, val) for label, val in options]
            current_val = value if value is not None else ""
            return [
                Label(spec.label, classes="setting-label"),
                Select(
                    select_options,
                    value=current_val,
                    id=wid,
                    allow_blank=False,
                ),
            ]
        elif spec.widget_type == "input":
            return [
                Label(spec.label, classes="setting-label"),
                Input(
                    value=str(value) if value is not None else "",
                    id=wid,
                ),
            ]
        return []

    def _show_status(self, message: str) -> None:
        """Show a status message that auto-clears after 2 seconds."""
        try:
            status = self.query_one("#repos-status", Static)
            status.update(message)
        except Exception:
            return

        if self._status_timer is not None:
            self._status_timer.stop()

        self._status_timer = self.set_timer(2.0, self._clear_status)

    def _clear_status(self) -> None:
        """Clear the status message."""
        try:
            status = self.query_one("#repos-status", Static)
            status.update("")
        except Exception:
            pass
        self._status_timer = None

    def _save_and_notify(
        self, repo_name: str, spec: RepoFieldSpec, value: Any
    ) -> None:
        """Save a repo field and post a RepoFieldChanged message."""
        result = set_repo_field(repo_name, spec.field, value)
        if result.get("success"):
            self._show_status(f"[green]Saved {spec.field}[/green]")
            self.post_message(self.RepoFieldChanged(repo_name, spec.field, value))
        else:
            error = result.get("error", "Unknown error")
            self._show_status(f"[red]Error: {error}[/red]")

    def on_switch_changed(self, event: Switch.Changed) -> None:
        """Handle toggle switch changes."""
        parsed = _parse_widget_id(event.switch.id)
        if parsed is None:
            return
        repo_name, field = parsed
        spec = REPO_FIELDS_META.get(field)
        if spec is None:
            return
        self._save_and_notify(repo_name, spec, event.value)

    def on_select_changed(self, event: Select.Changed) -> None:
        """Handle dropdown selection changes."""
        if event.select.id is None:
            return
        parsed = _parse_widget_id(event.select.id)
        if parsed is None:
            return
        repo_name, field = parsed
        spec = REPO_FIELDS_META.get(field)
        if spec is None:
            return
        self._save_and_notify(repo_name, spec, event.value)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle text input submission (Enter key)."""
        if event.input.id is None:
            return
        parsed = _parse_widget_id(event.input.id)
        if parsed is None:
            return
        repo_name, field = parsed
        spec = REPO_FIELDS_META.get(field)
        if spec is None:
            return
        self._save_and_notify(repo_name, spec, event.value)
