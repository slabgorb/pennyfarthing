"""
Tests for Story 86-4: Agent tandem awareness.

Validates that agent definitions include proper tandem consultation sections
per ADR-0012 and the tandem-consultation protocol.

Covers all 5 Acceptance Criteria:
  AC1: Leader agents (dev, tea, reviewer) have `<tandem-consultation>` section
  AC2: Section explains: when to consult, how to format request, how to use response
  AC3: Partner agents (architect, devops, tea) have consultation response guidance
  AC4: Agents check workflow phase for tandem availability before consulting
  AC5: High-value pairings documented per ADR-0012 table

Run with: python -m pytest tests/python/test_agent_tandem_awareness.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest

from pf.validate.adapters.tandem_awareness import (
    ADR_0012_PAIRINGS,
    classify_tandem_roles,
    run,
    validate_leader_tandem,
    validate_partner_tandem,
    validate_pairings_documented,
)

# =============================================================================
# Fixtures — inline markdown strings
# =============================================================================

LEADER_COMPLETE = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <tandem-consultation>
    ## Tandem Consultation (Leader)

    When your workflow phase has `tandem.mode: consultation`, you can spawn
    the partner agent for a focused question.

    **When to consult:** Architecture decisions, unfamiliar patterns.

    **Request format:**
    ```markdown
    **Leader:** dev ({character})
    **Partner:** {partner}
    **Context:** {what you're working on}
    **Question:** {specific decision point}
    **Alternatives Considered:**
    - {option 1}
    - {option 2}
    **Relevant Code/Files:** {snippets or paths}
    **Token Budget:** {from tandem config}
    ```

    **If consultation fails:** Continue solo — consultation is advisory.
    </tandem-consultation>
""")

LEADER_NO_SECTION = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <skills>
    - `/pf-testing` - Test commands
    </skills>
""")

LEADER_EMPTY_SECTION = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <tandem-consultation>
    </tandem-consultation>
""")

LEADER_NO_WORKFLOW_CHECK = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <tandem-consultation>
    ## Tandem Consultation (Leader)

    Spawn the partner agent for a focused question.

    **When to consult:** Architecture decisions.

    **Request format:**
    ```markdown
    **Leader:** dev
    **Partner:** architect
    ```

    **If consultation fails:** Continue solo.
    </tandem-consultation>
""")

LEADER_NO_REQUEST_FORMAT = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <tandem-consultation>
    ## Tandem Consultation (Leader)

    When your workflow phase has `tandem.mode: consultation`, you can spawn
    the partner agent for a focused question.

    **When to consult:** Architecture decisions.

    **If consultation fails:** Continue solo.
    </tandem-consultation>
""")

LEADER_NO_DEGRADATION = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <tandem-consultation>
    ## Tandem Consultation (Leader)

    When your workflow phase has `tandem.mode: consultation`, you can spawn
    the partner agent.

    **When to consult:** Architecture decisions.

    **Request format:**
    ```markdown
    **Leader:** dev
    ```
    </tandem-consultation>
""")

PARTNER_COMPLETE = dedent("""\
    # Architect Agent
    <role>System design</role>

    <tandem-consultation>
    ## Tandem Consultation (Partner)

    When spawned for consultation by a leader agent, respond in this format:
    ```markdown
    **Recommendation:** {concise architectural advice}
    **Rationale:** {why this approach is sound}
    **Watch-Out-For:** {architectural pitfalls or coupling risks}
    **Confidence:** {high|medium|low}
    **Token Count:** {approximate tokens}
    ```
    Stay within the token budget.
    </tandem-consultation>
""")

PARTNER_NO_SECTION = dedent("""\
    # Architect Agent
    <role>System design</role>

    <skills>
    - `/pf-mermaid` - Diagrams
    </skills>
""")

PARTNER_MISSING_FIELDS = dedent("""\
    # Architect Agent
    <role>System design</role>

    <tandem-consultation>
    ## Tandem Consultation (Partner)

    When spawned for consultation, respond with your recommendation.
    </tandem-consultation>
""")

DUAL_ROLE_COMPLETE = dedent("""\
    # TEA Agent
    <role>Test writing</role>

    <tandem-consultation>
    ## Tandem Consultation (Leader + Partner)

    **As leader:** When your workflow phase has `tandem.mode: consultation`,
    spawn the partner for test strategy questions.

    **As partner:** When spawned for consultation, respond in this format:
    ```markdown
    **Recommendation:** {concise test strategy advice}
    **Rationale:** {why this approach catches more bugs}
    **Watch-Out-For:** {testing pitfalls or false confidence}
    **Confidence:** {high|medium|low}
    **Token Count:** {approximate tokens}
    ```
    Stay within the token budget.
    </tandem-consultation>
""")


# =============================================================================
# Helpers
# =============================================================================


@pytest.fixture
def agents_dir(tmp_path: Path) -> Path:
    """Create a temporary agents directory."""
    d = tmp_path / "pennyfarthing-dist" / "agents"
    d.mkdir(parents=True)
    return d


def _write_agent(agents_dir: Path, name: str, content: str) -> Path:
    """Write an agent fixture file."""
    p = agents_dir / name
    p.write_text(content)
    return p


# =============================================================================
# AC1: Leader agents have <tandem-consultation> section
# =============================================================================


class TestAC1LeaderSectionPresent:
    """AC1: Leader agents (dev, tea, reviewer) have <tandem-consultation> section."""

    def test_leader_with_tandem_section_classified_as_leader(
        self, agents_dir: Path
    ) -> None:
        """Agent with <tandem-consultation> containing 'Leader' is classified as leader."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)

        leaders, partners = classify_tandem_roles(agents_dir)

        assert "dev.md" in [f.name for f in leaders]

    def test_agent_without_tandem_section_not_classified(
        self, agents_dir: Path
    ) -> None:
        """Agent without <tandem-consultation> section is neither leader nor partner."""
        _write_agent(agents_dir, "sm.md", LEADER_NO_SECTION)

        leaders, partners = classify_tandem_roles(agents_dir)

        assert "sm.md" not in [f.name for f in leaders]
        assert "sm.md" not in [f.name for f in partners]

    def test_dual_role_classified_as_both(self, agents_dir: Path) -> None:
        """Agent with 'Leader + Partner' heading is classified as both."""
        _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)

        leaders, partners = classify_tandem_roles(agents_dir)

        assert "tea.md" in [f.name for f in leaders]
        assert "tea.md" in [f.name for f in partners]

    def test_empty_tandem_section_produces_error(self, agents_dir: Path) -> None:
        """Agent with empty <tandem-consultation> section produces an error."""
        path = _write_agent(agents_dir, "dev.md", LEADER_EMPTY_SECTION)

        errors, warnings = validate_leader_tandem(path)

        assert len(errors) > 0
        assert any("empty" in e.lower() or "content" in e.lower() for e in errors)


# =============================================================================
# AC2: Section explains when to consult, format request, use response
# =============================================================================


class TestAC2LeaderContentComplete:
    """AC2: Leader sections explain when to consult, how to format, how to use."""

    def test_complete_leader_section_no_errors(self, agents_dir: Path) -> None:
        """Leader with all required content produces no errors."""
        path = _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)

        errors, warnings = validate_leader_tandem(path)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_missing_workflow_phase_check_is_error(self, agents_dir: Path) -> None:
        """Leader without workflow phase availability reference is an error."""
        path = _write_agent(agents_dir, "dev.md", LEADER_NO_WORKFLOW_CHECK)

        errors, warnings = validate_leader_tandem(path)

        assert any(
            "workflow" in e.lower() or "phase" in e.lower() or "tandem.mode" in e.lower()
            for e in errors
        ), f"Expected workflow phase check error, got: {errors}"

    def test_missing_request_format_is_warning(self, agents_dir: Path) -> None:
        """Leader without request format template produces a warning."""
        path = _write_agent(agents_dir, "dev.md", LEADER_NO_REQUEST_FORMAT)

        errors, warnings = validate_leader_tandem(path)

        assert any(
            "request" in w.lower() or "format" in w.lower()
            for w in warnings
        ), f"Expected request format warning, got warnings: {warnings}"

    def test_missing_graceful_degradation_is_warning(self, agents_dir: Path) -> None:
        """Leader without graceful degradation guidance produces a warning."""
        path = _write_agent(agents_dir, "dev.md", LEADER_NO_DEGRADATION)

        errors, warnings = validate_leader_tandem(path)

        assert any(
            "fail" in w.lower() or "degrad" in w.lower() or "solo" in w.lower()
            for w in warnings
        ), f"Expected degradation warning, got warnings: {warnings}"

    def test_when_to_consult_present_in_complete_leader(
        self, agents_dir: Path
    ) -> None:
        """Complete leader section should contain 'when to consult' guidance."""
        path = _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)

        errors, warnings = validate_leader_tandem(path)

        # No errors or warnings about missing 'when to consult'
        consult_issues = [
            e for e in errors + warnings if "when" in e.lower() and "consult" in e.lower()
        ]
        assert consult_issues == [], f"Should have 'when to consult', got: {consult_issues}"


# =============================================================================
# AC3: Partner agents have consultation response guidance
# =============================================================================


class TestAC3PartnerResponseGuidance:
    """AC3: Partner agents (architect, devops, tea) have response guidance."""

    def test_complete_partner_no_errors(self, agents_dir: Path) -> None:
        """Partner with all response format fields produces no errors."""
        path = _write_agent(agents_dir, "architect.md", PARTNER_COMPLETE)

        errors, warnings = validate_partner_tandem(path)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_partner_without_section_is_error(self, agents_dir: Path) -> None:
        """Agent expected to be partner but missing section produces an error."""
        path = _write_agent(agents_dir, "architect.md", PARTNER_NO_SECTION)

        errors, warnings = validate_partner_tandem(path)

        assert any(
            "tandem" in e.lower() or "section" in e.lower()
            for e in errors
        ), f"Expected missing section error, got: {errors}"

    def test_partner_missing_response_format_fields_is_error(
        self, agents_dir: Path
    ) -> None:
        """Partner without structured response format (Recommendation, etc.) is error."""
        path = _write_agent(agents_dir, "architect.md", PARTNER_MISSING_FIELDS)

        errors, warnings = validate_partner_tandem(path)

        # Should flag missing response format fields
        assert any(
            "recommendation" in e.lower()
            or "response format" in e.lower()
            or "rationale" in e.lower()
            for e in errors
        ), f"Expected response format error, got: {errors}"

    def test_partner_response_requires_confidence_field(
        self, agents_dir: Path
    ) -> None:
        """Partner response format must include Confidence field."""
        content = dedent("""\
            # Architect Agent
            <role>System design</role>

            <tandem-consultation>
            ## Tandem Consultation (Partner)

            When spawned for consultation, respond:
            ```markdown
            **Recommendation:** {advice}
            **Rationale:** {why}
            **Watch-Out-For:** {pitfalls}
            ```
            </tandem-consultation>
        """)
        path = _write_agent(agents_dir, "architect.md", content)

        errors, warnings = validate_partner_tandem(path)

        assert any(
            "confidence" in e.lower() for e in errors
        ), f"Expected missing Confidence error, got: {errors}"

    def test_dual_role_validates_partner_portion(self, agents_dir: Path) -> None:
        """Dual-role agent validates partner response format too."""
        path = _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)

        errors, warnings = validate_partner_tandem(path)

        assert len(errors) == 0, f"Expected no errors for dual-role partner, got: {errors}"


# =============================================================================
# AC4: Agents check workflow phase for tandem availability
# =============================================================================


class TestAC4WorkflowPhaseCheck:
    """AC4: Agents check workflow phase for tandem availability before consulting."""

    def test_leader_references_tandem_mode_consultation(
        self, agents_dir: Path
    ) -> None:
        """Leader section must reference tandem.mode or workflow phase check."""
        path = _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)

        errors, _ = validate_leader_tandem(path)

        phase_errors = [
            e for e in errors if "workflow" in e.lower() or "phase" in e.lower()
        ]
        assert phase_errors == [], f"Complete leader should pass phase check: {phase_errors}"

    def test_leader_without_phase_reference_is_error(self, agents_dir: Path) -> None:
        """Leader that doesn't mention checking tandem availability is an error."""
        path = _write_agent(agents_dir, "dev.md", LEADER_NO_WORKFLOW_CHECK)

        errors, _ = validate_leader_tandem(path)

        assert any(
            "tandem.mode" in e.lower() or "workflow" in e.lower() or "phase" in e.lower()
            for e in errors
        ), f"Expected workflow phase error, got: {errors}"

    def test_dual_role_leader_portion_checks_phase(self, agents_dir: Path) -> None:
        """Dual-role agent's leader portion must reference workflow phase."""
        path = _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)

        errors, _ = validate_leader_tandem(path)

        phase_errors = [
            e for e in errors if "workflow" in e.lower() or "phase" in e.lower()
        ]
        assert phase_errors == [], f"Dual-role should pass phase check: {phase_errors}"


# =============================================================================
# AC5: High-value pairings documented per ADR-0012 table
# =============================================================================


class TestAC5HighValuePairings:
    """AC5: High-value pairings documented per ADR-0012 table."""

    def test_pairings_function_returns_coverage(self, agents_dir: Path) -> None:
        """validate_pairings_documented returns list of covered/missing pairings."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)
        _write_agent(agents_dir, "architect.md", PARTNER_COMPLETE)
        _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)

        leaders, partners = classify_tandem_roles(agents_dir)
        leader_names = {f.stem for f in leaders}
        partner_names = {f.stem for f in partners}
        covered, missing = validate_pairings_documented(
            leader_names, partner_names, ADR_0012_PAIRINGS
        )

        # Should return lists of tuples
        assert isinstance(covered, list)
        assert isinstance(missing, list)
        assert len(covered) + len(missing) == len(ADR_0012_PAIRINGS)

    def test_missing_pairings_reported(self, agents_dir: Path) -> None:
        """If only one agent file exists, most pairings are missing."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)

        leaders, partners = classify_tandem_roles(agents_dir)
        leader_names = {f.stem for f in leaders}
        partner_names = {f.stem for f in partners}
        _, missing = validate_pairings_documented(
            leader_names, partner_names, ADR_0012_PAIRINGS
        )

        # With only dev.md (leader-only), all pairings missing partners
        assert len(missing) > 0

    def test_all_pairings_covered_when_agents_present(
        self, agents_dir: Path
    ) -> None:
        """When all relevant agents have tandem sections, all pairings are covered."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)
        _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)
        _write_agent(agents_dir, "reviewer.md", dedent("""\
            # Reviewer Agent
            <role>Code review</role>

            <tandem-consultation>
            ## Tandem Consultation (Leader)

            When your workflow phase has `tandem.mode: consultation`, spawn
            the partner for review questions.

            **When to consult:** Uncertain about severity, need domain context.

            **If consultation fails:** Continue solo.
            </tandem-consultation>
        """))
        _write_agent(agents_dir, "architect.md", PARTNER_COMPLETE)
        _write_agent(agents_dir, "devops.md", dedent("""\
            # DevOps Agent
            <role>Infrastructure</role>

            <tandem-consultation>
            ## Tandem Consultation (Partner)

            When spawned for consultation, respond:
            ```markdown
            **Recommendation:** {advice}
            **Rationale:** {why}
            **Watch-Out-For:** {concerns}
            **Confidence:** {high|medium|low}
            **Token Count:** {tokens}
            ```
            </tandem-consultation>
        """))

        leaders, partners = classify_tandem_roles(agents_dir)
        leader_names = {f.stem for f in leaders}
        partner_names = {f.stem for f in partners}
        covered, missing = validate_pairings_documented(
            leader_names, partner_names, ADR_0012_PAIRINGS
        )

        assert missing == [], f"Expected all pairings covered, missing: {missing}"
        assert len(covered) == len(ADR_0012_PAIRINGS)


# =============================================================================
# Full validator run()
# =============================================================================


class TestValidatorRun:
    """Integration: `run()` produces a ValidateReport."""

    def test_run_returns_validate_report(self, agents_dir: Path) -> None:
        """run() should return a ValidateReport with validator='tandem-awareness'."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)
        _write_agent(agents_dir, "architect.md", PARTNER_COMPLETE)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        from pf.validate import ValidateReport

        assert isinstance(report, ValidateReport)
        assert report.validator == "tandem-awareness"

    def test_all_valid_agents_pass(self, agents_dir: Path) -> None:
        """All valid agents produce zero errors."""
        _write_agent(agents_dir, "dev.md", LEADER_COMPLETE)
        _write_agent(agents_dir, "architect.md", PARTNER_COMPLETE)
        _write_agent(agents_dir, "tea.md", DUAL_ROLE_COMPLETE)
        _write_agent(agents_dir, "reviewer.md", dedent("""\
            # Reviewer Agent
            <role>Code review</role>

            <tandem-consultation>
            ## Tandem Consultation (Leader)

            When your workflow phase has `tandem.mode: consultation`, spawn
            the partner for review questions.

            **When to consult:** Uncertain about severity, need domain context.

            **If consultation fails:** Continue solo.
            </tandem-consultation>
        """))
        _write_agent(agents_dir, "devops.md", dedent("""\
            # DevOps Agent
            <role>Infrastructure</role>

            <tandem-consultation>
            ## Tandem Consultation (Partner)

            When spawned for consultation, respond:
            ```markdown
            **Recommendation:** {advice}
            **Rationale:** {why}
            **Watch-Out-For:** {concerns}
            **Confidence:** {high|medium|low}
            ```
            </tandem-consultation>
        """))

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert report.errors == 0, (
            f"Expected 0 errors, got {report.errors}:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )

    def test_agents_with_issues_produce_errors(self, agents_dir: Path) -> None:
        """Agents missing required tandem content produce errors."""
        _write_agent(agents_dir, "dev.md", LEADER_NO_WORKFLOW_CHECK)
        _write_agent(agents_dir, "architect.md", PARTNER_MISSING_FIELDS)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert report.errors > 0

    def test_strict_mode_promotes_warnings(self, agents_dir: Path) -> None:
        """Strict mode promotes warnings to errors."""
        _write_agent(agents_dir, "dev.md", LEADER_NO_REQUEST_FORMAT)

        report_normal = run(agents_dir.parent.parent, fix=False, strict=False)
        report_strict = run(agents_dir.parent.parent, fix=False, strict=True)

        assert report_normal.warnings > 0
        assert report_strict.errors >= report_normal.warnings


# =============================================================================
# Real file integration tests
# =============================================================================


class TestRealAgentFiles:
    """Integration: Validate actual agent files in pennyfarthing-dist."""

    def _get_agents_dir(self) -> Path:
        project_root = Path(__file__).resolve().parents[2]
        agents_dir = project_root / "pennyfarthing-dist" / "agents"
        if not agents_dir.is_dir():
            pytest.skip("pennyfarthing-dist/agents/ not found")
        return agents_dir

    def test_real_leader_agents_have_tandem_section(self) -> None:
        """Real leader agents (dev, tea, reviewer) have <tandem-consultation>."""
        agents_dir = self._get_agents_dir()

        leaders, _ = classify_tandem_roles(agents_dir)
        leader_names = {f.stem for f in leaders}

        for agent in ("dev", "tea", "reviewer"):
            assert agent in leader_names, (
                f"Leader agent '{agent}' missing from tandem-classified leaders. "
                f"Found: {leader_names}"
            )

    def test_real_partner_agents_have_tandem_section(self) -> None:
        """Real partner agents (architect, devops, tea) have <tandem-consultation>."""
        agents_dir = self._get_agents_dir()

        _, partners = classify_tandem_roles(agents_dir)
        partner_names = {f.stem for f in partners}

        for agent in ("architect", "devops", "tea"):
            assert agent in partner_names, (
                f"Partner agent '{agent}' missing from tandem-classified partners. "
                f"Found: {partner_names}"
            )

    def test_real_leader_sections_pass_validation(self) -> None:
        """Real leader agent tandem sections pass content validation."""
        agents_dir = self._get_agents_dir()
        leaders, _ = classify_tandem_roles(agents_dir)

        for leader_path in leaders:
            errors, _ = validate_leader_tandem(leader_path)
            assert errors == [], (
                f"Leader {leader_path.stem} has tandem errors: {errors}"
            )

    def test_real_partner_sections_pass_validation(self) -> None:
        """Real partner agent tandem sections pass content validation."""
        agents_dir = self._get_agents_dir()
        _, partners = classify_tandem_roles(agents_dir)

        for partner_path in partners:
            errors, _ = validate_partner_tandem(partner_path)
            assert errors == [], (
                f"Partner {partner_path.stem} has tandem errors: {errors}"
            )

    def test_real_adr_0012_pairings_all_covered(self) -> None:
        """All ADR-0012 high-value pairings are covered by real agent files."""
        agents_dir = self._get_agents_dir()

        leaders, partners = classify_tandem_roles(agents_dir)
        leader_names = {f.stem for f in leaders}
        partner_names = {f.stem for f in partners}
        covered, missing = validate_pairings_documented(
            leader_names, partner_names, ADR_0012_PAIRINGS
        )

        assert missing == [], (
            f"ADR-0012 pairings not covered by agent tandem sections: {missing}"
        )

    def test_real_full_validation_zero_errors(self) -> None:
        """Full tandem-awareness validator produces zero errors on real files."""
        project_root = Path(__file__).resolve().parents[2]
        agents_dir = project_root / "pennyfarthing-dist" / "agents"

        if not agents_dir.is_dir():
            pytest.skip("pennyfarthing-dist/agents/ not found")

        report = run(project_root, fix=False, strict=False)

        assert report.errors == 0, (
            f"Real agent files have {report.errors} tandem-awareness errors:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )
