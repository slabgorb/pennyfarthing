"""
Bidirectional sync between BMAD markdown and PF sprint YAML.

Modeled on pf/jira/bidirectional.py — same
SyncPlan/SyncChange/SyncResult pattern, adapted for BMAD's flat
markdown header format instead of a REST API.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pf.bmad.parser import (
    discover_bmad_stories,
    map_bmad_to_pf,
    map_pf_to_bmad,
)
from pf.common.config import load_pennyfarthing_config

# Status progression rank (higher = further along).
# Push sync only moves BMAD forward, pull sync only moves PF forward.
_BMAD_STATUS_RANK: dict[str, int] = {
    "draft": 0,
    "backlog": 1,
    "ready-for-dev": 2,
    "in-progress": 3,
    "review": 4,
    "done": 5,
    "completed": 5,
    "complete": 5,
}

# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class BmadSyncChange:
    """A single sync change to apply."""

    bmad_key: str
    pf_id: str
    field: Literal["status"]
    action: Literal["update-pf", "update-bmad"]
    pf_value: Any
    bmad_value: Any
    target_value: Any
    jira_key: str = ""


@dataclass
class BmadSyncPlan:
    """Result of comparing PF YAML and BMAD markdown."""

    changes: list[BmadSyncChange] = field(default_factory=list)
    pf_only: list[str] = field(default_factory=list)
    bmad_only: list[str] = field(default_factory=list)
    both: list[str] = field(default_factory=list)
    conflicts: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class BmadSyncResult:
    """Result of executing a sync plan."""

    dry_run: bool
    changes_planned: int
    changes_applied: int
    pf_modified: bool
    bmad_modified: bool
    new_stories_imported: int = 0
    errors: list[str] = field(default_factory=list)


# =============================================================================
# Sync Plan Generation
# =============================================================================


def _collect_pf_stories(sprint_path: Path) -> list[dict[str, Any]]:
    """Load all PF stories that have a bmad_key field."""
    from pf.sprint.yaml_io import read_sprint

    data = read_sprint(sprint_path)
    stories: list[dict[str, Any]] = []
    for epic in data.get("epics", []):
        for story in epic.get("stories", []):
            if story.get("bmad_key"):
                stories.append(dict(story))
    return stories


def generate_sync_plan(
    pf_stories: list[dict[str, Any]],
    bmad_stories: list[dict[str, Any]],
    *,
    direction: Literal["pull", "push", "both"] = "both",
    pf_wins: bool = True,
) -> BmadSyncPlan:
    """Compare PF and BMAD stories and build a sync plan.

    Args:
        pf_stories: Stories from PF YAML (must have bmad_key field)
        bmad_stories: Stories parsed from BMAD markdown
        direction: "pull" (BMAD→PF), "push" (PF→BMAD), or "both"
        pf_wins: If True, PF status wins on conflict (default for push)

    Returns:
        BmadSyncPlan with changes, conflicts, and set membership.
    """
    plan = BmadSyncPlan()

    def _jira_keys(jira_raw: str) -> set[str]:
        """Extract individual Jira keys from compound refs like 'DPGD-10 / DPGD-17'."""
        if not jira_raw:
            return set()
        return {k.strip() for k in jira_raw.replace("/", ",").split(",") if k.strip()}

    # Index PF stories by bmad_key and by each Jira key
    pf_by_key: dict[str, dict] = {}
    pf_by_jira: dict[str, dict] = {}
    for story in pf_stories:
        key = story.get("bmad_key", "")
        if key:
            pf_by_key[key] = story
        for jk in _jira_keys(story.get("jira", "")):
            pf_by_jira[jk] = story

    # Index BMAD stories by bmad_key and by each Jira key
    bmad_by_key: dict[str, dict] = {}
    bmad_by_jira: dict[str, dict] = {}
    for story in bmad_stories:
        key = story.get("bmad_key", "")
        if key:
            bmad_by_key[key] = story
        for jk in _jira_keys(story.get("jira", "")):
            bmad_by_jira[jk] = story

    # Match cascade: Jira key first, then exact bmad_key
    matched_pairs: list[tuple[dict, dict]] = []  # (pf_story, bmad_story)
    matched_pf: set[str] = set()    # bmad_keys of matched PF stories
    matched_bmad: set[str] = set()  # bmad_keys of matched BMAD stories

    # Pass 1: Match by Jira key (most stable identifier)
    for jk, pf_story in pf_by_jira.items():
        pk = pf_story.get("bmad_key", "")
        if pk in matched_pf:
            continue
        bmad_story = bmad_by_jira.get(jk)
        if bmad_story:
            bk = bmad_story.get("bmad_key", "")
            if bk not in matched_bmad:
                matched_pairs.append((pf_story, bmad_story))
                matched_pf.add(pk)
                matched_bmad.add(bk)

    # Pass 2: Match by exact bmad_key for anything not yet matched
    for key in set(pf_by_key) & set(bmad_by_key):
        if key not in matched_pf and key not in matched_bmad:
            matched_pairs.append((pf_by_key[key], bmad_by_key[key]))
            matched_pf.add(key)
            matched_bmad.add(key)

    plan.pf_only = sorted(set(pf_by_key) - matched_pf)
    plan.bmad_only = sorted(set(bmad_by_key) - matched_bmad)
    plan.both = sorted(matched_pf & matched_bmad)

    # Compare matched stories
    for pf_story, bmad_story in matched_pairs:
        pf_status = pf_story.get("status", "planning")
        bmad_status_raw = bmad_story.get("bmad_status", "draft")
        bmad_status_as_pf = map_bmad_to_pf(bmad_status_raw)

        if pf_status == bmad_status_as_pf:
            continue  # In sync

        pf_id = pf_story.get("id", "")
        bmad_key = bmad_story.get("bmad_key", "")
        # Prefer BMAD Jira key, fall back to PF
        jira_key = bmad_story.get("jira", "") or pf_story.get("jira", "")
        # Take first key from compound refs like "DPGD-10 / DPGD-17"
        if "/" in jira_key:
            jira_key = jira_key.split("/")[0].strip()

        if direction == "pull":
            # BMAD → PF
            plan.changes.append(
                BmadSyncChange(
                    bmad_key=bmad_key,
                    pf_id=pf_id,
                    field="status",
                    action="update-pf",
                    pf_value=pf_status,
                    bmad_value=bmad_status_raw,
                    target_value=bmad_status_as_pf,
                    jira_key=jira_key,
                )
            )
        elif direction == "push":
            # PF → BMAD (forward-only: never demote BMAD status)
            target_bmad = map_pf_to_bmad(pf_status)
            target_rank = _BMAD_STATUS_RANK.get(target_bmad, 0)
            current_rank = _BMAD_STATUS_RANK.get(bmad_status_raw, 0)
            if target_rank <= current_rank:
                continue  # Skip backward transitions
            plan.changes.append(
                BmadSyncChange(
                    bmad_key=bmad_key,
                    pf_id=pf_id,
                    field="status",
                    action="update-bmad",
                    pf_value=pf_status,
                    bmad_value=bmad_status_raw,
                    target_value=target_bmad,
                    jira_key=jira_key,
                )
            )
        else:
            # Both directions — resolve by pf_wins flag
            if pf_wins:
                target_bmad = map_pf_to_bmad(pf_status)
                plan.changes.append(
                    BmadSyncChange(
                        bmad_key=bmad_key,
                        pf_id=pf_id,
                        field="status",
                        action="update-bmad",
                        pf_value=pf_status,
                        bmad_value=bmad_status_raw,
                        target_value=target_bmad,
                        jira_key=jira_key,
                    )
                )
            else:
                plan.changes.append(
                    BmadSyncChange(
                        bmad_key=bmad_key,
                        pf_id=pf_id,
                        field="status",
                        action="update-pf",
                        pf_value=pf_status,
                        bmad_value=bmad_status_raw,
                        target_value=bmad_status_as_pf,
                        jira_key=jira_key,
                    )
                )

    return plan


# =============================================================================
# Sync Plan Execution
# =============================================================================


def _update_bmad_file_status(bmad_path: str, new_status: str) -> bool:
    """Rewrite the Status: line in a BMAD markdown file.

    Args:
        bmad_path: Absolute path to the .md file
        new_status: New BMAD status string (e.g. "completed")

    Returns:
        True if the file was modified.
    """
    path = Path(bmad_path)
    if not path.exists():
        return False

    content = path.read_text()
    new_content, count = re.subn(
        r"^(Status:\s*)(.+)$",
        rf"\g<1>{new_status}",
        content,
        count=1,
        flags=re.MULTILINE,
    )
    if count == 0:
        return False

    path.write_text(new_content)
    return True


# =============================================================================
# Dev Agent Record Population
# =============================================================================

_AGENT_MODEL_DEFAULT = "Claude Opus 4.6 via Claude Code CLI"


@dataclass
class DevAgentRecord:
    """Data for populating the Dev Agent Record section in BMAD story files."""

    agent_model: str = ""
    debug_log_refs: list[str] = field(default_factory=list)
    completion_notes: list[str] = field(default_factory=list)
    file_list: list[str] = field(default_factory=list)


def _find_session_file(
    jira_key: str, story_id: str, project_root: Path
) -> Path | None:
    """Find a session file by Jira key or story ID.

    Searches active sessions first, then archive.
    """
    search_dirs = [
        project_root / ".session",
        project_root / "sprint" / "archive",
    ]

    for search_dir in search_dirs:
        if not search_dir.is_dir():
            continue
        for f in sorted(search_dir.glob("*-session.md")):
            if jira_key and jira_key in f.name:
                return f
            if story_id and story_id.replace("-", ".") in f.name:
                return f
    return None


def _parse_session_for_record(session_path: Path) -> DevAgentRecord:
    """Extract Dev Agent Record data from a PF session file."""
    content = session_path.read_text()
    record = DevAgentRecord()
    record.agent_model = _AGENT_MODEL_DEFAULT

    # Extract branch name
    branch_match = re.search(r"\*\*Branch:\*\*\s*(.+?)(?:\s*\(pushed\))?$", content, re.MULTILINE)
    branch = branch_match.group(1).strip() if branch_match else ""

    # Extract Files Changed from Dev Assessment
    files_section = re.search(
        r"\*\*Files Changed:\*\*\s*\n(.*?)(?=\n\*\*|\n##|\Z)",
        content,
        re.DOTALL,
    )
    if files_section:
        for line in files_section.group(1).strip().splitlines():
            line = line.strip()
            if line.startswith("- "):
                record.file_list.append(line[2:].strip())

    # Extract completion notes from Dev Assessment body
    # Look for lines between "Dev Assessment" header and the next ##
    dev_section = re.search(
        r"## Dev Assessment\s*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL,
    )
    if dev_section:
        body = dev_section.group(1)
        # Look for any bullet points that aren't structured fields
        for line in body.strip().splitlines():
            line = line.strip()
            if line.startswith("- ") and not line.startswith("- `"):
                record.completion_notes.append(line[2:].strip())

    # Extract Delivery Findings if present
    findings_section = re.search(
        r"## Delivery Findings\s*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL,
    )
    if findings_section:
        for line in findings_section.group(1).strip().splitlines():
            line = line.strip()
            if line.startswith("- ") and "No upstream findings" not in line:
                record.completion_notes.append(f"[Finding] {line[2:].strip()}")

    # Debug log references: branch + try to find PR
    if branch:
        record.debug_log_refs.append(f"Branch: {branch}")

    return record


def _find_pr_for_branch(branch: str, project_root: Path) -> str | None:
    """Try to find a GitHub PR URL for a branch using gh CLI."""
    subrepo = project_root / "axiathon"
    if not subrepo.is_dir():
        return None
    try:
        result = subprocess.run(
            ["gh", "pr", "list", "--head", branch, "--json", "number,url", "--limit", "1"],
            capture_output=True,
            text=True,
            cwd=subrepo,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            import json
            prs = json.loads(result.stdout)
            if prs:
                return prs[0].get("url", "")
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        pass
    return None


def _populate_dev_agent_record(bmad_path: str, record: DevAgentRecord) -> bool:
    """Write Dev Agent Record data into a BMAD story markdown file.

    Only populates sections that are currently blank. Does not overwrite
    existing content.

    Returns True if the file was modified.
    """
    path = Path(bmad_path)
    if not path.exists():
        return False

    content = path.read_text()

    if "## Dev Agent Record" not in content:
        return False

    modified = False

    # Pattern: ### Heading\n\n### Next or ### Heading\n\n## Next or end of file
    # A "blank" section has nothing between the heading and the next heading
    sections = {
        "Agent Model Used": record.agent_model,
        "Debug Log References": "\n".join(f"- {r}" for r in record.debug_log_refs) if record.debug_log_refs else "",
        "Completion Notes List": "\n".join(f"- {n}" for n in record.completion_notes) if record.completion_notes else "",
        "File List": "```\n" + "\n".join(record.file_list) + "\n```" if record.file_list else "",
    }

    for heading, value in sections.items():
        if not value:
            continue

        # Match section content between ### Heading and next ### or ## or EOF
        pattern = re.compile(
            rf"(### {re.escape(heading)})\n(.*?)(?=\n###|\n##[^#]|\Z)",
            re.DOTALL,
        )
        match = pattern.search(content)
        if match:
            replacement = f"{match.group(1)}\n\n{value}\n"
            content = content[:match.start()] + replacement + content[match.end():]
            modified = True

    if modified:
        path.write_text(content)

    return modified


def _collect_dev_record(
    change: BmadSyncChange,
    project_root: Path,
) -> DevAgentRecord | None:
    """Build a DevAgentRecord for a sync change if applicable.

    Only builds records for push changes targeting review or done status.
    """
    if change.action != "update-bmad":
        return None
    if change.target_value not in ("review", "done", "completed", "complete"):
        return None

    session_file = _find_session_file(
        change.jira_key, change.pf_id, project_root
    )
    if not session_file:
        return None

    record = _parse_session_for_record(session_file)

    # Try to find PR URL from branch in debug refs
    for ref in record.debug_log_refs:
        if ref.startswith("Branch: "):
            branch = ref.split("Branch: ", 1)[1]
            pr_url = _find_pr_for_branch(branch, project_root)
            if pr_url:
                record.debug_log_refs.insert(0, f"PR: {pr_url}")
            break

    return record


def execute_sync_plan(
    plan: BmadSyncPlan,
    *,
    dry_run: bool = False,
    sprint_path: Path | None = None,
    bmad_root: Path | None = None,
    import_new: bool = False,
    repos: str = "axiathon",
    project_root: Path | None = None,
) -> BmadSyncResult:
    """Execute a sync plan.

    Args:
        plan: The sync plan to execute
        dry_run: If True, report without applying
        sprint_path: Path to PF sprint YAML
        bmad_root: Path to BMAD _bmad-output/ root
        import_new: If True, import bmad_only stories as new PF stories
        repos: Default repos for new story imports

    Returns:
        BmadSyncResult with counts and errors.
    """
    result = BmadSyncResult(
        dry_run=dry_run,
        changes_planned=len(plan.changes),
        changes_applied=0,
        pf_modified=False,
        bmad_modified=False,
    )

    if dry_run:
        return result

    # Apply PF updates (YAML)
    pf_updates = [c for c in plan.changes if c.action == "update-pf"]
    if pf_updates and sprint_path:
        from pf.sprint.story_update import update_story

        for change in pf_updates:
            update_result = update_story(
                sprint_path,
                change.pf_id,
                status=change.target_value,
            )
            if update_result.get("success"):
                result.changes_applied += 1
                result.pf_modified = True
            else:
                result.errors.append(
                    f"{change.pf_id}: PF update failed — {update_result.get('error', 'unknown')}"
                )

    # Apply BMAD updates (markdown files)
    bmad_updates = [c for c in plan.changes if c.action == "update-bmad"]
    if bmad_updates:
        # Need bmad story data to find file paths
        # Re-discover to get bmad_path for each key
        bmad_paths: dict[str, str] = {}
        if bmad_root:
            config = load_pennyfarthing_config()
            bmad_config = config.get("bmad", {})
            story_subdir = bmad_config.get("story_dir", "implementation-artifacts")
            from pf.bmad.parser import discover_bmad_stories as _discover

            all_bmad = _discover(bmad_root, story_dir=story_subdir)
            bmad_paths = {s["bmad_key"]: s["bmad_path"] for s in all_bmad}

        for change in bmad_updates:
            file_path = bmad_paths.get(change.bmad_key)
            if not file_path:
                result.errors.append(f"{change.bmad_key}: BMAD file not found")
                continue
            if _update_bmad_file_status(file_path, change.target_value):
                result.changes_applied += 1
                result.bmad_modified = True

                # Populate Dev Agent Record for review/done transitions
                if project_root:
                    record = _collect_dev_record(change, project_root)
                    if record:
                        _populate_dev_agent_record(file_path, record)
            else:
                result.errors.append(f"{change.bmad_key}: Failed to update Status line")

    # Import new BMAD stories not yet in PF
    if import_new and plan.bmad_only and sprint_path and bmad_root:
        result.new_stories_imported = _import_new_stories(
            plan.bmad_only, bmad_root, sprint_path, repos, result
        )

    return result


def _import_new_stories(
    bmad_keys: list[str],
    bmad_root: Path,
    sprint_path: Path,
    repos: str,
    result: BmadSyncResult,
) -> int:
    """Import stories that exist in BMAD but not PF.

    Returns count of successfully imported stories.
    """
    from pf.bmad.parser import discover_bmad_stories as _discover
    from pf.sprint.yaml_io import read_sprint, write_sprint

    config = load_pennyfarthing_config()
    bmad_config = config.get("bmad", {})
    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")

    all_bmad = _discover(bmad_root, story_dir=story_subdir)
    bmad_by_key = {s["bmad_key"]: s for s in all_bmad}

    data = read_sprint(sprint_path)
    imported = 0

    for key in bmad_keys:
        bmad_story = bmad_by_key.get(key)
        if not bmad_story:
            continue

        epic_num = int(bmad_story["epic_num"])

        # Find or create the epic in sprint data
        target_epic = None
        for epic in data.get("epics", []):
            epic_id = str(epic.get("id", "")).replace("epic-", "")
            if epic_id == str(epic_num):
                target_epic = epic
                break

        if target_epic is None:
            # Create new epic shard
            target_epic = {
                "id": str(epic_num),
                "title": f"Epic {epic_num}",
                "status": "planning",
                "priority": "P1",
                "marker": "bmad",
                "repos": repos,
                "stories": [],
            }
            data.setdefault("epics", []).append(target_epic)

        # Add story
        pf_story = {
            "id": bmad_story["id"],
            "title": bmad_story["title"],
            "points": bmad_story.get("points", 3),
            "priority": bmad_story.get("priority", "P1"),
            "status": bmad_story["status"],
            "repos": repos,
            "workflow": bmad_story.get("workflow", "tdd"),
            "bmad_key": key,
        }
        target_epic.setdefault("stories", []).append(pf_story)
        imported += 1

    if imported > 0:
        write_sprint(sprint_path, data)
        result.pf_modified = True

    return imported


# =============================================================================
# Formatting
# =============================================================================


def format_sync_plan(
    plan: BmadSyncPlan,
    *,
    project_root: Path | None = None,
) -> str:
    """Format a sync plan for human-readable display.

    Args:
        plan: The plan to format
        project_root: If provided, shows Dev Agent Record preview for push changes

    Returns:
        Formatted string.
    """
    lines: list[str] = []

    lines.append(
        f"Matched: {len(plan.both)}  |  PF-only: {len(plan.pf_only)}  |  BMAD-only: {len(plan.bmad_only)}"
    )
    lines.append("")

    if plan.changes:
        lines.append(f"Changes ({len(plan.changes)}):")
        for c in plan.changes:
            arrow = "BMAD→PF" if c.action == "update-pf" else "PF→BMAD"
            lines.append(
                f"  {c.pf_id} ({c.bmad_key}): {c.field} {arrow}  "
                f"{c.pf_value!r} / {c.bmad_value!r} → {c.target_value!r}"
            )
        lines.append("")

    # Dev Agent Record preview for push changes to review/done
    if project_root:
        record_changes = [
            c for c in plan.changes
            if c.action == "update-bmad"
            and c.target_value in ("review", "done", "completed", "complete")
        ]
        if record_changes:
            lines.append(f"Dev Agent Records ({len(record_changes)}):")
            for c in record_changes:
                record = _collect_dev_record(c, project_root)
                if record:
                    lines.append(f"  {c.pf_id} ({c.jira_key}):")
                    lines.append(f"    Agent Model: {record.agent_model}")
                    if record.debug_log_refs:
                        lines.append(f"    Debug Refs: {', '.join(record.debug_log_refs)}")
                    if record.completion_notes:
                        lines.append(f"    Notes: {len(record.completion_notes)} items")
                        for note in record.completion_notes[:3]:
                            lines.append(f"      - {note[:80]}{'...' if len(note) > 80 else ''}")
                        if len(record.completion_notes) > 3:
                            lines.append(f"      ... and {len(record.completion_notes) - 3} more")
                    if record.file_list:
                        lines.append(f"    Files: {len(record.file_list)} changed")
                        for f in record.file_list[:5]:
                            lines.append(f"      {f[:100]}")
                        if len(record.file_list) > 5:
                            lines.append(f"      ... and {len(record.file_list) - 5} more")
                else:
                    lines.append(f"  {c.pf_id} ({c.jira_key}): no session file found")
            lines.append("")

    if plan.bmad_only:
        lines.append(f"New in BMAD ({len(plan.bmad_only)}):")
        for key in plan.bmad_only:
            lines.append(f"  {key}")
        lines.append("")

    if plan.pf_only:
        lines.append(f"PF-only ({len(plan.pf_only)}):")
        for key in plan.pf_only:
            lines.append(f"  {key}")
        lines.append("")

    if not plan.changes and not plan.bmad_only and not plan.pf_only:
        lines.append("Everything is in sync.")

    return "\n".join(lines)


# =============================================================================
# Drift Report
# =============================================================================


def drift_report(
    sprint_path: Path,
    bmad_root: Path,
) -> str:
    """Generate a drift report showing what's out of sync.

    Args:
        sprint_path: Path to PF sprint YAML
        bmad_root: Path to BMAD _bmad-output/ root

    Returns:
        Formatted drift report string.
    """
    config = load_pennyfarthing_config()
    bmad_config = config.get("bmad", {})
    story_subdir = bmad_config.get("story_dir", "implementation-artifacts")

    pf_stories = _collect_pf_stories(sprint_path)
    bmad_stories = discover_bmad_stories(bmad_root, story_dir=story_subdir)

    plan = generate_sync_plan(pf_stories, bmad_stories, direction="both")
    return format_sync_plan(plan)
