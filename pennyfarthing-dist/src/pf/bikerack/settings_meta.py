"""Settings metadata registry for BikeRack TUI Settings panel.

Maps each known setting to a SettingSpec that describes its UI widget type,
group, and options. Unknown settings discovered in DEFAULTS are auto-inferred
as Switch (bool) or Input (str/int).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass
class SettingSpec:
    """Describes how a single setting should render in the TUI."""

    key: str
    label: str
    widget_type: str  # "switch" | "select" | "input"
    group: str = "General"
    options: list[tuple[str, Any]] | None = None
    options_factory: Callable[[], list[tuple[str, Any]]] | None = None
    description: str = ""
    hidden: bool = False

    def get_options(self) -> list[tuple[str, Any]]:
        """Return options list, calling factory if needed."""
        if self.options is not None:
            return self.options
        if self.options_factory is not None:
            return self.options_factory()
        return []


def _theme_options() -> list[tuple[str, Any]]:
    """Lazy-load available themes as (label, value) pairs."""
    try:
        from pf.common.themes import list_themes

        return [(t, t) for t in list_themes()]
    except Exception:
        return [("(error loading themes)", "")]


# Explicit metadata for known settings
SETTINGS_META: dict[str, SettingSpec] = {}

_SPECS: list[SettingSpec] = [
    SettingSpec(
        key="theme",
        label="Theme",
        widget_type="select",
        group="General",
        options_factory=_theme_options,
        description="Active persona theme",
    ),
    SettingSpec(
        key="permission_mode",
        label="Permission Mode",
        widget_type="select",
        group="General",
        options=[("Standard", "standard"), ("Accept", "accept"), ("Strict", "strict")],
        description="Tool permission level",
    ),
    SettingSpec(
        key="portrait_size",
        label="Portrait Size",
        widget_type="select",
        group="TUI",
        options=[
            ("Auto", "auto"),
            ("Large", "large"),
            ("Medium", "medium"),
            ("Small", "small"),
            ("Off", "off"),
        ],
        description="Agent portrait display size",
    ),
    SettingSpec(
        key="portrait_position",
        label="Portrait Position",
        widget_type="select",
        group="TUI",
        options=[("Left", "left"), ("Right", "right")],
        description="Agent portrait side (p to toggle)",
    ),
    SettingSpec(
        key="portrait_dock",
        label="Portrait Dock",
        widget_type="select",
        group="TUI",
        options=[("Top", "top"), ("Bottom", "bottom")],
        description="Portrait panel above or below content",
    ),
    SettingSpec(
        key="workflow.git_monitor",
        label="Git Monitor",
        widget_type="switch",
        group="Workflow",
        description="Watch for git changes during workflow",
    ),
    SettingSpec(
        key="workflow.relay_mode",
        label="Relay Mode",
        widget_type="switch",
        group="Workflow",
        description="Auto-handoff in workflows",
    ),
    SettingSpec(
        key="workflow.permission_mode",
        label="Permission Mode",
        widget_type="select",
        group="Workflow",
        options=[("Standard", "standard"), ("Accept", "accept"), ("Strict", "strict")],
        description="Tool permission level in workflows",
    ),
    SettingSpec(
        key="workflow.pr_mode",
        label="PR Mode",
        widget_type="select",
        group="Workflow",
        options=[("Draft", "draft"), ("Ready", "ready")],
        description="Pull request creation mode",
    ),
    SettingSpec(
        key="workflow.pr_merge",
        label="PR Merge",
        widget_type="select",
        group="Workflow",
        options=[("Auto", "auto"), ("Manual", "manual")],
        description="PR merge strategy",
    ),
    SettingSpec(
        key="workflow.tui_statusbar",
        label="TUI Statusbar",
        widget_type="switch",
        group="TUI",
        description="Show statusbar in TUI",
    ),
    SettingSpec(
        key="workflow.statusbar",
        label="CLI Statusbar",
        widget_type="switch",
        group="Workflow",
        description="Show Claude Code status line",
    ),
    SettingSpec(
        key="workflow.startup_agent",
        label="Startup Agent",
        widget_type="select",
        group="Workflow",
        options=[
            ("Scrum Master", "sm"),
            ("Developer", "dev"),
            ("Test Engineer", "tea"),
            ("Reviewer", "reviewer"),
            ("Architect", "architect"),
            ("Product Manager", "pm"),
            ("Tech Writer", "tech-writer"),
            ("UX Designer", "ux-designer"),
            ("DevOps", "devops"),
            ("Business Analyst", "ba"),
            ("Orchestrator", "orchestrator"),
            ("None", "none"),
        ],
        description="Agent to auto-invoke when starting a new session",
    ),
    SettingSpec(
        key="tui.toasts",
        label="Toast Notifications",
        widget_type="switch",
        group="TUI",
        description="Show action feedback toasts (t to toggle)",
    ),
    SettingSpec(
        key="display.colorPreset",
        label="Color Preset",
        widget_type="input",
        group="Display",
        description="Terminal color scheme",
        hidden=True,
    ),
]

for _spec in _SPECS:
    SETTINGS_META[_spec.key] = _spec

# Keys to exclude from the settings panel
HIDDEN_KEYS: set[str] = {"last_panel", "layout", "split", "display.colorPreset"}


def _flatten_defaults(data: dict[str, Any], prefix: str = "") -> list[tuple[str, Any]]:
    """Walk a nested dict yielding (dot_path, value) pairs."""
    items: list[tuple[str, Any]] = []
    for key, value in data.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            items.extend(_flatten_defaults(value, full_key))
        else:
            items.append((full_key, value))
    return items


def build_setting_specs() -> list[SettingSpec]:
    """Build the full list of SettingSpecs from DEFAULTS.

    Explicit entries from SETTINGS_META are used when available.
    Unknown keys are auto-inferred: bool -> Switch, else -> Input.
    Hidden keys are excluded.
    """
    from pf.settings.settings import DEFAULTS

    specs: list[SettingSpec] = []
    seen: set[str] = set()

    flat = _flatten_defaults(DEFAULTS)

    for dot_key, default_value in flat:
        # Skip hidden keys (check both full path and top-level segment)
        top_key = dot_key.split(".")[0]
        if dot_key in HIDDEN_KEYS or top_key in HIDDEN_KEYS:
            continue

        seen.add(dot_key)

        if dot_key in SETTINGS_META:
            spec = SETTINGS_META[dot_key]
            if not spec.hidden:
                specs.append(spec)
        else:
            # Auto-infer widget type
            if isinstance(default_value, bool):
                widget_type = "switch"
            else:
                widget_type = "input"

            # Derive label from key: "workflow.pr_mode" -> "Pr Mode"
            short = dot_key.rsplit(".", 1)[-1]
            label = short.replace("_", " ").title()

            # Derive group from prefix
            parts = dot_key.split(".")
            group = parts[0].title() if len(parts) > 1 else "General"

            specs.append(
                SettingSpec(
                    key=dot_key,
                    label=label,
                    widget_type=widget_type,
                    group=group,
                )
            )

    return specs
