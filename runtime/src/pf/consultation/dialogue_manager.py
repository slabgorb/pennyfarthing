"""Dialogue file management for tandem agent consultation.

Persistence layer for consultation exchanges between tandem agents.
Port of packages/core/src/consultation/dialogue-manager.ts to Python.

All pure functions use the same markdown format defined in ADR-0012.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Outcome = Literal["applied", "deferred", "rejected"]

SUMMARY_MARKER = "## Summary"
EXCHANGE_RE = re.compile(r"^## Exchange (\d+)")
OUTCOME_RE = re.compile(r"^\*\*Outcome:\*\*\s+(.+)")
DIRECTION_RE = re.compile(r"^\*\*\[(\d{2}:\d{2})\]\s+(\S+)\s+→\s+(\S+)\*\*")
PARTNER_RESP_RE = re.compile(r"^\*\*\[(\d{2}:\d{2})\]\s+(\S+):\*\*")
CONFIDENCE_RE = re.compile(r"^\*\*Confidence:\*\*\s+(\S+)")


@dataclass
class DialogueHeader:
    story_id: str
    workflow: str
    leader: str
    partner: str
    leader_character: str | None = None
    partner_character: str | None = None
    started_at: str = ""


@dataclass
class DialogueExchange:
    number: int
    timestamp: str  # HH:MM
    leader: str
    partner: str
    question: str
    recommendation: str
    confidence: str
    outcome: Outcome | None = None
    outcome_note: str | None = None


@dataclass
class DialogueResult:
    success: bool
    data: dict | None = None
    error: str | None = None


# =============================================================================
# Pure Functions
# =============================================================================


def create_dialogue_content(header: DialogueHeader) -> str:
    """Create initial dialogue file content with header and empty summary."""
    leader_label = (
        f"{header.leader} ({header.leader_character})" if header.leader_character else header.leader
    )
    partner_label = (
        f"{header.partner} ({header.partner_character})"
        if header.partner_character
        else header.partner
    )

    return (
        f"# Tandem Dialogue: {header.story_id}\n"
        f"\n"
        f"**Workflow:** {header.workflow}\n"
        f"**Leader:** {leader_label} | **Partner:** {partner_label}\n"
        f"**Started:** {header.started_at}\n"
        f"\n"
        f"---\n"
        f"\n"
        f"{SUMMARY_MARKER}\n"
        f"- **Total exchanges:** 0\n"
        f"- **Key decisions:** None\n"
        f"- **Time in tandem:** 0m\n"
    )


def format_exchange(exchange: DialogueExchange) -> str:
    """Format a single exchange as markdown block."""
    if exchange.outcome:
        outcome_text = f"**Outcome:** {exchange.outcome}"
        if exchange.outcome_note:
            outcome_text += f" - {exchange.outcome_note}"
    else:
        outcome_text = "**Outcome:** _pending_"

    return (
        f"## Exchange {exchange.number}\n"
        f"**[{exchange.timestamp}] {exchange.leader} \u2192 {exchange.partner}**\n"
        f"\n"
        f"> {exchange.question}\n"
        f"\n"
        f"**[{exchange.timestamp}] {exchange.partner}:**\n"
        f"\n"
        f"{exchange.recommendation}\n"
        f"\n"
        f"**Confidence:** {exchange.confidence}\n"
        f"\n"
        f"{outcome_text}\n"
        f"\n"
        f"---\n"
    )


def parse_dialogue_exchanges(content: str) -> list[DialogueExchange]:
    """Parse exchanges from dialogue file content."""
    exchanges: list[DialogueExchange] = []
    lines = content.split("\n")

    current: dict | None = None
    in_question = False
    in_recommendation = False
    question_lines: list[str] = []
    rec_lines: list[str] = []

    for line in lines:
        # New exchange starts
        m = EXCHANGE_RE.match(line)
        if m:
            if current is not None and "number" in current:
                current["question"] = "\n".join(question_lines)
                current["recommendation"] = "\n".join(rec_lines)
                exchanges.append(DialogueExchange(**current))
            current = {"number": int(m.group(1))}
            question_lines = []
            rec_lines = []
            in_question = False
            in_recommendation = False
            continue

        if current is None:
            continue

        # Leader → Partner direction line
        dm = DIRECTION_RE.match(line)
        if dm:
            current["timestamp"] = dm.group(1)
            current["leader"] = dm.group(2)
            current["partner"] = dm.group(3)
            in_question = True
            in_recommendation = False
            continue

        # Partner response line
        pm = PARTNER_RESP_RE.match(line)
        if pm:
            in_question = False
            in_recommendation = True
            continue

        # Confidence line
        cm = CONFIDENCE_RE.match(line)
        if cm:
            current["confidence"] = cm.group(1)
            in_recommendation = False
            continue

        # Outcome line
        om = OUTCOME_RE.match(line)
        if om:
            outcome_raw = om.group(1).strip()
            if outcome_raw != "_pending_":
                dash_idx = outcome_raw.find(" - ")
                if dash_idx >= 0:
                    current["outcome"] = outcome_raw[:dash_idx].strip()
                    current["outcome_note"] = outcome_raw[dash_idx + 3 :].strip()
                else:
                    current["outcome"] = outcome_raw
            in_recommendation = False
            continue

        # Collect question text (blockquote lines)
        if in_question:
            stripped = line[2:] if line.startswith("> ") else line
            if stripped.strip():
                question_lines.append(stripped)
            continue

        # Collect recommendation text
        if in_recommendation:
            if line.strip():
                rec_lines.append(line)
            continue

    # Push last exchange
    if current is not None and "number" in current:
        current["question"] = "\n".join(question_lines)
        current["recommendation"] = "\n".join(rec_lines)
        exchanges.append(DialogueExchange(**current))

    return exchanges


def generate_summary(exchanges: list[DialogueExchange], started_at: str) -> str:
    """Generate summary markdown section from exchanges."""
    total = len(exchanges)

    # Key decisions from applied outcomes
    applied = [e for e in exchanges if e.outcome == "applied" and e.outcome_note]
    if applied:
        decisions_text = "\n".join(f"  - {e.outcome_note}" for e in applied)
    else:
        decisions_text = "None"

    # Time in tandem: span between first and last exchange timestamps
    duration = "0m"
    if exchanges:
        first = _parse_time(exchanges[0].timestamp)
        last = _parse_time(exchanges[-1].timestamp)
        if first is not None and last is not None:
            mins = last - first
            duration = f"{mins}m" if mins > 0 else "0m"

    return (
        f"{SUMMARY_MARKER}\n"
        f"- **Total exchanges:** {total}\n"
        f"- **Key decisions:**\n"
        f"{decisions_text}\n"
        f"- **Time in tandem:** {duration}\n"
    )


# =============================================================================
# File Operations
# =============================================================================


def append_exchange_to_file(
    dialogue_path: Path,
    exchange: DialogueExchange,
    header: DialogueHeader | None = None,
) -> DialogueResult:
    """Append an exchange to a dialogue file. Creates the file if missing."""
    try:
        if not dialogue_path.exists():
            if not header:
                return DialogueResult(success=False, error="Header required for new dialogue file")
            initial = create_dialogue_content(header)
            dialogue_path.parent.mkdir(parents=True, exist_ok=True)
            dialogue_path.write_text(initial, encoding="utf-8")

        content = dialogue_path.read_text(encoding="utf-8")
        formatted = format_exchange(exchange)

        # Insert exchange before summary section
        summary_idx = content.find(SUMMARY_MARKER)
        if summary_idx < 0:
            dialogue_path.write_text(content + "\n" + formatted, encoding="utf-8")
        else:
            before = content[:summary_idx]
            after = content[summary_idx:]
            dialogue_path.write_text(before + formatted + "\n" + after, encoding="utf-8")

        return DialogueResult(success=True, data={"exchangeNumber": exchange.number})
    except Exception as err:
        return DialogueResult(success=False, error=f"Failed to append exchange: {err}")


def update_outcome_in_file(
    dialogue_path: Path,
    exchange_num: int,
    outcome: Outcome,
    note: str | None = None,
) -> DialogueResult:
    """Update the outcome of a specific exchange in the dialogue file."""
    try:
        if not dialogue_path.exists():
            return DialogueResult(
                success=False,
                error=f"Dialogue file not found: {dialogue_path}",
            )

        content = dialogue_path.read_text(encoding="utf-8")
        lines = content.split("\n")

        in_target = False
        found = False

        for i, line in enumerate(lines):
            em = EXCHANGE_RE.match(line)
            if em:
                in_target = int(em.group(1)) == exchange_num

            if in_target and OUTCOME_RE.match(line):
                outcome_text = f"**Outcome:** {outcome}"
                if note:
                    outcome_text += f" - {note}"
                lines[i] = outcome_text
                found = True
                break

        if not found:
            return DialogueResult(
                success=False,
                error=f"Exchange {exchange_num} not found in dialogue file",
            )

        dialogue_path.write_text("\n".join(lines), encoding="utf-8")
        return DialogueResult(success=True, data={"exchangeNum": exchange_num, "outcome": outcome})
    except Exception as err:
        return DialogueResult(success=False, error=f"Failed to update outcome: {err}")


def refresh_summary(dialogue_path: Path) -> DialogueResult:
    """Regenerate the summary section in an existing dialogue file."""
    try:
        if not dialogue_path.exists():
            return DialogueResult(
                success=False,
                error=f"Dialogue file not found: {dialogue_path}",
            )

        content = dialogue_path.read_text(encoding="utf-8")
        exchanges = parse_dialogue_exchanges(content)

        # Extract startedAt from header
        started_match = re.search(r"\*\*Started:\*\*\s+(.+)", content)
        started_at = started_match.group(1).strip() if started_match else ""

        new_summary = generate_summary(exchanges, started_at)

        # Replace existing summary section
        summary_idx = content.find(SUMMARY_MARKER)
        if summary_idx < 0:
            dialogue_path.write_text(content + "\n" + new_summary, encoding="utf-8")
        else:
            before = content[:summary_idx]
            dialogue_path.write_text(before + new_summary, encoding="utf-8")

        return DialogueResult(success=True, data={"totalExchanges": len(exchanges)})
    except Exception as err:
        return DialogueResult(success=False, error=f"Failed to refresh summary: {err}")


def archive_dialogue(
    dialogue_path: Path,
    archive_dir: Path,
    jira_key: str | None = None,
    story_id: str | None = None,
) -> DialogueResult:
    """Copy dialogue file to archive directory."""
    try:
        if not dialogue_path.exists():
            return DialogueResult(
                success=False,
                error=f"Dialogue file not found: {dialogue_path}",
            )

        archive_dir.mkdir(parents=True, exist_ok=True)

        prefix = jira_key or story_id or "unknown"
        archive_name = f"{prefix}-dialogue.md"
        archive_path = archive_dir / archive_name

        shutil.copy2(dialogue_path, archive_path)

        return DialogueResult(success=True, data={"archivePath": str(archive_path)})
    except Exception as err:
        return DialogueResult(success=False, error=f"Failed to archive dialogue: {err}")


# =============================================================================
# Internal Helpers
# =============================================================================


def _parse_time(timestamp: str) -> int | None:
    """Parse HH:MM timestamp to minutes since midnight."""
    parts = timestamp.split(":")
    if len(parts) != 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        return None
    return hours * 60 + minutes
