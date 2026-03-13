"""Tests for Story 86-16: Port dialogue manager from TS/bash to Python.

RED state tests for the Python dialogue file persistence layer.
Ported from packages/core/src/consultation/dialogue-manager.test.ts.

Acceptance Criteria:
  AC1: pf/consultation/ package with dialogue_manager.py
       implementing: create, format, parse, summary, append, update_outcome,
       refresh_summary, archive
  AC2: pf consultation Click CLI group with subcommands: init, append,
       outcome, summarize, archive
  AC3: All 6 ACs from 86-3 still pass — same file format, behavior, output
  AC4: Tests ported to pytest in this file

Run with: pytest pf/tests/test_dialogue_manager.py -v
"""

from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from pf.consultation.dialogue_manager import (
    DialogueExchange,
    DialogueHeader,
    DialogueResult,
    append_exchange_to_file,
    archive_dialogue,
    create_dialogue_content,
    format_exchange,
    generate_summary,
    parse_dialogue_exchanges,
    refresh_summary,
    update_outcome_in_file,
)

# =============================================================================
# Fixtures
# =============================================================================

VALID_HEADER = DialogueHeader(
    story_id="86-3",
    workflow="tdd",
    leader="dev",
    leader_character="Jack Torrance",
    partner="architect",
    partner_character="Andy Dufresne",
    started_at="2026-02-16T10:00:00Z",
)

VALID_EXCHANGE = DialogueExchange(
    number=1,
    timestamp="10:05",
    leader="dev",
    partner="architect",
    question="Should we use a class or functional approach for the dialogue manager?",
    recommendation="Use pure functions — they are easier to test and align with the existing consultation-protocol.ts pattern",
    confidence="high",
)

SECOND_EXCHANGE = DialogueExchange(
    number=2,
    timestamp="10:20",
    leader="dev",
    partner="architect",
    question="Should the shell wrapper call Node.js or use pure bash?",
    recommendation="Pure bash for the shell wrapper — keeps it dependency-free and consistent with other core scripts",
    confidence="medium",
    outcome="applied",
    outcome_note="Implemented with sed/awk",
)


# =============================================================================
# AC1 + AC3-AC1: Dialogue file creation on first consultation
# =============================================================================


class TestCreateDialogueContent:
    """AC1: create_dialogue_content — initial file header."""

    def test_includes_story_id_in_title(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "# Tandem Dialogue: 86-3" in content

    def test_includes_workflow(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "**Workflow:** tdd" in content

    def test_includes_leader_agent(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "**Leader:** dev" in content

    def test_includes_partner_agent(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "**Partner:** architect" in content

    def test_includes_start_timestamp(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "**Started:** 2026-02-16T10:00:00Z" in content

    def test_includes_character_names_when_provided(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "Jack Torrance" in content
        assert "Andy Dufresne" in content

    def test_handles_missing_character_names(self):
        header = DialogueHeader(
            story_id="86-3",
            workflow="tdd",
            leader="dev",
            partner="architect",
            started_at="2026-02-16T10:00:00Z",
        )
        content = create_dialogue_content(header)
        assert "**Leader:** dev" in content
        assert "**Partner:** architect" in content

    def test_includes_empty_summary_section(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "## Summary" in content
        assert "**Total exchanges:** 0" in content

    def test_includes_horizontal_rule_separator(self):
        content = create_dialogue_content(VALID_HEADER)
        assert "---" in content


# =============================================================================
# AC1 + AC3-AC2: Exchange format and appending
# =============================================================================


class TestFormatExchange:
    """AC1: format_exchange — single exchange as markdown."""

    def test_includes_exchange_number(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "## Exchange 1" in formatted

    def test_includes_timestamp_and_direction(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "**[10:05] dev \u2192 architect**" in formatted

    def test_includes_question_as_blockquote(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "> Should we use a class or functional approach" in formatted

    def test_includes_partner_response_header(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "**[10:05] architect:**" in formatted

    def test_includes_recommendation_text(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "Use pure functions" in formatted

    def test_includes_confidence_level(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "**Confidence:** high" in formatted

    def test_shows_pending_when_no_outcome(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "**Outcome:** _pending_" in formatted

    def test_includes_outcome_when_present(self):
        formatted = format_exchange(SECOND_EXCHANGE)
        assert "**Outcome:** applied" in formatted

    def test_includes_outcome_note(self):
        formatted = format_exchange(SECOND_EXCHANGE)
        assert "Implemented with sed/awk" in formatted

    def test_includes_separator(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert "---" in formatted

    def test_outcome_without_note(self):
        exchange = DialogueExchange(
            number=3,
            timestamp="11:00",
            leader="dev",
            partner="architect",
            question="Q?",
            recommendation="R.",
            confidence="low",
            outcome="rejected",
        )
        formatted = format_exchange(exchange)
        assert "**Outcome:** rejected" in formatted


# =============================================================================
# AC1 + AC3-AC2: File append operations
# =============================================================================


class TestAppendExchangeToFile:
    """AC1: append_exchange_to_file — file creation and exchange appending."""

    def test_creates_file_on_first_append(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        result = append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        assert result.success is True
        assert dialogue_path.exists()

    def test_file_contains_header(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        assert "# Tandem Dialogue: 86-3" in content

    def test_file_contains_first_exchange(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        assert "## Exchange 1" in content

    def test_requires_header_for_new_file(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        result = append_exchange_to_file(dialogue_path, VALID_EXCHANGE)

        assert result.success is False
        assert result.error is not None
        assert "Header required" in result.error or "header" in result.error.lower()

    def test_appends_multiple_exchanges(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        append_exchange_to_file(dialogue_path, SECOND_EXCHANGE)

        content = dialogue_path.read_text()
        assert "## Exchange 1" in content
        assert "## Exchange 2" in content

    def test_exchanges_appear_before_summary(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        exchange_idx = content.index("## Exchange 1")
        summary_idx = content.index("## Summary")
        assert exchange_idx < summary_idx

    def test_creates_parent_directories(self, tmp_path: Path):
        dialogue_path = tmp_path / "nested" / "dir" / "86-3-dialogue.md"
        result = append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        assert result.success is True
        assert dialogue_path.exists()

    def test_returns_exchange_number_in_data(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        result = append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        assert result.success is True
        assert result.data is not None
        assert result.data.get("exchangeNumber") == 1


# =============================================================================
# AC1 + AC3-AC3: Outcome tracking
# =============================================================================


class TestUpdateOutcomeInFile:
    """AC1: update_outcome_in_file — outcome tracking."""

    def test_updates_to_applied(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = update_outcome_in_file(dialogue_path, 1, "applied", "Used pure functions")

        assert result.success is True
        content = dialogue_path.read_text()
        assert "**Outcome:** applied" in content
        assert "Used pure functions" in content

    def test_updates_to_deferred(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        update_outcome_in_file(dialogue_path, 1, "deferred", "Revisit in next phase")

        content = dialogue_path.read_text()
        assert "**Outcome:** deferred" in content

    def test_updates_to_rejected(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        update_outcome_in_file(dialogue_path, 1, "rejected", "Went with class approach")

        content = dialogue_path.read_text()
        assert "**Outcome:** rejected" in content

    def test_updates_without_note(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = update_outcome_in_file(dialogue_path, 1, "applied")

        assert result.success is True
        content = dialogue_path.read_text()
        assert "**Outcome:** applied" in content

    def test_fails_for_nonexistent_exchange(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = update_outcome_in_file(dialogue_path, 99, "applied")

        assert result.success is False
        assert result.error is not None
        assert "99" in result.error

    def test_fails_for_nonexistent_file(self, tmp_path: Path):
        dialogue_path = tmp_path / "nonexistent-dialogue.md"

        result = update_outcome_in_file(dialogue_path, 1, "applied")

        assert result.success is False

    def test_updates_correct_exchange_when_multiple_exist(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        append_exchange_to_file(dialogue_path, SECOND_EXCHANGE)

        update_outcome_in_file(dialogue_path, 1, "rejected", "Changed mind")

        content = dialogue_path.read_text()
        # Exchange 1 should be rejected
        # Exchange 2 should still be applied (from SECOND_EXCHANGE)
        lines = content.split("\n")
        in_exchange_1 = False
        in_exchange_2 = False
        exchange_1_outcome = ""
        exchange_2_outcome = ""
        for line in lines:
            if "## Exchange 1" in line:
                in_exchange_1 = True
                in_exchange_2 = False
            elif "## Exchange 2" in line:
                in_exchange_1 = False
                in_exchange_2 = True
            elif "**Outcome:**" in line:
                if in_exchange_1:
                    exchange_1_outcome = line
                    in_exchange_1 = False
                elif in_exchange_2:
                    exchange_2_outcome = line
                    in_exchange_2 = False

        assert "rejected" in exchange_1_outcome
        assert "applied" in exchange_2_outcome


# =============================================================================
# AC1 + AC3-AC4: Summary generation
# =============================================================================


class TestGenerateSummary:
    """AC1: generate_summary — auto-generated summary section."""

    def test_includes_total_exchange_count(self):
        exchanges = [VALID_EXCHANGE, SECOND_EXCHANGE]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "**Total exchanges:** 2" in summary

    def test_includes_applied_decisions(self):
        exchanges = [
            DialogueExchange(
                number=1,
                timestamp="10:05",
                leader="dev",
                partner="architect",
                question="Q1",
                recommendation="R1",
                confidence="high",
                outcome="applied",
                outcome_note="Went with pure functions",
            ),
            DialogueExchange(
                number=2,
                timestamp="10:20",
                leader="dev",
                partner="architect",
                question="Q2",
                recommendation="R2",
                confidence="medium",
                outcome="applied",
                outcome_note="Implemented with sed/awk",
            ),
        ]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "Went with pure functions" in summary
        assert "Implemented with sed/awk" in summary

    def test_excludes_rejected_from_decisions(self):
        exchanges = [
            DialogueExchange(
                number=1,
                timestamp="10:05",
                leader="dev",
                partner="architect",
                question="Q1",
                recommendation="R1",
                confidence="high",
                outcome="rejected",
                outcome_note="Did not adopt this",
            ),
            DialogueExchange(
                number=2,
                timestamp="10:20",
                leader="dev",
                partner="architect",
                question="Q2",
                recommendation="R2",
                confidence="medium",
                outcome="applied",
                outcome_note="Adopted this one",
            ),
        ]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "Did not adopt this" not in summary
        assert "Adopted this one" in summary

    def test_calculates_time_span(self):
        exchanges = [
            DialogueExchange(
                number=1,
                timestamp="10:05",
                leader="dev",
                partner="architect",
                question="Q1",
                recommendation="R1",
                confidence="high",
            ),
            DialogueExchange(
                number=2,
                timestamp="10:35",
                leader="dev",
                partner="architect",
                question="Q2",
                recommendation="R2",
                confidence="medium",
            ),
        ]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "30m" in summary

    def test_single_exchange_time(self):
        exchanges = [VALID_EXCHANGE]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "**Time in tandem:**" in summary

    def test_no_applied_shows_none(self):
        exchanges = [
            DialogueExchange(
                number=1,
                timestamp="10:05",
                leader="dev",
                partner="architect",
                question="Q1",
                recommendation="R1",
                confidence="high",
                outcome="deferred",
            ),
        ]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "None" in summary

    def test_includes_summary_marker(self):
        exchanges = [VALID_EXCHANGE]
        summary = generate_summary(exchanges, "2026-02-16T10:00:00Z")

        assert "## Summary" in summary


# =============================================================================
# AC1: refresh_summary (file operation)
# =============================================================================


class TestRefreshSummary:
    """AC1: refresh_summary — regenerate summary in existing file."""

    def test_refreshes_summary_with_exchange_count(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        exchange_with_outcome = DialogueExchange(
            number=1,
            timestamp="10:05",
            leader="dev",
            partner="architect",
            question="Q?",
            recommendation="R.",
            confidence="high",
            outcome="applied",
            outcome_note="Adopted functional approach",
        )
        append_exchange_to_file(dialogue_path, exchange_with_outcome, VALID_HEADER)

        result = refresh_summary(dialogue_path)

        assert result.success is True
        content = dialogue_path.read_text()
        assert "**Total exchanges:** 1" in content

    def test_refreshed_summary_includes_applied_decisions(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        exchange_with_outcome = DialogueExchange(
            number=1,
            timestamp="10:05",
            leader="dev",
            partner="architect",
            question="Q?",
            recommendation="R.",
            confidence="high",
            outcome="applied",
            outcome_note="Adopted functional approach",
        )
        append_exchange_to_file(dialogue_path, exchange_with_outcome, VALID_HEADER)

        refresh_summary(dialogue_path)

        content = dialogue_path.read_text()
        assert "Adopted functional approach" in content

    def test_fails_for_nonexistent_file(self, tmp_path: Path):
        dialogue_path = tmp_path / "nonexistent-dialogue.md"

        result = refresh_summary(dialogue_path)

        assert result.success is False

    def test_returns_total_in_data(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        append_exchange_to_file(dialogue_path, SECOND_EXCHANGE)

        result = refresh_summary(dialogue_path)

        assert result.success is True
        assert result.data is not None
        assert result.data.get("totalExchanges") == 2


# =============================================================================
# AC1 + AC3-AC5: Dialogue archival
# =============================================================================


class TestArchiveDialogue:
    """AC1: archive_dialogue — copy to archive directory."""

    def test_copies_to_archive_with_jira_key(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = archive_dialogue(dialogue_path, archive_dir, jira_key="MSSCI-15200")

        assert result.success is True
        assert (archive_dir / "MSSCI-15200-dialogue.md").exists()

    def test_uses_story_id_when_no_jira_key(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = archive_dialogue(dialogue_path, archive_dir, story_id="86-3")

        assert result.success is True
        assert (archive_dir / "86-3-dialogue.md").exists()

    def test_preserves_content(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        original = dialogue_path.read_text()

        archive_dialogue(dialogue_path, archive_dir, jira_key="MSSCI-15200")

        archived = (archive_dir / "MSSCI-15200-dialogue.md").read_text()
        assert archived == original

    def test_creates_archive_directory(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "new-archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = archive_dialogue(dialogue_path, archive_dir, jira_key="MSSCI-15200")

        assert result.success is True
        assert archive_dir.exists()

    def test_fails_for_nonexistent_source(self, tmp_path: Path):
        dialogue_path = tmp_path / "nonexistent-dialogue.md"
        archive_dir = tmp_path / "archive"

        result = archive_dialogue(dialogue_path, archive_dir, jira_key="MSSCI-15200")

        assert result.success is False
        assert result.error is not None

    def test_uses_unknown_prefix_when_no_key_or_id(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        result = archive_dialogue(dialogue_path, archive_dir)

        assert result.success is True
        assert (archive_dir / "unknown-dialogue.md").exists()


# =============================================================================
# AC1 + AC3-AC6: Readable format / round-trip parsing
# =============================================================================


class TestParseDialogueExchanges:
    """AC1: parse_dialogue_exchanges — round-trip format fidelity."""

    def test_parses_single_exchange(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert len(parsed) == 1
        assert parsed[0].number == 1

    def test_parses_multiple_exchanges(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        append_exchange_to_file(dialogue_path, SECOND_EXCHANGE)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert len(parsed) == 2
        assert parsed[0].number == 1
        assert parsed[1].number == 2

    def test_parses_exchange_fields(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, SECOND_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert parsed[0].leader == "dev"
        assert parsed[0].partner == "architect"
        assert parsed[0].timestamp == "10:20"
        assert parsed[0].outcome == "applied"

    def test_parses_pending_outcome_as_none(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert parsed[0].outcome is None

    def test_round_trip_question(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert parsed[0].question == VALID_EXCHANGE.question

    def test_round_trip_recommendation(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert parsed[0].recommendation == VALID_EXCHANGE.recommendation

    def test_round_trip_outcome_with_note(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        exchange = DialogueExchange(
            number=1,
            timestamp="10:05",
            leader="dev",
            partner="architect",
            question="Q?",
            recommendation="R.",
            confidence="high",
            outcome="applied",
            outcome_note="Adopted this approach",
        )
        append_exchange_to_file(dialogue_path, exchange, VALID_HEADER)

        content = dialogue_path.read_text()
        parsed = parse_dialogue_exchanges(content)

        assert parsed[0].outcome == "applied"
        assert parsed[0].outcome_note == "Adopted this approach"

    def test_parses_from_pure_formatted_content(self):
        """Parse directly from format_exchange output, no file I/O."""
        content = create_dialogue_content(VALID_HEADER)
        formatted = format_exchange(VALID_EXCHANGE)
        # Insert before summary
        summary_idx = content.index("## Summary")
        full_content = content[:summary_idx] + formatted + "\n" + content[summary_idx:]

        parsed = parse_dialogue_exchanges(full_content)

        assert len(parsed) == 1
        assert parsed[0].number == 1


# =============================================================================
# AC1: Result format compliance ({success, data?, error?})
# =============================================================================


class TestResultFormat:
    """All file operations return DialogueResult with success/data/error."""

    def test_append_returns_result(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        result = append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)

        assert isinstance(result, DialogueResult)
        assert isinstance(result.success, bool)

    def test_update_outcome_returns_result(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        result = update_outcome_in_file(dialogue_path, 1, "applied")

        assert isinstance(result, DialogueResult)
        assert isinstance(result.success, bool)

    def test_refresh_summary_returns_result(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        result = refresh_summary(dialogue_path)

        assert isinstance(result, DialogueResult)
        assert isinstance(result.success, bool)

    def test_archive_returns_result(self, tmp_path: Path):
        dialogue_path = tmp_path / "86-3-dialogue.md"
        archive_dir = tmp_path / "archive"
        append_exchange_to_file(dialogue_path, VALID_EXCHANGE, VALID_HEADER)
        result = archive_dialogue(dialogue_path, archive_dir, jira_key="MSSCI-15200")

        assert isinstance(result, DialogueResult)
        assert isinstance(result.success, bool)


# =============================================================================
# AC1: Markdown structure (well-formed output)
# =============================================================================


class TestMarkdownStructure:
    """Verify output is well-formed markdown."""

    def test_content_starts_with_h1(self):
        content = create_dialogue_content(VALID_HEADER)
        assert content.startswith("# Tandem Dialogue:")

    def test_exchange_starts_with_h2(self):
        formatted = format_exchange(VALID_EXCHANGE)
        assert formatted.startswith("## Exchange")

    def test_summary_starts_with_h2(self):
        summary = generate_summary([VALID_EXCHANGE], "2026-02-16T10:00:00Z")
        assert summary.startswith("## Summary")


# =============================================================================
# AC2: Click CLI subcommands
# =============================================================================


class TestConsultationCLI:
    """AC2: pf consultation CLI group with subcommands."""

    def setup_method(self):
        self.runner = CliRunner()

    def test_consultation_group_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "--help"])
        assert result.exit_code == 0
        assert "consultation" in result.output.lower() or "dialogue" in result.output.lower()

    def test_init_subcommand_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "init", "--help"])
        assert result.exit_code == 0

    def test_append_subcommand_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "append", "--help"])
        assert result.exit_code == 0

    def test_outcome_subcommand_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "outcome", "--help"])
        assert result.exit_code == 0

    def test_summarize_subcommand_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "summarize", "--help"])
        assert result.exit_code == 0

    def test_archive_subcommand_exists(self):
        from pf.cli import cli

        result = self.runner.invoke(cli, ["consultation", "archive", "--help"])
        assert result.exit_code == 0

    def test_init_creates_dialogue_file(self, tmp_path: Path):
        """CLI init should create a dialogue file in .session/."""
        from pf.cli import cli

        with self.runner.isolated_filesystem(temp_dir=tmp_path):
            session_dir = Path(".session")
            session_dir.mkdir()
            result = self.runner.invoke(
                cli,
                ["consultation", "init", "86-3", "tdd", "dev", "architect"],
            )
            # Should succeed (exit 0) and create the file
            assert result.exit_code == 0
            dialogue_file = session_dir / "86-3-dialogue.md"
            assert dialogue_file.exists()

    def test_init_output_confirms_creation(self, tmp_path: Path):
        from pf.cli import cli

        with self.runner.isolated_filesystem(temp_dir=tmp_path):
            Path(".session").mkdir()
            result = self.runner.invoke(
                cli,
                ["consultation", "init", "86-3", "tdd", "dev", "architect"],
            )
            assert "Created" in result.output or "created" in result.output
