"""RED tests for story 160-15 — ws_push fail-loud sweep part 2 (p1, gh #50 follow-up).

Follow-up to 160-12, which extended the 160-4 ``_load_file`` fail-loud contract
to the file-READ sites in ``pf/frame/ws_push.py``. 160-12's Reviewer flagged
four REMAINING pre-existing silent swallows as out-of-scope follow-ups; this
story sweeps three of them (the fourth, ``_load_file``, was already hardened in
160-4/160-12):

* **fetch_diffs** (``ws_push.py:~197``) — the git-diff SUBPROCESS + parse loop is
  wrapped in a bare ``except Exception: pass``. The 160-12 Reviewer labeled this
  "fetch_git subprocess-parse"; the actual subprocess-parse-with-``pass`` swallow
  *inside ws_push.py* is ``fetch_diffs`` (``fetch_git`` itself delegates to
  ``data_proxy._get_git_info``, which lives outside the ws_push file scope — see
  the TEA Design Deviation + the follow-up Delivery Finding).
* **fetch_context** (``ws_push.py:~425``) — ``except Exception: return {None-shape}``;
  a failed or degraded ``check_context`` silently degrades with zero diagnostics.
* **fetch_persona** (``ws_push.py:~489``) — the OUTER ``except Exception: return {}``
  catch-all; a ``load_persona`` failure blanks the persona panel silently.

Plus the L171 main-sprint-read follow-up:

* **fetch_sprint main read** (``ws_push.py:~215``) already warns (added in 160-12)
  but the message says "Failed to READ sprint file" even for a pure PARSE failure
  (the ``try`` wraps both ``read_text()`` AND ``yaml.safe_load()``), and it had no
  dedicated behavioral test. This story adds (a) a behavioral test and (b) a
  read-vs-parse warning wording split.

DESIGNED INTERFACE (for Dev / GREEN) — mirror the 160-12 / 160-4 prior art
(``warnings.warn`` naming the offending subject, then graceful degradation;
NEVER raise — these run inside the long-lived Frame poll loop
(``send_initial_data`` / ``poll_and_broadcast``) whose own outer
``except Exception: pass`` would swallow a raise and blank the panel with zero
diagnostics, which is strictly worse than the warning):

  1. **fetch_diffs** — on a subprocess/parse failure for a repo, ``warnings.warn``
     naming the REPO, then continue (that repo contributes no diffs; siblings
     survive). Return shape unchanged: ``{"type": "init", "diffs": [...]}``.
  2. **fetch_context** — FIX THE BROKEN WIRING first (root cause, SOUL #1):
     ``ContextConfig`` has NO ``project_dir`` field and ``check_context``'s first
     positional is ``explicit_session`` — so today
     ``config = ContextConfig(project_dir=project_dir)`` raises ``TypeError`` on
     EVERY call and the context panel has NEVER shown real data (the silent
     swallow buried it). Call ``check_context(project_dir=project_dir)`` directly
     (it builds its own config via ``load_config``). THEN, on a genuine failure,
     ``warnings.warn`` (naming "context") and return the degraded
     ``{"percent": None, "tokens": None, "status": None}`` shape. Without the
     wiring fix the warn would fire on every 5s poll — fail-loud must surface a
     GENUINE failure, not a constant code bug. (Captured as a blocking Delivery
     Finding.)
  3. **fetch_persona** — on a non-read failure inside the outer ``try`` (e.g.
     ``load_persona`` raising), ``warnings.warn`` (naming the agent / "persona"),
     then return ``{}``.
  4. **fetch_sprint main read** — split the read-vs-parse wording: a PARSE failure
     (decodable-but-malformed YAML) must warn with parse wording (the module's
     ``_read_yaml_file`` already says "Failed to parse {name}"); a READ/decode
     failure (undecodable bytes / permission) keeps read/decode wording (the
     module's ``_read_text_file`` says "Failed to read {name}"). Graceful return
     unchanged (an empty ``epics`` list; a broken main sprint renders nothing).

Each fetcher takes NO args and resolves the project dir via
FRAME_PROJECT_DIR -> PF_PROJECT_DIR -> cwd. The ``project_dir`` fixture points
that env var at a tmp tree and clears PF_PROJECT_DIR so each fetch is isolated.

Intentional GREEN regression guards (no-over-warning / read-side preservation)
are documented as TEA Design Deviations per ``ac-as-green-regression-guard``.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from pf.frame.ws_push import (
    fetch_context,
    fetch_diffs,
    fetch_persona,
    fetch_sprint,
)

# Invalid-but-decodable YAML (stray colon / bad indent) — proven malformed in
# 160-4/160-12: read_text() succeeds; yaml.safe_load() raises a ScannerError
# whose message ("mapping values are not allowed here") contains no "pars",
# so the parse-wording assertion below is a clean RED on the current "read"
# wording and only goes green when Dev's prefix says "parse".
_MALFORMED_YAML = "id: 1\ntitle: broken\n  bad: : indent::\n"
# Latin-1 + stray BOM fragments: structurally fine bytes, invalid UTF-8.
# read_text(encoding="utf-8") raises UnicodeDecodeError (a ValueError, NOT an
# OSError — the 160-4 round-1 lesson).
_UNDECODABLE_BYTES = b"id: 1\ntitle: caf\xe9 broken \xff\xfe\n"

# Any read/parse-failure warning must surface the *nature* of the failure, not
# be an unrelated UserWarning. Used by the no-over-warning guards.
_READ_FAIL_PAT = r"(?i)(read|decod|pars|unreadable|malform|invalid|fail|yaml)"

SPRINT_HEADER = {
    "name": "Test Sprint",
    "goal": "exercise ws_push fail-loud sweep part 2",
    "status": "active",
    "number": 9001,
}


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so the ws_push fetchers read from it."""
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    return tmp_path


def _wire_single_repo(project_dir: Path, name: str = "alpha") -> str:
    """Write a repos.yaml with one repo at '.' plus a (fake) .git dir so
    fetch_diffs reaches its subprocess block for that repo."""
    _write_yaml(
        project_dir / ".pennyfarthing" / "repos.yaml",
        {"repos": {name: {"path": "."}}},
    )
    (project_dir / ".git").mkdir(exist_ok=True)
    return name


def _wire_active_agent(project_dir: Path, name: str = "reviewer") -> str:
    """Write an active-agent marker file so fetch_persona resolves an agent name
    and reaches the load_persona call inside its outer try."""
    agents = project_dir / ".session" / "agents"
    agents.mkdir(parents=True, exist_ok=True)
    (agents / name).write_text(name, encoding="utf-8")
    return name


# ===========================================================================
# Bucket A — fetch_diffs: git-diff subprocess/parse failure must surface
# (the "fetch_git subprocess-parse" swallow, ws_push.py:~197)
# ===========================================================================


def test_diffs_subprocess_failure_warns_and_survives(project_dir, monkeypatch):
    """A raising git-diff subprocess must WARN (naming the repo), not vanish.

    RED: today ``ws_push.py:~197`` ``except Exception: pass`` swallows the error —
    the repo's diffs disappear from the panel with zero diagnostics.
    """
    name = _wire_single_repo(project_dir)
    monkeypatch.setattr(shutil, "which", lambda _bin: "/usr/bin/git")

    def _boom(*_a, **_k):
        raise RuntimeError("git exploded mid-diff")

    monkeypatch.setattr(subprocess, "run", _boom)

    with pytest.warns(UserWarning, match=name):
        result = fetch_diffs()  # must NOT raise

    assert result["type"] == "init"
    assert result["diffs"] == []


def test_diffs_healthy_emits_no_warning(project_dir, monkeypatch, recwarn):
    """A healthy git-diff run emits no read/parse-failure warning.

    GREEN regression guard (no over-warning): the fix must stay silent when the
    subprocess succeeds.
    """
    name = _wire_single_repo(project_dir)
    monkeypatch.setattr(shutil, "which", lambda _bin: "/usr/bin/git")
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *_a, **_k: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )

    result = fetch_diffs()

    assert result["type"] == "init"
    offenders = [
        str(w.message)
        for w in recwarn.list
        if re.search(name, str(w.message)) or re.search(_READ_FAIL_PAT, str(w.message))
    ]
    assert not offenders, f"healthy diffs run emitted spurious warning(s): {offenders!r}"


# ===========================================================================
# Bucket B — fetch_context: failed/degraded check_context must surface
# (the "fetch_context degraded-shape" swallow, ws_push.py:~425)
# ===========================================================================


def test_context_failure_warns_and_degrades(project_dir, monkeypatch):
    """A failing check_context must WARN then degrade — not vanish silently.

    RED: today ``ws_push.py:~425`` ``except Exception: return {None-shape}``
    swallows the failure; the context panel blanks with no clue why. The seam
    ``check_context`` is patched to raise so the failure is the one under test
    regardless of the (separately fixed) wiring bug.
    """
    import pf.context_window as cw

    def _boom(*_a, **_k):
        raise RuntimeError("context probe failed")

    monkeypatch.setattr(cw, "check_context", _boom)

    with pytest.warns(UserWarning, match=r"(?i)context"):
        result = fetch_context()  # must NOT raise

    assert result["type"] == "init"
    assert result["context"] == {"percent": None, "tokens": None, "status": None}


def test_context_degraded_result_shape_warns(project_dir, monkeypatch):
    """A present-but-degraded result object (attribute access raises) must WARN.

    RED: today the error raised while reading ``result.status`` is swallowed by
    ``except Exception: return {None-shape}`` with no diagnostic. This is the
    literal "degraded-shape" case named in the story title. ``check_context`` is
    patched with a ``*args, **kwargs`` signature so it survives both the current
    broken call and the fixed ``check_context(project_dir=...)`` call.
    """
    import pf.context_window as cw

    class _Degraded:
        percent = 50
        tokens = 1000

        @property
        def status(self):
            raise ValueError("degraded result shape")

    monkeypatch.setattr(cw, "check_context", lambda *_a, **_k: _Degraded())

    with pytest.warns(UserWarning, match=r"(?i)context"):
        result = fetch_context()  # must NOT raise

    assert result["type"] == "init"
    assert result["context"] == {"percent": None, "tokens": None, "status": None}


def test_context_healthy_returns_real_data_no_warning(project_dir, monkeypatch, recwarn):
    """A healthy check_context must yield REAL context data and emit no warning.

    RED today (drives the root-cause wiring fix): today
    ``ContextConfig(project_dir=project_dir)`` raises ``TypeError`` before
    ``check_context`` is even reached, so this returns the degraded None-shape.
    ``check_context`` is patched (and ``ContextConfig`` deliberately NOT patched)
    so the only way to reach the healthy result is for Dev to call
    ``check_context(project_dir=project_dir)`` directly. Post-fix this also
    guards against over-warning on the success path.
    """
    import pf.context_window as cw

    monkeypatch.setattr(
        cw,
        "check_context",
        lambda *_a, **_k: SimpleNamespace(percent=12, tokens=345, status="OK"),
    )

    result = fetch_context()

    assert result["context"] == {"percent": 12, "tokens": 345, "status": "OK"}
    offenders = [str(w.message) for w in recwarn.list if re.search(r"(?i)context", str(w.message))]
    assert not offenders, f"healthy context emitted spurious warning(s): {offenders!r}"


# ===========================================================================
# Bucket C — fetch_persona: outer catch-all failure must surface
# (the "outer fetch_persona catch-all" swallow, ws_push.py:~489)
# ===========================================================================


def test_persona_load_failure_warns_and_degrades(project_dir, monkeypatch):
    """A raising load_persona must WARN then degrade to {} — not vanish silently.

    RED: today ``ws_push.py:~489`` outer ``except Exception: return {}`` swallows
    the failure; the persona panel blanks with no diagnostic.
    """
    import pf.prime.persona as persona_mod

    _wire_active_agent(project_dir)

    def _boom(*_a, **_k):
        raise RuntimeError("persona load failed")

    monkeypatch.setattr(persona_mod, "load_persona", _boom)

    with pytest.warns(UserWarning, match=r"(?i)(persona|agent|reviewer)"):
        result = fetch_persona()  # must NOT raise

    assert result == {}


def test_persona_no_match_emits_no_warning(project_dir, monkeypatch, recwarn):
    """A resolved-but-empty persona (load_persona -> (None, None)) is a NORMAL
    state: fetch_persona returns {} WITHOUT warning.

    GREEN regression guard (no over-warning): the catch-all fix must not warn on
    the common 'no persona yet' case, which is an in-try early return — not an
    exception.
    """
    import pf.prime.persona as persona_mod

    _wire_active_agent(project_dir)
    monkeypatch.setattr(persona_mod, "load_persona", lambda *_a, **_k: (None, None))

    result = fetch_persona()

    assert result == {}
    offenders = [
        str(w.message)
        for w in recwarn.list
        if re.search(r"(?i)(persona|agent|reviewer)", str(w.message))
    ]
    assert not offenders, f"normal no-persona state emitted a warning: {offenders!r}"


# ===========================================================================
# Bucket D — fetch_sprint main read (L171): behavioral test + read-vs-parse wording
# (ws_push.py:~215)
# ===========================================================================


def test_main_sprint_parse_failure_warns_says_parse_and_survives(project_dir):
    """A present-but-malformed current-sprint.yaml must warn with PARSE wording
    (not "read") and degrade gracefully.

    RED: today ``ws_push.py:~215`` wraps ``read_text()`` AND ``yaml.safe_load()``
    in one ``except Exception`` whose message always says "Failed to READ sprint
    file" — even for a pure parse failure. The read-vs-parse wording split is the
    fix. This is also the dedicated behavioral test the 160-12 Reviewer asked for.
    The ScannerError message ("mapping values are not allowed here") contains no
    "pars", so this only goes green when Dev's PREFIX wording says "parse".
    """
    sprint_path = project_dir / "sprint" / "current-sprint.yaml"
    sprint_path.parent.mkdir(parents=True, exist_ok=True)
    sprint_path.write_text(_MALFORMED_YAML, encoding="utf-8")  # decodes; safe_load raises

    with pytest.warns(UserWarning, match=r"(?i)pars"):
        result = fetch_sprint()  # must NOT raise

    assert isinstance(result, dict)
    assert result.get("epics") == []


def test_main_sprint_undecodable_read_failure_warns_and_survives(project_dir):
    """A present-but-non-UTF-8 current-sprint.yaml must warn with READ/decode
    wording and degrade gracefully — NOT raise.

    GREEN regression guard for the READ side of the wording split: today the
    bytes raise UnicodeDecodeError which ``except Exception`` catches + warns
    "Failed to read"; this pins that the wording split keeps the READ path
    warning (and never lets the decode error escape the fetcher).
    """
    sprint_path = project_dir / "sprint" / "current-sprint.yaml"
    sprint_path.parent.mkdir(parents=True, exist_ok=True)
    sprint_path.write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"(?i)(read|decod)"):
        result = fetch_sprint()  # must NOT raise UnicodeDecodeError

    assert isinstance(result, dict)
    assert result.get("epics") == []
