"""Click CLI for consultation dialogue management.

Provides `pf consultation` group with subcommands matching
the bash wrapper dialogue-manager.sh interface.
"""

from __future__ import annotations

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
    click.echo("Not implemented")
    raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
@click.argument("question")
@click.argument("recommendation")
@click.argument("confidence")
def append(story_id: str, question: str, recommendation: str, confidence: str) -> None:
    """Append an exchange to a dialogue file."""
    click.echo("Not implemented")
    raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
@click.argument("exchange_num", type=int)
@click.argument("outcome_value")
@click.option("--note", default=None, help="Outcome note")
def outcome(story_id: str, exchange_num: int, outcome_value: str, note: str | None) -> None:
    """Update outcome of an exchange."""
    click.echo("Not implemented")
    raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
def summarize(story_id: str) -> None:
    """Refresh dialogue summary."""
    click.echo("Not implemented")
    raise SystemExit(1)


@consultation.command()
@click.argument("story_id")
@click.option("--jira-key", default=None, help="Jira key for archive filename")
def archive(story_id: str, jira_key: str | None) -> None:
    """Archive dialogue file."""
    click.echo("Not implemented")
    raise SystemExit(1)
