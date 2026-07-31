"""
Deferred follow-up detection and suggestion at story finish (gh #114).

Scans a session file's ## Delivery Findings and ## Design Deviations for
deferrals that imply future work, dedups them against open stories in the
current sprint, and renders a "Deferred follow-ups detected" block with a
pre-filled `pf sprint story add` command per candidate. Invoked from the
sm-finish preflight — the last moment the session is still live before
archive_session/remove_session freeze the deferrals into an archive nobody
routinely reads.

Suggest posture only: this is a report, not a gate. It never blocks finish.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from pf.findings.capture import parse_delivery_findings
from pf.findings.summary import _parse_session_deviations

# Non-blocking findings whose description carries one of these phrases imply
# consciously deferred work even when the finding type alone doesn't (gh #114).
TAG_PHRASES: tuple[str, ...] = (
    "follow-up",
    "follow up",
    "later",
    "future",
    "defer",
    "out of scope",
    "tracked",
)

# Types whose non-blocking findings are deferral candidates on their own.
CANDIDATE_TYPES: frozenset[str] = frozenset({"Improvement", "Question"})

# Story statuses that count as "already tracked" for dedup purposes.
OPEN_STATUSES: frozenset[str] = frozenset({"backlog", "in_progress", "in_review"})

# Follow-up stories default to 2 points in the pre-filled command; the
# operator adjusts before running if the sizing is off.
DEFAULT_POINTS = 2


def detect_deferred_followups(content: str) -> list[dict[str, Any]]:
    """Scan session markdown for deferrals that imply future work.

    Candidates (gh #114 detection heuristics):
    - Delivery Finding of type Improvement or Question with urgency
      non-blocking;
    - any non-blocking finding whose description carries a deferral tag
      phrase (TAG_PHRASES);
    - Design Deviation whose Forward impact names future work (present,
      non-empty, not "none").

    Blocking findings are never candidates — blocking work is resolved
    in-story by definition, even when its text mentions a follow-up.

    Args:
        content: Full session markdown.

    Returns:
        Candidate dicts: {"source": "finding"|"deviation", "description": str,
        plus "type" (findings) or "forward_impact" (deviations)}.
    """
    candidates: list[dict[str, Any]] = []

    for finding in parse_delivery_findings(content):
        if finding.get("type") == "none":
            continue
        if finding.get("urgency") != "non-blocking":
            continue
        description = finding.get("description", "")
        tagged = any(phrase in description.lower() for phrase in TAG_PHRASES)
        if finding.get("type") in CANDIDATE_TYPES or tagged:
            candidates.append(
                {
                    "source": "finding",
                    "description": description,
                    "type": finding.get("type"),
                }
            )

    for deviation in _parse_session_deviations(content):
        forward_impact = (deviation.get("forward_impact") or "").strip()
        if forward_impact and forward_impact.lower() != "none":
            candidates.append(
                {
                    "source": "deviation",
                    "description": deviation.get("description", ""),
                    "forward_impact": forward_impact,
                }
            )

    return candidates


def _session_epic(content: str) -> str:
    """Read the epic id from session frontmatter.

    The epic comes from the session's own `epic:` field — never from
    prefix-parsing the story id (155-4 rule).
    """
    match = re.search(r'^epic:\s*["\']?([^"\'\n]+)["\']?\s*$', content, re.MULTILINE)
    return match.group(1).strip() if match else "<epic>"


def _open_stories(project_root: Path) -> list[tuple[str, str]]:
    """Collect (id, title) for open stories in the merged current sprint.

    Returns [] when no sprint data is loadable — dedup then fails OPEN
    (nothing to dedup against must not suppress the report).
    """
    from pf.sprint.loader import load_sprint

    data = load_sprint(project_root)
    if not data:
        return []

    stories: list[tuple[str, str]] = []
    for epic in data.get("epics", []):
        if not isinstance(epic, dict):
            continue
        for story in epic.get("stories", []) or []:
            if not isinstance(story, dict):
                continue
            if story.get("status") in OPEN_STATUSES:
                stories.append((str(story.get("id", "")), str(story.get("title", ""))))
    return stories


def _covering_story(
    description: str, open_stories: list[tuple[str, str]]
) -> tuple[str, str] | None:
    """Find an open story that already covers a candidate description.

    Case-insensitive substring match in either direction — deliberately
    conservative: only a clear title/description overlap suppresses a
    suggestion (dedup is what keeps the feature trustworthy, but a false
    "already tracked" loses the deferral entirely).
    """
    desc = description.lower()
    for story_id, title in open_stories:
        low = title.lower()
        if low and (low in desc or desc in low):
            return story_id, title
    return None


def suggest_followups(
    session_path: Path | str,
    *,
    story_id: str,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Scan a session for deferred follow-ups and render suggestions.

    Args:
        session_path: Path to the live session markdown file.
        story_id: The finishing story's id — becomes the provenance
            back-reference ("from {story_id} review") embedded in each
            pre-filled command, so the audit trail survives the mint.
        project_root: Project root for sprint data (defaults to
            auto-detect); dedup fails open when no sprint is loadable.

    Returns:
        {success: True, error: None, data: {candidates, suggestions,
         skipped, markdown}} or {success: False, error: str}.
        Always success=True when the session is readable — this is a
        report, never a finish gate.
    """
    session_path = Path(session_path)
    if not session_path.exists():
        return {"success": False, "error": f"Session file not found: {session_path}"}

    content = session_path.read_text(encoding="utf-8")
    candidates = detect_deferred_followups(content)
    epic = _session_epic(content)

    if project_root is None:
        from pf.common.config import get_project_root

        project_root = get_project_root()
    open_stories = _open_stories(Path(project_root))

    suggestions: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for candidate in candidates:
        description = candidate["description"]
        covered = _covering_story(description, open_stories)
        if covered:
            skipped.append(
                {
                    "description": description,
                    "covered_by": covered[0],
                    "covered_by_title": covered[1],
                }
            )
            continue
        provenance = f"from {story_id} review"
        # The command is meant to be copy-pasted into a shell: inside the
        # double-quoted title, `"`, backticks, `$`, and `\` would break the
        # quoting or expand/substitute (CWE-78 class). Neutralize them —
        # titles are prose, so a quote-character swap loses nothing.
        title = re.sub(r'["`$\\]', "'", description)
        command = (
            f'pf sprint story add {epic} "{title} ({provenance})" {DEFAULT_POINTS}'
        )
        suggestions.append(
            {
                "description": description,
                "command": command,
                "provenance": provenance,
                "source": candidate["source"],
            }
        )

    lines: list[str] = []
    if suggestions:
        lines.append("## Deferred follow-ups detected")
        lines.append("")
        lines.append(
            f"{len(suggestions)} deferral(s) imply future work. "
            "Run or skip each suggestion (adjust points as needed):"
        )
        lines.append("")
        for suggestion in suggestions:
            lines.append(f"- {suggestion['description']} ({suggestion['source']})")
            lines.append(f"  `{suggestion['command']}`")
    else:
        lines.append("No deferred follow-ups detected.")
    if skipped:
        lines.append("")
        lines.append("Already tracked (no suggestion needed):")
        for entry in skipped:
            lines.append(
                f"- {entry['description']} — covered by {entry['covered_by']} "
                f"\"{entry['covered_by_title']}\""
            )

    return {
        "success": True,
        "error": None,
        "data": {
            "candidates": candidates,
            "suggestions": suggestions,
            "skipped": skipped,
            "markdown": "\n".join(lines),
        },
    }
