"""
Tests for MSSCI-14320: Update and register PreToolUse hook.

Verifies the Python PreToolUse hook and its shared utilities correctly:
- AC1: POSTs to /api/hook-request (not /approval-request)
- AC3: Returns decision "ask" when Frame is unreachable (not "allow")
- AC6: Port discovery reads .frame-port

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

from pf.hooks import (  # noqa: E402
    FRAME_PORT_FILE,
    DEFAULT_FRAME_PORT,
    HookResponse,
    find_project_root,
    get_frame_port,
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

    def test_hook_uses_pending_tool_input_endpoint(self):
        """The hook module should reference /api/pending-tool-input for audit enrichment."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "cyclist_pretooluse.py"
        ).read_text()

        assert "/api/pending-tool-input" in hook_source


# =============================================================================
# AC3: ECONNREFUSED fallback
# =============================================================================


class TestConnectionRefused:
    """AC3: Returns decision 'ask' when Frame is unreachable."""

    def test_send_to_cyclist_returns_none_on_connection_refused(self):
        """send_to_cyclist should return None when server is unreachable."""
        result = send_to_cyclist(
            endpoint="/api/hook-request",
            data={"toolName": "Bash", "toolId": "test", "input": {}},
            port=19999,  # Nothing listening here
            timeout=2,
        )

        assert result is None

    def test_hook_response_ask_format(self):
        """HookResponse with decision='ask' should produce correct JSON."""
        response = HookResponse(
            event_name="PreToolUse",
            decision="ask",
            reason="Frame not running, deferring to Claude Code",
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["permissionDecision"] == "ask"
        assert "Frame" in output["hookSpecificOutput"]["permissionDecisionReason"]


# =============================================================================
# AC6: Port file discovery
# =============================================================================


class TestPortDiscovery:
    """AC6: Port discovery reads .frame-port."""

    def test_constants_defined(self):
        """Port file constants should be defined in hooks module."""
        assert FRAME_PORT_FILE == ".frame-port"

    def test_reads_frame_port(self, tmp_project):
        """get_frame_port should read from .frame-port."""
        (tmp_project / FRAME_PORT_FILE).write_text("8001")

        port = get_frame_port(tmp_project)

        assert port == 8001

    def test_returns_default_when_no_port_files(self, tmp_project):
        """get_frame_port should return default port when no port files exist."""
        port = get_frame_port(tmp_project)

        assert port == DEFAULT_FRAME_PORT

    def test_read_port_file_returns_none_for_missing(self, tmp_project):
        """read_port_file should return None for missing file."""
        result = read_port_file(
            FRAME_PORT_FILE, tmp_project
        )
        assert result is None

    def test_read_port_file_returns_none_for_invalid(self, tmp_project):
        """read_port_file should return None for non-numeric content."""
        (tmp_project / FRAME_PORT_FILE).write_text("not-a-number")

        result = read_port_file(FRAME_PORT_FILE, tmp_project)
        assert result is None

    def test_read_port_file_returns_none_for_out_of_range(self, tmp_project):
        """read_port_file should return None for port outside 1-65535."""
        (tmp_project / FRAME_PORT_FILE).write_text("99999")

        result = read_port_file(FRAME_PORT_FILE, tmp_project)
        assert result is None

    def test_read_port_file_returns_valid_port(self, tmp_project):
        """read_port_file should return parsed port for valid content."""
        (tmp_project / FRAME_PORT_FILE).write_text("2898\n")

        result = read_port_file(FRAME_PORT_FILE, tmp_project)
        assert result == 2898

    def test_find_project_root_finds_cyclist_port(self, tmp_project):
        """find_project_root should find directory containing .frame-port."""
        (tmp_project / FRAME_PORT_FILE).write_text("2898")
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
# is_cyclist_running — deprecated, always returns False
# =============================================================================


class TestIsCyclistRunning:
    """is_cyclist_running() is deprecated — always returns False."""

    def test_always_returns_false(self):
        """Deprecated: always returns False regardless of environment."""
        assert is_cyclist_running() is False

    def test_returns_false_even_with_cyclist_env(self):
        """Even with CYCLIST=1, still returns False (Cyclist is removed)."""
        with patch.dict(os.environ, {"CYCLIST": "1"}):
            assert is_cyclist_running() is False
