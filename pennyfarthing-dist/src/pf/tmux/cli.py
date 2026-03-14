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
from pf.tmux import registry as _registry
from pf.tmux.registry import (
    DEFAULT_MAX_PANES,
    _classify_pane,
    _empty_registry,
    choose_direction,
    find_idle_worker,
    find_split_target,
    next_worker_number,
    resolve_pane_ref,
    save_registry,
)


def _get_context() -> tuple:
    """Get project root and session name, or exit with error.

    Auto-starts a tmux server on the pf socket if none is running.
    """
    root = get_project_root()

    if not panes.is_tmux_running():
        ensure_result = panes.ensure_server()
        if not ensure_result["success"]:
            click.echo(f"Error: Could not start tmux server: {ensure_result['error']}", err=True)
            raise SystemExit(1)
        click.echo("Started tmux server on pf socket.", err=True)

    session_result = panes.get_session_name()
    if not session_result["success"]:
        click.echo(f"Error: {session_result['error']}", err=True)
        raise SystemExit(1)

    return root, session_result["data"]


def _require_tmux_pane() -> str:
    """Return TMUX_PANE or exit with error if not inside a tmux pane."""
    pane_id = os.environ.get("TMUX_PANE")
    if not pane_id:
        click.echo("Error: Not running inside a tmux pane (TMUX_PANE not set).", err=True)
        raise SystemExit(1)
    return pane_id


def _get_pane_details(pane_id: str) -> dict:
    """Fetch details for a single pane via tmux display-message.

    Returns dict with pane_id, title, command, width, height.
    Exits on failure.
    """
    fmt = "#{pane_id}\t#{pane_title}\t#{pane_current_command}\t#{pane_width}\t#{pane_height}"
    result = panes._run_tmux("display-message", "-t", pane_id, "-p", fmt)
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    parts = result["data"].split("\t")
    if len(parts) < 5:
        click.echo("Error: Could not parse pane details.", err=True)
        raise SystemExit(1)

    return {
        "pane_id": parts[0],
        "title": parts[1],
        "command": parts[2],
        "width": int(parts[3]),
        "height": int(parts[4]),
    }


def _emit(data: dict | list, as_json: bool, fmt_fn=None):
    """Output data as JSON or formatted text.

    Args:
        data: The data to output.
        as_json: If True, output as JSON.
        fmt_fn: Callable that takes data and returns a string for text mode.
    """
    if as_json:
        click.echo(json.dumps(data, indent=2))
    elif fmt_fn:
        click.echo(fmt_fn(data))
    else:
        click.echo(str(data))


@click.group()
def tmux():
    """Pane management for tmux sessions.

    \b
    Commands:
      cli       - Show the pane running this CLI session
      window    - Show the window and all its panes
      tui       - Find the TUI pane for this CLI session
      read      - Capture content from a pane
      list      - Show all panes with role and status
      run       - Run a command in an idle worker pane
      create    - Create a new worker pane
      send      - Send keys to a pane by reference
      close     - Close a pane by reference
      register  - Force full registry rebuild
    """
    pass


@tmux.command("cli")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def cli_pane(as_json: bool):
    """Show the tmux pane running this CLI session.

    Reads TMUX_PANE to identify the current pane and returns its details.
    """
    info = _get_pane_details(_require_tmux_pane())
    _emit(info, as_json, lambda d: f"{d['pane_id']}  {d['title']}  ({d['width']}x{d['height']})")


@tmux.command("window")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def window_info(as_json: bool):
    """Show the tmux window containing this CLI session and all its panes.

    Identifies the current window via TMUX_PANE and lists all sibling panes.
    """
    current_pane = _require_tmux_pane()

    win_result = panes.get_window_for_pane(current_pane)
    if not win_result["success"]:
        click.echo(f"Error: {win_result['error']}", err=True)
        raise SystemExit(1)

    window_id = win_result["data"]
    panes_result = panes.list_window_panes(window_id)
    if not panes_result["success"]:
        click.echo(f"Error: {panes_result['error']}", err=True)
        raise SystemExit(1)

    data = {"window_id": window_id, "panes": panes_result["data"]}

    def _fmt(d):
        lines = [
            f"Window: {d['window_id']}",
            f"{'ID':<8} {'Title':<20} {'Command':<15} {'Size'}",
            "-" * 55,
        ]
        for p in d["panes"]:
            marker = " ◀" if p["pane_id"] == current_pane else ""
            lines.append(f"{p['pane_id']:<8} {p['title']:<20} {p['command']:<15} {p['width']}x{p['height']}{marker}")
        return "\n".join(lines)

    _emit(data, as_json, _fmt)


# TUI panel knowledge — what agents need to understand the dashboard
_TUI_PANELS = [
    {
        "key": "sprint",
        "name": "Sprint",
        "channel": "sprint",
        "purpose": "Sprint backlog — stories grouped by epic, status, points",
        "switch": "pf bc sprint",
        "stale_when": "Shows old point totals after story add/finish; refresh by restarting Frame",
        "read_tip": "Tree view: ▼/▶ = expanded/collapsed epic, ◯ = backlog, ✓ = done, ⟳ = in-progress",
    },
    {
        "key": "git",
        "name": "Git",
        "channel": "git",
        "purpose": "Git status across all repos — dirty files, branch, ahead/behind",
        "switch": "pf bc git",
        "stale_when": "Git data pushed on file changes; stale if Frame disconnected",
        "read_tip": "Shows repo sections with branch name and file lists",
    },
    {
        "key": "diffs",
        "name": "Diffs",
        "channel": "diffs",
        "purpose": "Unified diff of uncommitted changes across repos",
        "switch": "pf bc diffs",
        "stale_when": "Updated on file save; may lag behind rapid edits",
        "read_tip": "Standard unified diff format with +/- lines",
    },
    {
        "key": "audit-log",
        "name": "Audit Log",
        "channel": "spans",
        "purpose": "OTEL trace spans — tool calls, agent events, timing",
        "switch": "pf bc audit-log",
        "stale_when": "Requires OTEL forwarding from Frame; empty if Frame not running",
        "read_tip": "Chronological span list with duration and status",
    },
    {
        "key": "debug",
        "name": "Debug",
        "channel": "context",
        "purpose": "Context window usage, token stats, model info",
        "switch": "pf bc debug",
        "stale_when": "Subscribes to context channel; stale if no recent Claude activity",
        "read_tip": "Shows token counts, usage percentages, context tier",
    },
    {
        "key": "progress",
        "name": "Progress",
        "channel": "story",
        "purpose": "Active story progress — ACs, phase, workflow state",
        "switch": "pf bc progress",
        "stale_when": "Reads session file; stale if session created after TUI started",
        "read_tip": "AC checklist with completion indicators",
    },
    {
        "key": "settings",
        "name": "Settings",
        "channel": None,
        "purpose": "Configuration editor — theme, bell mode, relay mode, etc.",
        "switch": "pf bc settings",
        "stale_when": "Reads config.local.yaml; always current on panel open",
        "read_tip": "Key-value settings list",
    },
    {
        "key": "repos",
        "name": "Repos",
        "channel": None,
        "purpose": "Repo topology — ownership, symlinks, never-edit zones",
        "switch": "pf bc repos",
        "stale_when": "Reads repos.yaml; always current",
        "read_tip": "Collapsible sections per repo with ownership and symlink details",
    },
    {
        "key": "benchmark",
        "name": "Benchmark",
        "channel": "benchmark-history",
        "purpose": "Peloton benchmark results — run history, scores, comparisons",
        "switch": "pf bc benchmark",
        "stale_when": "Updated when benchmark runs complete; empty if no runs",
        "read_tip": "Table of runs with scores and theme comparisons",
    },
]

# TUI layout regions
_TUI_REGIONS = {
    "menu": "Tab bar at top — click or keyboard to switch panels",
    "profile": "Agent portrait — shows current agent character, role, theme",
    "content": "Main panel area — displays the active panel",
    "status": "Footer bar — project name, story ID, model, context usage meter",
}

# Degradation indicators for agents
_DEGRADATION_SIGNALS = {
    "disconnected": "Footer shows '● Disconnected' in red — Frame server not running or crashed. Fix: `pf frame start`",
    "reconnecting": "Footer shows '● Reconnecting…' in yellow — transient network issue, will auto-recover",
    "context_stale": "Context bar shows '░░░░░░░░░░ --%%' — no context data received yet",
    "context_error": "Context bar shows '[err]' in red — context check failed",
    "empty_panel": "Panel shows no content — either no data source or Frame channel not connected",
}


@tmux.command("tui")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
@click.option("--brief", is_flag=True, help="Just pane ID and size (no guide)")
def tui_pane(as_json: bool, brief: bool):
    """Find the TUI pane attached to this CLI session.

    Uses TMUX_PANE to identify the current pane, then finds the sibling
    TUI pane in the same tmux window. Includes a guide to TUI panels,
    switching, and health indicators for agent use.
    """
    result = panes.find_sibling_tui(_require_tmux_pane())
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    tui_info = result["data"]

    if brief:
        _emit(tui_info, as_json, lambda d: f"{d['pane_id']}  {d['title']}  ({d['width']}x{d['height']})")
        return

    data = {
        "pane": tui_info,
        "panels": _TUI_PANELS,
        "regions": _TUI_REGIONS,
        "degradation_signals": _DEGRADATION_SIGNALS,
        "commands": {
            "switch_panel": "pf bc <panel-key>",
            "read_content": "pf tmux read",
            "read_specific": "pf tmux read <pane_ref>",
            "split_view": "pf bc split <left> <right>",
            "reset_focus": "pf bc reset",
        },
    }

    if as_json:
        click.echo(json.dumps(data, indent=2))
        return

    # Human/agent-readable formatted output
    lines = [
        f"TUI Pane: {tui_info['pane_id']}  ({tui_info['width']}x{tui_info['height']})",
        "",
        "Layout Regions:",
    ]
    for region, desc in _TUI_REGIONS.items():
        lines.append(f"  {region:<10} {desc}")

    lines.append("")
    lines.append("Panels:")
    lines.append(f"  {'Key':<12} {'Channel':<18} {'Purpose'}")
    lines.append(f"  {'-'*11} {'-'*17} {'-'*40}")
    for p in _TUI_PANELS:
        ch = p["channel"] or "local"
        lines.append(f"  {p['key']:<12} /ws/{ch:<14} {p['purpose'][:50]}")

    lines.append("")
    lines.append("Switch Panel:  pf bc <key>     (e.g. pf bc sprint)")
    lines.append("Read Content:  pf tmux read    (captures current TUI content)")
    lines.append("Split View:    pf bc split <left> <right>")

    lines.append("")
    lines.append("Health Indicators (in status footer):")
    for signal, desc in _DEGRADATION_SIGNALS.items():
        lines.append(f"  {signal}: {desc}")

    click.echo("\n".join(lines))


@tmux.command("read")
@click.argument("pane_ref", default="tui")
@click.option("--history", default=0, type=int, help="Scrollback lines to include (0 = visible only)")
def read_pane(pane_ref: str, history: int):
    """Capture the visible content of a pane.

    PANE_REF can be a pane_id (%5), role (tui, claude), title, or 'tui'
    (default) to auto-resolve the sibling TUI pane.
    """
    # Resolve 'tui' shortcut to sibling TUI pane
    if pane_ref == "tui":
        current = _require_tmux_pane()
        tui_result = panes.find_sibling_tui(current)
        if not tui_result["success"]:
            click.echo(f"Error: {tui_result['error']}", err=True)
            raise SystemExit(1)
        target_id = tui_result["data"]["pane_id"]
    elif pane_ref.startswith("%"):
        target_id = pane_ref
    else:
        # Resolve via registry
        root, session = _get_context()
        reg_result = _registry.load_registry(root, session)
        if not reg_result["success"]:
            click.echo(f"Error: {reg_result['error']}", err=True)
            raise SystemExit(1)
        entry = resolve_pane_ref(reg_result["data"], pane_ref)
        if entry is None:
            click.echo(f"Error: No pane matching '{pane_ref}'.", err=True)
            raise SystemExit(1)
        target_id = entry["pane_id"]

    result = panes.capture_pane(target_id, history)
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    click.echo(result["data"])


@tmux.command("list")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def list_panes(as_json: bool):
    """Show all panes with role, idle/busy status, and protection."""
    root, session = _get_context()

    reg_result = _registry.load_registry(root, session)
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
                "icon": panes.get_pane_icon(entry["role"]),
                "command": live.get("command", ""),
                "idle": panes.is_pane_idle(live.get("command", "")),
                "width": live.get("width", 0),
                "height": live.get("height", 0),
            })
        click.echo(json.dumps(output, indent=2))
        return

    click.echo(f"Session: {session}  (max_panes: {reg['max_panes']})")
    click.echo(f"{'':3} {'ID':<8} {'Role':<10} {'Title':<20} {'Status':<12} {'Protected'}")
    click.echo("-" * 65)

    for entry in reg["panes"]:
        live = live_by_id.get(entry["pane_id"], {})
        cmd = live.get("command", "?")
        idle = panes.is_pane_idle(cmd)
        status = "idle" if idle else f"busy ({cmd})"
        prot = "yes" if entry["protected"] else ""
        icon = panes.get_pane_icon(entry["role"])
        click.echo(f"{icon:3} {entry['pane_id']:<8} {entry['role']:<10} {entry['title']:<20} {status:<12} {prot}")


@tmux.command("run")
@click.argument("command")
@click.option("--title", help="Title for new pane if created")
def run_command(command: str, title: str | None):
    """Run a command in an idle worker pane.

    Finds an idle worker, or creates one if under max_panes.
    """
    root, session = _get_context()

    reg_result = _registry.load_registry(root, session)
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

    reg_result = _registry.load_registry(root, session)
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

    reg_result = _registry.load_registry(root, session)
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

    reg_result = _registry.load_registry(root, session)
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
