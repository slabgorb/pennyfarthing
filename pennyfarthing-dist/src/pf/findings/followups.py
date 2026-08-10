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
from typing import Any, TypedDict

from pf.findings.aggregate import _parse_frontmatter
from pf.findings.capture import parse_delivery_findings
from pf.findings.summary import parse_session_deviations


class FindingCandidateDict(TypedDict):
    """Candidate dict for a finding-source deferral."""

    source: str
    description: str
    type: str


class DeviationCandidateDict(TypedDict):
    """Candidate dict for a deviation-source deferral."""

    source: str
    description: str
    forward_impact: str


class SuggestionDict(TypedDict):
    """Rendered suggestion dict for output."""

    description: str
    command: str | None
    provenance: str
    source: str

# Non-blocking findings whose description carries one of these phrases imply
# consciously deferred work even when the finding type alone doesn't (gh #114).
# Word-boundary matched: "untracked" must not hit "tracked", "relater" must
# not hit "later".
TAG_RE = re.compile(
    r"(?<![\w-])(follow[- ]?ups?|later|future|defer\w*|out of scope|tracked)(?![\w-])",
    re.IGNORECASE,
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
        tagged = bool(TAG_RE.search(description))
        if finding.get("type") in CANDIDATE_TYPES or tagged:
            candidates.append(
                {
                    "source": "finding",
                    "description": description,
                    "type": finding.get("type"),
                }
            )

    for deviation in parse_session_deviations(content):
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


# Epic ids safe to splice into a shell command UNQUOTED. The epic is the first
# positional to the Click command `pf sprint story add`, which has value-taking
# options (--sprint-file, --jira, ...), so an option-shaped epic would let Click
# consume the title as an option value (CWE-88). Anchor the first char to a
# non-dash (mirrors the 155-7 archive-filename guard + _reject_option_like).
_SAFE_EPIC_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")

# Characters that would break out of, or expand inside, the double-quoted title
# segment of the generated command (CWE-78: quote/backtick/dollar/backslash/
# newline; `!` triggers history expansion in interactive shells).
_UNSAFE_TITLE_CHARS = re.compile(r'["`$\\\n!]')


def _shell_safe_segment(value: str) -> str:
    """Neutralize a value spliced into the double-quoted title of the command.

    Every prose segment that reaches the command sink — the finding
    description AND the provenance's story id — must pass through this, or
    the sanitization is "validation on one path" (lang-review #13). Swaps
    unsafe chars for `'` (titles are prose, nothing is lost) and strips a
    leading dash/quote/space so the value can't be option-shaped (CWE-88).
    """
    return _UNSAFE_TITLE_CHARS.sub("'", value).lstrip("-' ").strip()


def _session_epic(content: str) -> str | None:
    """Read the epic id from session frontmatter.

    The epic comes from the session's own `epic:` field — never from
    prefix-parsing the story id (155-4 rule). Delegates to the package's
    frontmatter parser (SOUL #2). Returns None when the field is missing
    or not shell-safe — the caller then suppresses the pre-filled command
    rather than emitting an unsafe or placeholder epic.
    """
    frontmatter = _parse_frontmatter(content)
    if not isinstance(frontmatter, dict):
        return None
    epic = str(frontmatter.get("epic") or "").strip()
    if not epic or ".." in epic or not _SAFE_EPIC_RE.fullmatch(epic):
        return None
    return epic


def _open_stories(project_root: Path) -> list[tuple[str, str]]:
    """Collect (id, title) for open stories in the merged current sprint
    and future.yaml (future.initiatives[].epics[].stories[]).

    Returns [] when no sprint data is loadable — dedup then fails OPEN
    (nothing to dedup against must not suppress the report).
    """
    from pf.sprint.loader import load_sprint
    from pf.sprint.status_normalize import normalize_status

    stories: list[tuple[str, str]] = []

    data = load_sprint(project_root)
    if data:
        for epic in data.get("epics", []):
            if not isinstance(epic, dict):
                continue
            for story in epic.get("stories", []) or []:
                if not isinstance(story, dict):
                    continue
                if normalize_status(story.get("status")) in OPEN_STATUSES:
                    stories.append(
                        (str(story.get("id", "")), str(story.get("title", "")))
                    )

    # Also scan future.yaml — fail open when absent or unreadable.
    future_path = project_root / "sprint" / "future.yaml"
    if future_path.exists():
        try:
            from pf.common.config import load_yaml_config

            future_data = load_yaml_config(future_path) or {}
            for initiative in (future_data.get("future") or {}).get("initiatives", []):
                if not isinstance(initiative, dict):
                    continue
                for epic in initiative.get("epics", []) or []:
                    if not isinstance(epic, dict):
                        continue
                    for story in epic.get("stories", []) or []:
                        if not isinstance(story, dict):
                            continue
                        stories.append(
                            (str(story.get("id", "")), str(story.get("title", "")))
                        )
        except Exception:
            pass  # fail open — missing/corrupt future.yaml must not suppress report

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
         skipped, markdown}} or {success: False, error: str} — never raises.
        success=False only when the session itself is missing/unreadable;
        an unresolvable project root fails OPEN (dedup skipped, suggestions
        kept) — this is a report, never a finish gate. A suggestion's
        `command` is None when the session epic is missing or not
        shell-safe; the candidate stays listed in the markdown either way.
    """
    session_path = Path(session_path)

    # CWE-22: verify the path resolves within <project_root>/.session/ before
    # any filesystem access.  Determine the check-root eagerly; if it cannot be
    # determined the check is skipped (fail-open mirrors the dedup posture).
    _check_root = project_root
    if _check_root is None:
        try:
            from pf.common.config import get_project_root

            _check_root = get_project_root()
        except (FileNotFoundError, OSError):
            _check_root = None
    if _check_root is not None:
        _session_base = Path(_check_root).resolve() / ".session"
        _resolved = session_path.resolve()
        try:
            _resolved.relative_to(_session_base)
        except ValueError:
            return {
                "success": False,
                "error": (
                    f"Session path is outside the .session directory "
                    f"(traversal rejected): {session_path}"
                ),
            }

    if not session_path.exists():
        return {"success": False, "error": f"Session file not found: {session_path}"}

    try:
        content = session_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        # An unreadable session means there is nothing to report from —
        # a truthful error result, never a raise (SOUL #10).
        return {
            "success": False,
            "error": (
                f"Failed to read session file {session_path.name} "
                f"({type(exc).__name__})"
            ),
        }
    candidates = detect_deferred_followups(content)
    epic = _session_epic(content)

    if project_root is None:
        try:
            from pf.common.config import get_project_root

            project_root = get_project_root()
        except (FileNotFoundError, OSError):
            # The root only feeds dedup. Fail OPEN like missing sprint data:
            # losing the report to a dedup-only failure would drop the
            # deferral — the exact failure this feature exists to prevent.
            project_root = None
    open_stories = _open_stories(Path(project_root)) if project_root else []

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
        # The command is meant to be copy-pasted into a shell. BOTH prose
        # segments that reach the double-quoted title — the description and
        # the story-id-derived provenance — go through the same neutralization
        # (CWE-78/88); sanitizing only one is the "validation on one path"
        # trap (lang-review #13). The provenance keyword stays literal.
        safe_story_id = _shell_safe_segment(story_id)
        provenance = f"from {safe_story_id} review"
        title = _shell_safe_segment(description)
        command = None
        if epic and title and safe_story_id:
            command = (
                f'pf sprint story add {epic} "{title} ({provenance})" '
                f"{DEFAULT_POINTS}"
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
            if suggestion["command"]:
                lines.append(f"  `{suggestion['command']}`")
            else:
                lines.append(
                    "  (epic unresolved in session frontmatter — "
                    "mint manually with pf sprint story add)"
                )
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
