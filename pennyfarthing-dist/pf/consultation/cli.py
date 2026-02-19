"""Click CLI for consultation dialogue management.

Provides `pf consultation` group with subcommands matching
the bash wrapper dialogue-manager.sh interface.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import click


@click.group()
def consultation():
    """Tandem consultation dialogue management.

    \b
    Subcommands:
      init       - Create dialogue file
      append     - Append exchange
      outcome    - Update outcome
      summarize  - Refresh summary
      archive    - Archive dialogue file
    """
    pass


@consultation.command()
@click.argument("story_id")
@click.argument("workflow")
@click.argument("leader")
@click.argument("partner")
def init(story_id: str, workflow: str, leader: str, partner: str) -> None:
    """Create a new dialogue file."""
    from pf.consultation.dialogue_manager import (
        DialogueHeader,
        create_dialogue_content,
    )

    header = DialogueHeader(
        story_id=story_id,
        workflow=workflow,
        leader=leader,
        partner=partner,
        started_at=datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    content = create_dialogue_content(header)
    session_dir = Path(".session")
    session_dir.mkdir(parents=True, exist_ok=True)
    dialogue_path = session_dir / f"{story_id}-dialogue.md"
    dialogue_path.write_text(content, encoding="utf-8")

    click.echo(f"Created {dialogue_path}")


@consultation.command()
@click.argument("story_id")
@click.argument("question")
@click.argument("recommendation")
@click.argument("confidence")
def append(story_id: str, question: str, recommendation: str, confidence: str) -> None:
    """Append an exchange to a dialogue file."""
    from pf.consultation.dialogue_manager import (
        DialogueExchange,
        append_exchange_to_file,
        parse_dialogue_exchanges,
    )

    dialogue_path = Path(".session") / f"{story_id}-dialogue.md"
    if not dialogue_path.exists():
        click.echo(f"Dialogue file not found: {dialogue_path}", err=True)
        raise SystemExit(1)

    content = dialogue_path.read_text(encoding="utf-8")
    existing = parse_dialogue_exchanges(content)
    next_num = len(existing) + 1

    exchange = DialogueExchange(
        number=next_num,
        timestamp=datetime.now(UTC).strftime("%H:%M"),
        leader="",
        partner="",
        question=question,
        recommendation=recommendation,
        confidence=confidence,
    )

    result = append_exchange_to_file(dialogue_path, exchange)
    if result.success:
        click.echo(f"Appended exchange {next_num}")
    else:
        click.echo(f"Error: {result.error}", err=True)
        raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
@click.argument("exchange_num", type=int)
@click.argument("outcome_value")
@click.option("--note", default=None, help="Outcome note")
def outcome(story_id: str, exchange_num: int, outcome_value: str, note: str | None) -> None:
    """Update outcome of an exchange."""
    from pf.consultation.dialogue_manager import (
        update_outcome_in_file,
    )

    dialogue_path = Path(".session") / f"{story_id}-dialogue.md"
    result = update_outcome_in_file(dialogue_path, exchange_num, outcome_value, note)  # type: ignore[arg-type]
    if result.success:
        click.echo(f"Updated exchange {exchange_num} outcome to {outcome_value}")
    else:
        click.echo(f"Error: {result.error}", err=True)
        raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
def summarize(story_id: str) -> None:
    """Refresh dialogue summary."""
    from pf.consultation.dialogue_manager import refresh_summary

    dialogue_path = Path(".session") / f"{story_id}-dialogue.md"
    result = refresh_summary(dialogue_path)
    if result.success:
        total = result.data.get("totalExchanges", 0) if result.data else 0
        click.echo(f"Summary refreshed ({total} exchanges)")
    else:
        click.echo(f"Error: {result.error}", err=True)
        raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
@click.option("--jira-key", default=None, help="Jira key for archive filename")
def archive(story_id: str, jira_key: str | None) -> None:
    """Archive dialogue file."""
    from pf.consultation.dialogue_manager import archive_dialogue

    dialogue_path = Path(".session") / f"{story_id}-dialogue.md"
    archive_dir = Path(".session") / "archive"
    result = archive_dialogue(dialogue_path, archive_dir, jira_key=jira_key, story_id=story_id)
    if result.success:
        click.echo(f"Archived to {result.data.get('archivePath', archive_dir)}" if result.data else "Archived")
    else:
        click.echo(f"Error: {result.error}", err=True)
        raise SystemExit(1)
