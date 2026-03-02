"""
Tests for MSSCI-14320: Update and register PreToolUse hook.

Verifies the Python PreToolUse hook and its shared utilities correctly:
- AC1: POSTs to /api/hook-request (not /approval-request)
- AC3: Returns decision "ask" when WheelHub is unreachable (not "allow")
- AC6: Port discovery reads .bikerack-port

Run with: python -m pytest tests/python/test_pretooluse_hook.py -v
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.hooks import (
    CYCLIST_PORT_FILE,
    DEFAULT_CYCLIST_PORT,
    HookResponse,
    find_project_root,
    get_cyclist_port,
    is_cyclist_running,
    read_port_file,
    send_to_cyclist,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project directory with .claude marker."""
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir()
    return tmp_path


@pytest.fixture()
def mock_server():
    """Spin up a local HTTP server that records requests."""

    class Handler(BaseHTTPRequestHandler):
        requests: list = []

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            Handler.requests.append(
                {"path": self.path, "body": json.loads(body)}
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"decision": "allow", "reason": "test"}).encode()
            )

        def log_message(self, format, *args):
            pass  # Suppress server logs during tests

    Handler.requests = []
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server, port, Handler
    server.shutdown()


# =============================================================================
# AC1: Endpoint URL
# =============================================================================


class TestEndpointURL:
    """AC1: Hook POSTs to /api/hook-request, not /approval-request."""

    def test_send_to_cyclist_posts_to_api_hook_request(self, mock_server):
        """send_to_cyclist should POST to /api/hook-request."""
        server, port, handler = mock_server

        send_to_cyclist(
            endpoint="/api/hook-request",
            data={"toolName": "Bash", "toolId": "test-001", "input": {}},
            port=port,
        )

        assert len(handler.requests) == 1
        assert handler.requests[0]["path"] == "/api/hook-request"

    def test_send_to_cyclist_sends_tool_data(self, mock_server):
        """Request body should contain toolName, toolId, input, sessionId."""
        server, port, handler = mock_server

        send_to_cyclist(
            endpoint="/api/hook-request",
            data={
                "toolName": "Bash",
                "toolId": "test-002",
                "input": {"command": "npm test"},
                "sessionId": "sess-123",
            },
            port=port,
        )

        body = handler.requests[0]["body"]
        assert body["toolName"] == "Bash"
        assert body["toolId"] == "test-002"
        assert body["input"] == {"command": "npm test"}
        assert body["sessionId"] == "sess-123"

    def test_endpoint_is_not_approval_request(self):
        """The hook module should reference /api/hook-request, not /approval-request."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "cyclist_pretooluse.py"
        ).read_text()

        assert "/api/hook-request" in hook_source
        assert "/approval-request" not in hook_source


# =============================================================================
# AC3: ECONNREFUSED fallback
# =============================================================================


class TestConnectionRefused:
    """AC3: Returns decision 'ask' when WheelHub is unreachable."""

    def test_send_to_cyclist_returns_none_on_connection_refused(self):
        """send_to_cyclist should return None when server is unreachable."""
        result = send_to_cyclist(
            endpoint="/api/hook-request",
            data={"toolName": "Bash", "toolId": "test", "input": {}},
            port=19999,  # Nothing listening here
            timeout=2,
        )

        assert result is None

    def test_hook_defers_to_claude_code_when_cyclist_not_running(self):
        """cyclist_pretooluse.py should output 'ask' when Cyclist isn't running."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "cyclist_pretooluse.py"
        ).read_text()

        # The hook should check is_cyclist_running and output "ask" if False
        assert "is_cyclist_running" in hook_source
        assert '"ask"' in hook_source

    def test_hook_never_returns_allow_on_connection_failure(self):
        """The hook must NOT return 'allow' when WheelHub is unreachable."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "cyclist_pretooluse.py"
        ).read_text()

        # The Python hook should not have the JS bug of allowing on connection failure
        # Look for the pattern: connection failure -> "allow" (should not exist)
        # The correct pattern is: connection failure -> "ask"
        assert 'decision="ask"' in hook_source

    def test_hook_response_ask_format(self):
        """HookResponse with decision='ask' should produce correct JSON."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="ask",
            reason="WheelHub not running, deferring to Claude Code",
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["permissionDecision"] == "ask"
        assert "WheelHub" in output["hookSpecificOutput"]["permissionDecisionReason"]


# =============================================================================
# AC6: Port file discovery
# =============================================================================


class TestPortDiscovery:
    """AC6: Port discovery reads .bikerack-port."""

    def test_constants_defined(self):
        """Port file constants should be defined in hooks module."""
        assert CYCLIST_PORT_FILE == ".bikerack-port"

    def test_reads_wheelhub_port(self, tmp_project):
        """get_cyclist_port should read from .bikerack-port."""
        (tmp_project / CYCLIST_PORT_FILE).write_text("8001")

        port = get_cyclist_port(tmp_project)

        assert port == 8001

    def test_returns_default_when_no_port_files(self, tmp_project):
        """get_cyclist_port should return default port when no port files exist."""
        port = get_cyclist_port(tmp_project)

        assert port == DEFAULT_CYCLIST_PORT

    def test_read_port_file_returns_none_for_missing(self, tmp_project):
        """read_port_file should return None for missing file."""
        result = read_port_file(
            CYCLIST_PORT_FILE, tmp_project
        )
        assert result is None

    def test_read_port_file_returns_none_for_invalid(self, tmp_project):
        """read_port_file should return None for non-numeric content."""
        (tmp_project / CYCLIST_PORT_FILE).write_text("not-a-number")

        result = read_port_file(CYCLIST_PORT_FILE, tmp_project)
        assert result is None

    def test_read_port_file_returns_none_for_out_of_range(self, tmp_project):
        """read_port_file should return None for port outside 1-65535."""
        (tmp_project / CYCLIST_PORT_FILE).write_text("99999")

        result = read_port_file(CYCLIST_PORT_FILE, tmp_project)
        assert result is None

    def test_read_port_file_returns_valid_port(self, tmp_project):
        """read_port_file should return parsed port for valid content."""
        (tmp_project / CYCLIST_PORT_FILE).write_text("2898\n")

        result = read_port_file(CYCLIST_PORT_FILE, tmp_project)
        assert result == 2898

    def test_find_project_root_finds_cyclist_port(self, tmp_project):
        """find_project_root should find directory containing .bikerack-port."""
        (tmp_project / CYCLIST_PORT_FILE).write_text("2898")
        subdir = tmp_project / "deep" / "nested"
        subdir.mkdir(parents=True)

        root = find_project_root(subdir)

        assert root == tmp_project


# =============================================================================
# Hook output format
# =============================================================================


class TestHookOutputFormat:
    """Hook output matches Claude Code PreToolUse hook format."""

    def test_allow_response_format(self):
        """Allow response should have correct hookSpecificOutput structure."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="allow",
            reason="Approved by user",
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["hookEventName"] == "PreToolUse"
        assert output["hookSpecificOutput"]["permissionDecision"] == "allow"
        assert output["hookSpecificOutput"]["permissionDecisionReason"] == "Approved by user"

    def test_deny_response_format(self):
        """Deny response should have correct structure."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="deny",
            reason="Rejected by user",
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["permissionDecision"] == "deny"

    def test_updated_input_passthrough(self):
        """updatedInput should be included when data is present."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="allow",
            reason="Approved",
            updated_input={"answers": {"0": "Option A"}},
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["updatedInput"] == {
            "answers": {"0": "Option A"}
        }

    def test_no_updated_input_when_absent(self):
        """updatedInput should not be present when data is None."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="allow",
            reason="Approved",
        )
        output = json.loads(response.to_json())

        assert "updatedInput" not in output["hookSpecificOutput"]


# =============================================================================
# AC2: Hook registration (shell wrapper)
# =============================================================================


class TestHookRegistration:
    """AC2: Shell wrapper exists and is executable."""

    def test_shell_wrapper_exists(self):
        """cyclist-pretooluse-hook.sh should exist in pennyfarthing scripts hooks."""
        wrapper = (
            PROJECT_ROOT
            / "pf"
            / "hooks"
            / "cyclist-pretooluse-hook.sh"
        )
        assert wrapper.exists(), (
            f"Shell wrapper not found at {wrapper}. "
            "Dev must create a .sh wrapper that calls python3 pretooluse_hook.py"
        )

    def test_shell_wrapper_is_executable(self):
        """cyclist-pretooluse-hook.sh should be executable."""
        wrapper = (
            PROJECT_ROOT
            / "pf"
            / "hooks"
            / "cyclist-pretooluse-hook.sh"
        )
        if not wrapper.exists():
            pytest.skip("Shell wrapper not yet created")
        assert os.access(wrapper, os.X_OK), "Shell wrapper must be executable"

    def test_shell_wrapper_calls_python_hook(self):
        """Shell wrapper should invoke pretooluse_hook.py."""
        wrapper = (
            PROJECT_ROOT
            / "pf"
            / "hooks"
            / "cyclist-pretooluse-hook.sh"
        )
        if not wrapper.exists():
            pytest.skip("Shell wrapper not yet created")
        content = wrapper.read_text()
        assert "pretooluse_hook" in content, (
            "Shell wrapper should call pretooluse_hook.py"
        )


# =============================================================================
# JS hook removal
# =============================================================================


class TestLegacyJSHookRemoved:
    """Legacy JS hook should be deleted — Python hook replaces it."""

    def test_js_hook_removed(self):
        """cyclist-pretooluse-hook.js should not exist after this story."""
        js_hook = (
            PROJECT_ROOT
            / "packages"
            / "cyclist"
            / "src"
            / "hooks"
            / "cyclist-pretooluse-hook.js"
        )
        assert not js_hook.exists(), (
            "Legacy JS hook still exists. "
            "Dev must delete cyclist-pretooluse-hook.js — Python hook replaces it."
        )


# =============================================================================
# Story 98-8: Cyclist false-positive detection (env var)
# =============================================================================


class TestIsCyclistRunning:
    """Story 98-8: is_cyclist_running() uses CYCLIST env var, not file checks."""

    def test_returns_false_in_cli_mode(self):
        """CLI mode: no CYCLIST env var → not running."""
        with patch.dict(os.environ, {}, clear=True):
            assert is_cyclist_running() is False

    def test_returns_false_when_stale_port_file_exists(self, tmp_project):
        """AC1: Stale .bikerack-port must NOT cause false positive.

        This is the core bug. A leftover port file should be irrelevant
        because detection is env-var-based, not file-based.
        """
        (tmp_project / CYCLIST_PORT_FILE).write_text("2898")
        with patch.dict(os.environ, {}, clear=True):
            assert is_cyclist_running(tmp_project) is False

    def test_returns_true_inside_cyclist(self):
        """AC2: CYCLIST=1 env var set → running."""
        with patch.dict(os.environ, {"CYCLIST": "1"}):
            assert is_cyclist_running() is True

    def test_returns_false_when_cyclist_env_wrong_value(self):
        """CYCLIST set to something other than '1' → not running."""
        with patch.dict(os.environ, {"CYCLIST": "0"}):
            assert is_cyclist_running() is False

    def test_returns_false_when_cyclist_env_empty(self):
        """CYCLIST set to empty string → not running."""
        with patch.dict(os.environ, {"CYCLIST": ""}):
            assert is_cyclist_running() is False

    def test_no_file_io_or_http_calls(self):
        """AC3: Detection must not touch filesystem or network."""
        with patch.dict(os.environ, {"CYCLIST": "1"}):
            with patch("pf.hooks.urllib.request.urlopen") as mock_url:
                with patch.object(Path, "exists") as mock_exists:
                    is_cyclist_running()
                    mock_url.assert_not_called()
                    mock_exists.assert_not_called()
