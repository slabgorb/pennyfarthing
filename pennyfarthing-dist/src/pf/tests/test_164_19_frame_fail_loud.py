"""Tests for Story 164-19 — Frame OTLP + subagent-event handlers fail loud.

Epic: 164 — framework hardening chores
Story: 164-19 — replace silent ``except Exception: pass`` with ERROR logging at
eight swallow sites in the Frame server and the subagent event emitter.

The bug these tests pin: every one of these sites currently discards the
exception entirely. A malformed OTLP payload, a wedged WebSocket, an unreadable
``.frame-port``, or a dead Frame process all produce *zero* diagnostic output, so
"the spans panel is empty" / "no transitions showed up" is undebuggable.

The fix is NOT a control-flow change. Each site must keep doing exactly what it
does today (route still returns its 200, broadcast still prunes dead sockets,
the emitter still returns a result dict instead of raising) and additionally LOG.
So every test below asserts BOTH halves:

  (a) an ERROR record with ``exc_info`` on logger ``uvicorn.error`` (AC1), and
  (b) the existing control-flow contract still holds (AC1 "control flow preserved").

Swallow sites (one test class each, AC2 = one test per site):

| # | Site                             | Failure injected                       |
|---|----------------------------------|----------------------------------------|
| 1 | ``app.py`` POST /v1/logs         | malformed JSON body                    |
| 2 | ``app.py`` POST /v1/metrics      | malformed JSON body                    |
| 3 | ``app.py`` POST /v1/traces       | malformed JSON body                    |
| 4 | ``app.py`` ``broadcast()``       | client ``send_text`` raises            |
| 5 | ``routes/state.py`` subagent-event | broadcast dispatch raises            |
| 6 | ``subagent_events._get_frame_url`` | FRAME_PROJECT_DIR port file unreadable |
| 7 | ``subagent_events._get_frame_url`` | CWD port file unreadable               |
| 8 | ``subagent_events.emit_...``     | HTTP POST to Frame fails               |

DESIGNED INTERFACE (for Dev):
- ``logger = logging.getLogger("uvicorn.error")`` in ``app.py``,
  ``routes/state.py``, and ``subagent_events.py`` (matches ``lifecycle.py``).
- Each ``except Exception:`` body becomes ``logger.error("<what failed>",
  exc_info=True)`` followed by the *existing* continuation (return the
  JSONResponse / append to ``dead`` / fall through to the next port source /
  return the failure dict). Message text is Dev's choice — these tests assert the
  record's level, logger, and exception payload, not its wording.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from pf.frame import app as app_module
from pf.frame import subagent_events
from pf.frame.app import broadcast, create_app

# Frame logs through uvicorn's error logger so records land in .session/frame.log
# (see lifecycle.py and AC3).
FRAME_LOGGER = "uvicorn.error"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture()
def frame_caplog(caplog):
    """caplog capturing ERROR records from the ``uvicorn.error`` logger.

    uvicorn sets ``propagate = False`` on its loggers when *it* configures
    logging; under pytest it has not, but force propagation so capture cannot
    depend on import order of another test module.
    """
    logger = logging.getLogger(FRAME_LOGGER)
    previous = logger.propagate
    logger.propagate = True
    try:
        with caplog.at_level(logging.ERROR, logger=FRAME_LOGGER):
            yield caplog
    finally:
        logger.propagate = previous


def assert_logged_with_traceback(caplog, *, expected_exc: type[BaseException] | None = None):
    """Assert >=1 ERROR record on ``uvicorn.error`` carrying exception info.

    Returns the matching records so callers can make extra assertions.
    """
    frame_records = [
        record
        for record in caplog.records
        if record.name == FRAME_LOGGER and record.levelno >= logging.ERROR
    ]
    assert frame_records, (
        "silent swallow: expected an ERROR record on logger "
        f"{FRAME_LOGGER!r}, but captured records were "
        f"{[(r.name, r.levelname, r.getMessage()) for r in caplog.records]!r}"
    )
    with_traceback = [record for record in frame_records if record.exc_info is not None]
    assert with_traceback, (
        "the swallowed exception must be logged with exc_info=True so the "
        "traceback is recoverable; got messages without exception info: "
        f"{[r.getMessage() for r in frame_records]!r}"
    )
    assert all(record.getMessage().strip() for record in with_traceback), (
        "log message must describe what failed, not be empty"
    )
    if expected_exc is not None:
        logged_types = [record.exc_info[0] for record in with_traceback]
        assert any(
            exc_type is not None and issubclass(exc_type, expected_exc)
            for exc_type in logged_types
        ), (
            f"expected the {expected_exc.__name__} raised by the guarded call to be "
            f"the logged exception, got {logged_types!r}"
        )
    return with_traceback


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


class _FailingWebSocket:
    """WebSocket stub whose send always fails (wedged / half-closed client)."""

    def __init__(self, exc: BaseException):
        self._exc = exc
        self.sent: list[str] = []

    async def send_text(self, message: str) -> None:
        raise self._exc


class _RecordingWebSocket:
    """Healthy WebSocket stub — proves broadcast keeps fanning out."""

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, message: str) -> None:
        self.sent.append(message)


# ---------------------------------------------------------------------------
# Site 1: app.py POST /v1/logs
# ---------------------------------------------------------------------------


class TestOTLPLogsFailLoud:
    """AC1/AC2 site 1 — ``/v1/logs`` ingest failure is logged, route still 200s."""

    def test_malformed_logs_payload_is_logged(self, client: TestClient, frame_caplog):
        response = client.post(
            "/v1/logs",
            content=b"{not valid json",
            headers={"Content-Type": "application/json"},
        )

        # (b) control flow preserved: OTLP collectors must still get their ack.
        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}
        # (a) fail loud.
        assert_logged_with_traceback(frame_caplog, expected_exc=ValueError)


# ---------------------------------------------------------------------------
# Site 2: app.py POST /v1/metrics
# ---------------------------------------------------------------------------


class TestOTLPMetricsFailLoud:
    """AC1/AC2 site 2 — ``/v1/metrics`` ingest failure is logged, route still 200s."""

    def test_malformed_metrics_payload_is_logged(self, client: TestClient, frame_caplog):
        response = client.post(
            "/v1/metrics",
            content=b"{not valid json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}
        assert_logged_with_traceback(frame_caplog, expected_exc=ValueError)

    def test_metrics_parse_failure_is_logged(
        self, client: TestClient, frame_caplog, monkeypatch
    ):
        """A raise from the parser (not just the JSON decode) must also surface."""
        def _boom(_body):
            raise RuntimeError("metrics parse exploded")

        monkeypatch.setattr("pf.frame.otlp.parse_otlp_metrics", _boom)

        response = client.post("/v1/metrics", json={"resourceMetrics": []})

        assert response.status_code == 200
        assert_logged_with_traceback(frame_caplog, expected_exc=RuntimeError)


# ---------------------------------------------------------------------------
# Site 3: app.py POST /v1/traces
# ---------------------------------------------------------------------------


class TestOTLPTracesFailLoud:
    """AC1/AC2 site 3 — ``/v1/traces`` ingest failure is logged, route still 200s."""

    def test_malformed_traces_payload_is_logged(self, client: TestClient, frame_caplog):
        response = client.post(
            "/v1/traces",
            content=b"{not valid json",
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}
        assert_logged_with_traceback(frame_caplog, expected_exc=ValueError)


# ---------------------------------------------------------------------------
# Site 4: app.py broadcast() WebSocket send failure
# ---------------------------------------------------------------------------


class TestBroadcastFailLoud:
    """AC1/AC2 site 4 — a failing socket is logged AND still pruned."""

    async def test_send_failure_is_logged_and_client_pruned(
        self, frame_caplog, monkeypatch
    ):
        bad = _FailingWebSocket(RuntimeError("socket send failed"))
        good = _RecordingWebSocket()
        monkeypatch.setitem(app_module._ws_clients, "spans", {bad, good})

        await broadcast("spans", {"type": "span", "span": {"id": "abc"}})

        # (b) control flow preserved: no raise, healthy client still served,
        # dead client dropped from the channel.
        assert good.sent, "healthy client must still receive the broadcast"
        assert bad not in app_module._ws_clients["spans"], (
            "failing client must still be pruned from the channel"
        )
        assert good in app_module._ws_clients["spans"]
        # (a) fail loud.
        assert_logged_with_traceback(frame_caplog, expected_exc=RuntimeError)


# ---------------------------------------------------------------------------
# Site 5: routes/state.py POST /api/subagent-event broadcast dispatch
# ---------------------------------------------------------------------------


class TestSubagentEventBroadcastFailLoud:
    """AC1/AC2 site 5 — broadcast dispatch failure logged, event still stored."""

    def test_broadcast_dispatch_failure_is_logged(
        self, client: TestClient, frame_caplog, monkeypatch
    ):
        # A non-awaitable return makes asyncio.ensure_future raise TypeError —
        # the realistic shape of this swallow (bad/missing broadcast target).
        monkeypatch.setattr(app_module, "broadcast", lambda *a, **kw: None)

        event = {"type": "handoff", "story_id": "164-19", "agent": "tea"}
        response = client.post("/api/subagent-event", json=event)

        # (b) control flow preserved: caller gets success, event still buffered
        # and readable from the events endpoint.
        assert response.status_code == 200
        assert response.json() == {"success": True}
        stored = client.get("/api/subagent-events").json()["events"]
        assert event in stored, "event must still land in the ring buffer"
        # (a) fail loud.
        assert_logged_with_traceback(frame_caplog, expected_exc=TypeError)


# ---------------------------------------------------------------------------
# Sites 6 & 7: subagent_events._get_frame_url port-file reads
# ---------------------------------------------------------------------------


@pytest.fixture()
def unreadable_port_file(monkeypatch):
    """Make reading any ``.frame-port`` raise, leaving ``is_file()`` truthy."""
    real_read_text = Path.read_text

    def _read_text(self: Path, *args, **kwargs):
        if self.name == ".frame-port":
            raise OSError("simulated unreadable .frame-port")
        return real_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", _read_text)


class TestGetFrameUrlProjectDirFailLoud:
    """AC1/AC2 site 6 — unreadable FRAME_PROJECT_DIR port file is logged."""

    def test_project_dir_port_read_failure_is_logged(
        self, tmp_path, monkeypatch, unreadable_port_file, frame_caplog
    ):
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        (project_dir / ".frame-port").write_text("2898")
        # cwd has no port file, so site 7 cannot mask site 6.
        cwd = tmp_path / "elsewhere"
        cwd.mkdir()
        monkeypatch.chdir(cwd)
        monkeypatch.delenv("FRAME_PORT", raising=False)
        monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
        monkeypatch.setenv("FRAME_PROJECT_DIR", str(project_dir))

        url = subagent_events._get_frame_url()

        # (b) control flow preserved: unreadable port file is not fatal, the
        # resolver still returns "no Frame" instead of raising.
        assert url is None
        # (a) fail loud.
        assert_logged_with_traceback(frame_caplog, expected_exc=OSError)


class TestGetFrameUrlCwdFailLoud:
    """AC1/AC2 site 7 — unreadable CWD port file is logged."""

    def test_cwd_port_read_failure_is_logged(
        self, tmp_path, monkeypatch, unreadable_port_file, frame_caplog
    ):
        (tmp_path / ".frame-port").write_text("2898")
        monkeypatch.chdir(tmp_path)
        monkeypatch.delenv("FRAME_PORT", raising=False)
        monkeypatch.delenv("FRAME_PROJECT_DIR", raising=False)
        monkeypatch.delenv("PF_PROJECT_DIR", raising=False)

        url = subagent_events._get_frame_url()

        assert url is None
        assert_logged_with_traceback(frame_caplog, expected_exc=OSError)


# ---------------------------------------------------------------------------
# Site 8: subagent_events.emit_subagent_event HTTP POST
# ---------------------------------------------------------------------------


class TestEmitSubagentEventFailLoud:
    """AC1/AC2 site 8 — a failed POST to Frame is logged, emitter stays quiet-safe."""

    def test_post_failure_is_logged(self, monkeypatch, frame_caplog):
        monkeypatch.setenv("FRAME_PORT", "2898")

        def _boom(*args, **kwargs):
            raise ConnectionRefusedError("frame not listening")

        monkeypatch.setattr("urllib.request.urlopen", _boom)

        result = subagent_events.emit_subagent_event(
            "handoff", agent="tea", story_id="164-19", phase="red"
        )

        # (b) control flow preserved: fire-and-forget contract — returns a
        # failure dict, never raises.
        assert result == {"success": False, "error": "Failed to reach Frame"}
        # (a) fail loud.
        assert_logged_with_traceback(frame_caplog, expected_exc=OSError)
