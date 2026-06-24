"""Tests for Story 159-8 — Frame kills live sessions (161-1 regression).

161-1 (commit 9c882af, gh #97) added in-process self-termination to the Frame
(``lifecycle.py::monitor_and_shutdown`` -> ``app.py::_trigger_shutdown`` SIGTERM).
Two wiring defects make it self-terminate *live* sessions. The frame log shows a
graceful self-SIGTERM ("Shutting down"), not an OOM/memory cap.

Design authority: ``docs/adr/0040-frame-self-termination-liveness-contract.md``.

  Liveness contract (ADR-0040): a Frame must self-terminate **iff** no session is
  using it, where "using it" = a connected WebSocket client OR recent inbound
  traffic (OTLP/HTTP) within the idle window OR a verified-alive owning session.

USER GROUND TRUTH (reported on 159-8): launching the frame and then plain
``claude`` drops the frame; launching the frame and then the TUI does not. The
TUI holds WebSocket connections (``active_clients > 0``), which suppresses the
idle monitor. The CLI holds ZERO WebSocket connections and speaks only OTLP/HTTP
-- and ``_touch_activity()`` today fires only on WS connect/disconnect -- so a
live CLI session is judged idle and self-SIGTERMed. This is Defect 2 and it is
the dominant failure in the explicit-launch workflow.

DESIGNED INTERFACE (for Dev — GREEN makes these pass):
- Inbound OTLP ingest (``/v1/logs``, ``/v1/metrics``, ``/v1/traces``) and HTTP API
  requests refresh liveness activity (call ``_touch_activity()`` or equivalent),
  so a clientless-but-active frame is not idle.
- The self-termination path logs its reason ("idle: ..." vs "owner ... dead").
- No auto-start path lets the *ephemeral launching process* become the frame's
  owning session. ADR-0040 leaves owner-PID hardening-vs-removal to Dev (AC4):
  these tests assert the universal invariant (owner is never the ephemeral
  launcher) so they hold whether owner-PID is hardened OR dropped for the
  traffic signal. 161-1's pure ``should_shutdown`` unit tests stay green.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

from starlette.testclient import TestClient

import pf.frame.app as app
from pf.frame.launcher import start_frame


def _capture_autostart_owner(ensure_frame, project_dir: Path) -> str | None:
    """Run an auto-start path with Popen mocked; return the ``FRAME_OWNER_PID``
    the frame subprocess would receive (str), or None if owner-gating is unset.

    ``start_frame`` runs for real (it builds the env); only the subprocess spawn
    and the readiness probes are stubbed so no real server is launched.
    """
    with (
        patch("pf.frame.launcher.subprocess.Popen") as mock_popen,
        patch("pf.frame.launcher.is_already_running", return_value=(False, None, None)),
        patch("pf.frame.launcher.poll_for_port_file", return_value=34567),
    ):
        mock_popen.return_value = MagicMock(pid=12345)
        ensure_frame(project_dir)
        env = mock_popen.call_args.kwargs.get("env") or {}
    return env.get("FRAME_OWNER_PID")


# ---------------------------------------------------------------------------
# Defect 2 — inbound OTLP/HTTP traffic must count as liveness activity
# ---------------------------------------------------------------------------


class TestTrafficCountsAsActivity:
    """OTLP/HTTP traffic must refresh activity so a clientless frame isn't idle.

    The idle monitor reads ``app._last_activity``. Today only WS connect/disconnect
    advances it, so a frame serving a live CLI session (telemetry + HTTP, zero held
    WebSocket clients) freezes its activity clock at launch and self-terminates.
    """

    def test_otlp_logs_ingest_refreshes_activity(self):
        """USER SCENARIO: claude streams OTLP logs while holding zero WS clients.
        That ingest must refresh liveness activity, or the live session is killed.
        """
        app_inst = app.create_app()
        with TestClient(app_inst) as client:
            assert app._count_active_clients() == 0  # the CLI case: no TUI/WS held
            before = app._last_activity
            resp = client.post("/v1/logs", json={"resourceLogs": []})
            after = app._last_activity
        assert resp.status_code == 200
        assert after > before, (
            "OTLP logs ingest (claude's telemetry) must refresh liveness "
            "activity; otherwise the idle monitor kills a live, clientless CLI "
            "session (Defect 2)"
        )

    def test_otlp_metrics_ingest_refreshes_activity(self):
        """claude also exports OTLP metrics; that ingest must count as activity."""
        app_inst = app.create_app()
        with TestClient(app_inst) as client:
            assert app._count_active_clients() == 0
            before = app._last_activity
            resp = client.post("/v1/metrics", json={"resourceMetrics": []})
            after = app._last_activity
        assert resp.status_code == 200
        assert after > before, "OTLP metrics ingest must refresh liveness activity"

    def test_http_api_request_refreshes_activity(self):
        """POST /api/subagent-event is exactly the live-session traffic the frame
        log showed arriving immediately before the self-SIGTERM. Inbound HTTP API
        requests must refresh liveness activity too (AC: OTLP *and* HTTP)."""
        app_inst = app.create_app()
        with TestClient(app_inst) as client:
            assert app._count_active_clients() == 0
            before = app._last_activity
            resp = client.post("/api/subagent-event", json={"type": "test"})
            after = app._last_activity
        assert resp.status_code == 200
        assert after > before, (
            "inbound HTTP API requests must refresh liveness activity (Defect 2)"
        )


# ---------------------------------------------------------------------------
# AC6 — the self-termination path must log WHY it shut down
# ---------------------------------------------------------------------------


class TestSelfTerminationLogsReason:
    """161-1 logged nothing on self-termination, turning this into a forensics
    exercise. The monitor must state its reason when it triggers shutdown."""

    def test_monitor_logs_shutdown_reason(self, monkeypatch, caplog):
        from pf.frame.lifecycle import monitor_and_shutdown

        monkeypatch.delenv("FRAME_OWNER_PID", raising=False)  # no owner gate
        monkeypatch.setenv("FRAME_IDLE_TIMEOUT_S", "1")
        triggered = {"n": 0}

        async def _run():
            await monitor_and_shutdown(
                count_active_clients=lambda: 0,
                last_activity_getter=lambda: 0.0,  # ancient activity -> idle
                trigger_shutdown=lambda: triggered.__setitem__("n", triggered["n"] + 1),
                interval_s=0,
            )

        with caplog.at_level(logging.INFO):
            asyncio.run(_run())

        assert triggered["n"] == 1, (
            "monitor must trigger shutdown for an idle, clientless frame"
        )
        messages = " ".join(r.getMessage().lower() for r in caplog.records)
        assert "idle" in messages or "owner" in messages, (
            "self-termination must log its reason (e.g. 'idle: 0 clients, no "
            "traffic Ns' or 'owner <pid> dead'); 161-1 logged nothing"
        )


# ---------------------------------------------------------------------------
# Defect 1 / AC5 — per-path owner correctness (no ephemeral launcher as owner)
# ---------------------------------------------------------------------------


class TestOwnerIdentityPerPath:
    """Each start path must register a correct long-lived owner — never the
    ephemeral launching process. Assertions are mechanism-agnostic per ADR-0040
    AC4: a long-lived owner PID OR disabled owner-gating (None) both satisfy them.
    """

    def test_exec_path_owner_defaults_to_caller(self, tmp_path: Path):
        """`pf frame start` execs into claude (os.execvpe preserves the PID), so
        the calling process IS the long-lived session — owner == caller is correct
        on this path and must be preserved. Green-on-HEAD regression guard;
        tolerant of the traffic-only floor (owner unset)."""
        with patch("pf.frame.launcher.subprocess.Popen") as mock_popen:
            mock_popen.return_value = MagicMock(pid=12345)
            start_frame(tmp_path)
            env = mock_popen.call_args.kwargs.get("env") or {}
        owner = env.get("FRAME_OWNER_PID")
        assert owner in (None, str(os.getpid())), (
            "exec-path default owner must be the calling (soon-to-exec) process "
            f"or unset, not some other PID; got {owner!r}"
        )

    def test_hook_autostart_frame_not_owned_by_ephemeral_hook(self, tmp_path: Path):
        """The SessionStart hook is a throwaway subprocess — the `just claude`
        path. The frame it auto-starts must NOT be owned by the hook's own PID;
        that ephemeral owner dies seconds later and the monitor self-kills the
        live session (Defect 1, the ~30s 'random' death)."""
        import pf.hooks.session_start as session_start

        owner = _capture_autostart_owner(session_start._ensure_frame, tmp_path)
        assert owner != str(os.getpid()), (
            "hook-started frame is owned by the ephemeral launching process "
            "(Defect 1): the owner dies and the monitor self-terminates a live "
            "session"
        )

    def test_launch_autostart_frame_not_owned_by_ephemeral_launcher(self, tmp_path: Path):
        """`pf launch tui/frame` is likewise not the long-lived session. Same
        contract as the hook path: the frame must not be owned by the launcher."""
        from pf.launch.cli import _ensure_frame

        owner = _capture_autostart_owner(_ensure_frame, tmp_path)
        assert owner != str(os.getpid()), (
            "launch-started frame is owned by the ephemeral launching process "
            "(Defect 1)"
        )
