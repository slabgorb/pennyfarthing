"""SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: First panel implementation proving the BasePanel vertical slice.
Story 110-2: Added per-story cursor navigation and drill-through.
Migrated to Textual Tree widget for native hierarchy navigation.
Subscribes to /ws/sprint, renders sprint status with epic/story tree.
"""

from __future__ import annotations

import platform
import subprocess
from typing import Any

from rich.text import Text
from textual.app import ComposeResult
from textual.message import Message
from textual.widget import Widget
from textual.widgets import Static, Tree

from pf.bikerack.base_panel import PANEL_ICONS, render_progress_bar


def _normalize_status(status: str) -> str:
    """Normalize status string: lowercase, strip, hyphens for separators."""
    s = status.lower().strip().replace("_", "-") if status else ""
    # Normalize both British and American spelling
    if s == "cancelled":
        s = "canceled"
    return s


def _is_terminal(status: str) -> bool:
    """Return True if the normalized status is done or canceled."""
    return _normalize_status(status) in {"done", "canceled"}


def _status_badge(status: str) -> Text:
    """Convert status string to styled Rich Text badge (symbol only, no text)."""
    s = _normalize_status(status)
    if s == "done":
        return Text("\u2713", style="dim green")
    if s == "canceled":
        return Text("\u2715", style="dim")
    if s == "in-progress":
        return Text("\u27f3", style="bold yellow")
    if s == "backlog":
        return Text("\u25ef", style="dim")
    if s == "blocked":
        return Text("!", style="bold red")
    if s == "review":
        return Text("\u25ce", style="cyan")
    return Text("\u2014", style="dim")


def _format_assignee(email: str | None) -> str:
    """Format an email address into a short display name.

    ``"keith.avery@1898andco.io"`` → ``"K. Avery"``
    ``None`` → ``""``
    """
    if not email:
        return ""
    local = email.split("@")[0]
    parts = local.replace("_", ".").split(".")
    if len(parts) < 2:
        return parts[0].capitalize()
    first_initial = parts[0][0].upper() if parts[0] else ""
    last = parts[-1].capitalize()
    return f"{first_initial}. {last}"


def _should_expand(epic: dict[str, Any]) -> bool:
    """Check if an epic should be expanded by default (has incomplete work).

    Epics that are canceled, or whose stories are all done/canceled, collapse.
    """
    if _is_terminal(epic.get("status", "")):
        return False
    stories = epic.get("stories", [])
    total_pts = 0
    done_pts = 0
    has_in_progress = False
    for story in stories:
        pts = story.get("points", 0)
        if isinstance(pts, (int, float)):
            total_pts += pts
            if _is_terminal(story.get("status", "")):
                done_pts += pts
            if _normalize_status(story.get("status", "")) == "in-progress":
                has_in_progress = True
    return has_in_progress or done_pts < total_pts


_EPIC_ID_WIDTH = 11  # "MSSCI-NNNNN" = 11 chars

# Sort order: actionable items first, completed last
_STATUS_ORDER = {"in-progress": 0, "review": 1, "blocked": 2, "backlog": 3, "done": 4, "canceled": 5}


def _build_epic_label(
    epic_id: str,
    title: str,
    done_pts: int,
    total_pts: int,
    jira_key: str = "",
    completed: bool = False,
    max_width: int = 80,
) -> Text:
    """Build Rich Text label for an epic tree node."""
    id_style = "dim cyan" if completed else "bold cyan"
    title_style = "dim" if completed else "bold"
    bar_fill = "dim" if completed else "dim green"

    label = Text(no_wrap=True, overflow="ellipsis")
    display_id = jira_key if jira_key else epic_id
    if len(display_id) > _EPIC_ID_WIDTH:
        display_id = display_id[: _EPIC_ID_WIDTH - 1] + "\u2026"
    display_id = f"{display_id:<{_EPIC_ID_WIDTH}}"
    label.append(display_id, style=id_style)
    label.append("  ")
    if total_pts > 0:
        pct = int(done_pts / total_pts * 100)
        label.append_text(
            render_progress_bar(pct, width=10, fill_style=bar_fill, show_percent=False)
        )
        label.append(f" {done_pts}/{total_pts} pts", style="dim")
    else:
        label.append("0 pts", style="dim")
    # Truncate title with ellipsis to fit available width
    # Account for "  " prefix and tree indent (~4 chars for guides + arrow)
    used = len(label.plain) + 2  # +2 for "  " before title
    available = max_width - used - 4  # ~4 for tree indent
    if available > 0 and len(title) > available:
        title = title[: available - 1] + "\u2026"
    label.append(f"  {title}", style=title_style)
    return label


def _build_story_label(
    story: dict[str, Any], current_story_id: str, max_width: int = 80
) -> Text:
    """Build Rich Text label for a story tree leaf.

    Layout: ``✓  MSSCI-14952   2  Story title``
    In-progress adds owner: ``⟳  MSSCI-15186   5  Story title  [K. Avery]``
    Done stories are rendered entirely dim.
    """
    story_id = story.get("id", "")
    title = story.get("title", "")
    pts = story.get("points", "")
    jira = story.get("jiraKey") or "\u2014"
    status = _normalize_status(story.get("status", ""))
    badge = _status_badge(story.get("status", ""))

    is_done = _is_terminal(story.get("status", ""))
    is_in_progress = status == "in-progress"
    is_current = story_id == current_story_id

    label = Text(no_wrap=True, overflow="ellipsis")
    label.append_text(badge)

    # MSSCI key flush left, fixed-width (14 chars — fits "MSSCI-NNNNN" + padding)
    jira_padded = f"{jira:<14}"
    label.append(f"  {jira_padded}", style="dim" if is_done else ("bold cyan" if is_current else "cyan"))

    # Points right-aligned with unit
    pts_str = f"{pts}pt" if isinstance(pts, int) else f"{pts!s}pt"
    label.append(f"  {pts_str:>4}", style="dim")

    # Truncate title to fit available width
    # Reserve space for owner suffix on in-progress stories (~12 chars)
    used = len(label.plain) + 2  # +2 for "  " before title
    owner_reserve = 12 if is_in_progress else 0
    # ~6 for tree indent (deeper than epics: guide_depth + parent + leaf)
    available = max_width - used - 6 - owner_reserve
    if available > 0 and len(title) > available:
        title = title[: available - 1] + "\u2026"

    # Title
    label.append(f"  {title}", style="dim" if is_done else "")

    # Owner for in-progress stories
    if is_in_progress:
        owner = _format_assignee(story.get("assignee"))
        if owner:
            label.append(f"  [{owner}]", style="dim yellow")

    if is_current:
        label.stylize("bold")

    if is_done:
        label.stylize("dim")

    return label


class SprintPanel(Widget):
    """Sprint panel using native Textual Tree widget.

    Subscribes to the ``sprint`` WebSocket channel and renders
    sprint status as a Tree with epic/story hierarchy.
    """

    DEFAULT_CSS = """
    SprintPanel {
        height: 1fr;
        layout: vertical;
    }
    #sprint-header {
        height: auto;
        max-height: 3;
        padding: 0 1;
    }
    #sprint-hints {
        height: 1;
        padding: 0 1;
    }
    #sprint-tree {
        height: 1fr;
    }
    """

    channel: str = "sprint"
    panel_name: str = "Sprint"
    icon: str = PANEL_ICONS["sprint"][0]
    can_focus = True

    class DataReceived(Message, bubble=False):
        """WebSocket data received — triggers tree rebuild."""

        def __init__(self, payload: dict[str, Any]) -> None:
            super().__init__()
            self.payload = payload

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client
        self._last_payload: dict[str, Any] | None = None
        self._mounted = False

    def compose(self) -> ComposeResult:
        yield Static(
            "[dim]Waiting for sprint data...[/dim]", id="sprint-header"
        )
        yield Static(
            "[dim bright_black]\u2191/\u2193:navigate  space:expand/collapse  Enter:open  j/k/e:vim  c:copy ID[/dim bright_black]",
            id="sprint-hints",
        )
        tree: Tree[dict[str, Any]] = Tree("Sprint", id="sprint-tree")
        tree.show_root = False
        tree.guide_depth = 3
        yield tree

    def on_mount(self) -> None:
        """Subscribe to sprint channel via WS client."""
        self._mounted = True
        if self._client is not None and self.channel:
            self._client.subscribe(self.channel, self._handle_ws_message)

    def on_unmount(self) -> None:
        """Mark unmounted so WS callbacks are ignored."""
        self._mounted = False

    def focus(self, scroll_visible: bool = True) -> SprintPanel:
        """Delegate focus to the tree widget."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            tree.focus(scroll_visible)
        except Exception:
            super().focus(scroll_visible)
        return self

    # --- WebSocket message handling ---

    def _handle_ws_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket message (called from async WS task)."""
        if not self._mounted or message is None:
            return
        self._last_payload = message
        try:
            self.post_message(self.DataReceived(message))
        except Exception:
            pass

    def on_sprint_panel_data_received(self, event: DataReceived) -> None:
        """Process data in Textual message context — rebuilds tree."""
        self._rebuild_tree(event.payload)

    # --- Tree rebuild ---

    def _rebuild_tree(self, payload: dict[str, Any]) -> None:
        """Rebuild tree nodes from sprint payload, preserving expand/cursor state."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
        except Exception:
            return

        sprint = payload.get("sprint", {})
        epics = payload.get("epics", [])
        current_story_id = sprint.get("currentStory", "")
        tree_width = tree.size.width if tree.size.width > 0 else 80

        # Update header — compact icon format to avoid wrapping on narrow panes
        sprint_num = sprint.get("number", "")
        done = sprint.get("done", 0)
        remaining = sprint.get("remaining", 0)
        in_progress = sprint.get("inProgress", 0)
        total = done + remaining + in_progress
        pct = int(done / total * 100) if total > 0 else 0
        # Use compact unit "p" on narrow panes (<55 chars), "pts" otherwise
        unit = "p" if tree_width < 55 else " pts"
        header_text = Text.from_markup(
            f"Sprint {sprint_num}  "
            f"[green]\u2713{done}{unit}[/green]  "
            f"\u25ef{remaining}{unit}  "
            f"[yellow]\u27f3{in_progress}{unit}[/yellow]  "
            f"[dim]{pct}%[/dim]"
        )
        registry = payload.get("registry")
        if registry and not registry.get("isDefault", True):
            reg_type = registry.get("type", "")
            reg_name = registry.get("name", "")
            if reg_type and reg_name:
                header_text.append(f" [{reg_type}:{reg_name}]")
            elif reg_name:
                header_text.append(f" [{reg_name}]")
            elif reg_type:
                header_text.append(f" [{reg_type}]")
        try:
            self.query_one("#sprint-header", Static).update(header_text)
        except Exception:
            pass

        # Save expand state from current tree nodes
        saved_expanded: dict[str, bool] = {}
        for node in tree.root.children:
            data = node.data
            if data and data.get("type") in ("epic", "future_initiative"):
                saved_expanded[data["id"]] = node.is_expanded

        # Save cursor position by node identity
        cursor_node_key: str | None = None
        try:
            highlighted = tree.get_node_at_line(tree.cursor_line)
            if highlighted and highlighted.data:
                data = highlighted.data
                if data.get("type") == "epic":
                    cursor_node_key = f"epic:{data['id']}"
                elif data.get("type") == "story":
                    cursor_node_key = f"story:{data['story'].get('id', '')}"
        except Exception:
            pass

        # Rebuild tree
        tree.clear()
        cursor_target = None

        for epic in epics:
            epic_id = epic.get("id", "")
            epic_title = epic.get("title", "")
            stories = epic.get("stories", [])

            # Calculate epic progress (canceled counts as done)
            total_pts = 0
            done_pts = 0
            for story in stories:
                pts = story.get("points", 0)
                if isinstance(pts, (int, float)):
                    total_pts += pts
                    if _is_terminal(story.get("status", "")):
                        done_pts += pts

            label = _build_epic_label(
                epic_id, epic_title, done_pts, total_pts,
                jira_key=epic.get("jiraKey", ""),
                max_width=tree_width,
            )
            epic_data: dict[str, Any] = {
                "type": "epic",
                "id": epic_id,
                "title": epic_title,
            }
            epic_node = tree.root.add(label, data=epic_data)

            # Add story leaves — sorted by actionability (in-progress first, done last)
            stories = sorted(
                stories,
                key=lambda s: _STATUS_ORDER.get(_normalize_status(s.get("status", "")), 3),
            )
            for story in stories:
                story_label = _build_story_label(story, current_story_id, max_width=tree_width)
                story_data: dict[str, Any] = {"type": "story", "story": story}
                story_node = epic_node.add_leaf(story_label, data=story_data)

                if cursor_node_key == f"story:{story.get('id', '')}":
                    cursor_target = story_node

            # Restore expand state or apply default
            if epic_id in saved_expanded:
                if saved_expanded[epic_id]:
                    epic_node.expand()
                else:
                    epic_node.collapse()
            elif _should_expand(epic):
                epic_node.expand()

            if cursor_node_key == f"epic:{epic_id}":
                cursor_target = epic_node

        # Completed Epics section (Story 110-6)
        completed_epics = payload.get("completedEpics", [])
        if completed_epics:
            separator_label = Text("── Completed ──", style="bold dim")
            tree.root.add_leaf(separator_label, data={"type": "separator"})

            for epic in completed_epics:
                epic_id = epic.get("id", "")
                epic_title = epic.get("title", "")
                stories = epic.get("stories", [])

                total_pts = 0
                done_pts = 0
                for story in stories:
                    pts = story.get("points", 0)
                    if isinstance(pts, (int, float)):
                        total_pts += pts
                        if _is_terminal(story.get("status", "")):
                            done_pts += pts

                label = _build_epic_label(
                    epic_id, epic_title, done_pts, total_pts,
                    jira_key=epic.get("jiraKey", ""),
                    completed=True,
                    max_width=tree_width,
                )
                epic_data: dict[str, Any] = {
                    "type": "epic",
                    "id": epic_id,
                    "title": epic_title,
                }
                epic_node = tree.root.add(label, data=epic_data)

                for story in stories:
                    story_label = _build_story_label(story, current_story_id, max_width=tree_width)
                    story_data: dict[str, Any] = {"type": "story", "story": story}
                    epic_node.add_leaf(story_label, data=story_data)

                # Completed epics: collapsed by default, respect saved state
                if epic_id in saved_expanded:
                    if saved_expanded[epic_id]:
                        epic_node.expand()
                    else:
                        epic_node.collapse()
                else:
                    epic_node.collapse()

                if cursor_node_key == f"epic:{epic_id}":
                    cursor_target = epic_node

        # Future Initiatives section (Story 118-1)
        future_epics = payload.get("futureEpics", [])
        if future_epics:
            # Section separator
            separator_label = Text("── Future Initiatives ──", style="bold dim")
            tree.root.add_leaf(separator_label, data={"type": "separator"})

            for initiative in future_epics:
                init_id = initiative.get("id", "")
                init_title = initiative.get("title", "")
                init_pts = initiative.get("estimatedPoints", 0)
                init_status = initiative.get("status", "planning")
                children = initiative.get("children", [])

                # Build initiative label
                init_label = Text(no_wrap=True, overflow="ellipsis")
                status_style = "green" if init_status == "ready" else "dim yellow"
                init_label.append(f"[{init_status}]", style=status_style)
                init_label.append(f"  {init_title}", style="bold")
                init_label.append(f"  {init_pts} pts", style="dim")
                if children:
                    init_label.append(f"  ({len(children)} epics)", style="dim")

                init_data: dict[str, Any] = {
                    "type": "future_initiative",
                    "id": init_id,
                    "title": init_title,
                }
                init_node = tree.root.add(init_label, data=init_data)

                # Add child epics as leaves
                for child in children:
                    child_label = Text(no_wrap=True, overflow="ellipsis")
                    child_status = child.get("status", "planning")
                    child_style = "green" if child_status == "ready" else "dim yellow"
                    child_label.append(f"  [{child_status}]", style=child_style)
                    child_label.append(f"  {child.get('title', '')}")
                    child_label.append(f"  {child.get('estimatedPoints', 0)} pts", style="dim")
                    child_label.append(f"  {child.get('storyCount', 0)} stories", style="dim")
                    child_data: dict[str, Any] = {
                        "type": "future_epic_child",
                        "id": child.get("id", ""),
                    }
                    init_node.add_leaf(child_label, data=child_data)

                # Restore expand state or collapse by default
                if init_id in saved_expanded:
                    if saved_expanded[init_id]:
                        init_node.expand()
                    else:
                        init_node.collapse()
                else:
                    init_node.collapse()

                if cursor_node_key == f"epic:{init_id}":
                    cursor_target = init_node

        # Restore cursor position
        if cursor_target is not None:
            try:
                tree.move_cursor(cursor_target)
            except Exception:
                pass

    # --- Tree event handling ---

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        """Handle enter on a tree node: drill into story or toggle epic."""
        data = event.node.data
        if not data:
            return
        if data.get("type") == "story":
            story = data["story"]
            from pf.bikerack.story_detail_screen import (
                StoryDetailScreen,
            )

            try:
                self.app.push_screen(StoryDetailScreen(story_data=story))
            except Exception:
                pass
        elif data.get("type") == "epic":
            event.node.toggle()

    # --- Compatibility methods for app-level bindings ---

    def next_epic(self) -> None:
        """Move cursor down — compat wrapper for app j binding."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            tree.action_cursor_down()
        except Exception:
            pass

    def prev_epic(self) -> None:
        """Move cursor up — compat wrapper for app k binding."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            tree.action_cursor_up()
        except Exception:
            pass

    def toggle_epic(self) -> None:
        """Toggle current node — compat wrapper for app e binding."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            tree.action_toggle_node()
        except Exception:
            pass

    def get_selected_story(self) -> dict[str, Any] | None:
        """Return the currently highlighted story data, or None."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            node = tree.get_node_at_line(tree.cursor_line)
            if node and node.data and node.data.get("type") == "story":
                return node.data["story"]
        except Exception:
            pass
        return None

    def drill_into_story(self) -> None:
        """Push StoryDetailScreen for the highlighted story."""
        story = self.get_selected_story()
        if story is None:
            return
        from pf.bikerack.story_detail_screen import (
            StoryDetailScreen,
        )

        try:
            self.app.push_screen(StoryDetailScreen(story_data=story))
        except Exception:
            pass

    def _flash_hints(self, markup: str) -> None:
        """Flash a message in the hints bar, reverting after 2 seconds."""
        try:
            hints = self.query_one("#sprint-hints", Static)
            original = hints.renderable
            hints.update(markup)
            self.set_timer(2.0, lambda: hints.update(original))
        except Exception:
            pass

    def copy_selected_id(self) -> None:
        """Copy Jira key of highlighted story/epic to clipboard."""
        try:
            tree = self.query_one("#sprint-tree", Tree)
            node = tree.get_node_at_line(tree.cursor_line)
        except Exception:
            return
        if not node or not node.data:
            return

        data = node.data
        key: str | None = None
        if data.get("type") == "story":
            story = data.get("story", {})
            key = story.get("jiraKey") or story.get("id", "")
        elif data.get("type") == "epic":
            key = data.get("id", "")

        if not key:
            self._flash_hints("[dim]No ID to copy[/dim]")
            return

        # Copy to system clipboard
        try:
            if platform.system() == "Darwin":
                subprocess.run(["pbcopy"], input=key.encode(), check=True)
            else:
                subprocess.run(["xclip", "-selection", "clipboard"], input=key.encode(), check=True)
        except Exception:
            self._flash_hints("[bold red]\u2717 Clipboard unavailable[/bold red]")
            return

        self._flash_hints(f"[bold green]\u25cf Copied {key}[/bold green]")
