"""Tests for Story 161-1 — Frame server resource hygiene & lifecycle (gh #97).

Epic: 161 — Frame GUI server resource hygiene (runaway Mach-message memory)
Story: 161-1 — Diagnose & fix Frame GUI runaway Mach-message memory

Background (gh #97): Long-lived ``pf.frame.app`` uvicorn servers accumulate
~3.3GB of kernel-side Mach-message memory (206k+ regions) on macOS while the
Python heap stays unremarkable. Two defects in scope:

1. THE LEAK — the data-refresh channel (per-connection ``send_initial_data`` and
   the per-process ``poll_and_broadcast`` loop) must use a single SHARED poller
   per process (never one per connection / per poll), and per-connection
   resources (the client entry in ``_ws_clients``) must be released on
   disconnect. The kernel-region leak itself is not CI-observable; these are the
   behavioral invariants that prevent it from compounding.

2. THE LIFECYCLE — the frame server must self-terminate when its owning Claude
   Code session ends (owner-liveness) or after an idle period with no clients
   (idle-timeout), so orphaned servers can't compound any residual leak.

These tests pin the behavioral invariants (AC1, AC2). AC3 (manual
footprint/vmmap verification) is documented in the session file, not here. AC4
(existing frame tests still pass) is covered by the existing frame test suite.

Acceptance Criteria:
- [AC1] File-watching/notification resources bounded: one shared poller per
        process (not per connection / per poll); per-connection resources
        released on disconnect — proven by tests.
- [AC2] Frame server self-terminates when its owning session ends (idle-timeout
        or owner-liveness), proven by tests of the shutdown trigger logic.

DESIGNED INTERFACE (for Dev — currently absent, tests fail RED on this):
- ``pf.frame.lifecycle.should_shutdown(*, owner_pid, owner_alive, active_clients,
  last_activity, now, idle_timeout_s)`` -> bool — pure decision function.
    * Returns True when ``owner_pid`` is set AND ``owner_alive`` is False
      (owner-liveness trigger).
    * Returns True when ``active_clients == 0`` AND
      ``now - last_activity > idle_timeout_s`` (idle-timeout trigger).
    * Returns False otherwise (live owner, or active clients, or within idle
      window).
- ``FRAME_OWNER_PID`` env carries the owning session PID; ``FRAME_IDLE_TIMEOUT_S``
  configures the idle window (default in ``DEFAULT_IDLE_TIMEOUT_S``).
- The monitor that evaluates ``should_shutdown`` is wired into ``_lifespan`` and
  triggers a clean uvicorn shutdown; the pure function above is what we unit-test.
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from pf.frame.app import _ws_clients, create_app

# ---------------------------------------------------------------------------
# AC1: bounded shared poller + per-connection cleanup on disconnect
# ---------------------------------------------------------------------------


class TestPerConnectionCleanup:
    """Per-connection resources are released on disconnect (no leak per client)."""

    def test_disconnect_removes_client_from_channel(self):
        """AC1: after a WS client disconnects, its entry leaves _ws_clients.

        A client that connects to /ws/story and disconnects must not remain in
        the channel's client set. A lingering entry is exactly the kind of
        per-connection resource that accumulates Mach-message regions across the
        life of the process.
        """
        app = create_app()
        with TestClient(app) as client:
            assert len(_ws_clients["story"]) == 0
            with client.websocket_connect("/ws/story") as ws:
                ws.receive_text()  # initial data — proves we're connected
                assert len(_ws_clients["story"]) == 1
            # Context-manager exit closes the socket -> finally must discard it.
            assert len(_ws_clients["story"]) == 0

    def test_repeated_connect_disconnect_does_not_accumulate(self):
        """AC1: connecting/disconnecting N times leaves zero residual clients.

        This is the leak signature in miniature: if cleanup is incomplete, the
        client set grows monotonically with connection churn.
        """
        app = create_app()
        with TestClient(app) as client:
            for _ in range(10):
                with client.websocket_connect("/ws/sprint") as ws:
                    ws.receive_text()
            assert len(_ws_clients["sprint"]) == 0


class TestSharedPollerBounded:
    """Exactly one shared poller per process — never one per connection/poll."""

    def test_lifespan_starts_exactly_one_poll_task(self, monkeypatch):
        """AC1: the periodic poller is a single shared task per process.

        Instruments ws_push.poll_and_broadcast to count how many times the
        process spins up a polling loop. Entering the app lifespan (and
        connecting clients) must NOT create additional pollers — a per-connection
        or per-poll instantiation is the unbounded-resource defect.
        """
        import pf.frame.ws_push as ws_push

        call_count = {"n": 0}
        async def _counting_poll(broadcast_fn):
            call_count["n"] += 1
            # Return immediately so the lifespan task completes cleanly; we only
            # care that it is started exactly once, not that it loops.
            return None

        monkeypatch.setattr(ws_push, "poll_and_broadcast", _counting_poll)
        # app.py imports the symbol lazily inside _lifespan via
        # ``from .ws_push import poll_and_broadcast`` so patching the module
        # attribute is sufficient.

        app = create_app()
        with TestClient(app) as client:
            with client.websocket_connect("/ws/sprint"):
                with client.websocket_connect("/ws/git"):
                    pass

        assert call_count["n"] == 1, (
            f"expected exactly one shared poller per process, got {call_count['n']}"
        )

    def test_poll_uses_shared_executor_not_per_call_pool(self):
        """AC1: per-poll work must not create a fresh thread/process pool.

        Pins the invariant that the poller reuses a single shared executor (the
        loop default, or a module-level one) rather than constructing a new
        ThreadPoolExecutor/ProcessPoolExecutor on every poll cycle — per-call
        pools spawn kernel resources (Mach ports) that accumulate.

        DESIGNED INTERFACE: ws_push exposes ``get_shared_executor()`` returning a
        single, stable executor instance reused across polls.
        """
        from pf.frame import ws_push

        first = ws_push.get_shared_executor()
        second = ws_push.get_shared_executor()
        assert first is second, "shared executor must be a stable singleton per process"


# ---------------------------------------------------------------------------
# AC2: self-termination — owner-liveness and idle-timeout trigger logic
# ---------------------------------------------------------------------------


class TestShouldShutdownOwnerLiveness:
    """should_shutdown triggers when the owning session process is gone."""

    def test_shutdown_when_owner_dead(self):
        """AC2: owner PID set but not alive -> shut down (orphan prevention)."""
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=4242,
            owner_alive=False,
            active_clients=3,
            last_activity=1000.0,
            now=1001.0,
            idle_timeout_s=1800.0,
        ) is True

    def test_no_shutdown_when_owner_alive(self):
        """AC2: owner alive with active clients -> keep running."""
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=4242,
            owner_alive=True,
            active_clients=1,
            last_activity=1000.0,
            now=1001.0,
            idle_timeout_s=1800.0,
        ) is False

    def test_no_shutdown_when_owner_unknown_and_recently_active(self):
        """AC2: no owner PID configured and within idle window -> keep running.

        owner_pid=None means owner-liveness can't decide; fall through to the
        idle-timeout check, which is satisfied (clients present / recent
        activity), so the server stays up.
        """
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=None,
            owner_alive=True,
            active_clients=2,
            last_activity=1000.0,
            now=1001.0,
            idle_timeout_s=1800.0,
        ) is False


class TestShouldShutdownIdleTimeout:
    """should_shutdown triggers after an idle period with no clients."""

    def test_shutdown_when_idle_and_no_clients(self):
        """AC2: zero clients and idle longer than timeout -> shut down."""
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=None,
            owner_alive=True,
            active_clients=0,
            last_activity=1000.0,
            now=1000.0 + 1801.0,
            idle_timeout_s=1800.0,
        ) is True

    def test_no_shutdown_when_idle_but_clients_connected(self):
        """AC2: active clients keep the server alive even past the idle window.

        A long-lived but actively-used dashboard must not be killed.
        """
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=None,
            owner_alive=True,
            active_clients=1,
            last_activity=1000.0,
            now=1000.0 + 9999.0,
            idle_timeout_s=1800.0,
        ) is False

    def test_no_shutdown_within_idle_window(self):
        """AC2: no clients but still inside the idle window -> keep running."""
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=None,
            owner_alive=True,
            active_clients=0,
            last_activity=1000.0,
            now=1000.0 + 10.0,
            idle_timeout_s=1800.0,
        ) is False

    def test_idle_boundary_is_strict_greater_than(self):
        """AC2: exactly at the timeout boundary is NOT yet idle (no shutdown).

        Boundary paranoia: ``now - last_activity == idle_timeout_s`` must not
        trigger; only strictly greater does. Pins the comparison operator.
        """
        from pf.frame.lifecycle import should_shutdown

        assert should_shutdown(
            owner_pid=None,
            owner_alive=True,
            active_clients=0,
            last_activity=1000.0,
            now=1000.0 + 1800.0,
            idle_timeout_s=1800.0,
        ) is False


class TestLifecycleConfig:
    """Owner PID and idle-timeout are configurable via environment."""

    def test_default_idle_timeout_is_positive(self):
        """AC2: a sane positive default idle timeout exists."""
        from pf.frame.lifecycle import DEFAULT_IDLE_TIMEOUT_S

        assert DEFAULT_IDLE_TIMEOUT_S > 0

    def test_resolve_owner_pid_reads_env(self, monkeypatch):
        """AC2: FRAME_OWNER_PID env is parsed into the owning session PID."""
        from pf.frame.lifecycle import resolve_owner_pid

        monkeypatch.setenv("FRAME_OWNER_PID", "12345")
        assert resolve_owner_pid() == 12345

    def test_resolve_owner_pid_none_when_unset(self, monkeypatch):
        """AC2: absent/invalid FRAME_OWNER_PID resolves to None (no owner gate)."""
        from pf.frame.lifecycle import resolve_owner_pid

        monkeypatch.delenv("FRAME_OWNER_PID", raising=False)
        assert resolve_owner_pid() is None

    def test_resolve_idle_timeout_reads_env(self, monkeypatch):
        """AC2: FRAME_IDLE_TIMEOUT_S env overrides the default idle window."""
        from pf.frame.lifecycle import resolve_idle_timeout_s

        monkeypatch.setenv("FRAME_IDLE_TIMEOUT_S", "60")
        assert resolve_idle_timeout_s() == pytest.approx(60.0)
