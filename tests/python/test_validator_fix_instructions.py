"""
Tests for Story 141-23: Add actionable fix instructions to all validators.

TDD RED phase: All tests should FAIL until implementation.

Every validator that can halt an agent must include actionable fix instructions
in its error messages, so agents can self-correct and continue.

Acceptance Criteria:
1. All validators that can halt agents are identified and cataloged
2. Each validator produces error messages with specific fix instructions
3. Fix instructions are actionable — agents can follow them to resolve the issue
4. Tests verify that error messages include fix guidance

Run with: python -m pytest tests/python/test_validator_fix_instructions.py -v
"""

import json
import re
import sys
from io import StringIO
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.hooks.schema_validation import (  # noqa: E402
    _validate_session,
    _validate_skill,
    _validate_step,
)
from pf.handoff.resolve_gate import resolve_gate  # noqa: E402
from pf.handoff.complete_phase import complete_phase  # noqa: E402
from pf.sprint.validator import (  # noqa: E402
    ValidationResult,
    format_validation_errors,
    validate_epic,
    validate_epic_shard,
    validate_sprint,
    validate_story,
)
from pf.preflight.independence import (  # noqa: E402
    IndependenceResult,
    UnitDefinition,
    check_independence,
)


# =============================================================================
# Helpers
# =============================================================================

def _has_fix_instruction(message: str) -> bool:
    """Check if an error message contains actionable fix instructions.

    Looks for common fix instruction patterns:
    - "To fix:" prefix
    - "Instead:" prefix
    - "Expected:" with example format
    - "Example:" with sample content
    - "Valid values:" or "Must be one of:"
    - "Try:" prefix
    """
    fix_patterns = [
        r"(?i)to fix:",
        r"(?i)instead:",
        r"(?i)example:",
        r"(?i)try:",
        r"(?i)hint:",
        r"(?i)required format:",
    ]
    return any(re.search(p, message) for p in fix_patterns)


def _has_actionable_content(message: str) -> bool:
    """Check if fix instructions are specific enough to act on.

    An actionable fix instruction should contain at least one of:
    - A concrete example (code, path, or value)
    - A specific command to run
    - A template/snippet to use
    """
    actionable_patterns = [
        r"`[^`]+`",  # backtick-quoted code/paths
        r"```",  # code blocks
        r"e\.g\.",  # example references
        r"pf\s+\w+",  # pf CLI commands
    ]
    return any(re.search(p, message) for p in actionable_patterns)


# =============================================================================
# Schema Validation Hook — Fix Instructions
# =============================================================================


class TestSchemaValidationFixInstructions:
    """Schema validation errors should include fix instructions with
    example correct content so the agent can re-write the file."""

    def test_session_missing_story_attr_includes_fix(self):
        """Missing story attribute error should show expected format."""
        content = "<session>\n<meta><jira>X</jira><started>Y</started></meta>\n</session>"
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Session schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected a 'To fix:' or 'Example:' section showing correct format."
        )

    def test_session_missing_workflow_attr_includes_fix(self):
        """Missing workflow attribute error should show expected format."""
        content = '<session story="141-1">\n<meta><jira>X</jira><started>Y</started></meta>\n</session>'
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Session schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing: <session story=\"X\" workflow=\"Y\">"
        )

    def test_session_missing_meta_includes_fix(self):
        """Missing <meta> error should show what goes inside it."""
        content = '<session story="141-1" workflow="tdd">\n<status phase="red"/>\n</session>'
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Session schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing required <meta> children."
        )

    def test_session_missing_status_includes_fix(self):
        """Missing <status> error should show expected format."""
        content = '<session story="141-1" workflow="tdd">\n<meta><jira>X</jira><started>Y</started></meta>\n</session>'
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Session schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing: <status phase=\"...\"/>"
        )

    def test_session_missing_phase_attr_includes_fix(self):
        """Missing phase attribute on <status> should show expected format."""
        content = '<session story="141-1" workflow="tdd">\n<meta><jira>X</jira><started>Y</started></meta>\n<status>active</status>\n</session>'
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Session schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing: <status phase=\"phase-name\">"
        )

    def test_skill_missing_frontmatter_includes_fix(self):
        """Missing YAML frontmatter error should show expected format."""
        content = "# My Skill\n<run>do stuff</run>\n<output>result</output>"
        errors = _validate_skill(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Skill schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected example showing ---\\nname: ...\\ndescription: ...\\n---"
        )

    def test_skill_missing_name_includes_fix(self):
        """Missing 'name' in frontmatter should show expected field."""
        content = "---\ndescription: A skill\n---\n<run>x</run>\n<output>y</output>"
        errors = _validate_skill(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Skill schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing required frontmatter fields."
        )

    def test_skill_missing_required_tags_includes_fix(self):
        """Missing <run> or <output> tags should show expected structure."""
        content = "---\nname: test\ndescription: A skill\n---\nHello"
        errors = _validate_skill(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Skill schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing required XML tags."
        )

    def test_step_missing_required_tags_includes_fix(self):
        """Missing step tags should show expected structure."""
        content = "# Step\nSome content without tags"
        errors = _validate_step(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Step schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing required <purpose>, <instructions>, <output> tags."
        )

    def test_step_missing_meta_fields_includes_fix(self):
        """Missing step-meta fields should show expected content."""
        content = "<purpose>P</purpose>\n<instructions>I</instructions>\n<output>O</output>\n<step-meta>step: 1</step-meta>"
        errors = _validate_step(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_fix_instruction(combined), (
            f"Step schema error lacks fix instructions.\n"
            f"Errors: {errors}\n"
            f"Expected guidance showing all required step-meta fields."
        )

    def test_schema_error_includes_actionable_example(self):
        """Schema errors should include a concrete example, not just field names."""
        content = "<session>\n</session>"
        errors = _validate_session(content)
        assert errors, "Expected validation errors"
        combined = "\n".join(errors)
        assert _has_actionable_content(combined), (
            f"Session schema errors lack actionable examples.\n"
            f"Errors: {errors}\n"
            f"Expected backtick-quoted examples or code snippets."
        )


# =============================================================================
# Resolve Gate — Fix Instructions
# =============================================================================


class TestResolveGateFixInstructions:
    """resolve-gate errors should guide agents to the correct workflow/phase."""

    def test_workflow_not_found_lists_available_workflows(self, tmp_path):
        """When workflow is not found, error should list available workflows."""
        # Set up minimal project structure with some workflows
        pf_dir = tmp_path / ".pennyfarthing" / "workflows"
        pf_dir.mkdir(parents=True)
        for wf_name in ["tdd", "trivial", "bdd"]:
            wf_file = pf_dir / f"{wf_name}.yaml"
            wf_file.write_text(yaml.dump({
                "workflow": {
                    "name": wf_name,
                    "phases": [{"name": "setup", "agent": "sm"}],
                }
            }))

        result = resolve_gate("141-1", "nonexistent", "setup", project_root=tmp_path)
        assert result["status"] == "error"
        error_msg = result["error"]
        assert _has_fix_instruction(error_msg), (
            f"Workflow-not-found error lacks fix instructions.\n"
            f"Error: {error_msg}\n"
            f"Expected: list of available workflows (tdd, trivial, bdd)."
        )
        # Should mention at least one available workflow
        assert any(wf in error_msg for wf in ["tdd", "trivial", "bdd"]), (
            f"Error should list available workflows.\nGot: {error_msg}"
        )

    def test_phase_not_found_lists_valid_phases(self, tmp_path):
        """When phase is not found, error should list valid phase names."""
        pf_dir = tmp_path / ".pennyfarthing" / "workflows"
        pf_dir.mkdir(parents=True)
        wf_file = pf_dir / "tdd.yaml"
        wf_file.write_text(yaml.dump({
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm"},
                    {"name": "red", "agent": "tea"},
                    {"name": "green", "agent": "dev"},
                    {"name": "review", "agent": "reviewer"},
                ],
            }
        }))

        result = resolve_gate("141-1", "tdd", "nonexistent", project_root=tmp_path)
        assert result["status"] == "error"
        error_msg = result["error"]
        assert _has_fix_instruction(error_msg), (
            f"Phase-not-found error lacks fix instructions.\n"
            f"Error: {error_msg}\n"
            f"Expected: list of valid phases (setup, red, green, review)."
        )
        assert any(ph in error_msg for ph in ["setup", "red", "green", "review"]), (
            f"Error should list valid phases.\nGot: {error_msg}"
        )

    def test_workflow_parse_error_includes_fix(self, tmp_path):
        """When workflow YAML can't be parsed, error should suggest what to check."""
        pf_dir = tmp_path / ".pennyfarthing" / "workflows"
        pf_dir.mkdir(parents=True)
        wf_file = pf_dir / "broken.yaml"
        wf_file.write_text("not: valid: yaml: {{{}")

        result = resolve_gate("141-1", "broken", "setup", project_root=tmp_path)
        assert result["status"] == "error"
        error_msg = result["error"]
        assert _has_fix_instruction(error_msg), (
            f"Workflow parse error lacks fix instructions.\n"
            f"Error: {error_msg}\n"
            f"Expected guidance on checking workflow YAML structure."
        )


# =============================================================================
# Complete Phase — Fix Instructions
# =============================================================================


class TestCompletePhaseFixInstructions:
    """complete-phase errors should tell agents exactly what format is expected."""

    def test_missing_assessment_describes_expected_format(self, tmp_path):
        """Missing assessment error should describe the ## Assessment heading format."""
        pf_dir = tmp_path / ".pennyfarthing" / "workflows"
        pf_dir.mkdir(parents=True)
        wf_file = pf_dir / "tdd.yaml"
        wf_file.write_text(yaml.dump({
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
                    {"name": "green", "agent": "dev"},
                ],
            }
        }))

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "141-1-session.md"
        session_file.write_text("# Story 141-1\n**Phase:** red\n**Workflow:** tdd\n\nNo assessment here.")

        result = complete_phase(
            "141-1", "tdd", "red", "green", "tests_fail",
            project_root=tmp_path,
        )
        assert result["status"] == "error"
        error_msg = result["error"]
        assert _has_fix_instruction(error_msg), (
            f"Missing assessment error lacks fix instructions.\n"
            f"Error: {error_msg}\n"
            f"Expected guidance showing: ## {{Agent}} Assessment heading format."
        )
        # Should mention the heading format
        assert "##" in error_msg or "Assessment" in error_msg, (
            f"Error should reference the ## Assessment heading format.\nGot: {error_msg}"
        )

    def test_session_not_found_includes_fix(self, tmp_path):
        """Session-not-found error should tell agent how to create it."""
        pf_dir = tmp_path / ".pennyfarthing" / "workflows"
        pf_dir.mkdir(parents=True)
        session_dir = tmp_path / ".session"
        session_dir.mkdir()

        result = complete_phase(
            "141-1", "tdd", "red", "green", "tests_fail",
            project_root=tmp_path,
        )
        assert result["status"] == "error"
        error_msg = result["error"]
        assert _has_fix_instruction(error_msg), (
            f"Session-not-found error lacks fix instructions.\n"
            f"Error: {error_msg}\n"
            f"Expected guidance on running SM setup or creating the session file."
        )


# =============================================================================
# Sprint Validator — Fix Instructions
# =============================================================================


class TestSprintValidatorFixInstructions:
    """Sprint YAML validation errors should include fix guidance
    so agents can correct YAML without guessing at structure."""

    def test_missing_sprint_section_includes_fix(self):
        """Missing 'sprint' section should show expected top-level structure."""
        result = validate_sprint({"epics": []})
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Missing sprint section error lacks fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance showing required sprint: section structure."
        )

    def test_missing_required_field_includes_fix(self):
        """Missing required field should show the field name and expected type."""
        data = {"sprint": {"number": 1, "goal": "Test"}}  # missing dates and status
        result = validate_sprint(data)
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Missing field errors lack fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance like: 'To fix: Add start_date: YYYY-MM-DD'"
        )

    def test_invalid_date_format_includes_fix(self):
        """Invalid date format should show expected format with example."""
        data = {
            "sprint": {
                "number": 1,
                "goal": "Test",
                "start_date": "Jan 1 2026",
                "end_date": "2026-01-15",
                "status": "active",
            }
        }
        result = validate_sprint(data)
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Invalid date error lacks fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance with example: 'To fix: Use YYYY-MM-DD format, e.g. 2026-01-01'"
        )

    def test_invalid_sprint_number_type_includes_fix(self):
        """Non-integer sprint number should show expected type."""
        data = {
            "sprint": {
                "number": "twelve",
                "goal": "Test",
                "start_date": "2026-01-01",
                "end_date": "2026-01-15",
                "status": "active",
            }
        }
        result = validate_sprint(data)
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Invalid number type error lacks fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance: 'To fix: Use an integer, e.g. number: 12'"
        )

    def test_missing_story_field_includes_fix(self):
        """Missing story fields should show expected story structure."""
        story = {"id": "141-1"}  # missing title, status, points
        result = validate_story(story, "epic-141")
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Missing story field errors lack fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance showing required story fields."
        )

    def test_invalid_story_points_includes_fix(self):
        """Non-numeric points should show expected format."""
        story = {"id": "141-1", "title": "Test", "status": "backlog", "points": "three"}
        result = validate_story(story, "epic-141")
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Invalid points error lacks fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance: 'To fix: Use a number, e.g. points: 3'"
        )

    def test_invalid_jira_key_includes_fix(self):
        """Invalid Jira key format should show expected pattern."""
        story = {
            "id": "141-1",
            "title": "Test",
            "status": "backlog",
            "points": 3,
            "jira": "invalid-key",
        }
        result = validate_story(story, "epic-141")
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Invalid Jira key error lacks fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance with example: 'To fix: Use PROJECT-NUMBER format, e.g. MSSCI-12345'"
        )

    def test_missing_epic_field_includes_fix(self):
        """Missing epic fields should show expected structure."""
        epic = {"stories": []}  # missing id and title
        result = validate_epic(epic, set())
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Missing epic field errors lack fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance showing required epic fields."
        )

    def test_non_string_epic_id_includes_fix(self):
        """Non-string epic ID error already has fix instruction — verify it."""
        epic = {"id": 87, "title": "Test"}
        result = validate_epic(epic, set())
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        # This one already has a fix instruction — verify it's present
        assert "Quote it" in combined or "e.g." in combined, (
            f"Non-string epic ID error should have fix.\nGot: {combined}"
        )

    def test_epic_shard_missing_field_includes_fix(self):
        """Missing epic shard fields should show expected structure."""
        shard = {"id": "141"}  # missing title, status, stories
        result = validate_epic_shard(shard)
        assert not result.valid
        combined = "\n".join(e.message for e in result.errors)
        assert _has_fix_instruction(combined), (
            f"Missing shard field errors lack fix instructions.\n"
            f"Errors: {[e.message for e in result.errors]}\n"
            f"Expected guidance showing required shard fields."
        )

    def test_format_validation_errors_includes_fix(self):
        """Formatted output should preserve fix instructions."""
        result = ValidationResult(valid=True)
        result.add_error(
            "Missing required field: status. To fix: Add `status: backlog`",
            "story.status",
        )
        formatted = format_validation_errors(result)
        assert "To fix:" in formatted, (
            f"Formatted output should preserve fix instructions.\nGot: {formatted}"
        )


# =============================================================================
# Pre-Edit Check — Fix Instructions
# =============================================================================


class TestPreEditCheckFixInstructions:
    """Protected file errors should tell agents where to put their changes."""

    def test_protected_env_file_includes_fix(self):
        """Blocking .env edit should suggest alternative location."""
        from pf.hooks.pre_edit_check import main, PROTECTED_PATTERNS

        # The main() function writes to stderr and exits — we test the
        # error message format by examining what patterns produce
        # We verify the _message_ pattern: each protected pattern block
        # should include a fix instruction.

        # Verify each protected pattern would produce actionable guidance
        for pattern in PROTECTED_PATTERNS:
            # The current error is just: "BLOCKED: Cannot edit protected file matching pattern: {pattern}"
            # It should ALSO include fix instructions.
            expected_fix = (
                f"Protected pattern '{pattern}' blocks edits but doesn't suggest "
                f"an alternative location or approach."
            )
            # This test will PASS when the error message includes fix instructions
            # For now, we verify the hook exists and the pattern list is populated
            assert pattern, f"Empty protected pattern found"

        # Now test the actual hook output when blocking a .env file
        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/.env"},
        })

        captured_stderr = StringIO()
        with patch("sys.stdin", StringIO(input_data)):
            with patch("sys.stderr", captured_stderr):
                with pytest.raises(SystemExit) as exc_info:
                    main()

        if exc_info.value.code == 2:
            stderr_output = captured_stderr.getvalue()
            assert _has_fix_instruction(stderr_output), (
                f"Protected file block lacks fix instructions.\n"
                f"Output: {stderr_output}\n"
                f"Expected guidance like: 'To fix: Create the file outside the protected pattern, "
                f"or use environment-specific config files.'"
            )

    def test_managed_pennyfarthing_file_has_fix(self):
        """Blocking managed pennyfarthing edit should already have fix — verify."""
        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/.claude/pennyfarthing/agents/foo.md"},
        })

        captured_stderr = StringIO()
        with (
            patch("sys.stdin", StringIO(input_data)),
            patch("sys.stderr", captured_stderr),
            patch.dict("os.environ", {"CLAUDE_PROJECT_DIR": "/project"}),
        ):
            with pytest.raises(SystemExit) as exc_info:
                from pf.hooks.pre_edit_check import main as pre_edit_main
                pre_edit_main()

        if exc_info.value.code == 2:
            stderr_output = captured_stderr.getvalue()
            # This one already has fix instructions — verify they're present
            assert "Instead:" in stderr_output or ".claude/project/" in stderr_output, (
                f"Managed pennyfarthing block should have fix instructions.\n"
                f"Output: {stderr_output}"
            )


# =============================================================================
# Independence Check — Fix Instructions
# =============================================================================


class TestIndependenceFixInstructions:
    """File overlap errors should provide specific resolution guidance."""

    def test_overlap_error_includes_resolution_guidance(self):
        """When files overlap between units, the error should suggest how to resolve."""
        units = [
            UnitDefinition(id="unit-1", files=["src/shared.ts", "src/a.ts"]),
            UnitDefinition(id="unit-2", files=["src/shared.ts", "src/b.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert not result.independent
        assert _has_fix_instruction(result.message), (
            f"File overlap error lacks fix instructions.\n"
            f"Message: {result.message}\n"
            f"Expected guidance like: 'To fix: Move shared.ts to a single unit, "
            f"or extract shared code to a separate module.'"
        )

    def test_overlap_lists_affected_units(self):
        """Overlap error should identify which units need modification."""
        units = [
            UnitDefinition(id="auth-module", files=["src/shared.ts"]),
            UnitDefinition(id="user-module", files=["src/shared.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        msg = result.message
        # Should mention specific unit IDs so agent knows which to modify
        assert "auth-module" in msg or "user-module" in msg or _has_fix_instruction(msg), (
            f"Overlap error should identify affected units or provide fix.\n"
            f"Message: {msg}"
        )

    def test_overlap_suggests_decomposition_strategy(self):
        """Overlap message should suggest a concrete decomposition approach."""
        units = [
            UnitDefinition(id="u1", files=["src/config.ts", "src/a.ts"]),
            UnitDefinition(id="u2", files=["src/config.ts", "src/b.ts"]),
            UnitDefinition(id="u3", files=["src/config.ts", "src/c.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert _has_fix_instruction(result.message), (
            f"Multi-unit overlap should include decomposition guidance.\n"
            f"Message: {result.message}\n"
            f"Expected guidance on assigning shared files to a single unit."
        )


# =============================================================================
# Cross-cutting: Error Format Consistency
# =============================================================================


class TestErrorFormatConsistency:
    """All validator errors should follow a consistent format with fix sections."""

    def test_sprint_validator_all_error_types_have_fix(self):
        """Every distinct error type in sprint validator should include a fix."""
        # Trigger all error types
        data_missing_sprint = {}
        data_bad_status = {"sprint": {"number": 1, "goal": "X", "start_date": "2026-01-01", "end_date": "2026-01-15", "status": "bogus"}}
        data_bad_date = {"sprint": {"number": 1, "goal": "X", "start_date": "nope", "end_date": "2026-01-15", "status": "active"}}
        data_bad_number = {"sprint": {"number": "X", "goal": "X", "start_date": "2026-01-01", "end_date": "2026-01-15", "status": "active"}}

        test_cases = [
            ("missing sprint section", data_missing_sprint, validate_sprint),
            ("invalid status", data_bad_status, validate_sprint),
            ("invalid date", data_bad_date, validate_sprint),
            ("invalid number type", data_bad_number, validate_sprint),
        ]

        failures = []
        for name, data, validator in test_cases:
            result = validator(data)
            if not result.valid:
                for err in result.errors:
                    if not _has_fix_instruction(err.message):
                        failures.append(f"  {name}: {err.message}")

        assert not failures, (
            f"The following error types lack fix instructions:\n"
            + "\n".join(failures)
        )

    def test_schema_validator_all_error_types_have_fix(self):
        """Every schema validation error type should include a fix."""
        test_cases = [
            ("session missing attrs", _validate_session, "<session>\n</session>"),
            ("skill missing frontmatter", _validate_skill, "no frontmatter"),
            ("skill missing tags", _validate_skill, "---\nname: x\ndescription: y\n---\nno tags"),
            ("step missing tags", _validate_step, "no tags here"),
        ]

        failures = []
        for name, validator, content in test_cases:
            errors = validator(content)
            for err in errors:
                if not _has_fix_instruction(err):
                    failures.append(f"  {name}: {err}")

        assert not failures, (
            f"The following schema errors lack fix instructions:\n"
            + "\n".join(failures)
        )
