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

import click

from pennyfarthing_scripts.bc.focus import (
    VALID_PANELS,
    clear_all_named_layouts,
    clear_named_layout,
    clear_panel_focus,
    list_named_layouts,
    load_named_layout,
    save_named_layout,
    set_panel_focus,
)


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

    @click.command(panel_name)
    def focus_cmd():
        result = set_panel_focus(panel_name)
        if result["success"]:
            click.echo(json.dumps({"success": True, "panel": result["data"]}))
        else:
            click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
            sys.exit(1)

    focus_cmd.__doc__ = f"Focus on {panel_name} panel."
    return focus_cmd


for _panel in VALID_PANELS:
    bc.add_command(_make_focus_command(_panel))


@bc.command("reset")
def reset_focus():
    """Clear focus setting."""
    result = clear_panel_focus()
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "focus cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


# --- Story 104-4: Named layout commands (stubs) ---


@bc.command("save")
@click.argument("name")
def save_layout(name: str):
    """Save current layout under a name."""
    result = save_named_layout(name, {})  # stub — layout_data comes from client
    if result["success"]:
        click.echo(json.dumps({"success": True, "name": result["data"]}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("load")
@click.argument("name")
def load_layout(name: str):
    """Load a previously saved named layout."""
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
def clear_layout(name: str):
    """Delete a specific named layout."""
    result = clear_named_layout(name)
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "layout cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)


@bc.command("clear-all")
def clear_all_layouts():
    """Delete all named layouts."""
    result = clear_all_named_layouts()
    if result["success"]:
        click.echo(json.dumps({"success": True, "message": result.get("message", "all layouts cleared")}))
    else:
        click.echo(json.dumps({"success": False, "error": result["error"]}), err=True)
        sys.exit(1)
