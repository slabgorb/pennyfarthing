"""
Jira vs YAML reconciliation report.

Replaces jira-reconcile.sh (261 lines) with REST API calls.

Compares sprint YAML against Jira to find:
- Status mismatches
- Missing Jira keys
- Orphan issues (in Jira but not YAML)
- Sprint membership discrepancies
- Epic sync status

Usage:
    pf jira reconcile [--fix]
"""

import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pf.jira.client import (
    JIRA_PROJECT,
    get_client,
    get_jira_field,
    map_status_to_jira,
)
from pf.sprint.loader import load_sprint


def _normalize_status(status: str | None) -> str:
    """Normalize status for comparison."""
    if not status:
        return ""
    return status.lower().replace(" ", "_")


def reconcile(
    *,
    fix: bool = False,
    sprint_path: Path | None = None,
) -> dict[str, Any]:
    """Generate reconciliation report comparing sprint YAML against Jira.

    Args:
        fix: If True, apply automatic fixes where safe
        sprint_path: Path to sprint YAML (defaults to auto-detect)

    Returns:
        {success, report, mismatches, missing, orphans, not_in_sprint, fixed}
    """
    sprint_data = load_sprint()
    if not sprint_data:
        return {"success": False, "error": "Could not load sprint YAML"}

    sprint_info = sprint_data.get("sprint", {})
    sprint_name = sprint_info.get("name", "Unknown")
    sprint_id = sprint_info.get("jira_sprint_id")

    client = get_client()

    # Collect all YAML stories
    yaml_stories = []
    for epic in sprint_data.get("epics", []):
        for story in epic.get("stories", []):
            yaml_stories.append(
                {
                    "id": story.get("id", ""),
                    "jira": story.get("jira", ""),
                    "status": story.get("status", "backlog"),
                    "title": story.get("title", ""),
                }
            )

    status_mismatches = []
    missing_jira = []
    orphans = []
    not_in_sprint = []

    # --- Check YAML stories against Jira ---
    print("## Checking YAML Stories Against Jira...\n")

    for story in yaml_stories:
        jira_key = story["jira"]
        if not jira_key:
            missing_jira.append(story)
            continue

        issue = client.get_issue_sync(jira_key)
        if not issue:
            print(f"[!] {jira_key} not found in Jira", file=sys.stderr)
            continue

        jira_status = get_jira_field(issue, "fields.status.name", "")
        yaml_status = story["status"]

        # Compare normalized statuses
        expected_jira = map_status_to_jira(yaml_status)
        if _normalize_status(jira_status) != _normalize_status(expected_jira):
            status_mismatches.append(
                {
                    "jira_key": jira_key,
                    "yaml_status": yaml_status,
                    "jira_status": jira_status,
                }
            )

    # --- Check Jira sprint against YAML ---
    print("## Checking Jira Sprint Against YAML...\n")

    if sprint_id:
        # Find orphans: in Jira sprint but not in YAML
        sprint_issues = client.search_issues_sync(
            f"project={JIRA_PROJECT} AND labels=product-pennyfarthing "
            f"AND sprint={sprint_id} AND status != Canceled",
            fields=["key", "summary", "status"],
        )

        yaml_keys = {s["jira"] for s in yaml_stories if s["jira"]}
        yaml_ids = {s["id"] for s in yaml_stories}

        for issue in sprint_issues:
            key = issue.get("key", "")
            if key not in yaml_keys and key not in yaml_ids:
                status = get_jira_field(issue, "fields.status.name", "Unknown")
                summary = get_jira_field(issue, "fields.summary", "Unknown")
                orphans.append(
                    {
                        "jira_key": key,
                        "status": status,
                        "summary": summary,
                    }
                )

        # Find YAML stories not in sprint
        print("## Checking for Issues Not in Sprint...\n")

        no_sprint_issues = client.search_issues_sync(
            f"project={JIRA_PROJECT} AND labels=product-pennyfarthing "
            f"AND sprint is EMPTY AND status != Canceled",
            fields=["key", "summary"],
        )

        for issue in no_sprint_issues:
            key = issue.get("key", "")
            if key in yaml_keys or key in yaml_ids:
                summary = get_jira_field(issue, "fields.summary", "Unknown")
                not_in_sprint.append(
                    {
                        "jira_key": key,
                        "summary": summary,
                    }
                )

    # --- Build report ---
    report_lines = [
        "# Jira vs YAML Drift Audit Report",
        "",
        f"**Sprint:** {sprint_name} (Jira Sprint ID: {sprint_id})",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "---",
        "",
        f"## Status Mismatches ({len(status_mismatches)})",
        "",
    ]

    if not status_mismatches:
        report_lines.append("No status mismatches found.")
    else:
        report_lines.append("| Jira Key | YAML Status | Jira Status | Action |")
        report_lines.append("|----------|-------------|-------------|--------|")
        for m in status_mismatches:
            report_lines.append(
                f"| {m['jira_key']} | {m['yaml_status']} | {m['jira_status']} | Update YAML or Jira |"
            )

    report_lines.extend(
        [
            "",
            f"## YAML Stories Missing Jira Key ({len(missing_jira)})",
            "",
        ]
    )

    if not missing_jira:
        report_lines.append("All YAML stories have Jira keys.")
    else:
        report_lines.append("| YAML ID | Title | Status | Action |")
        report_lines.append("|---------|-------|--------|--------|")
        for m in missing_jira:
            title = m["title"][:40]
            report_lines.append(f"| {m['id']} | {title} | {m['status']} | Create Jira issue |")

    report_lines.extend(
        [
            "",
            f"## Jira Issues Not in YAML ({len(orphans)})",
            "",
        ]
    )

    if not orphans:
        report_lines.append("All sprint issues are tracked in YAML.")
    else:
        report_lines.append("| Jira Key | Status | Summary | Action |")
        report_lines.append("|----------|--------|---------|--------|")
        for o in orphans:
            summary = o["summary"][:40]
            action = (
                "Info: Completed (not in current YAML)"
                if o["status"] == "Done"
                else "Add to YAML or remove from sprint"
            )
            report_lines.append(f"| {o['jira_key']} | {o['status']} | {summary} | {action} |")

    report_lines.extend(
        [
            "",
            f"## YAML Stories Not in Jira Sprint ({len(not_in_sprint)})",
            "",
        ]
    )

    if not not_in_sprint:
        report_lines.append("All YAML stories are in Jira sprint.")
    else:
        report_lines.append("| Jira Key | Summary | Action |")
        report_lines.append("|----------|---------|--------|")
        for n in not_in_sprint:
            summary = n["summary"][:50]
            report_lines.append(f"| {n['jira_key']} | {summary} | Add to sprint {sprint_id} |")

    # Epic sync check
    report_lines.extend(["", "## Epic Sync Check", ""])
    report_lines.append("| YAML Epic ID | Jira Field | Title |")
    report_lines.append("|--------------|------------|-------|")
    for epic in sprint_data.get("epics", []):
        eid = epic.get("id", "")
        jira_key = epic.get("jira", "")
        title = epic.get("title", "")
        jira_display = jira_key if jira_key else "MISSING"
        report_lines.append(f"| {eid} | {jira_display} | {title} |")

    # Summary
    total = len(status_mismatches) + len(missing_jira) + len(orphans) + len(not_in_sprint)
    report_lines.extend(["", "---", ""])
    if total == 0:
        report_lines.append("Drift Audit: CLEAN - No discrepancies found!")
    else:
        report_lines.append(f"Drift Audit: {total} drift issue(s) found")

    # Fix mode is deprecated — reconcile is audit-only now
    fixed = []

    report = "\n".join(report_lines)
    print(report)

    result = {
        "success": True,
        "report": report,
        "mismatches": status_mismatches,
        "missing": missing_jira,
        "orphans": orphans,
        "not_in_sprint": not_in_sprint,
        "fixed": fixed,
    }
    if fix:
        result["fix_deprecated"] = True
    return result
