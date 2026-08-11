"""Tests for Story 164-16 — Frame hardening follow-ups from the 161-1 review.

Epic: 164 — framework hardening chores
Story: 164-16 — guard ``monitor_and_shutdown`` loop body + shut down the shared
executor on lifespan exit.

Two non-blocking defects the 161-1 Reviewer found in the Frame FastAPI server:

1. **Silent monitor death re-opens orphan mode.** The ``monitor_and_shutdown``
   loop body (``count_active_clients``, ``last_activity_getter``,
   ``launcher.is_process_alive``) is unguarded. Any raise kills the monitor task
   silently, and the frame process loses BOTH orphan protection (owner-liveness)
   and idle reaping — exactly the gh#97 failure mode 161-1 fixed.

2. **Shared executor thread leak.** ``ws_push.get_shared_executor()`` builds a
   4-thread ``ThreadPoolExecutor`` singleton that ``app._lifespan`` never shuts
   down, so ``frame-fetch`` threads outlive the server.

Acceptance Criteria:
- [AC1] The monitor loop body is wrapped in try/except: a raise from any
        dependency is logged (with diagnostic context) and the monitor KEEPS
        LOOPING rather than propagating/dying.
- [AC2] The monitor recovers from a transient failure — a later iteration still
        reaches the shutdown decision and fires ``trigger_shutdown``.
- [AC3] The lifespan exit path shuts down the shared executor non-blockingly
        (``shutdown(wait=False)``), leaving no live ``frame-fetch`` pool behind.

DESIGNED INTERFACE (for Dev):
- ``lifecycle.monitor_and_shutdown``: loop body inside
  ``try: ... except Exception: _logger.<warning|error|exception>(...); continue``.
  The exception text must appear in the log record so the failure is diagnosable.
- ``app._lifespan`` finally block: call
  ``ws_push.get_shared_executor().shutdown(wait=False)`` (order relative to the
  task cancellation / port-file cleanup is Dev's choice).
"""

from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app

# The monitor logs through uvicorn's error logger (see lifecycle module docstring).
MONITOR_LOGGER = "uvicorn.error"

# Bound every monitor test so an unguarded (or wedged) loop fails fast instead of
# hanging the suite.
MONITOR_TIMEOUT_S = 5.0


@pytest.fixture()
def idle_monitor_env(monkeypatch):
    """Env where the idle-timeout trigger fires as soon as the loop evaluates it.

    No owner PID (owner-liveness disabled by default) and a zero idle window, so
    a healthy iteration with 0 clients and stale activity shuts down immediately.
    """
    monkeypatch.delenv("FRAME_OWNER_PID", raising=False)
    monkeypatch.setenv("FRAME_IDLE_TIMEOUT_S", "0")


def _stale_activity() -> float:
    """last_activity far enough in the past to be idle under any window."""
    return time.monotonic() - 10_000.0


# ---------------------------------------------------------------------------
# AC1 / AC2: the monitor loop body survives raising dependencies
# ---------------------------------------------------------------------------


class TestMonitorSurvivesRaisingDependency:
    """A raise inside the loop body is logged; the monitor keeps monitoring."""

    async def test_transient_count_active_clients_error_is_logged_and_loop_continues(
        self, idle_monitor_env, caplog
    ):
        """AC1+AC2: count_active_clients raises once -> logged, then recovers.

        RED: today the exception escapes ``monitor_and_shutdown`` (the await
        raises RuntimeError), the task dies, and ``trigger_shutdown`` is never
        reached — the server is left with no orphan/idle protection.
        """
        from pf.frame.lifecycle import monitor_and_shutdown

        calls = {"n": 0}
        shutdowns = {"n": 0}

        def _count() -> int:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("transient client-count failure")
            return 0

        with caplog.at_level(logging.DEBUG, logger=MONITOR_LOGGER):
            await asyncio.wait_for(
                monitor_and_shutdown(
                    count_active_clients=_count,
                    last_activity_getter=_stale_activity,
                    trigger_shutdown=lambda: shutdowns.__setitem__("n", shutdowns["n"] + 1),
                    interval_s=0.0,
                ),
                timeout=MONITOR_TIMEOUT_S,
            )

        assert calls["n"] >= 2, (
            "monitor must iterate again after a transient failure, "
            f"but count_active_clients was called {calls['n']}x"
        )
        assert shutdowns["n"] == 1, "recovered monitor must still reach the shutdown decision"
        assert "transient client-count failure" in caplog.text, (
            "the swallowed exception must be logged with diagnostic context, "
            f"got records: {caplog.text!r}"
        )
        assert any(
            record.levelno >= logging.WARNING for record in caplog.records
        ), "monitor failures must log at WARNING or above, not be silently discarded"

    async def test_transient_last_activity_error_does_not_kill_monitor(
        self, idle_monitor_env
    ):
        """AC1: last_activity_getter is guarded too, not just the client count."""
        from pf.frame.lifecycle import monitor_and_shutdown

        calls = {"n": 0}
        shutdowns = {"n": 0}

        def _last_activity() -> float:
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError("clock source unavailable")
            return _stale_activity()

        await asyncio.wait_for(
            monitor_and_shutdown(
                count_active_clients=lambda: 0,
                last_activity_getter=_last_activity,
                trigger_shutdown=lambda: shutdowns.__setitem__("n", shutdowns["n"] + 1),
                interval_s=0.0,
            ),
            timeout=MONITOR_TIMEOUT_S,
        )

        assert calls["n"] >= 2
        assert shutdowns["n"] == 1

    async def test_transient_owner_liveness_error_does_not_kill_monitor(
        self, monkeypatch
    ):
        """AC1: a raise from ``is_process_alive`` (process lookup) is survivable.

        Owner-PID probing is the most realistic transient failure — a PID lookup
        can raise on a racing exit. It must not disarm the monitor.
        """
        from pf.frame import launcher
        from pf.frame.lifecycle import monitor_and_shutdown

        monkeypatch.setenv("FRAME_OWNER_PID", "424242")
        monkeypatch.setenv("FRAME_IDLE_TIMEOUT_S", "0")

        calls = {"n": 0}
        shutdowns = {"n": 0}

        def _is_process_alive(pid: int) -> bool:
            calls["n"] += 1
            if calls["n"] == 1:
                raise OSError("process lookup failed")
            return True  # owner alive -> idle trigger decides instead

        monkeypatch.setattr(launcher, "is_process_alive", _is_process_alive)

        await asyncio.wait_for(
            monitor_and_shutdown(
                count_active_clients=lambda: 0,
                last_activity_getter=_stale_activity,
                trigger_shutdown=lambda: shutdowns.__setitem__("n", shutdowns["n"] + 1),
                interval_s=0.0,
            ),
            timeout=MONITOR_TIMEOUT_S,
        )

        assert calls["n"] >= 2
        assert shutdowns["n"] == 1

    async def test_monitor_task_stays_alive_across_persistent_failures(
        self, idle_monitor_env
    ):
        """AC1: with a dependency failing EVERY iteration, the task must not die.

        The defect's real signature: a persistent failure (not a one-off) must
        leave the monitor task pending and re-trying, so protection is restored
        the moment the dependency recovers. RED: the task finishes with an
        exception on iteration 1.
        """
        from pf.frame.lifecycle import monitor_and_shutdown

        calls = {"n": 0}

        def _always_raises() -> int:
            calls["n"] += 1
            raise RuntimeError("persistent client-count failure")

        task = asyncio.create_task(
            monitor_and_shutdown(
                count_active_clients=_always_raises,
                last_activity_getter=_stale_activity,
                trigger_shutdown=lambda: pytest.fail("must not shut down on failure"),
                interval_s=0.0,
            )
        )
        try:
            deadline = time.monotonic() + MONITOR_TIMEOUT_S
            while calls["n"] < 3 and time.monotonic() < deadline:
                await asyncio.sleep(0.01)
                if task.done():
                    break

            assert not task.done(), (
                "monitor task died on a raising dependency (orphan protection lost): "
                f"{task.exception() if task.done() and not task.cancelled() else None!r}"
            )
            assert calls["n"] >= 3, (
                f"monitor stopped re-trying after {calls['n']} iteration(s)"
            )
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task


# ---------------------------------------------------------------------------
# AC3: the shared executor is shut down when the lifespan exits
# ---------------------------------------------------------------------------


@pytest.fixture()
def spied_shared_executor(monkeypatch):
    """Install a real (small) shared executor whose ``shutdown`` is recorded.

    Patching the ``ws_push._shared_executor`` singleton — rather than
    ``get_shared_executor`` — keeps the test agnostic to HOW Dev reaches the
    executor from the lifespan, while still observing the real object.
    """
    from pf.frame import ws_push

    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="frame-fetch-test")
    recorded: list[dict] = []
    real_shutdown = executor.shutdown

    def _spy_shutdown(wait=True, **kwargs):
        recorded.append({"wait": wait, **kwargs})
        return real_shutdown(wait=wait, **kwargs)

    executor.shutdown = _spy_shutdown  # type: ignore[method-assign]
    monkeypatch.setattr(ws_push, "_shared_executor", executor)
    try:
        yield executor, recorded
    finally:
        real_shutdown(wait=False)


class TestLifespanShutsDownSharedExecutor:
    """The lifespan exit path must drain the frame-fetch thread pool."""

    def test_lifespan_exit_calls_executor_shutdown(self, spied_shared_executor):
        """AC3: leaving the app lifespan shuts down the shared executor.

        RED: ``_lifespan``'s finally block cancels the poll/monitor tasks and
        removes the port file but never touches the executor, so ``shutdown`` is
        never called and the 4 frame-fetch threads leak for the process lifetime.
        """
        _executor, recorded = spied_shared_executor

        app = create_app()
        with TestClient(app):
            assert recorded == [], "executor must stay usable while the server is running"

        assert recorded, "lifespan exit must call shutdown() on the shared executor"

    def test_lifespan_exit_shutdown_is_non_blocking(self, spied_shared_executor):
        """AC3: shutdown must be ``wait=False`` — teardown can't block on fetchers.

        A blocking shutdown would stall uvicorn's unwind behind an in-flight
        subprocess fetch, which is precisely what the orphan-reaping path can't
        afford.
        """
        _executor, recorded = spied_shared_executor

        app = create_app()
        with TestClient(app):
            pass

        assert recorded, "lifespan exit must call shutdown() on the shared executor"
        assert recorded[0]["wait"] is False, (
            f"expected shutdown(wait=False), got shutdown(**{recorded[0]!r})"
        )

    def test_no_usable_frame_fetch_pool_after_lifespan_exit(self, spied_shared_executor):
        """AC3: the pool is genuinely shut down, not merely signalled.

        Post-teardown, submitting new work must be rejected — the observable
        proof that no frame-fetch worker threads are left accepting jobs.
        """
        executor, _recorded = spied_shared_executor

        app = create_app()
        with TestClient(app):
            pass

        with pytest.raises(RuntimeError):
            executor.submit(lambda: None)
