"""
Sprint findings aggregation — collect and group findings across archived sessions.

Scans archived session files for a given sprint, parses R1-format delivery
findings from each, and produces a sprint-level aggregation report with
cross-story grouping by type, path, agent, and urgency.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import yaml

from pf.findings.capture import parse_delivery_findings

_SESSION_FIELD_RE = re.compile(r"\*\*(\w[\w\s]*):\*\*\s*(.*)")


def _parse_frontmatter(content: str) -> dict | None:
    """Extract YAML frontmatter from markdown content."""
    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None
    try:
        return yaml.safe_load(content[3:end])
    except yaml.YAMLError:
        return None


def _parse_session_fields(content: str) -> dict[str, str]:
    """Extract **Key:** Value fields from session markdown body.

    Handles sessions without YAML frontmatter by reading bold-field
    patterns like ``**ID:** 141-8`` and ``**Jira Key:** MSSCI-16135``.
    """
    fields: dict[str, str] = {}
    for line in content.splitlines()[:30]:
        m = _SESSION_FIELD_RE.search(line)
        if m:
            key = m.group(1).strip().lower()
            value = m.group(2).strip()
            fields[key] = value
    return fields


def _collect_done_stories(project_root: Path, sprint_number: int) -> dict[str, dict]:
    """Collect all done stories from current sprint YAML and completed file.

    Returns a dict mapping jira_key -> {story_id, jira_key} for all done
    stories in the sprint, regardless of whether their epic is archived.
    """
    stories: dict[str, dict] = {}

    # 1. From completed file (archived epics)
    archive_dir = project_root / "sprint" / "archive"
    sprint_file = archive_dir / f"sprint-{sprint_number}-completed.yaml"
    if sprint_file.exists():
        with open(sprint_file) as f:
            sprint_data = yaml.safe_load(f) or {}

        # Inline completed stories
        for s in sprint_data.get("completed_stories", []) or []:
            sid = str(s.get("id", ""))
            # Look up jira key from epic shards in archive
            epic_ref = s.get("epic", "")
            jira_key = _find_jira_key_in_shard(archive_dir, epic_ref, sid)
            if jira_key:
                stories[jira_key] = {"story_id": sid, "jira_key": jira_key}

        # Epic shard stories (archived epics)
        for epic_ref in sprint_data.get("completed_epics", []) or []:
            shard = archive_dir / f"epic-{epic_ref}.yaml"
            if shard.exists():
                with open(shard) as f:
                    shard_data = yaml.safe_load(f) or {}
                for s in shard_data.get("stories", []) or []:
                    status = s.get("status", "")
                    if status in ("done", "completed"):
                        sid = str(s.get("id", ""))
                        jira_key = str(s.get("jira", ""))
                        if jira_key:
                            stories[jira_key] = {"story_id": sid, "jira_key": jira_key}

    # 2. From current sprint YAML (unarchived epics + standalone)
    current_sprint = project_root / "sprint" / "current-sprint.yaml"
    if current_sprint.exists():
        with open(current_sprint) as f:
            current_data = yaml.safe_load(f) or {}

        # Standalone stories
        for s in current_data.get("standalone_stories", []) or []:
            if s.get("status") in ("done", "completed"):
                jira_key = str(s.get("jira", ""))
                sid = str(s.get("id", ""))
                if jira_key:
                    stories[jira_key] = {"story_id": sid, "jira_key": jira_key}

        # Epic shard stories (still active epics)
        sprint_dir = project_root / "sprint"
        for epic_ref in current_data.get("epics", []) or []:
            if isinstance(epic_ref, str):
                shard = sprint_dir / f"epic-{epic_ref}.yaml"
            else:
                shard = sprint_dir / f"epic-{epic_ref.get('jira', epic_ref.get('id', ''))}.yaml"
            if shard.exists():
                with open(shard) as f:
                    shard_data = yaml.safe_load(f) or {}
                for s in shard_data.get("stories", []) or []:
                    status = s.get("status", "")
                    if status in ("done", "completed"):
                        sid = str(s.get("id", ""))
                        jira_key = str(s.get("jira", ""))
                        if jira_key:
                            stories[jira_key] = {"story_id": sid, "jira_key": jira_key}

    return stories


def _find_jira_key_in_shard(archive_dir: Path, epic_ref: str, story_id: str) -> str:
    """Look up a story's Jira key from its epic shard file."""
    if not epic_ref:
        return ""
    shard = archive_dir / f"epic-{epic_ref}.yaml"
    if not shard.exists():
        return ""
    with open(shard) as f:
        data = yaml.safe_load(f) or {}
    for s in data.get("stories", []) or []:
        if str(s.get("id", "")) == story_id:
            return str(s.get("jira", ""))
    return ""


def collect_session_files(archive_dir: Path, sprint_number: int) -> dict:
    """Discover archived session files for a given sprint.

    Builds a lookup of all done stories from both the completed archive
    and current sprint YAML (for unarchived epics), then matches archived
    session files by YAML frontmatter, markdown body fields, or filename.

    Args:
        archive_dir: Path to sprint/archive/ directory.
        sprint_number: Sprint number (e.g. 2608).

    Returns:
        {success: True, data: {sessions: list[dict], sprint_file: str}}
        or {success: False, error: str}

        Each session dict: {jira_key: str, story_id: str, path: Path}
    """
    archive_dir = Path(archive_dir)
    project_root = archive_dir.parent.parent

    done_stories = _collect_done_stories(project_root, sprint_number)
    if not done_stories:
        sprint_file = archive_dir / f"sprint-{sprint_number}-completed.yaml"
        if not sprint_file.exists():
            return {"success": False, "error": f"Sprint completed file not found: {sprint_file}"}
        return {"success": True, "data": {"sessions": [], "sprint_file": str(sprint_file)}}

    # Build reverse lookup: jira_key -> story info
    jira_keys = set(done_stories.keys())

    sessions: list[dict] = []
    seen_keys: set[str] = set()

    for session_file in sorted(archive_dir.glob("*-session.md")):
        if session_file.name.startswith("sprint-"):
            continue

        content = session_file.read_text()

        # Strategy 1: YAML frontmatter
        fm = _parse_frontmatter(content)
        if fm:
            jira_key = str(fm.get("jira_key", fm.get("jira", "")))
            if jira_key in jira_keys and jira_key not in seen_keys:
                info = done_stories[jira_key]
                sessions.append(
                    {
                        "jira_key": jira_key,
                        "story_id": info["story_id"],
                        "path": session_file,
                    }
                )
                seen_keys.add(jira_key)
                continue

        # Strategy 2: Markdown body fields
        fields = _parse_session_fields(content)
        jira_key = fields.get("jira key", fields.get("jira", ""))
        jira_key = re.sub(r"\[([^\]]+)\].*", r"\1", jira_key).strip()
        if jira_key in jira_keys and jira_key not in seen_keys:
            info = done_stories[jira_key]
            sessions.append(
                {
                    "jira_key": jira_key,
                    "story_id": info["story_id"],
                    "path": session_file,
                }
            )
            seen_keys.add(jira_key)
            continue

        # Strategy 3: Filename match (e.g. MSSCI-16135-session.md)
        stem = session_file.stem.removesuffix("-session")
        if stem in jira_keys and stem not in seen_keys:
            info = done_stories[stem]
            sessions.append(
                {
                    "jira_key": stem,
                    "story_id": info["story_id"],
                    "path": session_file,
                }
            )
            seen_keys.add(stem)

    sprint_file = archive_dir / f"sprint-{sprint_number}-completed.yaml"
    return {
        "success": True,
        "data": {
            "sessions": sessions,
            "sprint_file": str(sprint_file) if sprint_file.exists() else "current-sprint.yaml",
        },
    }


def aggregate_findings(sessions: list[dict]) -> dict:
    """Parse and aggregate findings across multiple session files.

    Args:
        sessions: List of session dicts from collect_session_files().
            Each has keys: jira_key, story_id, path.

    Returns:
        {success: True, data: {
            findings: list[dict],        # all parsed findings with story_id added
            by_type: dict[str, list],     # grouped by finding type
            by_path: dict[str, list],     # grouped by affected path
            by_agent: dict[str, list],    # grouped by agent
            total: int,
            blocking_count: int,
        }}
        or {success: False, error: str}
    """
    all_findings: list[dict] = []

    for session in sessions:
        content = Path(session["path"]).read_text()
        parsed = parse_delivery_findings(content)

        for f in parsed:
            if f.get("type") == "none":
                continue
            f["story_id"] = session["story_id"]
            all_findings.append(f)

    by_type: dict[str, list] = defaultdict(list)
    by_path: dict[str, list] = defaultdict(list)
    by_agent: dict[str, list] = defaultdict(list)
    blocking_count = 0

    for f in all_findings:
        by_type[f["type"]].append(f)
        by_path[f["path"]].append(f)
        by_agent[f["agent"]].append(f)
        if f.get("urgency") == "blocking":
            blocking_count += 1

    return {
        "success": True,
        "data": {
            "findings": all_findings,
            "by_type": dict(by_type),
            "by_path": dict(by_path),
            "by_agent": dict(by_agent),
            "total": len(all_findings),
            "blocking_count": blocking_count,
        },
    }


def detect_patterns(aggregated: dict) -> dict:
    """Identify recurring patterns across stories.

    A pattern is the same path+type appearing in 2+ different stories.

    Args:
        aggregated: The data dict from aggregate_findings().

    Returns:
        {success: True, data: {
            patterns: list[dict],   # each: {path, type, stories: list, count: int}
            pattern_count: int,
        }}
        or {success: False, error: str}
    """
    findings = aggregated.get("findings", [])

    groups: dict[tuple[str, str], set[str]] = defaultdict(set)
    for f in findings:
        key = (f["path"], f["type"])
        groups[key].add(f["story_id"])

    patterns = []
    for (path, ftype), stories in sorted(groups.items()):
        if len(stories) >= 2:
            patterns.append(
                {
                    "path": path,
                    "type": ftype,
                    "stories": sorted(stories),
                    "count": len(stories),
                }
            )

    return {
        "success": True,
        "data": {
            "patterns": patterns,
            "pattern_count": len(patterns),
        },
    }


def format_report(aggregated: dict, patterns: dict, output_format: str = "markdown") -> dict:
    """Format aggregation results as markdown or JSON.

    Args:
        aggregated: Data dict from aggregate_findings().
        patterns: Data dict from detect_patterns().
        output_format: "markdown" or "json".

    Returns:
        {success: True, data: {output: str, format: str}}
        or {success: False, error: str}
    """
    if output_format == "markdown":
        return _format_markdown(aggregated, patterns)
    elif output_format == "json":
        return _format_json(aggregated, patterns)
    else:
        return {
            "success": False,
            "error": f"Unknown format: {output_format!r}. Use 'markdown' or 'json'.",
        }


def _format_markdown(aggregated: dict, patterns: dict) -> dict:
    """Render aggregation as markdown report."""
    lines = ["# Sprint Findings Report", ""]
    total = aggregated.get("total", 0)
    blocking = aggregated.get("blocking_count", 0)

    if total == 0:
        lines.append("No findings reported across all stories in this sprint.")
    else:
        lines.append(f"**Total:** {total} findings ({blocking} blocking)")
        lines.append("")

        by_type = aggregated.get("by_type", {})
        if by_type:
            lines.append("## By Type")
            lines.append("")
            for ftype, items in sorted(by_type.items()):
                lines.append(f"### {ftype} ({len(items)})")
                for f in items:
                    lines.append(
                        f"- [{f.get('story_id', '')}] ({f.get('urgency', '')}) "
                        f"{f.get('description', '')}. Affects `{f.get('path', '')}`."
                    )
                lines.append("")

        by_path = aggregated.get("by_path", {})
        if by_path:
            lines.append("## By Path")
            lines.append("")
            for path, items in sorted(by_path.items()):
                lines.append(f"### `{path}` ({len(items)} findings)")
                for f in items:
                    lines.append(
                        f"- [{f.get('story_id', '')}] **{f.get('type', '')}** "
                        f"({f.get('urgency', '')}): {f.get('description', '')}"
                    )
                lines.append("")

    pattern_list = patterns.get("patterns", [])
    if pattern_list:
        lines.append("## Recurring Patterns")
        lines.append("")
        for p in pattern_list:
            stories = ", ".join(p["stories"])
            lines.append(f"- **{p['type']}** in `{p['path']}` — {p['count']} stories ({stories})")
        lines.append("")

    return {
        "success": True,
        "data": {
            "output": "\n".join(lines),
            "format": "markdown",
        },
    }


def _format_json(aggregated: dict, patterns: dict) -> dict:
    """Render aggregation as JSON."""
    data = {
        "findings": aggregated.get("findings", []),
        "total": aggregated.get("total", 0),
        "blocking_count": aggregated.get("blocking_count", 0),
        "by_type": {k: len(v) for k, v in aggregated.get("by_type", {}).items()},
        "by_path": {k: len(v) for k, v in aggregated.get("by_path", {}).items()},
        "by_agent": {k: len(v) for k, v in aggregated.get("by_agent", {}).items()},
        "patterns": patterns.get("patterns", []),
        "pattern_count": patterns.get("pattern_count", 0),
    }
    return {
        "success": True,
        "data": {
            "output": json.dumps(data, indent=2, default=str),
            "format": "json",
        },
    }
