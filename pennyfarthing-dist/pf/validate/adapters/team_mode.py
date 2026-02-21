"""Team-mode protocol validator adapter.

Validates that agent definitions include proper team-mode sections
for Claude Code native Agent Teams integration.

Story: MSSCI-15109 (86-14)
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.common.config import get_dist_root
from pf.validate import ValidateReport

# Regex to extract <team-mode> section content
_TEAM_MODE_RE = re.compile(r"<team-mode>(.*?)</team-mode>", re.DOTALL)

# Required topics in the behavior guide's <team-mode> section
_BEHAVIOR_GUIDE_TOPICS = {
    "team_creation": ["TeamCreate", "team creation", "create team"],
    "spawning": ["spawn", "Task tool", "teammate"],
    "sendmessage": ["SendMessage"],
    "cleanup": ["cleanup", "TeamDelete", "shut down", "shutdown"],
}

# Required lead agent topics
_LEAD_TOPICS = {
    "phase_entry": ["phase entry", "phase start", "on phase"],
    "spawn_per_yaml": ["spawn", "teammates", "workflow YAML", "YAML"],
    "shutdown_before_exit": ["shut down", "shutdown", "before exit", "before handoff"],
}

# Required teammate awareness topics
_TEAMMATE_TOPICS = {
    "identity": ["teammate", "not lead", "not the lead"],
    "sendmessage": ["SendMessage"],
    "idle": ["idle", "go idle"],
    "shutdown_response": ["shutdown", "shutdown_response", "shutdown request"],
}


def extract_team_mode_section(content: str) -> str | None:
    """Extract content between <team-mode> tags."""
    m = _TEAM_MODE_RE.search(content)
    return m.group(1) if m else None


def validate_behavior_guide_team_mode(
    path: Path,
) -> tuple[list[str], list[str]]:
    """Validate the behavior guide has a <team-mode> section with required topics.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    section = extract_team_mode_section(content)

    if section is None:
        errors.append("Missing <team-mode> section in behavior guide")
        return errors, warnings

    stripped = section.strip()
    if not stripped:
        errors.append("Empty <team-mode> section — no content")
        return errors, warnings

    # Check required topics
    for topic_name, keywords in _BEHAVIOR_GUIDE_TOPICS.items():
        if not any(kw.lower() in section.lower() for kw in keywords):
            errors.append(
                f"<team-mode> section missing required topic: {topic_name} "
                f"(expected one of: {', '.join(keywords)})"
            )

    return errors, warnings


def validate_lead_agent_team_mode(
    path: Path,
) -> tuple[list[str], list[str]]:
    """Validate lead agent has team-mode behavior section.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    section = extract_team_mode_section(content)

    if section is None:
        errors.append(f"Missing <team-mode> section in lead agent {path.name}")
        return errors, warnings

    stripped = section.strip()
    if not stripped:
        errors.append(f"Empty <team-mode> section in lead agent {path.name}")
        return errors, warnings

    section_lower = section.lower()

    # Must reference lead role
    if "lead" not in section_lower:
        errors.append("Lead agent <team-mode> section must reference 'lead' role")

    # Check lead-specific topics
    for topic_name, keywords in _LEAD_TOPICS.items():
        if not any(kw.lower() in section_lower for kw in keywords):
            warnings.append(
                f"Lead agent <team-mode> missing topic: {topic_name} "
                f"(expected one of: {', '.join(keywords)})"
            )

    return errors, warnings


def validate_teammate_awareness(
    content: str,
) -> tuple[list[str], list[str]]:
    """Validate teammate behavior content in team-mode section.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    section = extract_team_mode_section(content)

    if section is None:
        errors.append("Missing <team-mode> section for teammate awareness")
        return errors, warnings

    section_lower = section.lower()

    # Check teammate-specific topics
    for topic_name, keywords in _TEAMMATE_TOPICS.items():
        if not any(kw.lower() in section_lower for kw in keywords):
            errors.append(
                f"Teammate awareness missing topic: {topic_name} "
                f"(expected one of: {', '.join(keywords)})"
            )

    return errors, warnings


def validate_exit_protocol_team_branch(
    content: str,
) -> tuple[list[str], list[str]]:
    """Validate exit protocol has team-mode cleanup branch.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Look for team cleanup in exit protocol section
    # The exit protocol is in <agent-exit-protocol> tags
    exit_re = re.compile(
        r"<agent-exit-protocol>(.*?)</agent-exit-protocol>", re.DOTALL
    )
    exit_match = exit_re.search(content)

    if exit_match is None:
        errors.append("Missing <agent-exit-protocol> section")
        return errors, warnings

    exit_content = exit_match.group(1).lower()

    # Must reference team cleanup
    team_cleanup_terms = ["team", "teamdelete", "cleanup team", "shut down teammate"]
    if not any(term in exit_content for term in team_cleanup_terms):
        errors.append(
            "Exit protocol missing team-mode branch "
            "(must reference team cleanup before handoff)"
        )

    return errors, warnings


def validate_communication_protocols(
    content: str,
) -> tuple[list[str], list[str]]:
    """Validate that reflector markers and SendMessage are properly documented.

    Reflector markers for inter-phase handoff (unchanged).
    SendMessage for intra-phase teammate communication (new).

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Reflector section must still exist
    if "<critical>" not in content or "CYCLIST" not in content:
        errors.append("Reflector/CYCLIST marker section missing — must remain for inter-phase handoff")

    # Team-mode section must reference SendMessage for intra-phase
    section = extract_team_mode_section(content)
    if section is not None:
        if "SendMessage" not in section:
            errors.append(
                "<team-mode> must reference SendMessage for intra-phase communication"
            )
        # Should distinguish inter-phase (markers) from intra-phase (SendMessage)
        if "inter-phase" not in section.lower() and "intra-phase" not in section.lower():
            warnings.append(
                "<team-mode> should distinguish inter-phase (markers) "
                "from intra-phase (SendMessage) communication"
            )

    return errors, warnings


def classify_team_mode_agents(
    agents_dir: Path,
) -> tuple[list[Path], list[Path]]:
    """Classify agent files into lead agents and all agents with team-mode.

    Lead agents are those whose <team-mode> section mentions 'lead'.

    Returns:
        (lead_agents, all_team_mode_agents)
    """
    leads: list[Path] = []
    all_tm: list[Path] = []

    for f in sorted(agents_dir.glob("*.md")):
        if f.name == "README.md":
            continue

        content = f.read_text()
        section = extract_team_mode_section(content)
        if section is None:
            continue

        all_tm.append(f)
        if "lead" in section.lower():
            leads.append(f)

    return leads, all_tm


def run(
    root: Path, *, fix: bool = False, strict: bool = False
) -> ValidateReport:
    """Validate agent team-mode protocol sections."""
    report = ValidateReport(validator="team-mode")

    # Validate behavior guide
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        report.errors += 1
        report.details.append("[ERROR] pennyfarthing-dist not found")
        return report
    guides_dir = dist_root / "guides"
    behavior_guide = guides_dir / "agent-behavior.md"
    if behavior_guide.is_file():
        file_errors, file_warnings = validate_behavior_guide_team_mode(behavior_guide)
        for e in file_errors:
            report.errors += 1
            report.details.append(f"[ERROR] agent-behavior.md: {e}")
        for w in file_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] agent-behavior.md: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] agent-behavior.md: {w}")
        if not file_errors:
            report.passed += 1

        # Validate exit protocol team branch
        guide_content = behavior_guide.read_text()
        exit_errors, exit_warnings = validate_exit_protocol_team_branch(guide_content)
        for e in exit_errors:
            report.errors += 1
            report.details.append(f"[ERROR] agent-behavior.md exit: {e}")
        for w in exit_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] agent-behavior.md exit: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] agent-behavior.md exit: {w}")

        # Validate communication protocol distinction
        comm_errors, comm_warnings = validate_communication_protocols(guide_content)
        for e in comm_errors:
            report.errors += 1
            report.details.append(f"[ERROR] agent-behavior.md comm: {e}")
        for w in comm_warnings:
            if strict:
                report.errors += 1
                report.details.append(f"[ERROR] agent-behavior.md comm: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] agent-behavior.md comm: {w}")
    else:
        report.errors += 1
        report.details.append("[ERROR] agent-behavior.md guide not found")

    # Validate lead agents
    agents_dir = dist_root / "agents"
    if agents_dir.is_dir():
        for agent_name in ("dev", "reviewer"):
            agent_path = agents_dir / f"{agent_name}.md"
            if agent_path.is_file():
                lead_errors, lead_warnings = validate_lead_agent_team_mode(agent_path)
                for e in lead_errors:
                    report.errors += 1
                    report.details.append(f"[ERROR] {agent_name}.md: {e}")
                for w in lead_warnings:
                    if strict:
                        report.errors += 1
                        report.details.append(f"[ERROR] {agent_name}.md: {w}")
                    else:
                        report.warnings += 1
                        report.details.append(f"[WARN] {agent_name}.md: {w}")
                if not lead_errors:
                    report.passed += 1

    return report
