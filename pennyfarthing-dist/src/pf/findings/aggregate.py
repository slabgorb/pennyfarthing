"""
Sprint findings aggregation — collect and group findings across archived sessions.

Scans archived session files for a given sprint, parses R1-format delivery
findings from each, and produces a sprint-level aggregation report with
cross-story grouping by type, path, agent, and urgency.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import yaml

from pf.findings.capture import parse_delivery_findings


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


def collect_session_files(archive_dir: Path, sprint_number: int) -> dict:
    """Discover archived session files for a given sprint.

    Reads sprint-{YYWW}-completed.yaml to find story IDs,
    then locates matching {JIRA_KEY}-session.md files by parsing
    their frontmatter.

    Args:
        archive_dir: Path to sprint/archive/ directory.
        sprint_number: Sprint number (e.g. 2608).

    Returns:
        {success: True, data: {sessions: list[dict], sprint_file: str}}
        or {success: False, error: str}

        Each session dict: {jira_key: str, story_id: str, path: Path}
    """
    archive_dir = Path(archive_dir)
    sprint_file = archive_dir / f"sprint-{sprint_number}-completed.yaml"

    if not sprint_file.exists():
        return {"success": False, "error": f"Sprint completed file not found: {sprint_file}"}

    with open(sprint_file) as f:
        sprint_data = yaml.safe_load(f)

    completed_stories = sprint_data.get("completed_stories") or []
    story_ids = {str(s.get("id", "")) for s in completed_stories}

    sessions: list[dict] = []
    for session_file in sorted(archive_dir.glob("*-session.md")):
        content = session_file.read_text()
        fm = _parse_frontmatter(content)
        if not fm:
            continue
        story_id = str(fm.get("story_id", ""))
        if story_id in story_ids:
            sessions.append({
                "jira_key": fm.get("jira_key", ""),
                "story_id": story_id,
                "path": session_file,
            })

    return {
        "success": True,
        "data": {
            "sessions": sessions,
            "sprint_file": str(sprint_file),
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
            patterns.append({
                "path": path,
                "type": ftype,
                "stories": sorted(stories),
                "count": len(stories),
            })

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
        return {"success": False, "error": f"Unknown format: {output_format!r}. Use 'markdown' or 'json'."}


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
