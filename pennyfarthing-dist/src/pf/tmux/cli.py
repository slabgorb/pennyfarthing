"""
pf tmux — Pane management subsystem.

Provides role-based pane targeting, idle detection, and split strategy
to prevent agents from targeting the wrong tmux pane.
"""

from __future__ import annotations

import json
import os

import click

from pf.common.config import get_project_root
from pf.tmux import panes
from pf.tmux.registry import (
    DEFAULT_MAX_PANES,
    choose_direction,
    find_idle_worker,
    find_split_target,
    load_registry,
    next_worker_number,
    reconcile,
    resolve_pane_ref,
    save_registry,
    _classify_pane,
    _empty_registry,
)


def _get_context() -> tuple:
    """Get project root and session name, or exit with error."""
    root = get_project_root()

    if not panes.is_tmux_running():
        click.echo("Error: No tmux server running on pf socket.", err=True)
        click.echo("Start with: just dev", err=True)
        raise SystemExit(1)

    session_result = panes.get_session_name()
    if not session_result["success"]:
        click.echo(f"Error: {session_result['error']}", err=True)
        raise SystemExit(1)

    return root, session_result["data"]


@click.group()
def tmux():
    """Pane management for tmux sessions.

    \b
    Commands:
      list      - Show all panes with role and status
      run       - Run a command in an idle worker pane
      create    - Create a new worker pane
      send      - Send keys to a pane by reference
      close     - Close a pane by reference
      register  - Force full registry rebuild
    """
    pass


@tmux.command("list")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def list_panes(as_json: bool):
    """Show all panes with role, idle/busy status, and protection."""
    root, session = _get_context()

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        click.echo(f"Error: {reg_result['error']}", err=True)
        raise SystemExit(1)

    reg = reg_result["data"]
    live_result = panes.list_live_panes(session)
    live_by_id = {p["pane_id"]: p for p in live_result.get("data", [])}

    if as_json:
        output = []
        for entry in reg["panes"]:
            live = live_by_id.get(entry["pane_id"], {})
            output.append({
                **entry,
                "command": live.get("command", ""),
                "idle": panes.is_pane_idle(live.get("command", "")),
                "width": live.get("width", 0),
                "height": live.get("height", 0),
            })
        click.echo(json.dumps(output, indent=2))
        return

    click.echo(f"Session: {session}  (max_panes: {reg['max_panes']})")
    click.echo(f"{'ID':<8} {'Role':<10} {'Title':<20} {'Status':<12} {'Protected'}")
    click.echo("-" * 62)

    for entry in reg["panes"]:
        live = live_by_id.get(entry["pane_id"], {})
        cmd = live.get("command", "?")
        idle = panes.is_pane_idle(cmd)
        status = "idle" if idle else f"busy ({cmd})"
        prot = "yes" if entry["protected"] else ""
        click.echo(f"{entry['pane_id']:<8} {entry['role']:<10} {entry['title']:<20} {status:<12} {prot}")


@tmux.command("run")
@click.argument("command")
@click.option("--title", help="Title for new pane if created")
def run_command(command: str, title: str | None):
    """Run a command in an idle worker pane.

    Finds an idle worker, or creates one if under max_panes.
    """
    root, session = _get_context()

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        click.echo(f"Error: {reg_result['error']}", err=True)
        raise SystemExit(1)

    reg = reg_result["data"]
    live_result = panes.list_live_panes(session)
    if not live_result["success"]:
        click.echo(f"Error: {live_result['error']}", err=True)
        raise SystemExit(1)
    live = live_result["data"]

    # Try to find idle worker
    target = find_idle_worker(reg, live)

    if target is None:
        # Try to create one
        total = len(reg["panes"])
        if total >= reg.get("max_panes", DEFAULT_MAX_PANES):
            click.echo("Error: No idle worker panes and at max_panes limit.", err=True)
            click.echo("Current panes:", err=True)
            for p in reg["panes"]:
                click.echo(f"  {p['pane_id']} {p['role']} {p['title']}", err=True)
            raise SystemExit(1)

        # Create a new worker pane
        split_target = find_split_target(reg, live)
        if split_target is None:
            click.echo("Error: No pane available to split.", err=True)
            raise SystemExit(1)

        live_target = next((p for p in live if p["pane_id"] == split_target), None)
        if live_target is None:
            click.echo("Error: Split target pane not found.", err=True)
            raise SystemExit(1)

        direction = choose_direction(live_target["width"], live_target["height"])
        cwd = os.getcwd()

        split_result = panes.split_pane(session, split_target, direction, 50, cwd)
        if not split_result["success"]:
            click.echo(f"Error creating pane: {split_result['error']}", err=True)
            raise SystemExit(1)

        target = split_result["data"].strip()
        worker_num = next_worker_number(reg)
        pane_title = title or f"Worker {worker_num}"

        panes.set_pane_title(target, pane_title)
        reg["panes"].append({
            "pane_id": target,
            "role": "worker",
            "title": pane_title,
            "protected": False,
            "owner": None,
        })
        save_registry(root, reg)

    # Send the command
    send_result = panes.send_keys(target, command)
    if not send_result["success"]:
        click.echo(f"Error: {send_result['error']}", err=True)
        raise SystemExit(1)

    click.echo(target)


@tmux.command("create")
@click.option(
    "--role",
    type=click.Choice(["worker", "agent", "script"]),
    default="worker",
    help="Pane role",
)
@click.option("--title", help="Pane title")
@click.option("--owner", help="Owner name (agent, script, etc.)")
def create_pane(role: str, title: str | None, owner: str | None):
    """Create a new pane with the given role."""
    root, session = _get_context()

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        click.echo(f"Error: {reg_result['error']}", err=True)
        raise SystemExit(1)

    reg = reg_result["data"]
    total = len(reg["panes"])
    max_p = reg.get("max_panes", DEFAULT_MAX_PANES)

    if total >= max_p:
        click.echo(f"Error: At pane limit ({total}/{max_p}).", err=True)
        raise SystemExit(1)

    live_result = panes.list_live_panes(session)
    if not live_result["success"]:
        click.echo(f"Error: {live_result['error']}", err=True)
        raise SystemExit(1)
    live = live_result["data"]

    split_target = find_split_target(reg, live)
    if split_target is None:
        click.echo("Error: No pane available to split.", err=True)
        raise SystemExit(1)

    live_target = next((p for p in live if p["pane_id"] == split_target), None)
    if live_target is None:
        click.echo("Error: Split target pane not found.", err=True)
        raise SystemExit(1)

    direction = choose_direction(live_target["width"], live_target["height"])
    cwd = os.getcwd()

    split_result = panes.split_pane(session, split_target, direction, 50, cwd)
    if not split_result["success"]:
        click.echo(f"Error creating pane: {split_result['error']}", err=True)
        raise SystemExit(1)

    new_id = split_result["data"].strip()
    worker_num = next_worker_number(reg)
    pane_title = title or f"Worker {worker_num}"

    panes.set_pane_title(new_id, pane_title)
    reg["panes"].append({
        "pane_id": new_id,
        "role": role,
        "title": pane_title,
        "protected": False,
        "owner": owner,
    })
    save_registry(root, reg)

    click.echo(new_id)


@tmux.command("send")
@click.argument("pane_ref")
@click.argument("command")
def send_command(pane_ref: str, command: str):
    """Send a command to a pane by reference (pane_id, role, or title).

    Protected panes (claude, tui) will be refused.
    """
    root, session = _get_context()

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        click.echo(f"Error: {reg_result['error']}", err=True)
        raise SystemExit(1)

    reg = reg_result["data"]
    entry = resolve_pane_ref(reg, pane_ref)

    if entry is None:
        click.echo(f"Error: No pane matching '{pane_ref}'.", err=True)
        raise SystemExit(1)

    if entry["protected"]:
        click.echo(f"Error: Pane '{entry['title']}' ({entry['role']}) is protected.", err=True)
        raise SystemExit(1)

    send_result = panes.send_keys(entry["pane_id"], command)
    if not send_result["success"]:
        click.echo(f"Error: {send_result['error']}", err=True)
        raise SystemExit(1)

    click.echo(f"Sent to {entry['pane_id']}")


@tmux.command("close")
@click.argument("pane_ref")
def close_pane(pane_ref: str):
    """Close a pane by reference. Protected panes are refused."""
    root, session = _get_context()

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        click.echo(f"Error: {reg_result['error']}", err=True)
        raise SystemExit(1)

    reg = reg_result["data"]
    entry = resolve_pane_ref(reg, pane_ref)

    if entry is None:
        click.echo(f"Error: No pane matching '{pane_ref}'.", err=True)
        raise SystemExit(1)

    if entry["protected"]:
        click.echo(f"Error: Pane '{entry['title']}' ({entry['role']}) is protected.", err=True)
        raise SystemExit(1)

    kill_result = panes.kill_pane(entry["pane_id"])
    if not kill_result["success"]:
        click.echo(f"Error: {kill_result['error']}", err=True)
        raise SystemExit(1)

    reg["panes"] = [p for p in reg["panes"] if p["pane_id"] != entry["pane_id"]]
    save_registry(root, reg)

    click.echo(f"Closed {entry['pane_id']}")


@tmux.command("register")
def register():
    """Force full registry rebuild from live tmux state."""
    root, session = _get_context()

    live_result = panes.list_live_panes(session)
    if not live_result["success"]:
        click.echo(f"Error: {live_result['error']}", err=True)
        raise SystemExit(1)

    live = live_result["data"]
    reg = _empty_registry(session)

    for lp in live:
        role, protected = _classify_pane(lp["title"])
        reg["panes"].append({
            "pane_id": lp["pane_id"],
            "role": role,
            "title": lp["title"],
            "protected": protected,
            "owner": None,
        })

    save_result = save_registry(root, reg)
    if not save_result["success"]:
        click.echo(f"Error: {save_result['error']}", err=True)
        raise SystemExit(1)

    click.echo(f"Registered {len(reg['panes'])} panes:")
    for p in reg["panes"]:
        prot = " [protected]" if p["protected"] else ""
        click.echo(f"  {p['pane_id']} {p['role']}: {p['title']}{prot}")
