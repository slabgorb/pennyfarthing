"""Tests for 148-23: Reviewer gate instructions clarity.

The reviewer agent struggles to complete the handoff gate because instructions
are scattered, "All received" semantics are ambiguous, error messages lack
recovery steps, and examples don't match the gate implementation.

These tests verify:
- AC1: Reviewer agent definition is self-contained for gate completion
- AC2: Gate error messages include actionable recovery with examples
- AC3: "All received" semantics are documented and match implementation
- AC4: Examples in agent definition match gate implementation checks

Story: 148-23
"""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Hermetic settings: enable every reviewer subagent so dispatch/completion
# checks evaluate the full required set regardless of the live project's
# config.local.yaml (which may disable some subagents). Mirrors the autouse
# fixture in test_143_12_subagent_dispatch.py.
# ---------------------------------------------------------------------------

_ALL_SUBAGENTS_ENABLED = {
    "preflight": True,
    "edge_hunter": True,
    "silent_failure_hunter": True,
    "test_analyzer": True,
    "comment_analyzer": True,
    "type_design": True,
    "security": True,
    "simplifier": True,
    "rule_checker": True,
}


@pytest.fixture(autouse=True)
def _all_subagents_enabled():
    with patch("pf.settings.settings.get_setting", return_value=_ALL_SUBAGENTS_ENABLED):
        yield


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PENNYFARTHING_DIST = Path(__file__).resolve().parents[3]  # pennyfarthing-dist/
REVIEWER_MD = PENNYFARTHING_DIST / "agents" / "reviewer.md"
APPROVAL_GATE_MD = PENNYFARTHING_DIST / "gates" / "approval.md"

REQUIRED_SUBAGENTS = [
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

DISPATCH_TAGS = ["[EDGE]", "[SILENT]", "[TEST]", "[DOC]", "[TYPE]", "[SEC]", "[SIMPLE]", "[RULE]"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_reviewer_md() -> str:
    """Read the reviewer agent definition."""
    assert REVIEWER_MD.exists(), f"reviewer.md not found at {REVIEWER_MD}"
    return REVIEWER_MD.read_text()


def _build_subagent_table(
    *,
    subagents: list[str] | None = None,
    all_received: str = "**All received:** Yes",
) -> str:
    """Build a complete Subagent Results section."""
    agents = subagents or REQUIRED_SUBAGENTS
    rows = "\n".join(
        f"| {i} | {name} | Yes | clean | none | N/A |"
        for i, name in enumerate(agents, 1)
    )
    return (
        "## Subagent Results\n\n"
        "| # | Specialist | Received | Status | Findings | Decision |\n"
        "|---|-----------|----------|--------|----------|----------|\n"
        f"{rows}\n\n"
        f"{all_received}\n"
        "**Total findings:** 0 confirmed, 0 dismissed, 0 deferred\n"
    )


def _build_reviewer_assessment() -> str:
    """Build a Reviewer Assessment with all required dispatch tags."""
    return (
        "## Reviewer Assessment\n\n"
        "**Verdict:** APPROVED\n\n"
        "- [EDGE] No boundary issues\n"
        "- [SILENT] No swallowed errors\n"
        "- [TEST] Tests adequate\n"
        "- [DOC] Docs complete\n"
        "- [TYPE] Types sound\n"
        "- [SEC] No security concerns\n"
        "- [SIMPLE] No unnecessary complexity\n"
        "- [RULE] Conventions followed\n"
    )


def _build_full_session(
    *,
    all_received: str = "**All received:** Yes",
    subagents: list[str] | None = None,
) -> str:
    """Build a complete session file for gate testing."""
    return (
        "# Story 148-23\n\n"
        "**Phase:** review\n"
        "**Workflow:** tdd\n\n"
        + _build_subagent_table(all_received=all_received, subagents=subagents)
        + "\n"
        + _build_reviewer_assessment()
    )


# =============================================================================
# AC1: Reviewer agent definition has self-contained gate completion instructions
# =============================================================================


class TestAC1SelfContainedGateInstructions:
    """The reviewer.md must contain everything needed to complete the gate
    without cross-referencing other files."""

    def test_reviewer_md_documents_all_accepted_all_received_formats(self) -> None:
        """Reviewer.md must document all three formats the gate regex accepts:
        - Plain: `All received: Yes`
        - Bold key: `**All received:** Yes`
        - Bold key+value: `**All received:** **Yes**`

        Currently the template only shows bold format. Reviewer doesn't know
        plain text is also accepted, or that bold value wrapping works too.
        """
        content = _read_reviewer_md()
        # Must document that plain text format is accepted
        assert "All received: Yes" in content and "**All received:** Yes" in content, (
            "reviewer.md must document BOTH plain and bold 'All received' formats. "
            "Currently only shows template format, not all accepted variations."
        )
        # Must also document bold value wrapping
        assert "**Yes**" in content or "bold" in content.lower(), (
            "reviewer.md must document that '**All received:** **Yes**' (bold value) "
            "is also accepted by the gate."
        )

    def test_reviewer_md_has_gate_troubleshooting_section(self) -> None:
        """Reviewer.md must include a troubleshooting section for common gate
        failures, so the reviewer can self-diagnose without reading gate source.

        Common failures:
        - Missing '## Subagent Results' section
        - 'All received' not set to Yes
        - Missing subagent rows in table
        - Missing dispatch tags in assessment
        """
        content = _read_reviewer_md()
        # Look for a section about common errors/troubleshooting/recovery
        has_troubleshooting = any(
            marker in content.lower()
            for marker in [
                "common gate errors",
                "troubleshooting",
                "gate failures",
                "if the gate fails",
                "gate recovery",
            ]
        )
        assert has_troubleshooting, (
            "reviewer.md must include a troubleshooting/recovery section for common "
            "gate failures. The reviewer currently has no guidance when the gate rejects."
        )

    def test_reviewer_md_lists_mandatory_vs_optional_fields(self) -> None:
        """Reviewer.md must clearly indicate which Subagent Results table
        fields are mandatory vs optional for gate passage.

        The gate checks: subagent names present, 'All received: Yes' line.
        The gate does NOT check: Decision column content, Total findings line.
        This distinction is not documented anywhere.
        """
        content = _read_reviewer_md()
        # Must distinguish mandatory from optional/informational
        has_field_requirements = (
            "mandatory" in content.lower()
            or "required field" in content.lower()
            or "gate checks" in content.lower()
            or "gate requires" in content.lower()
        )
        assert has_field_requirements, (
            "reviewer.md must document which fields the gate actually checks vs which "
            "are informational. Reviewers don't know what's mandatory for passage."
        )

    def test_reviewer_md_contains_exit_sequence_steps(self) -> None:
        """Reviewer.md exit protocol must include the exact CLI commands for
        gate completion, not just 'Follow <agent-exit-protocol>'.

        The reviewer should see the full sequence:
        1. pf handoff resolve-gate {STORY_ID} {WORKFLOW} review
        2. pf handoff complete-phase {STORY_ID} {WORKFLOW} review finish approval
        3. pf workflow handoff sm
        """
        content = _read_reviewer_md()
        # Must contain the actual resolve-gate command with example args
        assert "pf handoff resolve-gate" in content, (
            "reviewer.md must include the exact 'pf handoff resolve-gate' command. "
            "Currently says 'Follow <agent-exit-protocol>' which requires cross-referencing."
        )
        # Must contain the complete-phase command
        assert "pf handoff complete-phase" in content, (
            "reviewer.md must include the exact 'pf handoff complete-phase' command "
            "with the gate_type='approval' parameter."
        )


# =============================================================================
# AC2: Gate error messages include actionable recovery steps
# =============================================================================


class TestAC2ActionableErrorMessages:
    """Error messages from gate checks must include specific recovery
    instructions with format examples, not just 'failed'."""

    def test_missing_subagent_table_error_includes_example_row(self) -> None:
        """When the subagent results section is missing, the error should
        include an example of what a correct table row looks like."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = "## Reviewer Assessment\n\n**Verdict:** APPROVED\n"
        error = _check_subagent_completion(content)
        assert error is not None
        # Error must include an example row format
        assert "| " in error and "Received" in error, (
            "Error for missing subagent table must include an example table row "
            "showing the expected format. Currently says 'fill in the table' without "
            "showing what a correct row looks like."
        )

    def test_incomplete_all_received_error_shows_accepted_formats(self) -> None:
        """When 'All received' is not Yes, error should show which formats
        the gate accepts (plain, bold, bold+value)."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_subagent_table(all_received="**All received:** No")
        content = "## Subagent Results\n" + content.split("## Subagent Results\n", 1)[1]
        error = _check_subagent_completion(content)
        assert error is not None
        # Error should mention the accepted formats
        assert "All received: Yes" in error or "**All received:** Yes" in error, (
            "Error for incomplete 'All received' must show at least one example of "
            "the accepted format, not just say 'not found'."
        )

    def test_missing_dispatch_tags_error_lists_all_required_tags(self) -> None:
        """When dispatch tags are missing, error must list ALL required tags
        so the reviewer knows exactly what to add."""
        from pf.handoff.complete_phase import _check_subagent_dispatch

        content = "## Reviewer Assessment\n\n**Verdict:** APPROVED\nNo tags here.\n"
        missing = _check_subagent_dispatch(content)
        assert len(missing) == 8, f"Expected 8 missing tags, got {len(missing)}"

    def test_missing_assessment_error_shows_example_heading(self) -> None:
        """When assessment section is missing, error should show the exact
        heading format expected (## Reviewer Assessment)."""
        from pf.handoff.complete_phase import complete_phase

        # Need a project_root fixture for this - use a minimal setup
        import tempfile

        import yaml

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pf_dir = root / ".pennyfarthing"
            pf_dir.mkdir()
            wf_dir = pf_dir / "workflows"
            wf_dir.mkdir()
            (wf_dir / "tdd.yaml").write_text(
                yaml.dump(
                    {
                        "workflow": {
                            "name": "tdd",
                            "phases": [
                                {"name": "review", "agent": "reviewer"},
                                {"name": "finish", "agent": "sm"},
                            ],
                        }
                    }
                )
            )
            session_dir = root / ".session"
            session_dir.mkdir()
            session = session_dir / "test-session.md"
            session.write_text("# Story\n\n**Phase:** review\n\nNo assessment here.\n")

            result = complete_phase(
                story_id="test",
                workflow="tdd",
                from_phase="review",
                to_phase="finish",
                gate_type="approval",
                project_root=root,
            )
            assert result["status"] == "error"
            error = result["error"]
            # Must show the exact heading format
            assert "## Reviewer Assessment" in error, (
                "Error for missing assessment must show the exact heading format "
                "'## Reviewer Assessment', not just 'assessment heading'."
            )

    def test_missing_subagent_entries_error_names_missing_agents(self) -> None:
        """When specific subagents are missing from the table, the error must
        name WHICH subagents are missing, not just say 'incomplete'."""
        from pf.handoff.complete_phase import _check_subagent_completion

        # Table with only 3 of 8 subagents
        content = _build_subagent_table(
            subagents=REQUIRED_SUBAGENTS[:3],
            all_received="**All received:** Yes",
        )
        error = _check_subagent_completion(content)
        assert error is not None
        # Must name at least one missing subagent
        missing_names = [name for name in REQUIRED_SUBAGENTS[3:] if name in error]
        assert len(missing_names) > 0, (
            "Error for missing subagent entries must name the specific missing "
            "subagents, not just say 'missing entries'."
        )

    def test_error_messages_use_to_fix_prefix(self) -> None:
        """All gate error messages should use 'To fix:' prefix for recovery
        instructions, making them scannable and actionable."""
        from pf.handoff.complete_phase import _check_subagent_completion

        # Test missing section error
        error_no_section = _check_subagent_completion("No subagent results here.")
        assert error_no_section is not None
        assert "To fix:" in error_no_section, (
            "Error messages must include 'To fix:' prefix for recovery instructions."
        )

        # Test incomplete all_received error
        content = _build_subagent_table(all_received="**All received:** No")
        error_not_yes = _check_subagent_completion(content)
        assert error_not_yes is not None
        assert "To fix:" in error_not_yes, (
            "Error messages must include 'To fix:' prefix for recovery instructions."
        )


# =============================================================================
# AC3: "All received" line semantics documented and match implementation
# =============================================================================


class TestAC3AllReceivedSemantics:
    """The 'All received' line format must be documented and the implementation
    must handle all documented variations consistently."""

    def test_all_received_with_parenthetical_context_is_documented(self) -> None:
        """Reviewers often write 'All received: Yes (6 returned, 2 assessed)'.
        The gate regex silently accepts this because 'Yes' is a substring.
        This behavior must be explicitly documented or rejected.

        If accepted: reviewer.md must mention parenthetical context is OK.
        If rejected: gate must reject it and error must say why.
        """
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_subagent_table(
            all_received="**All received:** Yes (8 returned, 3 with findings)"
        )
        result = _check_subagent_completion(content)

        # The gate currently accepts this silently. Verify it's documented.
        reviewer_content = _read_reviewer_md()
        if result is None:
            # Gate accepts parenthetical — must be documented
            assert "Yes (" in reviewer_content or "parenthetical" in reviewer_content.lower(), (
                "Gate silently accepts 'Yes (context...)' but reviewer.md doesn't "
                "document this. Either document it or reject it explicitly."
            )
        else:
            # Gate rejects parenthetical — error must explain valid formats
            assert "Yes" in result and "format" in result.lower(), (
                "Gate rejects parenthetical context but error doesn't explain "
                "the expected format."
            )

    def test_all_received_exact_values_accepted_by_gate(self) -> None:
        """Document which exact values the gate accepts after 'All received:'.
        Currently the regex accepts any string starting with 'Yes' (case-insensitive).
        The reviewer.md must document this as either 'Yes' only or 'Yes/YES/yes'.
        """
        from pf.handoff.complete_phase import _check_subagent_completion

        # Test case insensitivity is documented
        lower_yes = _build_subagent_table(all_received="**All received:** yes")
        upper_yes = _build_subagent_table(all_received="**All received:** YES")

        lower_result = _check_subagent_completion(lower_yes)
        upper_result = _check_subagent_completion(upper_yes)

        reviewer_content = _read_reviewer_md()

        if lower_result is None and upper_result is None:
            # Case-insensitive — must be documented
            assert (
                "case" in reviewer_content.lower()
                or "yes" in reviewer_content.lower()
                and "YES" in reviewer_content
            ), (
                "Gate accepts case-insensitive 'Yes/yes/YES' but reviewer.md only "
                "shows 'Yes'. Document that case doesn't matter."
            )

    def test_all_received_no_with_reason_still_fails(self) -> None:
        """'All received: No (2 still pending)' must fail — verify the gate
        correctly rejects 'No' even with explanatory context."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_subagent_table(
            all_received="**All received:** No (2 still pending)"
        )
        result = _check_subagent_completion(content)
        assert result is not None, (
            "Gate must reject 'All received: No' even with explanatory context"
        )

    def test_reviewer_md_documents_all_received_is_gate_checked(self) -> None:
        """Reviewer.md must explicitly state that 'All received: Yes' is
        programmatically checked by the gate, not just a documentation
        convention. Reviewers need to know this line BLOCKS the gate.
        """
        content = _read_reviewer_md()
        # Must mention the line is gate-checked / blocking / required
        gate_check_indicators = [
            "gate check",
            "gate requires",
            "blocks the gate",
            "programmatically",
            "validated by",
            "checked by the gate",
            "gate validates",
        ]
        has_gate_check_doc = any(
            indicator in content.lower() for indicator in gate_check_indicators
        )
        assert has_gate_check_doc, (
            "reviewer.md must explicitly state that the 'All received' line is "
            "programmatically checked by the gate. Reviewers currently don't know "
            "this line is machine-validated, not just documentation."
        )


# =============================================================================
# AC4: Examples in agent definition match gate implementation
# =============================================================================


class TestAC4ExamplesMatchImplementation:
    """Examples in the reviewer agent definition must produce passing gate
    validation when filled in correctly."""

    def test_reviewer_md_template_table_passes_completion_check(self) -> None:
        """The subagent results template in reviewer.md, when filled in with
        valid values, must pass _check_subagent_completion.

        This catches drift between the documented template and what the gate
        actually checks (field names, subagent names, format).
        """
        from pf.handoff.complete_phase import _check_subagent_completion

        # Build content using the exact template structure from reviewer.md
        # (filling in placeholders with valid values)
        rows = "\n".join(
            f"| {i} | {name} | Yes | clean | none | N/A |"
            for i, name in enumerate(REQUIRED_SUBAGENTS, 1)
        )
        content = (
            "## Subagent Results\n\n"
            "| # | Specialist | Received | Status | Findings | Decision |\n"
            "|---|-----------|----------|--------|----------|----------|\n"
            f"{rows}\n\n"
            "**All received:** Yes\n"
            "**Total findings:** 0 confirmed, 0 dismissed, 0 deferred\n"
        )
        result = _check_subagent_completion(content)
        assert result is None, (
            f"Template from reviewer.md doesn't pass gate when filled in: {result}. "
            "The documented template must be compatible with the gate implementation."
        )

    def test_reviewer_md_template_assessment_passes_dispatch_check(self) -> None:
        """The assessment template in reviewer.md, when filled in with all
        dispatch tags, must pass _check_subagent_dispatch."""
        from pf.handoff.complete_phase import _check_subagent_dispatch

        # Use the assessment format from reviewer.md with all tags
        content = (
            "## Reviewer Assessment\n\n"
            "**Verdict:** APPROVED\n"
            "**Data flow traced:** input → output (safe)\n"
            "**Pattern observed:** good pattern at file.py:1\n"
            "**Error handling:** handles errors at file.py:2\n\n"
            "- [EDGE] No boundary issues\n"
            "- [SILENT] No swallowed errors\n"
            "- [TEST] Tests adequate\n"
            "- [DOC] Docs complete\n"
            "- [TYPE] Types sound\n"
            "- [SEC] No security concerns\n"
            "- [SIMPLE] No unnecessary complexity\n"
            "- [RULE] Conventions followed\n"
        )
        missing = _check_subagent_dispatch(content)
        assert len(missing) == 0, (
            f"Assessment template from reviewer.md missing tags: {missing}. "
            "The documented example must include all required dispatch tags."
        )

    def test_gate_approval_md_subagent_list_matches_implementation(self) -> None:
        """The subagent list in approval.md gate definition must match the
        REQUIRED_SUBAGENTS constant in complete_phase.py."""
        from pf.handoff.complete_phase import REQUIRED_SUBAGENTS as CODE_SUBAGENTS

        gate_content = APPROVAL_GATE_MD.read_text()
        for subagent in CODE_SUBAGENTS:
            assert subagent in gate_content, (
                f"approval.md gate definition is missing subagent '{subagent}' "
                "that complete_phase.py requires. Gate docs and code must agree."
            )

    def test_gate_approval_md_dispatch_tags_match_implementation(self) -> None:
        """The dispatch tags in approval.md must match SUBAGENT_DISPATCH_TAGS
        in complete_phase.py."""
        from pf.handoff.complete_phase import SUBAGENT_DISPATCH_TAGS as CODE_TAGS

        gate_content = APPROVAL_GATE_MD.read_text()
        for tag in CODE_TAGS:
            assert tag in gate_content, (
                f"approval.md gate definition is missing dispatch tag '{tag}' "
                "that complete_phase.py requires."
            )

    def test_reviewer_md_subagent_count_matches_implementation(self) -> None:
        """Reviewer.md says '8 subagents' — this must match the actual count
        in REQUIRED_SUBAGENTS in complete_phase.py."""
        from pf.handoff.complete_phase import REQUIRED_SUBAGENTS as CODE_SUBAGENTS

        content = _read_reviewer_md()
        # Extract the number from "ALL 8 subagents" or "8 rows"
        count_matches = re.findall(r"\b(\d+)\s+subagent", content)
        if count_matches:
            for count_str in count_matches:
                count = int(count_str)
                assert count == len(CODE_SUBAGENTS), (
                    f"reviewer.md says {count} subagents but complete_phase.py has "
                    f"{len(CODE_SUBAGENTS)} in REQUIRED_SUBAGENTS. Must match."
                )

    def test_reviewer_md_dispatch_tags_match_implementation(self) -> None:
        """All dispatch tags documented in reviewer.md must match the
        SUBAGENT_DISPATCH_TAGS set in complete_phase.py exactly."""
        from pf.handoff.complete_phase import SUBAGENT_DISPATCH_TAGS as CODE_TAGS

        content = _read_reviewer_md()
        for tag in CODE_TAGS:
            assert tag in content, (
                f"reviewer.md is missing dispatch tag {tag} that the gate requires. "
                "Documented tags must match implementation."
            )

    def test_reviewer_md_exit_gate_type_matches_implementation(self) -> None:
        """The gate_type the reviewer.md tells agents to use must match what
        complete_phase.py actually checks for (i.e., 'approval').

        If reviewer.md says to use a different gate_type string, the gate
        will silently skip the subagent checks.
        """
        content = _read_reviewer_md()
        # The exit section should mention the gate type 'approval'
        assert "approval" in content.lower(), (
            "reviewer.md exit protocol must specify gate_type='approval' so the "
            "reviewer uses the correct gate type in the complete-phase command."
        )
