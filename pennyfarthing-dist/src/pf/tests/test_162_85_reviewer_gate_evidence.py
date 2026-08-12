"""Tests for 162-85: the approval gate verifies structured specialist evidence.

Before this story the reviewer approval gate was satisfied by a SUBSTRING search:
``All received: Yes`` anywhere in the ``## Subagent Results`` section, plus each
specialist's NAME appearing anywhere in that section's text. A review that never
dispatched a single specialist passed by typing one line and nine names — the
forgery observed live during the 162-44 review.

The gate now parses the section's markdown table into per-specialist ROWS and
requires every enabled specialist to have its own row with filled, internally
consistent ``Received``/``Status``/``Findings``/``Decision`` cells. The summary
line can no longer stand alone.

Story: 162-85
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

SUBAGENTS = [
    "reviewer-preflight",
    "reviewer-edge-hunter",
    "reviewer-silent-failure-hunter",
    "reviewer-test-analyzer",
    "reviewer-comment-analyzer",
    "reviewer-type-design",
    "reviewer-security",
    "reviewer-simplifier",
    "reviewer-rule-checker",
]

_HEADER = (
    "| # | Specialist | Received | Status | Findings | Decision |\n"
    "|---|-----------|----------|--------|----------|----------|\n"
)


def _genuine_section(rows: str | None = None) -> str:
    """A fully-populated Subagent Results section — the legitimate shape."""
    if rows is None:
        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A |" for i, name in enumerate(SUBAGENTS, 1)
        )
    return (
        "## Subagent Results\n\n"
        f"{_HEADER}"
        f"{rows}\n\n"
        "**All received:** Yes\n"
        "**Total findings:** 0 confirmed, 0 dismissed, 0 deferred\n"
    )


def _session(section: str) -> str:
    return (
        "# Session: 162-85\n\n"
        "**Story:** 162-85\n"
        "**Workflow:** tdd\n"
        "**Phase:** review\n\n"
        f"{section}\n"
        "## Reviewer Assessment\n\n"
        "**Verdict: APPROVED**\n\n"
        "- [EDGE] ok\n- [SILENT] ok\n- [TEST] ok\n- [DOC] ok\n"
        "- [TYPE] ok\n- [SEC] ok\n- [SIMPLE] ok\n- [RULE] ok\n"
    )


@pytest.fixture(autouse=True)
def all_specialists_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the enabled set to all nine.

    ``_get_enabled_subagents`` reads the developer's own
    ``workflow.reviewer_subagents`` toggles, so without this the assertions would
    depend on which specialists the machine running the suite has switched off.
    """
    from pf.handoff import complete_phase as module

    tags = {tag for _name, tag in module._SUBAGENT_SETTING_MAP.values() if tag}
    monkeypatch.setattr(
        module,
        "_get_enabled_subagents",
        lambda: (set(SUBAGENTS), tags),
    )


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()
    (workflows_dir / "tdd.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "tdd",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {"name": "red", "agent": "tea"},
                        {"name": "green", "agent": "dev"},
                        {
                            "name": "review",
                            "agent": "reviewer",
                            "gate": {"file": "gates/approval", "type": "approval"},
                        },
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )
    gates_dir = pf_dir / "gates"
    gates_dir.mkdir()
    (gates_dir / "approval.md").write_text('<gate name="approval" model="haiku"></gate>\n')
    (tmp_path / ".session").mkdir()
    return tmp_path


# =============================================================================
# THE FORGERY — a typed summary line with no per-specialist rows
# =============================================================================


class TestForgedSummaryLine:
    """A review that never ran its specialists must not pass by typing the line."""

    def test_summary_line_with_no_table_at_all_fails(self) -> None:
        """Prose naming all nine specialists + 'All received: Yes' — no table."""
        from pf.handoff.complete_phase import _check_subagent_completion

        section = (
            "## Subagent Results\n\n"
            "Ran reviewer-preflight, reviewer-edge-hunter, "
            "reviewer-silent-failure-hunter, reviewer-test-analyzer, "
            "reviewer-comment-analyzer, reviewer-type-design, reviewer-security, "
            "reviewer-simplifier and reviewer-rule-checker.\n\n"
            "**All received:** Yes\n"
        )
        result = _check_subagent_completion(_session(section))
        assert result is not None, "Forged prose section must fail the gate"
        assert "row" in result.lower()

    def test_summary_line_with_unfilled_template_rows_fails(self) -> None:
        """The generated template's own placeholder rows must not satisfy the gate."""
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | - | - | - |" for i, name in enumerate(SUBAGENTS, 1)
        )
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None, "Placeholder cells must fail the gate"
        assert "reviewer-preflight" in result

    def test_rows_with_blank_cells_fail(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(f"| {i} | {name} | Yes |  |  |  |" for i, name in enumerate(SUBAGENTS, 1))
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None, "Blank cells must fail the gate"

    def test_one_missing_row_fails_even_with_summary_line(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A |"
            for i, name in enumerate(SUBAGENTS[:-1], 1)
        )
        # The missing specialist is still NAMED in prose — the old substring check
        # accepted exactly this.
        section = _genuine_section(rows) + "\nreviewer-rule-checker: nothing to report.\n"
        result = _check_subagent_completion(_session(section))
        assert result is not None
        assert "reviewer-rule-checker" in result

    def test_row_received_no_fails(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | {'No' if i == 3 else 'Yes'} | clean | none | N/A |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None
        assert "reviewer-silent-failure-hunter" in result

    def test_duplicate_rows_for_one_specialist_fail(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A |" for i, name in enumerate(SUBAGENTS, 1)
        )
        rows += "\n| 10 | reviewer-security | Yes | findings | 3 | confirmed 3 |"
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None
        assert "reviewer-security" in result

    def test_internally_inconsistent_row_fails(self) -> None:
        """'clean' with a positive finding count is not a coherent record."""
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | {'clean' if i != 4 else 'clean'} | "
            f"{'none' if i != 4 else '3'} | {'N/A' if i != 4 else 'N/A'} |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None
        assert "reviewer-test-analyzer" in result

    def test_fenced_table_does_not_satisfy_the_gate(self) -> None:
        """A quoted example table is documentation, not evidence."""
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A |" for i, name in enumerate(SUBAGENTS, 1)
        )
        section = (
            "## Subagent Results\n\n"
            "```markdown\n" + _HEADER + rows + "\n```\n\n"
            "**All received:** Yes\n"
        )
        result = _check_subagent_completion(_session(section))
        assert result is not None

    def test_complete_phase_rejects_the_forgery(self, project_root: Path) -> None:
        from pf.handoff.complete_phase import complete_phase

        section = (
            "## Subagent Results\n\n"
            "All nine specialists ran: " + ", ".join(SUBAGENTS) + ".\n\n"
            "**All received:** Yes\n"
        )
        (project_root / ".session" / "162-85-session.md").write_text(_session(section))
        result = complete_phase(
            story_id="162-85",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "error", "Forged evidence must block the transition"


# =============================================================================
# LEGITIMATE RECORDS still pass
# =============================================================================


class TestGenuineRecordsPass:
    def test_all_clean_table_passes(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        assert _check_subagent_completion(_session(_genuine_section())) is None

    def test_bold_and_backticked_cells_pass(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | `{name}` | **Yes** | **clean** | none | N/A |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        assert _check_subagent_completion(_session(_genuine_section(rows))) is None

    def test_findings_and_decisions_pass(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Yes | findings | 2 | confirmed 1, dismissed 1 (test-only) |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        assert _check_subagent_completion(_session(_genuine_section(rows))) is None

    def test_recorded_timeout_passes(self) -> None:
        """The 162-44 reality: specialists timed out, the reviewer recorded it."""
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | No — timed out | error | none | domain assessed first-hand by lead |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is None, f"Recorded timeouts must be accepted: {result}"

    def test_extra_trailing_notes_column_passes(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        header = (
            "| # | Specialist | Received | Status | Findings | Decision | Notes |\n"
            "|---|---|---|---|---|---|---|\n"
        )
        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A | ran on diff |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        section = f"## Subagent Results\n\n{header}{rows}\n\n**All received:** Yes\n"
        assert _check_subagent_completion(_session(section)) is None

    def test_complete_phase_accepts_genuine_record(self, project_root: Path) -> None:
        from pf.handoff.complete_phase import complete_phase

        (project_root / ".session" / "162-85-session.md").write_text(_session(_genuine_section()))
        result = complete_phase(
            story_id="162-85",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "success", result.get("error")


# =============================================================================
# The row parser itself
# =============================================================================


class TestRowParser:
    def test_parses_canonical_table(self) -> None:
        from pf.handoff.complete_phase import parse_subagent_result_rows

        rows = parse_subagent_result_rows(_genuine_section())
        assert sorted(rows) == sorted(SUBAGENTS)
        row = rows["reviewer-security"][0]
        assert row["received"] == "Yes"
        assert row["status"] == "clean"
        assert row["findings"] == "none"
        assert row["decision"] == "N/A"

    def test_ignores_header_and_separator_rows(self) -> None:
        from pf.handoff.complete_phase import parse_subagent_result_rows

        rows = parse_subagent_result_rows(_genuine_section())
        assert len(rows["reviewer-preflight"]) == 1


class TestSkipIsNotAResult:
    """ "Skipped" is the reviewer's own choice, not something that happened to it."""

    def test_bare_skipped_for_an_enabled_specialist_fails(self) -> None:
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Skipped | context high | none | N/A |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        result = _check_subagent_completion(_session(_genuine_section(rows)))
        assert result is not None, "An enabled specialist cannot be skipped"

    def test_documented_disabled_row_passes(self) -> None:
        """`| N | x | Skipped | disabled | N/A | Disabled via settings |` — reviewer.md."""
        from pf.handoff.complete_phase import _check_subagent_completion

        rows = "\n".join(
            f"| {i} | {name} | Skipped | disabled | N/A | Disabled via settings |"
            for i, name in enumerate(SUBAGENTS, 1)
        )
        assert _check_subagent_completion(_session(_genuine_section(rows))) is None
