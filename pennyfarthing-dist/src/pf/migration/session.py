"""
Session file migration tools.

Converts session files from markdown format to XML format
per schemas/session-schema.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Literal


@dataclass
class AcceptanceCriterion:
    """An acceptance criterion."""

    id: int
    description: str
    status: Literal["pending", "in-progress", "done", "blocked"] = "pending"


@dataclass
class WorkLogEntry:
    """A work log entry."""

    agent: str
    date: str
    content: str
    phase: str | None = None


@dataclass
class ReviewAssessment:
    """A reviewer assessment."""

    agent: str = "reviewer"
    verdict: Literal["approved", "rejected", "needs-work"] = "approved"
    content: str = ""


@dataclass
class SessionFile:
    """Parsed session file data."""

    story_id: str
    workflow: str = "tdd"
    jira: str = ""
    epic: str = ""
    points: int = 0
    started: str = ""
    phase: str = "setup"
    next_agent: str = "sm"
    handoff_ready: bool = False
    acceptance_criteria: list[AcceptanceCriterion] = field(default_factory=list)
    context: str = ""
    work_log: list[WorkLogEntry] = field(default_factory=list)
    assessment: ReviewAssessment | None = None

    def to_xml(self) -> str:
        """Convert to XML format."""
        lines = [f'<session story="{self.story_id}" workflow="{self.workflow}">']

        # Meta section
        lines.append("  <meta>")
        lines.append(f"    <jira>{self.jira or self.story_id}</jira>")
        if self.epic:
            lines.append(f"    <epic>{self.epic}</epic>")
        if self.points:
            lines.append(f"    <points>{self.points}</points>")
        lines.append(f"    <started>{self.started or date.today().isoformat()}</started>")
        lines.append("  </meta>")
        lines.append("")

        # Status
        handoff = "true" if self.handoff_ready else "false"
        lines.append(
            f'  <status phase="{self.phase}" next-agent="{self.next_agent}" '
            f'handoff-ready="{handoff}"/>'
        )
        lines.append("")

        # Acceptance criteria
        lines.append("  <acceptance-criteria>")
        for ac in self.acceptance_criteria:
            lines.append(f'    <ac id="{ac.id}" status="{ac.status}">{ac.description}</ac>')
        lines.append("  </acceptance-criteria>")
        lines.append("")

        # Context
        lines.append("  <context>")
        if self.context:
            for line in self.context.strip().split("\n"):
                lines.append(f"    {line}")
        else:
            lines.append(f"    See: .session/context-story-{self.story_id}.md")
        lines.append("  </context>")
        lines.append("")

        # Work log
        lines.append("  <work-log>")
        for entry in self.work_log:
            phase_attr = f' phase="{entry.phase}"' if entry.phase else ""
            lines.append(f'    <entry agent="{entry.agent}" date="{entry.date}"{phase_attr}>')
            for line in entry.content.strip().split("\n"):
                lines.append(f"      {line}")
            lines.append("    </entry>")

        # Assessment (if present)
        if self.assessment:
            lines.append(
                f'    <assessment agent="{self.assessment.agent}" '
                f'verdict="{self.assessment.verdict}">'
            )
            for line in self.assessment.content.strip().split("\n"):
                lines.append(f"      {line}")
            lines.append("    </assessment>")

        lines.append("  </work-log>")
        lines.append("</session>")

        return "\n".join(lines)


def _extract_field(content: str, label: str) -> str:
    """Extract a field value from markdown **Label:** value format."""
    pattern = rf"\*\*{re.escape(label)}:\*\*\s*(.+?)(?:\n|$)"
    match = re.search(pattern, content)
    if match:
        return match.group(1).strip()
    return ""


def _normalize_phase(phase: str) -> str:
    """Normalize phase value."""
    phase = phase.lower()
    # Remove suffixes
    phase = re.sub(r"-complete$", "", phase)
    phase = re.sub(r"^dev-", "", phase)
    phase = re.sub(r"^review-", "", phase)
    # Map common values
    if phase in ("approved", "finished"):
        phase = "finish"
    elif phase in ("implementing", "implementation"):
        phase = "green"
    return phase


def _normalize_agent(agent: str) -> str:
    """Normalize agent name."""
    agent = agent.lower()
    # Remove parenthetical persona names
    agent = re.sub(r"\s*\([^)]+\)", "", agent)
    # Take first word only
    agent = agent.split()[0] if agent else "sm"
    return agent


def _parse_acceptance_criteria(content: str) -> list[AcceptanceCriterion]:
    """Parse acceptance criteria from markdown checkboxes."""
    criteria = []

    # Find AC section
    ac_section = re.search(r"## Acceptance Criteria\n(.+?)(?=\n##|\Z)", content, re.DOTALL)
    if not ac_section:
        return criteria

    section_text = ac_section.group(1)

    # Pattern 1: - [x] AC1: Description
    pattern1 = re.compile(r"^\s*-\s*\[([xX\s])\]\s*AC(\d+):?\s*(.+)$", re.MULTILINE)
    for match in pattern1.finditer(section_text):
        checked = match.group(1).lower() == "x"
        ac_id = int(match.group(2))
        desc = match.group(3).strip()
        status = "done" if checked else "pending"
        criteria.append(AcceptanceCriterion(id=ac_id, description=desc, status=status))

    # If no ACs found, try pattern 2: - [x] Description (auto-number)
    if not criteria:
        pattern2 = re.compile(r"^\s*-\s*\[([xX\s])\]\s*(.+)$", re.MULTILINE)
        for i, match in enumerate(pattern2.finditer(section_text), start=1):
            checked = match.group(1).lower() == "x"
            desc = match.group(2).strip()
            status = "done" if checked else "pending"
            criteria.append(AcceptanceCriterion(id=i, description=desc, status=status))

    return criteria


def _parse_work_log(content: str) -> tuple[list[WorkLogEntry], ReviewAssessment | None]:
    """Parse work log entries from markdown."""
    entries = []
    assessment = None

    # Find work log section
    log_section = re.search(r"## Work Log\n(.+?)(?=\n## [^W]|\Z)", content, re.DOTALL)
    if not log_section:
        return entries, assessment

    section_text = log_section.group(1)

    # Split by agent headers (### Agent Name (Date) or ### Agent Action (Date))
    header_pattern = re.compile(r"^###\s+(\w+)(?:\s+\w+)?\s+\((\d{4}-\d{2}-\d{2})\)", re.MULTILINE)

    matches = list(header_pattern.finditer(section_text))

    for i, match in enumerate(matches):
        agent = match.group(1).lower()
        entry_date = match.group(2)

        # Get content until next header or end
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(section_text)
        entry_content = section_text[start:end].strip()

        # Determine phase from header context
        phase = None
        header_text = match.group(0).lower()
        if "red" in header_text:
            phase = "red"
        elif "green" in header_text or "implementation" in header_text:
            phase = "green"
        elif "refactor" in header_text:
            phase = "refactor"

        # Check if this is a reviewer assessment
        if agent == "reviewer" and "verdict" in entry_content.lower():
            verdict = "approved"
            if "rejected" in entry_content.lower():
                verdict = "rejected"
            elif "needs-work" in entry_content.lower() or "needs work" in entry_content.lower():
                verdict = "needs-work"
            assessment = ReviewAssessment(agent="reviewer", verdict=verdict, content=entry_content)
        else:
            entries.append(
                WorkLogEntry(agent=agent, date=entry_date, content=entry_content, phase=phase)
            )

    return entries, assessment


def _extract_context(content: str) -> str:
    """Extract technical context section."""
    # Find context section
    context_section = re.search(r"## Technical Context\n(.+?)(?=\n##|\Z)", content, re.DOTALL)
    if context_section:
        return context_section.group(1).strip()
    return ""


def parse_markdown_session(content: str, filename: str) -> SessionFile:
    """Parse a markdown session file into structured data.

    Args:
        content: File content
        filename: Filename (used to extract story ID)

    Returns:
        SessionFile with parsed data
    """
    # Extract story ID from filename
    story_id = filename.replace("-session.md", "")

    # Extract fields
    jira = _extract_field(content, "Jira")
    epic = _extract_field(content, "Epic")
    # Clean epic - take just the ID, not description
    if epic:
        epic = epic.split()[0] if " " in epic else epic

    points_str = _extract_field(content, "Points")
    points = int(points_str) if points_str.isdigit() else 0

    workflow = _extract_field(content, "Workflow").lower() or "tdd"
    started = _extract_field(content, "Started")

    # Status fields (may appear twice - get last occurrence)
    all_phases = re.findall(r"\*\*Current Phase:\*\*\s*(.+?)(?:\n|$)", content)
    phase = _normalize_phase(all_phases[-1]) if all_phases else "setup"

    all_next = re.findall(r"\*\*Next Agent:\*\*\s*(.+?)(?:\n|$)", content)
    next_agent = _normalize_agent(all_next[-1]) if all_next else "sm"

    all_handoff = re.findall(r"\*\*Handoff Ready:\*\*\s*(.+?)(?:\n|$)", content)
    handoff_ready = bool(all_handoff and all_handoff[-1].lower().startswith("y"))

    # Parse sections
    acceptance_criteria = _parse_acceptance_criteria(content)
    context = _extract_context(content)
    work_log, assessment = _parse_work_log(content)

    return SessionFile(
        story_id=story_id,
        workflow=workflow,
        jira=jira,
        epic=epic,
        points=points,
        started=started,
        phase=phase,
        next_agent=next_agent,
        handoff_ready=handoff_ready,
        acceptance_criteria=acceptance_criteria,
        context=context,
        work_log=work_log,
        assessment=assessment,
    )


def is_xml_format(content: str) -> bool:
    """Check if content is already in XML format."""
    return "<session story=" in content


def convert_session_file(file_path: Path, *, dry_run: bool = False) -> dict[str, str | bool]:
    """Convert a session file from markdown to XML format.

    Args:
        file_path: Path to session file
        dry_run: If True, return converted content without writing

    Returns:
        Dict with 'success', 'message', and optionally 'content' (for dry_run)
    """
    if not file_path.exists():
        return {"success": False, "message": f"File not found: {file_path}"}

    content = file_path.read_text()

    # Skip if already XML
    if is_xml_format(content):
        return {"success": True, "message": "Already in XML format", "skipped": True}

    # Parse and convert
    session = parse_markdown_session(content, file_path.name)
    xml_content = session.to_xml()

    if dry_run:
        return {
            "success": True,
            "message": "Would convert to XML",
            "content": xml_content,
            "dry_run": True,
        }

    # Write converted content
    file_path.write_text(xml_content)
    return {"success": True, "message": f"Converted: {file_path.name}"}


def find_session_files(root: Path) -> list[Path]:
    """Find all session files in a project.

    Args:
        root: Project root directory

    Returns:
        List of session file paths
    """
    session_dir = root / ".session"
    files = []

    if session_dir.exists():
        files.extend(session_dir.glob("*-session.md"))
        archive_dir = session_dir / "archive"
        if archive_dir.exists():
            files.extend(archive_dir.glob("*-session.md"))

    return sorted(files)
