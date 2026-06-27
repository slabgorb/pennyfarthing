"""RED tests for story 160-19 — fail-loud sweep part 5: ``get_context`` (p1).

Final part of the ``pf/frame/routes/data_proxy.py`` fail-loud sweep
(160-4/12/15/16/17, sink-sanitised by 160-18). 160-17's pass flagged
``get_context`` (``data_proxy.py:~299``) as the LAST silent swallow in the file:
its ``except Exception as e`` returns an all-``None`` context shape with the error
embedded in the body but emits NO ``warnings.warn`` — a real ``check_context``
failure surfaces nowhere.

DISCOVERY (TEA, RED phase) — the swallow hides a CONSTANT bug (the 160-15
``swallow-hides-constant-bug`` lesson, again):

  The ``try`` body is::

      config = ContextConfig(project_dir=project_dir)   # <-- always raises
      result = check_context(config)                     # <-- also miscalls sig

  ``ContextConfig`` has NO ``project_dir`` field, so ``ContextConfig(project_dir=...)``
  raises ``TypeError`` on EVERY request, before ``check_context`` is even reached.
  And ``check_context(explicit_session=None, project_dir=None)`` takes a session
  id / dir, not a config object. Verified live: the route returns
  ``{"percent": None, ..., "error": "ContextConfig.__init__() got an unexpected
  keyword argument 'project_dir'"}`` with status 200 and NO warning — the
  ``/api/context`` panel has never shown real data through this route.

  Consequence for the fix: a warn-ONLY change would fire the warning on EVERY
  request (warn-spam over a constant bug) — the exact blocking defect 160-17
  round-2 was rejected for. So a *correct* warn-then-degrade REQUIRES fixing the
  constant bug, so the warn is reserved for genuine failures. (SOUL #1 — fix the
  system, not the symptom.)

DESIGNED INTERFACE (for Dev / GREEN):

  1. **Fix the constant bug.** Call ``check_context`` correctly and drop the bogus
     ``ContextConfig(project_dir=...)`` construction, e.g.::

         result = check_context(project_dir=project_dir)

     The healthy path must return REAL context data (``percent``/``tokens``/
     ``status`` from the ``ContextResult``), not the swallowed all-``None`` shape.
     A no-transcript environment is the graceful no-data case: ``check_context``
     returns a ``ContextResult`` with ``error="no_transcript"`` (it does NOT
     raise) — that must flow through, NOT trigger the failure warning.

  2. **Add warn-then-degrade for GENUINE exceptions.** Keep the ``except`` as a
     catch-all (this is an async route that must never 500), but ``warnings.warn``
     (naming the subject — "context") BEFORE returning the existing all-``None``
     degraded shape. Route the message through the 160-18 sink sanitiser
     (``_safe_exc(e)`` / ``type(e).__name__`` — NEVER raw ``str(e)``); this is
     already enforced cross-file by ``test_160_18``'s AST guard
     (``test_no_data_proxy_warning_interpolates_raw_exc_or_path``), so a raw-``e``
     warn would turn THAT test red.

  3. **Scope guard (160-22).** The response-BODY ``error: str(e)`` at
     ``data_proxy.py:~322`` is story 160-22's scope (response-body info-leak
     sanitisation). Do NOT sanitise the response body here — leave ``error`` as it
     is. This story only fixes the constant bug + adds the warning. (Fixing the
     constant bug incidentally shrinks 160-22's leak window — the except now fires
     only on genuine errors instead of every request — but 160-22 still owns the
     body sanitisation.)

``get_context`` takes no arguments; it is awaited directly via ``asyncio.run``.
The route resolves ``check_context`` via ``from pf.context_window import
check_context`` (module-level name in ``data_proxy``), so seam patches target
``data_proxy.check_context`` (patch where USED — lang-review rule #6). The real
end-to-end wiring test instead patches ``context_window.find_transcript`` to force
the deterministic no-transcript path without mocking the route's own seam.

One intentional green-on-arrival guard (degrade-shape preservation) is documented
as a TEA Design Deviation per ``ac-as-green-regression-guard``.
"""

from __future__ import annotations

import asyncio
import json
import re

import pytest

import pf.context_window as context_window
from pf.context_window import ContextResult
from pf.frame.routes import data_proxy
from pf.frame.routes.data_proxy import get_context

# A genuine-failure warning must NAME its subject (the context probe), not be an
# unrelated UserWarning. Used by both the pytest.warns match and the no-spurious-
# warning green guards.
_CONTEXT_PAT = re.compile(r"(?i)(context|token|usage)")


def _run_get_context():
    """Drive the async context route to completion and return its ``JSONResponse``
    (direct await — most reliable warning capture)."""
    return asyncio.run(get_context())


def _healthy_result() -> ContextResult:
    """A fully-populated, error-free ``ContextResult`` — the shape ``check_context``
    returns on a successful probe. Distinct sentinel numbers so the assertions
    prove the REAL values flow through (not coincidental zeros/None)."""
    return ContextResult(
        tokens=4242,
        baseline=100,
        usable_tokens=900,
        available=800,
        percent=37,
        usable_percent=33,
        status="OK",
        error=None,
    )


def _raiser(exc: Exception):
    def _raise(*_a, **_k):
        raise exc

    return _raise


# ===========================================================================
# Bucket A — the constant bug: a SUCCEEDING check_context must surface real data
# (forces removal of the broken ``ContextConfig(project_dir=...)`` construction)
# ===========================================================================


def test_get_context_returns_real_data_when_check_context_succeeds(monkeypatch, recwarn):
    """When ``check_context`` succeeds, its real values must reach the JSON body —
    and a healthy call must stay SILENT.

    RED today (constant bug): the route does ``ContextConfig(project_dir=...)``
    first, which raises ``TypeError`` before ``check_context`` is reached, so the
    body is the swallowed all-``None`` shape and the mocked healthy result never
    flows through. Also fails a naive warn-only fix: that would warn on this
    (constantly-broken) call, tripping the no-spurious-warning guard.
    """
    monkeypatch.setattr(data_proxy, "check_context", lambda *_a, **_k: _healthy_result())

    response = _run_get_context()  # must NOT raise
    body = json.loads(response.body)

    assert response.status_code == 200
    assert body["percent"] == 37, f"healthy percent did not flow through: {body!r}"
    assert body["tokens"] == 4242, f"healthy tokens did not flow through: {body!r}"
    assert body["status"] == "OK", f"healthy status did not flow through: {body!r}"
    assert body["error"] is None, f"healthy call surfaced an error: {body!r}"

    offenders = [str(w.message) for w in recwarn.list if _CONTEXT_PAT.search(str(w.message))]
    assert not offenders, (
        "a healthy get_context emitted a failure warning — the warn must be reserved "
        f"for genuine exceptions, not fire over a constant bug: {offenders!r}"
    )


def test_get_context_real_check_context_degrades_gracefully(tmp_path, monkeypatch, recwarn):
    """Driving the REAL ``check_context`` (no seam patch) on a no-transcript project
    must degrade GRACEFULLY: a known sentinel error, a populated status, and NO
    warning — not a crash swallowed to an exception string.

    This pins the real end-to-end wiring (the route actually invokes
    ``check_context`` correctly), the path a mock-only test could mask.

    RED today: ``ContextConfig(project_dir=...)`` raises ``TypeError``, so
    ``error`` is the Python exception string (not a graceful sentinel) and
    ``status`` is ``None``. ``find_transcript`` is forced to ``None`` so the real
    ``check_context`` takes its deterministic ``error="no_transcript"`` branch
    regardless of the host machine's Claude transcripts.
    """
    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PF_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("SESSION_ID", raising=False)
    monkeypatch.setattr(context_window, "find_transcript", lambda *_a, **_k: None)

    response = _run_get_context()  # must NOT raise
    body = json.loads(response.body)

    assert response.status_code == 200
    assert body["error"] in (None, "no_transcript", "no_usage_data"), (
        f"error is a crash string, not a graceful sentinel — the route never reached "
        f"check_context: {body['error']!r}"
    )
    assert body["status"] is not None, (
        f"status not populated by a real check_context call: {body!r}"
    )

    offenders = [str(w.message) for w in recwarn.list if _CONTEXT_PAT.search(str(w.message))]
    assert not offenders, (
        f"the graceful no-transcript path emitted a spurious failure warning: {offenders!r}"
    )


# ===========================================================================
# Bucket B — fail-loud: a GENUINE check_context exception must warn, not vanish
# (the async ``except Exception as e`` swallow, ~L316, the story's core AC)
# ===========================================================================


def test_get_context_warns_on_genuine_exception(monkeypatch):
    """A raising ``check_context`` must WARN (naming the context subject), then
    still return a response — not vanish silently.

    RED today: the ``except`` returns the degraded shape with NO ``warnings.warn``
    (the last silent swallow in the file), so ``pytest.warns`` sees nothing and
    fails. (Today the seam patch is never even reached because of the constant
    ``ContextConfig`` bug — either way: no warning fires.)
    """
    monkeypatch.setattr(data_proxy, "check_context", _raiser(RuntimeError("context check exploded")))

    with pytest.warns(UserWarning, match=r"(?i)(context|token|usage)"):
        response = _run_get_context()  # must NOT raise

    assert response.status_code == 200


def test_get_context_degrades_to_all_none_on_genuine_exception(monkeypatch):
    """On a genuine exception the degraded body shape must be preserved byte-for-
    byte: every data field ``None`` and an error diagnostic surfaced.

    GREEN regression guard (the all-``None`` degrade shape already exists today via
    the swallow; this pins that the fail-loud change must NOT alter it). Green-on-
    arrival — TEA Design Deviation. The ``error`` field is asserted only to be a
    present, non-empty string — its exact content (raw vs sanitised ``str(e)``) is
    story 160-22's scope, so this test stays decoupled from that change.
    """
    monkeypatch.setattr(data_proxy, "check_context", _raiser(RuntimeError("context check exploded")))

    response = _run_get_context()  # must NOT raise
    body = json.loads(response.body)

    assert response.status_code == 200
    for field in (
        "percent",
        "tokens",
        "status",
        "baseline",
        "usableTokens",
        "usablePercent",
        "available",
    ):
        assert body[field] is None, f"{field} not degraded to None on exception: {body!r}"
    assert isinstance(body["error"], str) and body["error"], (
        f"error diagnostic not surfaced in degraded shape: {body!r}"
    )
