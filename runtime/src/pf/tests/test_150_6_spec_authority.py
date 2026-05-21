"""Tests for 150-6: Spec-authority hierarchy and quality regression guards.

Tests the enforcement of spec-authority hierarchy in agent workflow:
- Deviation entries must reference real spec sources (AC3)
- Higher-authority overrides require explicit rationale (AC4)
- Quality regression gate detects weakened tests (AC5)
- Session scope validation flags raw standard copies (AC6)

Story: 150-6
"""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def session_dir(tmp_path: Path) -> Path:
    """Create a temporary .session directory."""
    d = tmp_path / ".session"
    d.mkdir()
    return d


@pytest.fixture
def valid_session(session_dir: Path) -> Path:
    """Create a session file with properly formatted deviations."""
    p = session_dir / "150-6-session.md"
    p.write_text(dedent("""\
        # Story 150-6

        ## Design Deviations

        <!-- Agents: append deviations below this line. -->

        ### TEA (test design)
        - **Used property-based testing instead of example list**
          - Spec source: context-story-150-6.md, AC-3
          - Spec text: "validate deviation entries reference spec sources"
          - Implementation: Tests use property-based generation
          - Rationale: Catches more edge cases than enumerated examples
          - Severity: minor
          - Forward impact: none

        ### Dev (implementation)
        - No deviations from spec.
    """))
    return p


@pytest.fixture
def session_with_empty_spec_source(session_dir: Path) -> Path:
    """Create a session file where a deviation has an empty spec source."""
    p = session_dir / "empty-spec-session.md"
    p.write_text(dedent("""\
        # Story 150-6

        ## Design Deviations

        ### Dev (implementation)
        - **Changed field name from ErrorDetail to ApiError**
          - Spec source:
          - Spec text: "use ErrorDetail struct"
          - Implementation: Used ApiError instead
          - Rationale: Matched existing codebase patterns
          - Severity: major
          - Forward impact: none
    """))
    return p


@pytest.fixture
def session_with_vague_spec_source(session_dir: Path) -> Path:
    """Create a session file where spec source is vague (no document reference)."""
    p = session_dir / "vague-spec-session.md"
    p.write_text(dedent("""\
        # Story 150-6

        ## Design Deviations

        ### Dev (implementation)
        - **Simplified error fields**
          - Spec source: general architecture
          - Spec text: "align with RFC 9457"
          - Implementation: Used simplified 3-field errors instead of full RFC
          - Rationale: Simpler for MVP
          - Severity: major
          - Forward impact: minor — Story 150-7 assumes full RFC fields
    """))
    return p


@pytest.fixture
def session_overriding_higher_authority(session_dir: Path) -> Path:
    """Deviation overrides story scope (highest authority) with architecture doc."""
    p = session_dir / "override-session.md"
    p.write_text(dedent("""\
        # Story 150-6

        ## Design Deviations

        ### Dev (implementation)
        - **Used ApiError instead of ErrorDetail**
          - Spec source: docs/architecture.md, Section 4
          - Spec text: "Use ApiError for all error responses"
          - Implementation: ApiError struct with code, message, details
          - Rationale: Architecture doc recommends this pattern
          - Severity: major
          - Forward impact: breaking — Story 150-7 expects ErrorDetail
    """))
    return p


# =============================================================================
# AC3: Deviation entries must reference real spec sources
# =============================================================================


class TestDeviationSpecSourceValidation:
    """Deviation entries must reference a real spec source document."""

    def test_empty_spec_source_fails(self, session_with_empty_spec_source: Path):
        """A deviation with an empty spec source should fail validation."""
        from pf.gates.deviations import validate_deviations

        result = validate_deviations(session_with_empty_spec_source, "dev")
        assert result["status"] == "fail", (
            "Empty spec source should fail — agents must cite a specific document"
        )
        # Should mention spec source in the error
        error_messages = [e["message"] for e in result["errors"]]
        assert any("spec source" in msg.lower() or "Spec source" in msg for msg in error_messages), (
            f"Error should mention spec source problem, got: {error_messages}"
        )

    def test_vague_spec_source_fails(self, session_with_vague_spec_source: Path):
        """A deviation citing 'general architecture' without a file path should fail."""
        from pf.gates.deviations import validate_deviations

        result = validate_deviations(session_with_vague_spec_source, "dev")
        assert result["status"] == "fail", (
            "Vague spec source without document path should fail validation"
        )

    def test_valid_spec_source_passes(self, valid_session: Path):
        """A deviation citing 'context-story-150-6.md, AC-3' should pass."""
        from pf.gates.deviations import validate_deviations

        result = validate_deviations(valid_session, "tea")
        assert result["status"] == "pass", (
            f"Well-cited deviation should pass, got errors: {result.get('errors')}"
        )

    def test_spec_source_must_contain_file_or_section_reference(
        self, session_dir: Path
    ):
        """Spec source must reference a specific document or section, not just prose."""
        p = session_dir / "prose-only-session.md"
        p.write_text(dedent("""\
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Changed test approach**
              - Spec source: the team discussed this
              - Spec text: "test all error paths"
              - Implementation: Only tested happy path
              - Rationale: Time constraints
              - Severity: major
              - Forward impact: none
        """))

        from pf.gates.deviations import validate_deviations

        result = validate_deviations(p, "tea")
        assert result["status"] == "fail", (
            "Prose-only spec source ('the team discussed this') should fail"
        )


# =============================================================================
# AC4: Higher-authority overrides require explicit rationale
# =============================================================================


class TestSpecAuthorityHierarchy:
    """When a deviation overrides a higher-authority source, rationale must explain why."""

    def test_deviation_overriding_session_scope_detected(
        self, session_overriding_higher_authority: Path
    ):
        """A deviation citing architecture doc that contradicts session scope should be flagged."""
        from pf.gates.deviations import validate_spec_authority

        result = validate_spec_authority(
            session_overriding_higher_authority,
            agent="dev",
        )
        assert result["status"] == "fail" or len(result.get("warnings", [])) > 0, (
            "Deviation citing lower-authority source (architecture doc) over session "
            "scope should be flagged"
        )

    def test_authority_hierarchy_order(self):
        """Verify the authority hierarchy is encoded correctly."""
        from pf.gates.deviations import SPEC_AUTHORITY_HIERARCHY

        assert len(SPEC_AUTHORITY_HIERARCHY) == 4, (
            "Should have exactly 4 levels: session, story-context, epic-context, architecture"
        )
        # Highest authority first
        assert SPEC_AUTHORITY_HIERARCHY[0] == "session"
        assert SPEC_AUTHORITY_HIERARCHY[1] == "story-context"
        assert SPEC_AUTHORITY_HIERARCHY[2] == "epic-context"
        assert SPEC_AUTHORITY_HIERARCHY[3] == "architecture"

    def test_deviation_from_lower_to_higher_no_warning(self, session_dir: Path):
        """Deviation citing session scope (highest) should NOT trigger hierarchy warning."""
        p = session_dir / "session-scope-dev.md"
        p.write_text(dedent("""\
            # Story

            ## Design Deviations

            ### Dev (implementation)
            - **Used ErrorDetail instead of ApiError**
              - Spec source: 150-6-session.md, Story Context
              - Spec text: "Use ErrorDetail with RFC 9457 fields"
              - Implementation: ErrorDetail struct with RFC 9457 fields
              - Rationale: Session scope is authoritative
              - Severity: minor
              - Forward impact: none
        """))

        from pf.gates.deviations import validate_spec_authority

        result = validate_spec_authority(p, agent="dev")
        assert result["status"] == "pass", (
            "Deviation citing highest-authority source should pass without warnings"
        )


# =============================================================================
# AC5: Quality regression gate
# =============================================================================


class TestQualityRegressionGate:
    """Quality regression gate detects weakened test suites."""

    def test_snapshot_test_deletion_detected(self, tmp_path: Path):
        """Deleting a snapshot test file should be flagged as regression."""
        from pf.gates.quality_regression import check_quality_regression

        # Simulate a diff that removes a snapshot test file
        diff_content = dedent("""\
            diff --git a/tests/snapshots/api_response.snap b/tests/snapshots/api_response.snap
            deleted file mode 100644
            --- a/tests/snapshots/api_response.snap
            +++ /dev/null
            @@ -1,20 +0,0 @@
            -snapshot_name: api_response
            -expression: response.body()
        """)

        result = check_quality_regression(diff_content)
        assert not result["success"], (
            "Deleting snapshot test files should fail quality regression check"
        )
        assert any("snapshot" in c["detail"].lower() for c in result["data"]["checks"]
                    if c["status"] == "fail"), (
            "Should specifically mention snapshot deletion"
        )

    def test_assertion_replacement_with_weaker_check(self, tmp_path: Path):
        """Replacing assert_json_snapshot! with manual assertions is a regression."""
        from pf.gates.quality_regression import check_quality_regression

        diff_content = dedent("""\
            diff --git a/tests/api_test.rs b/tests/api_test.rs
            --- a/tests/api_test.rs
            +++ b/tests/api_test.rs
            @@ -10,7 +10,7 @@
             fn test_response_format() {
            -    assert_json_snapshot!(response);
            +    assert!(response.status().is_success());
             }
        """)

        result = check_quality_regression(diff_content)
        assert not result["success"], (
            "Replacing snapshot assertion with weaker structural check is regression"
        )

    def test_ignore_attribute_addition_detected(self, tmp_path: Path):
        """Adding #[ignore] to a test without justification is a regression."""
        from pf.gates.quality_regression import check_quality_regression

        diff_content = dedent("""\
            diff --git a/tests/api_test.rs b/tests/api_test.rs
            --- a/tests/api_test.rs
            +++ b/tests/api_test.rs
            @@ -8,6 +8,7 @@
            +    #[ignore]
                 #[test]
                 fn test_api_response() {
        """)

        result = check_quality_regression(diff_content)
        assert not result["success"], (
            "Adding #[ignore] should fail quality regression check"
        )

    def test_skip_addition_detected(self, tmp_path: Path):
        """Adding .skip() to a JS/TS test is a regression."""
        from pf.gates.quality_regression import check_quality_regression

        diff_content = dedent("""\
            diff --git a/tests/api.test.ts b/tests/api.test.ts
            --- a/tests/api.test.ts
            +++ b/tests/api.test.ts
            @@ -5,7 +5,7 @@
            -  it('validates response envelope', () => {
            +  it.skip('validates response envelope', () => {
        """)

        result = check_quality_regression(diff_content)
        assert not result["success"], (
            "Adding .skip() should fail quality regression check"
        )

    def test_clean_diff_passes(self, tmp_path: Path):
        """A diff that adds tests without removing/weakening should pass."""
        from pf.gates.quality_regression import check_quality_regression

        diff_content = dedent("""\
            diff --git a/tests/api_test.rs b/tests/api_test.rs
            --- a/tests/api_test.rs
            +++ b/tests/api_test.rs
            @@ -10,6 +10,12 @@
             fn test_response_format() {
                 assert_json_snapshot!(response);
             }
            +
            +#[test]
            +fn test_error_response_format() {
            +    let resp = create_error_response(400, "bad request");
            +    assert_json_snapshot!(resp);
            +}
        """)

        result = check_quality_regression(diff_content)
        assert result["success"], (
            f"Adding new tests should pass regression check, got: {result}"
        )

    def test_test_file_deletion_detected(self, tmp_path: Path):
        """Deleting an entire test file is a regression."""
        from pf.gates.quality_regression import check_quality_regression

        diff_content = dedent("""\
            diff --git a/tests/important_test.rs b/tests/important_test.rs
            deleted file mode 100644
            --- a/tests/important_test.rs
            +++ /dev/null
            @@ -1,30 +0,0 @@
            -#[cfg(test)]
            -mod tests {
            -    #[test]
            -    fn test_something() {
            -        assert_eq!(1 + 1, 2);
            -    }
            -}
        """)

        result = check_quality_regression(diff_content)
        assert not result["success"], (
            "Deleting test files should fail quality regression check"
        )

    def test_result_follows_result_object_pattern(self, tmp_path: Path):
        """Result must follow {success, data, error} pattern per SOUL.md #10."""
        from pf.gates.quality_regression import check_quality_regression

        result = check_quality_regression("")
        assert "success" in result, "Result must have 'success' key"
        assert "data" in result, "Result must have 'data' key"
        assert "error" in result, "Result must have 'error' key"


# =============================================================================
# AC6: Session scope validation
# =============================================================================


class TestSessionScopeValidation:
    """Session scope validation flags raw external standard copies."""

    def test_raw_rfc_copy_flagged(self, session_dir: Path):
        """Implementation notes that copy RFC text verbatim should be flagged."""
        p = session_dir / "rfc-copy-session.md"
        p.write_text(dedent("""\
            # Story 8-1-1

            ## Story Context

            ### Implementation Notes
            The response envelope MUST conform to RFC 9457:
            - type (string): URI reference identifying the problem type
            - title (string): Short human-readable summary
            - status (integer): HTTP status code
            - detail (string): Human-readable explanation
            - instance (string): URI reference identifying the specific occurrence

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.
        """))

        from pf.gates.deviations import validate_session_scope

        result = validate_session_scope(p)
        assert not result["success"], (
            "Raw RFC field list without adaptation notes should be flagged"
        )
        assert any("adaptation" in c["detail"].lower() or "raw" in c["detail"].lower()
                    for c in result["data"]["checks"] if c["status"] == "fail"), (
            "Should mention need for adaptation notes"
        )

    def test_adapted_rfc_reference_passes(self, session_dir: Path):
        """Implementation notes that adapt an RFC for the project should pass."""
        p = session_dir / "adapted-rfc-session.md"
        p.write_text(dedent("""\
            # Story 8-1-1

            ## Story Context

            ### Implementation Notes
            Error responses use a simplified envelope inspired by RFC 9457.
            Project adaptation: We use only `code`, `message`, and `details` fields.
            The `type` and `instance` fields from the RFC are omitted since we use
            numeric error codes for machine consumption instead of URI references.

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.
        """))

        from pf.gates.deviations import validate_session_scope

        result = validate_session_scope(p)
        assert result["success"], (
            f"Adapted RFC reference with project-specific notes should pass, got: {result}"
        )

    def test_no_implementation_notes_passes(self, session_dir: Path):
        """Session file without implementation notes section should pass (nothing to validate)."""
        p = session_dir / "no-impl-notes-session.md"
        p.write_text(dedent("""\
            # Story 150-6

            ## Story Context

            ### Problem Statement
            Fix the spec authority hierarchy.

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.
        """))

        from pf.gates.deviations import validate_session_scope

        result = validate_session_scope(p)
        assert result["success"], (
            "No implementation notes section should pass — nothing to validate"
        )


# =============================================================================
# Integration: Agent definitions contain hierarchy instructions
# =============================================================================


class TestAgentDefinitionsContainHierarchy:
    """Agent markdown definitions must include spec-authority hierarchy (AC1-2)."""

    @pytest.fixture
    def agents_dir(self) -> Path:
        """Return the path to agent definitions."""
        return (
            Path(__file__).resolve().parents[3]
            / "agents"
        )

    @pytest.mark.parametrize("agent_file", ["tea.md", "dev.md", "architect.md"])
    def test_agent_has_spec_authority_section(self, agents_dir: Path, agent_file: str):
        """TEA, Dev, and Architect agents must document spec-authority hierarchy."""
        agent_path = agents_dir / agent_file
        if not agent_path.exists():
            pytest.skip(f"Agent file {agent_file} not found at {agent_path}")

        content = agent_path.read_text()
        # Check for the hierarchy being documented
        assert "spec" in content.lower() and "authority" in content.lower(), (
            f"{agent_file} must contain spec-authority hierarchy instructions"
        )

    @pytest.mark.parametrize("agent_file", ["tea.md", "dev.md", "architect.md"])
    def test_agent_lists_all_four_authority_levels(
        self, agents_dir: Path, agent_file: str
    ):
        """Each agent must list all 4 authority levels."""
        agent_path = agents_dir / agent_file
        if not agent_path.exists():
            pytest.skip(f"Agent file {agent_file} not found at {agent_path}")

        content = agent_path.read_text().lower()
        assert "session" in content, f"{agent_file} must mention session scope"
        assert "story context" in content or "story-context" in content, (
            f"{agent_file} must mention story context"
        )
        assert "epic context" in content or "epic-context" in content, (
            f"{agent_file} must mention epic context"
        )
        assert "architecture" in content or "soul.md" in content, (
            f"{agent_file} must mention architecture docs / SOUL.md"
        )
