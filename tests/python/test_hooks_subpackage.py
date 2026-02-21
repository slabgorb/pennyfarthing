"""
Tests for hooks/ subpackage — bash-to-Python migration.

Validates all 11 hook modules migrated from bash scripts to Python:
- session_start, session_stop, reflector_check, cyclist_pretooluse
- context_warning, context_breaker, pre_edit_check, schema_validation
- bell_mode, sprint_yaml_validation, statusline

Run with: python -m pytest tests/python/test_hooks_subpackage.py -v
"""

import json
import os
import re
import sys
import time
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project directory with .pennyfarthing and .session markers."""
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    (tmp_path / ".session" / "agents").mkdir()
    return tmp_path


@pytest.fixture()
def tmp_project_with_checkpoint(tmp_project):
    """Project with a checkpoint file."""
    checkpoint = tmp_project / ".session" / "checkpoints.log"
    checkpoint.write_text(
        "2026-02-15T10:00:00Z|session_state|agent=dev;story=86-3;phase=green;sha=abc1234;session=sess-1\n"
    )
    return tmp_project


@pytest.fixture()
def tmp_project_with_session(tmp_project):
    """Project with an active session file."""
    session_file = tmp_project / ".session" / "86-3-session.md"
    session_file.write_text(
        "# Session 86-3\n- Phase: green\n- Agent: dev\n- Story: 86-3\n"
    )
    (tmp_project / ".session" / "agents" / "test-session").write_text("dev")
    return tmp_project


# =============================================================================
# CLI Group Registration
# =============================================================================


class TestCLIGroup:
    """Verify the hooks CLI group is registered and has all commands."""

    def test_hooks_group_imports(self):
        from pf.hooks.cli import hooks
        assert hooks is not None
        assert hooks.name == "hooks"

    def test_all_commands_registered(self):
        from pf.hooks.cli import hooks
        command_names = sorted(hooks.list_commands(None))
        expected = sorted([
            "bell-mode", "context-breaker", "context-warning",
            "cyclist-pretooluse", "pre-edit-check", "reflector-check",
            "schema-validation", "session-start", "session-stop",
            "sprint-yaml", "statusline",
        ])
        assert command_names == expected

    def test_all_modules_import(self):
        """All 11 hook modules should import without errors."""
        from pf.hooks import (
            bell_mode,
            context_breaker,
            context_warning,
            cyclist_pretooluse,
            pre_edit_check,
            reflector_check,
            schema_validation,
            session_start,
            session_stop,
            sprint_yaml_validation,
            statusline,
        )
        # Each module should have a main() entry point
        for mod in [
            bell_mode, context_breaker, context_warning,
            cyclist_pretooluse, pre_edit_check, reflector_check,
            schema_validation, session_start, session_stop,
            sprint_yaml_validation, statusline,
        ]:
            assert hasattr(mod, "main"), f"{mod.__name__} missing main()"


# =============================================================================
# session_start
# =============================================================================


class TestSessionStart:
    """SessionStart hook — environment setup, checkpoint, welcome."""

    def test_setup_session_dir_creates_structure(self, tmp_project):
        from pf.hooks.session_start import _setup_session_dir
        _setup_session_dir(tmp_project, "sess-123", "CLI")

        assert (tmp_project / ".session").is_dir()
        assert (tmp_project / ".session" / "agents").is_dir()
        log = (tmp_project / ".session" / "session-log.txt").read_text()
        assert "sess-123" in log
        assert "CLI" in log

    def test_validate_checkpoint_no_file(self, tmp_project):
        """No checkpoint file should be a no-op."""
        from pf.hooks.session_start import _validate_checkpoint
        _validate_checkpoint(tmp_project)  # Should not raise

    def test_validate_checkpoint_detects_drift(self, tmp_project_with_checkpoint):
        """Should log drift when git SHA changes."""
        from pf.hooks.session_start import _validate_checkpoint

        with patch("pf.hooks.session_start.subprocess") as mock_sub:
            mock_result = MagicMock()
            mock_result.stdout = "def5678\n"
            mock_sub.run.return_value = mock_result
            _validate_checkpoint(tmp_project_with_checkpoint)

        drift_log = tmp_project_with_checkpoint / ".session" / "drift-log.txt"
        assert drift_log.exists()
        content = drift_log.read_text()
        assert "abc1234" in content
        assert "def5678" in content

    def test_validate_checkpoint_no_drift_same_sha(self, tmp_project_with_checkpoint):
        """Should not log drift when SHA is the same."""
        from pf.hooks.session_start import _validate_checkpoint

        with patch("pf.hooks.session_start.subprocess") as mock_sub:
            mock_result = MagicMock()
            mock_result.stdout = "abc1234\n"
            mock_sub.run.return_value = mock_result
            _validate_checkpoint(tmp_project_with_checkpoint)

        drift_log = tmp_project_with_checkpoint / ".session" / "drift-log.txt"
        assert not drift_log.exists()

    def test_get_project_name_from_package_json(self, tmp_project):
        from pf.hooks.session_start import _get_project_name
        (tmp_project / "package.json").write_text('{"name": "my-project"}')
        assert _get_project_name(tmp_project) == "my-project"

    def test_get_project_name_fallback_to_dir(self, tmp_project):
        from pf.hooks.session_start import _get_project_name
        name = _get_project_name(tmp_project)
        assert name == tmp_project.name

    def test_welcome_lock_prevents_double_display(self, tmp_project):
        from pf.hooks.session_start import _get_welcome_lock_path
        lock = _get_welcome_lock_path(tmp_project)
        assert ".welcome-shown-" in lock.name

    def test_write_env_file(self, tmp_project):
        from pf.hooks.session_start import _write_env_file
        env_file = tmp_project / ".session" / "claude-env"
        with patch.dict(os.environ, {"CLAUDE_ENV_FILE": str(env_file)}):
            _write_env_file(tmp_project, "sess-123", 7431)

        content = env_file.read_text()
        assert "PROJECT_ROOT" in content
        assert "SESSION_ID" in content
        assert "OTEL_EXPORTER_OTLP_ENDPOINT" in content
        assert "7431" in content

    def test_write_env_file_no_otel(self, tmp_project):
        from pf.hooks.session_start import _write_env_file
        env_file = tmp_project / ".session" / "claude-env"
        with patch.dict(os.environ, {"CLAUDE_ENV_FILE": str(env_file)}):
            _write_env_file(tmp_project, "sess-123", None)

        content = env_file.read_text()
        assert "PROJECT_ROOT" in content
        assert "OTEL_EXPORTER_OTLP_ENDPOINT" not in content


# =============================================================================
# session_stop
# =============================================================================


class TestSessionStop:
    """Session stop hook — checkpoint saving."""

    def test_checkpoint_save(self, tmp_project):
        from pf.hooks.session_stop import _checkpoint_save
        _checkpoint_save(tmp_project, "test_label", "key=value")

        log = (tmp_project / ".session" / "checkpoints.log").read_text()
        assert "test_label" in log
        assert "key=value" in log

    def test_checkpoint_save_creates_dir(self, tmp_path):
        from pf.hooks.session_stop import _checkpoint_save
        _checkpoint_save(tmp_path, "label", "data")
        assert (tmp_path / ".session" / "checkpoints.log").exists()

    def test_checkpoint_format_timestamp(self, tmp_project):
        from pf.hooks.session_stop import _checkpoint_save
        _checkpoint_save(tmp_project, "label", "data")

        line = (tmp_project / ".session" / "checkpoints.log").read_text().strip()
        # Format: timestamp|label|data
        parts = line.split("|")
        assert len(parts) == 3
        assert parts[1] == "label"
        assert parts[2] == "data"
        # Timestamp should be ISO format
        assert re.match(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', parts[0])

    def test_main_reads_session_file(self, tmp_project_with_session):
        """main() should extract story from session filename and phase from content."""
        from pf.hooks import session_stop

        input_data = json.dumps({"session_id": "test-session"})
        with patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(tmp_project_with_session)}):
            with patch("sys.stdin", StringIO(input_data)):
                with patch("pf.hooks.session_stop.subprocess") as mock_sub:
                    mock_result = MagicMock()
                    mock_result.stdout = "abc1234\n"
                    mock_sub.run.return_value = mock_result
                    mock_sub.TimeoutExpired = Exception

                    with pytest.raises(SystemExit) as exc_info:
                        session_stop.main()
                    assert exc_info.value.code == 0

        log = (tmp_project_with_session / ".session" / "checkpoints.log").read_text()
        assert "agent=dev" in log
        assert "story=86-3" in log
        assert "phase=green" in log


# =============================================================================
# reflector_check
# =============================================================================


class TestReflectorCheck:
    """Reflector marker enforcement hook (Stop hook)."""

    def test_has_reflector_marker_question(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert _has_reflector_marker("Do you want me to proceed? <!-- CYCLIST:QUESTION:yesno -->")
        assert _has_reflector_marker("What approach? <!-- CYCLIST:QUESTION:open -->")

    def test_has_reflector_marker_choices(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert _has_reflector_marker("<!-- CYCLIST:CHOICES:optA,optB -->")

    def test_has_reflector_marker_handoff(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert _has_reflector_marker("<!-- CYCLIST:HANDOFF:/dev -->")

    def test_has_reflector_marker_continue(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert _has_reflector_marker("Work complete. <!-- CYCLIST:CONTINUE -->")

    def test_has_reflector_marker_context_clear(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert _has_reflector_marker("<!-- CYCLIST:CONTEXT_CLEAR:/dev -->")

    def test_no_marker_detected(self):
        from pf.hooks.reflector_check import _has_reflector_marker
        assert not _has_reflector_marker("Just a regular message with no marker.")

    def test_detect_question_direct(self):
        from pf.hooks.reflector_check import _detect_question
        result = _detect_question("What do you think about this approach?")
        assert result["detected"] is True
        assert result["type"] == "direct"

    def test_detect_question_implicit(self):
        from pf.hooks.reflector_check import _detect_question
        # No trailing ? so direct question pattern doesn't match first
        result = _detect_question("Would you like me to proceed with this.")
        assert result["detected"] is True
        assert result["type"] == "implicit"

    def test_detect_question_choices(self):
        from pf.hooks.reflector_check import _detect_question
        result = _detect_question("We could choose between Option A or Option B.")
        assert result["detected"] is True
        assert result["type"] == "choices"

    def test_detect_question_rhetorical_skipped(self):
        from pf.hooks.reflector_check import _detect_question
        result = _detect_question("The question was whether to proceed.")
        assert result["detected"] is False

    def test_detect_question_no_question(self):
        from pf.hooks.reflector_check import _detect_question
        result = _detect_question("I have completed the implementation.")
        assert result["detected"] is False

    def test_detect_handoff_phrase(self):
        from pf.hooks.reflector_check import _detect_handoff_phrase
        assert _detect_handoff_phrase("I'm handing off to the Dev agent now.")
        assert _detect_handoff_phrase("Passing to TEA for test writing.")
        assert not _detect_handoff_phrase("I fixed the bug and committed.")

    def test_strip_code_blocks(self):
        from pf.hooks.reflector_check import _strip_code_blocks
        text = "Here is code:\n```python\nwould you like?\n```\nDone."
        result = _strip_code_blocks(text)
        assert "would you like" not in result
        assert "Done." in result

    def test_build_block_reason_direct_question(self):
        from pf.hooks.reflector_check import _build_block_reason
        reason = _build_block_reason("direct")
        assert "CYCLIST:QUESTION:open" in reason

    def test_build_block_reason_handoff_violation(self):
        from pf.hooks.reflector_check import _build_block_reason
        reason = _build_block_reason("", handoff_without_task=True)
        assert "HANDOFF COMPLIANCE VIOLATION" in reason

    def test_build_block_reason_no_question(self):
        from pf.hooks.reflector_check import _build_block_reason
        reason = _build_block_reason("")
        assert "CYCLIST:CONTINUE" in reason

    def test_should_skip_enforcement_in_cli(self):
        from pf.hooks.reflector_check import _should_skip_enforcement
        with patch.dict(os.environ, {}, clear=True):
            assert _should_skip_enforcement() is True

    def test_should_not_skip_in_cyclist(self):
        from pf.hooks.reflector_check import _should_skip_enforcement
        with patch.dict(os.environ, {"CYCLIST": "1"}):
            assert _should_skip_enforcement() is False


# =============================================================================
# pre_edit_check
# =============================================================================


class TestPreEditCheck:
    """Pre-edit check hook — protected file patterns."""

    def test_protected_patterns_defined(self):
        from pf.hooks.pre_edit_check import PROTECTED_PATTERNS
        assert "*.env" in PROTECTED_PATTERNS
        assert "*.pem" in PROTECTED_PATTERNS
        assert "*.key" in PROTECTED_PATTERNS
        assert ".git/*" in PROTECTED_PATTERNS
        assert "node_modules/*" in PROTECTED_PATTERNS

    def test_blocks_env_file(self):
        """Should exit 2 for .env files."""
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/.env"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 2

    def test_blocks_pem_file(self):
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/cert.pem"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 2

    def test_blocks_credentials_file(self):
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/credentials.json"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 2

    def test_blocks_node_modules(self):
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "node_modules/foo/index.js"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 2

    def test_allows_normal_file(self):
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/src/app.ts"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 0

    def test_allows_empty_path(self):
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                pre_edit_check.main()
            assert exc_info.value.code == 0

    def test_blocks_managed_pennyfarthing_in_consumer(self):
        """Should block edits to .claude/pennyfarthing/ in consumer projects."""
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/.claude/pennyfarthing/agents/sm.md"},
        })
        with patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": "/project"}):
            with patch("sys.stdin", StringIO(input_data)):
                with pytest.raises(SystemExit) as exc_info:
                    pre_edit_check.main()
                assert exc_info.value.code == 2

    def test_allows_managed_pennyfarthing_in_library(self, tmp_path):
        """Should allow edits in the pennyfarthing library itself."""
        from pf.hooks import pre_edit_check

        # Simulate pennyfarthing library project
        (tmp_path / "pennyfarthing-dist").mkdir()

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": f"{tmp_path}/.claude/pennyfarthing/agents/sm.md"},
        })
        with patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(tmp_path)}):
            with patch("sys.stdin", StringIO(input_data)):
                with pytest.raises(SystemExit) as exc_info:
                    pre_edit_check.main()
                assert exc_info.value.code == 0


# =============================================================================
# context_warning
# =============================================================================


class TestContextWarning:
    """Context warning hook — always exits 0, warns on high usage."""

    def test_exits_zero_on_error(self):
        """Should always exit 0, even when context check fails."""
        from pf.hooks import context_warning

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_warning.check_context") as mock:
                mock.return_value = MagicMock(error="no transcript", usable_percent=0)
                with pytest.raises(SystemExit) as exc_info:
                    context_warning.main()
                assert exc_info.value.code == 0

    def test_prints_warning_at_warning_threshold(self, capsys):
        """Should print warning when context is above warning threshold."""
        from pf.hooks import context_warning

        mock_result = MagicMock(error=None, usable_percent=65)
        mock_config = MagicMock(warning_threshold=60, critical_threshold=85)

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_warning.check_context", return_value=mock_result):
                with patch("pf.hooks.context_warning.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit):
                        context_warning.main()

        captured = capsys.readouterr()
        assert "CONTEXT WARNING: 65%" in captured.out

    def test_prints_critical_at_critical_threshold(self, capsys):
        """Should print CRITICAL when above critical threshold."""
        from pf.hooks import context_warning

        mock_result = MagicMock(error=None, usable_percent=90)
        mock_config = MagicMock(warning_threshold=60, critical_threshold=85)

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_warning.check_context", return_value=mock_result):
                with patch("pf.hooks.context_warning.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit):
                        context_warning.main()

        captured = capsys.readouterr()
        assert "CRITICAL" in captured.out

    def test_no_output_below_threshold(self, capsys):
        """Should not print anything when context is below warning threshold."""
        from pf.hooks import context_warning

        mock_result = MagicMock(error=None, usable_percent=30)
        mock_config = MagicMock(warning_threshold=60, critical_threshold=85)

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_warning.check_context", return_value=mock_result):
                with patch("pf.hooks.context_warning.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit):
                        context_warning.main()

        captured = capsys.readouterr()
        assert "CONTEXT WARNING" not in captured.out


# =============================================================================
# context_breaker
# =============================================================================


class TestContextBreaker:
    """Context circuit breaker — exits 2 to block at critical threshold."""

    def test_exits_zero_below_threshold(self):
        from pf.hooks import context_breaker

        mock_result = MagicMock(error=None, usable_percent=50)
        mock_config = MagicMock(critical_threshold=85)

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_breaker.check_context", return_value=mock_result):
                with patch("pf.hooks.context_breaker.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit) as exc_info:
                        context_breaker.main()
                    assert exc_info.value.code == 0

    def test_exits_two_above_threshold(self):
        from pf.hooks import context_breaker

        mock_result = MagicMock(error=None, usable_percent=90)
        mock_config = MagicMock(critical_threshold=85)

        with patch("sys.stdin", StringIO('{"session_id": "test"}')):
            with patch("pf.hooks.context_breaker.check_context", return_value=mock_result):
                with patch("pf.hooks.context_breaker.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit) as exc_info:
                        context_breaker.main()
                    assert exc_info.value.code == 2

    def test_saves_checkpoint_on_break(self, tmp_project):
        from pf.hooks import context_breaker

        # Set up agent file
        (tmp_project / ".session" / "agents" / "test-sess").write_text("dev")

        mock_result = MagicMock(error=None, usable_percent=90)
        mock_config = MagicMock(critical_threshold=85)

        with patch("sys.stdin", StringIO('{"session_id": "test-sess"}')):
            with patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(tmp_project)}):
                with patch("pf.hooks.context_breaker.check_context", return_value=mock_result):
                    with patch("pf.hooks.context_breaker.load_config", return_value=mock_config):
                        with pytest.raises(SystemExit):
                            context_breaker.main()

        log = (tmp_project / ".session" / "checkpoints.log").read_text()
        assert "circuit_breaker_agent" in log
        assert "dev" in log

    def test_exits_zero_on_context_error(self):
        from pf.hooks import context_breaker

        mock_result = MagicMock(error="no transcript")
        mock_config = MagicMock(critical_threshold=85)

        with patch("sys.stdin", StringIO("{}")):
            with patch("pf.hooks.context_breaker.check_context", return_value=mock_result):
                with patch("pf.hooks.context_breaker.load_config", return_value=mock_config):
                    with pytest.raises(SystemExit) as exc_info:
                        context_breaker.main()
                    assert exc_info.value.code == 0


# =============================================================================
# schema_validation
# =============================================================================


class TestSchemaValidation:
    """Schema validation hook — validate session/skill/step files."""

    def test_file_type_detection_session(self):
        from pf.hooks.schema_validation import _get_file_type
        assert _get_file_type("/project/.session/86-3-session.md") == "session"

    def test_file_type_detection_skill(self):
        from pf.hooks.schema_validation import _get_file_type
        assert _get_file_type("/project/skills/my-skill/SKILL.md") == "skill"

    def test_file_type_detection_step(self):
        from pf.hooks.schema_validation import _get_file_type
        assert _get_file_type("/project/workflows/tdd/steps/step-01.md") == "step"

    def test_file_type_detection_other(self):
        from pf.hooks.schema_validation import _get_file_type
        assert _get_file_type("/project/src/app.ts") is None
        assert _get_file_type("/project/README.md") is None

    def test_validate_session_missing_story(self):
        from pf.hooks.schema_validation import _validate_session
        errors = _validate_session('<session>\n<meta><jira>X</jira><started>Y</started></meta>\n<status phase="green"/>\n</session>')
        assert any("story" in e.lower() for e in errors)

    def test_validate_session_valid(self):
        from pf.hooks.schema_validation import _validate_session
        content = '<session story="86-3" workflow="tdd">\n<meta><jira>PF-100</jira><started>2026-01-01</started></meta>\n<status phase="green"/>\n</session>'
        errors = _validate_session(content)
        assert errors == []

    def test_validate_session_old_format_not_blocked(self):
        from pf.hooks.schema_validation import _validate_session
        errors = _validate_session("# Session 86-3\n- Phase: green\n")
        assert errors == []  # Old markdown format not blocked

    def test_validate_skill_missing_frontmatter(self):
        from pf.hooks.schema_validation import _validate_skill
        errors = _validate_skill("# My Skill\n<run>do stuff</run>\n<output>result</output>")
        assert any("frontmatter" in e.lower() for e in errors)

    def test_validate_skill_missing_tags(self):
        from pf.hooks.schema_validation import _validate_skill
        errors = _validate_skill("---\nname: test\ndescription: desc\n---\n# Skill")
        assert any("<run>" in e for e in errors)
        assert any("<output>" in e for e in errors)

    def test_validate_skill_valid(self):
        from pf.hooks.schema_validation import _validate_skill
        content = "---\nname: test\ndescription: desc\n---\n<run>stuff</run>\n<output>result</output>"
        errors = _validate_skill(content)
        assert errors == []

    def test_validate_step_missing_tags(self):
        from pf.hooks.schema_validation import _validate_step
        errors = _validate_step("# Step 1\nDo stuff.")
        assert any("<purpose>" in e for e in errors)
        assert any("<instructions>" in e for e in errors)
        assert any("<output>" in e for e in errors)

    def test_validate_step_valid(self):
        from pf.hooks.schema_validation import _validate_step
        content = "<purpose>Do X</purpose>\n<instructions>How</instructions>\n<output>Result</output>"
        errors = _validate_step(content)
        assert errors == []

    def test_main_allows_non_write(self):
        from pf.hooks import schema_validation

        input_data = json.dumps({"tool_name": "Read", "tool_input": {}})
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                schema_validation.main()
            assert exc_info.value.code == 0

    def test_main_denies_invalid_session(self, capsys):
        from pf.hooks import schema_validation

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {
                "file_path": "/project/.session/86-3-session.md",
                "content": '<session>\n</session>',
            },
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                schema_validation.main()
            assert exc_info.value.code == 0  # Exits 0 but outputs deny


# =============================================================================
# bell_mode
# =============================================================================


class TestBellMode:
    """Bell mode + tandem injection hook."""

    def test_read_bell_queue_empty(self, tmp_project):
        from pf.hooks.bell_mode import _read_bell_queue
        assert _read_bell_queue(tmp_project) == []

    def test_read_bell_queue_with_messages(self, tmp_project):
        from pf.hooks.bell_mode import _read_bell_queue
        queue_path = tmp_project / ".pennyfarthing" / "bell-queue.json"
        queue_path.write_text(json.dumps([{"text": "hello"}]))
        result = _read_bell_queue(tmp_project)
        assert len(result) == 1
        assert result[0]["text"] == "hello"

    def test_dequeue_message(self, tmp_project):
        from pf.hooks.bell_mode import _dequeue_message, _read_bell_queue
        queue_path = tmp_project / ".pennyfarthing" / "bell-queue.json"
        queue_path.write_text(json.dumps([{"text": "first"}, {"text": "second"}]))

        _dequeue_message(tmp_project)
        remaining = _read_bell_queue(tmp_project)
        assert len(remaining) == 1
        assert remaining[0]["text"] == "second"

    def test_tandem_observation_detection(self, tmp_project):
        from pf.hooks.bell_mode import _read_tandem_observations
        (tmp_project / ".session" / "86-3-tandem-reviewer.md").write_text("# obs")
        files = _read_tandem_observations(tmp_project)
        assert len(files) == 1

    def test_tandem_observation_empty_session(self, tmp_project):
        from pf.hooks.bell_mode import _read_tandem_observations
        files = _read_tandem_observations(tmp_project)
        assert files == []

    def test_get_latest_observation(self):
        from pf.hooks.bell_mode import _get_latest_observation
        content = (
            "# Tandem Observations\n"
            "**Observer:** reviewer (The Queen)\n\n---\n\n"
            "## [14:00] Observation\n**Trigger:** edit\nFirst obs\n\n---\n\n"
            "## [14:05] Observation\n**Trigger:** edit\nSecond obs\n\n---\n"
        )
        obs = _get_latest_observation(content)
        assert obs is not None
        assert obs["persona"] == "The Queen"
        assert "Second obs" in obs["text"]

    def test_get_latest_observation_empty(self):
        from pf.hooks.bell_mode import _get_latest_observation
        content = "# Header only\n**Observer:** tea (Caterpillar)\n\n---\n"
        obs = _get_latest_observation(content)
        assert obs is None

    def test_tandem_mtime_roundtrip(self, tmp_project):
        from pf.hooks.bell_mode import _get_tandem_mtime, _save_tandem_mtime
        _save_tandem_mtime(tmp_project, "reviewer", 12345.678)
        result = _get_tandem_mtime(tmp_project, "reviewer")
        assert result == pytest.approx(12345.678)

    def test_tandem_mtime_default(self, tmp_project):
        from pf.hooks.bell_mode import _get_tandem_mtime
        assert _get_tandem_mtime(tmp_project, "nobody") == 0.0

    def test_check_tandem_files_detects_new(self, tmp_project):
        from pf.hooks.bell_mode import _check_tandem_files
        obs_file = tmp_project / ".session" / "86-3-tandem-reviewer.md"
        obs_file.write_text(
            "# Obs\n**Observer:** reviewer (Queen)\n\n---\n\n"
            "## [14:00] Observation\n**Trigger:** edit\nSomething notable\n\n---\n"
        )
        results = _check_tandem_files(tmp_project)
        assert len(results) == 1
        assert "[Tandem]" in results[0]["message"]
        assert "Queen" in results[0]["message"]

    def test_check_tandem_files_skips_seen(self, tmp_project):
        from pf.hooks.bell_mode import _check_tandem_files, _save_tandem_mtime
        obs_file = tmp_project / ".session" / "86-3-tandem-reviewer.md"
        obs_file.write_text(
            "# Obs\n**Observer:** reviewer (Queen)\n\n---\n\n"
            "## [14:00] Observation\n**Trigger:** edit\nSomething\n\n---\n"
        )
        _save_tandem_mtime(tmp_project, "reviewer", obs_file.stat().st_mtime)

        results = _check_tandem_files(tmp_project)
        assert len(results) == 0


# =============================================================================
# sprint_yaml_validation
# =============================================================================


class TestSprintYamlValidation:
    """Sprint YAML validation hook — validates YAML 1.2 via Node."""

    def test_ignores_non_edit_write(self):
        from pf.hooks import sprint_yaml_validation

        input_data = json.dumps({"tool_name": "Read", "tool_input": {}})
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                sprint_yaml_validation.main()
            assert exc_info.value.code == 0

    def test_ignores_non_sprint_files(self):
        from pf.hooks import sprint_yaml_validation

        input_data = json.dumps({
            "tool_name": "Edit",
            "tool_input": {"file_path": "/project/src/app.ts"},
        })
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit) as exc_info:
                sprint_yaml_validation.main()
            assert exc_info.value.code == 0

    def test_matches_sprint_yaml_pattern(self):
        """Should match sprint YAML file paths."""
        assert re.search(r'sprint/.*\.(yaml|yml)$', '/project/sprint/current-sprint.yaml')
        assert re.search(r'sprint/.*\.(yaml|yml)$', '/project/sprint/epic-86.yml')
        assert not re.search(r'sprint/.*\.(yaml|yml)$', '/project/src/config.yaml')


# =============================================================================
# cyclist_pretooluse
# =============================================================================


class TestCyclistPretooluse:
    """Cyclist PreToolUse hook — route approval through WheelHub."""

    def test_resolve_agent_from_session_file(self, tmp_project):
        from pf.hooks.cyclist_pretooluse import _resolve_agent
        (tmp_project / ".session" / "agents" / "sess-1").write_text("dev")
        agent = _resolve_agent("sess-1", tmp_project)
        assert agent == "dev"

    def test_resolve_agent_fallback_to_latest(self, tmp_project):
        from pf.hooks.cyclist_pretooluse import _resolve_agent
        # Create two agent files with different mtimes
        f1 = tmp_project / ".session" / "agents" / "sess-old"
        f1.write_text("sm")
        time.sleep(0.01)
        f2 = tmp_project / ".session" / "agents" / "sess-new"
        f2.write_text("dev")

        agent = _resolve_agent("nonexistent", tmp_project)
        assert agent == "dev"

    def test_resolve_agent_no_agents(self, tmp_project):
        from pf.hooks.cyclist_pretooluse import _resolve_agent
        agent = _resolve_agent("sess-1", tmp_project)
        assert agent is None

    def test_exits_zero_when_cyclist_not_running(self):
        from pf.hooks import cyclist_pretooluse

        with patch("sys.stdin", StringIO('{"tool_name": "Bash"}')):
            with patch("pf.hooks.cyclist_pretooluse.is_cyclist_running", return_value=False):
                with patch("pf.hooks.cyclist_pretooluse.find_project_root", return_value=None):
                    with pytest.raises(SystemExit) as exc_info:
                        cyclist_pretooluse.main()
                    assert exc_info.value.code == 0


# =============================================================================
# statusline
# =============================================================================


class TestStatusline:
    """Statusline hook — render Claude Code status bar."""

    def test_get_model_name_string(self):
        from pf.hooks.statusline import _get_model_name
        assert _get_model_name({"model": "claude-opus-4-6"}) == "opus-4"

    def test_get_model_name_dict(self):
        from pf.hooks.statusline import _get_model_name
        assert _get_model_name({"model": {"id": "claude-sonnet-4-5"}}) == "sonnet-4"

    def test_get_model_name_fallback(self):
        from pf.hooks.statusline import _get_model_name
        assert _get_model_name({}) == "claude"
        assert _get_model_name({"model": None}) == "claude"
        assert _get_model_name({"model": "null"}) == "claude"

    def test_get_model_name_truncates(self):
        from pf.hooks.statusline import _get_model_name
        result = _get_model_name({"model": "claude-very-long-model-name"})
        assert len(result) <= 10

    def test_get_context_pct_valid(self):
        from pf.hooks.statusline import _get_context_pct
        data = {
            "context_window": {
                "current_usage": {"input_tokens": 50000},
                "context_window_size": 200000,
            }
        }
        assert _get_context_pct(data) == 25

    def test_get_context_pct_with_cache(self):
        from pf.hooks.statusline import _get_context_pct
        data = {
            "context_window": {
                "current_usage": {
                    "input_tokens": 10000,
                    "cache_creation_input_tokens": 20000,
                    "cache_read_input_tokens": 20000,
                },
                "context_window_size": 200000,
            }
        }
        assert _get_context_pct(data) == 25

    def test_get_context_pct_no_usage(self):
        from pf.hooks.statusline import _get_context_pct
        assert _get_context_pct({}) == "--"
        assert _get_context_pct({"context_window": {}}) == "--"

    def test_clean_character_name_parenthetical(self):
        from pf.hooks.statusline import _clean_character_name
        assert _clean_character_name("Breq (Justice of Toren)") == "Breq"

    def test_clean_character_name_title(self):
        from pf.hooks.statusline import _clean_character_name
        assert _clean_character_name("Captain Kirk") == "Kirk"
        assert _clean_character_name("Dr. McCoy") == "McCoy"

    def test_clean_character_name_single_word(self):
        from pf.hooks.statusline import _clean_character_name
        assert _clean_character_name("Spock") == "Spock"

    def test_clean_character_name_last_name(self):
        from pf.hooks.statusline import _clean_character_name
        assert _clean_character_name("James Holden") == "Holden"

    def test_agent_abbrevs_all_defined(self):
        from pf.hooks.statusline import AGENT_ABBREVS
        expected_agents = ["pm", "sm", "dev", "tea", "reviewer", "architect", "devops", "ux-designer", "tech-writer", "orchestrator", "ba"]
        for agent in expected_agents:
            assert agent in AGENT_ABBREVS, f"Missing abbreviation for {agent}"

    def test_agent_colors_all_defined(self):
        from pf.hooks.statusline import AGENT_COLORS
        expected_agents = ["pm", "sm", "dev", "tea", "reviewer", "architect", "devops", "ux-designer", "tech-writer", "orchestrator", "ba"]
        for agent in expected_agents:
            assert agent in AGENT_COLORS, f"Missing color for {agent}"

    def test_get_agent_abbrev_known(self):
        from pf.hooks.statusline import _get_agent_abbrev
        assert _get_agent_abbrev("dev") == "DEV"
        assert _get_agent_abbrev("sm") == "SM"
        assert _get_agent_abbrev("reviewer") == "REV"

    def test_get_agent_abbrev_unknown(self):
        from pf.hooks.statusline import _get_agent_abbrev
        assert _get_agent_abbrev("unknown") == "???"

    def test_build_progress_bar_low(self):
        from pf.hooks.statusline import FG_GREEN, _build_progress_bar
        bar, pct_str = _build_progress_bar(25)
        assert FG_GREEN in bar
        assert "25%" in pct_str

    def test_build_progress_bar_high(self):
        from pf.hooks.statusline import FG_YELLOW, _build_progress_bar
        bar, pct_str = _build_progress_bar(75)
        assert FG_YELLOW in bar

    def test_build_progress_bar_critical(self):
        from pf.hooks.statusline import FG_RED, _build_progress_bar
        bar, pct_str = _build_progress_bar(90)
        assert FG_RED in bar

    def test_build_progress_bar_unknown(self):
        from pf.hooks.statusline import FG_GRAY, _build_progress_bar
        bar, pct_str = _build_progress_bar("--")
        assert FG_GRAY in pct_str
        assert "--%" in pct_str

    def test_resolve_agent_from_session_id(self, tmp_project):
        from pf.hooks.statusline import _resolve_agent
        (tmp_project / ".session" / "agents" / "sess-1").write_text("dev")
        assert _resolve_agent(str(tmp_project), "sess-1") == "dev"

    def test_resolve_agent_fallback(self, tmp_project):
        from pf.hooks.statusline import _resolve_agent
        (tmp_project / ".session" / "agents" / "sess-1").write_text("sm")
        assert _resolve_agent(str(tmp_project), "nonexistent") == "sm"

    def test_resolve_agent_none(self, tmp_project):
        from pf.hooks.statusline import _resolve_agent
        assert _resolve_agent(str(tmp_project), "") == ""

    def test_main_invalid_input(self, capsys):
        from pf.hooks import statusline
        with patch("sys.stdin", StringIO("")):
            with pytest.raises(SystemExit) as exc_info:
                statusline.main()
            assert exc_info.value.code == 0
        captured = capsys.readouterr()
        assert "invalid input" in captured.out

    def test_parse_input_invalid_json(self):
        from pf.hooks.statusline import _parse_input
        with patch("sys.stdin", StringIO("not json")):
            assert _parse_input() == {}

    def test_parse_input_non_dict(self):
        from pf.hooks.statusline import _parse_input
        with patch("sys.stdin", StringIO("[1,2,3]")):
            assert _parse_input() == {}


# =============================================================================
# Performance
# =============================================================================


class TestPerformance:
    """Hook modules should import and execute quickly."""

    def test_import_time(self):
        """All hook modules should import in under 500ms total."""
        start = time.perf_counter()
        elapsed = time.perf_counter() - start
        assert elapsed < 2.0, f"Hook module imports took {elapsed:.3f}s, should be < 2s"

    def test_pre_edit_check_fast_path(self):
        """Pre-edit check with allowed file should be fast."""
        from pf.hooks import pre_edit_check

        input_data = json.dumps({
            "tool_name": "Write",
            "tool_input": {"file_path": "/project/src/app.ts"},
        })
        start = time.perf_counter()
        with patch("sys.stdin", StringIO(input_data)):
            with pytest.raises(SystemExit):
                pre_edit_check.main()
        elapsed = time.perf_counter() - start
        assert elapsed < 0.1, f"Pre-edit check took {elapsed:.3f}s, should be < 0.1s"
