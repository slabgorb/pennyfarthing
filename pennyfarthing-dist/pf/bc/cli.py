"""BC CLI — Panel focus management for Cyclist.

Usage:
    pf bc <panel>    Set focus to a panel
    pf bc reset      Clear focus setting
    pf bc save       Save a named layout
    pf bc load       Load a named layout
    pf bc list       List saved layouts
    pf bc clear      Delete a named layout
    pf bc clear-all  Delete all named layouts
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

import click

from pf.bc.focus import (
    VALID_PANELS,
    clear_all_named_layouts,
    clear_named_layout,
    clear_panel_focus,
    list_named_layouts,
    load_named_layout,
    save_named_layout,
    set_panel_focus,
)
from pf.bc.split import set_split_layout


def _get_current_layout() -> dict | None:
    """Fetch the current layout from a running Cyclist or BikeRack server.

    Reads .bikerack-port (shared by both Cyclist and BikeRack) and fetches
    the layout endpoint.

    Returns:
        Layout dict, or None if no server is running or fetch fails.
    """
    from pf.bc.focus import _get_root

    root = _get_root()

    candidates = [
        (root / ".bikerack-port", "/api/settings/bikerack-layout"),
    ]

    for port_file, endpoint in candidates:
        if not port_file.exists():
            continue
        try:
            port = int(port_file.read_text().strip())
        except (ValueError, OSError):
            continue

        url = f"http://localhost:{port}{endpoint}"
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                layout = data.get("layout")
                if layout and isinstance(layout, dict) and layout.get("panels"):
                    return layout
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            continue

    return None


@click.group()
def bc():
    """Panel focus management.

    \b
    Commands:
      sprint      - Focus on Sprint panel
      git         - Focus on Git panel
      diffs       - Focus on Diffs panel
      todo        - Focus on Todo panel
      workflow    - Focus on Workflow panel
      background  - Focus on Background panel
      audit-log   - Focus on Audit Log panel
      changed     - Focus on Changed panel
      ac          - Focus on Acceptance Criteria panel
      debug       - Focus on Debug panel
      settings    - Focus on Settings panel
      tty         - Focus on TTY panel
      reset       - Clear focus setting
    """
    pass


def _make_focus_command(panel_name: str):
    """Create a Click command for a panel."""

    @click.command(panel_name, help=f"Focus on {panel_name} panel.")
    @click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
    def focus_cmd(dry_run):
        if dry_run:
            click.echo(json.dumps({"dry_run": True, "action": "set_focus", "panel": panel_name}))
            return
        result = set_panel_focus(panel_name)
        if result["success"]:
            click.echo(json.dumps({"success": True, "panel": result["data"]}))
        else:
            click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
            sys.exit(1)

    return focus_cmd


for _panel in VALID_PANELS:
    bc.add_command(_make_focus_command(_panel))


@bc.command("reset")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def reset_focus(dry_run):
    """Clear focus setting."""
    if dry_run:
        click.echo(json.dumps({"dry_run": True, "action": "clear_focus"}))
        return
    result = clear_panel_focus()
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "focus cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


# --- Story 104-4: Named layout commands ---


@bc.command("save")
@click.argument("name")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def save_layout(name: str, dry_run: bool):
    """Save current layout under a name.

    Fetches the active layout from the running Cyclist/BikeRack server
    and stores it in config.local.yaml under the given name.
    """
    layout_data = _get_current_layout()
    if not layout_data:
        click.echo(
            json.dumps({"success": False, "error": "No running Cyclist/BikeRack server found, or layout is empty"}),
            err=True,
        )
        sys.exit(1)
    if dry_run:
        panel_count = len(layout_data.get("panels", {}))
        click.echo(json.dumps({"dry_run": True, "action": "save_layout", "name": name, "panels": panel_count}))
        return
    result = save_named_layout(name, layout_data)
    if result["success"]:
        panel_count = len(layout_data.get("panels", {}))
        click.echo(json.dumps({"success": True, "name": result["data"], "panels": panel_count}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("load")
@click.argument("name")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def load_layout(name: str, dry_run: bool):
    """Load a previously saved named layout."""
    if dry_run:
        click.echo(json.dumps({"dry_run": True, "action": "load_layout", "name": name}))
        return
    result = load_named_layout(name)
    if result["success"]:
        click.echo(json.dumps({"success": True, "name": name, "layout": result["data"]}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("list")
def list_layouts():
    """List all saved named layouts."""
    result = list_named_layouts()
    if result["success"]:
        click.echo(json.dumps({"success": True, "layouts": result["data"]}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("clear")
@click.argument("name")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def clear_layout(name: str, dry_run: bool):
    """Delete a specific named layout."""
    if dry_run:
        click.echo(json.dumps({"dry_run": True, "action": "clear_layout", "name": name}))
        return
    result = clear_named_layout(name)
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "layout cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("split")
@click.argument("left")
@click.argument("right")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def split_layout(left: str, right: str, dry_run: bool):
    """Set split-pane layout with LEFT and RIGHT panels.

    Example: pf bc split sprint diffs
    """
    if dry_run:
        click.echo(json.dumps({"dry_run": True, "action": "split", "left": left, "right": right}))
        return
    result = set_split_layout(left, right)
    if result["success"]:
        click.echo(json.dumps({"success": True, "split": result["data"]}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("clear-all")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def clear_all_layouts(dry_run: bool):
    """Delete all named layouts."""
    if dry_run:
        click.echo(json.dumps({"dry_run": True, "action": "clear_all_layouts"}))
        return
    result = clear_all_named_layouts()
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "all layouts cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)
