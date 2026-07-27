"""RED tests for story 160-17 — ws_push/data_proxy fail-loud sweep part 4 (p1).

Follow-up to 160-16, whose TEA/Dev/Reviewer pass flagged two remaining silent
swallows in ``pf/frame/routes/data_proxy.py`` as out-of-scope candidates for a
part 4. This story sweeps them:

* **data_proxy.get_theme_agents** (``data_proxy.py:~327``) — the async theme-agents
  route's ``except Exception: return JSONResponse({})`` swallows ANY failure of
  ``get_crew_manifest`` silently → the crew panel renders empty with zero
  diagnostics (AC-1).
* **data_proxy._get_identity** (``data_proxy.py:~385`` / ``~395``) — the jira and
  gh probes each wrap ``os.popen(...).read()`` + ``json.loads(...)`` in
  ``except Exception: pass``. An installed tool that returns non-empty UNPARSEABLE
  output (e.g. an error blob, a partial JSON) is swallowed silently; the identity
  field just stays ``None`` with no hint that a present tool is misbehaving (AC-2).

DESIGNED INTERFACE (for Dev / GREEN) — mirror the 160-4/160-12/160-15/160-16 prior
art: ``warnings.warn`` naming the offending subject, then GRACEFUL degradation.
NEVER raise — both sites feed FastAPI routes / a cached identity probe whose
callers must never see a 500 / a raise.

  1. **get_theme_agents** — on a ``get_crew_manifest`` exception, ``warnings.warn``
     (naming theme/crew/agents), then return ``JSONResponse({})`` exactly as today.
     The SILENCE is what changes, not the degraded shape. The pre-existing
     ``isinstance(crew, dict)`` non-dict fallback is OUT OF SCOPE — it is a type
     coercion, not the ``except`` swallow, and must stay silent (scope guard).
  2. **_get_identity** (both probes) — on a probe whose output is NON-EMPTY but
     fails ``json.loads`` (a present-but-broken tool), ``warnings.warn`` (naming
     the probe: jira / gh), then keep the field ``None`` and KEEP GOING. The fix
     MUST stay warn-IN-PLACE per probe: a failing jira probe must not stop the gh
     probe, and ``_get_identity`` must still return the full identity dict (never
     raise — it has no outer guard; a raise would 500 the ``/api/identity`` route).
     An EMPTY-stdout probe (the common installed-but-unauthenticated jira/gh case,
     where ``2>/dev/null`` ate the tool's own error) stays SILENT — that is the
     normal not-configured state, exactly as a missing repos.yaml stayed silent in
     160-16. Warning there would spam every gh-installed-but-unauthed user.

Both targets take no path argument: ``get_theme_agents`` is awaited directly via
``asyncio.run``; ``_get_identity`` reads from ``os.popen`` + ``shutil.which``,
both monkeypatched. ``_get_identity`` caches in module globals, so the autouse
``_reset_identity_cache`` fixture clears the cache before every test (else a
populated cache short-circuits the probes under test).

Intentional GREEN regression guards (no-over-warning / empty-stays-silent /
non-dict-scope / healthy-path) are documented as TEA Design Deviations per
``ac-as-green-regression-guard``.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from pf.frame.routes import data_proxy
from pf.frame.routes.data_proxy import _get_identity, get_theme_agents
from pf.prime.persona import CrewMember

# A read/probe-failure warning must name the NATURE of the failure, not be an
# unrelated UserWarning. Used by the no-over-warning green guards.
_FAIL_PAT = r"(?i)(theme|crew|agent|jira|gh|github|identity|probe|parse|json|decod|fail)"


# ===========================================================================
# Fixtures / helpers
# ===========================================================================


@pytest.fixture(autouse=True)
def _reset_identity_cache(monkeypatch):
    """``_get_identity`` memoizes in module globals with a 5-min TTL. Clear it
    before every test so the jira/gh probes under test actually run instead of
    returning a stale cached dict."""
    monkeypatch.setattr(data_proxy, "_identity_cache", None)
    monkeypatch.setattr(data_proxy, "_identity_cache_time", 0.0)


def _fake_which(present: set[str]):
    """A ``shutil.which`` fake: returns a path only for tools in ``present`` so we
    control which identity probes run."""
    return lambda name: (f"/usr/bin/{name}" if name in present else None)


def _fake_popen(*, jira_out: str = "", gh_out: str = ""):
    """An ``os.popen`` fake: routes by command substring and serves a canned
    ``.read()`` payload. ``os.popen(cmd).read()`` is the only surface the probes
    use, so a ``SimpleNamespace(read=...)`` suffices."""

    def _popen(cmd, *_a, **_k):
        if "jira" in cmd:
            payload = jira_out
        elif "gh" in cmd:
            payload = gh_out
        else:
            payload = ""
        return SimpleNamespace(read=lambda: payload)

    return _popen


def _run_theme_agents():
    """Drive the async theme-agents route to completion and return its
    ``JSONResponse`` (direct await — most reliable warning capture)."""
    return asyncio.run(get_theme_agents())


# ===========================================================================
# Bucket A — data_proxy.get_theme_agents: a crew-manifest failure must surface
# (the async "except Exception: return JSONResponse({})" swallow, ~L327, AC-1)
# ===========================================================================


def test_theme_agents_crew_error_warns_not_silent(monkeypatch):
    """A raising ``get_crew_manifest`` must WARN, then still return ``{}`` — not
    vanish silently.

    RED: today ``data_proxy.py:~327`` ``except Exception: return JSONResponse({})``
    swallows the error; the crew panel shows empty with zero diagnostics.
    """

    def _boom(*_a, **_k):
        raise RuntimeError("crew manifest exploded")

    monkeypatch.setattr(data_proxy, "get_crew_manifest", _boom)

    with pytest.warns(UserWarning, match=r"(?i)(theme|crew|agent|manifest)"):
        response = _run_theme_agents()  # must NOT raise

    # Degraded shape unchanged: an empty JSON object. What changes is the silence.
    assert json.loads(response.body) == {}


def test_theme_agents_real_manifest_no_warn_on_valid_dir(tmp_path, monkeypatch, recwarn):
    """Driving the REAL ``get_crew_manifest`` against a valid project dir must NOT
    warn — the route must pass a ``Path``, not a ``str``.

    RED (round-2 regression for the Reviewer's blocking finding): round 1 did
    ``get_crew_manifest(_get_project_dir())`` where ``_get_project_dir()`` returns a
    ``str``; ``get_crew_manifest`` -> ``get_current_theme`` does
    ``root / ".pennyfarthing"`` and raised
    ``TypeError: unsupported operand type(s) for /: 'str' and 'str'`` on EVERY call,
    so the round-1 warn fired on every request (warn-spam over a constant bug).

    This drives the REAL manifest (NO seam patch) — exactly the path the patched
    round-1 healthy test masked. A bare ``.pennyfarthing/`` dir resolves no theme,
    so once a ``Path`` is passed ``get_crew_manifest`` returns ``[]`` and does NOT
    raise -> no warn. (Verified: ``get_crew_manifest(Path(bare_dir)) == []``.)
    """
    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PF_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_THEME", raising=False)

    response = _run_theme_agents()  # REAL get_crew_manifest; must NOT raise

    assert response.status_code == 200
    offenders = [str(w.message) for w in recwarn.list if re.search(_FAIL_PAT, str(w.message))]
    assert not offenders, (
        "theme-agents warned on a valid project dir — the route passed a str where "
        f"get_crew_manifest needs a Path: {offenders!r}"
    )


def test_theme_agents_serializes_crew_members(monkeypatch):
    """The route must SERIALIZE the ``list[CrewMember]`` ``get_crew_manifest``
    returns into the JSON body — not coerce it to ``{}``.

    RED (round-2 regression for the Reviewer's serialization finding): round 1 did
    ``crew if isinstance(crew, dict) else {}`` while ``get_crew_manifest`` returns
    ``list[CrewMember]`` (a dataclass that isn't JSON-serializable), so the
    theme-agents panel ALWAYS returned ``{}`` and never rendered data.

    The fake asserts the route hands a ``Path`` (binds the wiring fix) and returns a
    realistic crew list; the body must carry the character names. The exact shape is
    left to Dev (``{role: character}`` dict OR ``[{role, character}]`` list) — only
    DATA PRESENCE is pinned, so the test is fix-agnostic on shape.
    """

    def _fake_manifest(project_root, *_a, **_k):
        assert isinstance(project_root, Path), (
            f"route must pass a Path to get_crew_manifest, got {type(project_root).__name__}"
        )
        return [
            CrewMember(role="sm", character="Edmund Blackadder"),
            CrewMember(role="tea", character="Lord Melchett"),
        ]

    monkeypatch.setattr(data_proxy, "get_crew_manifest", _fake_manifest)

    response = _run_theme_agents()  # must NOT raise

    body = json.loads(response.body)
    serialized = json.dumps(body)
    assert "Edmund Blackadder" in serialized, f"crew not serialized into body: {body!r}"
    assert "Lord Melchett" in serialized, f"crew not serialized into body: {body!r}"


# ===========================================================================
# Bucket B — data_proxy._get_identity: a present-but-broken probe must surface
# (the jira/gh "except Exception: pass" swallows, ~L385 / ~L395, AC-2)
# ===========================================================================


def test_identity_jira_probe_garbage_warns(monkeypatch):
    """An installed ``jira`` whose ``jira me --raw`` returns non-empty UNPARSEABLE
    output must WARN, then degrade (``jiraEmail=None``) — not vanish silently.

    RED: today ``data_proxy.py:~385`` ``except Exception: pass`` swallows the
    ``json.loads`` error; a present-but-broken jira leaves no trace.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"jira"}))
    monkeypatch.setattr(os, "popen", _fake_popen(jira_out="!! not json !!"))

    with pytest.warns(UserWarning, match=r"(?i)(jira|identity)"):
        result = _get_identity()  # must NOT raise

    assert isinstance(result, dict)
    assert result["jiraEmail"] is None
    assert result["githubUsername"] is None  # gh not installed in this case


def test_identity_gh_probe_garbage_warns(monkeypatch):
    """An installed ``gh`` whose ``gh api user`` returns non-empty UNPARSEABLE
    output must WARN, then degrade (``githubUsername=None``) — not vanish silently.

    RED: today ``data_proxy.py:~395`` ``except Exception: pass`` swallows the
    ``json.loads`` error; a present-but-broken gh leaves no trace.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"gh"}))
    monkeypatch.setattr(os, "popen", _fake_popen(gh_out="<html>rate limited</html>"))

    with pytest.warns(UserWarning, match=r"(?i)(gh|github|identity)"):
        result = _get_identity()  # must NOT raise

    assert isinstance(result, dict)
    assert result["githubUsername"] is None
    assert result["avatarUrl"] is None


def test_identity_jira_fails_gh_still_resolves_warn_in_place(monkeypatch):
    """When jira's probe is broken but gh's is healthy, the jira failure must WARN
    yet gh must STILL resolve — the per-probe fix degrades IN PLACE.

    RED today: jira garbage is swallowed silently (no warn) → ``pytest.warns`` sees
    nothing and fails. This also pins the warn-IN-PLACE contract: if Dev "fixes"
    jira by letting the exception raise (or removing the try), ``_get_identity``
    raises before the gh probe runs and ``githubUsername`` never resolves — so the
    ``octocat`` assertion is what forbids a remove-the-try fix.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"jira", "gh"}))
    monkeypatch.setattr(
        os, "popen", _fake_popen(jira_out="kaboom", gh_out=json.dumps({"login": "octocat"}))
    )

    with pytest.warns(UserWarning, match=r"(?i)(jira|identity)"):
        result = _get_identity()  # must NOT raise

    assert result["jiraEmail"] is None
    assert result["githubUsername"] == "octocat"
    assert result["avatarUrl"] == "https://avatars.githubusercontent.com/octocat"


def test_identity_both_probes_healthy_no_warning(monkeypatch, recwarn):
    """Both probes returning valid JSON yield real identity data and no warning.

    GREEN regression guard (no over-warning) AND a seam-health check (per the
    160-15 ``swallow-hides-constant-bug`` lesson: prove real data flows back, not
    just that no warn fires). Green-on-arrival — TEA Design Deviation.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"jira", "gh"}))
    monkeypatch.setattr(
        os,
        "popen",
        _fake_popen(
            jira_out=json.dumps({"emailAddress": "me@example.com"}),
            gh_out=json.dumps({"login": "octocat"}),
        ),
    )

    result = _get_identity()

    assert result["jiraEmail"] == "me@example.com"
    assert result["githubUsername"] == "octocat"
    assert result["avatarUrl"] == "https://avatars.githubusercontent.com/octocat"
    offenders = [str(w.message) for w in recwarn.list if re.search(_FAIL_PAT, str(w.message))]
    assert not offenders, f"healthy identity probes emitted spurious warning(s): {offenders!r}"


def test_identity_empty_stdout_stays_silent(monkeypatch, recwarn):
    """An installed-but-quiet probe (empty stdout — the common not-authenticated
    jira/gh case, ``2>/dev/null`` ate the error) degrades SILENTLY: field ``None``,
    NO warning.

    GREEN regression guard: warn only on PRESENT-but-broken (non-empty unparseable)
    output, never on the empty/not-configured case — mirrors 160-16's
    missing-repos.yaml-stays-silent guard and avoids warn-spam for every
    gh-installed-but-unauthed user. Green-on-arrival — TEA Design Deviation.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"jira", "gh"}))
    monkeypatch.setattr(os, "popen", _fake_popen(jira_out="", gh_out=""))

    result = _get_identity()

    assert result["jiraEmail"] is None
    assert result["githubUsername"] is None
    offenders = [str(w.message) for w in recwarn.list if re.search(_FAIL_PAT, str(w.message))]
    assert not offenders, f"empty-stdout (not-configured) probe emitted a warning: {offenders!r}"


def test_identity_neither_tool_installed_stays_silent(monkeypatch, recwarn):
    """Neither jira nor gh on PATH → both probes skipped by the ``shutil.which``
    gate; identity degrades to all-``None`` SILENTLY.

    GREEN regression guard: the ``which`` gate already skips absent tools; the fix
    must not warn for a tool that was never probed. Green-on-arrival — TEA Design
    Deviation.
    """
    monkeypatch.setattr(shutil, "which", _fake_which(set()))
    # os.popen must never be reached; make it explode if it is.
    monkeypatch.setattr(
        os, "popen", lambda *_a, **_k: pytest.fail("os.popen called despite which()->None")
    )

    result = _get_identity()

    assert result == {"jiraEmail": None, "githubUsername": None, "avatarUrl": None}
    offenders = [str(w.message) for w in recwarn.list if re.search(_FAIL_PAT, str(w.message))]
    assert not offenders, f"no-tools-installed path emitted a warning: {offenders!r}"
